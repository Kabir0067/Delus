/* DELUS — сканери штрихкод бо камераи телефон
   Дар Android (Chrome) сканери худи браузер кор мекунад (BarcodeDetector).
   Дар iPhone ва дигар браузерҳо китобхонаи ZXing (WebAssembly, assets/vendor) кор мекунад,
   ки танҳо бори аввали кушодани сканер бор мешавад ва баъд дар хотираи телефон мемонад. */
'use strict';

const ZX_VER = '3.1.6';
const ZX_FORMATS = ['EAN13', 'EAN8', 'UPCA', 'UPCE', 'Code128', 'Code39', 'ITF', 'QRCode', 'DataMatrix'];
const BD_FORMATS = ['ean_13', 'ean_8', 'upc_a', 'upc_e', 'code_128', 'code_39', 'itf', 'qr_code', 'data_matrix'];
let zxLoad = null;

function loadZxing() {
    if (zxLoad) return zxLoad;
    zxLoad = new Promise((res, rej) => {
        const s = document.createElement('script');
        s.src = `assets/vendor/zxing-reader.js?v=${ZX_VER}`;
        s.onload = () => {
            try {
                ZXingWASM.prepareZXingModule({
                    overrides: { locateFile: (p, prefix) => p.endsWith('.wasm') ? `assets/vendor/${p}?v=${ZX_VER}` : prefix + p },
                    fireImmediately: true
                }).then(res, rej);
            } catch (e) { rej(e); }
        };
        s.onerror = () => rej(new Error('zxing'));
        document.head.append(s);
    }).catch(e => { zxLoad = null; console.error(e); throw known('Сканер бор нашуд. Интернетро санҷед ва боз кӯшиш кунед.'); });
    return zxLoad;
}

/* Хонанда: аз кадр (canvas) рӯйхати рамзҳоро медиҳад */
async function barcodeReader() {
    if ('BarcodeDetector' in window) {
        try {
            const have = await BarcodeDetector.getSupportedFormats();
            const formats = BD_FORMATS.filter(f => have.includes(f));
            if (formats.includes('ean_13')) {
                const d = new BarcodeDetector({ formats });
                return async c => (await d.detect(c)).map(x => x.rawValue).filter(Boolean);
            }
        } catch (e) { }
    }
    await loadZxing();
    return async c => {
        const img = c.getContext('2d', { willReadFrequently: true }).getImageData(0, 0, c.width, c.height);
        const r = await ZXingWASM.readBarcodes(img, { formats: ZX_FORMATS, tryHarder: true, maxNumberOfSymbols: 1 });
        return r.filter(x => x.isValid && x.text).map(x => x.text);
    };
}

let beepCtx = null;
function beep() {
    try {
        beepCtx = beepCtx || new (window.AudioContext || window.webkitAudioContext)();
        const o = beepCtx.createOscillator(), g = beepCtx.createGain();
        o.frequency.value = 1760;
        g.gain.setValueAtTime(0.12, beepCtx.currentTime);
        g.gain.exponentialRampToValueAtTime(0.001, beepCtx.currentTime + 0.12);
        o.connect(g).connect(beepCtx.destination);
        o.start();
        o.stop(beepCtx.currentTime + 0.13);
    } catch (e) { }
    if (navigator.vibrate) try { navigator.vibrate(60); } catch (e) { }
}

const camError = e => {
    const n = e && e.name;
    if (!window.isSecureContext) return 'Камера танҳо дар сайти https кор мекунад.';
    if (n === 'NotAllowedError' || n === 'SecurityError') return 'Ба камера иҷозат дода нашуд. Дар танзимоти браузер камераро барои ин сайт иҷозат диҳед ё рақамро дастӣ нависед.';
    if (n === 'NotFoundError' || n === 'OverconstrainedError') return 'Дар ин дастгоҳ камера ёфт нашуд. Рақами штрихкодро дастӣ нависед.';
    if (n === 'NotReadableError') return 'Камераро барномаи дигар банд кардааст. Онро пӯшед ва боз кӯшиш кунед.';
    return e && e.known ? e.message : 'Камера кушода нашуд. Рақамро дастӣ нависед.';
};

