const SUBMIT_ENDPOINT = "https://script.google.com/macros/s/AKfycbyHXYO5AXyN7deAXpcEFTCB_qpTRGr-CzAuiB32L6HsRkwkXNGFno5I-Tzkq7xGXaq_/exec";
const MANIFEST_PATH = "manifest.json";
const STORAGE_KEY = "four_step_video_user_study_participant_id";
const LABELS = ["A", "B", "C", "D"];

const appEl = document.getElementById("app");
const statusEl = document.getElementById("status");
const state = {
  participantId: getOrCreateParticipantId(),
  manifest: null,
  questions: [],
  index: 0,
  answers: {},
  submitting: false
};
let syncAnimationFrame = null;

boot();

async function boot() {
  try {
    const response = await fetch(MANIFEST_PATH, { cache: "no-store" });
    if (!response.ok) throw new Error(`Manifest request failed: ${response.status}`);
    state.manifest = await response.json();
    state.questions = buildQuestions(state.manifest);
    const isLocalPreview = ["localhost", "127.0.0.1"].includes(window.location.hostname);
    const previewPart = isLocalPreview
      ? Number(new URLSearchParams(window.location.search).get("preview_part") || 0)
      : 0;
    if (previewPart > 0) {
      state.questions = state.questions.filter((question) => question.partNumber === previewPart);
    }
    if (state.questions.length === 0) throw new Error(`Part ${previewPart} is not available`);
    const firstPartIndex = state.questions[0].partIndex;
    statusEl.textContent = `Anonymous participant ${state.participantId.slice(0, 8)}${previewPart > 0 ? ` · Part ${previewPart} preview` : ""}`;
    if (previewPart > 0) renderPartIntro(firstPartIndex, true);
    else renderStudyIntro();
  } catch (error) {
    statusEl.textContent = "Study failed to load";
    statusEl.classList.add("error");
    appEl.innerHTML = `<h2>Cannot load study</h2><p class="error">${escapeHtml(error.message)}</p>`;
  }
}

