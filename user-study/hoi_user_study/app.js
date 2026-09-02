/* ==========================================================================
 * Perceptual user study - front end.
 * Plain ES2017, no dependencies, no build step, no framework.
 *
 * ONE study, ONE entry point, 30 questions. The session runs in two blocks:
 *
 *   trials  1-10   block "tracking"    2 candidates + a mocap reference clip,
 *                                      no text, tracking-accuracy question
 *   trials 11-30   block "generation"  4 candidates + a text prompt,
 *                                      text-adherence question
 *
 * Blocks are never interleaved: all tracking trials come first, the case order
 * is shuffled WITHIN a block only, and a one-off interstitial screen explains
 * the change of task at the boundary.
 *
 * `m1` in the tracking block and `m1` in the generation block are DIFFERENT
 * methods. Every response therefore records its `block`, and nothing in this
 * file ever pools method ids across blocks.
 * ========================================================================== */

/* --------------------------------------------------------------------------
 * Submission endpoint.
 *
 * Leave as "" (offline mode): at the end of the study the responses are
 * downloaded to the participant's device as a JSON file. To collect responses
 * online, paste your own Google Apps Script web-app URL here - see README.md.
 *
 * CRITICAL - do NOT add a `Content-Type` header to the submit fetch below.
 * A string body defaults to `text/plain;charset=UTF-8`, which is a
 * CORS-safelisted content type and therefore does NOT trigger a preflight
 * OPTIONS request. Google Apps Script web apps cannot answer a preflight, so
 * adding the header makes every submission silently fail.
 * ------------------------------------------------------------------------ */
const SUBMIT_ENDPOINT = "https://script.google.com/macros/s/AKfycbyjI4c37BxkKnGGQ6Gy9pAa2k6tzdWrDr1RXLH2_5D_wI_AXNtd9E_bthxQl_EXpLqx/exec";

/* Give up on a silent server rather than hanging on "Submitting..." forever. */
const SUBMIT_TIMEOUT_MS = 30000;

/* Manifest sitting next to this file. */
/* Cache-bust the manifest. Video FILENAMES are reused across rebuilds
   (g10.mp4 can mean a different clip after a re-selection), so a stale
   cached manifest would pair new prompts with old videos. Each video URL
   also carries a ?v=<content-hash>, so a changed clip is a new URL. */
const MANIFEST_PATH = "manifest.json?v=" + Date.now();

/* Prefix prepended to every relative video path taken from the manifest.
   Leave "" when the `videos/` tree sits next to this file exactly as the
   manifest paths describe it. */
const VIDEO_BASE = "";

const STUDY_ID = "hoi_study";
/* Derived from the delivered clip durations, not guessed.
     Part 1: 10 clips, 2.57-8.57 s, 43.9 s total (mean 4.39 s)
     Part 2: 20 clips, 10.0 s each, 200 s total (the four play concurrently)
   One pass of every clip is a hard floor of 244 s = 4.1 min. Realistically a
   participant watches ~2 loops in Part 1 and ~1.5 in Part 2 and spends ~8-10 s
   answering the two questions:
     2*43.9 + 10*8  = 168 s   Part 1
     1.5*200 + 20*10 = 500 s  Part 2
     + ~60 s for the intro, interstitial and completion screens
     = 728 s = 12.1 min  ->  "about 12 minutes". */
const EST_DURATION_TEXT = "about 12 minutes";

/* ===== BLOCK CONFIG :: BEGIN ================================================
   The block order is hard-coded here AND in tools/install_manifests.py. A
   manifest edit must not be able to silently reorder the blocks.
   ========================================================================= */
const BLOCK_ORDER = ["tracking", "generation"];

/*
 * Copy rule for this whole screen: the participant should understand the task
 * from the LAYOUT, not from prose. So a question is one short imperative line
 * with no metric jargon and no description paragraph, the answers are chips
 * that visibly press in when picked - and, being real radio buttons, picking a
 * second one releases the first, so "choose one" needs no sentence either - and
 * the letter chip on a video is drawn exactly like the unselected answer chip so
 * the mapping needs no explanation.
 *
 * Every question takes EXACTLY ONE answer (2026-09-01). The wording below is
 * singular throughout; if you ever re-introduce multi-select, every legend, the
 * intro list and both interstitial sentences have to change back with it.
 *
 * The payload keys below are load-bearing for analysis and must NOT be renamed
 * when the visible wording changes.
 */
const BLOCK_CONFIG = {
  tracking: {
    part: "Part 1 of 2",
    methodCount: 2,
    gridClass: "two-grid",
    /* A mocap clip shown above the candidates, not lettered, not judged. Its
       tint, border and REFERENCE badge are what say so - there is no sentence. */
    showReference: true,
    referenceBadge: "Reference",
    /* Deliberately false: this block is not text-conditioned, so a prompt would
       only bias the judgement. A `prompt` in the manifest is ignored. */
    showPrompt: false,
    trialNote:
      "Some clips stop early because the character has fallen over or stopped "
      + "moving. Please judge what happens before that point.",
    noneLabel: "Neither",
    /* Two questions, not three. "Physical plausibility" was dropped on
       2026-08-31: every clip in this study is a physics-simulated Isaac Sim
       rollout, so plausibility holds by construction and the question
       discriminates nothing while still spending the participant's attention. */
    questions: [
      { key: "tracking_accuracy", legend: "Which clip follows the reference motion more accurately?" },
      { key: "naturalness", legend: "Which clip moves more naturally?" }
    ]
  },

  generation: {
    part: "Part 2 of 2",
    methodCount: 4,
    gridClass: "four-grid",
    showReference: false,
    /* The instruction is shown quoted and large directly above the grid; that
       placement is the explanation, so there is no label sentence. */
    showPrompt: true,
    /* Every generation clip is exactly 10 s, so the freeze disclosure that the
       tracking block carries does not apply here. */
    trialNote: "",
    noneLabel: "None",
    /* Two questions here too - see the note in the tracking block. */
    questions: [
      { key: "text_adherence", legend: "Which clip follows the written instruction?" },
      /* Superlative on purpose: one pick out of four is a ranking, not a pass/fail
         judgement, so "moves naturally" would leave a participant who thinks two
         clips qualify with no rule for choosing between them. */
      { key: "naturalness", legend: "Which clip moves most naturally?" }
    ]
  }
};

/* Shown once, when the participant crosses INTO this block from another one.
   Nothing is shown before the first block.

   Kept to two sentences on purpose. The per-question wording on the trial screen
   itself carries the detail, in context, where it is actually useful. */
const INTERSTITIAL = {
  generation: function () {
    return `
      <h2>Part 2 of 2</h2>
      <p>
        A written instruction will now appear at the top, with four clips below
        it.
      </p>
      <p>
        Select which clip follows the written instruction and which clip moves
        most naturally.
      </p>
    `;
  }
};

/*
 * The consent screen is deliberately tiny: what they will do, how long it
 * takes, that it is anonymous. Nothing else.
 *
 * Everything that used to live here - the criteria list, the description of the
 * methods, the freeze note, the "you may stop at any time" boilerplate - was cut
 * on 2026-08-31 because walls of text before the first video make people bounce.
 * None of it was relocated: the two criteria already appear inline on every
 * trial with their descriptions, the freeze note is a persistent note on the
 * Part-1 trial screens where a frozen video is actually visible, and the change
 * of task is covered by the interstitial at the halfway point.
 */
