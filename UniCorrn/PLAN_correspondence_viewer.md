# UniCorrn Interactive Correspondence Viewer

## Context

The qualitative-results section of the UniCorrn paper webpage at [index.html:417-528](index.html) currently shows three carousels (2D-2D, 2D-3D, 3D-3D matching) with embedded MP4 placeholders. The goal is to replace those videos with interactive, modality-aware correspondence visualizers that share a single UI/control language across all three rows. three.js is used **only** as the point-cloud rendering engine for the 3D halves — 2D halves use plain `<img>` + SVG.

A reference point-cloud viewer exists at [../SNAP/static/js/pointcloud-viewer.js](../SNAP/static/js/pointcloud-viewer.js) (three.js r128 + TrackballControls), and patterns from it (loader, point material, camera-fit, instanced primitives) will be reused.

## Canonical JSON schema

One pair per directory under `assets/data/<row>/pair_<id>/`. Coords are arrays-of-arrays (not flattened). Colors are 0–255 integer RGB triplets to match the SNAP precedent.

**2D-2D** — `assets/data/2d2d/pair_<id>/correspondence.json` + `img_a.*`, `img_b.*`:
```
{
  "schema": "corr2d2d.v1",
  "image_a": { "src": "img_a.jpg" },
  "image_b": { "src": "img_b.jpg" },
  "kpts1":     [[x,y], ...],          // pixel coords in image_a
  "kpts2":     [[x,y], ...],          // pixel coords in image_b
  "kpts_cmap": [[r,g,b], ...],        // len == kpts1
  "line_cmap": [[r,g,b], ...]         // len == kpts1
}
```
Image dimensions are read from the loaded `<img>` element via `naturalWidth`/`naturalHeight`; the SVG `viewBox` is set after the image's `load` event fires.

**2D-3D** — `assets/data/2d3d/pair_<id>/correspondence.json` + `img.*`, `pcd.json`:
```
{
  "schema": "corr2d3d.v1",
  "image": { "src": "img.jpg" },
  "pcd":   { "src": "pcd.json" },     // {pcd:[[x,y,z]], cmap:[[r,g,b]]}
  "kpts1":     [[x,y], ...],          // 2D pixel coords
  "kpts2":     [[x,y,z], ...],        // 3D world coords
  "kpts_cmap": [[r,g,b], ...]
  // line_cmap intentionally omitted; no cross-boundary lines
}
```
Image dimensions read from the `<img>` element on `load` (same as 2D-2D).

**3D-3D** — `assets/data/3d3d/pair_<id>/correspondence.json` + `pcd_a.json`, `pcd_b.json`:
```
{
  "schema": "corr3d3d.v1",
  "pcd_a": { "src": "pcd_a.json" },
  "pcd_b": { "src": "pcd_b.json" },
  "kpts1":     [[x,y,z], ...],        // in pcd_a frame
  "kpts2":     [[x,y,z], ...],        // in pcd_b frame
  "kpts_cmap": [[r,g,b], ...],
  "line_cmap": [[r,g,b], ...],
  "offset":    [dx, dy, dz]           // optional, applied to pcd_b + kpts2; see §"3D-3D offset"
}
```

Per-pair `pcd_*.json` files use the user's proposed `{pcd, cmap}` keys (kept verbatim, no rename to SNAP's `positions/colors`).

**Why split pcd into separate files**: keeps the small manifest fast to fetch first, and lets large pcds (5–20 MB each) load in parallel without blocking the manifest parse.

## Architecture

