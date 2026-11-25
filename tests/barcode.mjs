/* Штрихкоди EAN-13 ҳамчун «видеои камера» барои Chrome (--use-file-for-fake-video-capture).
   Формати Y4M (YUV 4:2:0): тасвири сафед бо штрихкоди сиёҳ дар мобайн. */
import fs from 'node:fs';

const L = ['0001101', '0011001', '0010011', '0111101', '0100011', '0110001', '0101111', '0111011', '0110111', '0001011'];
const G = ['0100111', '0110011', '0011011', '0100001', '0011101', '0111001', '0000101', '0010001', '0001001', '0010111'];
const R = ['1110010', '1100110', '1101100', '1000010', '1011100', '1001110', '1010000', '1000100', '1001000', '1110100'];
const PARITY = ['LLLLLL', 'LLGLGG', 'LLGGLG', 'LLGGGL', 'LGLLGG', 'LGGLLG', 'LGGGLL', 'LGLGLG', 'LGLGGL', 'LGGLGL'];

export function ean13(twelve) {
    const d = String(twelve).slice(0, 12).split('').map(Number);
    const sum = d.reduce((s, x, i) => s + x * (i % 2 ? 3 : 1), 0);
    return d.join('') + ((10 - sum % 10) % 10);
}
function bits(code) {
    const d = code.split('').map(Number), par = PARITY[d[0]];
    let s = '101';
    for (let i = 1; i <= 6; i++) s += (par[i - 1] === 'L' ? L : G)[d[i]];
    s += '01010';
    for (let i = 7; i <= 12; i++) s += R[d[i]];
    return s + '101';
}

export function writeY4M(file, code, { w = 640, h = 480, frames = 10 } = {}) {
    const b = bits(code), mod = 4, bw = b.length * mod, x0 = Math.round((w - bw) / 2), y0 = Math.round(h * 0.3), y1 = Math.round(h * 0.7);
    const Y = Buffer.alloc(w * h, 235);
    for (let y = y0; y < y1; y++) for (let i = 0; i < b.length; i++) if (b[i] === '1') Y.fill(16, y * w + x0 + i * mod, y * w + x0 + (i + 1) * mod);
    const UV = Buffer.alloc((w / 2) * (h / 2), 128);
    const head = Buffer.from(`YUV4MPEG2 W${w} H${h} F15:1 Ip A1:1 C420jpeg\n`);
    const parts = [head];
    for (let f = 0; f < frames; f++) parts.push(Buffer.from('FRAME\n'), Y, UV, UV);
    fs.writeFileSync(file, Buffer.concat(parts));
    return file;
}
