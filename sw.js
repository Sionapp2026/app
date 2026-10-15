const V='sion-v5',F=['./','index.html','manifest.webmanifest','icon.svg','logo-512.png','fb.js'];
self.addEventListener('install',e=>e.waitUntil(caches.open(V).then(c=>c.addAll(F))));
self.addEventListener('activate',e=>e.waitUntil(caches.keys().then(k=>Promise.all(k.filter(x=>x!==V).map(x=>caches.delete(x))))));
// Nettverk først, så hurtigbuffer: nytt program vises med en gang, og det virker uten nett.
self.addEventListener('fetch',e=>{if(e.request.method!=='GET')return;
  e.respondWith(fetch(e.request,{cache:"no-cache"}).then(r=>{const c=r.clone();caches.open(V).then(x=>x.put(e.request,c));return r}).catch(()=>caches.match(e.request)))});
// Push-varsler fra Firebase Cloud Messaging: vis varselet, og åpne appen når det trykkes på.
self.addEventListener('push',e=>{
  let d={};try{d=e.data.json()}catch(x){}
  const n=d.notification||d.data||{};
  e.waitUntil(self.registration.showNotification(n.title||'Sion Molde',{body:n.body||'',icon:'icon-192.png',badge:'icon-192.png',data:{url:(d.fcmOptions&&d.fcmOptions.link)||(d.data&&d.data.url)||'./'}}))});
self.addEventListener('notificationclick',e=>{
  e.notification.close();
  e.waitUntil(clients.matchAll({type:'window',includeUncontrolled:true}).then(l=>{
    for(const c of l)if('focus' in c)return c.focus();
    return clients.openWindow((e.notification.data&&e.notification.data.url)||'./')}))});
