# Human-Object Interaction Video Study (static site)

**One** perceptual user study, 30 questions, one continuous session, built as
plain HTML + CSS + vanilla ES2017. **Zero dependencies, no build step, no
server-side code.** The whole folder can be dropped onto any static host
(GitHub Pages, S3, a lab web server) and served as-is.

```
site/
  index.html                 # the study - the ONLY entry point
  style.css
  app.js
  manifest.json              # merged v2 manifest, 30 cases, block-tagged
  README.md                  # this file (maintainer doc - do not deploy)
  videos/
    tracking/m1/t01..t10.mp4         # candidates: Isaac sim rollout renders
    tracking/m2/t01..t10.mp4
    tracking/ref/t01..t10.mp4        # mocap references (SMPL-X mesh render)
    generation/m1..m4/g01..g20.mp4
```

There is no hub and no way to pick a study: every participant does all 30
questions. The question count, the case ids, the prompts, the block
composition and the page heading all come from `manifest.json`, so regenerating
the assets never requires a code change - re-run `tools/install_manifests.py`
and reload.

The layout and visual design follow `neu-vi.github.io/user-study/`
(`force_user_study/` and `force_ablation_user_study/`): same `app-shell` width,
same card styling, same `index.html` / `style.css` / `app.js` / `manifest.json`
contract, same single-page intro / trial / complete flow.

---

## 1. The two blocks

The session runs in two blocks. **They are never interleaved**: all 10 tracking
questions come first, then all 20 generation questions. The case order is
shuffled per participant **within** a block only, so a participant can never see
a Part-2 question before finishing Part 1. The block order is hard-coded as
`BLOCK_ORDER` in `app.js` *and* in `tools/install_manifests.py` - deliberately in
both places, so a manifest edit cannot silently reorder them.

Progress reads `Question 1/30` ... `Question 30/30` across the whole session, and
a chip above each question says which part it belongs to.

### Part 1 (questions 1-10) - block `tracking`

Two methods reproduce the *same* reference human-object interaction in a physics
simulator. Top to bottom the trial shows:

1. a **reference clip** (the mocap motion both methods are imitating), in its own
   purple-accented panel, at single-card width, **not lettered and not judged**;
2. the two candidate videos side by side (`two-grid`), labelled A and B;
3. the freeze note;
4. the two questions.

| key | question | what it probes |
| --- | --- | --- |
| `tracking_accuracy` | Tracking accuracy | Which video more closely reproduces the reference motion above? |
| `naturalness` | Motion naturalness | Smooth, human-like body motion |

**No text prompt is shown in this block and there is no text-adherence
question.** The tracking cases in the manifest carry no `prompt` field at all,
and if one ever appeared the app would ignore it (`BLOCK_CONFIG.tracking.showPrompt
= false`, enforced in `makeTrial`).

Some Part-1 clips are padded by holding their last frame, which on a fallen
character reads as a freeze. That is disclosed rather than hidden: this sentence
appears on the consent screen **and** as a persistent note on every Part-1 trial
(`BLOCK_CONFIG.tracking.trialNote`):

> Some videos may freeze partway through. This happens when the character stops
> moving or falls; judge each video on what happens up to that point.

Part 2 does not carry the note - every generation clip is exactly 10 s.

### Part 2 (questions 11-30) - block `generation`

Four methods are each given the *same written instruction*. The participant sees
the **text prompt in a callout box directly above a 2x2 grid** (`four-grid`) of
the four results.

| key | question | what it probes |
| --- | --- | --- |
| `text_adherence` | Text adherence | Does the person perform the action described by the prompt? |
| `naturalness` | Motion naturalness | Smooth, human-like body motion |

The text is the conditioning signal here, so it gets a loud, distinct callout
rather than being buried in body copy.

### Attention check

Part 2 carries one attention-check trial (`blocks.generation.attention_check`),
which shows the same video in two positions and is flagged `is_attention_check`
in the payload. **Part 1 deliberately carries none**: with only 10 comparisons,
spending one on a check would cost 10% of that block's data, and the Part-2
check already screens the participant for the session. Note this also leaves
both of Part 1's baseline-failure cases in the comparison pool.

### The interstitial

Between question 10 and question 11 a one-off screen explains that the task
changes: no more reference video, four videos instead of two, and the first
criterion becomes text adherence. It appears **exactly once**. Going *Previous*
from question 11 back to 10 and forward again does not show it a second time
(`state.interstitialsSeen`, which is part of the checkpoint).

