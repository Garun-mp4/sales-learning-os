/** Service worker behavior using Node VM with simulated fetch/CacheStorage.
 * No real-browser offline assertion is implied by these tests.
 */
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import path from 'node:path';

const manifest = JSON.parse(readFileSync('dist/assets/offline-files.json', 'utf8'));
assert.ok(manifest.urls.length >= 475, 'The offline manifest should list every course page');
assert.equal(new Set(manifest.urls).size, manifest.urls.length, 'The manifest must not contain duplicates');
for (const url of manifest.urls) {
  assert.ok(!url.startsWith('/'), `Expected relative canonical URL: ${url}`);
  assert.ok(!url.endsWith('index.html'), `Non-canonical URL: ${url}`);
  const file = url.endsWith('/') || url === '' ? path.join('dist', url, 'index.html') : path.join('dist', url);
  assert.ok(existsSync(file), `Offline resource missing: ${url}`);
}
console.log(`PASS: manifest has ${manifest.urls.length} unique canonical URLs, all exist`);

const registrations = {};
const version = manifest.version;
const storage = new Map([
  ['sales-os-offline-previous', new Map([['http://test.local/lesson/01-001/', {status: 200, body: 'stored old'}]])],
  [`sales-os-offline-${version}`, new Map([['http://test.local/lesson/01-001/', {status: 200, body: 'stored new'}]])],
]);
let online = true;
let networkResponse = {status: 200, body: 'fresh network'};
let errorSent = false;
const ctx = {
  self: {
    location: {origin:'http://test.local'},
    clients:{claim: async()=>{}},
    skipWaiting:()=>{},
    addEventListener(type,handler){registrations[type]=handler;},
  },
  location: {origin:'http://test.local'},
  caches:{
    keys: async()=> [...storage.keys()],
    open: async name=>({match: async req=>storage.get(name)?.get(req.url) || null}),
  },
  fetch:async()=> {if(!online)throw Error('offline');return networkResponse;},
  Response:{error:()=>{errorSent = true;return {status:0,body:'network error'};}},
  URL,
};
runInNewContext(readFileSync('dist/sw.js','utf8'),ctx);
assert.equal(typeof registrations.fetch,'function');
function respond(url,method='GET'){
  let response;
  registrations.fetch({request:{url,method},respondWith(p){response=p;}});
  return response;
}
assert.equal(respond('http://elsewhere.invalid/test'), undefined,'Cross-origin requests must be untouched');
assert.equal(respond('http://test.local/api','POST'), undefined,'Non-GET requests must be untouched');
const onlineResp = await respond('http://test.local/lesson/01-001/');
assert.equal(onlineResp.body,'fresh network');
online=false;
const offlineResp = await respond('http://test.local/lesson/01-001/');
assert.equal(offlineResp.body,'stored new');
storage.get(`sales-os-offline-${version}`).clear();
const oldResp = await respond('http://test.local/lesson/01-001/');
assert.equal(oldResp.body,'stored old','Worker must find older cache after an app update');
const missingResp = await respond('http://test.local/lesson/02-001/');
assert.equal(missingResp.status,0);
assert.equal(errorSent,true);
console.log('PASS: worker same-origin GET, network-first, cached fallback, old cache fallback, missing resource');
