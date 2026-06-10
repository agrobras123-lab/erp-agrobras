'use strict';
var CACHE = 'erp-agb-v5';
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
self.addEventListener('fetch', function(e) {
  if(e.request.url.includes('firestore.googleapis.com')){
    e.respondWith(fetch(e.request).catch(function(){return new Response('{}',{headers:{'Content-Type':'application/json'}})}));
    return;
  }
  e.respondWith(caches.match(e.request).then(function(cached){
    var net=fetch(e.request).then(function(r){
      if(r&&r.status===200&&e.request.method==='GET'){var cl=r.clone();caches.open(CACHE).then(function(c){c.put(e.request,cl)})}
      return r;
    }).catch(function(){return cached});
    return cached||net;
  }));
});
