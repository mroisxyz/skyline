// Skyline Courier - sky, layered landscape, airfield and beacon rendering.
// All decorative detail is derived from the seeded scenery and sim time.
import { CANVAS, PALETTE, WORLD } from './config.js';
import { clamp, wrapAngle } from './physics.js';
import { riverCenterX } from './state.js';

export function paletteFor(state) {
  return state.timeOfDay === 'dusk' ? PALETTE.dusk : PALETTE.day;
}

// Chase camera: anchored behind the plane so the horizon never fights the pilot.
export function makeView(state) {
  const p = state.plane;
  return {
    cam: {
      x: p.x - Math.sin(p.hdg) * WORLD.camBack,
      y: p.y + WORLD.camUp,
      z: p.z - Math.cos(p.hdg) * WORLD.camBack
    },
    hdg: p.hdg,
    pitch: p.pitch,
    roll: p.roll,
    horizon: CANVAS.HORIZON + clamp(p.pitch, -0.5, 0.5) * 260 + clamp(p.vs * 0.22, -26, 26)
  };
}

// World point -> screen point. localZ is forward distance from the camera.
export function project(view, x, y, z) {
  const cs = Math.cos(view.hdg), sn = Math.sin(view.hdg);
  const dx = x - view.cam.x, dz = z - view.cam.z;
  const localZ = dx * sn + dz * cs;
  if (localZ < WORLD.near) return null;
  const localX = dx * cs - dz * sn;
  const s = WORLD.focal / localZ;
  return {
    x: CANVAS.CX + localX * s,
    y: view.horizon - (y - view.cam.y) * s,
    s,
    z: localZ
  };
}

function puff(ctx, x, y, rx, ry, fill) {
  ctx.fillStyle = fill;
  ctx.beginPath();
  ctx.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2);
  ctx.fill();
}

function hash(a, b) {
  const v = Math.sin(a * 127.1 + b * 311.7) * 43758.5453;
  return v - Math.floor(v);
}

function lerp(a, b, t) {
  return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
}

export function drawSky(ctx, state, view) {
  const c = paletteFor(state);
  const grad = ctx.createLinearGradient(0, 0, 0, view.horizon + 140);
  grad.addColorStop(0, c.skyTop);
  grad.addColorStop(0.62, c.skyMid);
  grad.addColorStop(1, c.skyLow);
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, CANVAS.W, CANVAS.H);

  const dusk = state.timeOfDay === 'dusk';
  const sunX = dusk ? 990 : 1030;
  const sunY = view.horizon - (dusk ? 92 : 168);
  const glow = ctx.createRadialGradient(sunX, sunY, 6, sunX, sunY, dusk ? 260 : 190);
  glow.addColorStop(0, c.sun);
  glow.addColorStop(0.16, c.sun + 'bb');
  glow.addColorStop(1, c.sun + '00');
  ctx.fillStyle = glow;
  ctx.fillRect(sunX - 270, sunY - 270, 540, 540);
  if (dusk) {
    ctx.globalAlpha = 0.16;
    ctx.strokeStyle = c.sun;
    ctx.lineWidth = 2;
    for (let i = 0; i < 7; i++) {
      const y = view.horizon - 26 - i * 17;
      ctx.beginPath();
      ctx.moveTo(sunX - 230 + i * 12, y);
      ctx.lineTo(sunX + 230 - i * 12, y);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
  }
  puff(ctx, sunX, sunY, dusk ? 34 : 27, dusk ? 34 : 27, c.sun);

  const clouds = state.scenery.clouds
    .map((cloud) => ({ cloud, pt: project(view, cloud.x, cloud.y, cloud.z) }))
    .filter((item) => item.pt && item.pt.y < view.horizon + 30)
    .sort((a, b) => b.pt.z - a.pt.z);
  for (const { cloud, pt } of clouds) {
    const w = cloud.w * pt.s;
    if (w < 4 || pt.x < -w * 2 || pt.x > CANVAS.W + w * 2) continue;
    ctx.globalAlpha = 0.26 + cloud.tone * 0.38;
    puff(ctx, pt.x, pt.y, w, w * 0.28, c.cloud);
    puff(ctx, pt.x - w * 0.44, pt.y + w * 0.07, w * 0.56, w * 0.2, c.cloudShade);
    puff(ctx, pt.x + w * 0.5, pt.y + w * 0.05, w * 0.5, w * 0.19, c.cloudShade);
    ctx.globalAlpha *= 0.6;
    puff(ctx, pt.x + w * 0.12, pt.y - w * 0.16, w * 0.42, w * 0.16, c.cloud);
  }
  ctx.globalAlpha = 1;
  const haze = ctx.createLinearGradient(0, view.horizon - 90, 0, view.horizon + 40);
  haze.addColorStop(0, c.skyLow + '00');
  haze.addColorStop(1, c.skyLow + '66');
  ctx.fillStyle = haze;
  ctx.fillRect(0, view.horizon - 90, CANVAS.W, 130);
}

