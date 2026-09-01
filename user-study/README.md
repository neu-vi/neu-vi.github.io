# User Study Hub

A pattern for running perceptual user studies without a server: a static
HTML/CSS/JS page hosted on GitHub Pages collects the answers, and a Google Apps
Script Web app writes them into a Google Sheet.

No backend, no database, no participant accounts. Each study is one self-contained
folder here plus one Apps Script deployment.

This file is the general recipe. Each study folder has its own `README.md` covering
what is specific to it: the protocol, the manifest schema, and the build script.

## How it works

```
 participant's browser                 GitHub Pages                Google
┌──────────────────────┐        ┌───────────────────────┐   ┌──────────────────────┐
│  index.html          │  GET   │  /user-study/<study>/ │   │  Apps Script Web app │
│  style.css           │ <───── │  manifest.json        │   │  (Code.gs, doPost)   │
│  app.js              │        │  videos/, imgs/       │   │          │           │
│                      │        └───────────────────────┘   │          v           │
│  answers ────────────┼─── POST JSON to SUBMIT_ENDPOINT ──>│   Google Sheet       │
└──────────────────────┘                                    └──────────────────────┘
         │
         └─ if the POST fails: the page downloads the same JSON locally as a fallback
```

1. `app.js` loads `manifest.json`, which is the single source of truth for the
   question list: every question, and the asset path for each method.
2. Per question, the method order is shuffled, so the participant only ever sees
   anonymous labels **A / B / C / D**. The shuffled order is recorded alongside the
   answer as `shown_order`.
3. At the end, `app.js` POSTs one JSON payload for the whole session to
   `SUBMIT_ENDPOINT` (line 1 of `app.js`).
4. `doPost` in the study's `Code.gs` maps the labels back to method names using
   `shown_order` and appends rows to the bound spreadsheet.
5. If `SUBMIT_ENDPOINT` is empty or the POST fails, the browser downloads the JSON
   instead, so no data is lost. It can be backfilled later (see below).

A participant id (UUID) is generated on first visit and cached in `localStorage`, so
a reload does not restart the session under a new identity.

## Study folder contract

```text
user-study/
  README.md                     <- this guide
  <study_name>/
    index.html                  <- page shell
    style.css
    app.js                      <- study logic; SUBMIT_ENDPOINT is line 1
    manifest.json               <- the questions (generated or hand-written)
    README.md                   <- protocol, manifest schema, payload shape
    videos/                     <- stimuli, committed to the repo
    imgs/                       <- reference images, if the study needs them
    apps_script/
      Code.gs                   <- optional: a copy of the Apps Script backend
    build_manifest.py           <- optional; or a tools/ subfolder if there are several
```

Two rules keep this working:

- **Everything stays relative to the study folder.** `app.js` fetches
  `./manifest.json`, and manifest paths are relative too, so the folder can be
  copied or renamed and still work.
- **Each study owns its own backend.** Studies ask different questions and
  therefore POST different payloads, so each one needs its own `Code.gs`, its own
  Sheet, and its own deployment.

The Apps Script itself lives in Google, so committing a copy under `apps_script/` is
optional. The ones checked in here are meant as working examples to copy from — some
studies have one, some do not.

## Deploying a study

### 1. Put the assets in place

Commit `videos/` (and `imgs/`) plus a `manifest.json` pointing at them. Most studies
here generate the manifest with a small Python script that copies the chosen clips
out of an inference output directory and writes the question list; see the study's
own README for the exact command.

### 2. Test locally before touching Google

```bash
# from the repo root
python3 -m http.server 8000
```

Open `http://localhost:8000/user-study/<study_name>/`. Keep `SUBMIT_ENDPOINT` empty
at this stage — finishing the study then just downloads a JSON file, which is
exactly the payload your Apps Script will have to parse. Write `Code.gs` against
that file.

### 3. Create the Google Sheet and the Apps Script

1. Create a new Google Sheet — this is where responses land. Do not add tabs by
   hand; the script creates them on the first submission.
2. In that sheet: **Extensions → Apps Script**. This creates a *bound* script, which
   is what makes `SpreadsheetApp.getActiveSpreadsheet()` in `Code.gs` resolve to
   this sheet. A standalone script will not work without extra plumbing.
3. Replace the placeholder `Code.gs` contents with the study's
   `apps_script/Code.gs`. Save.

### 4. Deploy it as a Web app

**Deploy → New deployment → gear icon → Web app**, then:

| Field | Value |
| --- | --- |
| Execute as | **Me** (your account owns the writes) |
| Who has access | **Anyone** — *not* "Anyone with a Google account" |

`Anyone with a Google account` silently breaks anonymous participants: the POST is
redirected to a login page instead of reaching `doPost`.

Authorize the script when prompted — it needs permission to edit the sheet. Google
will warn that the app is unverified, which is expected for a personal script:
choose *Advanced → Go to \<project\> (unsafe)*.

Copy the **Web app URL**:

```
https://script.google.com/macros/s/AKfycb...../exec
```

### 5. Wire the frontend to the endpoint

Paste that URL into line 1 of the study's `app.js`:

```js
const SUBMIT_ENDPOINT = "https://script.google.com/macros/s/AKfycb...../exec";
```

Leaving it `""` disables online submission and falls back to a local JSON download.

