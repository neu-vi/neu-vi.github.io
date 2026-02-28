const SUBMIT_ENDPOINT = "https://script.google.com/macros/s/AKfycbw6LZsa1opJN_Oiygmy6HDZMFCEbU4rl9ILZ16Icb7xzBFrw7HRgnnVkV3iJgRbwiCM/exec";
const MANIFEST_PATH = "manifest.json";
const STORAGE_KEY = "force_ablation_user_study_participant_id";
const CONDITION_ORDER = [
  "wind_change_ablation",
  "point_change_ablation",
  "wind_magnitude",
  "point_magnitude"
];

const appEl = document.getElementById("app");
const statusEl = document.getElementById("status");

const state = {
  participantId: getOrCreateParticipantId(),
  manifest: null,
  selectedCondition: "all",
  questions: [],
  index: 0,
  answersByQuestion: {},
  isSubmitting: false
};

boot();

async function boot() {
  setStatus(`Participant ID: ${state.participantId}`, false);
  try {
    const manifest = await loadManifest();
    state.manifest = manifest;
    renderIntro();
  } catch (err) {
    setStatus(err.message, true);
    renderManifestError(err.message);
  }
}

function getOrCreateParticipantId() {
  const stored = localStorage.getItem(STORAGE_KEY);
  if (stored) {
    return stored;
  }
  let id = "";
  if (window.crypto && typeof window.crypto.randomUUID === "function") {
    id = window.crypto.randomUUID();
  } else {
    id = "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
      const r = Math.floor(Math.random() * 16);
      const v = c === "x" ? r : (r & 0x3) | 0x8;
      return v.toString(16);
    });
  }
  localStorage.setItem(STORAGE_KEY, id);
  return id;
}

async function loadManifest() {
  const res = await fetch(MANIFEST_PATH, { cache: "no-store" });
  if (!res.ok) {
    throw new Error("Could not load manifest.json. Create the ablation manifest and refresh.");
  }
  const data = await res.json();
  if (!data.conditions || typeof data.conditions !== "object") {
    throw new Error("Manifest format is invalid: missing 'conditions'.");
  }
  return data;
}

function renderManifestError(msg) {
  appEl.innerHTML = "";
  const block = document.createElement("div");
  block.innerHTML = `
    <h2>Manifest Not Available</h2>
    <p>${escapeHtml(msg)}</p>
    <p class="notice">Expected file: <code>user-study/force_ablation_user_study/manifest.json</code></p>
    <p class="notice">The manifest should define four conditions: wind_change_ablation, point_change_ablation, wind_magnitude, point_magnitude.</p>
    <div class="controls">
      <button id="retry" class="secondary">Retry</button>
    </div>
  `;
  appEl.appendChild(block);
  document.getElementById("retry").addEventListener("click", () => boot());
}

function renderIntro() {
  appEl.innerHTML = `
    <h2>User Study: Force Ablation Evaluation</h2>
    <p>Thank you for participating in this study.</p>
    <p>
      This study evaluates force-control ablations with two tasks:
      force-change following and force-magnitude adaptation.
    </p>

    <h3>Task A: Force-change following</h3>
    <p>
      Conditions: <strong>wind_change_ablation</strong> and <strong>point_change_ablation</strong>.
      You will compare two methods and select which method(s) can follow force changes,
      or choose <strong>None (all are bad)</strong>.
    </p>

    <h3>Task B: Magnitude adaptation</h3>
    <p>
      Conditions: <strong>wind_magnitude</strong> and <strong>point_magnitude</strong>.
      Each method has two videos (small force and large force). You will select which method(s) can show adaptation
      to force magnitude differences, or choose <strong>None (all are bad)</strong>.
    </p>

    <p><strong>Estimated time:</strong> approximately 6-10 minutes.</p>
    <p>All responses are anonymous and used for research only.</p>

    ${renderArrowGuide()}

    <div class="controls">
      <button id="start-study">I Consent, Start Study</button>
    </div>
  `;

  document.getElementById("start-study").addEventListener("click", () => {
    state.selectedCondition = "all";
    startStudy();
  });
}

function startStudy() {
  state.questions = buildQuestions();
  state.answersByQuestion = {};
  state.index = 0;

  if (state.questions.length === 0) {
    appEl.innerHTML = `
      <h2>No Questions Available</h2>
      <p class="notice">No valid cases were found in the manifest.</p>
      <div class="controls"><button id="back" class="secondary">Back</button></div>
    `;
    document.getElementById("back").addEventListener("click", () => renderIntro());
    return;
  }
  renderQuestion();
}

