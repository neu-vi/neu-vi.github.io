# Force User Study (Perceptual Evaluation)

This study is self-contained and can be hosted directly at:

- `/user-study/force_user_study/`

For the general "how do I stand one of these up" recipe (Google Sheet + Apps Script
deployment, endpoint wiring, troubleshooting), see [`../README.md`](../README.md).
This file only covers what is specific to this study.

## Contents

- `index.html`, `style.css`, `app.js`: static frontend
- `manifest.json`: question manifest
- `videos/`: copied videos used by the study page
- `tools/build_force_user_study_manifest.py`: helper script to copy videos and generate manifest
- `apps_script/Code.gs`: Google Apps Script backend that writes submissions to a Google Sheet

## Build videos + manifest

From repo root (`neu-vi.github.io`):

```bash
python3 user-study/force_user_study/tools/build_force_user_study_manifest.py --source ../final
```

Optional arguments:

```bash
python3 user-study/force_user_study/tools/build_force_user_study_manifest.py \
  --source ../final \
  --out_videos_dir user-study/force_user_study/videos \
  --out_manifest user-study/force_user_study/manifest.json
```

## Source folder expectation

Expected source subfolders (under `../final`) include:

- `force_prompting_wind_diverse`
- `force_prompting_point_diverse`
- `force_prompting_wind_diverse_change`
- `force_prompting_point_diverse_change`
- `text_inference_wind_diverse`
- `text_inference_point_diverse`
- `text_inference_wind_diverse_change`
- `text_inference_point_diverse_change`
- `ours_autoregressive_wind_diverse`
- `ours_autoregressive_point_diverse`
- `ours_autoregressive_wind_diverse_change`
- `ours_autoregressive_point_diverse_change`
- `kling_motion_brush_point_diverse`
- `kling_motion_brush_point_diverse_change`

## Manifest / condition logic

- Conditions: `wind`, `point`, `wind_change`, `point_change`
- Required methods:
- `wind`, `wind_change`: `force_prompting`, `text_inference`, `ours_autoregressive`
- `point`, `point_change`: `force_prompting`, `text_inference`, `ours_autoregressive`, `kling_motion_brush`
- Valid `case_id`s are intersection of `.mp4` filenames across required methods for each condition.

## Submission

In `app.js`, line 1:

```js
const SUBMIT_ENDPOINT = "";
```

- Empty: download JSON at completion.
- Non-empty URL: POST JSON to endpoint, with JSON download fallback on failure.

The endpoint is a Google Apps Script Web app running `apps_script/Code.gs`, bound to
a Google Sheet. Deployment steps are in [`../README.md`](../README.md#deploying-a-study).

### Payload shape

```json
{
  "participant_id": "<uuid>",
  "completed_at_iso": "...",
  "user_agent": "...",
  "responses": [
    {
      "participant_id": "<uuid>",
      "condition": "wind",
      "case_id": "0.mp4",
      "shown_order": ["ours_autoregressive", "force_prompting", "text_inference"],
      "answers":       { "force": "A",   "physics": "A",   "visual": "A"   },
      "answers_multi": { "force": ["A"], "physics": ["A"], "visual": ["A"] },
      "timestamp_iso": "...",
      "user_agent": "..."
    }
  ]
}
```

`shown_order` is the per-question shuffled method order; `Code.gs` uses it to map the
displayed labels A/B/C/D back to method names. `NONE` means "Neither".

## Local run

```bash
python3 -m http.server
```

Open:

- `http://localhost:8000/user-study/force_user_study/`

## Debugging

`app.js` line 6:

```js
const DEBUG_CONDITION_ONLY = ""; // e.g. "wind" to run only one condition
```

Set it to a single condition for a quick end-to-end pass, and reset it to `""`
before publishing.
