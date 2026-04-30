(function () {
  const NS = 'http://www.w3.org/2000/svg';
  const svgEl = (tag, attrs) => {
    const e = document.createElementNS(NS, tag);
    if (attrs) for (const k in attrs) e.setAttribute(k, attrs[k]);
    return e;
  };
  const rgb = c => `rgb(${c[0] | 0},${c[1] | 0},${c[2] | 0})`;
  const loadJSON = async (u) => {
    const r = await fetch(u);
    if (!r.ok) throw new Error(`fetch ${u}: ${r.status}`);
    return r.json();
  };

  let _kptTex = null;
  function getKptTexture() {
    if (_kptTex) return _kptTex;
    const c = document.createElement('canvas');
    c.width = c.height = 64;
    const x = c.getContext('2d');
    x.strokeStyle = '#fff';
    x.lineWidth = 8;
    x.lineCap = 'round';
    x.beginPath();
    x.moveTo(14, 14); x.lineTo(50, 50);
    x.moveTo(50, 14); x.lineTo(14, 50);
    x.stroke();
    _kptTex = new THREE.CanvasTexture(c);
    return _kptTex;
  }

  function buildPointCloud(positions, colors, size) {
    const n = positions.length;
    const geom = new THREE.BufferGeometry();
    const pos = new Float32Array(n * 3);
    const col = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      pos[i * 3] = positions[i][0];
      pos[i * 3 + 1] = positions[i][1];
      pos[i * 3 + 2] = positions[i][2];
      col[i * 3] = colors[i][0] / 255;
      col[i * 3 + 1] = colors[i][1] / 255;
      col[i * 3 + 2] = colors[i][2] / 255;
    }
    geom.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geom.setAttribute('color', new THREE.BufferAttribute(col, 3));
    return new THREE.Points(geom, new THREE.PointsMaterial({
      size, vertexColors: true, sizeAttenuation: true
    }));
  }

  function buildKptSprites(points, colors, scale) {
    const tex = getKptTexture();
    const g = new THREE.Group();
    for (let i = 0; i < points.length; i++) {
      const m = new THREE.SpriteMaterial({
        map: tex,
        color: new THREE.Color(colors[i][0] / 255, colors[i][1] / 255, colors[i][2] / 255),
        transparent: true,
        depthTest: false
      });
      const s = new THREE.Sprite(m);
      s.position.set(points[i][0], points[i][1], points[i][2]);
      s.scale.setScalar(scale);
      s.renderOrder = 10;
      g.add(s);
    }
    return g;
  }

  function buildCorrLines(p1, p2, lineCmap) {
    const n = p1.length;
    const pos = new Float32Array(n * 6);
    const col = new Float32Array(n * 6);
    for (let i = 0; i < n; i++) {
      pos[i * 6] = p1[i][0]; pos[i * 6 + 1] = p1[i][1]; pos[i * 6 + 2] = p1[i][2];
      pos[i * 6 + 3] = p2[i][0]; pos[i * 6 + 4] = p2[i][1]; pos[i * 6 + 5] = p2[i][2];
      const c = lineCmap[i];
      col[i * 6] = c[0] / 255; col[i * 6 + 1] = c[1] / 255; col[i * 6 + 2] = c[2] / 255;
      col[i * 6 + 3] = c[0] / 255; col[i * 6 + 4] = c[1] / 255; col[i * 6 + 5] = c[2] / 255;
    }
    const geom = new THREE.BufferGeometry();
    geom.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geom.setAttribute('color', new THREE.BufferAttribute(col, 3));
    const mat = new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, depthTest: false });
    const lines = new THREE.LineSegments(geom, mat);
    lines.renderOrder = 5;
    return lines;
  }

  function fitCameraToBox(camera, controls, box) {
    const center = box.getCenter(new THREE.Vector3());
    const size = box.getSize(new THREE.Vector3());
    const maxDim = Math.max(size.x, size.y, size.z);
    const fov = camera.fov * Math.PI / 180;
    const dist = Math.abs(maxDim / 2 / Math.tan(fov / 2)) * 1;
    camera.position.set(center.x, center.y, center.z + dist);
    camera.lookAt(center);
    controls.target.copy(center);
    controls.update();
  }

  function imgDispRect(imgEl) {
    const cw = imgEl.clientWidth, ch = imgEl.clientHeight;
    const nw = imgEl.naturalWidth, nh = imgEl.naturalHeight;
    if (!nw || !nh || !cw || !ch) return { x: 0, y: 0, w: cw, h: ch };
    const ca = cw / ch, na = nw / nh;
    let w, h;
    if (na > ca) { w = cw; h = cw / na; }
    else { h = ch; w = ch * na; }
    return { x: (cw - w) / 2, y: (ch - h) / 2, w, h };
  }

  function buildCard2D2D(cardEl, pair) {
    cardEl.classList.add('cv-card', 'cv-card-2d2d');
    const halfA = document.createElement('div'); halfA.className = 'cv-half';
    const halfB = document.createElement('div'); halfB.className = 'cv-half';
    const imgA = document.createElement('img'); imgA.src = pair.image_a.src;
    const imgB = document.createElement('img'); imgB.src = pair.image_b.src;
    const svgA = svgEl('svg', { class: 'cv-overlay-side', preserveAspectRatio: 'xMidYMid meet' });
    const svgB = svgEl('svg', { class: 'cv-overlay-side', preserveAspectRatio: 'xMidYMid meet' });
    halfA.append(imgA, svgA);
    halfB.append(imgB, svgB);
    const lineSvg = svgEl('svg', { class: 'cv-overlay-card', preserveAspectRatio: 'none' });
    cardEl.append(halfA, halfB, lineSvg);

    const gA = svgEl('g', { class: 'cv-kpts1' });
    const gB = svgEl('g', { class: 'cv-kpts2' });
    const gL = svgEl('g', { class: 'cv-lines' });
    svgA.appendChild(gA); svgB.appendChild(gB); lineSvg.appendChild(gL);

    const drawSideKpts = (svg, group, kpts, cmap, imgEl) => {
      svg.setAttribute('viewBox', `0 0 ${imgEl.naturalWidth} ${imgEl.naturalHeight}`);
      group.innerHTML = '';
      const sz = Math.max(imgEl.naturalWidth, imgEl.naturalHeight) * 0.006;
      for (let i = 0; i < kpts.length; i++) {
        const [x, y] = kpts[i];
        group.appendChild(svgEl('path', {
          d: `M${-sz} ${-sz} l${2 * sz} ${2 * sz} M${sz} ${-sz} l${-2 * sz} ${2 * sz}`,
          stroke: rgb(cmap[i]),
          'stroke-width': sz * 0.4,
          'stroke-linecap': 'round',
          fill: 'none',
          transform: `translate(${x} ${y})`
        }));
      }
    };

    const drawLines = () => {
      const cardR = cardEl.getBoundingClientRect();
      if (cardR.width === 0 || cardR.height === 0) return;
      lineSvg.setAttribute('viewBox', `0 0 ${cardR.width} ${cardR.height}`);
      gL.innerHTML = '';
      if (!imgA.naturalWidth || !imgB.naturalWidth) return;
      const dA = imgDispRect(imgA), dB = imgDispRect(imgB);
      const halfAR = halfA.getBoundingClientRect();
      const halfBR = halfB.getBoundingClientRect();
      const offAX = halfAR.left - cardR.left + dA.x;
      const offAY = halfAR.top - cardR.top + dA.y;
      const offBX = halfBR.left - cardR.left + dB.x;
      const offBY = halfBR.top - cardR.top + dB.y;
      const sAX = dA.w / imgA.naturalWidth, sAY = dA.h / imgA.naturalHeight;
      const sBX = dB.w / imgB.naturalWidth, sBY = dB.h / imgB.naturalHeight;
      for (let i = 0; i < pair.kpts1.length; i++) {
        const k1 = pair.kpts1[i], k2 = pair.kpts2[i];
        gL.appendChild(svgEl('line', {
          x1: offAX + k1[0] * sAX, y1: offAY + k1[1] * sAY,
          x2: offBX + k2[0] * sBX, y2: offBY + k2[1] * sBY,
          stroke: rgb(pair.line_cmap[i]),
          'stroke-width': 0.6,
          'stroke-opacity': 0.6
        }));
      }
    };

    const onReady = () => {
      drawSideKpts(svgA, gA, pair.kpts1, pair.kpts_cmap, imgA);
      drawSideKpts(svgB, gB, pair.kpts2, pair.kpts_cmap, imgB);
      drawLines();
    };
    let aOk = imgA.complete && imgA.naturalWidth > 0;
    let bOk = imgB.complete && imgB.naturalWidth > 0;
    if (aOk && bOk) onReady();
    else {
      const check = () => { aOk = imgA.naturalWidth > 0; bOk = imgB.naturalWidth > 0; if (aOk && bOk) onReady(); };
      imgA.addEventListener('load', check);
      imgB.addEventListener('load', check);
    }
    new ResizeObserver(() => { if (imgA.naturalWidth && imgB.naturalWidth) drawLines(); }).observe(cardEl);

    return {
      element: cardEl, kind: '2d2d',
      apply(s) {
        gA.style.display = s.kpts1 ? '' : 'none';
        gB.style.display = s.kpts2 ? '' : 'none';
        gL.style.display = s.lines ? '' : 'none';
        gA.setAttribute('opacity', s.opacity);
        gB.setAttribute('opacity', s.opacity);
        gL.setAttribute('opacity', s.opacity);
      },
      onActivate() {}, onDeactivate() {}
    };
  }

  function buildCard2D3D(cardEl, pair, pcd, ctx) {
    cardEl.classList.add('cv-card', 'cv-card-2d3d');
    const halfA = document.createElement('div'); halfA.className = 'cv-half';
    const slot3D = document.createElement('div'); slot3D.className = 'cv-3d-slot';
    const imgEl = document.createElement('img'); imgEl.src = pair.image.src;
    const svgSide = svgEl('svg', { class: 'cv-overlay-side', preserveAspectRatio: 'xMidYMid meet' });
    halfA.append(imgEl, svgSide);
    cardEl.append(halfA, slot3D);

    const gK1 = svgEl('g', { class: 'cv-kpts1' });
    svgSide.appendChild(gK1);
    const onImgReady = () => {
      slot3D.style.aspectRatio = `${imgEl.naturalWidth} / ${imgEl.naturalHeight}`;
      svgSide.setAttribute('viewBox', `0 0 ${imgEl.naturalWidth} ${imgEl.naturalHeight}`);
      gK1.innerHTML = '';
      const sz = Math.max(imgEl.naturalWidth, imgEl.naturalHeight) * 0.008;
      for (let i = 0; i < pair.kpts1.length; i++) {
        const [x, y] = pair.kpts1[i];
        gK1.appendChild(svgEl('path', {
          d: `M${-sz} ${-sz} l${2 * sz} ${2 * sz} M${sz} ${-sz} l${-2 * sz} ${2 * sz}`,
          stroke: rgb(pair.kpts_cmap[i]),
          'stroke-width': sz * 0.4,
          'stroke-linecap': 'round',
          fill: 'none',
          transform: `translate(${x} ${y})`
        }));
      }
    };
    if (imgEl.complete && imgEl.naturalWidth > 0) onImgReady();
    else imgEl.addEventListener('load', onImgReady);

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0xd0d0d0);
    const root = new THREE.Group();
    root.rotation.x = Math.PI;
    scene.add(root);

    const points = buildPointCloud(pcd.pcd, pcd.cmap_redblue, 0.015);
    root.add(points);

    const localBbox = new THREE.Box3().setFromBufferAttribute(points.geometry.attributes.position);
    const size = localBbox.getSize(new THREE.Vector3());
    const maxDim = Math.max(size.x, size.y, size.z);
    const sScale = maxDim * 0.025;

    const kptGroup = buildKptSprites(pair.kpts2, pair.kpts_cmap, sScale);
    root.add(kptGroup);

    const bbox = new THREE.Box3().setFromObject(root);

    const camera = new THREE.PerspectiveCamera(50, 1, 0.001, 1000);

    return {
      element: cardEl, kind: '2d3d',
      slot3D, scene, camera, bbox,
      apply(s) {
        gK1.style.display = s.kpts1 ? '' : 'none';
        gK1.setAttribute('opacity', s.opacity);
        kptGroup.visible = s.kpts2;
        kptGroup.children.forEach(sp => { sp.material.opacity = s.opacity; });
      },
      onActivate() { ctx.attach(this); },
      onDeactivate() {}
    };
  }

  function buildCard3D3D(cardEl, pair, pcdData, ctx) {
    cardEl.classList.add('cv-card', 'cv-card-3d3d');
    const slot3D = document.createElement('div'); slot3D.className = 'cv-3d-slot';
    cardEl.append(slot3D);

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0xd0d0d0);
    const root = new THREE.Group();
    root.rotation.x = Math.PI;
    scene.add(root);

    const pA = buildPointCloud(pcdData.pcd1, pcdData.cmap1_redblue, 0.015);
    const pB = buildPointCloud(pcdData.pcd2, pcdData.cmap2_redblue, 0.015);
    const bA = new THREE.Box3().setFromBufferAttribute(pA.geometry.attributes.position);
    const bB = new THREE.Box3().setFromBufferAttribute(pB.geometry.attributes.position);
    const sA = bA.getSize(new THREE.Vector3());
    const sB = bB.getSize(new THREE.Vector3());

    let offset;
    if (Array.isArray(pair.offset) && pair.offset.length === 3) {
      offset = new THREE.Vector3().fromArray(pair.offset);
    } else {
      offset = new THREE.Vector3(sA.x / 2 + sB.x / 2 + Math.max(sA.x, sB.x) * 0.25, 0, 0);
    }
    pB.position.copy(offset);

    root.add(pA); root.add(pB);

    const kpts2off = pair.kpts2.map(p => [p[0] + offset.x, p[1] + offset.y, p[2] + offset.z]);
    const localFullBox = bA.clone().union(bB.clone().translate(offset));
    const fullSize = localFullBox.getSize(new THREE.Vector3());
    const sScale = Math.max(fullSize.x, fullSize.y, fullSize.z) * 0.012;

    const k1 = buildKptSprites(pair.kpts1, pair.kpts_cmap, sScale);
    const k2 = buildKptSprites(kpts2off, pair.kpts_cmap, sScale);
    const lines = buildCorrLines(pair.kpts1, kpts2off, pair.line_cmap);
    root.add(k1); root.add(k2); root.add(lines);

    const fullBox = new THREE.Box3().setFromObject(root);

    const camera = new THREE.PerspectiveCamera(50, 1, 0.001, 1000);

    return {
      element: cardEl, kind: '3d3d',
      slot3D, scene, camera, bbox: fullBox,
      apply(s) {
        k1.visible = s.kpts1;
        k2.visible = s.kpts2;
        lines.visible = s.lines;
        k1.children.forEach(sp => { sp.material.opacity = s.opacity; });
        k2.children.forEach(sp => { sp.material.opacity = s.opacity; });
        lines.material.opacity = s.opacity;
      },
      onActivate() { ctx.attach(this); },
      onDeactivate() {}
    };
  }

  function createRendererCtx() {
    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(window.devicePixelRatio);
    Object.assign(renderer.domElement.style, { display: 'block', width: '100%', height: '100%' });

    const ctx = {
      renderer,
      canvas: renderer.domElement,
      activeCard: null,
      controls: null,
      _started: false,
      attach(card) {
        if (ctx.activeCard === card) { ctx.resize(); return; }
        if (ctx.activeCard) {
          if (ctx.controls && ctx.controls.dispose) ctx.controls.dispose();
          ctx.controls = null;
          const prevSlot = ctx.activeCard.slot3D;
          if (renderer.domElement.parentNode === prevSlot) prevSlot.removeChild(renderer.domElement);
        }
        card.slot3D.appendChild(renderer.domElement);
        ctx.activeCard = card;
        ctx.controls = new THREE.TrackballControls(card.camera, renderer.domElement);
        ctx.controls.rotateSpeed = 2;
        ctx.controls.zoomSpeed = 1.2;
        ctx.controls.panSpeed = 1;
        ctx.controls.staticMoving = true;
        ctx.controls.dynamicDampingFactor = 0.3;
        ctx.resize();
        fitCameraToBox(card.camera, ctx.controls, card.bbox);
      },
      resize() {
        if (!ctx.activeCard) return;
        const slot = ctx.activeCard.slot3D;
        const w = slot.clientWidth, h = slot.clientHeight;
        if (w === 0 || h === 0) return;
        renderer.setSize(w, h, false);
        ctx.activeCard.camera.aspect = w / h;
        ctx.activeCard.camera.updateProjectionMatrix();
        if (ctx.controls && ctx.controls.handleResize) ctx.controls.handleResize();
      },
      animate() {
        requestAnimationFrame(ctx.animate);
        if (ctx.controls) ctx.controls.update();
        if (ctx.activeCard) renderer.render(ctx.activeCard.scene, ctx.activeCard.camera);
      },
      start() {
        if (ctx._started) return;
        ctx._started = true;
        ctx.animate();
      }
    };
    return ctx;
  }

  async function createCorrespondenceRow({ trackId, kind, pairs, controlsEl }) {
    const track = document.getElementById(trackId);
    if (!track) throw new Error('No track ' + trackId);
    track.innerHTML = '';

    const ctx = (kind === '2d2d') ? null : createRendererCtx();

    const cards = [];
    for (const pair of pairs) {
      const cardEl = document.createElement('div');
      cardEl.className = 'carousel-card';
      track.appendChild(cardEl);
      const data = await loadJSON(pair.url);
      let pcd = null;
      if (data.pcd && data.pcd.src) pcd = await loadJSON(data.pcd.src);
      if (data.kpts && data.kpts.src) {
        const kpts = await loadJSON(data.kpts.src);
        Object.assign(data, kpts);
      }
      let card;
      if (kind === '2d2d') card = buildCard2D2D(cardEl, data);
      else if (kind === '2d3d') card = buildCard2D3D(cardEl, data, pcd, ctx);
      else if (kind === '3d3d') card = buildCard3D3D(cardEl, data, pcd, ctx);
      cards.push(card);
    }

    const state = { kpts1: true, kpts2: true, lines: true, opacity: 1.0 };
    const apply = () => cards.forEach(c => c.apply(state));
    apply();

    if (ctx && cards.length > 0) {
      const ro = new ResizeObserver(() => ctx.resize());
      cards.forEach(c => { if (c.slot3D) ro.observe(c.slot3D); });
      cards[0].onActivate();
      ctx.start();
    }

    track.addEventListener('carousel:settled', () => {
      if (!ctx) return;
      const active = track.firstElementChild;
      const card = cards.find(c => c.element === active);
      if (!card || card === ctx.activeCard) return;
      card.onActivate();
      apply();
    });

    if (controlsEl) {
      controlsEl.classList.add('cv-controls');
      controlsEl.innerHTML = '';
      const mkCb = (key, label) => {
        const cb = document.createElement('input');
        cb.type = 'checkbox';
        cb.checked = true;
        cb.dataset.ctrl = key;
        cb.addEventListener('change', () => { state[key] = cb.checked; apply(); });
        const l = document.createElement('label');
        l.appendChild(cb);
        l.appendChild(document.createTextNode(' ' + label));
        return l;
      };
      controlsEl.appendChild(mkCb('kpts1', 'Keypoints 1'));
      controlsEl.appendChild(mkCb('kpts2', 'Keypoints 2'));
      if (kind !== '2d3d') controlsEl.appendChild(mkCb('lines', 'Correspondence lines'));
      const sl = document.createElement('input');
      sl.type = 'range';
      sl.min = 0; sl.max = 100; sl.value = 100;
      sl.dataset.ctrl = 'opacity';
      sl.addEventListener('input', () => { state.opacity = sl.value / 100; apply(); });
      const opL = document.createElement('label');
      opL.appendChild(document.createTextNode('Opacity '));
      opL.appendChild(sl);
      controlsEl.appendChild(opL);
    }

    return { state, cards, ctx };
  }

  window.createCorrespondenceRow = createCorrespondenceRow;
})();
