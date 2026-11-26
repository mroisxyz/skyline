// Skyline Courier - lit panel gauges and the pilot's heads-up display.
import { AIRCRAFT, CANVAS, MISSIONS, PALETTE, WORLD } from './config.js';
import { clamp, wrapAngle } from './physics.js';
import { currentRing } from './state.js';

function bezel(ctx, x, y, r, fill = '#0d171d') {
  ctx.fillStyle = '#0a1016';
  ctx.beginPath(); ctx.arc(x, y, r + 3, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#425967';
  ctx.beginPath(); ctx.arc(x, y, r + 1.5, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = fill;
  ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
}

function drawAttitude(ctx, state, x, y, r) {
  const p = state.plane;
  ctx.save();
  bezel(ctx, x, y, r, PALETTE.glass);
  ctx.beginPath(); ctx.arc(x, y, r - 1, 0, Math.PI * 2); ctx.clip();
  ctx.translate(x, y);
  ctx.rotate(-p.roll * 0.95);
  const offset = p.pitch * 150;
  ctx.fillStyle = '#2f76a0';
  ctx.fillRect(-r, -r * 2, r * 2, r * 2 + offset);
  ctx.fillStyle = '#6b4c31';
  ctx.fillRect(-r, offset, r * 2, r * 2);
  ctx.fillStyle = '#d8c59c';
  ctx.fillRect(-r, offset - 1.5, r * 2, 3);
  ctx.strokeStyle = '#e8e0c8';
  ctx.fillStyle = '#e8e0c8';
  ctx.font = '9px ui-monospace, monospace';
  ctx.textAlign = 'center';
  const pitchDeg = p.pitch * 180 / Math.PI;
  for (let d = -30; d <= 30; d += 10) {
    const ly = offset + (d + pitchDeg) * 2.6;
    if (Math.abs(ly) > r + 20) continue;
    ctx.lineWidth = d === 0 ? 2 : 1;
    ctx.beginPath(); ctx.moveTo(-18, ly); ctx.lineTo(18, ly); ctx.stroke();
    ctx.fillText(String(Math.abs(d)), -26, ly + 3);
    ctx.fillText(String(Math.abs(d)), 26, ly + 3);
  }
  ctx.restore();
  ctx.save();
  ctx.strokeStyle = PALETTE.gold;
  ctx.lineWidth = 2.5;
  ctx.beginPath();
  ctx.moveTo(x - 26, y); ctx.lineTo(x - 9, y); ctx.lineTo(x - 4, y + 5);
  ctx.moveTo(x + 26, y); ctx.lineTo(x + 9, y); ctx.lineTo(x + 4, y + 5);
  ctx.stroke();
  ctx.fillStyle = PALETTE.gold;
  ctx.beginPath(); ctx.arc(x, y, 2, 0, Math.PI * 2); ctx.fill();
  ctx.restore();
}

function drawTape(ctx, x, y, w, h, value, step, pixelsPerUnit, label, format) {
  const lo = value - h / 2 / pixelsPerUnit;
  const hi = value + h / 2 / pixelsPerUnit;
  ctx.save();
  ctx.beginPath(); ctx.rect(x, y, w, h); ctx.clip();
  ctx.fillStyle = '#0c1b22';
  ctx.fillRect(x, y, w, h);
  const first = Math.ceil(lo / step) * step;
  for (let v = first; v <= hi; v += step) {
    const ly = y + h / 2 - (v - value) * pixelsPerUnit;
    const major = Math.abs(v % (step * 2)) < 0.01;
    ctx.strokeStyle = major ? '#9fc9b4' : '#4d7d74';
    ctx.lineWidth = major ? 2 : 1;
    ctx.beginPath();
    ctx.moveTo(x + w - (major ? 30 : 16), ly);
    ctx.lineTo(x + w - 4, ly);
    ctx.stroke();
    if (major && v >= 0) {
      ctx.fillStyle = '#bfe6c9';
      ctx.font = '11px ui-monospace, monospace';
      ctx.textAlign = 'right';
      ctx.fillText(format(v), x + w - 34, ly + 4);
    }
  }
  ctx.restore();
  ctx.fillStyle = PALETTE.gold;
  ctx.fillRect(x + 2, y + h / 2 - 12, w - 6, 24);
  ctx.fillStyle = '#14232a';
  ctx.font = 'bold 14px ui-monospace, monospace';
  ctx.textAlign = 'right';
  ctx.fillText(format(value), x + w - 8, y + h / 2 + 5);
  ctx.fillStyle = '#8ab8a6';
  ctx.font = '10px ui-monospace, monospace';
  ctx.textAlign = 'left';
  ctx.fillText(label, x + 4, y - 6);
  ctx.strokeStyle = '#3c5666';
  ctx.lineWidth = 1;
  ctx.strokeRect(x, y, w, h);
}

// Six labels at 60 degrees keep every heading readable inside the bezel.
function drawCompass(ctx, state, x, y, r) {
  const heading = (wrapAngle(state.plane.hdg) * 180 / Math.PI + 360) % 360;
  bezel(ctx, x, y, r, '#10222b');
  ctx.save();
  ctx.beginPath(); ctx.arc(x, y, r - 2, 0, Math.PI * 2); ctx.clip();
  ctx.translate(x, y);
  ctx.rotate(-heading * Math.PI / 180);
  const marks = ['N', '060', '120', 'S', '240', '300'];
  for (let i = 0; i < 36; i++) {
    const a = i * Math.PI / 18;
    const cardinal = i % 9 === 0;
    const major = i % 6 === 0;
    const medium = i % 3 === 0;
    const rr = r - (cardinal ? 11 : major ? 8 : medium ? 6 : 4);
    ctx.strokeStyle = cardinal ? '#d8f0dc' : major ? '#c8e7d2' : medium ? '#9fc9b4' : '#5a8a7c';
    ctx.lineWidth = cardinal ? 2 : major ? 1.6 : 1;
    ctx.beginPath();
    ctx.moveTo(Math.sin(a) * rr, -Math.cos(a) * rr);
    ctx.lineTo(Math.sin(a) * (r - 3), -Math.cos(a) * (r - 3));
    ctx.stroke();
  }
  ctx.fillStyle = '#d8f0dc';
  ctx.textAlign = 'center';
  for (let i = 0; i < marks.length; i++) {
    const a = i * Math.PI / 3;
    const label = marks[i];
    ctx.font = label.length === 1 ? 'bold 12px ui-monospace, monospace' : 'bold 10px ui-monospace, monospace';
    ctx.fillText(label, Math.sin(a) * (r - 17), -Math.cos(a) * (r - 17) + 4);
  }
  ctx.restore();
  ctx.fillStyle = PALETTE.gold;
  ctx.beginPath();
  ctx.moveTo(x, y - r + 2); ctx.lineTo(x - 6, y - r + 13); ctx.lineTo(x + 6, y - r + 13);
  ctx.closePath(); ctx.fill();
  ctx.fillStyle = '#0a151b';
  ctx.fillRect(x - 23, y - 10, 46, 20);
  ctx.fillStyle = PALETTE.hud;
  ctx.font = 'bold 15px ui-monospace, monospace';
  ctx.textAlign = 'center';
  ctx.fillText(String(Math.round(heading)).padStart(3, '0'), x, y + 5);
}

function drawFuelAndDamage(ctx, state) {
  const p = state.plane;
  const fx = 900, fy = 652, fr = 40;
  bezel(ctx, fx, fy, fr, '#0d1c22');
  ctx.strokeStyle = '#355c63';
  ctx.lineWidth = 7;
  ctx.beginPath(); ctx.arc(fx, fy, 28, Math.PI * 0.78, Math.PI * 2.22); ctx.stroke();
  const fuelRatio = clamp(p.fuel / AIRCRAFT.fuelCapacity, 0, 1);
  ctx.strokeStyle = fuelRatio < 0.22 ? PALETTE.warn : PALETTE.gold;
  ctx.beginPath(); ctx.arc(fx, fy, 28, Math.PI * 0.78, Math.PI * (0.78 + 1.44 * fuelRatio)); ctx.stroke();
  const needle = Math.PI * (0.78 + 1.44 * fuelRatio);
  ctx.strokeStyle = '#f4e9cc';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(fx, fy);
  ctx.lineTo(fx + Math.cos(needle) * 25, fy + Math.sin(needle) * 25);
  ctx.stroke();
  ctx.fillStyle = '#cbe7d1';
  ctx.font = '10px ui-monospace, monospace';
  ctx.textAlign = 'center';
  ctx.fillText('FUEL', fx, fy + 24);
  ctx.fillText(`${Math.round(p.fuel)}%`, fx, fy + 35);

  const dx = 1010, dy = 616;
  ctx.fillStyle = '#8ab8a6';
  ctx.font = '10px ui-monospace, monospace';
  ctx.textAlign = 'left';
  ctx.fillText('AIRFRAME', dx, dy - 8);
  for (let i = 0; i < 12; i++) {
    const lit = p.damage < (i + 1) * 100 / 12;
    ctx.fillStyle = lit ? (i < 8 ? '#76d99a' : '#e8b566') : '#3a2b2b';
    ctx.fillRect(dx + i * 19, dy, 15, 18);
  }
  ctx.fillStyle = '#8ab8a6';
  ctx.fillText('GEAR', dx, dy + 44);
  ctx.fillStyle = p.gear ? '#8ce2aa' : '#526a68';
  ctx.fillRect(dx + 52, dy + 33, 60, 15);
  ctx.fillStyle = '#0e1c20';
  ctx.font = 'bold 10px ui-monospace, monospace';
  ctx.fillText(p.gear ? 'DOWN' : 'UP', dx + 67, dy + 44);
}

export function drawPanel(ctx, state) {
  const y0 = 586;
  const grad = ctx.createLinearGradient(0, y0, 0, CANVAS.H);
  grad.addColorStop(0, '#1b2b34');
  grad.addColorStop(0.14, PALETTE.panel);
  grad.addColorStop(1, '#090e15');
  ctx.fillStyle = grad;
  ctx.fillRect(0, y0, CANVAS.W, CANVAS.H - y0);
  ctx.fillStyle = PALETTE.panelEdge;
  ctx.fillRect(0, y0, CANVAS.W, 3);
  for (let x = 12; x < CANVAS.W; x += 38) {
    ctx.fillStyle = '#60737a';
    ctx.beginPath(); ctx.arc(x, y0 + 9, 2, 0, Math.PI * 2); ctx.fill();
  }
  ctx.font = '10px ui-monospace, monospace';
  ctx.fillStyle = '#5c8493';
  ctx.textAlign = 'left';
  ctx.fillText('SKYLINE COURIER / INSTRUMENT PANEL', 18, CANVAS.H - 8);

  drawAttitude(ctx, state, 128, 654, 51);
  drawTape(ctx, 232, 616, 118, 76, state.plane.spd, 10, 0.72, 'AIRSPEED  m/s', (v) => String(Math.round(v)).padStart(3, '0'));
  drawTape(ctx, 706, 616, 118, 76, clamp(state.plane.y * 3.28, 0, 9999), 200, 0.16, 'ALTITUDE  ft', (v) => String(Math.round(v)).padStart(4, '0'));
  drawCompass(ctx, state, 500, 654, 48);
  drawFuelAndDamage(ctx, state);
}

function hudBox(ctx, x, y, w, h) {
  ctx.fillStyle = 'rgba(8, 20, 25, 0.62)';
  ctx.strokeStyle = 'rgba(150, 220, 185, 0.35)';
  ctx.lineWidth = 1;
  ctx.fillRect(x, y, w, h);
  ctx.strokeRect(x + 0.5, y + 0.5, w, h);
}

// Outlined 21px digits stay legible against bright sky inside the same box.
function drawReadouts(ctx, state) {
  const p = state.plane;
  const heading = (wrapAngle(p.hdg) * 180 / Math.PI + 360) % 360;
  hudBox(ctx, 470, 18, 340, 58);
  const cells = [
    ['ALT', `${Math.round(p.y * 3.28)} ft`],
    ['SPD', `${Math.round(p.spd)} m/s`],
    ['HDG', `${String(Math.round(heading)).padStart(3, '0')}°`]
  ];
  cells.forEach(([label, value], i) => {
    const x = 488 + i * 108;
    ctx.textAlign = 'left';
    ctx.fillStyle = PALETTE.hudDim;
    ctx.font = 'bold 12px ui-monospace, monospace';
    ctx.fillText(label, x, 38);
    ctx.font = 'bold 21px ui-monospace, monospace';
    ctx.lineWidth = 3;
    ctx.strokeStyle = 'rgba(4, 14, 18, 0.85)';
    ctx.strokeText(value, x, 64);
    ctx.fillStyle = '#eafff2';
    ctx.fillText(value, x, 64);
    if (i) {
      ctx.fillStyle = 'rgba(150,220,185,0.25)';
      ctx.fillRect(x - 10, 28, 1, 38);
    }
  });
}

function drawMissionCard(ctx, state) {
  const mission = MISSIONS[state.missionIndex];
  const ring = currentRing(state);
  hudBox(ctx, 22, 18, 406, 82);
  ctx.textAlign = 'left';
  ctx.fillStyle = PALETTE.gold;
  ctx.font = 'bold 14px ui-monospace, monospace';
  ctx.fillText(`ROUTE ${state.missionIndex + 1} / ${MISSIONS.length}  ${mission.name}`, 36, 41);
  ctx.fillStyle = PALETTE.hud;
  ctx.font = '12px ui-monospace, monospace';
  ctx.fillText(mission.brief, 36, 62);
  let target = mission.done;
  if (mission.kind === 'rings' && ring) {
    target = `NEXT BEACON ${state.mission.ringsPassed + 1}/3  ${Math.round(ring.z - state.plane.z)} m ahead`;
  } else if (mission.kind === 'fuel') {
    target = state.mission.townReached ? 'RETURN TO SKYLINE FIELD' : `ALDER QUAY ${Math.round(Math.hypot(state.plane.x - 700, state.plane.z - 4700))} m`;
  } else if (mission.kind === 'landing') {
    target = `RUNWAY 09  ${Math.round(state.plane.z - WORLD.runway.z0)} m to threshold`;
  }
  ctx.fillStyle = PALETTE.hudDim;
  ctx.fillText(state.mission.complete ? `DONE - ${target}` : target, 36, 83);
}

function drawReticle(ctx, state, view) {
  const cx = CANVAS.CX, cy = clamp(view.horizon - 10, 120, 420);
  ctx.strokeStyle = 'rgba(190, 245, 210, 0.62)';
  ctx.lineWidth = 1.5;
  ctx.beginPath(); ctx.arc(cx, cy, 17, 0, Math.PI * 2); ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(cx - 34, cy); ctx.lineTo(cx - 21, cy);
  ctx.moveTo(cx + 21, cy); ctx.lineTo(cx + 34, cy);
  ctx.moveTo(cx, cy - 34); ctx.lineTo(cx, cy - 21);
  ctx.stroke();
  for (let d = -30; d <= 30; d += 10) {
    const bx = cx + d * 5.1;
    const by = cy + 38;
    ctx.beginPath(); ctx.moveTo(bx, by); ctx.lineTo(bx, by + (d === 0 ? 9 : 5)); ctx.stroke();
  }
  ctx.fillStyle = PALETTE.gold;
  ctx.beginPath(); ctx.arc(cx, cy, 2.5, 0, Math.PI * 2); ctx.fill();
}

function drawWarnings(ctx, state) {
  const p = state.plane;
  const warnings = [];
  if (p.stall) warnings.push(['STALL - LOWER NOSE', PALETTE.warn]);
  if (p.fuel < 22) warnings.push(['LOW FUEL', PALETTE.warn]);
  if (p.y < 90 && !p.gear && p.z < WORLD.runway.z0 + 800) warnings.push(['GEAR UP', PALETTE.warn]);
  if (p.damage > 45) warnings.push(['AIRFRAME DAMAGE', PALETTE.warn]);
  if (p.crashed) warnings.push(['CRASHED - PRESS R', PALETTE.warn]);
  if (p.landed) warnings.push(['ON THE GROUND', PALETTE.hud]);
  if (state.mission.complete) warnings.push(['DELIVERY COMPLETE', PALETTE.gold]);
  ctx.textAlign = 'center';
  warnings.slice(0, 3).forEach(([text, color], i) => {
    ctx.fillStyle = color;
    ctx.font = 'bold 15px ui-monospace, monospace';
    ctx.fillText(text, CANVAS.CX, 112 + i * 22);
  });
  if (state.messageTimer > 0 && state.message) {
    ctx.fillStyle = 'rgba(8,20,25,0.55)';
    ctx.fillRect(340, CANVAS.H - 172, 600, 24);
    ctx.fillStyle = PALETTE.gold;
    ctx.font = '13px ui-monospace, monospace';
    ctx.fillText(state.message, CANVAS.CX, CANVAS.H - 155);
  }
}

export function drawHUD(ctx, state, view) {
  drawMissionCard(ctx, state);
  drawReadouts(ctx, state);
  drawReticle(ctx, state, view);
  drawWarnings(ctx, state);
}