function groundCorner(view, forward, lateral) {
  return {
    x: view.cam.x + Math.sin(view.hdg) * forward + Math.cos(view.hdg) * lateral,
    z: view.cam.z + Math.cos(view.hdg) * forward - Math.sin(view.hdg) * lateral
  };
}

function drawGroundBands(ctx, view, palette) {
  const steps = 48;
  const corner = (forward, lateral) => {
    const p = groundCorner(view, forward, lateral);
    return project(view, p.x, 0, p.z);
  };
  for (let i = steps - 1; i >= 0; i--) {
    const far = WORLD.near + (WORLD.viewDistance - WORLD.near) * ((i + 1) / steps) ** 1.7;
    const nearZ = WORLD.near + (WORLD.viewDistance - WORLD.near) * (i / steps) ** 1.7;
    const corners = [
      corner(far, -5200), corner(far, 5200),
      corner(nearZ, 5200), corner(nearZ, -5200)
    ];
    if (corners.some((p) => !p)) continue;
    ctx.fillStyle = i % 2 === 0 ? palette.ground : palette.groundAlt;
    ctx.beginPath();
    ctx.moveTo(corners[0].x, corners[0].y);
    for (let k = 1; k < 4; k++) ctx.lineTo(corners[k].x, corners[k].y);
    ctx.closePath();
    ctx.fill();
    if (i % 6 === 0) {
      ctx.strokeStyle = palette.field;
      ctx.globalAlpha = 0.16;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(corners[0].x, corners[0].y);
      ctx.lineTo(corners[1].x, corners[1].y);
      ctx.stroke();
      ctx.globalAlpha = 1;
    }
  }
}

function drawFarmland(ctx, view, palette, state) {
  const seed = state.scenery.seed;
  const tints = [palette.field, palette.ground, palette.groundAlt, '#9eb06f', '#8fa074', '#b0b47e'];
  const cells = [];
  for (let r = 10; r >= 0; r--) {
    const f0 = 150 + r * 430;
    const f1 = f0 + 410;
    for (let c = 0; c < 11; c++) {
      const l0 = -2640 + c * 520;
      const l1 = l0 + 496;
      const corners = [groundCorner(view, f0, l0), groundCorner(view, f1, l0),
        groundCorner(view, f1, l1), groundCorner(view, f0, l1)]
        .map((p) => project(view, p.x, 0, p.z));
      if (corners.some((p) => !p)) continue;
      cells.push({ corners, tone: hash(r * 13 + c, seed), r, c });
    }
  }
  cells.sort((a, b) => b.r - a.r);
  for (const cell of cells) {
    const { corners, tone, r, c } = cell;
    ctx.globalAlpha = 0.14 + tone * 0.2;
    ctx.fillStyle = tints[Math.floor(tone * tints.length) % tints.length];
    ctx.beginPath();
    ctx.moveTo(corners[0].x, corners[0].y);
    for (let k = 1; k < 4; k++) ctx.lineTo(corners[k].x, corners[k].y);
    ctx.closePath();
    ctx.fill();
    ctx.globalAlpha = 0.16;
    ctx.strokeStyle = palette.forest;
    ctx.lineWidth = 1;
    if (tone > 0.45) {
      for (let k = 1; k <= 3; k++) {
        const a = lerp(corners[0], corners[3], k / 4);
        const b = lerp(corners[1], corners[2], k / 4);
        ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
      }
    }
    if ((r + c) % 4 === 0) {
      ctx.globalAlpha = 0.22;
      ctx.strokeStyle = palette.detail;
      ctx.beginPath();
      ctx.moveTo(corners[0].x, corners[0].y);
      ctx.lineTo(corners[3].x, corners[3].y);
      ctx.stroke();
    }
  }
  ctx.globalAlpha = 1;
}