function buildQuestions() {
  const selectedConditions =
    state.selectedCondition === "all"
      ? CONDITION_ORDER.filter((c) => state.manifest.conditions[c])
      : [state.selectedCondition];

  const items = [];
  for (const condition of selectedConditions) {
    const conditionData = state.manifest.conditions[condition];
    if (!conditionData || !Array.isArray(conditionData.cases) || !Array.isArray(conditionData.methods)) {
      continue;
    }

    const taskType = inferTaskType(conditionData, condition);
    for (const caseItem of conditionData.cases) {
      items.push({
        condition,
        taskType,
        caseId: caseItem.id,
        methods: conditionData.methods.slice(),
        shownOrder: shuffleArray(conditionData.methods.slice()),
        videos: caseItem.videos || {},
        pairs: caseItem.pairs || {},
        referenceImage: caseItem.reference_image || ""
      });
    }
  }
  return items;
}

function inferTaskType(conditionData, condition) {
  if (conditionData.task_type) {
    return conditionData.task_type;
  }
  return condition.includes("magnitude") ? "magnitude_adaptation" : "change_following";
}

function renderQuestion() {
  scrollToTop();
  const q = state.questions[state.index];
  const answer = normalizeAnswerList(state.answersByQuestion[state.index]);
  state.answersByQuestion[state.index] = answer;

  const options = q.shownOrder
    .map((method, idx) => {
      const label = String.fromCharCode(65 + idx);
      return { label, method };
    })
    .concat([{ label: "NONE", method: "NONE" }]);

  const mediaBlock = q.taskType === "magnitude_adaptation"
    ? renderMagnitudeBlock(q)
    : renderChangeBlock(q);

  appEl.innerHTML = `
    <div class="progress">
      <span>Question ${state.index + 1}/${state.questions.length}</span>
      <span>${humanCondition(q.condition)}</span>
    </div>

    <p><strong>Case:</strong> ${escapeHtml(q.caseId)}</p>
    ${renderArrowGuide(q.condition)}
    ${renderReferenceImage(q)}

    ${mediaBlock}

    ${renderPromptBlock(q, options, answer)}

    <div class="controls">
      <button id="prev" class="secondary" ${state.index === 0 ? "disabled" : ""}>Previous</button>
      <button id="next" ${answer.length > 0 ? "" : "disabled"}>${
        state.index === state.questions.length - 1 ? "Submit" : "Next"
      }</button>
    </div>
    <p class="notice">Method identities are hidden. Labels are randomized per question.</p>
  `;

  setupReferenceImageFallback(q);

  const inputs = appEl.querySelectorAll('input[name="answer_select"]');
  inputs.forEach((input) => {
    input.addEventListener("change", (evt) => {
      const current = normalizeAnswerList(state.answersByQuestion[state.index]);
      const next = computeNextValues(current, evt.target.value, evt.target.checked);
      state.answersByQuestion[state.index] = next;
      syncChoiceInputs(next);
      syncNextButtonState();
    });
  });

  playVisibleVideos();

  document.getElementById("prev").addEventListener("click", () => {
    if (state.index > 0) {
      state.index -= 1;
      renderQuestion();
    }
  });

  document.getElementById("next").addEventListener("click", async () => {
    if (state.isSubmitting) return;

    const currentAnswer = normalizeAnswerList(state.answersByQuestion[state.index]);
    if (currentAnswer.length === 0) return;

    if (state.index === state.questions.length - 1) {
      const nextBtn = document.getElementById("next");
      if (nextBtn) {
        nextBtn.disabled = true;
        nextBtn.textContent = "Submitting...";
      }
      await finishStudy();
      return;
    }

    state.index += 1;
    renderQuestion();
  });
}

function renderChangeBlock(q) {
  const cards = q.shownOrder
    .map((method, idx) => {
      const label = String.fromCharCode(65 + idx);
      const src = q.videos[method] || "";
      return `
      <div class="video-card">
        <div class="video-label">${label}</div>
        <video controls muted preload="metadata" playsinline autoplay loop>
          <source src="${encodeURI(src)}" type="video/mp4">
          Your browser does not support MP4 playback.
        </video>
      </div>`;
    })
    .join("");

  return `<div class="video-grid two-grid">${cards}</div>`;
}

function renderMagnitudeBlock(q) {
  const cards = q.shownOrder
    .map((method, idx) => {
      const label = String.fromCharCode(65 + idx);
      const pair = resolvePair(q, method);
      return `
      <div class="video-card">
        <div class="video-label">${label}</div>
        <p class="pair-tag">Smaller force input</p>
        <video controls muted preload="metadata" playsinline autoplay loop>
          <source src="${encodeURI(pair.small)}" type="video/mp4">
          Your browser does not support MP4 playback.
        </video>
        <p class="pair-tag">Larger force input</p>
        <video controls muted preload="metadata" playsinline autoplay loop>
          <source src="${encodeURI(pair.large)}" type="video/mp4">
          Your browser does not support MP4 playback.
        </video>
      </div>`;
    })
    .join("");

  return `<div class="video-grid">${cards}</div>`;
}

