const CACHE='toll-shell-v4-1';
const SHELL=['./','./index.html','./style.css?v=4.1','./app.js?v=4.1','./core.js?v=4.1','./ocr.js?v=4.1','./ocr-core.js?v=4.1','./prepare.js','./icon.svg','./manifest.webmanifest'];
self.addEventListener('install',e=>{e.waitUntil(caches.open(CACHE).then(c=>c.addAll(SHELL)));});
self.addEventListener('activate',e=>{e.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k.startsWith('toll-shell-')&&k!==CACHE).map(k=>caches.delete(k)))));});
self.addEventListener('fetch',e=>{const url=new URL(e.request.url);if(e.request.method!=='GET'||url.origin!==self.location.origin)return;if(!SHELL.some(p=>new URL(p,self.registration.scope).href===url.href))return;e.respondWith(fetch(e.request,{cache:'no-cache'}).then(r=>{if(r.ok){const copy=r.clone();e.waitUntil(caches.open(CACHE).then(c=>c.put(e.request,copy)));}return r;}).catch(()=>caches.match(e.request)));});
