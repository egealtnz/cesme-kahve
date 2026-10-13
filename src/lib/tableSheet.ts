// Printable QR cards for a branch's tables (A4, 6 per page). Opened in the browser or shared as a file
// from the phone, then printed and placed on the tables.
import qrcode from 'qrcode-generator';
import { tableLink } from './table';

function qrSvg(text: string): string {
  const qr = qrcode(0, 'M');
  qr.addData(text);
  qr.make();
  const n = qr.getModuleCount();
  let d = '';
  for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) if (qr.isDark(r, c)) d += `M${c + 2} ${r + 2}h1v1h-1z`;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${n + 4} ${n + 4}" shape-rendering="crispEdges"><rect width="100%" height="100%" fill="#fff"/><path d="${d}" fill="#00283E"/></svg>`;
}

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!));

export function tableSheetHtml(branch: { id: string; name: string }, count: number): string {
  const cards = Array.from({ length: count }, (_, i) => i + 1).map((n) => `
    <div class="card">
      <div class="brand">ÇEŞME KAHVE</div>
      <div class="table">Masa ${n}</div>
      <div class="qr">${qrSvg(tableLink(branch.id, n))}</div>
      <div class="tr">Telefonunun kamerasıyla okut, uygulamadan sipariş ver; masana getirelim.</div>
      <div class="en">Scan with your phone camera, order in the app and we bring it to your table.</div>
      <div class="branch">${esc(branch.name)} · Table ${n}</div>
    </div>`).join('');
  return `<!doctype html><html lang="tr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(branch.name)} · Masa QR kodları</title>
<style>
  @page { size: A4; margin: 10mm; }
  body { margin: 0; font-family: Georgia, 'Times New Roman', serif; color: #00283E; background: #f6efe6; }
  .bar { font-family: Arial, sans-serif; padding: 12px 16px; background: #00283E; color: #fff; display: flex; gap: 12px; align-items: center; }
  .bar button { font: inherit; padding: 8px 14px; border-radius: 999px; border: 0; background: #CA812A; color: #fff; cursor: pointer; }
  .grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 8mm; padding: 8mm; }
  .card { background: #fffdf8; border: 1px solid #eadbc8; border-radius: 6mm; padding: 7mm 6mm; text-align: center; break-inside: avoid; page-break-inside: avoid; }
  .brand { letter-spacing: 3px; font-size: 11pt; color: #9a5f17; }
  .table { font-size: 30pt; font-weight: 700; margin: 2mm 0 3mm; }
  .qr svg { width: 46mm; height: 46mm; }
  .tr { font-family: Arial, sans-serif; font-size: 10pt; margin-top: 3mm; }
  .en { font-family: Arial, sans-serif; font-size: 9pt; color: #5b6b75; margin-top: 1mm; }
  .branch { font-family: Arial, sans-serif; font-size: 8pt; color: #8a969e; margin-top: 3mm; }
  @media print { .bar { display: none; } body { background: #fff; } .grid { padding: 0; } }
</style></head><body>
<div class="bar"><b>${esc(branch.name)}</b> · ${count} masa <button onclick="print()">Yazdır</button></div>
<div class="grid">${cards}</div>
</body></html>`;
}
