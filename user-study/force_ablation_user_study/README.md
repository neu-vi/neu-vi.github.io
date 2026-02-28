# Force Ablation User Study

This folder contains a standalone static frontend for ablation-focused force evaluation.

## Files

- `index.html`, `style.css`, `app.js`: frontend app
- `manifest.json`: required question manifest (create separately)
- `videos/`: condition/method videos
- `imgs/`: reference images

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

In `app.js`:

```js
const SUBMIT_ENDPOINT = "";
```

- Empty: download JSON locally on submit
- Non-empty URL: POST JSON to endpoint, fallback to local JSON on failure

## Local run

```bash
python3 -m http.server
```

Open:

- `http://localhost:8000/user-study/force_ablation_user_study/`