function renderIntroBody(totalTrials) {
  return `
    <p class="intro-lede">
      You will view short clips of an animated character picking up and moving
      objects, then answer two questions about each set of clips.
    </p>
    <ul class="intro-parts">
      <li>
        <strong>Part 1</strong> (questions 1&ndash;10): a reference motion is
        shown at the top, with two clips below it. Select which clip follows the
        reference motion more accurately and which clip moves more naturally.
      </li>
      <li>
        <strong>Part 2</strong> (questions 11&ndash;30): a written instruction is
        shown at the top, with four clips below it. Select which clip follows the
        written instruction and which clip moves most naturally.
      </li>
    </ul>
    <p>
      There are ${totalTrials} questions in total, and the study takes about
      ${escapeHtml(EST_DURATION_TEXT.replace(/^about\s+/i, ""))}. Your answers
      are anonymous and will only be used for research.
    </p>
  `;
}
/* ===== BLOCK CONFIG :: END ================================================ */

const LABELS = ["A", "B", "C", "D"];
const NONE_VALUE = "NONE";
/* The opt-out option is simply the last choice in the same single-choice group
   (it used to need exclusivity logic; with one answer per question that is the
   radio group's job). Its visible label is per block (`noneLabel` in
   BLOCK_CONFIG - "Neither" with two videos, "None" with four); NONE_VALUE is
   what goes in the payload and never changes. */
const STORAGE_KEY_PARTICIPANT = "thc_" + STUDY_ID + "_participant_id";
const STORAGE_KEY_PROGRESS = "thc_" + STUDY_ID + "_progress_v1";
const STORAGE_KEY_SUBMISSION = "thc_" + STUDY_ID + "_submission_id_v1";
/* Bumped to 3 when the plausibility question was dropped, and to 4 when the
   answers became single-choice: the fingerprint only covers the manifest, so
   without this an in-flight session would silently switch question set (or be
   restored with two options ticked, which the new UI cannot represent)
   mid-study. A stale checkpoint is discarded instead. */
const PROGRESS_SCHEMA = 4;

const appEl = document.getElementById("app");
const statusEl = document.getElementById("status");

const state = {
  participantId: getOrCreateParticipantId(),
  /* Minted lazily at the first completion - see getOrCreateSubmissionId(). */
  submissionId: "",
  manifest: null,
  fingerprint: "",
  trials: [],
  index: 0,
  answers: {},
  meta: {},
  /* Block names whose interstitial the participant has already read. Kept in
     the checkpoint so Previous/Next around the boundary cannot show it twice. */
  interstitialsSeen: [],
  /* "intro" | "trial" | "interstitial" | "complete" - guards the global keydown
     handler and the checkpoint, so a stray keystroke on the completion screen
     cannot resurrect a session that has already been submitted. */
  phase: "intro",
  isSubmitting: false,
  focusedQuestion: "",
  dwell: { index: null, since: null },
  lastPayload: null
};

boot();

/* -------------------------------------------------------------------------
 * Boot / manifest
 * ---------------------------------------------------------------------- */

async function boot() {
  setStatus(`Participant ID: ${state.participantId}`, false);
  try {
    const manifest = await loadManifest();
    state.manifest = manifest;
    state.fingerprint = fingerprintManifest(manifest);
    applyManifestTitle(manifest);

    const saved = loadCheckpoint();
    if (saved) {
      renderResume(saved);
      return;
    }
    renderIntro();
  } catch (err) {
    const msg = err && err.message ? err.message : String(err);
    setStatus(msg, true);
    renderManifestError(msg);
  }
}

/* The page heading is manifest-driven so a copy change needs no code change.
   textContent (never innerHTML) keeps a manifest-supplied string inert. */
function applyManifestTitle(manifest) {
  const title = typeof manifest.title === "string" ? manifest.title.trim() : "";
  if (!title) {
    return;
  }
  const heading = document.querySelector(".page-header h1");
  if (heading) {
    heading.textContent = title;
  }
  document.title = title;
}

async function loadManifest() {
  let res;
  try {
    res = await fetch(MANIFEST_PATH, { cache: "no-store" });
  } catch (err) {
    throw new Error(
      "Could not fetch manifest.json. If you opened this page as a file://" +
        " URL, serve the folder over HTTP instead (see README.md)."
    );
  }
  if (!res.ok) {
    throw new Error(
      `Could not load ${MANIFEST_PATH} (HTTP ${res.status}). Build the manifest first, then reload this page.`
    );
  }
  const data = await res.json();
  validateManifest(data);
  return data;
}

function validateManifest(data) {
  if (!data || typeof data !== "object") {
    throw new Error("Manifest is not a JSON object.");
  }
  if (!data.blocks || typeof data.blocks !== "object") {
    throw new Error(
      'Manifest has no "blocks" object. This page needs the merged v2 manifest' +
        " - re-run tools/install_manifests.py."
    );
  }
  const declared = Object.keys(data.blocks).sort();
  const expected = BLOCK_ORDER.slice().sort();
  if (declared.join(",") !== expected.join(",")) {
    throw new Error(
      `Manifest declares blocks [${declared.join(", ")}] but this page expects [${expected.join(
        ", "
      )}].`
    );
  }
  BLOCK_ORDER.forEach((block) => {
    const cfg = BLOCK_CONFIG[block];
    const methods = data.blocks[block].methods;
    if (!Array.isArray(methods) || methods.length !== cfg.methodCount) {
      throw new Error(
        `Block "${block}" must list exactly ${cfg.methodCount} methods; got ${
          Array.isArray(methods) ? methods.length : "none"
        }.`
      );
    }
    if (!methods.every((m) => typeof m === "string" && m)) {
      throw new Error(`Block "${block}": every method id must be a non-empty string.`);
    }
    if (new Set(methods).size !== methods.length) {
      /* Duplicated method ids would render the same video in two slots while
         the payload pretended two different methods were compared. */
      throw new Error(`Block "${block}": method ids must be unique.`);
    }
  });
  if (!Array.isArray(data.cases) || data.cases.length === 0) {
    throw new Error("Manifest contains no cases.");
  }
  const ids = data.cases.map((c) => c && c.id);
  if (!ids.every((id) => typeof id === "string" && id)) {
    throw new Error("Every case id must be a non-empty string.");
  }
  if (new Set(ids).size !== ids.length) {
    /* Duplicated case ids make trial_order ambiguous at analysis time. */
    throw new Error("Case ids must be unique.");
  }
  if (!data.cases.every((c) => BLOCK_ORDER.indexOf(c && c.block) >= 0)) {
    throw new Error(
      `Every case must declare a "block" of ${BLOCK_ORDER.join(" or ")}.`
    );
  }
  /* Per block, not just in total: a manifest that lost one block whole would
     otherwise load as a shorter study with no block boundary at all, which is
     exactly the failure a participant cannot notice. */
  BLOCK_ORDER.forEach((block) => {
    if (casesOfBlock(data, block).length === 0) {
      throw new Error(
        `Block "${block}" has no usable case (every case needs a video for each of` +
          " its methods, and an instruction where the block shows one). Rebuild the manifest."
      );
    }
  });
}