/* Сканер.
   multi: false — аввалин рамз бармегардад (ё null).
   multi: true — ҳар рамз ба onCode(code) меравад; onCode паёми кӯтоҳ ё { msg, stop } бармегардонад. Сканер то «Тайёр» кушода мемонад. */
function scanCode({ title = 'Скани штрихкод', multi = false, onCode } = {}) {
    return new Promise(resolve => {
        let stream = null, track = null, alive = true, found = null, last = '', lastAt = 0, torch = false;
        const m = Modal.open({
            title, size: 'scan',
            body: `<div class="scan">
                <video playsinline muted autoplay></video>
                <div class="scan-frame"><i></i></div>
                <p class="scan-msg" data-msg>Камера кушода мешавад…</p>
                <p class="scan-last" data-last hidden></p>
            </div>`,
            foot: `<button type="button" class="btn lg" data-torch hidden>${ic('bulb', 17)}Чароғ</button>
                <button type="button" class="btn lg" data-type>${ic('calc', 17)}Рақамро нависед</button>
                ${multi ? `<button type="button" class="btn sale-solid lg" data-done>${ic('check', 17)}Тайёр</button>` : ''}`,
            onClose: () => { stop(); resolve(found); }
        });
        const video = $('video', m.el), msg = $('[data-msg]', m.el), lastEl = $('[data-last]', m.el), frame = $('.scan-frame', m.el);
        const canvas = document.createElement('canvas');
        function stop() {
            alive = false;
            if (stream) stream.getTracks().forEach(t => t.stop());
            stream = null;
        }
        const say = (t, kind = '') => { msg.textContent = t; msg.className = 'scan-msg ' + kind; };

        async function got(code) {
            code = String(code).trim();
            const now = Date.now();
            if (!code || (code === last && now - lastAt < 2500)) return;
            last = code; lastAt = now;
            beep();
            frame.classList.remove('hit'); void frame.offsetWidth; frame.classList.add('hit');
            setTimeout(() => frame.classList.remove('hit'), 700);
            if (!multi) { found = code; m.close(); return; }
            const r = onCode ? await onCode(code) : '';
            const text = typeof r === 'string' ? r : r && r.msg;
            if (text) { lastEl.hidden = false; lastEl.textContent = text; }
            if (r && r.stop) m.close();
        }

        async function loop(read) {
            let busy = false;
            const tick = async () => {
                if (!alive) return;
                if (!busy && video.readyState >= 2 && video.videoWidth) {
                    busy = true;
                    try {
                        /* танҳо миёнаи кадр (чорчӯба): тезтар ва камтар хато */
                        const vw = video.videoWidth, vh = video.videoHeight;
                        const cw = Math.round(vw * 0.86), ch = Math.round(Math.min(vh * 0.5, cw * 0.62));
                        const k = Math.min(1, 960 / cw);
                        canvas.width = Math.round(cw * k); canvas.height = Math.round(ch * k);
                        canvas.getContext('2d', { willReadFrequently: true }).drawImage(video, (vw - cw) / 2, (vh - ch) / 2, cw, ch, 0, 0, canvas.width, canvas.height);
                        const codes = await read(canvas);
                        if (codes.length && alive) await got(codes[0]);
                    } catch (e) { console.error(e); }
                    busy = false;
                }
                if (alive) setTimeout(tick, 120);
            };
            tick();
        }

        (async () => {
            try {
                if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) throw Object.assign(new Error(), { name: window.isSecureContext ? 'NotFoundError' : 'SecurityError' });
                const [read, st] = await Promise.all([
                    barcodeReader(),
                    navigator.mediaDevices.getUserMedia({ audio: false, video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 720 } } })
                ]);
                if (!alive) { st.getTracks().forEach(t => t.stop()); return; }
                stream = st;
                track = st.getVideoTracks()[0];
                video.srcObject = st;
                await video.play().catch(() => { });
                say('Штрихкоди қуттиро ба чорчӯба нишон диҳед');
                try {
                    const caps = track.getCapabilities ? track.getCapabilities() : {};
                    if (caps.torch) $('[data-torch]', m.el).hidden = false;
                    if (caps.focusMode && caps.focusMode.includes('continuous')) track.applyConstraints({ advanced: [{ focusMode: 'continuous' }] }).catch(() => { });
                } catch (e) { }
                loop(read);
            } catch (e) {
                console.warn('camera', e && (e.name || e.message));
                say(camError(e), 'bad');
            }
        })();

        $('[data-torch]', m.el).onclick = () => {
            torch = !torch;
            if (track) track.applyConstraints({ advanced: [{ torch }] }).catch(() => { });
        };
        $('[data-type]', m.el).onclick = () => {
            const inp = document.createElement('input');
            inp.value = '';
            openNumpad(inp, { label: 'Рақами штрихкод', hint: 'Рақамҳои зери штрихкодро нависед', raw: true, onDone: v => { if (v) got(v); } });
        };
        const done = $('[data-done]', m.el);
        if (done) done.onclick = () => m.close();
    });
}

