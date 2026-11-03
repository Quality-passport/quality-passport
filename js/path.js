// The 4 pillars on a hairline (programme slide look), dashed at the end.
// A pillar not yet earned stays hidden ("?"): pillars are discovered one QR code at a time.
// A quiz pillar answered wrongly is discovered (icon and name) but has no star: "No star".
import { CONFIG } from '../config.js';
import { iconSvg } from './icons.js';
import { fmtDate } from './lang.js';
import { T, starSvg } from './ui.js';
import { fmt } from './util.js';

/**
 * opts.lit(id) -> bool      earned
 * opts.missed(id) -> bool   quiz pillar answered wrongly (never true for the open-question series)
 * opts.date(id) -> ISO|null  shown under the name when earned
 * opts.fresh                 pillar just earned (stamp animation)
 */
export function renderPath(el, { lit = () => false, missed = () => false, date = () => null, fresh = null } = {}) {
  el.replaceChildren(...CONFIG.PILLARS.map((p) => {
    const on = lit(p.id);
    const off = !on && missed(p.id);
    const node = document.createElement('div');
    node.className = 'node' + (on ? ' on' : off ? ' missed' : ' hidden-pillar') + (p.id === fresh ? ' fresh' : '');
    node.setAttribute('role', 'img');
    node.setAttribute('aria-label', on ? fmt(T.pillarEarnedLabel, { pillar: p.name }) : off ? fmt(T.pillarMissedLabel, { pillar: p.name }) : T.toDiscover);

    const ring = document.createElement('div');
    ring.className = 'ring';
    if (on || off) ring.appendChild(iconSvg(p.icon));
    else {
      const q = document.createElement('span');
      q.className = 'mystery';
      q.textContent = '?';
      ring.appendChild(q);
    }

    const slot = document.createElement('span');
    slot.className = 'slot';
    if (on) slot.appendChild(starSvg(true));

    const lbl = document.createElement('span');
    lbl.className = 'lbl';
    lbl.textContent = on || off ? p.name : T.toDiscover;

    node.append(ring, slot, lbl);
    if (on && date(p.id)) {
      const d = document.createElement('span');
      d.className = 'date';
      d.textContent = fmtDate(date(p.id));
      node.appendChild(d);
    } else if (off) {
      const d = document.createElement('span');
      d.className = 'date';
      d.textContent = T.noStar;
      node.appendChild(d);
    }
    return node;
  }));
}
