/**
 * Google Apps Script backend for `user-study/force_user_study/`.
 *
 * Deploy this file as a Web app bound to a Google Sheet (Extensions >
 * Apps Script), then paste the resulting `/exec` URL into `SUBMIT_ENDPOINT`
 * at the top of `../app.js`. See `user-study/README.md` for the full
 * step-by-step deployment guide.
 *
 * The frontend POSTs one JSON payload per participant:
 *
 *   {
 *     "participant_id": "<uuid>",
 *     "completed_at_iso": "...",
 *     "user_agent": "...",
 *     "responses": [
 *       {
 *         "participant_id": "<uuid>",
 *         "condition": "wind",
 *         "case_id": "0.mp4",
 *         "shown_order": ["ours_autoregressive", "force_prompting", "text_inference"],
 *         "answers":       { "force": "A",   "physics": "A",   "visual": "A"   },
 *         "answers_multi": { "force": ["A"], "physics": ["A"], "visual": ["A"] },
 *         "timestamp_iso": "...",
 *         "user_agent": "..."
 *       }
 *     ]
 *   }
 *
 * `shown_order` is the randomized method order for that question, so the
 * displayed labels A/B/C/D are mapped back to method names here.
 * "NONE" is a valid label meaning the participant picked "Neither".
 *
 * Three tabs are created on demand in the bound spreadsheet:
 *   - Responses:   one row per question (all metrics, JSON-encoded)
 *   - Votes:       one row per (question, metric, chosen method) — easy to pivot
 *   - Submissions: one row per participant, also used for de-duplication
 */

const RESPONSES_SHEET = "Responses";   // one row per question
const VOTES_SHEET = "Votes";           // one row per chosen method per metric
const SUBMISSIONS_SHEET = "Submissions";

function importDownloadedJsonObject(payload) {
  const fakeEvent = { postData: { contents: JSON.stringify(payload) } };
  return doPost(fakeEvent);
}

function importDownloadedJsonText(jsonText) {
  const payload = JSON.parse(jsonText);
  return importDownloadedJsonObject(payload);
}

/**
 * Manual backfill helper: paste a locally downloaded result JSON here and run
 * this function from the Apps Script editor. Useful when a participant's
 * browser failed to POST and the page fell back to a JSON download.
 */
function runOneImport() {
  const jsonText = `{
  "participant_id": "a2fb2f60-1b24-4929-8b75-87c9f69ff9a1",
  "completed_at_iso": "2026-02-27T04:23:01.043Z",
  "user_agent": "Mozilla/5.0 ...",
  "responses": [
    {
      "participant_id": "a2fb2f60-1b24-4929-8b75-87c9f69ff9a1",
      "condition": "wind",
      "case_id": "0.mp4",
      "shown_order": ["ours_autoregressive", "force_prompting", "text_inference"],
      "answers": { "force": "A", "physics": "A", "visual": "A" },
      "answers_multi": { "force": ["A"], "physics": ["A"], "visual": ["A"] },
      "timestamp_iso": "2026-02-27T04:23:01.043Z",
      "user_agent": "Mozilla/5.0 ..."
    }
  ]
}`;
  importDownloadedJsonText(jsonText);
}