Budget: about 12 minutes for all 30 questions. The study states up front that
participation is anonymous, that no personal information is collected, and that
responses are used solely for research.

---

## 2. Method ids are scoped to their block

`m1` in the `tracking` block and `m1` in the `generation` block are **different
methods**. There are two independent id spaces, declared separately under
`blocks.<name>.methods`.

Every response in the payload therefore carries a `block` field, and **nothing
may be pooled across blocks without joining on it**. The decode key
(`KEY_DO_NOT_DEPLOY.json`, parent folder) likewise keeps one
`method_id_to_real_method` table per block.

---

## 3. Anonymity (read this before touching the manifest)

The manifest is **deliberately anonymised**. Method ids are opaque (`m1`...`m4`),
case ids are opaque and block-prefixed (`t01`...`t10`, `g01`...`g20`), and video
files are named `videos/<block>/<method>/<case>.mp4`. The real mapping lives in
`KEY_DO_NOT_DEPLOY.json` in the parent run folder.

- **Never copy `KEY_DO_NOT_DEPLOY.json` into `site/`.** The app never fetches,
  references or links it. `tools/install_manifests.py` fails loudly if it ever
  turns up inside `site/`.
- No real method name may appear in any deployed HTML/CSS/JS/JSON. Before
  deploying, grep this folder for the real method names and confirm it prints
  nothing. The names themselves are deliberately not written down here - this
  file ships publicly alongside the study. They are listed in the maintainer
  copy of this README and in the decode key, both of which stay in the research
  repo.

  This deployed copy of the README has been scrubbed of the method names, so it
  is safe to ship. The unscrubbed maintainer version lives in the research repo.
- Only Part-2 cases carry a `prompt`, and the OMOMO caption names the object
  ("Lift the suitcase, ..."). That is unavoidable - the text *is* the
  conditioning - and it leaks nothing about method identity, because all four
  arms of a case share one prompt. Part-1 cases carry no prompt at all.
- Every clip inside a block is padded to the **same byte size** (563,077 B for
  `tracking`, 737,075 B for `generation`) so that `Content-Length` cannot rank
  the arms. `install_manifests.py` copies with sha256 verification and re-checks
  that there is exactly one distinct size per block. If it ever reports more than
  one, the side channel is open again - do not deploy.
- On screen the videos carry only positional labels `A`/`B`(/`C`/`D`), and the
  label-to-method assignment is **re-shuffled on every trial**, so a label never
  means the same method twice. A visible disclaimer says so on every trial. The
  reference clip is not lettered and is not part of that assignment.
- The payload records both the participant-visible answer (`answers`, in labels)
  and the de-anonymised answer (`answers_methods`, in `m*` ids), so no join
  against the shuffle is needed at analysis time.

---

## 4. Run it locally

```bash
cd site
python3 -m http.server 8000
# then open http://localhost:8000/
```

> **Note on `python3 -m http.server`:** it does not implement HTTP `Range`
> requests, so `<video>` elements are reported as non-seekable and the scrub bar
> does nothing. That is a limitation of the dev server only - GitHub Pages (and
> any real static host) serves ranges, so seeking works in production. Do not
> chase this as a video-encoding bug.

Opening `index.html` straight off the filesystem (`file://`) will not work: the
`fetch()` of `manifest.json` is blocked by CORS. The app detects this and says so.

---

## 5. Deploy to GitHub Pages

The target layout mirrors `neu-vi.github.io`: one folder inside a Pages repo.

```bash
# 1. clone the Pages repo (or your own <user>.github.io)
git clone git@github.com:<org>/<org>.github.io.git
cd <org>.github.io

# 2. make sure the manifest and videos in site/ are current, and that every
#    manifest path is site-relative and exists on disk
python3 /path/to/experiments/2026-08-30_user-study-website/tools/install_manifests.py

# 3. copy the site in. site/videos/ holds real files, so a plain copy is enough.
#    --exclude README.md keeps the maintainer doc (and its guard command) out.
mkdir -p user-study/hoi
rsync -av --delete --exclude 'README.md' \
  /path/to/experiments/2026-08-30_user-study-website/site/ \
  user-study/hoi/

# 4. anonymity guard - must print nothing
grep -rniwE '<method>|<method>|<method>|<method>|<method>|final' user-study/hoi \
  --include='*.html' --include='*.css' --include='*.js' --include='*.json'
test ! -e user-study/hoi/KEY_DO_NOT_DEPLOY.json && echo "key file absent - good"

# 5. publish
git add user-study/hoi
git commit -m "Add HOI perceptual user study"
git push origin master        # or main, depending on the Pages repo
```

