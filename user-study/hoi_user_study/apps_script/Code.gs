/**
 * Google Apps Script receiver for the HOI perceptual user study.
 *
 * SETUP (5 minutes):
 *   1. Create a Google Sheet.
 *   2. Extensions -> Apps Script. Delete the stub, paste this whole file.
 *   3. Deploy -> New deployment -> type "Web app".
 *        Execute as:      Me
 *        Who has access:  Anyone          <-- MANDATORY. Not "Anyone with the link".
 *   4. Copy the /exec URL it gives you.
 *   5. In site/app.js set:  const SUBMIT_ENDPOINT = "<that /exec URL>";
 *   6. Redeploy the site.
 *
 * After that, every completed session POSTs itself into this Sheet
 * automatically. The participant does nothing and sees no file.
 *
 * The local JSON download stays as a FALLBACK: it only fires if the POST
 * fails, so a network blip does not lose a participant.
 */

function jsonOut(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

// This endpoint is public ("Who has access: Anyone" below), so every field
// is hostile input. A cell whose text starts with = + - @ is a FORMULA to
// Sheets: an =IMPORTXML(...) planted in participant_id would exfiltrate
// your sheet to whoever crafted the POST. Force such values to text.
function cell(v) {
  var s = (v === null || v === undefined) ? '' : String(v);
  s = s.slice(0, 5000);
  return /^[=+\-@\t\r]/.test(s) ? "'" + s : s;
}

function doPost(e) {
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheets()[0];
  var data = JSON.parse(e.postData.contents);
  var responses = Array.isArray(data.responses)
    ? data.responses.slice(0, 200)     // bound the work one POST can cause
    : [];
  // Dedupe key. Falls back to participant + completion time so a client
  // that sends no submission_id is still deduplicable.
  var submissionId = String(data.submission_id
    || (data.participant_id + '|' + data.completed_at_iso)).slice(0, 100);

  var lock = LockService.getScriptLock();
  if (!lock.tryLock(30000)) {
    // waitLock() would THROW here, and Apps Script answers a thrown error
    // with an HTML page - which the client cannot read. Return JSON.
    return jsonOut({ ok: false, error: 'busy, retry' });
  }
  try {
    // --- idempotency -------------------------------------------------
    // This write can succeed while the response is lost on the way back,
    // in which case the app retries with the SAME submission_id. Without
    // this guard the retry appends the participant a second time, which
    // is worse than losing them: a duplicate carries no signal that it is
    // one. Script properties are durable and this whole block runs under
    // the script lock, so the check-then-set cannot race.
    var props = PropertiesService.getScriptProperties();
    var seenKey = 'submission_' + submissionId;
    if (props.getProperty(seenKey)) {
      return jsonOut({ ok: true, duplicate: true, submission_id: submissionId });
    }

    if (sheet.getLastRow() === 0) {
      sheet.appendRow([
        'received_at', 'submission_id', 'participant_id', 'study',
        'completed_at_iso', 'block', 'case_id', 'shown_order', 'answers',
        'answers_methods', 'first_seen_iso', 'answered_iso', 'dwell_ms',
        'is_attention_check', 'trial_index', 'user_agent'
      ]);
    }
    var now = new Date();
    for (var i = 0; i < responses.length; i++) {
      var r = responses[i];
      sheet.appendRow([
        now, cell(submissionId), cell(data.participant_id), cell(data.study),
        cell(data.completed_at_iso), cell(r.block), cell(r.case_id),
        cell(JSON.stringify(r.shown_order)), cell(JSON.stringify(r.answers)),
        cell(JSON.stringify(r.answers_methods)), cell(r.first_seen_iso),
        cell(r.answered_iso), Number(r.dwell_ms) || 0,
        r.is_attention_check === true, i, cell(data.user_agent)
      ]);
    }
    // Mark it seen only AFTER the rows are in. Sheets and script
    // properties cannot be one transaction, so pick your failure: this
    // ordering makes a half-written submission RETRYABLE (the retry
    // re-appends the prefix - dedupe on submission_id + trial_index at
    // analysis time), whereas marking first would swallow it for good.
    try {
      props.setProperty(seenKey, new Date().toISOString());
    } catch (err) {
      // Properties quota exhausted: never let this fail silently, or every
      // future retry of this submission appends a full duplicate.
      console.error('dedupe marker NOT stored for ' + submissionId + ': ' + err);
    }
  } finally {
    lock.releaseLock();
  }
  return jsonOut({ ok: true, n: responses.length });
}
