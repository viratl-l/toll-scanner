import {parseReceipt,cents,duplicate,total,csv} from './core.js';
const $=id=>document.getElementById(id); let rows=[],busy=false,worker,stream,timer,lastFrame,stable=0,cooldown=0,cameraGeneration=0;
const say=s=>$('status').textContent=s;
function render(){
  $('total').textContent=new Intl.NumberFormat('th-TH',{style:'currency',currency:'THB'}).format(total(rows)/100);
  $('count').textContent=rows.filter(x=>x.checked&&!x.duplicate).length+' รายการ'; $('export').disabled=!rows.some(x=>x.checked&&!x.duplicate);
  $('rows').replaceChildren(); if(!rows.length){const p=document.createElement('p');p.className='empty';p.textContent='ยังไม่มีใบเสร็จ เริ่มจากเพิ่มภาพด้านบน';$('rows').append(p);}
  for(const row of rows){
    const a=document.createElement('article');a.className=row.checked?'confirmed':'';
    const title=document.createElement('p');title.textContent=row.checked?'✓ ยืนยันแล้ว':'ตรวจสอบก่อนรวมยอด';a.append(title);
    const fields=document.createElement('div');fields.className='fields';
    for(const [key,label] of [['date','วันที่'],['station','ด่าน'],['receipt','เลขใบเสร็จ'],['amount','ยอดเงิน (บาท)']]){const l=document.createElement('label');l.textContent=label;const input=document.createElement('input');input.value=row[key]||'';if(key==='amount')input.inputMode='decimal';input.addEventListener('input',()=>{row[key]=input.value;row.checked=false;title.textContent='แก้ไขแล้ว กรุณายืนยันอีกครั้ง';a.className='';updateSummary();});l.append(input);fields.append(l);}a.append(fields);
    const warning=document.createElement('p');warning.className='badge';warning.textContent=row.duplicate?'⚠ อาจซ้ำ: '+row.duplicate:row.ambiguous?'โปรดระบุยอดเงินที่ถูกต้อง':'โปรดเทียบข้อมูลกับใบเสร็จ';a.append(warning);
    const actions=document.createElement('div');actions.className='actions';
    const confirm=document.createElement('button');confirm.textContent='ยืนยัน';confirm.onclick=()=>{if(cents(row.amount)===null||cents(row.amount)<=0){say('กรุณาระบุยอดเงินมากกว่า 0 ไม่เกินทศนิยม 2 ตำแหน่ง');return;}row.duplicate=row.allowDuplicate?'':duplicate(row,rows.filter(x=>x!==row));if(row.duplicate){say('พบรายการอาจซ้ำ ตรวจสอบแล้วเลือกเก็บรายการซ้ำหากเป็นคนละใบ');render();return;}row.checked=true;render();};actions.append(confirm);
    if(row.duplicate){const keep=document.createElement('button');keep.className='secondary';keep.textContent='เก็บรายการซ้ำนี้';keep.onclick=()=>{row.allowDuplicate=true;row.duplicate='';row.checked=false;render();};actions.append(keep);}
    const remove=document.createElement('button');remove.textContent='ลบ';remove.className='danger';remove.onclick=()=>{rows=rows.filter(x=>x!==row);render();};actions.append(remove);a.append(actions);
    if(row.raw){const d=document.createElement('details'),s=document.createElement('summary'),p=document.createElement('p');s.textContent='ดูข้อความที่อ่านได้';p.textContent=row.raw;d.append(s,p);a.append(d);}$('rows').append(a);
  }
}
function updateSummary(){ $('total').textContent=new Intl.NumberFormat('th-TH',{style:'currency',currency:'THB'}).format(total(rows)/100);$('count').textContent=rows.filter(x=>x.checked&&!x.duplicate).length+' รายการ';$('export').disabled=!rows.some(x=>x.checked&&!x.duplicate); }
async function getWorker(){if(worker)return worker; if(!globalThis.Tesseract){await new Promise((resolve,reject)=>{const s=document.createElement('script');s.src='https://cdn.jsdelivr.net/npm/tesseract.js@5.1.1/dist/tesseract.min.js';s.onload=resolve;s.onerror=()=>{s.remove();reject(Error('โหลด OCR ไม่สำเร็จ ตรวจสอบอินเทอร์เน็ต หรือเพิ่มรายการเอง'));};document.head.append(s);});} worker=await Tesseract.createWorker('tha+eng',1,{logger:m=>{if(m.progress!==undefined){$('progress').value=m.progress;say('กำลังอ่านภาพ '+Math.round(m.progress*100)+'%');}}});return worker;}
async function scan(blob){
  const bytes=await blob.arrayBuffer(),hash=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),x=>x.toString(16).padStart(2,'0')).join('');
  if(rows.some(x=>x.hash===hash)){say('ข้ามภาพเดิมที่เคยเพิ่มแล้ว');return;}
  const url=URL.createObjectURL(blob);let bitmap;
  try{bitmap=await createImageBitmap(blob);if(bitmap.width*bitmap.height>50000000)throw Error('ภาพใหญ่เกินไป กรุณาลดขนาด');const canvas=document.createElement('canvas'),scale=Math.min(1,2200/Math.max(bitmap.width,bitmap.height));canvas.width=Math.round(bitmap.width*scale);canvas.height=Math.round(bitmap.height*scale);canvas.getContext('2d').drawImage(bitmap,0,0,canvas.width,canvas.height);const w=await getWorker();const result=await w.recognize(canvas);const row={...parseReceipt(result.data.text),hash,checked:false};row.duplicate=duplicate(row,rows);rows.push(row);render();say('อ่านแล้ว กรุณาตรวจและยืนยันข้อมูล');canvas.width=canvas.height=0;}
  finally{bitmap?.close();URL.revokeObjectURL(url);}
}
async function batch(files){if(busy){say('กำลังอ่านภาพก่อนหน้า กรุณารอสักครู่');return;}busy=true;$('progress').hidden=false;try{for(const file of files){try{if(file.size>25*1024*1024)throw Error('ภาพเกิน 25 MB กรุณาลดขนาด');await scan(file);}catch(e){say(e.message||'อ่านภาพไม่ได้ ลอง JPEG/PNG หรือเพิ่มเอง');}}}finally{busy=false;$('progress').hidden=true;}}
for(const id of ['files','capture'])$(id).onchange=async e=>{const files=[...e.target.files];e.target.value='';await batch(files);};
$('manual').onclick=()=>{rows.push({amount:'',date:'',station:'',receipt:'',checked:false});render();};
$('clear').onclick=()=>{if(confirm('ล้างรายการทั้งหมด? จะกู้คืนไม่ได้')){rows=[];render();say('ล้างรายการแล้ว');}};
$('export').onclick=()=>{const url=URL.createObjectURL(new Blob([csv(rows)],{type:'text/csv;charset=utf-8'})),a=document.createElement('a');a.href=url;a.download='toll-receipts.csv';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);};
function stop(){cameraGeneration++;clearInterval(timer);stream?.getTracks().forEach(t=>t.stop());stream=null;$('video').srcObject=null;$('cameraBox').hidden=true;$('camera').disabled=false;lastFrame=null;stable=0;}
async function snap(){if(busy||!stream||!$('video').videoWidth)return;cooldown=Date.now()+8000;stable=0;const c=document.createElement('canvas');c.width=$('video').videoWidth;c.height=$('video').videoHeight;c.getContext('2d').drawImage($('video'),0,0);const blob=await new Promise(r=>c.toBlob(r,'image/jpeg',.9));c.width=c.height=0;if(blob)await batch([blob]);}
$('camera').onclick=async()=>{const generation=++cameraGeneration;$('camera').disabled=true;try{const acquired=await navigator.mediaDevices.getUserMedia({video:{facingMode:{ideal:'environment'},width:{ideal:1920}},audio:false});if(generation!==cameraGeneration){acquired.getTracks().forEach(t=>t.stop());return;}stream=acquired;$('video').srcObject=stream;$('cameraBox').hidden=false;await $('video').play();say('เปิดกล้องแล้ว ถือให้นิ่งเพื่อสแกน');const c=document.createElement('canvas');c.width=64;c.height=48;const ctx=c.getContext('2d',{willReadFrequently:true});timer=setInterval(()=>{if(busy||Date.now()<cooldown||!stream||!$('video').videoWidth)return;ctx.drawImage($('video'),0,0,64,48);const data=ctx.getImageData(0,0,64,48).data;let diff=0,brightness=0;for(let i=0;i<data.length;i+=4){brightness+=data[i];if(lastFrame)diff+=Math.abs(data[i]-lastFrame[i]);}if(lastFrame&&diff/3072<6&&brightness/3072>35)stable++;else stable=0;lastFrame=data;if(stable>=4)void snap().catch(e=>say(e.message));},500);}catch(e){stop();say('เปิดกล้องไม่ได้ กรุณาอนุญาตกล้องบน HTTPS หรือใช้ปุ่มถ่ายภาพ/เลือกภาพ');}};
$('snap').onclick=()=>void snap().catch(e=>say(e.message));$('stop').onclick=stop;document.addEventListener('visibilitychange',()=>{if(document.hidden)stop();});window.addEventListener('pagehide',()=>{stop();void worker?.terminate();});
if('serviceWorker'in navigator)navigator.serviceWorker.register('./sw.js').catch(()=>say('ใช้แอปได้ แต่ยังเตรียมโหมดออฟไลน์ไม่สำเร็จ'));
render();