Live URL: `https://<org>.github.io/user-study/hoi/` - that is the only link a
participant needs.

`tools/install_manifests.py --check` re-audits the paths without changing
anything.

Notes:

- Pages serves `Range` requests, so video seeking works; no extra config needed.
- Every page carries `<meta name="robots" content="noindex">`.
- Total video payload is about 69 MB (17 MB tracking over 30 files including the
  10 references, 52 MB generation over 80); the code itself is under 150 KB.
  Byte-size equalisation (Section 3) is why the total is larger than the raw
  encode - the tracking block pads to its largest clip, and the sim-rendered
  candidates are several times the size of a mesh reference at the same crf.

---

## 6. The reference clips (Part 1)

All ten are present at `site/videos/tracking/ref/t01.mp4` ... `t10.mp4`.

They are **SMPL-X full-body mesh** renders of the `data_retargeted` mocap,
produced on the LAN Ubuntu box (`experiments/2026-09-01_study1-mesh-renders/`).

**The two candidate clips in the same trial are NOT mesh renders, by design.**
They are the original Isaac Lab **sim rollouts** - the capsule humanoid on the
reflective grid floor, with the pelvis-welded camera - web-encoded straight from
`experiments/2026-08-16_tracking-vs-<method>/renders-pairs/<NN>_<stem>/`.
So within one Part-1 trial the reference and the two candidates deliberately
**look different**: different body representation, different background,
different camera solve, and the mesh figure sits smaller in the frame.

That is the intended arrangement, and it matches the tracker teaser
(`experiments/2026-07-10_tracker-teaser-figure/review-renders/renders_3way/<stem>/`,
where `mocap.mp4` is the pyrender mesh and the two policy panels are `play.py`
sim renders). The reason is not cosmetic: the candidates are **physics
rollouts**, and fitting a mesh to their joint transforms would show participants
a surface that the simulator never computed. The 2026-09-01 mesh fit measurably
introduced contact artefacts that are not in the sim - its own validation log
reports hand vertices a few mm to ~6 cm *inside* the object on grasp frames,
because the physics ran on capsule collision geometry and the SMPL-X hand
surface is fatter than the capsules it replaces. A brief 2026-09-01 delivery did
re-render the candidates through the mesh path "so all three videos share one
look"; it was reverted for exactly that reason. Do not re-introduce it.

Part 2 is sim-rendered throughout, and its four arms match each other - which is
what matters, because participants only ever compare within a trial.

`data_retargeted` was chosen over `data_handcorrect` because handcorrect deviates
20-34 mm per bone for sub10/sub15, and posing that on the canonical body breaks
hand-object contact. Disclose in the paper that the reference shown is the
retargeted mocap our tracker was trained on; the baseline was trained on the
unretargeted source, which differs by ~1.8 deg mean per joint.

**Robustness (retained):** the manifest declares `"reference"` on all 10 Part-1
cases, and if a file ever 404s the app swaps that panel for a placeholder rather
than throwing. The reference `<video>` uses a plain `src` attribute, not a
`<source>` child - with a `<source>` child a 404 fires `error` on the child and
the element sits in `NETWORK_NO_SOURCE` forever, so the fallback would never run.

**To replace them:** drop new files at `<run>/videos/tracking/ref/<id>.mp4` and
re-run `python3 tools/install_manifests.py`; it prints
`tracking references: N/10 present` and never deletes that directory. The ids are
the join - `tNN.mp4` must be the reference for the same case as
`videos/tracking/m1/tNN.mp4`. The key file lists the real stem behind each `tNN`.


## 7. Collecting responses (Google Apps Script)

Out of the box `SUBMIT_ENDPOINT` is `""` in `app.js`, which is **offline mode**:
at the end of the study the responses are downloaded to the participant's device
as a JSON file and the participant is asked to send it back. For a real run you
want an endpoint.

### 7.1 Create the web app