function drawCloudShadows(ctx, view, state, palette) {
  const drift = Math.sin(state.time * 0.08) * 22;
  for (const cloud of state.scenery.clouds) {
    const pt = project(view, cloud.x + drift, 0, cloud.z + drift * 0.5);
    if (!pt || pt.s < 0.005) continue;
    const r = cloud.w * pt.s * 0.95;
    if (r < 3 || pt.x < -r * 2 || pt.x > CANVAS.W + r * 2) continue;
    ctx.save();
    ctx.fillStyle = palette.forest;
    for (let i = 2; i >= 0; i--) {
      ctx.globalAlpha = (i === 0 ? 0.13 : 0.05) + cloud.tone * 0.02;
      ctx.beginPath();
      ctx.ellipse(pt.x + i * 6, pt.y, r * (1 + i * 0.26), r * (0.24 + i * 0.07),
        0, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }
}

function drawHills(ctx, view, palette, state) {
  const hills = state.scenery.hills.slice().sort((a, b) => b.z - a.z);
  let hazeDone = false;
  for (const hill of hills) {
    const base = project(view, hill.x, 0, hill.z);
    if (!base || base.y < view.horizon - 260 || base.y > CANVAS.H + 200) continue;
    const width = hill.w * base.s;
    const height = hill.h * base.s;
    if (width < 6 || base.x + width < 0 || base.x - width > CANVAS.W) continue;
    const far = hill.key === 'far';
    const peakX = base.x + width * (hill.tone - 0.5) * 0.1;
    const peakY = base.y - height;
    ctx.globalAlpha = far ? 0.62 : hill.key === 'mid' ? 0.86 : 0.95;
    ctx.fillStyle = far ? palette.hillFar : hill.key === 'mid' ? palette.hillMid : palette.hillNear;
    ctx.beginPath();
    ctx.moveTo(base.x - width * 0.58, base.y + 8);
    ctx.quadraticCurveTo(base.x - width * 0.4, base.y - height * 0.82, peakX - width * 0.06, peakY);
    ctx.quadraticCurveTo(peakX + width * 0.12, base.y - height * (0.7 + hill.tone * 0.2),
      base.x + width * 0.5, base.y + 8);
    ctx.closePath();
    ctx.fill();

    // A shaded right-hand face gives each ridge a consistent light direction.
    ctx.globalAlpha *= 0.45;
    ctx.fillStyle = '#16282b';
    ctx.beginPath();
    ctx.moveTo(peakX - width * 0.06, peakY);
    ctx.quadraticCurveTo(peakX + width * 0.12, base.y - height * (0.7 + hill.tone * 0.2),
      base.x + width * 0.5, base.y + 8);
    ctx.lineTo(peakX + width * 0.06, base.y + 8);
    ctx.closePath();
    ctx.fill();

    if (height > (far ? 70 : 34) && hill.tone > 0.28) {
      ctx.globalAlpha = far ? 0.55 : 0.85;
      ctx.fillStyle = far ? '#dce6e4' : '#eef3e8';
      ctx.beginPath();
      ctx.moveTo(peakX - width * 0.16, base.y - height * 0.7);
      ctx.quadraticCurveTo(peakX - width * 0.08, base.y - height * 0.9, peakX - width * 0.06, peakY);
      ctx.quadraticCurveTo(peakX + width * 0.02, base.y - height * 0.86,
        peakX + width * 0.19, base.y - height * 0.64);
      ctx.lineTo(peakX + width * 0.09, base.y - height * 0.72);
      ctx.lineTo(peakX, base.y - height * 0.61);
      ctx.lineTo(peakX - width * 0.07, base.y - height * 0.69);
      ctx.closePath();
      ctx.fill();
    }
    if (!far && !hazeDone) {
      hazeDone = true;
      const band = ctx.createLinearGradient(0, view.horizon - 80, 0, view.horizon + 30);
      band.addColorStop(0, palette.skyLow + '00');
      band.addColorStop(1, palette.skyLow + '55');
      ctx.globalAlpha = 1;
      ctx.fillStyle = band;
      ctx.fillRect(0, view.horizon - 80, CANVAS.W, 110);
    }
  }
  ctx.globalAlpha = 1;
}

function drawRiver(ctx, view, palette, state) {
  const phase = state.scenery.riverPhase;
  const left = [], right = [], center = [];
  for (let forward = WORLD.near + 20; forward < WORLD.viewDistance; forward += 90) {
    const z = view.cam.z + Math.cos(view.hdg) * forward;
    const c = riverCenterX(z, state.scenery) + Math.sin(z / 340 + phase) * 22;
    const a = project(view, c - 74, 0, z);
    const b = project(view, c + 74, 0, z);
    const m = project(view, c, 0, z);
    if (!a || !b || !m) continue;
    left.push(a); right.push(b); center.push(m);
  }
  if (left.length < 2) return;
  ctx.fillStyle = palette.river;
  ctx.beginPath();
  ctx.moveTo(left[0].x, left[0].y);
  for (const p of left.slice(1)) ctx.lineTo(p.x, p.y);
  for (let i = right.length - 1; i >= 0; i--) ctx.lineTo(right[i].x, right[i].y);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = palette.riverEdge;
  ctx.globalAlpha = 0.55;
  ctx.lineWidth = 2;
  for (const edge of [left, right]) {
    ctx.beginPath();
    edge.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)));
    ctx.stroke();
  }
  ctx.globalAlpha = 0.26;
  ctx.lineWidth = 3;
  ctx.beginPath();
  center.forEach((p, i) => (i ? ctx.lineTo(p.x - 8, p.y) : ctx.moveTo(p.x - 8, p.y)));
  ctx.stroke();
  const shimmer = Math.floor(state.time * 2);
  ctx.globalAlpha = 0.42;
  ctx.lineWidth = 2;
  for (let i = 1; i < center.length - 1; i++) {
    if ((i + shimmer) % 4 !== 0) continue;
    const p = center[i];
    ctx.beginPath();
    ctx.moveTo(p.x - 26, p.y); ctx.lineTo(p.x + 22, p.y - 1);
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
}