function isUsableCase(caseItem, methods, requirePrompt) {
  if (!caseItem || typeof caseItem !== "object" || !caseItem.id) {
    return false;
  }
  const videos = caseItem.videos;
  if (!videos || typeof videos !== "object") {
    return false;
  }
  /* A block that shows an instruction cannot use a case without one: the trial
     would ask "which follows the instruction?" with no instruction on screen and
     record an answer that means nothing. Drop the case instead. */
  if (requirePrompt && !(typeof caseItem.prompt === "string" && caseItem.prompt.trim())) {
    return false;
  }
  return methods.every((m) => typeof videos[m] === "string" && videos[m]);
}

function casesOfBlock(data, block) {
  const methods = data.blocks[block].methods;
  const requirePrompt = Boolean(configOf(block).showPrompt);
  return data.cases.filter(
    (c) => c.block === block && isUsableCase(c, methods, requirePrompt)
  );
}

function countUsableCases(data) {
  return BLOCK_ORDER.reduce((n, block) => n + casesOfBlock(data, block).length, 0);
}

/* Covers the whole case list (ids, block tags, video paths, references,
   prompts) and both attention-check configs, not just the ids: editing a video
   path or a prompt while keeping the ids must also invalidate a saved session,
   because the serialised trials in the checkpoint embed those paths. */
function fingerprintManifest(m) {
  const body = JSON.stringify([m.blocks, m.cases]);
  return [STUDY_ID, m.version, m.cases.length, body.length, hash32(body)].join("|");
}

function renderManifestError(msg) {
  appEl.innerHTML = `
    <h2>Study Not Available</h2>
    <p>${escapeHtml(msg)}</p>
    <p class="notice">Expected file: <code>${escapeHtml(MANIFEST_PATH)}</code> next to this page.</p>
    <div class="controls">
      <button id="retry" class="secondary" type="button">Retry</button>
    </div>
  `;
  const retry = document.getElementById("retry");
  if (retry) {
    retry.addEventListener("click", () => boot());
  }
}

/* -------------------------------------------------------------------------
 * Participant id (persisted so a reload keeps the same identity)
 * ---------------------------------------------------------------------- */

function getOrCreateParticipantId() {
  const stored = safeStorageGet(STORAGE_KEY_PARTICIPANT);
  if (stored) {
    return stored;
  }
  const id = randomUuid();
  safeStorageSet(STORAGE_KEY_PARTICIPANT, id);
  return id;
}

/* -------------------------------------------------------------------------
 * Submission id (idempotency key)
 *
 * A POST can be persisted by the receiving script while its HTTP response is
 * lost on the way back (flaky network, the tab going away mid-flight, an
 * opaque CORS failure). The app cannot tell that apart from "the write never
 * happened", so it falls back to the local download and the participant may
 * retry - which would silently double-count them. A duplicated participant is
 * worse than a lost one: it corrupts the data with no signal that it did.
 *
 * So every submission carries a stable id, minted once at the first completion
 * and NEVER regenerated: any retry from this browser profile re-sends exactly
 * the same `submission_id`, and the receiving script ignores an id it has
 * already stored (see README section 5.1). Cached on `state` as well as in
 * localStorage so the id also stays stable within a session when storage is
 * unavailable (private browsing, full quota).
 * ---------------------------------------------------------------------- */

function getOrCreateSubmissionId() {
  if (state.submissionId) {
    return state.submissionId;
  }
  const stored = safeStorageGet(STORAGE_KEY_SUBMISSION);
  const id = stored || randomUuid();
  if (!stored) {
    safeStorageSet(STORAGE_KEY_SUBMISSION, id);
  }
  state.submissionId = id;
  return id;
}