1. Create a Google Sheet. `Extensions -> Apps Script`.
2. Replace `Code.gs` with:

   ```javascript
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
   ```

   **The `block` column is mandatory.** Without it the sheet pools two different
   `m1`s (Section 2) and the analysis is silently wrong.

   (If you prefer one row per participant, append `JSON.stringify(data)` into a
   single cell instead - but the flat, one-row-per-trial form above is much
   easier to analyse. Keep the `submission_id` dedupe either way.)

   Script properties hold 500 KB in total and up to 9 KB per value, which is
   ample for one short timestamp per submission; if you run enough participants
   to worry about it, delete the `submission_*` properties between studies, or
   dedupe by scanning the sheet's `submission_id` column instead - in which case
   check for a *complete* prior submission (all `trial_index` values present),
   because one matching row may be the prefix of a half-written retry.

3. `Deploy -> New deployment -> Web app`.
   - *Execute as*: **Me**
   - *Who has access*: **Anyone**  <- this is mandatory. With "Anyone with a
     Google account" the participant is bounced to a login page and the POST
     fails.
4. Copy the `https://script.google.com/macros/s/.../exec` URL.

### 7.2 Paste it in

Set the constant at the top of `app.js`:

```javascript
const SUBMIT_ENDPOINT = "https://script.google.com/macros/s/.../exec";
```

### 7.3 The one thing that silently breaks submission

**Do not add a `Content-Type` header to the submit `fetch`.**

```javascript
// correct - no headers at all
await fetch(SUBMIT_ENDPOINT, { method: "POST", body: JSON.stringify(payload) });
```

A string body defaults to `text/plain;charset=UTF-8`, which is a CORS-*safelisted*
content type, so the browser sends the POST directly with no preflight. The
moment you add `headers: {"Content-Type": "application/json"}` the request stops
being simple, the browser fires a preflight `OPTIONS`, Apps Script cannot answer
an `OPTIONS` request, and every submission fails - usually silently, because the
app falls back to the local download. `e.postData.contents` is the raw string
either way, so `JSON.parse` works unchanged. This is commented in `app.js`; keep
the comment.

If the POST fails for any reason the app automatically falls back to the local
JSON download. That covers almost everything, but it is not a guarantee: the
anchor-based download reports no success signal, so a download the browser
blocks still looks "saved" to the app (the completion screen offers a *Save my
responses again* button for exactly that case).

**The client requires a 2xx AND a JSON response body.** A 200 is not proof of
success on its own: a login-gated or misdeployed Apps Script endpoint answers
with `200` and an HTML sign-in page, and trusting the status alone would report
success, clear the checkpoint, and silently lose the participant's responses.
So `trySubmitOnline` reads the body and requires it to parse as JSON; a
non-JSON response is treated as a failure and the local download fallback runs.

What this means for your receiver:

- Always return JSON, including on error - `return ContentService.createTextOutput(JSON.stringify({...})).setMimeType(ContentService.MimeType.JSON);`
- An explicit `{"ok": false, "error": "..."}` is reported to the participant as a
  rejected submission and the fallback runs. The `error` string is surfaced in
  the message, so keep it short and non-sensitive.
- Valid JSON *without* an `ok` field is still accepted as success, so a custom
  receiver that returns e.g. `{"status":"stored"}` keeps working.
- *Who has access: Anyone* remains mandatory (Section 7.1) - but a login-gated
  deployment now fails loudly and keeps the data, instead of reading as a
  stream of successes.

---

## 8. Response payload

One JSON object per completed participant. A real 30-trial sample is checked in
at `../verification/payload_sample_merged_30trials.json`.

```json
{
  "submission_id": "b4c1e0d2-7f3a-4a0e-9c55-2d18a2f6b7e1",
  "participant_id": "3a589dd5-4a92-4611-8044-c989fc929134",
  "study": "hoi_study",
  "block_order": ["tracking", "generation"],
  "completed_at_iso": "2026-08-31T05:22:30.158Z",
  "user_agent": "...",
  "trial_order": ["t04", "t06", "...", "g18"],
  "responses": [
    {
      "case_id": "t04",
      "block": "tracking",
      "shown_order": ["m2", "m1"],
      "answers":         {"tracking_accuracy": ["A"], "plausibility": ["A","B"], "naturalness": ["NONE"]},
      "answers_methods": {"tracking_accuracy": ["m2"], "plausibility": ["m2","m1"], "naturalness": ["NONE"]},
      "first_seen_iso": "2026-08-31T05:15:55.524Z",
      "answered_iso":   "2026-08-31T05:18:49.603Z",
      "dwell_ms": 94650,
      "is_attention_check": false
    }
  ]
}
```