function resolvePair(q, method) {
  if (q.pairs && q.pairs[method]) {
    return {
      small: q.pairs[method].small || "",
      large: q.pairs[method].large || ""
    };
  }

  const direct = q.videos[method] || {};
  return {
    small: direct.small || direct.video_0 || "",
    large: direct.large || direct.video_1 || ""
  };
}

function renderPromptBlock(q, options, selectedValue) {
  const selectedValues = normalizeAnswerList(selectedValue);
  const prompt = q.taskType === "magnitude_adaptation"
    ? "Which method(s) can demonstrate adaptation to force magnitude differences across the two videos?"
    : "Which method(s) can follow force changes?";

  const optionsHtml = options
    .map((opt) => {
      const checked = selectedValues.includes(opt.label) ? "checked" : "";
      const text = opt.label === "NONE" ? "None (all are bad)" : opt.label;
      return `
      <label class="radio-line">
        <input type="checkbox" name="answer_select" value="${opt.label}" ${checked}>
        ${escapeHtml(text)}
      </label>`;
    })
    .join("");

  const detailText = q.taskType === "magnitude_adaptation"
    ? "Select one or more methods that can reflect the expected change in magnitude between smaller and larger force inputs."
    : "Select one or more methods that can follow force-change control. If none can, choose None (all are bad).";

  return `
    <fieldset class="fieldset">
      <legend>${escapeHtml(prompt)} (select one or more; NONE is exclusive)</legend>
      <p class="metric-description">${escapeHtml(detailText)}</p>
      ${optionsHtml}
    </fieldset>
  `;
}

function syncNextButtonState() {
  const nextBtn = document.getElementById("next");
  if (!nextBtn) return;
  nextBtn.disabled = normalizeAnswerList(state.answersByQuestion[state.index]).length === 0;
}

function playVisibleVideos() {
  const videos = appEl.querySelectorAll("video");
  videos.forEach((video) => {
    const playPromise = video.play();
    if (playPromise && typeof playPromise.catch === "function") {
      playPromise.catch(() => {});
    }
  });
}

async function finishStudy() {
  if (state.isSubmitting) return;
  state.isSubmitting = true;

  const now = new Date().toISOString();
  const responses = state.questions.map((q, idx) => {
    const answerLabels = normalizeAnswerList(state.answersByQuestion[idx]);
    const answerMethods = answerLabels.map((label) => mapLabelToMethod(label, q.shownOrder));
    return {
      participant_id: state.participantId,
      condition: q.condition,
      task_type: q.taskType,
      case_id: q.caseId,
      shown_order: q.shownOrder,
      answer_label: answerLabels[0] || "",
      answer_method: answerMethods[0] || "",
      answer_labels: answerLabels,
      answer_methods: answerMethods,
      timestamp_iso: now,
      user_agent: navigator.userAgent
    };
  });

  const payload = {
    participant_id: state.participantId,
    completed_at_iso: now,
    user_agent: navigator.userAgent,
    responses
  };

  try {
    let postResult = null;
    if (SUBMIT_ENDPOINT.trim()) {
      postResult = await trySubmitOnline(payload);
    }

    let downloaded = false;
    if (!postResult || !postResult.ok) {
      downloadJson(payload, `force_ablation_user_study_${state.participantId.slice(0, 8)}.json`);
      downloaded = true;
    }

    renderComplete(postResult, downloaded);
  } finally {
    state.isSubmitting = false;
  }
}

function mapLabelToMethod(label, shownOrder) {
  if (!label) return "";
  if (label === "NONE") return "NONE";
  const idx = { A: 0, B: 1, C: 2, D: 3 }[label];
  if (idx === undefined || idx >= shownOrder.length) return "INVALID";
  return shownOrder[idx];
}

async function trySubmitOnline(payload) {
  try {
    const res = await fetch(SUBMIT_ENDPOINT, {
      method: "POST",
      body: JSON.stringify(payload)
    });

    if (!res.ok) {
      return {
        ok: false,
        message: `Server returned status ${res.status}.`
      };
    }

    return {
      ok: true,
      message: "Submission uploaded successfully."
    };
  } catch (err) {
    return {
      ok: false,
      message: err && err.message ? err.message : "Upload failed due to a network error."
    };
  }
}

