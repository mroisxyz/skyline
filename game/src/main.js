// Skyline Courier - boot, fixed-step simulation loop and module wiring.
// HUD composition is derived entirely from the frozen or live flight state.
import { CANVAS, MISSIONS, PALETTE, STEP, WORLD } from './config.js';
import { createState, currentRing, resetFlight, setMission } from './state.js';
import { clamp, wrapAngle } from './physics.js';
import { updateFlight } from './physics.js';
import { createInput, readInput } from './input.js';
import { drawSky, drawTerrain, drawRunway, drawTargetRings, makeView } from './scenery.js';
import { drawAircraft } from './aircraft.js';
import { drawPanel, drawHUD } from './instruments.js';
import { applyShot } from './shots.js';

const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');
const query = new URLSearchParams(window.location.search);
const seedValue = Number(query.get('seed'));
const seed = Number.isFinite(seedValue) && query.has('seed') ? Math.floor(seedValue) : 11;
const state = createState(seed);
applyShot(state, query);
const input = createInput(canvas);

function applyControls(controls) {
  const p = state.plane;
  if (controls.gearToggle) p.gear = !p.gear;
  if (controls.restart) resetFlight(state);
  if (controls.mission >= 0) setMission(state, controls.mission);
  updateFlight(state, controls, STEP);
}

// One deterministic target distance shared by the strip and the sky callout.
function targetInfo(state) {
  const mission = MISSIONS[state.missionIndex];
  const p = state.plane;
  if (mission.kind === 'rings') {
    const ring = currentRing(state);
    return {
      label: 'TARGET BEACON',
      distance: ring ? Math.round(Math.hypot(ring.x - p.x, ring.z - p.z)) : 0,
      done: !ring
    };
  }
  if (mission.kind === 'landing') {
    return {
      label: 'RUNWAY 09',
      distance: Math.max(0, Math.round(p.z - WORLD.runway.z0)),
      done: false
    };
  }
  const stop = WORLD.towns[1];
  return {
    label: state.mission.townReached ? 'SKYLINE FIELD' : 'ALDER QUAY',
    distance: Math.round(Math.hypot(p.x - stop.x, p.z - stop.z)),
    done: false
  };
}

// The same target as a world point, used by the bearing needle.
function targetPoint(state) {
  const mission = MISSIONS[state.missionIndex];
  if (mission.kind === 'rings') return currentRing(state);
  if (mission.kind === 'landing') return { x: WORLD.runway.x, z: WORLD.runway.z0 + 260 };
  return state.mission.townReached ? WORLD.towns[2] : WORLD.towns[1];
}

// Hull damage plus a fixed score made from gates, routes and remaining fuel.
function sortieStats(state) {
  const p = state.plane;
  const mission = MISSIONS[state.missionIndex];
  const target = targetInfo(state);
  const damage = Math.max(0, Math.min(100, Math.round(p.damage)));
  const gates = state.mission.ringsPassed * 350;
  const cleared = state.mission.complete ? 600 : 0;
  const approach = mission.kind === 'rings' && !target.done
    ? Math.max(0, 300 - Math.floor(target.distance / 25))
    : Math.max(0, Math.round(p.fuel) * 2);
  return { damage, score: Math.max(0, state.score + gates + cleared + approach) };
}

function box(ctx, x, y, w, h, accent) {
  ctx.fillStyle = 'rgba(8, 20, 25, 0.68)';
  ctx.fillRect(x, y, w, h);
  ctx.strokeStyle = 'rgba(150, 220, 185, 0.35)';
  ctx.lineWidth = 1;
  ctx.strokeRect(x + 0.5, y + 0.5, w, h);
  ctx.fillStyle = accent || PALETTE.gold;
  ctx.fillRect(x, y, 4, h);
}

function drawMissionStrip(ctx, state) {
  const mission = MISSIONS[state.missionIndex];
  const p = state.plane;
  const target = targetInfo(state);
  let label = '';
  let detail = '';
  let filled = 0;
  let total = 1;
  if (mission.kind === 'rings') {
    const ring = currentRing(state);
    total = WORLD.rings.length;
    filled = state.mission.ringsPassed;
    label = `BEACON ${Math.min(filled + 1, total)}/${total}`;
    detail = ring ? `${target.distance} m to gate` : 'ROUTE COMPLETE';
  } else if (mission.kind === 'landing') {
    label = `RUNWAY 09 · ${target.distance} m`;
    detail = p.gear
      ? (Math.abs(p.x) < WORLD.runway.width / 2 ? 'GEAR DOWN · CENTRELINE' : 'GEAR DOWN · CORRECT LEFT/RIGHT')
      : 'GEAR UP · SELECT DOWN';
    filled = p.gear ? 1 : 0;
  } else {
    const distance = target.distance;
    label = state.mission.townReached ? `RETURN · ${distance} m` : `ALDER QUAY · ${distance} m`;
    detail = state.mission.townReached ? 'LAND AT SKYLINE FIELD' : 'OUTBOUND MAIL RUN';
    total = 2;
    filled = state.mission.townReached ? 1 : 0;
  }
  const x = 832, y = 18, w = 426, h = 48;
  box(ctx, x, y, w, h);
  for (let i = 0; i < total; i++) {
    ctx.globalAlpha = i < filled ? 1 : 0.28;
    ctx.fillRect(x + w - 14 - i * 12, y + 9, 8, 4);
  }
  ctx.globalAlpha = 1;
  ctx.textAlign = 'left';
  ctx.fillStyle = PALETTE.gold;
  ctx.font = 'bold 11px ui-monospace, monospace';
  ctx.fillText('MISSION PROGRESS', x + 14, y + 17);
  ctx.fillStyle = PALETTE.hud;
  ctx.font = 'bold 16px ui-monospace, monospace';
  ctx.fillText(label, x + 14, y + 38);
  ctx.textAlign = 'right';
  ctx.fillStyle = PALETTE.hudDim;
  ctx.font = '11px ui-monospace, monospace';
  ctx.fillText(detail, x + w - 12, y + 37);
}