- `block` is the one field you must not ignore: it scopes `shown_order` and
  `answers_methods`. `trial_order` is always 10 `t*` ids followed by 20 `g*` ids.
- `submission_id` is the **idempotency key**. It is minted once, at the first
  completion, stored in `localStorage` (`thc_hoi_study_submission_id_v1`) and
  never regenerated, so every retry carries the same id and the receiving
  script can drop it (Section 7.1). The dedupe is *first-write-wins*, not
  "identical body": a retry re-stamps `completed_at_iso`, and a participant who
  resumed and edited answers before resubmitting sends a different body under
  the same id. The receiver keeps the first body it stored and reports
  `duplicate: true`; it does not reconcile the two.
  Note the consequence: a participant who deliberately starts the study over in
  the same browser profile re-sends the same id (just as they re-send the same
  `participant_id`), so that second run is dropped as a duplicate. Clear the
  three `thc_*` keys between pilot runs on a shared machine - see Section 10.
- `shown_order[i]` is the method rendered in slot `i`, i.e. slot 0 = label `A`.
  The reference clip is not a slot and never appears here.
- `answers` is what the participant saw (labels); `answers_methods` is the same
  answer already resolved to method ids. `"NONE"` passes through unchanged.
- `dwell_ms` is accumulated time on that trial across all visits, and it stops
  accumulating while the browser tab is hidden - so a participant who leaves the
  tab open for an hour does not look attentive.
- `answered_iso` is the timestamp of the *last* answer change on that trial.
- Question keys are `tracking_accuracy / plausibility / naturalness` for
  `tracking` rows and `text_adherence / plausibility / naturalness` for
  `generation` rows. `plausibility` and `naturalness` share a key across blocks
  on purpose - they are the same metric - but they are still **different
  populations** (2 arms vs 4 arms, different clips) and must not be pooled.

### Decoding with `KEY_DO_NOT_DEPLOY.json`

`KEY_DO_NOT_DEPLOY.json` (parent run folder, **never deployed**) maps the opaque
ids back to the real methods and cases, one table per block. Join on
`response.block` + method id:

```python
import json, collections

key  = json.load(open("KEY_DO_NOT_DEPLOY.json"))
resp = json.load(open("hoi_study_xxxxxxxx.json"))

# one mapping per block - m1 in "tracking" is NOT m1 in "generation"
name_of = {b: key["studies"][b]["method_id_to_real_method"] for b in key["studies"]}

votes = collections.Counter()
shown = collections.Counter()
for r in resp["responses"]:
    if r["is_attention_check"]:
        continue                                  # drop attention-check trials
    blk = r["block"]
    for m in set(r["shown_order"]):
        shown[(blk, name_of[blk][m])] += 1
    for metric, picks in r["answers_methods"].items():
        for m in picks:
            if m != "NONE":
                votes[(blk, metric, name_of[blk][m])] += 1

for (blk, metric, method), n in sorted(votes.items()):
    print(blk, metric, method, n, "/", shown[(blk, method)])
```

Recommended exclusions before analysis:

1. participants who failed the attention check (see below);
2. trials with an implausibly small `dwell_ms` (e.g. below the clip duration);
3. duplicate `participant_id`s (a resumed session keeps the same id, which is
   what you want - but a genuine repeat participant will also reuse it). If the
   Apps Script dedupe was in place, duplicate `submission_id`s never reached the
   sheet in the first place.

---

## 9. Attention checks (Part 2 only)

The app supports one attention-check trial **per block**, and only if the
manifest asks for one; with no declaration nothing is added and nothing breaks.
**Only `generation` declares one.** `tracking` deliberately does not - see the
*Attention check* note in Section 1 for why.

| block | manifest key |
| --- | --- |
| `tracking` | *(none - deliberately)* |
| `generation` | `blocks.generation.attention_check = { "case_id": "g02", "duplicate_method": "m1", "position": 9 }` |