function drawRoads(ctx, view, palette) {
  const field = { x: WORLD.runway.x, z: WORLD.runway.z0 + 120 };
  const routes = [
    [WORLD.towns[0], WORLD.towns[1]],
    [WORLD.towns[0], field],
    [WORLD.towns[1], field]
  ];
  const segments = [];
  for (const [from, to] of routes) {
    const dx = to.x - from.x, dz = to.z - from.z;
    const len = Math.hypot(dx, dz) || 1;
    const px = -dz / len * 15, pz = dx / len * 15;
    const count = Math.max(2, Math.ceil(len / 170));
    for (let i = 0; i < count; i++) {
      const t0 = i / count, t1 = (i + 1) / count;
      const a = { x: from.x + dx * t0, z: from.z + dz * t0 };
      const b = { x: from.x + dx * t1, z: from.z + dz * t1 };
      const world = [
        { x: a.x + px, z: a.z + pz }, { x: b.x + px, z: b.z + pz },
        { x: b.x - px, z: b.z - pz }, { x: a.x - px, z: a.z - pz }
      ];
      const corners = world.map((p) => project(view, p.x, 0, p.z));
      const ca = project(view, a.x, 0, a.z);
      const cb = project(view, b.x, 0, b.z);
      if (corners.some((p) => !p) || !ca || !cb) continue;
      segments.push({ corners, ca, cb, z: (ca.z + cb.z) * 0.5, i });
    }
  }
  segments.sort((a, b) => b.z - a.z);
  for (const seg of segments) {
    ctx.fillStyle = palette.hillNear;
    ctx.globalAlpha = 0.78;
    ctx.beginPath();
    ctx.moveTo(seg.corners[0].x, seg.corners[0].y);
    for (let k = 1; k < 4; k++) ctx.lineTo(seg.corners[k].x, seg.corners[k].y);
    ctx.closePath(); ctx.fill();
    if (seg.i % 2 === 0) {
      ctx.globalAlpha = 0.5;
      ctx.strokeStyle = palette.detail;
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      ctx.moveTo(seg.ca.x, seg.ca.y); ctx.lineTo(seg.cb.x, seg.cb.y);
      ctx.stroke();
    }
  }
  ctx.globalAlpha = 1;
}