function renderComplete(postResult, downloaded) {
  scrollToTop();
  const completionCode = state.participantId.replace(/-/g, "").slice(0, 8).toUpperCase();

  let message = "Responses saved locally as a downloaded JSON file.";
  if (postResult && postResult.ok) {
    message = "Responses submitted online successfully.";
  }

  let fallback = "";
  if (postResult && !postResult.ok) {
    fallback = `<p class=\"notice\">Online submit failed: ${escapeHtml(postResult.message)} Local JSON fallback was used.</p>`;
  }

  const downloadNote = downloaded
    ? '<p class="notice">A JSON copy was downloaded to your device.</p>'
    : "";

  appEl.innerHTML = `
    <h2>Study Complete</h2>
    <p>${escapeHtml(message)}</p>
    ${fallback}
    ${downloadNote}
    <p>Thank you for completing the ablation user study.</p>
    <p>Your completion code:</p>
    <div class="completion-code">${completionCode}</div>
  `;
}

function renderReferenceImage(q) {
  const first = buildReferenceImageCandidates(q)[0];
  return `
    <section class="reference-panel" id="reference-panel">
      <p class="reference-title"><strong>Reference image</strong> (same case for context)</p>
      <img
        id="reference-image"
        src="${escapeHtml(first)}"
        alt="Reference image for this case"
        loading="lazy"
      />
      <p class="notice" id="reference-fallback" hidden>Reference image not available for this case.</p>
    </section>
  `;
}

function buildReferenceImageCandidates(q) {
  if (q.referenceImage) {
    return [q.referenceImage];
  }
  const base = String(q.caseId || "").replace(/\.[^.]+$/, "").replace(/_(0|1)$/, "");
  return [
    `imgs/${q.condition}/${base}.png`,
    `imgs/${q.condition}/${base}.jpg`,
    `imgs/${q.condition}/${base}.jpeg`,
    `imgs/${q.condition}/${base}.webp`
  ];
}

function setupReferenceImageFallback(q) {
  const candidates = buildReferenceImageCandidates(q);
  const imageEl = document.getElementById("reference-image");
  const fallbackEl = document.getElementById("reference-fallback");
  if (!imageEl || !fallbackEl) {
    return;
  }

  let idx = 0;
  imageEl.addEventListener("error", () => {
    idx += 1;
    if (idx < candidates.length) {
      imageEl.src = candidates[idx];
      return;
    }
    imageEl.hidden = true;
    fallbackEl.hidden = false;
  });
}

function renderArrowGuide(condition) {
  const texts = {
    wind_change_ablation:
      "<strong>Wind force change:</strong> The arrow indicates the force direction, and its length indicates the force magnitude. A change of the arrow means the global wind force has changed.",
    point_change_ablation:
      "<strong>Point force change:</strong> The arrow indicates the force direction, and its length indicates the force magnitude. The second force is applied to the same object, and is shown at the original position for reference.",
    wind_magnitude:
      "<strong>Wind force magnitude:</strong> The arrow indicates the force direction, and its length indicates the force magnitude. Compare how the motion changes between smaller and larger force inputs.",
    point_magnitude:
      "<strong>Point force magnitude:</strong> The arrow indicates the force direction, and its length indicates the force magnitude. The circle around the starting point indicates the local force location. Compare smaller and larger force inputs."
  };

  const all = `
    <ul>
      <li>${texts.wind_change_ablation}</li>
      <li>${texts.point_change_ablation}</li>
      <li>${texts.wind_magnitude}</li>
      <li>${texts.point_magnitude}</li>
    </ul>
  `;

  const single = condition && texts[condition] ? `<ul><li>${texts[condition]}</li></ul>` : all;

  return `
    <div class="arrow-guide">
      <p><strong>Arrow meaning guide</strong></p>
      ${single}
    </div>
  `;
}

function downloadJson(data, filename) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function setStatus(text, isError) {
  statusEl.textContent = text;
  statusEl.className = isError ? "status error" : "status";
}

function normalizeAnswerList(value) {
  if (Array.isArray(value)) return value.slice();
  if (!value) return [];
  return [value];
}

function computeNextValues(currentValues, changedValue, isChecked) {
  if (changedValue === "NONE") {
    return isChecked ? ["NONE"] : [];
  }

  const withoutNeither = currentValues.filter((v) => v !== "NONE");
  if (isChecked) {
    if (!withoutNeither.includes(changedValue)) {
      withoutNeither.push(changedValue);
    }
  } else {
    return withoutNeither.filter((v) => v !== changedValue);
  }
  return withoutNeither;
}

function syncChoiceInputs(selectedValues) {
  const selected = new Set(selectedValues);
  const inputs = appEl.querySelectorAll('input[name="answer_select"]');
  inputs.forEach((input) => {
    input.checked = selected.has(input.value);
  });
}

function scrollToTop() {
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function shuffleArray(arr) {
  for (let i = arr.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function humanCondition(condition) {
  switch (condition) {
    case "wind_change_ablation":
      return "Wind Change Ablation";
    case "point_change_ablation":
      return "Point Change Ablation";
    case "wind_magnitude":
      return "Wind Magnitude";
    case "point_magnitude":
      return "Point Magnitude";
    default:
      return condition;
  }
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