function doPost(e) {
  try {
    const payload = JSON.parse((e && e.postData && e.postData.contents) || "{}");
    const responses = Array.isArray(payload.responses) ? payload.responses : [];
    const now = new Date().toISOString();

    const participantId = payload.participant_id || "";
    const submittedAt = payload.completed_at_iso || now;
    const questionCount = responses.length;
    const userAgentTop = payload.user_agent || "";
    const submissionKey = `${participantId}|${submittedAt}|${questionCount}`;

    const ss = SpreadsheetApp.getActiveSpreadsheet();

    const responsesSh = getOrCreateSheetWithHeader(ss, RESPONSES_SHEET, [
      "received_at","submission_key","participant_id","condition","case_id","shown_order_json",
      "force_labels_json","force_methods_json",
      "physics_labels_json","physics_methods_json",
      "visual_labels_json","visual_methods_json",
      "timestamp_iso","user_agent"
    ]);

    const votesSh = getOrCreateSheetWithHeader(ss, VOTES_SHEET, [
      "received_at","submission_key","participant_id",
      "condition","case_id","metric","label","method",
      "timestamp_iso","user_agent"
    ]);

    const submissionsSh = getOrCreateSheetWithHeader(ss, SUBMISSIONS_SHEET, [
      "received_at","submission_key","participant_id","submitted_at_iso","question_count","response_rows","vote_rows"
    ]);

    if (isDuplicateSubmission(submissionsSh, submissionKey)) {
      return jsonOut({ ok: true, duplicate: true, response_rows: 0, vote_rows: 0 });
    }

    const responseRows = [];
    const voteRows = [];

    responses.forEach((r) => {
      const order = Array.isArray(r.shown_order) ? r.shown_order : [];

      const forceLabels = normalizeLabels(r.answers_multi?.force, r.answers?.force);
      const physicsLabels = normalizeLabels(r.answers_multi?.physics, r.answers?.physics);
      const visualLabels = normalizeLabels(r.answers_multi?.visual, r.answers?.visual);

      const forceMethods = forceLabels.map((lb) => labelToMethod(lb, order));
      const physicsMethods = physicsLabels.map((lb) => labelToMethod(lb, order));
      const visualMethods = visualLabels.map((lb) => labelToMethod(lb, order));

      responseRows.push([
        now,
        submissionKey,
        r.participant_id || participantId,
        r.condition || "",
        r.case_id || "",
        JSON.stringify(order),
        JSON.stringify(forceLabels),
        JSON.stringify(forceMethods),
        JSON.stringify(physicsLabels),
        JSON.stringify(physicsMethods),
        JSON.stringify(visualLabels),
        JSON.stringify(visualMethods),
        r.timestamp_iso || submittedAt,
        r.user_agent || userAgentTop
      ]);

      appendVotes(voteRows, now, submissionKey, r.participant_id || participantId, r.condition, r.case_id, "force", forceLabels, forceMethods, r.timestamp_iso || submittedAt, r.user_agent || userAgentTop);
      appendVotes(voteRows, now, submissionKey, r.participant_id || participantId, r.condition, r.case_id, "physics", physicsLabels, physicsMethods, r.timestamp_iso || submittedAt, r.user_agent || userAgentTop);
      appendVotes(voteRows, now, submissionKey, r.participant_id || participantId, r.condition, r.case_id, "visual", visualLabels, visualMethods, r.timestamp_iso || submittedAt, r.user_agent || userAgentTop);
    });

    if (responseRows.length) {
      responsesSh.getRange(responsesSh.getLastRow() + 1, 1, responseRows.length, responseRows[0].length).setValues(responseRows);
    }
    if (voteRows.length) {
      votesSh.getRange(votesSh.getLastRow() + 1, 1, voteRows.length, voteRows[0].length).setValues(voteRows);
    }

    submissionsSh.appendRow([
      now, submissionKey, participantId, submittedAt, questionCount, responseRows.length, voteRows.length
    ]);

    return jsonOut({ ok: true, duplicate: false, response_rows: responseRows.length, vote_rows: voteRows.length });
  } catch (err) {
    return jsonOut({ ok: false, error: String(err) });
  }
}

function appendVotes(out, receivedAt, submissionKey, participantId, condition, caseId, metric, labels, methods, ts, ua) {
  for (let i = 0; i < labels.length; i += 1) {
    out.push([
      receivedAt,
      submissionKey,
      participantId || "",
      condition || "",
      caseId || "",
      metric,
      labels[i] || "",
      methods[i] || "",
      ts || "",
      ua || ""
    ]);
  }
}

function normalizeLabels(arr, single) {
  if (Array.isArray(arr)) return arr.filter((x) => typeof x === "string" && x !== "");
  if (typeof single === "string" && single !== "") return [single];
  return [];
}

function labelToMethod(label, shownOrder) {
  if (!label) return "";
  if (label === "NONE") return "NONE";
  const idx = { A: 0, B: 1, C: 2, D: 3 }[label];
  return idx === undefined || idx >= shownOrder.length ? "INVALID" : shownOrder[idx];
}

function getOrCreateSheetWithHeader(ss, name, header) {
  const sh = ss.getSheetByName(name) || ss.insertSheet(name);
  if (sh.getLastRow() === 0) sh.appendRow(header);
  return sh;
}

function isDuplicateSubmission(sh, key) {
  const n = sh.getLastRow();
  if (n < 2) return false;
  const vals = sh.getRange(2, 2, n - 1, 1).getValues().flat();
  return vals.includes(key);
}

function jsonOut(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}
