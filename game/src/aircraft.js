// Skyline Courier - the hand-built mail plane, rendered from the chase camera.
// Every pixel comes from state; nothing here depends on the wall clock.
import { CANVAS, PALETTE } from './config.js';
import { clamp } from './physics.js';
import { project } from './scenery.js';

function polygon(ctx, points, fill, stroke = '#1b2b31', lineWidth = 2) {
  ctx.beginPath();
  ctx.moveTo(points[0][0], points[0][1]);
  for (let i = 1; i < points.length; i++) ctx.lineTo(points[i][0], points[i][1]);
  ctx.closePath();
  ctx.fillStyle = fill;
  ctx.fill();
  if (stroke) {
    ctx.strokeStyle = stroke;
    ctx.lineWidth = lineWidth;
    ctx.stroke();
  }
}

function shaded(ctx, points, x0, y0, x1, y1, stops, stroke, lineWidth) {
  const g = ctx.createLinearGradient(x0, y0, x1, y1);
  for (const [at, color] of stops) g.addColorStop(at, color);
  polygon(ctx, points, g, stroke, lineWidth);
}

// Layered soft ellipses form the ground shadow without a blur filter.
function drawShadow(ctx, state, view) {
  const p = state.plane;
  const spot = project(view, p.x, 0, p.z + 14);
  if (!spot) return;
  const size = clamp(160 * spot.s, 8, 240);
  const base = clamp(0.36 - p.y / 5200, 0.05, 0.36);
  ctx.save();
  for (let i = 3; i >= 0; i--) {
    ctx.globalAlpha = i === 0 ? base : base * 0.11 * (4 - i);
    ctx.fillStyle = '#12201c';
    ctx.beginPath();
    ctx.ellipse(spot.x + i * size * 0.04, spot.y, size * (1 + i * 0.32),
      size * (0.25 + i * 0.08), 0, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

// Exhaust wisps trail aft from the stacks; phase is driven by sim time.
function drawExhaust(ctx, state, throttle) {
  ctx.save();
  for (let i = 0; i < 4; i++) {
    const phase = (state.time * (0.5 + throttle * 0.5) + i * 0.25) % 1;
    const y = -78 + phase * 62;
    const x = (i % 2 ? 1 : -1) * (13 + phase * 5);
    const r = 3 + phase * 8;
    ctx.globalAlpha = (1 - phase) * (0.05 + throttle * 0.1);
    ctx.fillStyle = i % 2 ? '#c8d3c8' : '#e3d9bd';
    ctx.beginPath();
    ctx.ellipse(x, y, r, r * 0.62, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

function drawTail(ctx) {
  // Horizontal stabiliser with a darker lower face.
  shaded(ctx, [[-62, 70], [-14, 55], [14, 55], [62, 70], [55, 96], [-55, 96]],
    -60, 56, 60, 96, [[0, '#efe3c5'], [0.55, '#d6c5a2'], [1, '#9f8c6b']], '#4b4538', 1.6);
  ctx.strokeStyle = 'rgba(90, 78, 58, 0.65)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(-50, 78); ctx.lineTo(50, 78);
  ctx.stroke();

  // Fin: ivory face, warm shadow on the right, blue flash at the root.
  shaded(ctx, [[-9, 72], [-14, 6], [0, -20], [14, 6], [9, 72]],
    -14, -20, 14, 72, [[0, '#f5ead0'], [0.6, '#dfd0ad'], [1, '#a89572']], '#4b4538', 1.7);
  polygon(ctx, [[2, -14], [13, 6], [9, 70], [4, 70], [6, 8]], '#b7a582', null);
  polygon(ctx, [[-11, 56], [11, 56], [10, 68], [-10, 68]], '#3f7d92', null);

  // Original tail marking, repeated on the stabiliser where it is readable.
  ctx.fillStyle = '#4b4538';
  ctx.font = 'bold 13px ui-monospace, monospace';
  ctx.textAlign = 'center';
  ctx.fillText('NC-07', 0, 91);
  ctx.save();
  ctx.translate(0, 33);
  ctx.fillStyle = '#3f7d92';
  ctx.beginPath(); ctx.arc(0, 0, 7.5, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = '#f6ead0'; ctx.lineWidth = 1.5;
  ctx.strokeRect(-4, -3.5, 8, 7);
  ctx.beginPath(); ctx.moveTo(-4, -3.5); ctx.lineTo(0, 1); ctx.lineTo(4, -3.5); ctx.stroke();
  ctx.restore();
}

function drawWing(ctx, side) {
  const outer = [[side * 15, -28], [side * 128, 8], [side * 142, 28], [side * 18, 20]];
  shaded(ctx, outer, 0, -28, 0, 28,
    [[0, '#f7eed6'], [0.42, '#e8dbba'], [1, '#a08d6a']], '#514a3b', 1.8);
  // Underside lip and aileron seam.
  polygon(ctx, [[side * 18, 20], [side * 142, 28], [side * 132, 33], [side * 20, 25]], '#8d7c5e', null);
  ctx.strokeStyle = '#9a8766';
  ctx.lineWidth = 1.4;
  ctx.beginPath();
  ctx.moveTo(side * 70, -4); ctx.lineTo(side * 74, 25);
  ctx.moveTo(side * 24, -16); ctx.lineTo(side * 116, 12);
  ctx.stroke();
  ctx.strokeStyle = 'rgba(255, 250, 230, 0.75)';
  ctx.beginPath();
  ctx.moveTo(side * 17, -23); ctx.lineTo(side * 124, 10);
  ctx.stroke();
  // Courier chevron and a tiny registration stripe.
  polygon(ctx, [[side * 48, -6], [side * 84, 8], [side * 81, 18], [side * 45, 4]], '#3f7d92', null);
  ctx.fillStyle = '#f3e7ca';
  ctx.font = 'bold 9px ui-monospace, monospace';
  ctx.textAlign = 'center';
  ctx.save();
  ctx.translate(side * 66, 9);
  ctx.rotate(Math.atan2(14, 36) * side);
  ctx.fillText('NC-07', 0, 0);
  ctx.restore();
}

function drawFuselage(ctx) {
  shaded(ctx, [[-18, 88], [-20, 38], [-19, -36], [-13, -84], [0, -118],
    [13, -84], [19, -36], [20, 38], [18, 88]],
    -20, 0, 20, 0, [[0, '#f7eed8'], [0.36, '#eee1c1'], [0.72, '#c9b691'], [1, '#927f60']],
    '#4b4538', 2);
  // Cooler shaded cowling behind the prop, then the courier stripe.
  polygon(ctx, [[-19, -36], [-13, -84], [0, -112], [13, -84], [19, -36],
    [10, -60], [-10, -60]], '#d9c9a4', null);
  polygon(ctx, [[-17, 26], [17, 26], [17, 33], [-17, 33]], '#b87856', null);
  polygon(ctx, [[-14, 50], [14, 50], [14, 54], [-14, 54]], '#b87856', null);
  ctx.strokeStyle = 'rgba(86, 74, 56, 0.8)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(-14, -72); ctx.lineTo(-15, 80);
  ctx.moveTo(14, -72); ctx.lineTo(15, 80);
  ctx.stroke();
  // A row of tiny inspection rivets catches light on the fuselage spine.
  ctx.fillStyle = 'rgba(255, 250, 228, 0.55)';
  for (let i = 0; i < 7; i++) {
    ctx.fillRect(-1, -66 + i * 20, 2, 2);
  }
}

function drawCanopy(ctx, state) {
  const glass = ctx.createLinearGradient(-12, -70, 12, -26);
  glass.addColorStop(0, '#123b47');
  glass.addColorStop(0.5, PALETTE.glass);
  glass.addColorStop(1, '#31707a');
  polygon(ctx, [[-12, -68], [-10, -30], [10, -30], [12, -68], [0, -82]], glass, '#d7c9a6', 2);
  // Frame bows and a pilot silhouette seen through the glass.
  ctx.strokeStyle = 'rgba(226, 214, 181, 0.85)';
  ctx.lineWidth = 1.4;
  ctx.beginPath();
  ctx.moveTo(0, -81); ctx.lineTo(0, -30);
  ctx.moveTo(-11, -50); ctx.lineTo(11, -50);
  ctx.stroke();
  ctx.fillStyle = '#1d3036';
  ctx.beginPath(); ctx.ellipse(0, -43, 5.5, 9, 0, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#e9dcba';
  ctx.fillRect(-9, -33, 18, 2.5);
  // A hard diagonal glint sells the curved canopy.
  ctx.globalAlpha = 0.5 + 0.12 * Math.sin(state.time * 0.4);
  polygon(ctx, [[-8, -66], [-3, -66], [-9, -38], [-11, -38]], '#eaf8f4', null);
  ctx.globalAlpha = 1;
}

function drawGear(ctx) {
  ctx.strokeStyle = '#2b3b3d';
  ctx.lineWidth = 3.4;
  for (const side of [-1, 1]) {
    ctx.beginPath();
    ctx.moveTo(side * 20, 6); ctx.lineTo(side * 34, 42);
    ctx.stroke();
    ctx.strokeStyle = 'rgba(226, 214, 181, 0.5)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(side * 18, 8); ctx.lineTo(side * 32, 40);
    ctx.stroke();
    ctx.strokeStyle = '#2b3b3d';
    ctx.lineWidth = 3.4;
    ctx.fillStyle = '#172023';
    ctx.beginPath(); ctx.ellipse(side * 35, 46, 8, 12, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#4a5452';
    ctx.beginPath(); ctx.ellipse(side * 35, 46, 3.5, 5, 0, 0, Math.PI * 2); ctx.fill();
  }
  ctx.strokeStyle = '#2b3b3d';
  ctx.lineWidth = 2.6;
  ctx.beginPath(); ctx.moveTo(0, 90); ctx.lineTo(0, 110); ctx.stroke();
  ctx.fillStyle = '#172023';
  ctx.beginPath(); ctx.ellipse(0, 112, 5, 8, 0, 0, Math.PI * 2); ctx.fill();
}

function drawPropeller(ctx, state, throttle) {
  ctx.save();
  ctx.translate(0, -120);
  // Radial gradient inside a squashed transform becomes a blurred disc.
  ctx.save();
  ctx.scale(1, 0.2);
  const disc = ctx.createRadialGradient(0, 0, 2, 0, 0, 54);
  disc.addColorStop(0, 'rgba(238, 248, 244, 0.5)');
  disc.addColorStop(0.6, 'rgba(206, 228, 226, 0.24)');
  disc.addColorStop(1, 'rgba(206, 228, 226, 0)');
  ctx.globalAlpha = 0.5 + throttle * 0.5;
  ctx.fillStyle = disc;
  ctx.beginPath(); ctx.arc(0, 0, 54, 0, Math.PI * 2); ctx.fill();
  ctx.restore();
  const spin = state.time * (16 + throttle * 30);
  ctx.globalAlpha = 0.4 + throttle * 0.2;
  ctx.strokeStyle = '#f2f8ee';
  ctx.lineWidth = 2.2;
  ctx.beginPath();
  ctx.moveTo(-Math.cos(spin) * 50, -Math.sin(spin) * 9);
  ctx.lineTo(Math.cos(spin) * 50, Math.sin(spin) * 9);
  ctx.stroke();
  ctx.globalAlpha = 1;
  ctx.fillStyle = '#33454a';
  ctx.beginPath(); ctx.arc(0, 0, 6, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#e7d7b2';
  ctx.beginPath(); ctx.arc(0, 0, 2.5, 0, Math.PI * 2); ctx.fill();
  ctx.restore();
}

function drawNavLights(ctx, state) {
  const blink = 0.62 + 0.38 * Math.sin(state.time * 5);
  const lights = [[-142, 28, '#ff6f61'], [142, 28, '#79e8a4'], [0, 92, '#fff4d6']];
  for (const [x, y, color] of lights) {
    const glow = ctx.createRadialGradient(x, y, 0.5, x, y, 15);
    glow.addColorStop(0, color);
    glow.addColorStop(0.35, color + '88');
    glow.addColorStop(1, color + '00');
    ctx.globalAlpha = blink;
    ctx.fillStyle = glow;
    ctx.fillRect(x - 16, y - 16, 32, 32);
    ctx.globalAlpha = 1;
    ctx.fillStyle = color;
    ctx.beginPath(); ctx.arc(x, y, 3.6, 0, Math.PI * 2); ctx.fill();
  }
}

export function drawAircraft(ctx, state, view) {
  const p = state.plane;
  drawShadow(ctx, state, view);
  const baseX = CANVAS.CX;
  const baseY = view.horizon + 152;
  ctx.save();
  ctx.translate(baseX, baseY);
  ctx.rotate(p.roll * 0.92);
  ctx.scale(1, clamp(1 - p.pitch * 0.42, 0.78, 1.18));

  drawExhaust(ctx, state, p.throttle);
  drawTail(ctx);
  drawWing(ctx, -1);
  drawWing(ctx, 1);
  drawFuselage(ctx);
  if (p.gear) drawGear(ctx);
  drawCanopy(ctx, state);
  drawPropeller(ctx, state, p.throttle);
  drawNavLights(ctx, state);
  ctx.restore();
}
