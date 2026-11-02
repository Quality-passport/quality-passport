// PDF export with jsPDF (cdnjs, pinned version + integrity hash).
// The library is preloaded early so the passport still works if the wifi drops later.
// Without it, the passport is saved as a PNG image instead.
import { T, toast } from '../ui.js';
import { withTimeout } from '../util.js';
import { drawPassport } from './draw.js';

const JSPDF_URL = 'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js';
const JSPDF_SRI = 'sha384-JcnsjUPPylna1s1fvi1u12X5qjY5OL56iySh75FdtrwhO/SWXgMjoVqcKyIIWOLk';

let loading = null;
function loadJsPDF() {
  if (window.jspdf?.jsPDF) return Promise.resolve(window.jspdf);
  if (!loading) {
    loading = new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = JSPDF_URL;
      s.integrity = JSPDF_SRI;
      s.crossOrigin = 'anonymous';
      s.onload = () => (window.jspdf ? resolve(window.jspdf) : reject(new Error('jspdf missing')));
      s.onerror = () => { loading = null; s.remove(); reject(new Error('jspdf load failed')); };
      document.head.appendChild(s);
    });
  }
  return loading;
}

export function preloadPdf() { loadJsPDF().catch(() => {}); }

async function buildPdf(name) {
  const canvas = await drawPassport(name);
  const { jsPDF } = await withTimeout(loadJsPDF(), 15000);
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
  doc.setProperties({ title: `${T.docTitle} · ${name}` });
  doc.addImage(canvas.toDataURL('image/jpeg', 0.92), 'JPEG', 0, 0, 297, 210);
  return doc;
}

export async function downloadPassport(name) {
  const FILE = T.fileName;
  try {
    (await buildPdf(name)).save(`${FILE}.pdf`);
  } catch {
    const a = document.createElement('a');
    a.href = (await drawPassport(name)).toDataURL('image/png');
    a.download = `${FILE}.png`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    toast(T.pdfFallback, 6000);
  }
}

/** Shares the PDF through the share sheet. True if shared or cancelled by the user,
 *  false if it could not share (then the caller downloads it instead). */
export async function sharePassportFile(name) {
  try {
    const blob = (await buildPdf(name)).output('blob');
    const file = new File([blob], `${T.fileName}.pdf`, { type: 'application/pdf' });
    await navigator.share({ files: [file], title: T.docTitle });
    return true;
  } catch (err) {
    return err?.name === 'AbortError';
  }
}

export function canShareFiles() {
  try {
    const f = new File(['x'], `${T.fileName}.pdf`, { type: 'application/pdf' });
    return !!navigator.canShare?.({ files: [f] });
  } catch {
    return false;
  }
}
