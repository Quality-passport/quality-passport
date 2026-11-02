// Draws the Quality Passport on a canvas (A4 landscape, 150 dpi).
// Text is rendered by the browser, so accents and non-Latin names display correctly
// (jsPDF's built-in fonts would not).
import { CONFIG } from '../../config.js';
import { IDS } from '../env.js';
import { drawIcon } from '../icons.js';
import { fmtDate } from '../lang.js';
import { loadLogo } from '../logo.js';
import { state, hasStar } from '../state.js';
import { T } from '../ui.js';
import { fmt, pillar } from '../util.js';

const W = 1754;
const H = 1240;
const FONT = '"Rethink Sans", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Arial, sans-serif';
const INK = '#292c31';
const MUTED = '#5d6265';
const LINE = '#c4c9cb';

async function fontsReady() {
  try {
    await Promise.all([
      document.fonts.load(`700 40px ${FONT}`),
      document.fonts.load(`italic 700 40px ${FONT}`),
      document.fonts.load(`400 40px ${FONT}`),
    ]);
  } catch { /* system fallback */ }
}

function starPath(ctx, cx, cy, R, r) {
  ctx.beginPath();
  for (let i = 0; i < 10; i++) {
    const rad = i % 2 === 0 ? R : r;
    const a = -Math.PI / 2 + (i * Math.PI) / 5;
    ctx.lineTo(cx + rad * Math.cos(a), cy + rad * Math.sin(a));
  }
  ctx.closePath();
}

/** Sets the largest font size (down to min) that fits maxW. */
function fitFont(ctx, text, style, size, maxW, min = 12) {
  for (; size > min; size -= 2) {
    ctx.font = `${style} ${size}px ${FONT}`;
    if (ctx.measureText(text).width <= maxW) return;
  }
  ctx.font = `${style} ${min}px ${FONT}`;
}

function spaced(ctx, px) { if ('letterSpacing' in ctx) ctx.letterSpacing = `${px}px`; }

/** Greedy word wrap into at most maxLines lines, shrinking the font if needed. */
function wrap(ctx, text, style, size, maxW, maxLines = 2, min = 16) {
  for (; size >= min; size -= 2) {
    ctx.font = `${style} ${size}px ${FONT}`;
    const lines = [];
    let line = '';
    for (const word of text.split(/\s+/)) {
      const test = line ? `${line} ${word}` : word;
      if (ctx.measureText(test).width <= maxW || !line) line = test;
      else { lines.push(line); line = word; }
    }
    lines.push(line);
    if (lines.length <= maxLines && lines.every((l) => ctx.measureText(l).width <= maxW)) return { lines, size };
  }
  return { lines: [text], size: min };
}