function drawTreesAndTowns(ctx, view, palette, state) {
  const items = [];
  for (const tree of state.scenery.trees) {
    const pt = project(view, tree.x, 0, tree.z);
    if (pt) items.push({ pt, kind: 'tree', data: tree });
  }
  for (const house of state.scenery.houses) {
    const pt = project(view, house.x, 0, house.z);
    if (pt) items.push({ pt, kind: 'house', data: house });
  }
  items.sort((a, b) => b.pt.z - a.pt.z);
  for (const item of items) {
    const { pt, data, kind } = item;
    const h = (kind === 'tree' ? data.h : data.h || 22) * pt.s;
    if (h < 2 || pt.x < -60 || pt.x > CANVAS.W + 60 || pt.y > CANVAS.H + 60) continue;
    if (kind === 'tree') {
      const w = h * 0.42;
      ctx.fillStyle = '#3c332a';
      ctx.fillRect(pt.x - w * 0.08, pt.y - h * 0.34, Math.max(1, w * 0.16), h * 0.36);
      ctx.globalAlpha = 0.28;
      puff(ctx, pt.x + w * 0.3, pt.y + 1, w * 0.8, w * 0.2, palette.forest);
      ctx.globalAlpha = 1;
      ctx.fillStyle = data.tone > 0.5 ? palette.forest : palette.hillNear;
      ctx.beginPath();
      ctx.moveTo(pt.x, pt.y - h);
      ctx.lineTo(pt.x - w, pt.y - h * 0.22);
      ctx.lineTo(pt.x + w, pt.y - h * 0.22);
      ctx.closePath(); ctx.fill();
      ctx.fillStyle = 'rgba(18, 36, 31, 0.35)';
      ctx.beginPath();
      ctx.moveTo(pt.x, pt.y - h);
      ctx.lineTo(pt.x + w, pt.y - h * 0.22);
      ctx.lineTo(pt.x, pt.y - h * 0.22);
      ctx.closePath(); ctx.fill();
      if (h > 12 && data.tone < 0.4) {
        ctx.fillStyle = data.tone > 0.2 ? palette.forest : palette.hillNear;
        ctx.beginPath();
        ctx.moveTo(pt.x, pt.y - h * 0.78);
        ctx.lineTo(pt.x - w * 0.78, pt.y - h * 0.1);
        ctx.lineTo(pt.x + w * 0.78, pt.y - h * 0.1);
        ctx.closePath(); ctx.fill();
      }
    } else {
      const w = Math.max(3, (data.w || 26) * pt.s);
      ctx.globalAlpha = 0.25;
      puff(ctx, pt.x + w * 0.24, pt.y + 1, w * 0.7, w * 0.2, palette.hillNear);
      ctx.globalAlpha = 1;
      ctx.fillStyle = palette.town;
      ctx.fillRect(pt.x - w / 2, pt.y - h, w, h);
      ctx.fillStyle = 'rgba(90, 70, 54, 0.28)';
      ctx.fillRect(pt.x, pt.y - h, w / 2, h);
      const roofTint = data.roof > 0.5 ? palette.roof : '#8c5f4c';
      ctx.fillStyle = roofTint;
      ctx.beginPath();
      ctx.moveTo(pt.x - w * 0.62, pt.y - h);
      ctx.lineTo(pt.x, pt.y - h * 1.42);
      ctx.lineTo(pt.x + w * 0.62, pt.y - h);
      ctx.closePath(); ctx.fill();
      if (h > 7) {
        ctx.fillStyle = state.timeOfDay === 'dusk' ? PALETTE.dusk.sun : palette.detail;
        ctx.globalAlpha = state.timeOfDay === 'dusk' ? 0.95 : 0.6;
        ctx.fillRect(pt.x - w * 0.26, pt.y - h * 0.72, w * 0.2, h * 0.2);
        ctx.fillRect(pt.x + w * 0.08, pt.y - h * 0.72, w * 0.2, h * 0.2);
        ctx.globalAlpha = 1;
      }
      if (h > 16 && data.roof > 0.7) {
        ctx.fillStyle = palette.roof;
        ctx.fillRect(pt.x + w * 0.22, pt.y - h * 1.5, Math.max(2, w * 0.14), h * 0.24);
      }
      if (data.name && pt.y < CANVAS.H - 100) {
        const label = data.name.toUpperCase();
        ctx.font = 'bold 13px ui-monospace, monospace';
        const tw = ctx.measureText(label).width;
        ctx.fillStyle = 'rgba(12, 26, 30, 0.55)';
        ctx.fillRect(pt.x - tw / 2 - 6, pt.y - h * 1.85 - 12, tw + 12, 18);
        ctx.fillStyle = palette.town;
        ctx.textAlign = 'center';
        ctx.fillText(label, pt.x, pt.y - h * 1.85);
      }
    }
  }
}