function getOrCreateParticipantId() {
  const existing = localStorage.getItem(STORAGE_KEY);
  if (existing) return existing;
  const id = crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`;
  localStorage.setItem(STORAGE_KEY, id);
  return id;
}

function hashSeed(text) {
  let value = 2166136261;
  for (const char of text) {
    value ^= char.charCodeAt(0);
    value = Math.imul(value, 16777619);
  }
  return value >>> 0;
}

function deterministicShuffle(items, seedText) {
  let seed = hashSeed(seedText);
  const result = items.slice();
  const random = () => {
    seed += 0x6d2b79f5;
    let t = seed;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  for (let i = result.length - 1; i > 0; i -= 1) {
    const j = Math.floor(random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

function buildQuestions(manifest) {
  const questions = [];
  manifest.parts.forEach((part, partIndex) => {
    part.cases.forEach((item) => {
      questions.push({
        ...item,
        partIndex,
        partId: part.id,
        partNumber: part.number,
        partTitle: part.title,
        metrics: part.metrics,
        shownOrder: deterministicShuffle(part.methods, `${state.participantId}:${part.id}:${item.id}`)
      });
    });
  });
  return questions;
}

function renderStudyIntro() {
  stopSync();
  appEl.innerHTML = `
    <h2>Four-Step Video User Study</h2>
    <p>Thank you for participating in this study.</p>
    <p>This study contains two parts:</p>

    <h3>Part 1: Four-Step Baseline Comparison</h3>
    <p>
      You will evaluate 20 video–prompt pairs. Each question shows four anonymous videos.
      For each question, select one video for <strong>Text alignment</strong> and one video for
      <strong>Visual quality</strong>.
    </p>

    <h3>Part 2: Four-Step Dynamic Comparison</h3>
    <p>
      You will evaluate 10 video–prompt pairs. Each question shows two anonymous videos.
      For each question, select one video for <strong>Dynamics</strong> (including camera motion
      and subject/object motion), one for <strong>Visual quality</strong>, and one for
      <strong>Text alignment</strong>.
    </p>

    <p class="notice">Video labels are randomized independently for every participant and question. Method identities remain hidden.</p>
    <div class="controls"><button id="start-study" class="primary">I Consent, Start Study</button></div>
  `;
  document.getElementById("start-study").addEventListener("click", () => renderPartIntro(0));
}

function renderPartIntro(partIndex, firstPart = false) {
  stopSync();
  const part = state.manifest.parts[partIndex];
  const count = part.cases.length;
  const methodCount = part.methods.length;
  const metricList = part.metrics.map((metric) => `<li><strong>${escapeHtml(metric.title.replace(/^\d+\)\s*/, ""))}:</strong> ${escapeHtml(metric.help)}</li>`).join("");
  appEl.innerHTML = `
    <h2>Part ${part.number} · ${escapeHtml(part.title)}</h2>
    <p>You will evaluate ${count} video–prompt pairs. Each question contains ${methodCount} anonymous videos generated from the same prompt.</p>
    <p>For each metric, select the one video that best satisfies it.</p>
    <ul>${metricList}</ul>
    <p class="notice">${LABELS.slice(0, methodCount).join("/")} are randomized independently for every participant and question. Method identities remain hidden.</p>
    <div class="controls"><button id="start" class="primary">${firstPart ? `I Consent, Start Part ${part.number}` : `Start Part ${part.number}`}</button></div>
  `;
  document.getElementById("start").addEventListener("click", () => renderQuestion());
}

function stopSync() {
  if (syncAnimationFrame !== null) {
    cancelAnimationFrame(syncAnimationFrame);
    syncAnimationFrame = null;
  }
}

function renderQuestion() {
  stopSync();
  window.scrollTo({ top: 0, behavior: "auto" });
  const question = state.questions[state.index];
  const partQuestions = state.questions.filter((item) => item.partIndex === question.partIndex);
  const partPosition = partQuestions.findIndex((item) => item.id === question.id);
  const answer = state.answers[state.index] || Object.fromEntries(question.metrics.map((metric) => [metric.key, []]));
  state.answers[state.index] = answer;
  const choiceLabels = LABELS.slice(0, question.shownOrder.length);
  const compact = question.shownOrder.length === 2;

  const videos = question.shownOrder.map((method, position) => `
    <article class="video-card">
      <div class="video-label">Video ${LABELS[position]}</div>
      <video controls muted playsinline autoplay loop preload="auto">
        <source src="${encodeURI(question.videos[method])}" type="video/mp4">
      </video>
    </article>
  `).join("");

  const metricBlocks = question.metrics.map((metric) => {
    const choices = choiceLabels.map((label) => {
      const checked = answer[metric.key].includes(label) ? "checked" : "";
      return `<label class="choice"><input type="radio" name="${metric.key}" value="${label}" ${checked}><span>Video ${label}</span></label>`;
    }).join("");
    return `<fieldset><legend>${escapeHtml(metric.title)}</legend><p class="metric-help">${escapeHtml(metric.help)}</p><div class="choice-grid ${compact ? "two-choices" : ""}">${choices}</div></fieldset>`;
  }).join("");

  const isLastQuestion = state.index === state.questions.length - 1;
  const nextPart = !isLastQuestion && state.questions[state.index + 1].partIndex !== question.partIndex;
  const nextLabel = isLastQuestion ? "Submit Study" : nextPart ? `Continue to Part ${question.partNumber + 1}` : "Next →";

  appEl.innerHTML = `
    <div class="question-layout ${compact ? "compact-question" : ""}">
      <div class="progress"><span>Part ${question.partNumber} · Question ${partPosition + 1}/${partQuestions.length}</span><span>0-based demo index ${question.source_index_0based}</span></div>
      <div class="progress-track"><div class="progress-fill" style="width:${100 * (partPosition + 1) / partQuestions.length}%"></div></div>
      <p class="prompt"><strong>Prompt:</strong> ${escapeHtml(question.prompt)}</p>
      <div class="transport">
        <button id="play-all" class="primary">▶ Play all</button>
        <button id="restart-all">↺ Restart all</button>
        <span class="playback-help">If any video appears frozen, use the Restart All button.</span>
      </div>
      <div class="video-grid ${compact ? "two-videos" : ""}">${videos}</div>
      <div class="metrics">${metricBlocks}</div>
      <div class="controls">
        <button id="previous" ${state.index === 0 ? "disabled" : ""}>← Previous</button>
        <button id="next" class="primary" ${isComplete(answer, question.metrics) ? "" : "disabled"}>${nextLabel}</button>
      </div>
      <p class="notice">Method identities are hidden. Select exactly one video for every metric.</p>
    </div>
  `;

  wireVideoControls();
  for (const metric of question.metrics) {
    for (const input of appEl.querySelectorAll(`input[name="${metric.key}"]`)) {
      input.addEventListener("change", (event) => updateChoice(metric.key, event.target.value, event.target.checked));
    }
  }
  document.getElementById("previous").addEventListener("click", () => {
    if (state.index > 0) { state.index -= 1; renderQuestion(); }
  });
  document.getElementById("next").addEventListener("click", async () => {
    if (!isComplete(state.answers[state.index], question.metrics) || state.submitting) return;
    if (isLastQuestion) { await submitStudy(); return; }
    state.index += 1;
    if (nextPart) renderPartIntro(state.questions[state.index].partIndex);
    else renderQuestion();
  });
}

function updateChoice(metric, value, checked) {
  const next = checked ? [value] : [];
  state.answers[state.index][metric] = next;
  for (const input of appEl.querySelectorAll(`input[name="${metric}"]`)) input.checked = next.includes(input.value);
  const question = state.questions[state.index];
  document.getElementById("next").disabled = !isComplete(state.answers[state.index], question.metrics);
}

function isComplete(answer, metrics) {
  return metrics.every((metric) => Array.isArray(answer[metric.key]) && answer[metric.key].length === 1);
}

function wireVideoControls() {
  const videos = [...appEl.querySelectorAll("video")];
  const master = videos[0];
  const playButton = document.getElementById("play-all");
  const playAll = async (restart = false) => {
    if (restart) videos.forEach((video) => { video.currentTime = 0; });
    const masterTime = master.currentTime || 0;
    for (const video of videos.slice(1)) video.currentTime = masterTime;
    await Promise.all(videos.map((video) => video.play().catch(() => {})));
    playButton.textContent = "⏸ Pause all";
  };

  playButton.addEventListener("click", async () => {
    if (videos.some((video) => video.paused)) await playAll(false);
    else {
      videos.forEach((video) => video.pause());
      playButton.textContent = "▶ Play all";
    }
  });
  document.getElementById("restart-all").addEventListener("click", async () => { await playAll(true); });

  const maintainSync = () => {
    if (master.isConnected && !master.paused) {
      for (const video of videos.slice(1)) {
        if (Math.abs(video.currentTime - master.currentTime) > 0.08) video.currentTime = master.currentTime;
        if (video.paused) video.play().catch(() => {});
      }
    }
    if (master.isConnected) syncAnimationFrame = requestAnimationFrame(maintainSync);
  };
  master.addEventListener("playing", () => { playButton.textContent = "⏸ Pause all"; });
  master.addEventListener("pause", () => {
    videos.slice(1).forEach((video) => video.pause());
    playButton.textContent = "▶ Play all";
  });
  playAll(true);
  syncAnimationFrame = requestAnimationFrame(maintainSync);
}

async function submitStudy() {
  state.submitting = true;
  const completedAt = new Date().toISOString();
  const responses = state.questions.map((question, index) => {
    const labels = state.answers[index];
    const methods = {};
    for (const metric of question.metrics) {
      methods[metric.key] = labels[metric.key].map((label) => question.shownOrder[LABELS.indexOf(label)]);
    }
    return {
      part_id: question.partId,
      part_number: question.partNumber,
      part_title: question.partTitle,
      case_id: question.id,
      source_index_0based: question.source_index_0based,
      prompt: question.prompt,
      shown_order: question.shownOrder,
      answer_labels: labels,
      answer_methods: methods
    };
  });
  const payload = {
    study_id: state.manifest.study_id,
    participant_id: state.participantId,
    completed_at_iso: completedAt,
    user_agent: navigator.userAgent,
    responses
  };

  let uploaded = false;
  if (SUBMIT_ENDPOINT.trim()) {
    try {
      const result = await fetch(SUBMIT_ENDPOINT, { method: "POST", body: JSON.stringify(payload) });
      const responseBody = await result.json();
      uploaded = result.ok && responseBody && responseBody.ok === true;
    } catch (_) {}
  }
  if (!uploaded) downloadJson(payload, `four_step_video_study_${state.participantId.slice(0, 8)}.json`);
  const code = state.participantId.replaceAll("-", "").slice(0, 8).toUpperCase();
  appEl.innerHTML = `<h2>Study complete</h2><p>${uploaded ? "Responses submitted successfully." : "Preview mode: responses were downloaded as a JSON file."}</p><p>Completion code:</p><div class="completion-code">${code}</div>`;
}

function downloadJson(data, filename) {
  const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: "application/json" }));
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (character) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;"
  })[character]);
}
