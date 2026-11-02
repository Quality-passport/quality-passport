import { CONFIG } from '../config.js';

export const $ = (id) => document.getElementById(id);
export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** 'Star earned: {pillar}' + {pillar: 'X'} -> 'Star earned: X' */
export function fmt(s, vars = {}) {
  return String(s).replace(/\{(\w+)\}/g, (m, k) => (k in vars ? vars[k] : m));
}

export function pillar(id) {
  return CONFIG.PILLARS.find((p) => p.id === Number(id));
}

export function uid() {
  if (window.crypto?.randomUUID) return crypto.randomUUID();
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 10);
}

export function withTimeout(promise, ms) {
  return Promise.race([promise, sleep(ms).then(() => { throw new Error('timeout'); })]);
}

/** 'jean.dupont2@x.com' -> 'Jean Dupont' */
export function nameFromEmail(email) {
  const local = String(email || '').split('@')[0].split('+')[0];
  return local.split(/[._-]+/)
    .map((w) => w.replace(/\d+/g, ''))
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(' ');
}
