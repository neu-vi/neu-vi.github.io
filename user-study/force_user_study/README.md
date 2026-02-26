# Force User Study (Perceptual Evaluation)

This study is self-contained and can be hosted directly at:

- `/user-study/force_user_study/`

## Contents

- `index.html`, `style.css`, `app.js`: static frontend
- `manifest.json`: question manifest
- `videos/`: copied videos used by the study page
- `../tools/build_force_user_study_manifest.py`: helper script to copy videos and generate manifest

## Build videos + manifest

From repo root (`neu-vi.github.io`):

```bash
python3 user-study/tools/build_force_user_study_manifest.py --source ../final
```

Optional arguments:

```bash
python3 user-study/tools/build_force_user_study_manifest.py \
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

In `app.js`, configure:

```js
const SUBMIT_ENDPOINT = "";
```

- Empty: download JSON at completion.
- Non-empty URL: POST JSON to endpoint, with JSON download fallback on failure.

## Local run

```bash
python3 -m http.server
```

Open:

- `http://localhost:8000/user-study/force_user_study/`
