import {cents,digits} from './core.js?v=4.1';
export const linesOf=data=>data.lines|| (data.blocks||[]).flatMap(b=>(b.paragraphs||[]).flatMap(p=>p.lines||[]));
const boxUnion=items=>({x0:Math.min(...items.map(x=>x.bbox.x0)),y0:Math.min(...items.map(x=>x.bbox.y0)),x1:Math.max(...items.map(x=>x.bbox.x1)),y1:Math.max(...items.map(x=>x.bbox.y1))});
const height=b=>Math.max(1,b.y1-b.y0),cx=b=>(b.x0+b.x1)/2,cy=b=>(b.y0+b.y1)/2;
function sameSpot(a,b){const h=Math.max(height(a),height(b));return Math.abs(cx(a)-cx(b))<Math.max(a.x1-a.x0,b.x1-b.x0,h)*.65&&Math.abs(cy(a)-cy(b))<h*.8;}
export function orientationScore(data){const text=data.text||'';const anchors=(text.match(/\btotal\b|price|ราคา|included|receipt|วันที่|baht/gi)||[]).length;return Math.min(anchors,15)*12+(data.confidence||0);}
// Amounts are matched to printed labels in TWO DIMENSIONS, never arbitrary numbers.
export function amountEvidence(data,width,pass=0){
  const lines=linesOf(data),words=lines.flatMap(l=>l.words||[]);
  const nums=words.map(w=>({...w,value:cents(digits(w.text).replace(/^[฿|]+|[|]+$/g,''))})).filter(w=>w.value>0&&w.value<=1000000);
  const units=lines.filter(l=>/^(baht|บาท)$/i.test(l.text.trim()));const found=[];
  for(const line of lines){
    const text=line.text.trim();let kind;
    if(/\btotal\b/i.test(text)&&!/subtotal|vat|tax|change/i.test(text))kind='total';
    else if(/vat|[i{]ncluded/i.test(text)&&/baht|bant|gaht|[i{]ncluded/i.test(text))kind='included';
    else if(/price|pice|ราคา/i.test(text))kind='price';else continue;
    const labelWords=(line.words||[]).filter(w=>kind==='total'?/^total$/i.test(w.text):kind==='included'?/vat|ncluded/i.test(w.text):!/^\d[\d,.]*$/.test(digits(w.text)));
    if(!labelWords.length)continue;const b=boxUnion(labelWords),lh=height(b),labelConfidence=labelWords.reduce((n,w)=>n+w.confidence,0)/labelWords.length;
    const nearby=nums.filter(n=>(kind!=='included'||/^\d[\d,]*\.\d{2}$/.test(digits(n.text)))&&n.bbox.x0>=b.x1-lh*.35&&n.bbox.x0-b.x1<Math.min(width*.38,lh*24)&&Math.abs(cy(n.bbox)-cy(b))<=Math.max(lh*2,height(n.bbox)*1.4)).sort((a,c)=>{
      const distance=n=>Math.abs(cy(n.bbox)-cy(b))/lh*4+Math.max(0,n.bbox.x0-b.x1)/lh*.15;return distance(a)-distance(c);
    });
    if(!nearby.length)continue;const number=nearby[0],nh=height(number.bbox);
    const unit=units.some(u=>u.confidence>=65&&u.bbox.x0>=number.bbox.x1-lh&&u.bbox.x0-number.bbox.x1<Math.max(lh,nh)*12&&Math.abs(cy(u.bbox)-cy(number.bbox))<Math.max(lh,nh)*2.5);
    found.push({value:number.value,bbox:number.bbox,kind,numberConfidence:number.confidence,labelConfidence,unit,pass});
  }
  return found;
}
export function resolveEvidence(evidence,width,imageHeight){
  const groups=[];
  for(const e of evidence){let g=groups.find(g=>g.value===e.value&&g.items.some(x=>sameSpot(x.bbox,e.bbox)));if(!g){g={value:e.value,items:[],bbox:e.bbox};groups.push(g);}g.items.push(e);}
  // EXAT prints the same payment twice: VAT-included amount and Total.
  // Merge only complementary labels, one to one; equal prices on separate receipts stay separate.
  const merged=new Set();
  for(const g of groups.filter(g=>g.items.some(e=>e.kind==='included'))){
    const match=groups.filter(t=>t!==g&&!merged.has(t)&&t.value===g.value&&t.items.some(e=>e.kind==='total')&&!t.items.some(e=>e.kind==='included')&&cy(t.bbox)>cy(g.bbox)&&cy(t.bbox)-cy(g.bbox)<imageHeight*.45&&Math.abs(cx(t.bbox)-cx(g.bbox))<Math.max(width*.09,height(g.bbox)*4)).sort((a,b)=>cy(a.bbox)-cy(b.bbox))[0];
    if(match){g.items.push(...match.items);merged.add(match);}
  }
  return groups.filter(g=>!merged.has(g)).map(g=>{
    const strongest=Math.max(...g.items.map(e=>e.numberConfidence));
    const passes=new Set(g.items.filter(e=>e.numberConfidence>=65).map(e=>e.pass));
    const kinds=new Set(g.items.map(e=>e.kind));
    const coupon=g.items.some(e=>e.kind==='price'&&e.unit&&e.labelConfidence>=65&&e.numberConfidence>=85);
    const validLabel=g.items.some(e=>e.kind==='included'||e.labelConfidence>=55);
    const conflict=evidence.some(e=>e.value!==g.value&&e.numberConfidence>=65&&g.items.some(x=>sameSpot(x.bbox,e.bbox)));
    return {...g,confidence:strongest,trusted:!conflict&&strongest>=80&&validLabel&&(passes.size>=2||kinds.size>=2||coupon),conflict};
  }).filter(g=>g.confidence>=65).sort((a,b)=>cy(a.bbox)-cy(b.bbox)||cx(a.bbox)-cx(b.bbox));
}