/* ---------- мол аз рӯи штрихкод ---------- */
const codesOf = p => String(p.barcode ?? '').split(/[\s,;]+/).map(x => x.trim()).filter(Boolean);
function findByCode(code) {
    const c = String(code || '').trim();
    if (!c) return null;
    const pool = [...activeProds(), ...S.products.filter(p => !isActive(p))];
    return pool.find(p => codesOf(p).includes(c)) || pool.find(p => String(p.product_code || '').trim().toLowerCase() === c.toLowerCase()) || null;
}

/* Штрихкоди нав: ба моли мавҷуда пайваст кардан ё моли нав сохтан. then(p) — моли интихобшуда. */
async function unknownCode(code, then, { newOk = true, buy = false } = {}) {
    const pick = await choose({
        title: 'Ин штрихкод дар рӯйхат нест',
        text: `Рақам: ${code}. Ин қуттӣ ба кадом мол тааллуқ дорад?`,
        options: [['link', 'Ба моли ҳозира пайваст кардан', 'primary'], ...(newOk ? [['new', 'Моли нав сохтан', '']] : [])]
    });
    if (pick === 'new') return productForm(null, { barcode: code, noOpening: buy, onSaved: then });
    if (pick !== 'link') return;
    const p = await pickProduct('Ба кадом мол пайваст кунем?');
    if (!p) return;
    try {
        await linkCode(p, code);
        toast(`Штрихкод ба «${p.name}» пайваст шуд`);
        if (then) then(prodBy(p.id) || p);
    } catch (e) { showErr(e); }
}
async function linkCode(p, code) {
    const other = findByCode(code);
    if (other && String(other.id) !== String(p.id)) throw known(`Ин штрихкод аллакай ба «${other.name}» пайваст аст.`);
    await ensureBarcodeCol();
    if (!S.heads.Products.includes('barcode')) throw known('Сутуни штрихкод дар ҷадвал сохта нашуд. Интернетро санҷед.');
    await updateProduct(p, { barcode: [...new Set([...codesOf(p), code])].join(' ') });
}

/* Интихоби як мол аз каталог */
function pickProduct(title) {
    return new Promise(res => {
        let done = false;
        const m = Modal.open({ title, size: 'lg', body: '<div data-pick></div>', onClose: () => { if (!done) res(null); } });
        mountPicker($('[data-pick]', m.el), { onPick: p => { done = true; m.close(); res(p); } });
    });
}
