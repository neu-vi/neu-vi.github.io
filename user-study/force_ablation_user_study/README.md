# Force Ablation User Study

This folder contains a standalone static frontend for ablation-focused force evaluation.

For the general "how do I stand one of these up" recipe (Google Sheet + Apps Script
deployment, endpoint wiring, troubleshooting), see [`../README.md`](../README.md).
This file only covers what is specific to this study.

## Files

- `index.html`, `style.css`, `app.js`: frontend app
- `manifest.json`: required question manifest (create separately)
- `videos/`: condition/method videos
- `imgs/`: reference images
- `apps_script/Code.gs`: Google Apps Script backend that writes submissions to a Google Sheet

## Conditions and tasks

- `wind_change_ablation`, `point_change_ablation`
  - Task type: `change_following`
  - Methods: `ours`, `ours_no_change`
  - User picks: `A`, `B`, or `Neither can`

- `wind_magnitude`, `point_magnitude`
  - Task type: `magnitude_adaptation`
  - Methods: `ours`, `force_prompting`, `text_inference`
  - Each method has two videos per case (small vs large force)
  - User picks: `A`, `B`, `C`, or `Neither can`

## Manifest format

Place `manifest.json` in this folder. Expected structure:

```json
{
  "version": 1,
  "conditions": {
    "wind_change_ablation": {
      "task_type": "change_following",
      "methods": ["ours", "ours_no_change"],
      "cases": [
        {
          "id": "232.mp4",
          "videos": {
            "ours": "videos/wind_change_ablation/ours/232.mp4",
            "ours_no_change": "videos/wind_change_ablation/ours_no_change/232.mp4"
          },
          "reference_image": "imgs/wind_change_ablation/232.png"
        }
      ]
    },
    "wind_magnitude": {
      "task_type": "magnitude_adaptation",
      "methods": ["ours", "force_prompting", "text_inference"],
      "cases": [
        {
          "id": "216",
          "pairs": {
            "ours": {
              "small": "videos/wind_magnitude/ours/216_0.mp4",
              "large": "videos/wind_magnitude/ours/216_1.mp4"
            },
            "force_prompting": {
              "small": "videos/wind_magnitude/force_prompting/216_0.mp4",
              "large": "videos/wind_magnitude/force_prompting/216_1.mp4"
            },
            "text_inference": {
              "small": "videos/wind_magnitude/text_inference/216_0.mp4",
              "large": "videos/wind_magnitude/text_inference/216_1.mp4"
            }
          },
          "reference_image": "imgs/wind_magnitude/216.png"
        }
      ]
    }
  }
}
```

## Submission

In `app.js`, line 1:

```js
const SUBMIT_ENDPOINT = "";
```

- Empty: download JSON locally on submit
- Non-empty URL: POST JSON to endpoint, fallback to local JSON on failure

The endpoint is a Google Apps Script Web app running `apps_script/Code.gs`, bound to
a Google Sheet. Deployment steps are in [`../README.md`](../README.md#deploying-a-study).
Each study posts its own payload shape, so this one needs its own sheet and its own
deployment — do not reuse another study's endpoint.

### Payload shape

```json
{
  "participant_id": "<uuid>",
  "completed_at_iso": "...",
  "user_agent": "...",
  "responses": [
    {
      "participant_id": "<uuid>",
      "condition": "wind_magnitude",
      "task_type": "magnitude_adaptation",
      "case_id": "216",
      "shown_order": ["ours", "text_inference", "force_prompting"],
      "answer_label": "A",
      "answer_method": "ours",
      "answer_labels": ["A"],
      "answer_methods": ["ours"],
      "timestamp_iso": "...",
      "user_agent": "..."
    }
  ]
}
```

`shown_order` is the per-question shuffled method order; `Code.gs` uses it to map the
displayed labels A/B/C/D back to method names. `NONE` means "Neither can".

## Local run

```bash
python3 -m http.server
```

Open:

- `http://localhost:8000/user-study/force_ablation_user_study/`
