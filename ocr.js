import {orientationScore,amountEvidence,resolveEvidence} from './ocr-core.js?v=4.1';
const defaultCanvas=()=>document.createElement('canvas');
function picture(source,turn,maxSide,makeCanvas){const c=makeCanvas(),w=source.width,h=source.height,s=maxSide/Math.max(w,h);c.width=Math.round((turn%2?h:w)*s);c.height=Math.round((turn%2?w:h)*s);const ctx=c.getContext('2d');ctx.fillStyle='white';ctx.fillRect(0,0,c.width,c.height);ctx.translate(c.width/2,c.height/2);ctx.rotate(turn*Math.PI/2);ctx.imageSmoothingEnabled=true;ctx.imageSmoothingQuality='high';ctx.drawImage(source,-w*s/2,-h*s/2,w*s,h*s);ctx.setTransform(1,0,0,1,0,0);return c;}
function improve(canvas){const ctx=canvas.getContext('2d',{willReadFrequently:true}),im=ctx.getImageData(0,0,canvas.width,canvas.height),data=im.data,hist=new Uint32Array(256);for(let i=0;i<data.length;i+=4){const g=Math.round(data[i]*.299+data[i+1]*.587+data[i+2]*.114);data[i]=data[i+1]=data[i+2]=g;hist[g]++;}let low=0,high=255,n=0;const cut=canvas.width*canvas.height*.02;while(n<cut&&low<254)n+=hist[low++];n=0;while(n<cut&&high>low+1)n+=hist[high--];for(let i=0;i<data.length;i+=4){const g=Math.max(0,Math.min(255,Math.round((data[i]-low)*255/Math.max(40,high-low))));data[i]=data[i+1]=data[i+2]=g;}ctx.putImageData(im,0,0);}
// Canvas factory + recognize adapter let the exact browser pipeline run on local fixtures too.
export async function readReceiptImage(source,recognize,{makeCanvas=defaultCanvas,progress=()=>{}}={}){
  let best={score:-Infinity,turn:0},canvas;
  try{
    for(const turn of [0,3,1,2]){progress(`กำลังหาทิศทางตัวหนังสือ ${[0,3,1,2].indexOf(turn)+1}/4`);canvas=picture(source,turn,1400,makeCanvas);const data=await recognize(canvas,'11');const score=orientationScore(data);if(score>best.score)best={score,turn,data,width:canvas.width,height:canvas.height};canvas.width=canvas.height=0;canvas=null;if(score>=130&&(data.confidence||0)>=55)break;}
    canvas=picture(source,best.turn,2800,makeCanvas);improve(canvas);
    // Upscaling can damage a digit that was clear in the original-size pass.
    // Keep both scales, with boxes mapped to the same coordinate system.
    const sx=canvas.width/best.width,sy=canvas.height/best.height;
    const evidence=amountEvidence(best.data,best.width,'original-scale').map(e=>({...e,bbox:{x0:e.bbox.x0*sx,x1:e.bbox.x1*sx,y0:e.bbox.y0*sy,y1:e.bbox.y1*sy}})),texts=[];let result=[];
    for(const mode of ['11','3','6']){progress(`กำลังตรวจยอด${mode==='11'?'': 'ซ้ำอีกครั้ง'}…`);const data=await recognize(canvas,mode);texts.push(data.text||'');evidence.push(...amountEvidence(data,canvas.width,evidence.length?mode:0));result=resolveEvidence(evidence,canvas.width,canvas.height);if(mode==='3'&&result.length&&result.every(x=>x.trusted))break;}
    return {turn:best.turn,amounts:result.map(x=>({amount:x.trusted?(x.value/100).toFixed(2):'',suggestedAmount:(x.value/100).toFixed(2),trusted:x.trusted,confidence:Math.round(x.confidence),conflict:x.conflict})),raw:texts[0]||'',width:canvas.width,height:canvas.height};
  }finally{if(canvas)canvas.width=canvas.height=0;}
}
