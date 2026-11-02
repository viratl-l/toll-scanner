export const digits = s => s.replace(/[๐-๙]/g, c => String(c.charCodeAt(0)-3664));
export function cents(value) {
  const s = digits(String(value)).replace(/,/g,'').trim();
  if (!/^\d{1,7}(\.\d{1,2})?$/.test(s)) return null;
  const [a,b=''] = s.split('.'); return Number(a)*100+Number(b.padEnd(2,'0'));
}
export function parseReceipt(raw) {
  const text = digits(raw), lines = text.split(/\n/).map(x=>x.trim()).filter(Boolean);
  const amountLines = lines.filter(x=>/บาท|baht|thb|total|amount|ค่าผ่านทาง|รวมเงิน|จำนวนเงิน/i.test(x) && !/vat|ภาษี|เงินทอน|change/i.test(x));
  const values = amountLines.flatMap(line=>[...line.matchAll(/(?:^|[^\d/])((?:\d{1,3},)*\d{1,7}(?:\.\d{1,2})?)\s*(?:บาท|baht|thb|฿|$)/gi)].map(m=>cents(m[1]))).filter(x=>x!==null && x>0);
  const unique = [...new Set(values)];
  return {amount:unique.length===1 ? (unique[0]/100).toFixed(2):'', date:text.match(/\b\d{1,2}[/-]\d{1,2}[/-]\d{2,4}\b/)?.[0]||'', receipt:text.match(/(?:เลขที่|receipt\s*(?:no\.?|#)?|ticket\s*(?:no\.?)?)\s*[:：]?\s*([A-Z0-9-]{3,})/i)?.[1]||'', station:lines.find(x=>/ด่าน|plaza/i.test(x))||'', raw, ambiguous:unique.length!==1};
}
export function duplicate(row, rows) {
  if (row.hash && rows.some(x=>x.hash===row.hash)) return 'ภาพเดิม';
  if (row.receipt && row.date && rows.some(x=>x.receipt===row.receipt && x.date===row.date && x.station===row.station)) return 'เลขใบเสร็จและวันเดียวกัน';
  return '';
}
export function total(rows) { return rows.filter(x=>x.checked && !x.duplicate).reduce((n,x)=>n+(cents(x.amount)??0),0); }
export function csv(rows) {
  const cell = v => '"'+String(v??'').replace(/^[=+@\-\t\r]/,"'$&").replace(/"/g,'""')+'"';
  return '\uFEFF'+[['วันที่','ด่าน','เลขใบเสร็จ','บาท'],...rows.filter(x=>x.checked&&!x.duplicate).map(x=>[x.date,x.station,x.receipt,(cents(x.amount)/100).toFixed(2)])].map(r=>r.map(cell).join(',')).join('\r\n');
}
