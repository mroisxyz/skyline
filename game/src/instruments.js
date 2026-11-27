// Skyline Courier - illuminated panel gauges and the pilot's heads-up display.
// Gauges are driven only by the flight state, so the four presets stay stable.
import { AIRCRAFT, CANVAS, MISSIONS, PALETTE, WORLD } from './config.js';
import { clamp, wrapAngle } from './physics.js';
import { currentRing } from './state.js';

function bezel(ctx, x, y, r, fill = '#0d171d') {
  ctx.fillStyle = '#070d12';
  ctx.beginPath(); ctx.arc(x, y, r + 4, 0, Math.PI * 2); ctx.fill();
  const rim = ctx.createLinearGradient(x - r, y - r, x + r, y + r);
  rim.addColorStop(0, '#6d8790');
  rim.addColorStop(0.45, '#2d4350');
  rim.addColorStop(1, '#5b7580');
  ctx.fillStyle = rim;
  ctx.beginPath(); ctx.arc(x, y, r + 2, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#0a1016';
  ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = fill;
  ctx.beginPath(); ctx.arc(x, y, r - 1, 0, Math.PI * 2); ctx.fill();
}

function drawAttitude(ctx, state, x, y, r) {
  const p = state.plane;
  ctx.save();
  bezel(ctx, x, y, r, PALETTE.glass);
  ctx.beginPath(); ctx.arc(x, y, r - 2, 0, Math.PI * 2); ctx.clip();
  ctx.translate(x, y);
  ctx.rotate(-p.roll * 0.95);
  const offset = clamp(p.pitch, -0.5, 0.5) * 150;
  const sky = ctx.createLinearGradient(0, -r, 0, offset);
  sky.addColorStop(0, '#235f8a');
  sky.addColorStop(1, '#72a9bd');
  ctx.fillStyle = sky;
  ctx.fillRect(-r, -r * 2, r * 2, r * 2 + offset);
  const earth = ctx.createLinearGradient(0, offset, 0, r);
  earth.addColorStop(0, '#7b5735');
  earth.addColorStop(1, '#402d22');
  ctx.fillStyle = earth;
  ctx.fillRect(-r, offset, r * 2, r * 2);
  ctx.fillStyle = '#f2ead2';
  ctx.fillRect(-r, offset - 1.5, r * 2, 3);

  ctx.strokeStyle = '#ece5cf';
  ctx.fillStyle = '#ece5cf';
  ctx.font = '9px ui-monospace, monospace';
  ctx.textAlign = 'center';
  for (let d = -30; d <= 30; d += 10) {
    const ly = offset - d * 2.6;
    if (Math.abs(ly) > r + 12) continue;
    ctx.lineWidth = d === 0 ? 2 : 1;
    ctx.beginPath(); ctx.moveTo(-17, ly); ctx.lineTo(17, ly); ctx.stroke();
    if (d !== 0) {
      ctx.fillText(String(Math.abs(d)), -24, ly + 3);
      ctx.fillText(String(Math.abs(d)), 24, ly + 3);
    }
  }
  // Bank scale markings rotate with the card so the pilot reads the roll.
  ctx.lineWidth = 1;
  for (let a = -60; a <= 60; a += 30) {
    const rad = a * Math.PI / 180;
    ctx.beginPath();
    ctx.moveTo(Math.sin(rad) * (r - 9), -Math.cos(rad) * (r - 9));
    ctx.lineTo(Math.sin(rad) * (r - 4), -Math.cos(rad) * (r - 4));
    ctx.stroke();
  }
  ctx.restore();
  // Fixed aircraft symbol and a triangular bank pointer.
  ctx.save();
  ctx.strokeStyle = PALETTE.gold;
  ctx.lineWidth = 2.6;
  ctx.beginPath();
  ctx.moveTo(x - 27, y); ctx.lineTo(x - 10, y); ctx.lineTo(x - 5, y + 5);
  ctx.moveTo(x + 27, y); ctx.lineTo(x + 10, y); ctx.lineTo(x + 5, y + 5);
  ctx.stroke();
  ctx.fillStyle = PALETTE.gold;
  ctx.beginPath(); ctx.arc(x, y, 2.2, 0, Math.PI * 2); ctx.fill();
  const a = clamp(p.roll, -0.95, 0.95);
  ctx.translate(x, y - r + 5);
  ctx.rotate(a);
  ctx.beginPath(); ctx.moveTo(0, -6); ctx.lineTo(-4, 2); ctx.lineTo(4, 2);
  ctx.closePath(); ctx.fill();
  ctx.restore();
  ctx.fillStyle = '#7fb9ae';
  ctx.font = '9px ui-monospace, monospace';
  ctx.textAlign = 'center';
  ctx.fillText('ATTITUDE', x, y + r + 13);
}

function drawTape(ctx, x, y, w, h, value, step, pixelsPerUnit, label, format) {
  const lo = value - h / 2 / pixelsPerUnit;
  const hi = value + h / 2 / pixelsPerUnit;
  ctx.save();
  ctx.beginPath(); ctx.rect(x, y, w, h); ctx.clip();
  const bg = ctx.createLinearGradient(x, y, x, y + h);
  bg.addColorStop(0, '#10232b');
  bg.addColorStop(1, '#08141a');
  ctx.fillStyle = bg;
  ctx.fillRect(x, y, w, h);
  const first = Math.ceil(lo / step) * step;
  for (let v = first; v <= hi; v += step) {
    const ly = y + h / 2 - (v - value) * pixelsPerUnit;
    const major = Math.abs(v % (step * 2)) < 0.01;
    ctx.strokeStyle = major ? '#9fc9b4' : '#4d7d74';
    ctx.lineWidth = major ? 2 : 1;
    ctx.beginPath();
    ctx.moveTo(x + w - (major ? 30 : major ? 30 : 16), ly);
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
  ctx.font = 'bold 10px ui-monospace, monospace';
  ctx.textAlign = 'left';
  ctx.fillText(label, x + 2, y - 6);
  ctx.strokeStyle = '#3c5666';
  ctx.lineWidth = 1;
  ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
}

// A round VSI dial; zero is straight up, climbs sweep right.
function drawVSI(ctx, state, x, y, r) {
  const v = clamp(state.plane.vs * 196.85, -2000, 2000);
  bezel(ctx, x, y, r, '#0c1a21');
  ctx.save();
  ctx.beginPath(); ctx.arc(x, y, r - 2, 0, Math.PI * 2); ctx.clip();
  ctx.fillStyle = '#0b161d';
  ctx.fillRect(x - r, y - r, r * 2, r * 2);
  ctx.textAlign = 'center';
  for (let i = -4; i <= 4; i++) {
    const a = -Math.PI / 2 + i * 0.5;
    const major = i % 2 === 0;
    ctx.strokeStyle = i < 0 ? '#e0a67a' : '#9fc9b4';
    ctx.lineWidth = major ? 1.8 : 1;
    ctx.beginPath();
    ctx.moveTo(x + Math.cos(a) * (r - (major ? 9 : 6)), y + Math.sin(a) * (r - (major ? 9 : 6)));
    ctx.lineTo(x + Math.cos(a) * (r - 3), y + Math.sin(a) * (r - 3));
    ctx.stroke();
    if (major && i !== 0) {
      ctx.fillStyle = '#7ea99c';
      ctx.font = '8px ui-monospace, monospace';
      ctx.fillText(String(Math.abs(i)), x + Math.cos(a) * (r - 17), y + Math.sin(a) * (r - 17) + 3);
    }
  }
  ctx.restore();
  const a = -Math.PI / 2 + (v / 2000) * 2;
  ctx.strokeStyle = PALETTE.gold;
  ctx.lineWidth = 2.4;
  ctx.beginPath();
  ctx.moveTo(x - Math.cos(a) * 6, y - Math.sin(a) * 6);
  ctx.lineTo(x + Math.cos(a) * (r - 8), y + Math.sin(a) * (r - 8));
  ctx.stroke();
  ctx.fillStyle = '#e6dcc0';
  ctx.beginPath(); ctx.arc(x, y, 3, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#8ab8a6';
  ctx.font = 'bold 10px ui-monospace, monospace';
  ctx.textAlign = 'center';
  ctx.fillText('V/S  fpm', x, y + r + 13);
  ctx.fillStyle = '#cfe8d3';
  ctx.font = '9px ui-monospace, monospace';
  ctx.fillText(`${v >= 0 ? '+' : ''}${Math.round(v)}`, x, y + 6);
}

// Eight cardinal and ordinal labels keep headings readable inside the bezel.
function drawCompass(ctx, state, x, y, r) {
  const heading = (wrapAngle(state.plane.hdg) * 180 / Math.PI + 360) % 360;
  bezel(ctx, x, y, r, '#10222b');
  ctx.save();
  ctx.beginPath(); ctx.arc(x, y, r - 2, 0, Math.PI * 2); ctx.clip();
  ctx.translate(x, y);
  ctx.rotate(-heading * Math.PI / 180);
  const marks = [['N', 0], ['045', 45], ['E', 90], ['135', 135],
    ['S', 180], ['225', 225], ['W', 270], ['315', 315]];
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
  ctx.textAlign = 'center';
  for (const [label, deg] of marks) {
    const a = deg * Math.PI / 180;
    const cardinal = label.length === 1;
    ctx.font = cardinal ? 'bold 12px ui-monospace, monospace' : 'bold 9px ui-monospace, monospace';
    ctx.fillStyle = cardinal ? '#e4f5e2' : '#9fc9b4';
    ctx.fillText(label, Math.sin(a) * (r - 19), -Math.cos(a) * (r - 19) + 4);
  }
  ctx.restore();
  ctx.fillStyle = PALETTE.gold;
  ctx.beginPath();
  ctx.moveTo(x, y - r + 2); ctx.lineTo(x - 6, y - r + 13); ctx.lineTo(x + 6, y - r + 13);
  ctx.closePath(); ctx.fill();
  ctx.fillStyle = '#0a151b';
  ctx.fillRect(x - 24, y - 11, 48, 22);
  ctx.strokeStyle = '#3c5666';
  ctx.lineWidth = 1;
  ctx.strokeRect(x - 24, y - 11, 48, 22);
  ctx.fillStyle = PALETTE.hud;
  ctx.font = 'bold 15px ui-monospace, monospace';
  ctx.textAlign = 'center';
  ctx.fillText(String(Math.round(heading)).padStart(3, '0'), x, y + 5);
  ctx.fillStyle = '#7fb9ae';
  ctx.font = '9px ui-monospace, monospace';
  ctx.fillText('HDG', x, y + r + 13);
}

function drawThrottle(ctx, state, x, y, h) {
  ctx.fillStyle = '#0a141b';
  ctx.fillRect(x, y, 54, h);
  ctx.strokeStyle = '#3c5666';
  ctx.lineWidth = 1;
  ctx.strokeRect(x + 0.5, y + 0.5, 53, h - 1);
  for (let i = 0; i <= 4; i++) {
    const ty = y + 8 + (h - 18) * (1 - i / 4);
    ctx.strokeStyle = '#5b8a80';
    ctx.lineWidth = i % 2 === 0 ? 2 : 1;
    ctx.beginPath(); ctx.moveTo(x + 6, ty); ctx.lineTo(x + 18, ty); ctx.stroke();
  }
  const knobY = y + h - 9 - state.plane.throttle * (h - 18);
  ctx.strokeStyle = '#b4c6bd';
  ctx.lineWidth = 3;
  ctx.beginPath(); ctx.moveTo(x + 27, y + h - 8); ctx.lineTo(x + 27, knobY); ctx.stroke();
  ctx.fillStyle = PALETTE.gold;
  ctx.fillRect(x + 15, knobY - 5, 24, 10);
  ctx.fillStyle = '#2b3b3d';
  ctx.fillRect(x + 19, knobY - 2, 16, 4);
  ctx.fillStyle = '#8ab8a6';
  ctx.font = 'bold 10px ui-monospace, monospace';
  ctx.textAlign = 'left';
  ctx.fillText('THR', x + 2, y - 6);
  ctx.fillStyle = '#cfe8d3';
  ctx.textAlign = 'center';
  ctx.fillText(`${Math.round(state.plane.throttle * 100)}%`, x + 27, y + h + 13);
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
  ctx.font = 'bold 10px ui-monospace, monospace';
  ctx.textAlign = 'left';
  ctx.fillText('AIRFRAME', dx, dy - 8);
  for (let i = 0; i < 12; i++) {
    const lit = p.damage < (i + 1) * 100 / 12;
    ctx.fillStyle = lit ? (i < 8 ? '#76d99a' : '#e8b566') : '#3a2b2b';
    ctx.fillRect(dx + i * 19, dy, 15, 18);
    ctx.strokeStyle = 'rgba(180, 210, 195, 0.25)';
    ctx.lineWidth = 1;
    ctx.strokeRect(dx + i * 19 + 0.5, dy + 0.5, 14, 17);
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
  grad.addColorStop(0, '#243945');
  grad.addColorStop(0.14, PALETTE.panel);
  grad.addColorStop(1, '#070b11');
  ctx.fillStyle = grad;
  ctx.fillRect(0, y0, CANVAS.W, CANVAS.H - y0);
  ctx.fillStyle = PALETTE.panelEdge;
  ctx.fillRect(0, y0, CANVAS.W, 3);
  ctx.fillStyle = 'rgba(255, 238, 200, 0.12)';
  ctx.fillRect(0, y0 + 3, CANVAS.W, 1);
  for (let x = 12; x < CANVAS.W; x += 38) {
    ctx.fillStyle = '#60737a';
    ctx.beginPath(); ctx.arc(x, y0 + 9, 2, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = 'rgba(0, 0, 0, 0.35)';
    ctx.beginPath(); ctx.arc(x + 0.7, y0 + 9.7, 0.8, 0, Math.PI * 2); ctx.fill();
  }
  ctx.font = '10px ui-monospace, monospace';
  ctx.fillStyle = '#5c8493';
  ctx.textAlign = 'left';
  ctx.fillText('SKYLINE COURIER / INSTRUMENT PANEL', 18, CANVAS.H - 8);

  drawAttitude(ctx, state, 128, 654, 50);
  drawTape(ctx, 232, 616, 118, 76, state.plane.spd, 10, 0.72,
    'AIRSPEED  m/s', (v) => String(Math.round(v)).padStart(3, '0'));
  drawVSI(ctx, state, 396, 654, 38);
  drawCompass(ctx, state, 500, 654, 48);
  drawThrottle(ctx, state, 580, 612, 76);
  drawTape(ctx, 706, 616, 118, 76, clamp(state.plane.y * 3.28, 0, 9999), 200, 0.16,
    'ALTITUDE  ft', (v) => String(Math.round(v)).padStart(4, '0'));
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
  ctx.fillStyle = PALETTE.gold;
  ctx.fillRect(470, 18, 340, 2);
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
  ctx.fillStyle = PALETTE.gold;
  ctx.fillRect(22, 18, 4, 82);
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
  const filled = mission.kind === 'rings' ? state.mission.ringsPassed : state.mission.complete ? 1 : 0;
  const total = mission.kind === 'rings' ? WORLD.rings.length : 1;
  for (let i = 0; i < total; i++) {
    ctx.fillStyle = i < filled ? PALETTE.gold : 'rgba(255, 210, 113, 0.22)';
    ctx.fillRect(36 + i * 16, 90, 12, 4);
  }
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
    ctx.font = 'bold 15px ui-monospace, monospace';
    const w = ctx.measureText(text).width + 26;
    ctx.fillStyle = 'rgba(8, 20, 25, 0.62)';
    ctx.fillRect(CANVAS.CX - w / 2, 186 + i * 24, w, 21);
    ctx.fillStyle = color;
    ctx.fillText(text, CANVAS.CX, 201 + i * 24);
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