Commit and push. The study goes live at
`https://neu-vi.github.io/user-study/<study_name>/`.

### 6. Verify end to end

Run through the study yourself and confirm rows appear in the sheet. Do this
**before** sending the link out: a misconfigured deployment looks completely normal
from the participant's side, because of the local-download fallback.

### Updating the script later

Editing `Code.gs` is not enough. Go to **Deploy → Manage deployments → ✏️ edit →
Version: New version → Deploy**. That keeps the same `/exec` URL. Creating a *new
deployment* gives you a *new* URL, and the link you already published keeps hitting
the old code.

## Writing `Code.gs`

The two scripts under `force_user_study/apps_script/` and
`force_ablation_user_study/apps_script/` are checked in as reference: one handles
several metrics per question, the other a single forced choice. Start from whichever
is closer to your payload and adjust the header rows. The shared convention is three tabs, created on demand:

- **`Responses`** — one row per question: participant, condition/part, case id, the
  shuffled `shown_order`, and the chosen labels together with the methods they
  decode to.
- **`Votes`** — one row per chosen method (per metric, if the study asks several
  questions about the same clips). This is the tab to pivot for win rates.
- **`Submissions`** — one row per completed session, plus a `submission_key`
  (`participant_id | completed_at | question_count`). `doPost` rejects a key it has
  already seen, so a double-click or a retried submission cannot inflate the counts.

Two label values are conventions worth keeping: `NONE` means the participant chose
"neither", and `INVALID` in a method column means a label arrived that `shown_order`
could not explain — worth investigating rather than silently dropping.

Keep the decoding server-side even though `app.js` already sends decoded method
names: it means a payload with labels only is still recoverable.

## Recovering a failed submission

If a participant sends you a downloaded `*.json` file (the fallback path), open the
Apps Script editor, paste the contents into the template string inside
`runOneImport()`, select that function, and run it. It feeds the payload through the
same `doPost`, de-duplication included.

## Gotchas

- **Do not set `Content-Type: application/json` on the POST.** `app.js` deliberately
  sends the body with no explicit content type, so the browser labels it
  `text/plain` and the request stays CORS-simple. A JSON content type triggers a
  preflight `OPTIONS`, which Apps Script does not answer, and every submission fails.
- **CORS errors usually mean the access setting, not the code.** Apps Script answers
  the POST with a 302 to `script.googleusercontent.com`, which does send CORS
  headers, so `res.ok` is meaningful. If the browser reports a CORS failure, re-check
  "Who has access" first.
- **Never point two studies at one endpoint.** Different payload shapes into the same
  `doPost` produce silently malformed rows.
- **Keep the stimuli small.** GitHub has a 100 MB per-file hard limit and a ~1 GB
  soft repo limit, and participants stream every clip over the network.
- **Test in a fresh profile or incognito window.** The participant id is cached in
  `localStorage`, and a stale id makes repeated test runs confusing.
- **Reset debug switches before publishing.** Some studies have a constant near the
  top of `app.js` that restricts the run to one condition for quick testing.

## Adding a new study

In practice the fastest route is to hand this to a coding agent (Claude Code, Codex,
…): point it at one complete study folder as the reference implementation, describe
your setting, and let it write the new folder. Every study here is a few hundred
lines of vanilla HTML/CSS/JS with no build step and no dependencies, which is close
to the ideal input for that — the whole reference fits in context, and the agent can
serve it locally and click through the flow to check its own work.

A prompt along these lines works well:

> Read `user-study/<reference_study>/` end to end — `index.html`, `app.js`,
> `manifest.json`, the build script, and `apps_script/Code.gs`. It is a static
> perceptual user study that POSTs its results to a Google Apps Script backend.
> Create `user-study/<new_study>/` following the same structure and conventions.
> The setting is: <conditions, methods per condition, what the participant is asked
> per question, how many questions, where the source videos live>.
> Keep all paths relative to the study folder, keep the A/B/C/D shuffling and the
> `shown_order` bookkeeping, keep the local-JSON-download fallback, leave
> `SUBMIT_ENDPOINT` empty, and write a matching `Code.gs` and `README.md`.

Then check the parts an agent cannot verify for you: that the manifest points at the
clips you actually meant, that the randomization is not leaking method identity
through the ordering, and that the question wording says what you want it to say.
Deployment (steps 3–6 above) is still manual — it happens inside Google's UI.

Doing it by hand is the same shape:

1. Copy the existing study whose question format is closest to yours into
   `user-study/<new_study>/`.
2. Adjust the manifest and the conditions/metrics, and update the payload built in
   the submit handler of `app.js`.
3. Adapt a reference `Code.gs` so the header rows match the new payload.
4. Follow *Deploying a study* above with a fresh Sheet and a fresh deployment.
5. Document the manifest schema, the protocol, and the payload shape in
   `<new_study>/README.md`, and add a line to the list below.

## Studies in this folder

- [`force_user_study/`](force_user_study/) — StreamForce main comparison: our method
  vs. baselines, rated on force following, physical plausibility, and visual quality.
- [`force_ablation_user_study/`](force_ablation_user_study/) — StreamForce ablations:
  force-change following and force-magnitude adaptation.
- [`four_step_baseline_compare/`](four_step_baseline_compare/) — few-step video
  generation: four anonymized baselines, plus a RAFT-weight A/B part.