// Bottom-corner strips: left shows energy state, right shows sortie results.
function drawSortiePanel(ctx, state) {
  const { damage, score } = sortieStats(state);
  const p = state.plane;
  const lx = 22, ly = 518, lw = 236, lh = 58;
  box(ctx, lx, ly, lw, lh, PALETTE.hudDim);
  ctx.textAlign = 'left';
  ctx.font = 'bold 10px ui-monospace, monospace';
  ctx.fillStyle = p.fuel < 22 ? PALETTE.warn : PALETTE.hudDim;
  ctx.fillText('FUEL', lx + 14, ly + 16);
  ctx.fillStyle = 'rgba(150, 220, 185, 0.18)';
  ctx.fillRect(lx + 56, ly + 9, 118, 8);
  ctx.fillStyle = p.fuel < 22 ? PALETTE.warn : PALETTE.gold;
  ctx.fillRect(lx + 56, ly + 9, 118 * clamp(p.fuel / 100, 0, 1), 8);
  ctx.fillStyle = '#dff3e2';
  ctx.fillText(`${Math.round(p.fuel)}%`, lx + 182, ly + 17);
  ctx.fillStyle = PALETTE.hudDim;
  ctx.fillText('THR', lx + 14, ly + 38);
  ctx.fillStyle = 'rgba(150, 220, 185, 0.18)';
  ctx.fillRect(lx + 56, ly + 31, 118, 8);
  ctx.fillStyle = PALETTE.gold;
  ctx.fillRect(lx + 56, ly + 31, 118 * clamp(p.throttle, 0, 1), 8);
  ctx.fillStyle = '#dff3e2';
  ctx.fillText(`${Math.round(p.throttle * 100)}%`, lx + 182, ly + 39);

  const rx = 1022, ry = 518, rw = 236, rh = 58;
  box(ctx, rx, ry, rw, rh);
  ctx.textAlign = 'left';
  ctx.fillStyle = PALETTE.hudDim;
  ctx.font = 'bold 10px ui-monospace, monospace';
  ctx.fillText('SCORE', rx + 14, ry + 16);
  ctx.fillStyle = PALETTE.gold;
  ctx.font = 'bold 20px ui-monospace, monospace';
  ctx.fillText(String(score).padStart(4, '0'), rx + 14, ry + 37);
  ctx.font = 'bold 10px ui-monospace, monospace';
  ctx.fillStyle = damage > 45 ? PALETTE.warn : PALETTE.hudDim;
  ctx.textAlign = 'right';
  ctx.fillText(`HULL ${damage}%`, rx + rw - 12, ry + 17);
  for (let i = 0; i < 10; i++) {
    ctx.fillStyle = damage < (i + 1) * 10 ? (i < 7 ? '#76d99a' : '#e8b566') : '#3a2b2b';
    ctx.fillRect(rx + rw - 12 - i * 10, ry + 32, 7, 10);
  }
}

// Bracketed target distance in the clear sky below the readouts.
function drawTargetCallout(ctx, state) {
  const target = targetInfo(state);
  const point = targetPoint(state);
  const p = state.plane;
  const bearing = point
    ? wrapAngle(Math.atan2(point.x - p.x, point.z - p.z) - p.hdg)
    : 0;
  const text = target.done ? '[ ROUTE COMPLETE ]' : `[ ${target.label} · ${target.distance} m ]`;
  const w = 330, h = 20, x = CANVAS.CX - w / 2, y = 78;
  ctx.fillStyle = 'rgba(8, 20, 25, 0.58)';
  ctx.fillRect(x, y, w, h);
  ctx.strokeStyle = 'rgba(255, 210, 113, 0.55)';
  ctx.lineWidth = 1;
  ctx.strokeRect(x + 0.5, y + 0.5, w, h);
  ctx.save();
  ctx.translate(x + 17, y + 10);
  ctx.rotate(clamp(bearing, -Math.PI * 0.55, Math.PI * 0.55));
  ctx.fillStyle = PALETTE.gold;
  ctx.beginPath();
  ctx.moveTo(0, -6); ctx.lineTo(5, 4); ctx.lineTo(0, 1); ctx.lineTo(-5, 4);
  ctx.closePath(); ctx.fill();
  ctx.restore();
  ctx.textAlign = 'center';
  ctx.font = 'bold 13px ui-monospace, monospace';
  ctx.lineWidth = 2.5;
  ctx.strokeStyle = 'rgba(4, 14, 18, 0.8)';
  ctx.strokeText(text, CANVAS.CX + 8, y + 14);
  ctx.fillStyle = PALETTE.gold;
  ctx.fillText(text, CANVAS.CX + 8, y + 14);
}