export function drawTerrain(ctx, state, view) {
  const palette = paletteFor(state);
  drawGroundBands(ctx, view, palette);
  drawFarmland(ctx, view, palette, state);
  drawCloudShadows(ctx, view, state, palette);
  drawHills(ctx, view, palette, state);
  drawRiver(ctx, view, palette, state);
  drawRoads(ctx, view, palette);
  drawTreesAndTowns(ctx, view, palette, state);
}

function runwayQuad(ctx, view, x0, x1, z0, z1) {
  const corners = [
    project(view, x0, 0, z0), project(view, x1, 0, z0),
    project(view, x1, 0, z1), project(view, x0, 0, z1)
  ];
  if (corners.some((p) => !p)) return null;
  ctx.beginPath();
  ctx.moveTo(corners[0].x, corners[0].y);
  for (let i = 1; i < 4; i++) ctx.lineTo(corners[i].x, corners[i].y);
  ctx.closePath();
  return corners;
}

function drawWindsock(ctx, view, state, palette) {
  const rw = WORLD.runway;
  const x = rw.x - rw.width / 2 - 62;
  const z = rw.z0 + 110;
  const base = project(view, x, 0, z);
  const top = project(view, x, 34, z);
  if (!base || !top) return;
  const pole = base.y - top.y;
  if (Math.abs(pole) < 3) return;
  ctx.strokeStyle = '#d8d6c2';
  ctx.lineWidth = clamp(2 * top.s, 1, 4);
  ctx.beginPath(); ctx.moveTo(base.x, base.y); ctx.lineTo(top.x, top.y); ctx.stroke();
  const sway = Math.sin(state.time * 1.3) * 0.22 + 0.85;
  const len = pole * 0.62;
  const dx = len * sway, dy = len * 0.2;
  const rings = 4;
  for (let i = 0; i < rings; i++) {
    const t0 = i / rings, t1 = (i + 1) / rings;
    const w0 = pole * (0.17 - t0 * 0.1), w1 = pole * (0.17 - t1 * 0.1);
    ctx.fillStyle = i % 2 ? '#e8e2cd' : '#b45a4e';
    ctx.beginPath();
    ctx.moveTo(top.x + dx * t0, top.y + dy * t0 - w0);
    ctx.lineTo(top.x + dx * t1, top.y + dy * t1 - w1);
    ctx.lineTo(top.x + dx * t1, top.y + dy * t1 + w1);
    ctx.lineTo(top.x + dx * t0, top.y + dy * t0 + w0);
    ctx.closePath(); ctx.fill();
  }
  ctx.fillStyle = palette.detail;
  ctx.beginPath(); ctx.arc(top.x, top.y, clamp(2 * top.s, 1.5, 4), 0, Math.PI * 2); ctx.fill();
}

