'use strict';
var CACHE = 'erp-agb-v9';
var ASSETS = [
  '/erp-agrobras/',
  '/erp-agrobras/index.html',
  '/erp-agrobras/manifest.json',
  'https://unpkg.com/react@18/umd/react.production.min.js',
  'https://unpkg.com/react-dom@18/umd/react-dom.production.min.js'
];
self.addEventListener('install', function(e) {
  e.waitUntil(caches.open(CACHE).then(function(c) {
    return Promise.all(ASSETS.map(function(u) { return c.add(u).catch(function(){}); }));
  }));
  self.skipWaiting();
});
self.addEventListener('activate', function(e) {
  e.waitUntil(caches.keys().then(function(keys) {
    return Promise.all(keys.filter(function(k){return k!==CACHE}).map(function(k){return caches.delete(k)}));
  }));
  self.clients.claim();
});
function cachePut(req, r) {
  if (r && r.status === 200 && req.method === 'GET') {
    var cl = r.clone();
    caches.open(CACHE).then(function(c){ c.put(req, cl); });
  }
  return r;
}
self.addEventListener('fetch', function(e) {
  var req = e.request;
  if(req.url.includes('firestore.googleapis.com')){
    e.respondWith(fetch(req).catch(function(){return new Response('{}',{headers:{'Content-Type':'application/json'}})}));
    return;
  }
  // HTML/navegação: rede primeiro, para que atualizações apareçam na hora.
  // Cai no cache (index.html) apenas quando estiver offline.
  if(req.mode === 'navigate'){
    e.respondWith(
      fetch(req).then(function(r){ return cachePut(req, r); }).catch(function(){
        return caches.match(req).then(function(cached){
          return cached || caches.match('/erp-agrobras/index.html');
        });
      })
    );
    return;
  }
  // Demais assets: cache primeiro (rápido), atualizando em segundo plano.
  e.respondWith(caches.match(req).then(function(cached){
    var net=fetch(req).then(function(r){ return cachePut(req, r); }).catch(function(){return cached});
    return cached||net;
  }));
});
