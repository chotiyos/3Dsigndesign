import { baht, type CostLine } from './estimate'

export interface JobSheetData {
  shop: string
  customer: string
  job: string
  notes: string
  date: Date
  /** PNG data URL of the 3D view, or null when it could not be captured. */
  image: string | null
  style: string
  text: string
  size: { w: number; h: number; d: number }
  parts: { code: string; label: string; material: string; method: string; size: string; grams: string }[]
  /** Label and value pairs: outline length, face area, LEDs. */
  figures: [string, string][]
  /** Present only when the shop chose to show prices on the sheet. */
  cost: { lines: CostLine[]; subtotal: number; markup: number; margin: number; total: number } | null
}

const esc = (text: string) =>
  text.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!)

const qty = (n: number, unit: string) => `${n.toLocaleString('th-TH', { maximumFractionDigits: unit === 'กก.' || unit === 'ตร.ม.' ? 3 : 0 })} ${unit}`

/**
 * A one-page A4 job sheet for the customer to approve: picture, sizes, parts,
 * optional prices, and signature boxes. A standalone HTML page that prints
 * (or saves as PDF) from the browser's own print dialog; the editor shows it in a frame.
 */
export function jobSheetHtml(d: JobSheetData): string {
  const date = d.date.toLocaleDateString('th-TH', { year: 'numeric', month: 'long', day: 'numeric' })
  const rows = d.parts
    .map((p) => `<tr><td class="code">${esc(p.code)}</td><td>${esc(p.label)}</td><td>${esc(p.material)}</td><td>${esc(p.method)}</td><td class="num">${esc(p.size)}</td><td class="num">${esc(p.grams)}</td></tr>`)
    .join('')
  const cost = d.cost
    ? `<h2>ราคา</h2><table><thead><tr><th>รายการ</th><th class="num">จำนวน</th><th class="num">ราคาต่อหน่วย</th><th class="num">บาท</th></tr></thead><tbody>${d.cost.lines
        .map((l) => `<tr><td>${esc(l.label)}</td><td class="num">${qty(l.qty, l.unit)}</td><td class="num">${baht(l.rate)}</td><td class="num">${baht(l.amount)}</td></tr>`)
        .join('')}${d.cost.markup ? `<tr><td colspan="3">บวกเพิ่ม ${d.cost.margin}%</td><td class="num">${baht(d.cost.markup)}</td></tr>` : ''}</tbody><tfoot><tr><td colspan="3">รวม</td><td class="num">${baht(d.cost.total)}</td></tr></tfoot></table>`
    : ''
  return `<!doctype html>
<html lang="th"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>ใบงาน ${esc(d.job || d.text || d.style)}</title>
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Sarabun:wght@400;600;700&display=swap" rel="stylesheet">
<style>
@page{size:A4;margin:12mm}
*{box-sizing:border-box}
body{margin:0;background:#e9edf3;color:#14213d;font:13px/1.5 Sarabun,'Leelawadee UI',Tahoma,sans-serif}
.sheet{max-width:210mm;margin:16px auto;background:#fff;padding:14mm 12mm;box-shadow:0 2px 12px rgba(20,33,61,.12)}
header{display:flex;justify-content:space-between;gap:16px;border-bottom:2px solid #14213d;padding-bottom:8px}
h1{font-size:20px;margin:0}
h2{font-size:14px;margin:14px 0 4px}
.meta{text-align:right;font-size:12px}
.meta div{white-space:nowrap}
.top{display:grid;gap:12px;margin-top:10px}
.pic{border:1px solid #c9d2e0;border-radius:6px;background:#eef2f8;min-height:160px;max-height:95mm;display:flex;align-items:center;justify-content:center;overflow:hidden}
.pic img{max-width:100%;max-height:95mm;object-fit:contain;display:block}
dl{margin:0;display:grid;grid-template-columns:auto 1fr auto 1fr;gap:3px 12px}
dt{color:#5a6782}
dd{margin:0;font-weight:600}
table{width:100%;border-collapse:collapse;font-size:12px}
th,td{border-bottom:1px solid #dbe1ea;padding:4px 6px;text-align:left;vertical-align:top}
th{background:#f2f5fa;font-weight:600}
.num{text-align:right;font-variant-numeric:tabular-nums;white-space:nowrap}
.code{font-weight:700}
tfoot td{font-weight:700;font-size:14px;border-top:2px solid #14213d;border-bottom:0}
.notes{border:1px solid #dbe1ea;border-radius:6px;padding:6px 8px;min-height:40px;white-space:pre-wrap}
.sign{display:grid;grid-template-columns:1fr 1fr;gap:24px;margin-top:26px}
.sign div{border-top:1px solid #14213d;padding-top:4px;text-align:center;font-size:12px}
.sign small{display:block;color:#5a6782;margin-top:14px}
.foot{margin-top:14px;font-size:11px;color:#5a6782}
@media (max-width:640px){.sheet{margin:0;padding:16px}dl{grid-template-columns:auto 1fr}}
@media print{body{background:#fff}.sheet{margin:0;padding:0;box-shadow:none;max-width:none}tr,.sign{break-inside:avoid}}
</style></head><body>
<main class="sheet">
<header><div><h1>ใบงานและใบยืนยันแบบป้าย</h1>${d.shop ? `<div>${esc(d.shop)}</div>` : ''}</div>
<div class="meta">${d.job ? `<div>งาน: <b>${esc(d.job)}</b></div>` : ''}${d.customer ? `<div>ลูกค้า: <b>${esc(d.customer)}</b></div>` : ''}<div>วันที่ ${esc(date)}</div></div></header>
<section class="top">
<div class="pic">${d.image ? `<img src="${d.image}" alt="ภาพป้าย">` : '<span>ไม่มีภาพ</span>'}</div>
<div><dl>
<dt>แบบ</dt><dd>${esc(d.style)}</dd>
${d.text ? `<dt>ข้อความ</dt><dd>${esc(d.text).replace(/\n/g, '<br>')}</dd>` : ''}
<dt>ขนาดรวม</dt><dd>${d.size.w.toFixed(0)} × ${d.size.h.toFixed(0)} × ${d.size.d.toFixed(0)} มม.</dd>
${d.figures.map(([k, v]) => `<dt>${esc(k)}</dt><dd>${esc(v)}</dd>`).join('')}
</dl></div>
</section>
<h2>ชิ้นส่วน</h2>
<table><thead><tr><th>ชิ้น</th><th>ชื่อ</th><th>วัสดุ</th><th>วิธีผลิต</th><th class="num">ขนาด (มม.)</th><th class="num">กรัม</th></tr></thead><tbody>${rows}</tbody></table>
${cost}
<h2>หมายเหตุ</h2><div class="notes">${esc(d.notes)}</div>
<div class="sign"><div>ลูกค้าอนุมัติแบบ<small>วันที่ ........./........./.........</small></div><div>ผู้ออกแบบ / ร้าน<small>วันที่ ........./........./.........</small></div></div>
<p class="foot">ขนาด น้ำหนัก และจำนวนไฟเป็นค่าประมาณจากแบบ 3 มิติ สีบนภาพอาจต่างจากวัสดุจริง</p>
</main></body></html>`
}
