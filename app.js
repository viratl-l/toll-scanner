import {parseReceipt,cents,total,csv,recalculate} from './core.js';
import {prepareImage} from './prepare.js';
const $=id=>document.getElementById(id);
let rows=[],busy=false,worker,stream,timer,lastFrame,stable=0,cooldown=0,cameraGeneration=0;
const money=n=>new Intl.NumberFormat('th-TH',{style:'currency',currency:'THB'}).format(n/100);
const say=s=>$('status').textContent=s;
const el=(tag,className,text)=>{const node=document.createElement(tag);if(className)node.className=className;if(text!==undefined)node.textContent=text;return node;};
function updateSummary(){
  const included=rows.filter(x=>x.checked&&!x.duplicate),missing=rows.filter(x=>!x.checked&&!x.duplicate).length,dupes=rows.filter(x=>x.duplicate).length;
  $('total').textContent=money(total(rows));$('mobileTotal').textContent=money(total(rows));$('count').textContent=included.length+' ใบเสร็จ';$('rowCount').textContent=rows.length;
  $('export').disabled=!included.length;$('clear').disabled=busy||!rows.length;
  $('pending').textContent=!rows.length?'เพิ่มใบเสร็จเพื่อเริ่มรวมยอด':[missing?`ยังไม่ได้ยอด ${missing} ใบ`:'บวกยอดให้แล้ว แก้ตัวเลขได้เสมอ',dupes?`กันรายการอาจซ้ำ ${dupes} ใบ`:null].filter(Boolean).join(' · ');
  const step=rows.length?(included.length===rows.length?2:1):0;document.querySelectorAll('.steps li').forEach((li,i)=>li.classList.toggle('active',i===step));
}
function refreshDuplicates(){
  recalculate(rows);
}
function render(){
  refreshDuplicates();updateSummary();$('rows').replaceChildren();
  if(!rows.length){const empty=el('div','empty');empty.append(el('div','empty-mark','▤'),el('strong','','ยังไม่มีใบเสร็จ'),el('p','','เพิ่มรูปด้านบน แล้วระบบจะอ่านและบวกยอดให้'));$('rows').append(empty);}
  rows.forEach((row,index)=>{
    const card=el('article','receipt-card'+(row.checked?' confirmed':''));card.setAttribute('aria-label',`ใบเสร็จที่ ${index+1}`);
    const top=el('div','receipt-top'),title=el('div','receipt-title');title.append(el('span','receipt-number',String(index+1)),el('span','',`ใบเสร็จที่ ${index+1}`));
    const remove=el('button','remove-button','×');remove.setAttribute('aria-label',`ลบใบเสร็จที่ ${index+1}`);remove.onclick=()=>{rows=rows.filter(x=>x!==row);render();};top.append(title,remove);card.append(top);
    const amountLine=el('div','amount-line'),label=el('label','amount-field','ยอดเงิน (บาท)'),wrap=el('div','amount-input-wrap'),input=el('input');
    input.value=row.amount||'';input.placeholder='กรอกยอด';input.inputMode='decimal';input.autocomplete='off';wrap.append(el('span','','฿'),input);label.append(wrap);
    const result=el('span','auto-label',row.checked?'✓ บวกแล้ว':'ยังไม่รวม');amountLine.append(label,result);card.append(amountLine);
    const note=el('p','row-note');card.append(note);
    function updateCard(){result.textContent=row.checked?'✓ บวกแล้ว':'ยังไม่รวม';card.classList.toggle('confirmed',row.checked);note.classList.toggle('warning',!row.checked);note.textContent=row.duplicate?'อาจซ้ำ: '+row.duplicate+' จึงยังไม่บวกยอด':cents(row.amount)>0?'แก้ยอดในช่องได้ ระบบรวมใหม่ให้อัตโนมัติ':row.amount?'กรอกจำนวนมากกว่า 0 และทศนิยมไม่เกิน 2 ตำแหน่ง':'อ่านยอดไม่ได้ กรอกตัวเลขจากใบเสร็จได้เลย';input.setAttribute('aria-invalid',row.amount&&!(cents(row.amount)>0)?'true':'false');}
    input.oninput=()=>{row.amount=input.value;row.checked=!row.duplicate&&cents(row.amount)>0;updateCard();updateSummary();};
    if(row.duplicate){const keep=el('button','text-button','เป็นคนละใบ ให้บวกยอดนี้ด้วย');keep.onclick=()=>{row.allowDuplicate=true;render();};card.append(keep);}
    const details=el('details','receipt-details'),summary=el('summary','','รายละเอียดใบเสร็จ');details.append(summary);const fields=el('div','detail-fields');
    for(const [key,name] of [['station','ด่าน'],['date','วันที่'],['receipt','เลขใบเสร็จ']]){const l=el('label','',name),field=el('input');field.value=row[key]||'';field.placeholder='ไม่ระบุก็ได้';field.onchange=()=>{row[key]=field.value;row.allowDuplicate=false;render();};l.append(field);fields.append(l);}details.append(fields);
    if(row.raw){const raw=el('details'),rs=el('summary','','ดูข้อความที่อ่านได้');raw.append(rs,el('p','raw-text',row.raw));details.append(raw);}card.append(details);updateCard();$('rows').append(card);
  });
}
function setBusy(value){busy=value;for(const id of ['files','capture','clear'])$(id).disabled=value||(id==='clear'&&!rows.length);document.querySelector('.status-box').classList.toggle('is-busy',value);}
async function getWorker(){
  if(worker)return worker;
  if(!globalThis.Tesseract)await new Promise((resolve,reject)=>{const s=document.createElement('script');s.src='https://cdn.jsdelivr.net/npm/tesseract.js@5.1.1/dist/tesseract.min.js';s.onload=resolve;s.onerror=()=>{s.remove();reject(Error('โหลดตัวอ่านไม่สำเร็จ ตรวจอินเทอร์เน็ต หรือกดเพิ่มยอดเอง'));};document.head.append(s);});
  worker=await Tesseract.createWorker('tha+eng',1,{logger:m=>{if(m.progress!==undefined){$('progress').value=m.progress;say('กำลังอ่านใบเสร็จ… '+Math.round(m.progress*100)+'%');}}});return worker;
}
async function scan(blob){
  const hash=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',await blob.arrayBuffer())),x=>x.toString(16).padStart(2,'0')).join('');
  if(rows.some(x=>x.hash===hash))return {skipped:true};
  let bitmap,canvas;
  try{bitmap=await createImageBitmap(blob);if(bitmap.width*bitmap.height>50000000)throw Error('รูปใหญ่เกินไป กรุณาลดขนาด');canvas=document.createElement('canvas');const scale=Math.min(1,2400/Math.max(bitmap.width,bitmap.height));canvas.width=Math.round(bitmap.width*scale);canvas.height=Math.round(bitmap.height*scale);canvas.getContext('2d').drawImage(bitmap,0,0,canvas.width,canvas.height);const w=await getWorker(),result=await w.recognize(canvas);rows.push({...parseReceipt(result.data.text),hash,checked:false});render();return {added:true};}
  finally{bitmap?.close();if(canvas)canvas.width=canvas.height=0;}
}
async function batch(files,prepare=false){
  if(busy){say('กำลังอ่านรูปก่อนหน้า รอสักครู่ครับ');return;}
  setBusy(true);let added=0,skipped=0,errors=0;
  try{for(let i=0;i<files.length;i++){const file=files[i];try{if(file.size>25*1024*1024)throw Error('รูปเกิน 25 MB กรุณาลดขนาด');say(`กำลังเตรียมรูป ${i+1} / ${files.length}`);const images=prepare?await prepareImage(file,{index:i+1,count:files.length}):[file];for(const image of images){$('progress').hidden=false;const outcome=await scan(image);if(outcome.added)added++;if(outcome.skipped)skipped++;}$('progress').hidden=true;}catch(e){errors++;say(e.message||'อ่านรูปไม่ได้ ลอง JPEG/PNG หรือเพิ่มยอดเอง');}}
    if(!errors)say(added?`เพิ่มแล้ว ${added} ใบ · บวกยอดที่อ่านได้ให้แล้ว${skipped?' · ข้ามรูปซ้ำ '+skipped+' รูป':''} · ตรวจตัวเลขก่อนใช้ยอด`:skipped?'ข้ามรูปเดิมที่เคยเพิ่มแล้ว':'ยังไม่ได้เพิ่มใบเสร็จ');
  }finally{setBusy(false);$('progress').hidden=true;updateSummary();}
}
for(const id of ['files','capture'])$(id).onchange=async e=>{const files=[...e.target.files];e.target.value='';stop();await batch(files,$('adjust').checked);};
$('manual').onclick=()=>{rows.push({amount:'',date:'',station:'',receipt:'',checked:false});render();const card=$('rows').lastElementChild;card.scrollIntoView({behavior:'smooth',block:'center'});card.querySelector('input').focus({preventScroll:true});};
$('clear').onclick=()=>{if(confirm('ล้างใบเสร็จทั้งหมดและเริ่มรวมยอดใหม่?')){rows=[];render();say('พร้อมเริ่มรวมยอดใหม่');}};
$('export').onclick=()=>{const url=URL.createObjectURL(new Blob([csv(rows)],{type:'text/csv;charset=utf-8'})),a=document.createElement('a');a.href=url;a.download='toll-receipts.csv';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);say('ดาวน์โหลด CSV แล้ว');};
function stop(){cameraGeneration++;clearInterval(timer);stream?.getTracks().forEach(t=>t.stop());stream=null;$('video').srcObject=null;$('cameraBox').hidden=true;$('camera').disabled=false;lastFrame=null;stable=0;}
async function snap(){if(busy||!stream||!$('video').videoWidth)return;cooldown=Date.now()+8000;stable=0;const c=document.createElement('canvas');c.width=$('video').videoWidth;c.height=$('video').videoHeight;c.getContext('2d').drawImage($('video'),0,0);const blob=await new Promise(r=>c.toBlob(r,'image/jpeg',.9));c.width=c.height=0;if(blob)await batch([blob]);}
$('camera').onclick=async()=>{if(busy){say('รออ่านรูปให้เสร็จก่อนเปิดกล้อง');return;}const generation=++cameraGeneration;$('camera').disabled=true;try{const acquired=await navigator.mediaDevices.getUserMedia({video:{facingMode:{ideal:'environment'},width:{ideal:1920}},audio:false});if(generation!==cameraGeneration){acquired.getTracks().forEach(t=>t.stop());return;}stream=acquired;$('cameraBox').hidden=false;$('video').srcObject=stream;await $('video').play();$('cameraBox').scrollIntoView({behavior:'smooth',block:'center'});say('วางใบเสร็จครั้งละหนึ่งใบ ถือให้นิ่ง ระบบจะสแกนและบวกยอด');const c=document.createElement('canvas');c.width=64;c.height=48;const ctx=c.getContext('2d',{willReadFrequently:true});timer=setInterval(()=>{if(busy||Date.now()<cooldown||!stream||!$('video').videoWidth)return;ctx.drawImage($('video'),0,0,64,48);const data=ctx.getImageData(0,0,64,48).data;let diff=0,brightness=0;for(let i=0;i<data.length;i+=4){brightness+=data[i];if(lastFrame)diff+=Math.abs(data[i]-lastFrame[i]);}if(lastFrame&&diff/3072<6&&brightness/3072>35)stable++;else stable=0;lastFrame=data;if(stable>=4)void snap().catch(e=>say(e.message));},500);}catch(e){stop();say('เปิดกล้องไม่ได้ กรุณาอนุญาตกล้อง หรือใช้ “ถ่ายรูป” / “เลือกรูปใบเสร็จ”');}};
$('snap').onclick=()=>void snap().catch(e=>say(e.message));$('stop').onclick=stop;document.addEventListener('visibilitychange',()=>{if(document.hidden)stop();});window.addEventListener('pagehide',()=>{stop();void worker?.terminate();});
if('serviceWorker'in navigator)navigator.serviceWorker.register('./sw.js').catch(()=>{});
render();
