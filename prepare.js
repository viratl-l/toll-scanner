// Images and crops exist only in memory; nothing is uploaded or persisted.
export async function prepareImage(file) {
  const bitmap=await createImageBitmap(file);
  if(bitmap.width*bitmap.height>50000000){bitmap.close();throw Error('ภาพใหญ่เกินไป กรุณาลดขนาด');}
  return new Promise(resolve=>{
    const dialog=document.createElement('dialog');dialog.className='image-editor';
    dialog.innerHTML=`<h2>จัดภาพก่อนอ่าน</h2><p>หมุนให้ตัวหนังสือตั้งตรง แล้วลากกรอบให้ครอบใบเสร็จ 1 ใบ กดเพิ่มกรอบ ทำซ้ำจนครบทุกใบในภาพนี้</p><div class="actions"><button type="button" data-action="left" class="secondary">↶ หมุนซ้าย 90°</button><button type="button" data-action="right" class="secondary">↷ หมุนขวา 90°</button></div><canvas aria-label="ลากเลือกกรอบใบเสร็จ" tabindex="0"></canvas><div class="crop-fields"></div><p class="crop-status" role="status" aria-live="polite"></p><div class="actions"><button type="button" data-action="add">เพิ่มกรอบใบเสร็จนี้</button><button type="button" data-action="reset" class="secondary">เลือกเต็มภาพ</button><button type="button" data-action="done">อ่านกรอบที่เพิ่ม (0)</button><button type="button" data-action="skip" class="secondary">ข้ามภาพนี้</button></div><small>หากมีใบเดียว เลือกเต็มภาพ → เพิ่มกรอบ → อ่านกรอบที่เพิ่ม กรอบยังไม่แก้ความเอียงหรือมุม perspective ให้ตรวจยอดทุกครั้ง</small>`;
    const canvas=dialog.querySelector('canvas'),ctx=canvas.getContext('2d'),source=document.createElement('canvas'),src=source.getContext('2d');
    const status=dialog.querySelector('.crop-status'),done=dialog.querySelector('[data-action=done]');
    let turn=0,rect={x:0,y:0,w:100,h:100},start=null,crops=[],closed=false;
    const inputs={};
    for(const [key,label] of [['x','ซ้าย (%)'],['y','บน (%)'],['w','กว้าง (%)'],['h','สูง (%)']]){
      const l=document.createElement('label');l.textContent=label;const input=document.createElement('input');input.type='number';input.min='0';input.max='100';input.step='0.1';input.value=rect[key];input.oninput=()=>{rect[key]=Math.max(0,Math.min(100,Number(input.value)||0));draw();};l.append(input);dialog.querySelector('.crop-fields').append(l);inputs[key]=input;
    }
    function normalized(){return {x:rect.x,y:rect.y,w:Math.min(rect.w,100-rect.x),h:Math.min(rect.h,100-rect.y)};}
    function draw(){const r=normalized();ctx.clearRect(0,0,canvas.width,canvas.height);ctx.drawImage(source,0,0,canvas.width,canvas.height);ctx.fillStyle='#0007';ctx.fillRect(0,0,canvas.width,canvas.height);ctx.drawImage(source,r.x*source.width/100,r.y*source.height/100,r.w*source.width/100,r.h*source.height/100,r.x*canvas.width/100,r.y*canvas.height/100,r.w*canvas.width/100,r.h*canvas.height/100);ctx.strokeStyle='#16e9b0';ctx.lineWidth=3;ctx.strokeRect(r.x*canvas.width/100,r.y*canvas.height/100,r.w*canvas.width/100,r.h*canvas.height/100);}
    function sync(){for(const k in inputs)inputs[k].value=rect[k].toFixed(1);draw();}
    function rotate(delta){turn=(turn+delta+4)%4;const scale=Math.min(1,3000/Math.max(bitmap.width,bitmap.height));const w=Math.round(bitmap.width*scale),h=Math.round(bitmap.height*scale);source.width=turn%2?h:w;source.height=turn%2?w:h;src.save();src.translate(source.width/2,source.height/2);src.rotate(turn*Math.PI/2);src.drawImage(bitmap,-w/2,-h/2,w,h);src.restore();canvas.width=Math.min(1000,source.width);canvas.height=Math.round(source.height*canvas.width/source.width);rect={x:0,y:0,w:100,h:100};sync();}
    function point(e){const b=canvas.getBoundingClientRect();return {x:Math.max(0,Math.min(100,(e.clientX-b.left)/b.width*100)),y:Math.max(0,Math.min(100,(e.clientY-b.top)/b.height*100))};}
    canvas.onpointerdown=e=>{start=point(e);canvas.setPointerCapture(e.pointerId);};
    canvas.onpointermove=e=>{if(!start)return;const end=point(e);rect={x:Math.min(start.x,end.x),y:Math.min(start.y,end.y),w:Math.abs(end.x-start.x),h:Math.abs(end.y-start.y)};sync();};
    canvas.onpointerup=canvas.onpointercancel=()=>{start=null;};
    function finish(result){if(closed)return;closed=true;bitmap.close();source.width=source.height=canvas.width=canvas.height=0;crops=[];dialog.close();dialog.remove();resolve(result);}
    dialog.oncancel=e=>{e.preventDefault();finish([]);};
    dialog.querySelector('[data-action=left]').onclick=()=>rotate(-1);
    dialog.querySelector('[data-action=right]').onclick=()=>rotate(1);
    dialog.querySelector('[data-action=reset]').onclick=()=>{rect={x:0,y:0,w:100,h:100};sync();};
    dialog.querySelector('[data-action=skip]').onclick=()=>finish([]);
    dialog.querySelector('[data-action=add]').onclick=async()=>{
      const r=normalized();if(r.w<2||r.h<2){status.textContent='กรอบเล็กเกินไป กรุณาเลือกใหม่';return;}if(crops.length>=20){status.textContent='เพิ่มได้สูงสุด 20 กรอบต่อภาพ';return;}
      const c=document.createElement('canvas');c.width=Math.round(source.width*r.w/100);c.height=Math.round(source.height*r.h/100);c.getContext('2d').drawImage(source,source.width*r.x/100,source.height*r.y/100,source.width*r.w/100,source.height*r.h/100,0,0,c.width,c.height);
      const blob=await new Promise(res=>c.toBlob(res,'image/png'));c.width=c.height=0;if(closed||!blob)return;crops.push(blob);status.textContent=`เพิ่มแล้ว ${crops.length} กรอบ เลือกใบถัดไป หรือกดอ่านกรอบที่เพิ่ม`;done.textContent=`อ่านกรอบที่เพิ่ม (${crops.length})`;done.disabled=false;
    };
    done.disabled=true;done.onclick=()=>finish([...crops]);
    document.body.append(dialog);rotate(0);dialog.showModal();
  });
}