- **One `RowViewer` per row.** Constructed once at page load. Each row owns at most one `WebGLRenderer` + animation loop. The 2D-2D row creates none.
- **Card layout uniform via `aspect-ratio: 16/9`** on `.carousel-card`. Inner DOM differs by row:
  - 2D-2D: two `.cv-half` (img + absolute SVG overlay) side-by-side.
  - 2D-3D: left `.cv-half`; right `.cv-3d-slot` (the row's renderer canvas reparents into here on settle).
  - 3D-3D: full-width `.cv-3d-slot`.
- **Renderer reparenting on carousel settle**: `scrollCarousel` already uses an "infinite rotate" model where `track.firstElementChild` is the new active card after settling ([index.html:632, 638](index.html#L632)). Add one line at the end of each branch to dispatch a `carousel:settled` CustomEvent on the track. RowViewer listens, detaches its canvas from the old slot, appends to the new active slot, calls `renderer.setSize()`, swaps `currentScene`, applies control state.
- **Pre-build all per-pair scenes at init** so card-switch is just a scene-pointer swap and a canvas reparent (no scene rebuild during interaction).

## Drawing primitives

- **3D "x" markers**: `THREE.Sprite` with a small canvas-textured material (one canvas drawn once per row, tinted per kpt via `sprite.material.color`). Sprites stay screen-aligned and constant pixel size — visually consistent with SVG kpts.
- **3D correspondence lines**: single `THREE.LineSegments` per cloud-pair, vertex-colored from `line_cmap`, `LineBasicMaterial({transparent:true, vertexColors:true})`.
- **2D kpts**: per-side `<svg class="cv-overlay" viewBox="0 0 W H">` with `<path>` for each "x" (`d="M-4-4 l8 8 M4-4 l-8 8"` translated to kpt position) — SVG `viewBox` matches the source image dimensions so coords map 1:1.
- **2D correspondence lines** (2D-2D only): a single SVG spanning both halves (positioned absolute over the whole card), with `<line>` elements between kpts1 (in image_a's region) and kpts2 (in image_b's region). Coords transformed from image-pixel space to card-relative space using each image's bbox.

## 3D-3D offset

The offset between the two clouds is **configurable per pair** because some pairs read better stacked vertically (top-down scans) than horizontally.

In `Card3D3D.build()`:
- If `offset` is present in the manifest, translate `pcd_b` and `kpts2` by that vector verbatim.
- Otherwise compute a default along **+x**: `dx = sizeA.x/2 + sizeB.x/2 + max(sizeA.x, sizeB.x) * 0.25`, `dy = dz = 0`.

To get a +y stacking, the manifest just sets e.g. `"offset": [0, 1.25 * max(sizeA.y, sizeB.y), 0]` (the author computes it offline and bakes it in). The viewer applies any vector, so diagonal/custom offsets work too.

Correspondence lines connect post-offset positions.

## Control bar (shared template per row)

Injected after each `.carousel-outer`:
```
<div class="cv-controls">
  <label><input type="checkbox" data-ctrl="kpts1" checked> Keypoints 1</label>
  <label><input type="checkbox" data-ctrl="kpts2" checked> Keypoints 2</label>
  <label data-only="2d2d 3d3d"><input type="checkbox" data-ctrl="lines" checked> Correspondence lines</label>
  <label>Opacity <input type="range" min="0" max="100" value="100" data-ctrl="opacity"></label>
</div>
```

- `data-only` hides the lines control for the 2D-3D row via CSS.
- State is **row-level** (all cards in a row share the same control state) — simpler and matches user intent.
- `opacity` slider affects only kpts and lines, not the underlying point clouds or images (per user spec).
- On `change`/`input`, mutate `ControlState` and call `RowViewer.applyControlState()` which:
  - Toggles `object.visible` on three.js kpt/line groups; sets `material.opacity` (built with `transparent: true`).
  - Toggles `display`/`opacity` on `<g class="cv-kpts1|kpts2|lines">` SVG groups.

Styling: white pill bg, 1px `rgba(0,0,0,0.05)` border, soft shadow — matches `.carousel-nav` aesthetic.

## Files

**Create**
- `static/js/correspondence-viewer.js` — `RowViewer`, `Card2D2D`, `Card2D3D`, `Card3D3D`, shared primitive builders, loaders.
- `static/css/correspondence.css` — control bar, card slot/half layout, SVG overlay rules.
- `assets/data/2d2d/pair_{1..5}/{correspondence.json, img_a.*, img_b.*}`
- `assets/data/2d3d/pair_{1..5}/{correspondence.json, img.*, pcd.json}`
- `assets/data/3d3d/pair_{1..5}/{correspondence.json, pcd_a.json, pcd_b.json}`

**Modify**
- [index.html](index.html):
  - Add three.js r128 + TrackballControls CDN tags + `<link>` to `correspondence.css` + `<script>` to `correspondence-viewer.js` in `<head>`.
  - Replace each `<video>` inside `.carousel-card` with a row-appropriate template (or remove cards and let JS generate them from the pair manifest).
  - Add `<div class="cv-controls">` after each `.carousel-outer`.
  - In `scrollCarousel` ([index.html:619-648](index.html#L619-L648)), append a `track.dispatchEvent(new CustomEvent('carousel:settled'))` inside both setTimeout callbacks (after the transform reset).
- [static/css/carousel.css](static/css/carousel.css): add `.carousel-card { aspect-ratio: 16/9; background: #fff; }` (overrides current `background: #000` for non-video content).

## `correspondence-viewer.js` surface (no bodies)

```
createRowViewer({trackId, kind: '2d2d'|'2d3d'|'3d3d', pairs: [{jsonUrl}], controlsEl}) -> RowViewer

RowViewer methods:
  init()                    // load all manifests + pcds, build cards, mount, attach listeners
  onCarouselSettled()       // reparent canvas, swap scene, applyControlState
  applyControlState()
  destroy()

class Card2D2D { mount(el); }            // builds two img+svg halves, draws kpts/lines once
class Card2D3D { mount(el); attachRenderer(canvas); detachRenderer(); }
class Card3D3D { mount(el); attachRenderer(canvas); detachRenderer(); }

// shared helpers
buildPointCloud(pcd, cmap) -> THREE.Points
buildKptSprites(points3d, cmap, opts) -> THREE.Group
buildCorrLines(p1, p2, lineCmap) -> THREE.LineSegments
resolveOffsetForPair(manifest, bboxA, bboxB) -> THREE.Vector3   // honors manifest.offset, falls back to +x default
buildSvgKpts(svgEl, kpts, cmap, imgW, imgH)
buildSvgLines(svgEl, kpts1, kpts2, geomA, geomB, lineCmap)

loadPair(jsonUrl) -> Promise<ParsedPair>
loadPcd(url) -> Promise<{pcd, cmap}>
```

## Verification

1. Serve via `python -m http.server 8000` from project root; open `http://localhost:8000/UniCorrn/index.html`.
2. Network: confirm three.js + TrackballControls 200; each row's manifests + pcds load on init; no 404s.
3. **2D-2D row**: arrow through all pairs; kpts (x markers) visible on both images; lines connect across the gap; toggle each checkbox individually + combined; drag opacity 100→0 and verify SVG kpts + lines fade together; verify images themselves do NOT fade.
4. **2D-3D row**: confirm "Correspondence lines" checkbox is hidden; image left has SVG kpts; right has interactive point cloud with 3D x markers (rotate/zoom via TrackballControls); arrow advances and the canvas reparents into the new card with no flicker (test with throttled CPU); opacity affects only kpts.
5. **3D-3D row**: two clouds separated by the per-pair `offset` (or +x default when omitted); correspondence lines span the gap; opacity slider fades kpts + lines but not the underlying clouds. Verify with at least one pair using a +y offset to confirm the schema is honored.
6. Resize browser: `ResizeObserver` re-sizes renderer; SVG `viewBox` keeps overlay aligned.
7. Console clean — no WebGL context-loss warnings; only one `WebGLRenderer` constructed for the 2D-3D row and one for the 3D-3D row (max two contexts total).
8. Visual: all three rows render at the same card aspect ratio (16/9) so the carousel feels uniform across modalities.
