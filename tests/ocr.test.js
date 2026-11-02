import {test} from 'node:test';import assert from 'node:assert/strict';
import {amountEvidence,resolveEvidence,orientationScore} from '../ocr-core.js';
import {recalculate} from '../core.js';
const word=(text,x,y,w=40,h=20,confidence=95)=>({text,confidence,bbox:{x0:x,y0:y,x1:x+w,y1:y+h}});
const line=(...words)=>({text:words.map(w=>w.text).join(' '),words,confidence:95,bbox:{x0:Math.min(...words.map(w=>w.bbox.x0)),y0:Math.min(...words.map(w=>w.bbox.y0)),x1:Math.max(...words.map(w=>w.bbox.x1)),y1:Math.max(...words.map(w=>w.bbox.y1))}});
const coupon=(amount,y)=>[line(word('Price',10,y)),line(word(amount,100,y)),line(word('Baht',160,y)),line(word('4',100,y+90)),line(word('Wheels',160,y+90))];
test('spatial price lookup finds separate coupons and ignores vehicle wheels/telephone',()=>{const data={lines:[...coupon('45',20),...coupon('50',220),line(word('0994000165421',20,450,200))]};const evidence=amountEvidence(data,1000,0),out=resolveEvidence(evidence,1000,600);assert.deepEqual(out.map(x=>x.value),[4500,5000]);assert.ok(out.every(x=>x.trusted));});
test('equal coupon prices are separate receipts',()=>{const data={lines:[...coupon('20',20),...coupon('20',220)]};assert.equal(resolveEvidence(amountEvidence(data,1000),1000,600).length,2);});
test('repeated EXAT included and total are a single payment',()=>{const data={lines:[line(word('Baht(Vat',10,100,100),word('Included)',120,100,90),word('20.00',250,100,80)),line(word('Total',10,300),word('20.00',250,300,80))]};const evidence=[...amountEvidence(data,1000,0),...amountEvidence(data,1000,1)],out=resolveEvidence(evidence,1000,800);assert.equal(out.length,1);assert.equal(out[0].value,2000);assert.equal(out[0].trusted,true);});
test('disagreement at the same amount location never becomes an automatic total',()=>{const a={lines:[line(word('Total',10,100),word('20.00',250,100,80))]},b={lines:[line(word('Total',10,100),word('80.00',250,100,80))]};const out=resolveEvidence([...amountEvidence(a,1000,0),...amountEvidence(b,1000,1)],1000,800);assert.ok(out.every(x=>!x.trusted));assert.equal(recalculate(out.map(x=>({amount:(x.value/100).toFixed(2),needsReview:!x.trusted}))),0);});
test('low confidence and unlabeled numbers never become tolls',()=>{const data={lines:[line(word('Total',10,100),word('500.00',250,100,80,20,30)),line(word('1543',100,400))]};assert.deepEqual(resolveEvidence(amountEvidence(data,1000),1000,800),[]);assert.deepEqual(amountEvidence({lines:[]},1000),[]);});
test('upright semantic labels outrank random OCR',()=>{assert.ok(orientationScore({text:'Total Baht Included Receipt',confidence:60})>orientationScore({text:'5 3 8 ===',confidence:80}));});
test('three receipts survive disagreement between image scales, including equal prices',()=>{
 const make=(value,x,y,kind,pass)=>({value,bbox:{x0:x,y0:y,x1:x+90,y1:y+35},kind,pass,numberConfidence:96,labelConfidence:92,unit:false});
 const evidence=[make(2000,500,1200,'included','original-scale'),make(5500,1700,1300,'included','original-scale'),make(2000,2200,1250,'included','original-scale'),make(2000,2200,1600,'total','original-scale'),make(5500,1700,1300,'included','11'),make(2000,2200,1250,'included','11'),make(2000,2200,1600,'total','11'),make(2000,500,1200,'included','6')];
 const out=resolveEvidence(evidence,2800,2100);assert.equal(out.length,3);assert.ok(out.every(x=>x.trusted));assert.equal(out.reduce((n,x)=>n+x.value,0),9500);
});
test('VAT-included label never borrows class or lane integer from nearby lines',()=>{
 const data={lines:[line(word('Baht(Vat',10,100,100),word('Included)',120,100,90)),line(word('3',250,95,20,20,95))]};
 assert.deepEqual(amountEvidence(data,1000),[]);
});
