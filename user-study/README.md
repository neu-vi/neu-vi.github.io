# User Study Hub

This folder hosts reusable static user studies. Each study lives in its own subfolder and is self-contained.

## Study folder contract

Each study should include:

- `index.html`
- `style.css`
- `app.js`
- `README.md`
- `manifest.json` (generated or committed sample)
- `videos/` (generated assets; optional in git depending on size)

Suggested layout:

```text
user-study/
  <study_name>/
    index.html
    style.css
    app.js
    README.md
    manifest.json
    videos/
```

## How to add a new user study

1. Create a new folder under `user-study/`, e.g. `user-study/my_study/`.
2. Keep paths local to that folder (`app.js` should load `./manifest.json`).
3. Add a `README.md` with:
- goal and evaluation protocol
- expected source video layout
- build command(s)
- how to run locally
- how to configure online submission endpoint
4. If videos/manifests are generated, add or reuse scripts under `user-study/tools/` and document defaults.
5. Verify direct URL access works at `/user-study/<study_name>/`.

## Existing study

- `force_user_study/`: Perceptual evaluation study for force-controllable video generation.

## Shared tools

- `user-study/tools/build_force_user_study_manifest.py`: build script for the force study manifest/videos.