function drawRunwayLights(ctx, view, state, z, positions) {
  for (let i = 0; i < positions.length; i++) {
    const x = positions[i];
    const pt = project(view, x, 1.5, z);
    if (!pt || pt.s < 0.02) continue;
    const r = clamp(3.4 * pt.s * 6, 1.5, 6);
    const pulse = 0.62 + 0.38 * Math.sin(state.time * 3 + z * 0.01 + i);
    const glow = ctx.createRadialGradient(pt.x, pt.y, 0, pt.x, pt.y, r * 3);
    glow.addColorStop(0, PALETTE.gold);
    glow.addColorStop(0.3, PALETTE.gold + '99');
    glow.addColorStop(1, PALETTE.gold + '00');
    ctx.globalAlpha = pulse;
    ctx.fillStyle = glow;
    ctx.fillRect(pt.x - r * 3, pt.y - r * 3, r * 6, r * 6);
    ctx.globalAlpha = 1;
    ctx.fillStyle = '#fff2cd';
    ctx.beginPath(); ctx.arc(pt.x, pt.y, r * 0.7, 0, Math.PI * 2); ctx.fill();
  }
}

export function drawRunway(ctx, state, view) {
  const rw = WORLD.runway;
  const c = paletteFor(state);
  // Grass shoulder first, so the asphalt reads as cut into the fields.
  if (!runwayQuad(ctx, view, rw.x - rw.width / 2 - 34, rw.x + rw.width / 2 + 34,
    rw.z0 - 190, rw.z1 + 190)) return;
  ctx.fillStyle = c.field;
  ctx.fill();
  ctx.strokeStyle = c.hillNear;
  ctx.globalAlpha = 0.35;
  ctx.lineWidth = 2;
  ctx.stroke();
  ctx.globalAlpha = 1;

  if (!runwayQuad(ctx, view, rw.x - rw.width / 2, rw.x + rw.width / 2, rw.z0, rw.z1)) return;
  ctx.fillStyle = '#39474d';
  ctx.fill();
  ctx.strokeStyle = c.detail;
  ctx.globalAlpha = 0.7;
  ctx.lineWidth = 2;
  ctx.stroke();
  ctx.globalAlpha = 1;

  // Centreline dashes.
  for (let z = rw.z0 + 110; z < rw.z1 - 60; z += 140) {
    if (runwayQuad(ctx, view, rw.x - 2.6, rw.x + 2.6, z, z + 64)) {
      ctx.fillStyle = c.detail;
      ctx.globalAlpha = 0.92;
      ctx.fill();
      ctx.globalAlpha = 1;
    }
  }
  // Threshold piano keys.
  for (let i = 0; i < 8; i++) {
    const x = rw.x - 40 + i * 10;
    if (runwayQuad(ctx, view, x, x + 5.6, rw.z0 + 26, rw.z0 + 80)) {
      ctx.fillStyle = c.detail;
      ctx.fill();
    }
  }
  // Touchdown-zone and aiming-point bars.
  for (const z of [rw.z0 + 250, rw.z0 + 450, rw.z0 + 700]) {
    for (const side of [-1, 1]) {
      if (runwayQuad(ctx, view, rw.x + side * 9, rw.x + side * 34,
        z, z + (z > rw.z0 + 600 ? 44 : 30))) {
        ctx.fillStyle = c.detail;
        ctx.globalAlpha = 0.8;
        ctx.fill();
        ctx.globalAlpha = 1;
      }
    }
  }
  // Edge lights and an approach lighting bar before the threshold.
  for (let z = rw.z0; z < rw.z1; z += 180) {
    for (const side of [-1, 1]) {
      const x = rw.x + side * (rw.width / 2 + 10);
      const pt = project(view, x, 1, z);
      if (!pt || pt.s < 0.02) continue;
      drawRunwayLights(ctx, view, state, z, [x]);
    }
  }
  const approachRow = (count) => Array.from({ length: count }, (_, i) =>
    rw.x - rw.width / 2 - 14 + (rw.width + 28) * (count === 1 ? 0.5 : i / (count - 1)));
  drawRunwayLights(ctx, view, state, rw.z0 - 130, approachRow(9));
  drawRunwayLights(ctx, view, state, rw.z0 - 70, approachRow(7));

  const mark = project(view, rw.x, 0, rw.z0 + 200);
  if (mark && mark.s > 0.08) {
    const size = Math.min(74, 58 * mark.s * 4);
    ctx.font = `bold ${size}px ui-monospace, monospace`;
    ctx.textAlign = 'center';
    ctx.lineWidth = 5;
    ctx.strokeStyle = 'rgba(20, 28, 30, 0.55)';
    ctx.strokeText('09', mark.x, mark.y);
    ctx.fillStyle = c.detail;
    ctx.fillText('09', mark.x, mark.y);
  }
  drawWindsock(ctx, view, state, c);
}