function randomUuid() {
  if (window.crypto && typeof window.crypto.randomUUID === "function") {
    return window.crypto.randomUUID();
  }
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = Math.floor(Math.random() * 16);
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

/* -------------------------------------------------------------------------
 * Screens: intro / resume
 * ---------------------------------------------------------------------- */

function renderIntro() {
  state.phase = "intro";
  scrollToTop();
  const totalTrials = countUsableCases(state.manifest);
  appEl.innerHTML = `
    ${renderIntroBody(totalTrials)}
    <div class="controls">
      <button id="start-study" type="button">I agree to participate and begin the study</button>
    </div>
  `;
  document.getElementById("start-study").addEventListener("click", () => startStudy());
}

function renderResume(saved) {
  state.phase = "intro";
  scrollToTop();
  const answers = saved.answers || {};
  const done = Object.keys(answers).filter((k) => {
    const trial = saved.trials[Number(k)];
    return trial && isAnswerComplete(answers[k], questionsOf(trial.block));
  }).length;
  appEl.innerHTML = `
    <h2>Resume Previous Session</h2>
    <p>
      A saved session was found on this device. You reached question
      <strong>${saved.index + 1}</strong> of <strong>${saved.trials.length}</strong>
      and answered ${done} ${done === 1 ? "question" : "questions"}.
    </p>
    <p class="notice">
      Resuming will preserve your previous answers, question order, and A/B
      labelling. Starting over will discard them.
    </p>
    <div class="controls">
      <button id="resume" type="button">Resume</button>
      <button id="restart" class="secondary" type="button">Start Over</button>
    </div>
  `;
  document.getElementById("resume").addEventListener("click", () => {
    state.trials = saved.trials;
    state.index = saved.index;
    state.answers = saved.answers || {};
    state.meta = saved.meta || {};
    state.interstitialsSeen = Array.isArray(saved.interstitialsSeen)
      ? saved.interstitialsSeen.slice()
      : [];
    renderTrial();
  });
  document.getElementById("restart").addEventListener("click", () => {
    clearCheckpoint();
    renderIntro();
  });
}

/* -------------------------------------------------------------------------
 * Trial construction
 * ---------------------------------------------------------------------- */

function startStudy() {
  state.trials = buildTrials(state.manifest);
  state.answers = {};
  state.meta = {};
  state.interstitialsSeen = [];
  state.index = 0;
  if (state.trials.length === 0) {
    appEl.innerHTML = `
      <h2>No Questions Available</h2>
      <p class="notice">The manifest has no usable case.</p>
      <div class="controls"><button id="back" class="secondary" type="button">Back</button></div>
    `;
    document.getElementById("back").addEventListener("click", () => renderIntro());
    return;
  }
  saveCheckpoint();
  renderTrial();
}

/*
 * Trial order.
 *
 * Blocks run in the fixed BLOCK_ORDER and are NEVER interleaved. Within a block
 * the case order is shuffled per participant (Fisher-Yates), so that fatigue
 * and learning effects are not confounded with a fixed condition order. The
 * realised order is recorded in the payload as `trial_order`.
 *
 * Each block may declare its own attention check, fully generically - the
 * manifest may declare either
 *   (a) blocks.<b>.attention_check: {"case_id": "t03",
 *                                    "duplicate_method": "m1",   // optional
 *                                    "position": 4}              // optional
 *       in which case that case is pulled out of that block's pool and rendered
 *       with the SAME video in two positions (a participant who is paying
 *       attention must answer identically for both). `position` is 0-based and
 *       relative to ITS OWN block, or
 *   (b) a case carrying  "is_attention_check": true , which is used as-is and
 *       only flagged in the payload.
 * If a block declares neither, no attention-check trial is added there and
 * nothing breaks.
 */
function buildTrials(manifest) {
  let trials = [];
  BLOCK_ORDER.forEach((block) => {
    const methods = manifest.blocks[block].methods.slice();
    const usable = casesOfBlock(manifest, block);

    const spec = readAttentionSpec(manifest.blocks[block]);
    let attentionCase = null;
    let pool = usable;
    if (spec) {
      const found = usable.filter((c) => c.id === spec.case_id)[0];
      if (found) {
        attentionCase = found;
        pool = usable.filter((c) => c !== found);
      } else {
        console.warn(
          `blocks.${block}.attention_check.case_id "${spec.case_id}" is not a usable case of that block; skipping the attention check.`
        );
      }
    }

    const blockTrials = shuffleArray(pool.slice()).map((c) =>
      makeTrial(c, block, methods, Boolean(c.is_attention_check))
    );

    if (attentionCase) {
      const trial = makeAttentionTrial(attentionCase, block, methods, spec);
      const fallbackPos = Math.floor(blockTrials.length / 2);
      const wanted = Number.isInteger(spec.position) ? spec.position : fallbackPos;
      blockTrials.splice(clamp(wanted, 0, blockTrials.length), 0, trial);
    }
    trials = trials.concat(blockTrials);
  });
  return trials;
}

function readAttentionSpec(blockCfg) {
  const spec = blockCfg && blockCfg.attention_check;
  if (spec && typeof spec === "object" && typeof spec.case_id === "string" && spec.case_id) {
    return spec;
  }
  return null;
}

function makeTrial(caseItem, block, methods, isAttentionCheck) {
  const shown = shuffleArray(methods.slice());
  const cfg = BLOCK_CONFIG[block];
  return {
    caseId: caseItem.id,
    block: block,
    /* A prompt is only carried when the block actually shows one. A tracking
       case that somehow carries a `prompt` is ignored, by construction. */
    prompt:
      cfg.showPrompt && typeof caseItem.prompt === "string" ? caseItem.prompt : "",
    reference:
      cfg.showReference && typeof caseItem.reference === "string"
        ? caseItem.reference
        : "",
    slots: shown.map((m) => ({ method: m, src: caseItem.videos[m] })),
    isAttentionCheck: Boolean(isAttentionCheck)
  };
}

function makeAttentionTrial(caseItem, block, methods, spec) {
  const trial = makeTrial(caseItem, block, methods, true);
  const slots = trial.slots;
  if (slots.length < 2) {
    return trial;
  }
  let sourceIdx = 0;
  if (typeof spec.duplicate_method === "string") {
    const found = slots.map((s) => s.method).indexOf(spec.duplicate_method);
    if (found >= 0) {
      sourceIdx = found;
    } else {
      console.warn(
        `attention_check.duplicate_method "${spec.duplicate_method}" is not a method of block "${block}"; duplicating a random slot instead.`
      );
      sourceIdx = Math.floor(Math.random() * slots.length);
    }
  } else {
    sourceIdx = Math.floor(Math.random() * slots.length);
  }
  let targetIdx = Math.floor(Math.random() * (slots.length - 1));
  if (targetIdx >= sourceIdx) {
    targetIdx += 1;
  }
  slots[targetIdx] = { method: slots[sourceIdx].method, src: slots[sourceIdx].src };
  return trial;
}

/* -------------------------------------------------------------------------
 * Block helpers
 * ---------------------------------------------------------------------- */

function configOf(block) {
  return BLOCK_CONFIG[block] || BLOCK_CONFIG[BLOCK_ORDER[0]];
}

function questionsOf(block) {
  return configOf(block).questions;
}

function trialQuestions(index) {
  const trial = state.trials[index];
  return questionsOf(trial ? trial.block : BLOCK_ORDER[0]);
}

/* -------------------------------------------------------------------------
 * Interstitial between blocks
 * ---------------------------------------------------------------------- */

function needsInterstitial(fromIndex, toIndex) {
  const from = state.trials[fromIndex];
  const to = state.trials[toIndex];
  if (!to) {
    return false;
  }
  const crossing = !from || from.block !== to.block;
  if (!crossing) {
    return false;
  }
  if (state.interstitialsSeen.indexOf(to.block) >= 0) {
    return false;
  }
  return typeof INTERSTITIAL[to.block] === "function";
}

function renderInterstitial(toIndex) {
  state.phase = "interstitial";
  scrollToTop();
  const block = state.trials[toIndex].block;
  appEl.innerHTML = `
    <section class="interstitial">
      ${INTERSTITIAL[block]()}
    </section>
    <div class="controls">
      <button id="interstitial-continue" type="button">Continue to question ${
        toIndex + 1
      }</button>
    </div>
  `;
  const btn = document.getElementById("interstitial-continue");
  btn.addEventListener("click", () => {
    state.interstitialsSeen.push(block);
    state.index = toIndex;
    saveCheckpoint();
    renderTrial();
  });
  btn.focus();
  setStatus(
    `Participant ID: ${state.participantId} · ${configOf(block).part} starts next`,
    false
  );
}

/* -------------------------------------------------------------------------
 * Trial rendering
 * ---------------------------------------------------------------------- */

function renderTrial() {
  state.phase = "trial";
  scrollToTop();
  const trial = state.trials[state.index];
  const cfg = configOf(trial.block);
  const questions = questionsOf(trial.block);
  const answer = ensureAnswer(state.index);
  const meta = ensureMeta(state.index);
  const isFirstView = !meta.first_seen_iso;
  if (isFirstView) {
    meta.first_seen_iso = nowIso();
  }
  beginDwell(state.index);
  if (isFirstView) {
    /* Persist the stamp now: the navigation's own saveCheckpoint() ran before
       this render, so without this a reload would re-stamp first_seen_iso with
       a later time and hide the whole watch period. */
    saveCheckpoint();
  }
  state.focusedQuestion = questions[0].key;

  const choices = LABELS.slice(0, trial.slots.length).concat([NONE_VALUE]);
  const isLast = state.index === state.trials.length - 1;

  /* The letter badge is overlaid on the clip rather than sitting in a header
     row: it removes a row of chrome, keeps the video as the largest thing on
     screen, and makes "this badge belongs to this video" unarguable. It is
     drawn with the same .badge-face rule as an unselected answer chip. */
  const cards = trial.slots
    .map((slot, idx) => {
      const src = joinPath(VIDEO_BASE, slot.src);
      return `
      <div class="video-card">
        <span class="video-label badge-face" aria-hidden="true">${LABELS[idx]}</span>
        <video controls muted preload="metadata" playsinline autoplay loop
               aria-label="Video ${LABELS[idx]}">
          <source src="${escapeHtml(safeEncodePath(src))}" type="video/mp4">
          Your browser does not support MP4 playback.
        </video>
      </div>`;
    })
    .join("");

  const pct = (state.index / state.trials.length) * 100;

  appEl.innerHTML = `
    <div class="progress-bar"><span style="width:${pct}%"></span></div>
    <div class="progress-row">
      <span class="part-chip">${escapeHtml(cfg.part)}</span>
      <span class="progress-count">${state.index + 1} / ${state.trials.length}</span>
    </div>

    ${renderReferencePanel(trial, cfg)}

    ${renderPromptCallout(trial, cfg)}

    <div class="video-grid ${cfg.gridClass}">${cards}</div>

    ${cfg.trialNote ? `<p class="trial-note">${escapeHtml(cfg.trialNote)}</p>` : ""}

    ${questions.map((q) => renderQuestionBlock(q, choices, answer[q.key], cfg)).join("")}

    <div class="controls">
      <button id="prev" class="secondary" type="button" ${
        state.index === 0 ? "disabled" : ""
      }>Previous</button>
      <button id="next" type="button" ${isTrialComplete(state.index) ? "" : "disabled"}>${
        isLast ? "Submit" : "Next"
      }</button>
    </div>

    <p class="foot-note">
      <span class="kbd-hint">${LABELS.slice(0, trial.slots.length)
        .map((l, i) => `<kbd>${i + 1}</kbd>&nbsp;${l}`)
        .join(" ")} <kbd>0</kbd>&nbsp;${escapeHtml(
    cfg.noneLabel
  )} <kbd>Enter</kbd>&nbsp;next &middot; </span>Video labels are randomised on
      every question.
    </p>
  `;

  wireAnswerInputs(questions);
  wireNavButtons(isLast);
  wireReferenceFallback();
  playVisibleVideos();
  highlightFocusedQuestion();
  setStatus(
    `Participant ID: ${state.participantId} · Question ${state.index + 1} of ${
      state.trials.length
    }`,
    false
  );
}

/* The reference clip is deliberately NOT one of the lettered candidates: it is
   the ground truth both candidates are imitating. It is rendered above them, in
   its own panel, at single-card width so it reads at the same scale as A/B.

   The clips may not exist yet, so the panel must degrade rather than break. A
   plain `src` attribute is used instead of a <source> child on purpose: with a
   <source> child a 404 fires `error` on the <source>, not on the <video>, and
   the media element just sits in NETWORK_NO_SOURCE forever. With `src` the
   <video> itself fires `error`, which wireReferenceFallback() listens for. */
function renderReferencePanel(trial, cfg) {
  if (!cfg.showReference) {
    return "";
  }
  if (!trial.reference) {
    return renderReferenceMissing(cfg);
  }
  const src = joinPath(VIDEO_BASE, trial.reference);
  return `
    <section class="reference-panel" id="reference-panel">
      <span class="reference-badge">${escapeHtml(cfg.referenceBadge)}</span>
      <video id="reference-video" src="${escapeHtml(safeEncodePath(src))}"
             controls muted preload="metadata" playsinline autoplay loop></video>
    </section>
  `;
}

/* The one place a sentence is unavoidable: without it a participant faced with
   an empty slot has no way to know the question is unanswerable. Kept to a line. */
function renderReferenceMissing(cfg) {
  return `
    <section class="reference-panel reference-panel--missing" id="reference-panel">
      <span class="reference-badge">${escapeHtml(cfg.referenceBadge)}</span>
      <p class="reference-missing-text">
        Reference clip unavailable - please tell the study organiser.
      </p>
    </section>
  `;
}

/* A 404 (or a codec failure) on the reference must not leave a broken player on
   screen; swap the whole panel for the placeholder note. */
function wireReferenceFallback() {
  const video = document.getElementById("reference-video");
  if (!video) {
    return;
  }
  const trial = state.trials[state.index];
  const cfg = configOf(trial.block);
  /* A slow 404 can arrive after the participant has moved on. Resolve the panel
     from THIS video element and check it is still in the document, rather than
     querying #reference-panel document-wide - otherwise a stale failure from the
     previous trial replaces the current trial's perfectly good reference. */
  /* Captured now: a late event must record against the trial it belongs to. */
  const idx = state.index;
  const fail = () => {
    ensureMeta(idx).reference_ok = false;
    saveCheckpoint();
    const panel = video.closest(".reference-panel");
    if (panel && panel.isConnected) {
      panel.outerHTML = renderReferenceMissing(cfg);
    }
  };
  video.addEventListener("error", fail, { once: true });
  /* Safari can report a failed load as an empty, error-less media element. */
  video.addEventListener(
    "loadedmetadata",
    () => {
      if (!video.videoWidth) {
        fail();
        return;
      }
      ensureMeta(idx).reference_ok = true;
      saveCheckpoint();
    },
    { once: true }
  );
}

function renderPromptCallout(trial, cfg) {
  if (!cfg.showPrompt) {
    return "";
  }
  const hasPrompt = Boolean(trial.prompt && trial.prompt.trim());
  if (!hasPrompt) {
    return `
      <section class="prompt-callout prompt-callout--missing">
        <p class="prompt-text">(no instruction available for this question)</p>
      </section>
    `;
  }
  return `
    <section class="prompt-callout">
      <p class="prompt-text">&ldquo;${escapeHtml(trial.prompt.trim())}&rdquo;</p>
    </section>
  `;
}

/*
 * Answers are chips, but they are still REAL radio buttons: the <input> lives
 * inside its <label>, is only visually hidden, and keeps its native semantics,
 * focus order, arrow-key navigation and screen-reader announcement. A <fieldset>
 * with a <legend> plus radios sharing one `name` IS a radio group - no ARIA
 * needed. .chip-face is what is painted, and it is the same rule that paints the
 * letter badge on the video, which is the whole point - the mapping is visual,
 * not verbal.
 *
 * type="radio" (not checkbox) is what enforces one answer per question: the
 * browser releases the previous choice for us, and re-clicking the selected
 * option fires no `change`, so a participant cannot empty an answered question
 * by accident. Nothing in the app has to police it.
 *
 * The `name` is the question key, which is unique within a trial (the two
 * questions of a block never share a key) and only one trial is in the DOM at a
 * time - so the group is exactly this question's chips.
 *
 * Do not swap these for <button aria-pressed>: the rest of the app (keyboard
 * shortcuts, syncChoiceInputs, sanitiseSavedAnswers) drives `input.checked`.
 */
function renderQuestionBlock(question, choices, selected, cfg) {
  const selectedValues = normalizeAnswerList(selected);
  const options = choices
    .map((value) => {
      const isNone = value === NONE_VALUE;
      const checked = selectedValues.indexOf(value) >= 0 ? "checked" : "";
      const label = isNone ? cfg.noneLabel : value;
      return `
      <label class="chip${isNone ? " chip--none" : ""}">
        <input type="radio" name="${escapeHtml(question.key)}" value="${escapeHtml(
        value
      )}" ${checked}>
        <span class="chip-face badge-face">${escapeHtml(label)}</span>
      </label>`;
    })
    .join("");

  return `
    <fieldset class="fieldset" data-question="${escapeHtml(question.key)}">
      <legend>${escapeHtml(question.legend)}</legend>
      <div class="chip-row">${options}</div>
    </fieldset>
  `;
}

function wireAnswerInputs(questions) {
  questions.forEach((question) => {
    const inputs = appEl.querySelectorAll(`input[name="${question.key}"]`);
    Array.prototype.forEach.call(inputs, (input) => {
      /* A radio only fires `change` when it BECOMES checked, so the event
         target is always the new answer and there is nothing to un-apply. */
      input.addEventListener("change", (evt) => {
        applyChoice(question.key, evt.target.value);
      });
    });
  });

  const fieldsets = appEl.querySelectorAll("fieldset.fieldset");
  Array.prototype.forEach.call(fieldsets, (fs) => {
    fs.addEventListener("focusin", () => {
      state.focusedQuestion = fs.getAttribute("data-question");
      highlightFocusedQuestion();
    });
    fs.addEventListener("mousedown", () => {
      state.focusedQuestion = fs.getAttribute("data-question");
      highlightFocusedQuestion();
    });
  });
}

/* One answer per question. The stored value stays a single-element ARRAY, not a
   scalar: the payload shape `{"naturalness": ["A"]}` is what the Apps Script
   receiver and every already-collected row expect, and changing it would make
   the sheet inconsistent with itself. */
function applyChoice(questionKey, value) {
  const answer = ensureAnswer(state.index);
  answer[questionKey] = [value];
  syncChoiceInputs(questionKey, answer[questionKey]);

  /* Stamp WHEN the trial was answered, not only at submit. */
  const meta = ensureMeta(state.index);
  meta.answered_iso = nowIso();

  state.focusedQuestion = questionKey;
  highlightFocusedQuestion();
  syncNextButtonState();

  /* Checkpoint after every single answer. */
  commitDwell();
  beginDwell(state.index);
  saveCheckpoint();
}

function wireNavButtons(isLast) {
  document.getElementById("prev").addEventListener("click", () => {
    if (state.index === 0) {
      return;
    }
    commitDwell();
    state.index -= 1;
    saveCheckpoint();
    renderTrial();
  });

  document.getElementById("next").addEventListener("click", () => {
    goNext(isLast);
  });
}

async function goNext(isLast) {
  if (state.isSubmitting) {
    return;
  }
  if (!isTrialComplete(state.index)) {
    return;
  }
  commitDwell();
  if (isLast) {
    const nextBtn = document.getElementById("next");
    if (nextBtn) {
      nextBtn.disabled = true;
      nextBtn.textContent = "Submitting...";
    }
    await endStudy();
    return;
  }
  const toIndex = state.index + 1;
  if (needsInterstitial(state.index, toIndex)) {
    /* Leave state.index on the last trial of the finished block: a reload while
       the interstitial is on screen then resumes on a real, answered trial. */
    saveCheckpoint();
    renderInterstitial(toIndex);
    return;
  }
  state.index = toIndex;
  saveCheckpoint();
  renderTrial();
}

function syncNextButtonState() {
  const nextBtn = document.getElementById("next");
  if (nextBtn) {
    nextBtn.disabled = !isTrialComplete(state.index);
  }
}

/* EXACTLY one choice per question - not "at least one". The app can only ever
   store one, so the strict test costs nothing and refuses a hand-edited
   localStorage that claims two. */
function isAnswerComplete(answer, questions) {
  if (!answer) {
    return false;
  }
  return questions.every((q) => normalizeAnswerList(answer[q.key]).length === 1);
}

function isTrialComplete(index) {
  return isAnswerComplete(state.answers[index], trialQuestions(index));
}

function ensureAnswer(index) {
  let answer = state.answers[index];
  if (!answer) {
    answer = {};
    state.answers[index] = answer;
  }
  trialQuestions(index).forEach((q) => {
    answer[q.key] = normalizeAnswerList(answer[q.key]);
  });
  return answer;
}

function ensureMeta(index) {
  let meta = state.meta[index];
  if (!meta) {
    /* reference_ok starts false and is only set true once the clip has actually
       decoded - "absent" and "404" and "broken codec" must all read as false. */
    meta = { first_seen_iso: "", answered_iso: "", dwell_ms: 0, reference_ok: false };
    state.meta[index] = meta;
  }
  if (typeof meta.reference_ok !== "boolean") {
    meta.reference_ok = false;
  }
  if (typeof meta.dwell_ms !== "number") {
    meta.dwell_ms = 0;
  }
  return meta;
}

/* Autoplay is flaky: a play() issued in the same tick as the innerHTML swap is
   often aborted by the media load that follows it, and browsers defer autoplay
   entirely while the tab is hidden. So try immediately, again once the element
   has data, and again shortly after. */
function playVisibleVideos() {
  const videos = appEl.querySelectorAll("video");
  Array.prototype.forEach.call(videos, (video) => {
    const attempt = () => {
      const p = video.play();
      if (p && typeof p.catch === "function") {
        p.catch(() => {});
      }
    };
    attempt();
    video.addEventListener("canplay", attempt, { once: true });
    window.setTimeout(attempt, 300);
  });
}

function highlightFocusedQuestion() {
  const fieldsets = appEl.querySelectorAll("fieldset.fieldset");
  Array.prototype.forEach.call(fieldsets, (fs) => {
    const isFocused = fs.getAttribute("data-question") === state.focusedQuestion;
    fs.classList.toggle("is-focused", isFocused);
  });
}

/* -------------------------------------------------------------------------
 * Keyboard shortcuts
 * ---------------------------------------------------------------------- */

document.addEventListener("keydown", (evt) => {
  if (evt.metaKey || evt.ctrlKey || evt.altKey) {
    return;
  }
  if (evt.repeat) {
    /* Holding a key must not race through trials or flicker a selection. */
    return;
  }
  if (state.phase === "interstitial" && evt.key === "Enter") {
    const btn = document.getElementById("interstitial-continue");
    const tag = evt.target && evt.target.tagName ? evt.target.tagName.toLowerCase() : "";
    if (btn && tag !== "button") {
      evt.preventDefault();
      btn.click();
    }
    return;
  }
  if (state.phase !== "trial") {
    return;
  }
  if (!state.trials.length || !state.trials[state.index]) {
    return;
  }
  const target = evt.target;
  const tag = target && target.tagName ? target.tagName.toLowerCase() : "";

  if (evt.key === "Enter") {
    /* Let a focused button handle its own Enter (otherwise we advance twice),
       and let a focused video keep Enter as its play/pause control. */
    if (tag === "button" || tag === "video") {
      return;
    }
    const nextBtn = document.getElementById("next");
    if (nextBtn && !nextBtn.disabled) {
      evt.preventDefault();
      goNext(state.index === state.trials.length - 1);
    }
    return;
  }

  const slotCount = state.trials[state.index].slots.length;
  let value = null;
  if (evt.key === "0") {
    value = NONE_VALUE;
  } else {
    const n = parseInt(evt.key, 10);
    if (n >= 1 && n <= slotCount) {
      value = LABELS[n - 1];
    }
  }
  if (!value) {
    return;
  }
  const questions = trialQuestions(state.index);
  const known = questions.map((q) => q.key).indexOf(state.focusedQuestion) >= 0;
  const questionKey = known ? state.focusedQuestion : questions[0].key;
  evt.preventDefault();
  /* Selects, never toggles: pressing the same number twice leaves the answer in
     place, exactly as clicking the selected chip twice does. */
  applyChoice(questionKey, value);
});

/* -------------------------------------------------------------------------
 * Dwell accounting (paused while the tab is hidden)
 * ---------------------------------------------------------------------- */

function beginDwell(index) {
  state.dwell.index = index;
  /* Do not count time while the tab is in the background. `performance.now()`
     rather than `Date.now()` so an NTP step or a manual clock change cannot
     inflate or silently discard a segment. */
  state.dwell.since = document.hidden ? null : performance.now();
}

function commitDwell() {
  if (state.dwell.index === null || state.dwell.since === null) {
    return;
  }
  const meta = ensureMeta(state.dwell.index);
  meta.dwell_ms += Math.max(0, performance.now() - state.dwell.since);
  state.dwell.since = null;
}

document.addEventListener("visibilitychange", () => {
  if (document.hidden) {
    commitDwell();
    saveCheckpoint();
  } else if (state.phase === "trial" && state.dwell.index !== null) {
    beginDwell(state.dwell.index);
    playVisibleVideos();
  }
});

/* A close, a reload or a swipe-back never fires `visibilitychange` reliably, so
   the segment being timed right now would otherwise be lost. `pagehide` is the
   one event that fires in all of those cases, including bfcache eviction. */
window.addEventListener("pagehide", () => {
  commitDwell();
  saveCheckpoint();
});

/* The mirror image of `pagehide`: coming back from bfcache fires `pageshow` and
   often no visibilitychange at all, so without this the dwell clock stays
   stopped until the participant happens to change an answer. */
window.addEventListener("pageshow", () => {
  if (state.phase === "trial" && state.dwell.index !== null && !document.hidden) {
    beginDwell(state.dwell.index);
    playVisibleVideos();
  }
});

/* -------------------------------------------------------------------------
 * Checkpointing
 * ---------------------------------------------------------------------- */

function saveCheckpoint() {
  if (state.phase === "complete") {
    return;
  }
  /* The resume screen does NOT hydrate `state` until Resume is clicked, so a
     reload, a background or a close while it is on screen used to write an
     empty trial list straight over a perfectly good saved session - which the
     next load then rejected and cleared. Never persist a session that has no
     trials; there is nothing in it worth saving and everything to lose. */
  if (!Array.isArray(state.trials) || state.trials.length === 0) {
    return;
  }
  const payload = {
    schema: PROGRESS_SCHEMA,
    fingerprint: state.fingerprint,
    participant_id: state.participantId,
    index: state.index,
    trials: state.trials,
    answers: state.answers,
    meta: state.meta,
    interstitialsSeen: state.interstitialsSeen
  };
  safeStorageSet(STORAGE_KEY_PROGRESS, JSON.stringify(payload));
}

function loadCheckpoint() {
  const raw = safeStorageGet(STORAGE_KEY_PROGRESS);
  if (!raw) {
    return null;
  }
  let saved = null;
  try {
    saved = JSON.parse(raw);
  } catch (err) {
    clearCheckpoint();
    return null;
  }
  if (!saved || saved.schema !== PROGRESS_SCHEMA) {
    clearCheckpoint();
    return null;
  }
  if (saved.fingerprint !== state.fingerprint) {
    /* The manifest changed under the participant; the saved order is stale. */
    clearCheckpoint();
    return null;
  }
  if (saved.participant_id !== state.participantId) {
    /* A different participant on the same device: do not offer them this one. */
    clearCheckpoint();
    return null;
  }
  if (!Array.isArray(saved.trials) || saved.trials.length === 0) {
    clearCheckpoint();
    return null;
  }
  if (
    !Number.isInteger(saved.index) ||
    saved.index < 0 ||
    saved.index >= saved.trials.length
  ) {
    clearCheckpoint();
    return null;
  }
  const trialsLookSane = saved.trials.every(
    (t) =>
      t &&
      typeof t.caseId === "string" &&
      BLOCK_ORDER.indexOf(t.block) >= 0 &&
      Array.isArray(t.slots) &&
      t.slots.length > 0 &&
      t.slots.every((sl) => sl && typeof sl.method === "string" && typeof sl.src === "string")
  );
  if (!trialsLookSane) {
    clearCheckpoint();
    return null;
  }
  saved.answers = sanitiseSavedAnswers(saved.answers, saved.trials);
  return saved;
}

/* localStorage is user-writable, so treat a restored answer as untrusted: keep
   only choices that actually exist on that trial, only the question keys that
   trial's block actually asks, and at most ONE of them. Anything else would
   render as a "complete" trial with no chip selected, or as a radio group with
   two selections, which the DOM cannot show. */
function sanitiseSavedAnswers(answers, trials) {
  const clean = {};
  if (!answers || typeof answers !== "object") {
    return clean;
  }
  Object.keys(answers).forEach((key) => {
    const idx = Number(key);
    if (!Number.isInteger(idx) || idx < 0 || idx >= trials.length) {
      return;
    }
    const allowed = LABELS.slice(0, trials[idx].slots.length).concat([NONE_VALUE]);
    const entry = answers[key] || {};
    const kept = {};
    questionsOf(trials[idx].block).forEach((q) => {
      const values = normalizeAnswerList(entry[q.key]).filter(
        (v) => allowed.indexOf(v) >= 0
      );
      kept[q.key] = values.length ? [values[0]] : [];
    });
    clean[idx] = kept;
  });
  return clean;
}

function clearCheckpoint() {
  safeStorageRemove(STORAGE_KEY_PROGRESS);
}

/* -------------------------------------------------------------------------
 * Completion / submission
 * ---------------------------------------------------------------------- */

async function endStudy() {
  if (state.isSubmitting) {
    return;
  }
  state.isSubmitting = true;
  state.phase = "complete";
  const payload = buildPayload();
  state.lastPayload = payload;

  let postResult = null;
  let downloaded = false;
  try {
    if (SUBMIT_ENDPOINT.trim()) {
      postResult = await trySubmitOnline(payload);
    }
    if (!postResult || !postResult.ok) {
      /* If the download itself throws, `downloaded` must stay false or the
         completion screen claims a local copy exists when it does not. */
      downloadJson(payload, payloadFilename());
      downloaded = true;
    }
  } catch (err) {
    /* Never strand a participant on a dead "Submitting..." button: fall through
       to the completion screen, which shows what did and did not happen. */
    postResult = {
      ok: false,
      message: err && err.message ? err.message : "Unexpected error while saving."
    };
  }

  /* Only drop the checkpoint once the responses are safely somewhere; if both
     the upload and the download failed, keep it so a reload can retry. */
  if ((postResult && postResult.ok) || downloaded) {
    clearCheckpoint();
  }
  state.isSubmitting = false;
  renderComplete(postResult, downloaded);
}

function buildPayload() {
  const responses = state.trials.map((trial, idx) => {
    const answer = ensureAnswer(idx);
    const meta = ensureMeta(idx);
    const labelToMethod = {};
    trial.slots.forEach((slot, i) => {
      labelToMethod[LABELS[i]] = slot.method;
    });

    const answers = {};
    const answersMethods = {};
    questionsOf(trial.block).forEach((q) => {
      const values = normalizeAnswerList(answer[q.key]);
      answers[q.key] = values;
      answersMethods[q.key] = values.map((v) =>
        v === NONE_VALUE ? NONE_VALUE : labelToMethod[v] || v
      );
    });

    const response = {
      case_id: trial.caseId,
      /* REQUIRED at analysis time: method ids are scoped to their block, so an
         `m1` from one block must never be pooled with an `m1` from the other. */
      block: trial.block,
      shown_order: trial.slots.map((s) => s.method),
      answers: answers,
      answers_methods: answersMethods,
      first_seen_iso: meta.first_seen_iso || "",
      answered_iso: meta.answered_iso || "",
      dwell_ms: Math.round(meta.dwell_ms || 0),
      is_attention_check: Boolean(trial.isAttentionCheck)
    };

    /* Only on blocks that are supposed to show a reference. False means the
       participant answered the "follows the reference" question with no
       reference on screen - those responses must be dropped, and without this
       flag there is no way to find them after the fact. */
    if (configOf(trial.block).showReference) {
      response.reference_available = Boolean(meta.reference_ok);
    }
    return response;
  });

  return {
    /* Idempotency key - stable across retries; the receiver dedupes on it. */
    submission_id: getOrCreateSubmissionId(),
    participant_id: state.participantId,
    study: STUDY_ID,
    block_order: BLOCK_ORDER.slice(),
    completed_at_iso: nowIso(),
    user_agent: navigator.userAgent,
    trial_order: state.trials.map((t) => t.caseId),
    responses: responses
  };
}

async function trySubmitOnline(payload) {
  try {
    /* CRITICAL: no `headers` here on purpose. A string body defaults to
       text/plain, a CORS-safelisted content type, so the browser sends no
       preflight. Google Apps Script cannot answer a preflight OPTIONS
       request, so adding a Content-Type header silently breaks submission. */
    /* Without this a server that accepts the connection and never answers
       leaves the participant on a dead "Submitting..." button forever - neither
       success nor the local-download fallback ever runs. */
    const controller =
      typeof AbortController === "function" ? new AbortController() : null;
    const timer = controller
      ? window.setTimeout(() => controller.abort(), SUBMIT_TIMEOUT_MS)
      : null;
    let res;
    try {
      res = await fetch(SUBMIT_ENDPOINT, {
        method: "POST",
        body: JSON.stringify(payload),
        signal: controller ? controller.signal : undefined
      });
    } finally {
      if (timer !== null) {
        window.clearTimeout(timer);
      }
    }
    if (!res.ok) {
      return { ok: false, message: `Server returned status ${res.status}.` };
    }
    /* A 200 is NOT proof of success. An unauthenticated or misdeployed Apps
       Script endpoint answers with 200 and an HTML sign-in page; trusting the
       status alone would report success and clear the checkpoint, silently
       losing the participant's responses. Require a JSON body, and treat an
       explicit ok:false as a failure. Any receiver that returns valid JSON
       without an `ok` field is still accepted, so this does not over-constrain
       a custom endpoint - it only rejects the HTML-error-page case. */
    let body = "";
    try {
      body = await res.text();
    } catch (err) {
      return { ok: false, message: "Server response could not be read." };
    }
    let parsed = null;
    try {
      parsed = JSON.parse(body);
    } catch (err) {
      return {
        ok: false,
        message:
          "Server returned a non-JSON response (the endpoint may require" +
          " sign-in or be misconfigured)."
      };
    }
    if (parsed && parsed.ok === false) {
      const detail = parsed.error ? ` (${String(parsed.error)})` : "";
      return { ok: false, message: `Server rejected the submission${detail}.` };
    }
    return { ok: true, message: "Submission uploaded successfully." };
  } catch (err) {
    return {
      ok: false,
      message: err && err.message ? err.message : "Upload was blocked by a network error."
    };
  }
}

function renderComplete(postResult, downloaded) {
  scrollToTop();
  const completionCode = state.participantId.replace(/-/g, "").slice(0, 8).toUpperCase();

  /* Kept short. The only thing beyond "thank you + code" that survives is the
     status line, and it is not decoration: in offline mode the participant has
     to know a file was downloaded and that they must send it back, and on a
     failure they have to know their answers are NOT saved yet. */
  let message = "Thank you for taking part. Your answers have been saved to a file on this device.";
  if (postResult && postResult.ok) {
    message = "Thank you for taking part. Your answers have been recorded.";
  } else if (!downloaded) {
    message =
      "Your responses could not be saved. Please keep this page open and reload "
      + "it to resume the study and retry the submission.";
  }

  const fallbackNote =
    postResult && !postResult.ok
      ? `<p class="notice">Online submission failed (${escapeHtml(
          postResult.message
        )}); a local copy was saved instead.</p>`
      : "";

  /* An anchor click gives no success signal, so a blocked download would leave
     the participant believing their work was saved. Offer an explicit retry. */
  const downloadNote = downloaded
    ? `<p class="notice">Please send the file to the study organiser. If the download did not start, save your responses again.</p>
       <div class="controls">
         <button id="redownload" class="secondary" type="button">Save My Responses Again</button>
       </div>`
    : "";

  appEl.innerHTML = `
    <h2>Study Complete</h2>
    <p>${escapeHtml(message)}</p>
    ${fallbackNote}
    ${downloadNote}
    <p>Your completion code:</p>
    <div class="completion-code">${escapeHtml(completionCode)}</div>
  `;
  const again = document.getElementById("redownload");
  if (again) {
    again.addEventListener("click", () => {
      if (state.lastPayload) {
        downloadJson(state.lastPayload, payloadFilename());
      }
    });
  }
  setStatus(`Participant ID: ${state.participantId} · Complete`, false);
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
  /* Revoking in the same tick can cancel the download before it starts; the
     anchor click gives no completion signal, so just hold the URL for a while. */
  window.setTimeout(() => URL.revokeObjectURL(url), 60000);
}

function payloadFilename() {
  return `${STUDY_ID}_${state.participantId.slice(0, 8)}.json`;
}

/* -------------------------------------------------------------------------
 * Helpers
 * ---------------------------------------------------------------------- */

function setStatus(text, isError) {
  statusEl.textContent = text;
  statusEl.className = isError ? "status error" : "status";
}

function scrollToTop() {
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function nowIso() {
  return new Date().toISOString();
}

function clamp(v, lo, hi) {
  return Math.min(hi, Math.max(lo, v));
}

/* encodeURI() throws on a lone surrogate; a single bad manifest path must not
   take the entire trial down with it. */
function safeEncodePath(src) {
  try {
    return encodeURI(src);
  } catch (err) {
    return String(src);
  }
}

function joinPath(base, rel) {
  if (!base) {
    return rel;
  }
  const b = base.replace(/\/+$/, "");
  const r = String(rel).replace(/^\/+/, "");
  return `${b}/${r}`;
}

function normalizeAnswerList(value) {
  if (Array.isArray(value)) {
    return value.slice();
  }
  if (!value) {
    return [];
  }
  return [value];
}

function syncChoiceInputs(name, selectedValues) {
  const selected = normalizeAnswerList(selectedValues);
  const inputs = appEl.querySelectorAll(`input[name="${name}"]`);
  let checkedInput = null;
  Array.prototype.forEach.call(inputs, (input) => {
    input.checked = selected.indexOf(input.value) >= 0;
    if (input.checked) {
      checkedInput = input;
    }
  });
  /* A number-key shortcut changes the answer without moving focus, which in a
     radio group would leave the focused chip unchecked while another is
     selected - a state the participant cannot then arrow out of predictably, and
     one a screen reader reads as "not checked". Only re-point focus when it was
     already inside THIS group, so a keystroke can never steal it from a video
     or the Next button. */
  if (
    checkedInput &&
    document.activeElement !== checkedInput &&
    Array.prototype.indexOf.call(inputs, document.activeElement) >= 0
  ) {
    checkedInput.focus();
  }
}

function shuffleArray(arr) {
  for (let i = arr.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    const tmp = arr[i];
    arr[i] = arr[j];
    arr[j] = tmp;
  }
  return arr;
}

function hash32(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i += 1) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0).toString(16);
}

function safeStorageGet(key) {
  try {
    return window.localStorage.getItem(key);
  } catch (err) {
    return null;
  }
}

function safeStorageSet(key, value) {
  try {
    window.localStorage.setItem(key, value);
  } catch (err) {
    /* Private-browsing or a full quota: the study still works, just without
       a resumable checkpoint. */
  }
}

function safeStorageRemove(key) {
  try {
    window.localStorage.removeItem(key);
  } catch (err) {
    /* no-op */
  }
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
