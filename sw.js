/* DELUS — файлҳои барнома дар хотираи телефон, то бе интернет ҳам кушода шавад.
   - саҳифа: аввал аз сервер (то версияи нав фавран ояд); бе интернет ё агар сервер 3 сония ҷавоб надиҳад, аз хотира;
   - файлҳои версиядор (?v=…), аксҳо ва ҳарфҳо: аз хотира, чунки иваз намешаванд;
   - /api ҳеҷ гоҳ нигоҳ дошта намешавад: маълумот ҳамеша аз ҷадвал меояд (нусхаи охирин дар IndexedDB-и худи барнома аст). */
'use strict';

const CACHE = 'delus-v2';
const PAGE = './index.html';
const REF = /(assets\/[\w./-]+\?v=[\w.]+)/g;
const STATIC = ['./manifest.webmanifest', './assets/img/icon.svg', './assets/img/icon-180.png'];

/* Файлҳое, ки саҳифа истифода мебарад, ҳамроҳи худи саҳифа гирифта мешаванд */
async function keepPage(res) {
    const c = await caches.open(CACHE);
    const html = await res.clone().text();
    await c.put(PAGE, res.clone());
    const refs = [...new Set(html.match(REF) || [])].map(r => new URL(r, self.registration.scope).href);
    await Promise.all(refs.map(async u => { if (!await c.match(u)) { try { const r = await fetch(u); if (r.ok) await c.put(u, r); } catch (e) { } } }));
    /* версияҳои кӯҳнаи файлҳо пок мешаванд */
    for (const k of await c.keys()) {
        const u = new URL(k.url);
        if (u.searchParams.has('v') && !refs.includes(u.href) && !u.pathname.includes('/vendor/')) await c.delete(k);
    }
}

self.addEventListener('install', e => {
    e.waitUntil((async () => {
        const c = await caches.open(CACHE);
        await Promise.all(STATIC.map(u => c.add(u).catch(() => { })));
        try { const r = await fetch(PAGE, { cache: 'no-cache' }); if (r.ok) await keepPage(r); } catch (e) { }
        await self.skipWaiting();
    })());
});

self.addEventListener('activate', e => {
    e.waitUntil((async () => {
        for (const k of await caches.keys()) if (k !== CACHE) await caches.delete(k);
        await self.clients.claim();
    })());
});

function timeout(ms) { return new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), ms)); }

self.addEventListener('fetch', e => {
    const req = e.request;
    if (req.method !== 'GET') return;
    const url = new URL(req.url);
    if (url.origin !== self.location.origin || url.pathname.startsWith('/api/') || url.pathname.endsWith('/sw.js')) return;

    if (req.mode === 'navigate') {
        e.respondWith((async () => {
            const net = fetch(req).then(async r => { if (r.ok) await keepPage(r.clone()).catch(() => { }); return r; });
            try { return await Promise.race([net, timeout(3000)]); }
            catch (err) {
                const hit = await caches.match(PAGE);
                if (hit) { net.catch(() => { }); return hit; }
                return net;
            }
        })());
        return;
    }

    const fixed = url.searchParams.has('v') || url.pathname.includes('/assets/img/') || url.pathname.includes('/assets/fonts/');
    e.respondWith((async () => {
        const hit = await caches.match(req);
        if (hit && fixed) return hit;
        const net = fetch(req).then(async r => {
            if (r.ok && r.type === 'basic') { const c = await caches.open(CACHE); await c.put(req, r.clone()); }
            return r;
        });
        if (hit) { net.catch(() => { }); return hit; }
        return net;
    })());
});