export function drawTargetRings(ctx, state, view) {
  const rings = WORLD.rings
    .map((ring, i) => ({ ring, i, pt: project(view, ring.x, ring.y, ring.z) }))
    .filter((item) => item.pt && item.pt.z < 6400)
    .sort((a, b) => b.pt.z - a.pt.z);
  for (const { ring, i, pt } of rings) {
    const r = ring.radius * pt.s;
    if (r < 5 || pt.x < -r * 2 || pt.x > CANVAS.W + r * 2) continue;
    const passed = i < state.mission.ringsPassed;
    const active = i === state.mission.ringsPassed;
    const alpha = passed ? 0.22 : active ? 1 : 0.52;
    ctx.globalAlpha = alpha;
    const glow = ctx.createRadialGradient(pt.x, pt.y, r * 0.5, pt.x, pt.y, r * 1.6);
    glow.addColorStop(0, PALETTE.gold + '22');
    glow.addColorStop(0.55, PALETTE.gold + '88');
    glow.addColorStop(1, PALETTE.gold + '00');
    ctx.fillStyle = glow;
    ctx.fillRect(pt.x - r * 1.7, pt.y - r * 1.7, r * 3.4, r * 3.4);
    ctx.strokeStyle = passed ? cDim() : PALETTE.gold;
    ctx.lineWidth = Math.max(2, r * 0.075);
    ctx.beginPath(); ctx.arc(pt.x, pt.y, r, 0, Math.PI * 2); ctx.stroke();
    ctx.lineWidth = Math.max(1, r * 0.02);
    ctx.strokeStyle = '#fff5d6';
    ctx.beginPath(); ctx.arc(pt.x, pt.y, r * 0.82, 0, Math.PI * 2); ctx.stroke();
    for (let d = 0; d < 8; d++) {
      const a = d * Math.PI / 4 + state.time * 0.45;
      ctx.beginPath(); ctx.arc(pt.x, pt.y, r * 1.14, a, a + 0.2); ctx.stroke();
    }
    if (active && r > 26) {
      ctx.fillStyle = PALETTE.gold;
      ctx.font = 'bold 14px ui-monospace, monospace';
      ctx.textAlign = 'center';
      ctx.fillText(`BEACON ${i + 1}  ${Math.round(pt.z)}m`, pt.x, pt.y - r - 16);
    }
    ctx.globalAlpha = 1;
  }
}

function cDim() { return '#8f9a84'; }