- `case_id` (required) - that case is **removed from its block's normal pool**
  and used only for the check. The generation case was chosen because an
  identical-prompt twin stays in the pool, so spending a case on the check costs
  no unique prompt coverage. Part 1 shows no prompt at all, so the constraint
  does not apply there. It was re-drawn on 2026-09-01 (seed `20260922`) over the
  two cases sharing a caption in the re-selected 20 - the previous pick, `g20`,
  named a different clip after the re-selection.
- `duplicate_method` (optional) - which method's video is shown twice; a random
  slot is chosen if omitted. Pinned to `m1` so that *which arm* is
  duplicated is fixed across participants. Everything else on that trial is
  still randomised per participant: the slot order, which slot receives the
  copy, and (in `generation`) which of the other three arms it displaces.
- `position` (optional, 0-based) - where the trial is inserted after shuffling,
  **relative to its own block**; the middle of the block is used if omitted.
  `9` puts the generation check 10th of 20, i.e. question 20 of 30.

The trial renders the *same* video in two positions, so an attentive participant
must answer identically for those two labels. It is flagged in the payload as
`"is_attention_check": true` and looks completely ordinary on screen.

The trial **count does not change**: the case is removed from its pool and
re-inserted, so the session is still 10 + 20 = 30 questions. On that trial
`shown_order` has the duplicated method twice (`["m1","m1"]` in `tracking`; `m1`
plus two of `m2`/`m3`/`m4` in `generation`), and the arm it displaced is simply
not shown - that trial contributes no comparison data, which is expected, since
attention-check trials are dropped before analysis (Section 8).

Grading it: a participant passes when, for every metric, the two labels backed
by the duplicated video are either both selected or both unselected. Find those
labels from `shown_order` - the two slot indices holding the same method id.

Alternatively, mark an existing case with `"is_attention_check": true` and it is
used as-is and merely flagged.

To turn a check off, delete the `attention_check` key from **the root manifest**
(`<run>/manifest_<block>.json`) and re-run `tools/install_manifests.py`; editing
only `site/manifest.json` leaves the two copies diverged and the next install
silently reverts it. Changing the key also changes the manifest fingerprint,
which invalidates every saved participant checkpoint - do not touch it once the
study is live.

---

## 10. Behaviour worth knowing when piloting

- **Resume.** Progress is checkpointed to `localStorage` after every single
  answer. A reload offers *Resume* / *Start Over*; resuming restores the exact
  trial order, the exact label assignment, all prior answers, and whether the
  interstitial has already been read. Changing `manifest.json` invalidates the
  checkpoint automatically: the fingerprint stored with it covers `version`, the
  whole `blocks` object (methods and both attention checks) and the *whole*
  `cases` array - prompts, references and video paths included, not just the
  ids, because the saved trials embed those paths. So a mid-study manifest swap
  cannot corrupt a session; it silently discards every in-flight one.
- **Reloading on the interstitial** resumes on question 10 (the last answered
  trial), and pressing *Next* shows the interstitial again. That is deliberate:
  the checkpoint only ever points at a real trial.
- **Keyboard.** `1`/`2`(/`3`/`4`) toggle `A`/`B`(/`C`/`D`) on the highlighted
  question, `0` toggles *None*, `Enter` advances (and confirms the interstitial).
  The highlighted question is the last one the participant touched, and it is
  outlined in blue. The hint is hidden on narrow screens.
- **Autoplay.** Videos are `muted autoplay loop playsinline`, and `play()` is
  retried after render, on `canplay`, and when the tab becomes visible again -
  browsers refuse or defer autoplay in several situations. The reference clip
  behaves the same way.
- **Participant id.** A `crypto.randomUUID()` stored in `localStorage` under
  `thc_hoi_study_participant_id`. The completion code shown at the end is the
  first 8 hex characters of that id, uppercased, so a returned code can be
  matched to a submitted row.
- **Submission id.** A second `crypto.randomUUID()`, minted lazily at the first
  completion and stored under `thc_hoi_study_submission_id_v1`. It is the
  idempotency key described in Sections 7.1 and 8: it is never regenerated, so
  every retry - a reload-and-resume, a re-submit, a "Save my responses again" -
  carries the identical id.