function drawStamp(ctx, id, cx, cy, deg) {
  const { primary, star } = CONFIG.THEME;
  const p = pillar(id);
  const lit = hasStar(id);
  const R = 160;
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate((deg * Math.PI) / 180);
  ctx.fillStyle = '#ffffff';
  ctx.beginPath(); ctx.arc(0, 0, R, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = primary;
  ctx.lineWidth = 7;
  ctx.beginPath(); ctx.arc(0, 0, R, 0, Math.PI * 2); ctx.stroke();
  ctx.lineWidth = 3;
  ctx.beginPath(); ctx.arc(0, 0, R - 14, 0, Math.PI * 2); ctx.stroke();
  drawIcon(ctx, p.icon, 0, -58, 84, lit ? primary : LINE, 1.3);
  if (lit) { // gold star badge on the rim
    ctx.save();
    ctx.rotate((-deg * Math.PI) / 180);
    starPath(ctx, R * 0.72, -R * 0.72, 34, 14);
    ctx.fillStyle = star; ctx.fill();
    ctx.strokeStyle = '#c48a00'; ctx.lineWidth = 3; ctx.stroke();
    ctx.restore();
  }
  // Name: up to 2 lines, kept inside the inner ring.
  const { lines, size } = wrap(ctx, p.name, '700', 30, 230);
  ctx.fillStyle = primary;
  const lh = size * 1.12;
  const top = lines.length === 1 ? 32 : 20;
  lines.forEach((l, i) => ctx.fillText(l, 0, top + i * lh));
  if (lit) {
    ctx.fillStyle = MUTED;
    ctx.font = `400 22px ${FONT}`;
    ctx.fillText(fmtDate(state.stars[id], 'stamp'), 0, 100);
  }
  ctx.restore();
}

/** Returns a canvas with the passport for `name`. */
export async function drawPassport(name) {
  await fontsReady();
  const { primary, accent, surface } = CONFIG.THEME;
  const cv = document.createElement('canvas');
  cv.width = W;
  cv.height = H;
  const ctx = cv.getContext('2d');
  ctx.textAlign = 'center';

  // Paper and frame
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = surface;
  ctx.fillRect(46, 46, W - 92, H - 92);
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(74, 74, W - 148, H - 148);
  ctx.strokeStyle = primary;
  ctx.lineWidth = 4;
  ctx.strokeRect(74, 74, W - 148, H - 148);

  // Header: programme visual, event, title
  const logo = await loadLogo('mark');
  if (logo) { // round medallion with a navy ring
    const r = 70;
    ctx.save();
    ctx.beginPath(); ctx.arc(W / 2, 150, r, 0, Math.PI * 2); ctx.clip();
    const k = Math.max((2 * r) / logo.naturalWidth, (2 * r) / logo.naturalHeight); // cover
    const w = logo.naturalWidth * k, h = logo.naturalHeight * k;
    try { ctx.drawImage(logo, W / 2 - w / 2, 150 - h / 2, w, h); } catch { /* ignore */ }
    ctx.restore();
    ctx.strokeStyle = primary; ctx.lineWidth = 6;
    ctx.beginPath(); ctx.arc(W / 2, 150, r, 0, Math.PI * 2); ctx.stroke();
  }
  ctx.fillStyle = accent;
  ctx.font = `700 28px ${FONT}`;
  spaced(ctx, 6);
  ctx.fillText(String(CONFIG.EVENT).toUpperCase(), W / 2, 262);
  spaced(ctx, 0);

  ctx.fillStyle = primary;
  fitFont(ctx, T.docTitle, '800', 104, W - 300, 40);
  ctx.fillText(T.docTitle, W / 2, 360);

  ctx.fillStyle = MUTED;
  ctx.font = `400 34px ${FONT}`;
  ctx.fillText(T.docCertifies, W / 2, 430);

  // Holder
  const holder = name || ' ';
  ctx.fillStyle = INK;
  fitFont(ctx, holder, 'italic 700', 90, W - 420, 30);
  ctx.fillText(holder, W / 2, 522);
  ctx.strokeStyle = LINE;
  ctx.lineWidth = 3;
  ctx.beginPath(); ctx.moveTo(W / 2 - 420, 555); ctx.lineTo(W / 2 + 420, 555); ctx.stroke();

  const line = fmt(T.docLine, { program: CONFIG.PROGRAM });
  ctx.fillStyle = MUTED;
  fitFont(ctx, line, '400', 34, W - 300, 16);
  ctx.fillText(line, W / 2, 612);

  // Stamps
  const cy = 858;
  ctx.strokeStyle = '#3fafeb'; // the programme line, dashed at the end
  ctx.lineWidth = 6;
  ctx.beginPath(); ctx.moveTo(W / 5, cy); ctx.lineTo((W * 4) / 5, cy); ctx.stroke();
  ctx.setLineDash([22, 14]);
  ctx.beginPath(); ctx.moveTo((W * 4) / 5, cy); ctx.lineTo(W - 110, cy); ctx.stroke();
  ctx.setLineDash([]);
  const tilt = [-6, 4, 3, -4];
  IDS.forEach((id, i) => drawStamp(ctx, id, (W * (i + 1)) / 5, cy, tilt[i]));

  // Footer
  const dates = IDS.map((id) => state.stars[id]).filter(Boolean).sort();
  const completed = dates.at(-1) || new Date().toISOString();
  ctx.fillStyle = MUTED;
  ctx.font = `400 30px ${FONT}`;
  ctx.fillText(fmt(T.docCompleted, { date: fmtDate(completed, true) }), W / 2, 1110);
  return cv;
}
