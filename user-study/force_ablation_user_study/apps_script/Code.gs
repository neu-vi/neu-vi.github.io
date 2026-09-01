const RESPONSES_SHEET = "Responses";
const VOTES_SHEET = "Votes";
const SUBMISSIONS_SHEET = "Submissions";

function doPost(e) {
  const lock = LockService.getScriptLock();
  lock.waitLock(30000);

  try {
    const payload = JSON.parse((e && e.postData && e.postData.contents) || "{}");
    const responses = Array.isArray(payload.responses) ? payload.responses : [];
    const now = new Date().toISOString();

    const participantId = payload.participant_id || "";
    const submittedAt = payload.completed_at_iso || now;
    const questionCount = responses.length;
    const userAgentTop = payload.user_agent || "";

    // Idempotency key: same participant + same submit timestamp + same question count
    const submissionKey = `${participantId}|${submittedAt}|${questionCount}`;

    const ss = SpreadsheetApp.getActiveSpreadsheet();

    const responsesSh = getOrCreateSheetWithHeader(ss, RESPONSES_SHEET, [
      "received_at",
      "submission_key",
      "participant_id",
      "condition",
      "task_type",
      "case_id",
      "shown_order_json",
      "answer_labels_json",
      "answer_methods_json",
      "answer_label_legacy",
      "answer_method_legacy",
      "timestamp_iso",
      "user_agent"
    ]);

    const votesSh = getOrCreateSheetWithHeader(ss, VOTES_SHEET, [
      "received_at",
      "submission_key",
      "participant_id",
      "condition",
      "task_type",
      "case_id",
      "label",
      "method",
      "timestamp_iso",
      "user_agent"
    ]);

    const submissionsSh = getOrCreateSheetWithHeader(ss, SUBMISSIONS_SHEET, [
      "received_at",
      "submission_key",
      "participant_id",
      "submitted_at_iso",
      "question_count",
      "response_rows",
      "vote_rows"
    ]);

    // Deduplicate before writing any rows
    if (isDuplicateSubmission(submissionsSh, submissionKey)) {
      return jsonOut({
        ok: true,
        duplicate: true,
        response_rows: 0,
        vote_rows: 0
      });
    }

    const responseRows = [];
    const voteRows = [];

    responses.forEach((r) => {
      const shownOrder = Array.isArray(r.shown_order) ? r.shown_order : [];
      const answerLabels = normalizeAnswerArray(r.answer_labels, r.answer_label);
      const answerMethods = normalizeMethodsArray(r.answer_methods, answerLabels, shownOrder);

      const rowTs = r.timestamp_iso || submittedAt;
      const rowUA = r.user_agent || userAgentTop;

      responseRows.push([
        now,
        submissionKey,
        r.participant_id || participantId,
        r.condition || "",
        r.task_type || "",
        r.case_id || "",
        JSON.stringify(shownOrder),
        JSON.stringify(answerLabels),
        JSON.stringify(answerMethods),
        r.answer_label || (answerLabels[0] || ""),
        r.answer_method || (answerMethods[0] || ""),
        rowTs,
        rowUA
      ]);

      for (let i = 0; i < answerLabels.length; i += 1) {
        voteRows.push([
          now,
          submissionKey,
          r.participant_id || participantId,
          r.condition || "",
          r.task_type || "",
          r.case_id || "",
          answerLabels[i] || "",
          answerMethods[i] || "",
          rowTs,
          rowUA
        ]);
      }
    });

    if (responseRows.length > 0) {
      responsesSh
        .getRange(responsesSh.getLastRow() + 1, 1, responseRows.length, responseRows[0].length)
        .setValues(responseRows);
    }

    if (voteRows.length > 0) {
      votesSh
        .getRange(votesSh.getLastRow() + 1, 1, voteRows.length, voteRows[0].length)
        .setValues(voteRows);
    }

    // Append Submissions last so dedupe key only appears after successful write
    submissionsSh.appendRow([
      now,
      submissionKey,
      participantId,
      submittedAt,
      questionCount,
      responseRows.length,
      voteRows.length
    ]);

    return jsonOut({
      ok: true,
      duplicate: false,
      response_rows: responseRows.length,
      vote_rows: voteRows.length
    });
  } catch (err) {
    return jsonOut({ ok: false, error: String(err) });
  } finally {
    lock.releaseLock();
  }
}

function normalizeAnswerArray(answerLabels, answerLabel) {
  if (Array.isArray(answerLabels)) {
    return answerLabels.filter((x) => typeof x === "string" && x !== "");
  }
  if (typeof answerLabel === "string" && answerLabel !== "") {
    return [answerLabel];
  }
  return [];
}

function normalizeMethodsArray(answerMethods, answerLabels, shownOrder) {
  if (Array.isArray(answerMethods)) {
    return answerMethods.map((m) => (typeof m === "string" ? m : ""));
  }
  return answerLabels.map((lb) => labelToMethod(lb, shownOrder));
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
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}