- **Reset a machine between runs.** *Start Over* clears only the checkpoint, on
  purpose: it is reachable after a submit attempt that may already have
  committed server-side, so dropping the id there would let that attempt be
  counted twice. The flip side is that a **second genuine completion on the
  same browser profile is silently dropped as a duplicate** - which is exactly
  what happens if you pilot a run and then do the real run on that machine. So
  reset all three keys, in the browser console, between runs:

  ```javascript
  Object.keys(localStorage).filter(k => k.startsWith('thc_'))
    .forEach(k => localStorage.removeItem(k));
  ```

  A fresh profile, a different browser or a guest window works too. Do not
  clear only some of them: a new participant id with an old submission id looks
  like a new participant whose submission is a duplicate.
- **Manifest-driven copy.** `title` becomes the page `<h1>` and the browser tab
  title (set with `textContent`, so a manifest string can never inject markup);
  the value in `index.html` is only the pre-load placeholder. `duration_s` is
  not used - clip length comes from the video itself. `blocks.<b>.title` is
  carried through the installer for the record but is not currently rendered.
- **Nothing is hard-coded per case.** Trial count, ids, prompts, references and
  video paths all come from `manifest.json`. What *is* hard-coded in `app.js` is
  the per-block layout and wording (`BLOCK_CONFIG`) and the block order, on
  purpose: those are study-design decisions, not data.
- **There is one `app.js` now.** The old `tools/build_study_js.py`, which
  generated a second copy of the file for the second study, has been deleted.

---

## 11. Limitations

**The reference clips are missing** (Section 6). Until they are installed, Part 1
cannot actually be run: the tracking-accuracy question has no referent. The
placeholder exists so a mid-study 404 degrades instead of breaking, not as a
substitute.

**Part 1 is not perfectly blind, and this is the biggest threat to its
validity.** The two arms were produced on *different corpora*, so the two videos
in a pair can differ in ways that have nothing to do with motion quality:
the humanoid's body proportions differ between arms, and the object meshes for
the same nominal object are not the same asset. A participant only has to notice
"the blocky avatar is always the one on the left-ish half of the pairs" to start
scoring a *method* rather than a *motion*, and any such regularity turns the
positional A/B randomisation into a formality. **Pilot this explicitly**: show a
handful of pairs to 2-3 naive viewers and ask them, without any other framing,
whether they can tell which videos come from the same system. If they can, the
comparison needs matched assets (same body, same meshes, same camera and
lighting) before the numbers mean anything. Adding a third, differently-rendered
reference clip to the same screen makes this *more* salient, not less - check it
in the pilot. Part 2 is less exposed because all four arms render from the same
asset set, but the same check is cheap there too.

**Part 1 clips are padded by freezing their last frame.** A clip that ends with
the character on the floor holds that pose for the remainder of its duration.
Participants are told this explicitly (Section 1), but it is still a signal: a
frozen arm is visually distinctive, and if one method fails more often it also
freezes more often, which a participant can learn to spot. Consider whether the
`dwell_ms` and the ratings on frozen trials behave differently from the rest
before pooling them.

Smaller caveats:

- **Fixed block order.** Every participant does Part 1 first. Any fatigue or
  practice effect therefore lands entirely on Part 2, and the two parts are not
  counterbalanced. That is a deliberate trade (the task instructions would be
  confusing if interleaved) but it means Part-1 and Part-2 numbers are not
  directly comparable as "the same participants under the same conditions".
- **One attention check per block** (Section 9). One trial out of 10 (or 20) is
  a weak instrument: a click-through participant has a decent chance of passing
  it by luck, especially on a metric they happened to answer "None" to. Read it
  together with `dwell_ms` rather than as a pass/fail gate on its own.
- **Halved case counts.** The 2026-08-31 re-cut took Part 1 from 20 cases to 10
  and Part 2 from 30 to 20 so that one participant can do both in one sitting.
  Per-case precision drops accordingly; budget more participants.
- **`localStorage` is per browser profile.** A participant who switches device or
  uses private browsing gets a new participant id and loses their checkpoint.
- **Anonymity depends on the manifest, not the app.** The app never reveals a
  method id, but it faithfully renders whatever the manifest gives it: a
  descriptive video path or a case `id` that encodes the method would leak
  straight into the DOM. Keep the ids opaque.
- **Clip length differs between the blocks** (Part 1 clips are short, a couple of
  seconds; Part 2 clips are ~10 s). Do not compare `dwell_ms` distributions
  across the two blocks.
- **Order effects are randomised, not balanced.** Within each block every
  participant gets an independent Fisher-Yates shuffle rather than a
  counterbalanced design; with a small participant pool, check the realised
  `trial_order`s for accidental imbalance.
