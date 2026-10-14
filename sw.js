const V='sion-v3',F=['./','index.html','manifest.webmanifest','icon.svg','logo-512.png','fb.js'];
self.addEventListener('install',e=>e.waitUntil(caches.open(V).then(c=>c.addAll(F))));
self.addEventListener('activate',e=>e.waitUntil(caches.keys().then(k=>Promise.all(k.filter(x=>x!==V).map(x=>caches.delete(x))))));
// Nettverk først, så hurtigbuffer: nytt program vises med en gang, og det virker uten nett.
self.addEventListener('fetch',e=>{if(e.request.method!=='GET')return;
  e.respondWith(fetch(e.request).then(r=>{const c=r.clone();caches.open(V).then(x=>x.put(e.request,c));return r}).catch(()=>caches.match(e.request)))});