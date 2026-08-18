# LumiTokens First Major Figure — Video Plan

## Goal

Convert the paper's first major figure from three simultaneously visible rows into a single, sequential visual abstract for the project website.

The original three-part story remains the same:

1. Object relighting
2. Scene relighting
3. Progressive scene editing

The video should present these ideas over time rather than showing all three rows moving at once. This avoids visual overload and gives each contribution a clear moment of focus.

## Recommended Website Layout

Use one large video with three clickable chapter labels:

```text
1. Object relighting       2. Scene relighting       3. Progressive editing
        ●                            ○                            ○

┌─────────────────────────────────────────────────────────────────────┐
│                                                                     │
│                       One large active video                        │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘

                    Short chapter-specific caption
```

The video can advance automatically, but visitors should be able to select a chapter and jump directly to its starting time. Include a subtle progress indicator and a replay control.

## Chapter 1: Object Relighting

Suggested sequence:

1. Briefly show the sparse input views as a static strip.
2. Fix the camera while the environment lighting changes around the object.
3. Move the camera around the object under one selected, static environment map.
4. Fix the camera again while a point light moves around the object.

This chapter should demonstrate both lighting control and novel-view consistency.

Suggested duration: **8–10 seconds**.

Suggested caption:

> Relight an object under environment and point lights, then render consistent novel views.

## Chapter 2: Scene Relighting

Suggested sequence:

1. Briefly show the sparse-view input mosaic.
2. Fix the camera while the light moves across the multi-object scene.
3. Emphasize moving cast shadows, highlights, and inter-object reflections.
4. End with a short camera movement under the final static illumination.

This chapter should emphasize scene-level lighting interactions that cannot be explained as independent object appearance changes.

Suggested duration: **8–10 seconds**.

Suggested caption:

> LumiTokens models scene-level lighting interactions, including cast shadows and inter-object reflections.

If the source position needs to be visualized, use one small, consistent point-light indicator rather than a large technical overlay.

## Chapter 3: Progressive Editing

Show a discrete sequence of accumulated lighting edits:

```text
Input → Environment light → + Point light → + Point light → + Area light
```

Keep the camera fixed during the editing sequence so every appearance change can be attributed to the newly added light. Pause for approximately **1–1.5 seconds** after each addition and display a small stage label.

At the end, add a short camera orbit under the final composed illumination. This helps demonstrate that the edited result remains a persistent scene representation that can be rendered from novel viewpoints.

Suggested duration: **10–12 seconds**.

Suggested caption:

> Lighting edits accumulate directly in token space, producing a persistent scene that can still be rendered from novel viewpoints.

## Suggested Full Timeline

| Time | Content |
|---|---|
| 0–2 seconds | LumiTokens idea or short title card |
| 2–10 seconds | Object relighting |
| 10–19 seconds | Scene relighting |
| 19–30 seconds | Progressive editing |
| 30–32 seconds | Final composed result and LumiTokens mark |

Target total duration: **approximately 28–32 seconds**.

The final frame should be visually compatible with the opening frame so autoplay looping does not feel abrupt.

## Presentation Guidelines

- Do not animate all three original figure rows simultaneously.
- Preserve the original logical order: object, scene, progressive editing.
- Use the same aspect ratio, typography, stage labels, and light-source indicators throughout.
- Keep annotations minimal and place explanatory captions in HTML when possible.
- Use smooth transitions, but avoid decorative effects that distract from lighting changes.
- Keep object scale and framing consistent when switching between camera-motion and light-motion clips.
- Use a fixed camera when the lighting changes and fixed lighting when the camera moves, so the cause of each visual change remains unambiguous.
- Export a poster frame for initial page loading and reduced-motion visitors.
- Use muted inline playback, pause the video when it leaves the viewport, and respect the browser's reduced-motion preference.

## Core Editorial Principle

Convert the original figure's **spatial hierarchy** into a **temporal hierarchy**:

> Object relighting establishes the capability, scene relighting demonstrates its generality, and progressive editing provides the final payoff.
