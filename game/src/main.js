// Skyline Courier - boot, fixed-step loop and module wiring.
import { CANVAS, MISSIONS, PALETTE, STEP, WORLD } from './config.js';
import { createState, currentRing, resetFlight, setMission } from './state.js';
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

// A compact progress strip in the clear top-right sky, derived only from state.
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

function drawMissionStrip(ctx, state) {
  const mission = MISSIONS[state.missionIndex];
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
    detail = p.gear ? (Math.abs(p.x) < WORLD.runway.width / 2 ? 'GEAR DOWN · CENTRELINE' : 'GEAR DOWN · CORRECT LEFT/RIGHT') : 'GEAR UP · SELECT DOWN';
    filled = p.gear ? 1 : 0;
  } else {
    const distance = target.distance;
    label = state.mission.townReached ? `RETURN · ${distance} m` : `ALDER QUAY · ${distance} m`;
    detail = state.mission.townReached ? 'LAND AT SKYLINE FIELD' : 'OUTBOUND MAIL RUN';
    total = 2;
    filled = state.mission.townReached ? 1 : 0;
  }
  const x = 832, y = 18, w = 426, h = 48;
  ctx.fillStyle = 'rgba(8, 20, 25, 0.62)';
  ctx.fillRect(x, y, w, h);
  ctx.strokeStyle = 'rgba(150, 220, 185, 0.35)';
  ctx.lineWidth = 1;
  ctx.strokeRect(x + 0.5, y + 0.5, w, h);
  ctx.fillStyle = PALETTE.gold;
  ctx.fillRect(x, y, 4, h);
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

// Bracketed target distance in the clear sky below the readouts.
function drawTargetCallout(ctx, state) {
  const target = targetInfo(state);
  const text = target.done ? '[ ROUTE COMPLETE ]' : `[ ${target.label} · ${target.distance} m ]`;
  const w = 330, h = 20, x = CANVAS.CX - w / 2, y = 78;
  ctx.fillStyle = 'rgba(8, 20, 25, 0.58)';
  ctx.fillRect(x, y, w, h);
  ctx.strokeStyle = 'rgba(255, 210, 113, 0.55)';
  ctx.lineWidth = 1;
  ctx.strokeRect(x + 0.5, y + 0.5, w, h);
  ctx.textAlign = 'center';
  ctx.font = 'bold 13px ui-monospace, monospace';
  ctx.lineWidth = 2.5;
  ctx.strokeStyle = 'rgba(4, 14, 18, 0.8)';
  ctx.strokeText(text, CANVAS.CX, y + 14);
  ctx.fillStyle = PALETTE.gold;
  ctx.fillText(text, CANVAS.CX, y + 14);
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
  drawMissionStrip(ctx, state);
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