// A larger needle under the callout points where the pilot must turn.
function drawNavCue(ctx, state) {
  const target = targetInfo(state);
  if (target.done) return;
  const point = targetPoint(state);
  if (!point) return;
  const p = state.plane;
  const bearing = wrapAngle(Math.atan2(point.x - p.x, point.z - p.z) - p.hdg);
  const degrees = Math.abs(Math.round(bearing * 180 / Math.PI));
  const cx = CANVAS.CX, cy = 146;
  ctx.fillStyle = 'rgba(8, 20, 25, 0.45)';
  ctx.fillRect(cx - 86, cy - 16, 172, 32);
  ctx.strokeStyle = 'rgba(150, 220, 185, 0.28)';
  ctx.lineWidth = 1;
  ctx.strokeRect(cx - 85.5, cy - 15.5, 171, 31);
  ctx.save();
  ctx.translate(cx - 62, cy);
  ctx.rotate(clamp(bearing, -Math.PI * 0.62, Math.PI * 0.62));
  ctx.strokeStyle = PALETTE.gold;
  ctx.fillStyle = PALETTE.gold;
  ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(0, 9); ctx.lineTo(0, -9); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(0, -12); ctx.lineTo(-6, -2); ctx.lineTo(6, -2);
  ctx.closePath(); ctx.fill();
  ctx.restore();
  ctx.textAlign = 'left';
  ctx.font = 'bold 11px ui-monospace, monospace';
  ctx.fillStyle = PALETTE.hudDim;
  ctx.fillText('TGT', cx - 46, cy - 1);
  ctx.fillStyle = PALETTE.hud;
  ctx.font = 'bold 15px ui-monospace, monospace';
  ctx.fillText(`${target.distance} m`, cx - 14, cy + 2);
  ctx.font = 'bold 10px ui-monospace, monospace';
  ctx.fillStyle = PALETTE.hudDim;
  ctx.fillText(`${degrees}° ${bearing > 0 ? 'R' : 'L'}`, cx + 56, cy + 1);
}

// Transient banners turn state transitions into readable cockpit feedback.
function drawFeedbackBanner(ctx, state) {
  const p = state.plane;
  let text = '';
  let color = PALETTE.gold;
  if (p.crashed) { text = 'AIRFRAME LOST  ·  PRESS R TO RESTART'; color = PALETTE.warn; }
  else if (state.mission.complete) { text = 'DELIVERY COMPLETE  ·  ROUTE CLEARED'; color = PALETTE.gold; }
  else if (p.landed) { text = 'TOUCHDOWN LOGGED'; color = PALETTE.hud; }
  else if (p.stall) { text = 'STALL WARNING  ·  LOWER THE NOSE'; color = PALETTE.warn; }
  if (!text) return;
  const w = 560, h = 44, x = CANVAS.CX - w / 2, y = 232;
  ctx.fillStyle = 'rgba(8, 20, 25, 0.82)';
  ctx.fillRect(x, y, w, h);
  ctx.strokeStyle = color;
  ctx.lineWidth = 2;
  ctx.strokeRect(x + 1, y + 1, w - 2, h - 2);
  ctx.fillStyle = color;
  ctx.font = 'bold 19px ui-monospace, monospace';
  ctx.textAlign = 'center';
  ctx.fillText(text, CANVAS.CX, y + 29);
}

export function render() {
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, CANVAS.W, CANVAS.H);
  const view = makeView(state);
  drawSky(ctx, state, view);
  ctx.save();
  ctx.translate(CANVAS.CX, CANVAS.CY);
  ctx.rotate(-state.plane.roll * 0.55);
  ctx.translate(-CANVAS.CX, -CANVAS.CY);
  drawTerrain(ctx, state, view);
  drawRunway(ctx, state, view);
  drawTargetRings(ctx, state, view);
  ctx.restore();
  drawAircraft(ctx, state, view);
  drawPanel(ctx, state);
  drawHUD(ctx, state, view);
  drawTargetCallout(ctx, state);
  drawNavCue(ctx, state);
  drawMissionStrip(ctx, state);
  drawSortiePanel(ctx, state);
  drawFeedbackBanner(ctx, state);
}

let lastFrame = 0;
let accumulator = 0;
function frame(now) {
  if (!state.frozen) {
    const elapsed = lastFrame ? Math.min(0.12, (now - lastFrame) / 1000) : STEP;
    accumulator += elapsed;
    while (accumulator >= STEP) {
      applyControls(readInput(input));
      accumulator -= STEP;
    }
  }
  lastFrame = now;
  render();
  window.__skylineReady = true;
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

// A small hook for automated capture; gameplay never depends on it.
window.__skyline = { state, render };
