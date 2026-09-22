const CACHE='threewords-v1';
const ASSETS=['./','./index.html','./styles.css','./app.js','./config.js','./manifest.webmanifest'];
self.addEventListener('install',e=>e.waitUntil(caches.open(CACHE).then(c=>c.addAll(ASSETS))));
self.addEventListener('fetch',e=>{
  if(e.request.url.includes('cdn.jsdelivr.net')) return;
  e.respondWith(caches.match(e.request).then(r=>r||fetch(e.request)));
});
