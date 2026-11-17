// PENITENTES — Platanus Hack 26: Santiago
// Duelo uno contra uno sobre una meseta de nieve que flota sobre un mar de nubes, en la alta cordillera.
// Motor propio: 3D por software en un lienzo de 400x300, nieve procedural de un millón de texeles,
// sombras proyectadas, luces dinámicas sobre la nieve, dos capas de nubes con paralaje,
// niebla y tramado ordenado a una paleta fija.
// Stick: moverse · 1 atacar · 2 defender · 3 escudazo / desvío · 4 hechizo · 5 saltar · 6 usar objeto

(() => {
const W = 800;
const H = 600;
const FW = 400;
const FH = 300;
const NP = FW * FH;
const { sin, cos, sqrt, atan2, abs, min, max, floor, ceil, hypot, exp, PI, random: rnd } = Math;
const TAU = PI * 2;
const cl = (v, a, b) => (v < a ? a : v > b ? b : v);
const mix = (a, b, t) => a + (b - a) * t;
const rr = (a, b) => a + rnd() * (b - a);
const angD = (a, b) => {
  let d = (b - a) % TAU;
  if (d > PI) d -= TAU;
  else if (d < -PI) d += TAU;
  return d;
};
const pk = (r, g, b) => (cl(r | 0, 0, 255) << 16) | (cl(g | 0, 0, 255) << 8) | cl(b | 0, 0, 255);
const sc3 = (c, k) => pk((c >> 16) * k, ((c >> 8) & 255) * k, (c & 255) * k);

// DO NOT replace existing keys — they match the physical arcade cabinet wiring.
// To add local testing shortcuts, append extra keys to any array.
const CABINET_KEYS = {
  P1_U: ['w'],
  P1_D: ['s'],
  P1_L: ['a'],
  P1_R: ['d'],
  P1_1: ['u'],
  P1_2: ['i'],
  P1_3: ['o'],
  P1_4: ['j'],
  P1_5: ['k'],
  P1_6: ['l'],
  P2_U: ['ArrowUp'],
  P2_D: ['ArrowDown'],
  P2_L: ['ArrowLeft'],
  P2_R: ['ArrowRight'],
  P2_1: ['r'],
  P2_2: ['t'],
  P2_3: ['y'],
  P2_4: ['f'],
  P2_5: ['g'],
  P2_6: ['h'],
  START1: ['Enter'],
  START2: ['2'],
};

const K2A = {};
for (const [c, ks] of Object.entries(CABINET_KEYS)) for (const k of ks) K2A[k.length === 1 ? k.toLowerCase() : k] = c;
const held = {};
let hit = {};
function onKey(e, dn) {
  const c = K2A[e.key.length === 1 ? e.key.toLowerCase() : e.key];
  if (!c) return;
  e.preventDefault();
  if (dn && !held[c]) hit[c] = 1;
  held[c] = dn;
  if (AC && AC.state === 'suspended') AC.resume();
}
window.addEventListener('keydown', (e) => onKey(e, 1));
window.addEventListener('keyup', (e) => onKey(e, 0));

// --- Racha contra la máquina (puente del arcade o localStorage) ---

const REC = 'penitentes-racha-v1';
let best = 0;
function store() {
  if (window.platanusArcadeStorage) return window.platanusArcadeStorage;
  return {
    async get(k) {
      try {
        const r = localStorage.getItem(k);
        return r === null ? { found: false } : { found: true, value: JSON.parse(r) };
      } catch (e) {
        return { found: false };
      }
    },
    async set(k, v) {
      try {
        localStorage.setItem(k, JSON.stringify(v));
      } catch (e) {
        // sin almacenamiento
      }
    },
  };
}
try {
  Promise.resolve(store().get(REC))
    .then((r) => {
      if (r && r.found && r.value && Number.isFinite(r.value.n)) best = cl(r.value.n | 0, 0, 999);
    })
    .catch(() => {});
} catch (e) {
  // sin almacenamiento
}
function saveBest() {
  try {
    Promise.resolve(store().set(REC, { n: best })).catch(() => {});
  } catch (e) {
    // sin almacenamiento
  }
}

// --- Paleta y tramado ---

const PAL = [
  0x0b0e1a, 0x1b2133, 0x2b3349, 0x3f4663, 0x585e80, 0x737ba0, 0x8f99c4, 0xa8b2dc, 0xc4cbe8, 0xe6e9f5,
  0x4e4656, 0x6c6274, 0xc27f72, 0xe8a587, 0xf6d1b4, 0xe8613f, 0xffb347, 0xfff0b0, 0x3fc4b4, 0x8ff0ff,
  0x7a5ad8, 0xb9a2ff, 0x2f8a7e, 0x9a3a32, 0x8a7f8e,
];
const PC = PAL.map((c) => 0xff000000 | ((c & 255) << 16) | (c & 0xff00) | (c >> 16));
const LUT = new Uint32Array(32768);
const Q = new Uint8Array(512);
for (let i = 0; i < 512; i++) Q[i] = cl(i - 96, 0, 255) >> 3;
const BAY = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
const DO = BAY.map((b) => ((b - 7.5) * 3.3) | 0);
const VG = new Uint8Array(NP);

function buildLut() {
  const P = PAL.map((c) => [c >> 16, (c >> 8) & 255, c & 255]);
  for (let i = 0; i < 32768; i++) {
    const r = ((i >> 10) << 3) + 4;
    const g = (((i >> 5) & 31) << 3) + 4;
    const b = ((i & 31) << 3) + 4;
    let bd = 1e9;
    let bc = P[0];
    for (const p of P) {
      const dr = r - p[0];
      const dg = g - p[1];
      const db = b - p[2];
      const d = 2 * dr * dr + 4 * dg * dg + 3 * db * db;
      if (d < bd) {
        bd = d;
        bc = p;
      }
    }
    LUT[i] = 0xff000000 | (bc[2] << 16) | (bc[1] << 8) | bc[0];
  }
  for (let y = 0; y < FH; y++)
    for (let x = 0; x < FW; x++) {
      const dx = (x - FW / 2) / (FW / 2);
      const dy = (y - FH / 2) / (FH / 2);
      VG[y * FW + x] = cl((dx * dx * 0.6 + dy * dy * 0.8 - 0.35) * 46, 0, 36);
    }
}

// --- Lienzo: color, profundidad (1/z) y máscara de sombras ---

const CR = new Uint8ClampedArray(NP);
const CG = new Uint8ClampedArray(NP);
const CB = new Uint8ClampedArray(NP);
const ZB = new Float32Array(NP);
const SM = new Uint8Array(NP);
let O32 = null;
let SDA = 8;

// Triángulo con color por vértice y z-buffer. md: 0 opaco, 1 aditivo, 2 luz sobre el suelo, 3 trama (vidrio)
function tri(ax, ay, az, bx, by, bz, cx, cy, cz, ca, cb, cc, md) {
  let ar = (bx - ax) * (cy - ay) - (cx - ax) * (by - ay);
  if (ar < 0) {
    let t = bx;
    bx = cx;
    cx = t;
    t = by;
    by = cy;
    cy = t;
    t = bz;
    bz = cz;
    cz = t;
    t = cb;
    cb = cc;
    cc = t;
    ar = -ar;
  }
  if (ar < 0.05) return;
  const x0 = max(0, floor(min(ax, bx, cx)));
  const x1 = min(FW - 1, ceil(max(ax, bx, cx)));
  const y0 = max(0, floor(min(ay, by, cy)));
  const y1 = min(FH - 1, ceil(max(ay, by, cy)));
  if (x0 > x1 || y0 > y1) return;
  const d0x = ay - by;
  const d0y = bx - ax;
  const d1x = by - cy;
  const d1y = cx - bx;
  const d2x = cy - ay;
  const d2y = ax - cx;
  const px = x0 + 0.5;
  const py = y0 + 0.5;
  let r0 = (bx - ax) * (py - ay) - (by - ay) * (px - ax);
  let r1 = (cx - bx) * (py - by) - (cy - by) * (px - bx);
  let r2 = (ax - cx) * (py - cy) - (ay - cy) * (px - cx);
  const ia = 1 / ar;
  const Ar = ca >> 16;
  const Ag = (ca >> 8) & 255;
  const Ab = ca & 255;
  const Br_ = cb >> 16;
  const Bg = (cb >> 8) & 255;
  const Bb = cb & 255;
  const Cr = cc >> 16;
  const Cg = (cc >> 8) & 255;
  const Cb = cc & 255;
  const zx = (d1x * az + d2x * bz + d0x * cz) * ia;
  const zy = (d1y * az + d2y * bz + d0y * cz) * ia;
  let zr = (r1 * az + r2 * bz + r0 * cz) * ia;
  const Rx = (d1x * Ar + d2x * Br_ + d0x * Cr) * ia;
  const Ry = (d1y * Ar + d2y * Br_ + d0y * Cr) * ia;
  let Rr = (r1 * Ar + r2 * Br_ + r0 * Cr) * ia;
  const Gx = (d1x * Ag + d2x * Bg + d0x * Cg) * ia;
  const Gy = (d1y * Ag + d2y * Bg + d0y * Cg) * ia;
  let Gr = (r1 * Ag + r2 * Bg + r0 * Cg) * ia;
  const Bx = (d1x * Ab + d2x * Bb + d0x * Cb) * ia;
  const By = (d1y * Ab + d2y * Bb + d0y * Cb) * ia;
  let Brr = (r1 * Ab + r2 * Bb + r0 * Cb) * ia;
  for (let y = y0; y <= y1; y++) {
    let w0 = r0;
    let w1 = r1;
    let w2 = r2;
    let z = zr;
    let R = Rr;
    let G = Gr;
    let B = Brr;
    let i = y * FW + x0;
    const ro = (y & 3) << 2;
    for (let x = x0; x <= x1; x++, i++) {
      if (w0 >= 0 && w1 >= 0 && w2 >= 0) {
        if (md === 0) {
          if (z > ZB[i]) {
            ZB[i] = z;
            CR[i] = R;
            CG[i] = G;
            CB[i] = B;
          }
        } else if (md === 1) {
          if (z > ZB[i]) {
            CR[i] += R;
            CG[i] += G;
            CB[i] += B;
          }
        } else if (md === 2) {
          if (ZB[i] > z * 0.93) {
            CR[i] += R;
            CG[i] += G;
            CB[i] += B;
          }
        } else if (z > ZB[i] && BAY[ro | (x & 3)] < SDA) {
          CR[i] = R;
          CG[i] = G;
          CB[i] = B;
        }
      }
      w0 += d0x;
      w1 += d1x;
      w2 += d2x;
      z += zx;
      R += Rx;
      G += Gx;
      B += Bx;
    }
    r0 += d0y;
    r1 += d1y;
    r2 += d2y;
    zr += zy;
    Rr += Ry;
    Gr += Gy;
    Brr += By;
  }
}

// Triángulo de sombra: solo marca bits en la máscara (1 dura, 2 nube)
function stri(ax, ay, bx, by, cx, cy, bit) {
  let ar = (bx - ax) * (cy - ay) - (cx - ax) * (by - ay);
  if (ar < 0) {
    let t = bx;
    bx = cx;
    cx = t;
    t = by;
    by = cy;
    cy = t;
    ar = -ar;
  }
  if (ar < 0.05) return;
  const x0 = max(0, floor(min(ax, bx, cx)));
  const x1 = min(FW - 1, ceil(max(ax, bx, cx)));
  const y0 = max(0, floor(min(ay, by, cy)));
  const y1 = min(FH - 1, ceil(max(ay, by, cy)));
  if (x0 > x1 || y0 > y1) return;
  const px = x0 + 0.5;
  const py = y0 + 0.5;
  let r0 = (bx - ax) * (py - ay) - (by - ay) * (px - ax);
  let r1 = (cx - bx) * (py - by) - (cy - by) * (px - bx);
  let r2 = (ax - cx) * (py - cy) - (ay - cy) * (px - cx);
  for (let y = y0; y <= y1; y++) {
    let w0 = r0;
    let w1 = r1;
    let w2 = r2;
    let i = y * FW + x0;
    for (let x = x0; x <= x1; x++, i++) {
      if (w0 >= 0 && w1 >= 0 && w2 >= 0) SM[i] |= bit;
      w0 += ay - by;
      w1 += by - cy;
      w2 += cy - ay;
    }
    r0 += bx - ax;
    r1 += cx - bx;
    r2 += ax - cx;
  }
}

// Punto/disco en pantalla. md 0 opaco, 1 aditivo con caída suave, 3 trama
function dot(sx, sy, iz, s, c, md, al = 8) {
  const h = s / 2;
  const x0 = max(0, floor(sx - h));
  const x1 = min(FW - 1, floor(sx + h));
  const y0 = max(0, floor(sy - h));
  const y1 = min(FH - 1, floor(sy + h));
  const r = c >> 16;
  const g = (c >> 8) & 255;
  const b = c & 255;
  const q = 1 / (h * h + 0.01);
  for (let y = y0; y <= y1; y++)
    for (let x = x0; x <= x1; x++) {
      const i = y * FW + x;
      if (iz <= ZB[i]) continue;
      const dx = x + 0.5 - sx;
      const dy = y + 0.5 - sy;
      const d = (dx * dx + dy * dy) * q;
      if (s > 2.5 && d > 1) continue;
      if (md === 1) {
        const k = s > 2.5 ? 1 - d : 1;
        CR[i] += r * k;
        CG[i] += g * k;
        CB[i] += b * k;
      } else if (md === 3) {
        if (BAY[((y & 3) << 2) | (x & 3)] < al) {
          CR[i] = r;
          CG[i] = g;
          CB[i] = b;
        }
      } else {
        CR[i] = r;
        CG[i] = g;
        CB[i] = b;
        ZB[i] = iz;
      }
    }
}

// Tramado final a la paleta, viñeta, destello, disolución e "impacto" en dos tonos
function present(fl, fd, imp) {
  const o = O32;
  let i = 0;
  fl = cl(fl, -40, 100) | 0;
  for (let y = 0; y < FH; y++) {
    const ro = (y & 3) << 2;
    for (let x = 0; x < FW; x++, i++) {
      const b = ro | (x & 3);
      if (BAY[b] < fd) o[i] = PC[0];
      else if (imp) o[i] = CR[i] * 0.3 + CG[i] * 0.55 + CB[i] * 0.15 + DO[b] * 3 > 150 ? PC[14] : PC[1];
      else {
        const t = DO[b] + 96 + fl - VG[i];
        o[i] = LUT[(Q[CR[i] + t] << 10) | (Q[CG[i] + t] << 5) | Q[CB[i] + t]];
      }
    }
  }
}

// --- Ruido ---

let SEED = 1337;
function hs(x, y) {
  let h = (Math.imul(x, 374761393) + Math.imul(y, 668265263) + SEED) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) & 65535) / 65535;
}
function vn(x, y, p) {
  const xi = floor(x);
  const yi = floor(y);
  let fx = x - xi;
  let fy = y - yi;
  fx = fx * fx * (3 - 2 * fx);
  fy = fy * fy * (3 - 2 * fy);
  let x0 = xi;
  let y0 = yi;
  let x1 = xi + 1;
  let y1 = yi + 1;
  if (p) {
    x0 = ((x0 % p) + p) % p;
    y0 = ((y0 % p) + p) % p;
    x1 = (x0 + 1) % p;
    y1 = (y0 + 1) % p;
  }
  const a = hs(x0, y0);
  const b = hs(x1, y0);
  const c = hs(x0, y1);
  const d = hs(x1, y1);
  return a + (b - a) * fx + (c - a) * fy + (a - b - c + d) * fx * fy;
}
function fbm(x, y, o, p = 0) {
  let s = 0;
  let a = 1;
  let t = 0;
  for (let i = 0; i < o; i++) {
    s += a * vn(x, y, p);
    t += a;
    x *= 2;
    y *= 2;
    p *= 2;
    a *= 0.5;
  }
  return s / t;
}
let rs = 1;
const sr = () => (rs = (Math.imul(rs, 1664525) + 1013904223) >>> 0) / 4294967296;

// --- Luz: sol bajo y cálido, cielo frío ---

const SE = 0.42;
const SA = 0.32;
const LX = cos(SE) * cos(SA);
const LY = sin(SE);
const LZ = cos(SE) * sin(SA);
function shade(c, nx, ny, nz) {
  const k = max(0, nx * LX + ny * LY + nz * LZ);
  return pk((c >> 16) * (0.5 + 0.98 * k), ((c >> 8) & 255) * (0.57 + 0.72 * k), (c & 255) * (0.78 + 0.5 * k));
}
const FOGR = 150;
const FOGG = 158;
const FOGB = 198;
const fogf = (d) => cl((d - 13) * 0.0125, 0, 0.9);
function fogc(c, d) {
  const f = fogf(d);
  const g = 1 - f;
  return pk((c >> 16) * g + FOGR * f, ((c >> 8) & 255) * g + FOGG * f, (c & 255) * g + FOGB * f);
}
const SHR = [1, 0.56, 0.84, 0.5];
const SHG = [1, 0.63, 0.87, 0.56];
const SHB = [1, 0.79, 0.93, 0.74];

// --- Cámara ---

let ex = 0;
let ey = 20;
let ez = -14;
let cY = 1;
let sY = 0;
let cP = 1;
let sP = 0;
const F = 400;
const CX = 200;
const CY = 150;
function setCam(tx, tz, ty, d, yw, pt) {
  cY = cos(yw);
  sY = sin(yw);
  cP = cos(pt);
  sP = sin(pt);
  ex = tx - sY * cP * d;
  ey = ty + sP * d;
  ez = tz - cY * cP * d;
}
let _x = 0;
let _y = 0;
let _z = 0;
let _d = 0;
function P(x, y, z) {
  const dx = x - ex;
  const dy = y - ey;
  const dz = z - ez;
  const fz = dx * sY + dz * cY;
  const vz = fz * cP - dy * sP;
  if (vz < 0.3) return 0;
  _d = vz;
  _z = 1 / vz;
  _x = CX + F * (dx * cY - dz * sY) * _z;
  _y = CY - F * (fz * sP + dy * cP) * _z;
  return 1;
}

// --- La meseta ---

const AR = 11.6;
const rad = (a) => AR + 0.85 * sin(3 * a + 1) + 0.55 * sin(5 * a + 2.2) + 0.3 * sin(9 * a + 0.4) + 0.16 * sin(17 * a + 3);
const TS = 1024;
const TH = 16;
const TK = TS / (2 * TH);
const GR = new Uint8Array(TS * TS);
const GG = new Uint8Array(TS * TS);
const GB = new Uint8Array(TS * TS);
const GA = new Uint8Array(TS * TS);
const G0R = new Uint8Array(TS * TS);
const G0G = new Uint8Array(TS * TS);
const G0B = new Uint8Array(TS * TS);

function genSnow(y0, y1) {
  for (let ty = y0; ty < y1; ty++) {
    const z = ty / TK - TH;
    for (let tx = 0; tx < TS; tx++) {
      const x = tx / TK - TH;
      const k = ty * TS + tx;
      const e = rad(atan2(z, x)) - hypot(x, z);
      if (e < 0) continue;
      GA[k] = 1;
      const wu = x * 0.9 + z * 0.44;
      const wv = z * 0.9 - x * 0.44;
      const n1 = fbm(wu * 0.06 + 3, wv * 0.15, 3);
      const n2 = fbm(x * 0.45, z * 0.45 + 9, 2);
      const st = vn(wu * 0.22, wv * 2.4);
      const b = cl(0.45 + (n2 - 0.5) * 1.5 + (st - 0.5) * 0.55, 0, 1);
      let R = mix(128, 204, b);
      let G = mix(137, 210, b);
      let B = mix(184, 238, b);
      const pt = cl((n1 + (n2 - 0.5) * 0.4 - 0.53) * 7, 0, 1);
      if (pt > 0) {
        const q = hs(tx, ty) < 0.12 ? 0.78 : 1;
        const v = n2 * 36;
        R = mix(R, 86 * q + v, pt);
        G = mix(G, 82 * q + v, pt);
        B = mix(B, 100 * q + v, pt);
      }
      const wd = cl((vn(x * 0.16, z * 0.16 + 40) - 0.6) * 3, 0, 0.4);
      R += 16 * wd;
      B -= 4 * wd;
      if (e < 0.7) {
        const c = (1 - e / 0.7) * 0.8;
        R = mix(R, 238, c);
        G = mix(G, 240, c);
        B = mix(B, 250, c);
      }
      G0R[k] = R;
      G0G[k] = G;
      G0B[k] = B;
    }
  }
}

// Calcos sobre la nieve: huellas, quemaduras, escarcha. Se borran al empezar cada ronda.
function stamp(x, z, r, R, G, B, k) {
  const cx = (x + TH) * TK;
  const cz = (z + TH) * TK;
  const q = r * TK;
  for (let ty = max(0, (cz - q) | 0); ty <= min(TS - 1, (cz + q) | 0); ty++)
    for (let tx = max(0, (cx - q) | 0); tx <= min(TS - 1, (cx + q) | 0); tx++) {
      const d = hypot(tx - cx, ty - cz) / q;
      const i = ty * TS + tx;
      if (d >= 1 || !GA[i]) continue;
      const w = k * (1 - d * d) * (0.55 + 0.45 * hs(tx, ty));
      GR[i] = mix(GR[i], R, w);
      GG[i] = mix(GG[i], G, w);
      GB[i] = mix(GB[i], B, w);
    }
}

// Mar de nubes: textura periódica de 256x256 con relieve iluminado por el sol
const KR = new Uint8Array(65536);
const KG = new Uint8Array(65536);
const KB = new Uint8Array(65536);
const KA = new Uint8Array(65536);
const KD = new Float32Array(65536);
function genCloud(y0, y1) {
  for (let y = y0; y < y1; y++) for (let x = 0; x < 256; x++) KD[y * 256 + x] = fbm(x / 32, y / 32, 5, 8);
}
function shadeCloud() {
  for (let y = 0; y < 256; y++)
    for (let x = 0; x < 256; x++) {
      const k = y * 256 + x;
      const d = KD[k];
      const a = cl((d - 0.42) * 3.4, 0, 1);
      const l = cl((d - KD[((y + 2) & 255) * 256 + ((x + 4) & 255)]) * 9, -1, 1);
      KR[k] = mix(64, 206, a) + l * 40 * a;
      KG[k] = mix(70, 210, a) + l * 18 * a;
      KB[k] = mix(104, 234, a) - l * 6 * a;
      KA[k] = a * 255;
    }
}

let WX = 0;
const CL1 = -11;
const CL2 = -46;
function floorPass() {
  const iF = 1 / F;
  let i = 0;
  for (let y = 0; y < FH; y++) {
    const v = (CY - y - 0.5) * iF;
    const fz = cP + v * sP;
    const dy = -sP + v * cP;
    if (dy > -0.004) {
      const k = cl(-v * 3, 0, 1);
      for (let x = 0; x < FW; x++, i++) {
        CR[i] = mix(150, 196, k);
        CG[i] = mix(160, 196, k);
        CB[i] = mix(198, 214, k);
        ZB[i] = 0;
      }
      continue;
    }
    const u0 = (0.5 - CX) * iF;
    const dx0 = u0 * cY + fz * sY;
    const dz0 = -u0 * sY + fz * cY;
    const sx = cY * iF;
    const sz = -sY * iF;
    const t0 = -ey / dy;
    const t1 = (CL1 - ey) / dy;
    const t2 = (CL2 - ey) / dy;
    let X = ex + t0 * dx0;
    let Z = ez + t0 * dz0;
    const DX = t0 * sx;
    const DZ = t0 * sz;
    let X1 = (ex + t1 * dx0 + WX) * 7;
    let Z1 = (ez + t1 * dz0 + WX * 0.4) * 7;
    const DX1 = t1 * sx * 7;
    const DZ1 = t1 * sz * 7;
    let X2 = (ex + t2 * dx0 + WX * 0.5) * 3.2 + 97;
    let Z2 = (ez + t2 * dz0) * 3.2 + 31;
    const DX2 = t2 * sx * 3.2;
    const DZ2 = t2 * sz * 3.2;
    const f0 = fogf(t0);
    const g0 = 1 - f0;
    const f1 = fogf(t1) * 0.8;
    const g1 = 1 - f1;
    const f2 = min(0.94, fogf(t2) + 0.18);
    const g2 = 1 - f2;
    const iz0 = 1 / t0;
    const iz1 = 1 / t1;
    const iz2 = 1 / t2;
    for (let x = 0; x < FW; x++, i++) {
      const tu = ((X + TH) * TK) | 0;
      const tv = ((Z + TH) * TK) | 0;
      const k = tv * TS + tu;
      if (tu >= 0 && tu < TS && tv >= 0 && tv < TS && GA[k]) {
        const s = SM[i];
        CR[i] = GR[k] * SHR[s] * g0 + FOGR * f0;
        CG[i] = GG[k] * SHG[s] * g0 + FOGG * f0;
        CB[i] = GB[k] * SHB[s] * g0 + FOGB * f0;
        ZB[i] = iz0;
      } else {
        const c1 = ((Z1 & 255) << 8) | (X1 & 255);
        const c2 = ((Z2 & 255) << 8) | (X2 & 255);
        const a = cl((KA[c1] - 110) * 0.016, 0, 1);
        const b = 1 - a;
        CR[i] = (KR[c1] * g1 + FOGR * f1) * a + (KR[c2] * 0.82 * g2 + FOGR * f2) * b;
        CG[i] = (KG[c1] * g1 + FOGG * f1) * a + (KG[c2] * 0.85 * g2 + FOGG * f2) * b;
        CB[i] = (KB[c1] * g1 + FOGB * f1) * a + (KB[c2] * 0.92 * g2 + FOGB * f2) * b;
        ZB[i] = a > 0.5 ? iz1 : iz2;
      }
      X += DX;
      Z += DZ;
      X1 += DX1;
      Z1 += DZ1;
      X2 += DX2;
      Z2 += DZ2;
    }
  }
}

// --- Mallas estáticas: acantilados y obstáculos ---

function mesh() {
  return { v: [], c: [], t: [], n: [], g: [] };
}
function mV(m, x, y, z, c) {
  m.v.push(x, y, z);
  m.c.push(c);
  return m.c.length - 1;
}
// Triángulo con normal hacia afuera respecto de un punto interior (ox, oy, oz)
function mT(m, a, b, c, g, ox, oy, oz) {
  const v = m.v;
  const ux = v[b * 3] - v[a * 3];
  const uy = v[b * 3 + 1] - v[a * 3 + 1];
  const uz = v[b * 3 + 2] - v[a * 3 + 2];
  const wx = v[c * 3] - v[a * 3];
  const wy = v[c * 3 + 1] - v[a * 3 + 1];
  const wz = v[c * 3 + 2] - v[a * 3 + 2];
  let nx = uy * wz - uz * wy;
  let ny = uz * wx - ux * wz;
  let nz = ux * wy - uy * wx;
  const l = hypot(nx, ny, nz) || 1;
  const s = nx * (v[a * 3] - ox) + ny * (v[a * 3 + 1] - oy) + nz * (v[a * 3 + 2] - oz) < 0 ? -1 / l : 1 / l;
  nx *= s;
  ny *= s;
  nz *= s;
  m.t.push(a, b, c);
  m.n.push(nx, ny, nz);
  m.g.push(g);
  return [nx, ny, nz];
}
// Cara plana iluminada: vértices propios, oscurecidos cerca del suelo
function face(m, pts, alb, g, ox, oy, oz) {
  const id = pts.map((p) => mV(m, p[0], p[1], p[2], 0));
  for (let k = 1; k < pts.length - 1; k++) {
    const n = mT(m, id[0], id[k], id[k + 1], g, ox, oy, oz);
    if (k === 1) {
      const c = shade(alb, n[0], n[1], n[2]);
      id.forEach((j, q) => (m.c[j] = sc3(c, 0.72 + 0.28 * min(1, pts[q][1] / 1.1))));
    }
  }
}

const PXb = new Float32Array(4000);
const PYb = new Float32Array(4000);
const PZb = new Float32Array(4000);
const PCb = new Int32Array(4000);
const PVb = new Uint8Array(4000);
function drawMesh(m) {
  const v = m.v;
  const n = m.c.length;
  for (let i = 0; i < n; i++) {
    PVb[i] = P(v[i * 3], v[i * 3 + 1], v[i * 3 + 2]);
    PXb[i] = _x;
    PYb[i] = _y;
    PZb[i] = _z;
    PCb[i] = fogc(m.c[i], _d);
  }
  const t = m.t;
  const N = m.n;
  for (let j = 0, q = 0; j < t.length; j += 3, q++) {
    const g = m.g[q];
    if (g >= 0 && !OB[g].al) continue;
    const a = t[j];
    const b = t[j + 1];
    const c = t[j + 2];
    if (!(PVb[a] & PVb[b] & PVb[c])) continue;
    if (N[j] * (ex - v[a * 3]) + N[j + 1] * (ey - v[a * 3 + 1]) + N[j + 2] * (ez - v[a * 3 + 2]) <= 0) continue;
    tri(PXb[a], PYb[a], PZb[a], PXb[b], PYb[b], PZb[b], PXb[c], PYb[c], PZb[c], PCb[a], PCb[b], PCb[c], 0);
  }
}
function shadowMesh(m) {
  const v = m.v;
  const n = m.c.length;
  for (let i = 0; i < n; i++) {
    const y = v[i * 3 + 1];
    PVb[i] = P(v[i * 3] - (LX / LY) * y, 0, v[i * 3 + 2] - (LZ / LY) * y);
    PXb[i] = _x;
    PYb[i] = _y;
  }
  const t = m.t;
  for (let j = 0, q = 0; j < t.length; j += 3, q++) {
    const g = m.g[q];
    if (g >= 0 && !OB[g].al) continue;
    const a = t[j];
    const b = t[j + 1];
    const c = t[j + 2];
    if (PVb[a] & PVb[b] & PVb[c]) stri(PXb[a], PYb[a], PXb[b], PYb[b], PXb[c], PYb[c], 1);
  }
}

// Acantilados: la meseta es una isla flotante que se afina hacia abajo, con chorreos de nieve
let WALL = null;
function buildWalls() {
  const m = mesh();
  const K = 128;
  const RG = [
    [0, 1, 0.2],
    [-0.6, 1.025, 0],
    [-2.6, 0.975, -0.05],
    [-6.5, 0.9, -0.2],
    [-12, 0.74, -0.45],
    [-19, 0.5, -0.65],
    [-26, 0.16, -0.85],
  ];
  const idx = [];
  for (let j = 0; j < K; j++) {
    const a = (j / K) * TAU;
    const r0 = rad(a);
    const dr = (rad(a + 0.01) - rad(a - 0.01)) / 0.02;
    let nx = cos(a) - (sin(a) * dr) / r0;
    let nz = sin(a) + (cos(a) * dr) / r0;
    const nl = hypot(nx, nz);
    nx /= nl;
    nz /= nl;
    const drip = hs(j, 7);
    const col = [];
    RG.forEach(([y, rm, ny], q) => {
      const jit = q > 1 ? (hs(j, q) - 0.5) * 0.9 * q * 0.3 : 0;
      const r = r0 * rm + jit;
      let alb;
      if (q < 2) alb = 0xe6e9f4;
      else if (q === 2) alb = drip < 0.6 ? 0xd2d8ec : 0x6a6280;
      else if (q === 3) alb = drip < 0.22 ? 0xc6cce4 : 0x5c5672;
      else alb = q === 4 ? 0x4c4a64 : 0x5a6080;
      const l = hypot(nx, ny, nz);
      let c = shade(alb, nx / l, ny / l, nz / l);
      if (q > 4) c = pk(mix(c >> 16, 150, (q - 4) * 0.4), mix((c >> 8) & 255, 158, (q - 4) * 0.4), mix(c & 255, 192, (q - 4) * 0.4));
      col.push(mV(m, cos(a) * r, y, sin(a) * r, c));
    });
    idx.push(col);
  }
  for (let j = 0; j < K; j++) {
    const A = idx[j];
    const B = idx[(j + 1) % K];
    for (let q = 0; q < RG.length - 1; q++) {
      const y = (RG[q][0] + RG[q + 1][0]) / 2;
      mT(m, A[q], B[q], B[q + 1], -1, 0, y, 0);
      mT(m, A[q], B[q + 1], A[q + 1], -1, 0, y, 0);
    }
  }
  WALL = m;
}

// Obstáculos: cúmulos de penitentes (cubren) y lajas de roca (se puede subir)
let OB = [];
let OBM = mesh();
function genObstacles(seed) {
  rs = (seed * 7919 + 13) >>> 0;
  OB = [];
  for (let n = 0; n < 400 && OB.length < 7; n++) {
    const a = sr() * TAU;
    const r = 2 + sr() * (AR - 4);
    const x = cos(a) * r;
    const z = sin(a) * r;
    const k = OB.length % 3 === 2 ? 1 : 0;
    const R = k ? 0.95 + sr() * 0.45 : 0.75 + sr() * 0.4;
    if (hypot(x + 5.5, z) < 2.8 || hypot(x - 5.5, z) < 2.8 || hypot(x, z) < 1.8) continue;
    if (OB.some((o) => hypot(o.x - x, o.z - z) < o.r + R + 2.3)) continue;
    if (r + R > rad(a) - 1.3) continue;
    OB.push({ x, z, r: R, h: k ? 0.55 + sr() * 0.2 : 2.2, k, hp: 4, al: 1 });
  }
  const m = mesh();
  OB.forEach((o, g) => {
    if (o.k) {
      const ring = [];
      for (let q = 0; q < 7; q++) {
        const a = (q / 7) * TAU + sr() * 0.4;
        const r = o.r * (0.88 + sr() * 0.22);
        ring.push([o.x + cos(a) * r, o.z + sin(a) * r]);
      }
      for (let q = 0; q < 7; q++) {
        const [ax, az] = ring[q];
        const [bx, bz] = ring[(q + 1) % 7];
        face(m, [[ax, -0.05, az], [bx, -0.05, bz], [bx, o.h, bz], [ax, o.h, az]], 0x7a6474, g, o.x, o.h / 2, o.z);
      }
      face(m, ring.map(([x, z]) => [x, o.h, z]), 0xd89a84, g, o.x, 0, o.z);
    } else {
      const ns = 5 + ((sr() * 3) | 0);
      for (let s = 0; s < ns; s++) {
        const a = sr() * TAU;
        const d = s ? (0.3 + sr() * 0.5) * o.r : 0;
        const bx = o.x + cos(a) * d;
        const bz = o.z + sin(a) * d;
        const b = 0.26 + sr() * 0.2;
        const h = s ? 1.3 + sr() * 1.4 : 2.8 + sr() * 0.8;
        const ry = sr() * TAU;
        const tx = bx + LX * h * 0.2 + (sr() - 0.5) * 0.25;
        const tz = bz + LZ * h * 0.2 + (sr() - 0.5) * 0.25;
        const c = [0, 1, 2, 3].map((q) => [bx + cos(ry + (q * PI) / 2) * b, -0.05, bz + sin(ry + (q * PI) / 2) * b]);
        for (let q = 0; q < 4; q++) face(m, [c[q], c[(q + 1) % 4], [tx, h, tz]], 0xa8b8ec, g, bx, h * 0.3, bz);
      }
    }
  });
  OBM = m;
}

// --- Cajas dinámicas (personajes, objetos) ---

const MB = 220;
const BXc = new Float32Array(MB * 24);
const BXa = new Float32Array(MB * 9);
const BXk = new Int32Array(MB);
const BXm = new Uint8Array(MB);
let nB = 0;
const FACES = [
  [1, 3, 7, 5, 0, 1],
  [0, 4, 6, 2, 0, -1],
  [2, 6, 7, 3, 1, 1],
  [0, 1, 5, 4, 1, -1],
  [4, 5, 7, 6, 2, 1],
  [0, 2, 3, 1, 2, -1],
];
const ID = [1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0];
function mR(m, ax, a) {
  const c = cos(a);
  const s = sin(a);
  const r = m.slice();
  const i = ax === 0 ? 3 : ax === 1 ? 6 : 0;
  const j = ax === 0 ? 6 : ax === 1 ? 0 : 3;
  for (let k = 0; k < 3; k++) {
    const p = m[i + k];
    const q = m[j + k];
    r[i + k] = p * c + q * s;
    r[j + k] = q * c - p * s;
  }
  return r;
}
function mTr(m, x, y, z) {
  const r = m.slice();
  for (let k = 0; k < 3; k++) r[9 + k] = m[9 + k] + x * m[k] + y * m[3 + k] + z * m[6 + k];
  return r;
}
const mPt = (m, x, y, z) => [m[9] + x * m[0] + y * m[3] + z * m[6], m[10] + x * m[1] + y * m[4] + z * m[7], m[11] + x * m[2] + y * m[5] + z * m[8]];
function box(m, x, y, z, hx, hy, hz, col, md = 0) {
  if (nB >= MB) return;
  const o = mPt(m, x, y, z);
  const b = nB++;
  for (let k = 0; k < 8; k++) {
    const sx = k & 1 ? hx : -hx;
    const sy = k & 2 ? hy : -hy;
    const sz = k & 4 ? hz : -hz;
    for (let q = 0; q < 3; q++) BXc[b * 24 + k * 3 + q] = o[q] + sx * m[q] + sy * m[3 + q] + sz * m[6 + q];
  }
  for (let q = 0; q < 9; q++) BXa[b * 9 + q] = m[q];
  BXk[b] = col;
  BXm[b] = md;
}
const BSX = new Float32Array(8);
const BSY = new Float32Array(8);
const BSZ = new Float32Array(8);
function drawBoxes(shadow) {
  for (let b = 0; b < nB; b++) {
    const md = BXm[b];
    if (shadow && md) continue;
    let ok = 1;
    for (let k = 0; k < 8; k++) {
      const o = b * 24 + k * 3;
      const y = BXc[o + 1];
      if (!(shadow ? P(BXc[o] - (LX / LY) * y, 0, BXc[o + 2] - (LZ / LY) * y) : P(BXc[o], y, BXc[o + 2]))) ok = 0;
      BSX[k] = _x;
      BSY[k] = _y;
      BSZ[k] = _z;
    }
    if (!ok) continue;
    const dep = 1 / BSZ[0];
    for (const f of FACES) {
      const s = f[5];
      const a = b * 9 + f[4] * 3;
      const nx = BXa[a] * s;
      const ny = BXa[a + 1] * s;
      const nz = BXa[a + 2] * s;
      const [p, q, r, t] = f;
      if (shadow) {
        if (nx * LX + ny * LY + nz * LZ > 0) {
          stri(BSX[p], BSY[p], BSX[q], BSY[q], BSX[r], BSY[r], 1);
          stri(BSX[p], BSY[p], BSX[r], BSY[r], BSX[t], BSY[t], 1);
        }
        continue;
      }
      const o = b * 24 + p * 3;
      if (nx * (ex - BXc[o]) + ny * (ey - BXc[o + 1]) + nz * (ez - BXc[o + 2]) <= 0) continue;
      const c = fogc(md === 2 ? BXk[b] : shade(BXk[b], nx, ny, nz), dep);
      const tm = md === 1 ? 3 : 0;
      tri(BSX[p], BSY[p], BSZ[p], BSX[q], BSY[q], BSZ[q], BSX[r], BSY[r], BSZ[r], c, c, c, tm);
      tri(BSX[p], BSY[p], BSZ[p], BSX[r], BSY[r], BSZ[r], BSX[t], BSY[t], BSZ[t], c, c, c, tm);
    }
  }
}

// Luz dinámica: disco aditivo sobre la nieve
function glow(x, z, r, c, y = 0.02) {
  if (!P(x, y, z)) return;
  const cx = _x;
  const cy = _y;
  const cz = _z;
  let px = 0;
  let py = 0;
  let pz = 0;
  let ok = 0;
  for (let i = 0; i <= 12; i++) {
    const a = (i / 12) * TAU;
    const v = P(x + cos(a) * r, y, z + sin(a) * r);
    if (i && v && ok) tri(cx, cy, cz, px, py, pz, _x, _y, _z, c, 0, 0, 2);
    px = _x;
    py = _y;
    pz = _z;
    ok = v;
  }
}
// Línea 3D aditiva (rayos, estelas)
function line3(x0, y0, z0, x1, y1, z1, c, s) {
  if (!P(x0, y0, z0)) return;
  const ax = _x;
  const ay = _y;
  const az = _z;
  if (!P(x1, y1, z1)) return;
  const n = max(1, ceil(max(abs(_x - ax), abs(_y - ay))));
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    dot(mix(ax, _x, t), mix(ay, _y, t), mix(az, _z, t) + 0.05, s, c, 1);
  }
}

// --- Partículas ---

const MP = 1500;
const QX = new Float32Array(MP);
const QY = new Float32Array(MP);
const QZ = new Float32Array(MP);
const QVX = new Float32Array(MP);
const QVY = new Float32Array(MP);
const QVZ = new Float32Array(MP);
const QL = new Float32Array(MP);
const QM = new Float32Array(MP);
const QS = new Float32Array(MP);
const QC = new Int32Array(MP);
const QF = new Uint8Array(MP);
let qn = 0;
// fl: 1 aditiva, 2 gravedad, 4 roce, 8 choca con el suelo, 16 crece, 32 trama (humo)
function part(x, y, z, vx, vy, vz, l, s, c, fl) {
  if (qn >= MP) return;
  const i = qn++;
  QX[i] = x;
  QY[i] = y;
  QZ[i] = z;
  QVX[i] = vx;
  QVY[i] = vy;
  QVZ[i] = vz;
  QL[i] = QM[i] = l;
  QS[i] = s;
  QC[i] = c;
  QF[i] = fl;
}
function burst(x, y, z, n, sp, l, s, c, fl, up = 0) {
  for (let i = 0; i < n; i++) {
    const a = rnd() * TAU;
    const e = rr(-1, 1);
    const v = sp * rr(0.3, 1);
    part(x, y, z, cos(a) * v * sqrt(1 - e * e), e * v + up, sin(a) * v * sqrt(1 - e * e), l * rr(0.6, 1), s, c, fl);
  }
}
function stepParts(dt) {
  for (let i = 0; i < qn; i++) {
    QL[i] -= dt;
    if (QL[i] <= 0) {
      const j = --qn;
      QX[i] = QX[j];
      QY[i] = QY[j];
      QZ[i] = QZ[j];
      QVX[i] = QVX[j];
      QVY[i] = QVY[j];
      QVZ[i] = QVZ[j];
      QL[i] = QL[j];
      QM[i] = QM[j];
      QS[i] = QS[j];
      QC[i] = QC[j];
      QF[i] = QF[j];
      i--;
      continue;
    }
    const f = QF[i];
    if (f & 2) QVY[i] -= 14 * dt;
    if (f & 4) {
      const k = exp(-3 * dt);
      QVX[i] *= k;
      QVY[i] *= k;
      QVZ[i] *= k;
    }
    QX[i] += QVX[i] * dt;
    QY[i] += QVY[i] * dt;
    QZ[i] += QVZ[i] * dt;
    if (f & 8 && QY[i] < 0 && onPlat(QX[i], QZ[i])) {
      QY[i] = 0;
      QVY[i] *= -0.25;
      QVX[i] *= 0.5;
      QVZ[i] *= 0.5;
    }
  }
}
function drawParts() {
  for (let i = 0; i < qn; i++) {
    if (!P(QX[i], QY[i], QZ[i])) continue;
    const f = QF[i];
    const k = QL[i] / QM[i];
    const s = min(40, QS[i] * F * _z * (f & 16 ? 2 - k : 1));
    if (s < 0.4) continue;
    if (f & 1) dot(_x, _y, _z + 0.02, max(1, s), sc3(QC[i], k), 1);
    else if (f & 32) dot(_x, _y, _z, max(1, s), fogc(QC[i], _d), 3, k * 10);
    else dot(_x, _y, _z, max(1, s), fogc(QC[i], _d), 0);
  }
}

// Nieve que cae
const NS = 240;
const SNX = new Float32Array(NS);
const SNY = new Float32Array(NS);
const SNZ = new Float32Array(NS);
for (let i = 0; i < NS; i++) {
  SNX[i] = rr(-16, 16);
  SNY[i] = rr(0, 18);
  SNZ[i] = rr(-16, 16);
}
function snow(dt, tx, tz) {
  for (let i = 0; i < NS; i++) {
    SNY[i] -= (1.1 + (i % 5) * 0.2) * dt;
    SNX[i] += (1.6 + sin(T + i) * 0.6) * dt;
    SNZ[i] += 0.5 * dt;
    if (SNY[i] < 0) SNY[i] += 18;
    SNX[i] = tx - 16 + ((((SNX[i] - tx + 16) % 32) + 32) % 32);
    SNZ[i] = tz - 16 + ((((SNZ[i] - tz + 16) % 32) + 32) % 32);
    if (dt === 0 && P(SNX[i], SNY[i], SNZ[i])) dot(_x, _y, _z, _z * F > 22 ? 2 : 1, fogc(0xeef0fa, _d), 0);
  }
}

// --- Texto 3x5 ---

const FONT = {
  A: '25755', B: '65656', C: '34443', D: '65556', E: '74647', F: '74644', G: '34553', H: '55755', I: '72227',
  J: '11152', K: '55655', L: '44447', M: '57555', N: '65555', O: '25552', P: '65644', Q: '25563', R: '65655',
  S: '74717', T: '72222', U: '55557', V: '55552', W: '55775', X: '55255', Y: '55222', Z: '71247',
  0: '75557', 1: '26227', 2: '61247', 3: '61216', 4: '55711', 5: '74616', 6: '34757', 7: '71222', 8: '75757', 9: '75716',
  '!': '22202', '¡': '20222', '?': '61202', '.': '00002', ',': '00024', ':': '02020', '-': '00700', '+': '02720',
  '/': '11244', '·': '00200', '*': '05250',
};
const ACC = { Á: 'A', É: 'E', Í: 'I', Ó: 'O', Ú: 'U', Ñ: 'N' };
function fill(x, y, w, h, c) {
  const xa = max(0, x | 0);
  const xb = min(FW, (x + w) | 0);
  const ya = max(0, y | 0);
  const yb = min(FH, (y + h) | 0);
  for (let py = ya; py < yb; py++) O32.fill(c, py * FW + xa, py * FW + xb);
}
function txt(s, x, y, c, sx = 1, sy = 1, al = 0, sh = 1) {
  s = String(s).toUpperCase();
  x = Math.round(x - (s.length * 4 * sx - sx) * al);
  y = Math.round(y);
  const OFS = [[-1, 0], [1, 0], [0, -1], [0, 1], [1, 1], [max(1, sx >> 1), max(1, sy >> 1)]];
  for (let pass = sh ? 0 : 6; pass < 7; pass++) {
    const o = OFS[pass] || [0, 0];
    let cx = x + o[0];
    const cy = y + o[1];
    const col = pass > 5 ? c : PC[1];
    for (const ch of s) {
      const g = FONT[ACC[ch] || ch];
      if (g) {
        for (let r = 0; r < 5; r++) {
          const bits = +g[r];
          for (let k = 0; k < 3; k++) if (bits & (4 >> k)) fill(cx + k * sx, cy + r * sy, sx, sy, col);
        }
        if (ACC[ch]) fill(cx + (ch === 'Ñ' ? 0 : sx), cy - sy - 1, ch === 'Ñ' ? 3 * sx : 2 * sx, max(1, sy >> 1), col);
      }
      cx += 4 * sx;
    }
  }
}

// --- Sonido sintetizado con reverberación ---

let AC = null;
let MS = null;
let RV = null;
let NB = null;
let WG = null;
let WF = null;
function aInit(sc) {
  if (AC || !sc.sound || !sc.sound.context) return;
  AC = sc.sound.context;
  MS = AC.createGain();
  MS.gain.value = 0.55;
  MS.connect(AC.destination);
  const sr_ = AC.sampleRate;
  RV = AC.createConvolver();
  const len = (sr_ * 2.6) | 0;
  const ir = AC.createBuffer(2, len, sr_);
  for (let c = 0; c < 2; c++) {
    const d = ir.getChannelData(c);
    for (let i = 0; i < len; i++) d[i] = (rnd() * 2 - 1) * (1 - i / len) ** 3.4;
  }
  RV.buffer = ir;
  const rg = AC.createGain();
  rg.gain.value = 0.3;
  RV.connect(rg);
  rg.connect(MS);
  NB = AC.createBuffer(1, sr_ * 2, sr_);
  const d = NB.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = rnd() * 2 - 1;
  const s = AC.createBufferSource();
  s.buffer = NB;
  s.loop = true;
  WF = AC.createBiquadFilter();
  WF.type = 'bandpass';
  WF.frequency.value = 380;
  WF.Q.value = 0.7;
  WG = AC.createGain();
  WG.gain.value = 0.04;
  s.connect(WF);
  WF.connect(WG);
  WG.connect(MS);
  s.start();
}
function bus(n, dry = 1) {
  if (dry) n.connect(MS);
  n.connect(RV);
}
let MUS = 0;
function tone(f, dur, type, vol, f2 = 0, dl = 0) {
  if (!AC || AC.state !== 'running' || (mode === 'title' && !MUS)) return;
  const t = AC.currentTime + dl;
  const o = AC.createOscillator();
  const g = AC.createGain();
  o.type = type;
  o.frequency.setValueAtTime(f, t);
  if (f2) o.frequency.exponentialRampToValueAtTime(f2, t + dur);
  g.gain.setValueAtTime(vol, t);
  g.gain.exponentialRampToValueAtTime(0.0008, t + dur);
  o.connect(g);
  bus(g);
  o.start(t);
  o.stop(t + dur + 0.05);
}
function noise(dur, vol, fq, type = 'lowpass', dl = 0, f2 = 0) {
  if (!AC || AC.state !== 'running' || (mode === 'title' && !MUS)) return;
  const t = AC.currentTime + dl;
  const s = AC.createBufferSource();
  s.buffer = NB;
  const f = AC.createBiquadFilter();
  f.type = type;
  f.frequency.setValueAtTime(fq, t);
  if (f2) f.frequency.exponentialRampToValueAtTime(f2, t + dur);
  const g = AC.createGain();
  g.gain.setValueAtTime(vol, t);
  g.gain.exponentialRampToValueAtTime(0.0008, t + dur);
  s.connect(f);
  f.connect(g);
  bus(g);
  s.start(t, rnd());
  s.stop(t + dur + 0.05);
}
const SFX = {
  swing: () => noise(0.13, 0.22, 900, 'bandpass', 0, 3200),
  hit: (v = 1) => {
    noise(0.16, 0.5 * v, 1300);
    tone(150, 0.14, 'square', 0.2 * v, 55);
  },
  block: () => {
    tone(1250, 0.2, 'square', 0.06);
    tone(1870, 0.3, 'triangle', 0.08);
    noise(0.05, 0.2, 4000, 'highpass');
  },
  parry: () => {
    tone(2093, 0.6, 'triangle', 0.13);
    tone(3136, 0.7, 'sine', 0.08);
    noise(0.1, 0.25, 5000, 'highpass');
  },
  bash: () => {
    noise(0.2, 0.55, 420);
    tone(95, 0.25, 'sine', 0.45, 45);
  },
  jump: () => noise(0.14, 0.12, 500, 'bandpass', 0, 1500),
  land: () => noise(0.09, 0.15, 2600, 'highpass'),
  step: () => noise(0.04, 0.03, 2200, 'highpass'),
  ice: () => {
    [1568, 2093, 2637, 3136].forEach((f, i) => tone(f, 0.3, 'triangle', 0.06, 0, i * 0.03));
    noise(0.3, 0.08, 6000, 'highpass');
  },
  fire: () => {
    noise(0.4, 0.35, 600, 'lowpass', 0, 2400);
    tone(110, 0.3, 'sawtooth', 0.06, 70);
  },
  slow: () => {
    tone(440, 0.7, 'sine', 0.12, 160);
    tone(446, 0.7, 'sine', 0.1, 163);
  },
  freeze: () => {
    noise(0.25, 0.3, 5000, 'highpass');
    [2637, 1976, 1568].forEach((f, i) => tone(f, 0.4, 'triangle', 0.07, 0, i * 0.05));
  },
  shatter: () => {
    noise(0.35, 0.35, 3500, 'highpass');
    [3520, 2960, 4186].forEach((f, i) => tone(f, 0.2, 'square', 0.03, 0, i * 0.04));
  },
  boom: (v = 1) => {
    noise(1, 0.9 * v, 520, 'lowpass', 0, 120);
    tone(75, 0.9, 'sine', 0.7 * v, 28);
  },
  thunder: () => {
    noise(0.12, 0.6, 3000, 'highpass');
    noise(1.4, 0.8, 400, 'lowpass', 0.05, 90);
    tone(55, 1, 'sine', 0.5, 30);
  },
  gust: () => noise(0.7, 0.45, 400, 'bandpass', 0, 2200),
  potion: () => [523, 659, 784, 1047].forEach((f, i) => tone(f, 0.25, 'triangle', 0.09, 0, i * 0.07)),
  pick: () => {
    tone(880, 0.1, 'square', 0.06);
    tone(1320, 0.18, 'square', 0.06, 0, 0.07);
  },
  chime: () => tone(1760, 1.2, 'sine', 0.05),
  ko: () => {
    tone(220, 1.2, 'sawtooth', 0.15, 50);
    SFX.boom(0.8);
  },
  gong: () => [98, 147, 196, 294].forEach((f) => tone(f, 2.6, 'sine', 0.11, f * 0.995)),
  fall: () => tone(900, 1.3, 'sine', 0.1, 120),
  condor: () => [0, 0.5].forEach((d) => tone(1900, 0.5, 'sine', 0.035, 1100, d)),
  ui: () => tone(880, 0.07, 'square', 0.06),
};

// Música: en el título una quena sobre un colchón; en el combate un bombo legüero acelerado
const MEL = [9, -1, 12, 14, 16, -1, 14, 12, 9, -1, -1, 7, 9, -1, -1, -1, 16, -1, 19, 16, 14, -1, 12, 14, 9, -1, 12, -1, 9, -1, -1, -1];
const BASS = [-15, -15, -12, -10];
let mi = 0;
let mt = 0;
function music(fight) {
  if (!AC || AC.state !== 'running') return;
  if (mt < AC.currentTime) mt = AC.currentTime + 0.05;
  const stp = fight ? 0.115 : 0.24;
  MUS = 1;
  while (mt < AC.currentTime + 0.3) {
    const d = mt - AC.currentTime;
    const b = 220 * 2 ** (BASS[(mi >> 4) & 3] / 12);
    if (fight) {
      const s = mi & 15;
      if (s === 0 || s === 6 || s === 8 || s === 11) {
        tone(78, 0.28, 'sine', 0.32, 40, d);
        noise(0.06, 0.12, 180, 'lowpass', d);
      }
      if (s === 4 || s === 12) noise(0.08, 0.1, 1800, 'bandpass', d);
      if (!(s & 1)) noise(0.03, 0.025, 7000, 'highpass', d);
      if (s === 0 || s === 10) tone(b, 0.3, 'triangle', 0.1, 0, d);
    } else {
      const n = MEL[mi & 31];
      if (n >= 0) {
        const f = 440 * 2 ** (n / 12);
        tone(f, 0.5, 'sine', 0.06, f * 0.985, d);
      }
      if (!(mi & 7)) [1, 1.5, 2.4].forEach((k) => tone(b * k, 2, 'triangle', 0.035, 0, d));
    }
    mi++;
    mt += stp;
  }
  MUS = 0;
}

// --- Juego ---

const PCOL = [0xd85a40, 0x2fb4a0];
const PCOL2 = [0xf2a07a, 0x86e0cc];
const PCI = [PC[15], PC[18]];
const DK = 0x2a2e42;
const SPC = [0x8ff0ff, 0xff8c32, 0xb48cff];
const SPN = ['HIELO', 'FUEGO', 'LENTO'];
const SPI = [PC[19], PC[16], PC[21]];
const ITN = ['', 'POCIÓN', 'BOMBA', 'RAYO', 'CRISTAL', 'VENDAVAL'];
const ITC = [0, 0xff6f8a, 0x30303c, 0xffe060, 0x8ff0ff, 0xf2f4ff];
const ITI = [0, PC[13], PC[15], PC[17], PC[19], PC[9]];

let phase = 'boot';
let mode = 'title';
let T = 0;
let PT = 0;
let TSC = 1;
let HSTOP = 0;
let SHK = 0;
let IMP = 0;
let FLASH = 0;
let FD = 16;
let LB = 0;
let TM = 60;
let RND = 0;
let lvl = 0;
let streak = 0;
let msg = '';
let msgT = 0;
let winner = -1;
let FS = [];
let PJ = [];
let IT = [];
let BM = [];
let LM = [];
let FP = [];
let SF = [];
let BOLT = [];
let FT = [];
let LT = [];
let itT = 4;
let condT = 14;
let COND = null;
const CAM = { x: 0, z: 0, d: 30, yw: 0, pt: 0.8 };

const onPlat = (x, z) => hypot(x, z) < rad(atan2(z, x));
function groundH(x, z) {
  for (const o of OB) if (o.k && o.al && (x - o.x) ** 2 + (z - o.z) ** 2 < o.r * o.r) return o.h;
  return 0;
}

function mkF(i) {
  return {
    i, x: 0, z: 0, y: 0, vx: 0, vz: 0, vy: 0, kx: 0, kz: 0, face: 0, hp: 100, gh: 100, gt: 0, mana: 1, sp: 0,
    item: 0, act: 0, at: 0, cmb: 0, q: 0, hd: 0, blk: 0, bk: 0, stun: 0, frz: 0, burn: 0, bt: 0, slow: 0, rapid: 0,
    hs: 0, inv: 0, fl: 0, fall: 0, ko: 0, kod: 0, wk: 0, mv: 0, ay: 0.2, ap: -0.45, lean: 0, trail: [], w: 0,
    bq: 0, bqt: 0, cpu: 0, ct: 0, side: 1, skl: 0.6, lag: 1, ci: { mx: 0, mz: 0, p: [], blk: 0 }, lx: 0, lz: 0,
  };
}

function say(s, t = 1.4) {
  msg = s;
  msgT = t;
}
function ftxt(x, y, z, s, c) {
  FT.push({ x, y, z, s, c, t: 0.9 });
}

function newMatch(m) {
  mode = m;
  FS = [mkF(0), mkF(1)];
  FS[0].cpu = m === 'title' ? 1 : 0;
  FS[1].cpu = m === 'vs' ? 0 : 1;
  for (const f of FS) {
    f.skl = m === 'solo' ? min(0.9, 0.42 + lvl * 0.08) : 0.62;
    f.lag = m === 'solo' ? max(0.45, 1.35 - lvl * 0.15) : 1;
    f.lv = lvl + 1;
  }
  RND = 0;
  newRound();
}

function newRound() {
  RND++;
  SEED = 1337;
  genObstacles(RND * 31 + lvl * 7 + (mode === 'title' ? (T * 10) | 0 : 0));
  GR.set(G0R);
  GG.set(G0G);
  GB.set(G0B);
  for (const o of OB) stamp(o.x, o.z, o.r + 1, 112, 118, 156, 0.45);
  FS.forEach((f, i) => {
    Object.assign(f, {
      x: i ? 5.5 : -5.5, z: 0, y: 0, vx: 0, vz: 0, vy: 0, kx: 0, kz: 0, face: i ? -PI / 2 : PI / 2, hp: 100, gh: 100,
      mana: 1, sp: (RND + i) % 3, item: 0, act: 0, at: 0, blk: 0, bk: 0, stun: 0, frz: 0, burn: 0, slow: 0, rapid: 0,
      hs: 0, inv: 0, fl: 0, fall: 0, ko: 0, kod: 0, trail: [], bq: 0, bqt: 0,
    });
  });
  PJ = [];
  IT = [];
  BM = [];
  LM = [];
  FP = [];
  SF = [];
  BOLT = [];
  FT = [];
  qn = 0;
  itT = 3.5;
  TM = 60;
  phase = 'intro';
  PT = 0;
  TSC = 1;
  CAM.d = mode === 'title' ? 27 : 34;
  if (mode !== 'title') SFX.gong();
}

// --- Entradas ---

function humIn(f) {
  const k = f.i ? 'P2_' : 'P1_';
  const jx = (held[k + 'R'] ? 1 : 0) - (held[k + 'L'] ? 1 : 0);
  const jy = (held[k + 'U'] ? 1 : 0) - (held[k + 'D'] ? 1 : 0);
  let mx = jy * sY + jx * cY;
  let mz = jy * cY - jx * sY;
  const m = hypot(mx, mz);
  if (m > 0) {
    mx /= m;
    mz /= m;
  }
  const I = f.ci;
  I.mx = mx;
  I.mz = mz;
  for (let n = 1; n <= 6; n++) I.p[n] = hit[k + n] ? 1 : 0;
  I.blk = held[k + '2'] ? 1 : 0;
  return I;
}

function cpuIn(f, o, dt) {
  const I = f.ci;
  I.p = [];
  f.ct -= dt;
  if (f.ct > 0 || phase !== 'fight') {
    if (phase !== 'fight') I.mx = I.mz = 0;
    return I;
  }
  f.ct = rr(0.09, 0.2) * f.lag;
  const dx = o.x - f.x;
  const dz = o.z - f.z;
  const d = hypot(dx, dz) || 1;
  const ux = dx / d;
  const uz = dz / d;
  const inc = PJ.find((p) => p.o !== f.i && hypot(p.x - f.x, p.z - f.z) < 5 && p.vx * (f.x - p.x) + p.vz * (f.z - p.z) > 0);
  const bomb = BM.find((b) => hypot(b.tx - f.x, b.tz - f.z) < 3) || LM.find((l) => hypot(l.x - f.x, l.z - f.z) < 1.8);
  const oAtk = (o.act === 1 && d < 2.6) || (o.act === 2 && d < 3.2) || (o.act === 5 && d < 3);
  I.blk = 0;
  let flee = 0;
  if (bomb) flee = 1;
  else if (inc && rnd() < f.skl) {
    const r = rnd();
    if (r < 0.35) I.p[5] = 1;
    else if (r < 0.8) I.blk = 1;
    else I.p[3] = 1;
  } else if (oAtk && rnd() < f.skl) {
    const r = rnd();
    if (o.act === 2) I.p[r < 0.5 ? 5 : 1] = 1;
    else if (r < 0.5) I.blk = 1;
    else if (r < 0.75) I.p[3] = 1;
    else I.p[1] = 1;
  } else if (o.blk && d < 2.4 && rnd() < 0.55) I.p[3] = 1;
  else if (f.item && rnd() < 0.3) {
    const it = f.item;
    if ((it === 1 && f.hp < 60) || (it === 2 && d > 3 && d < 9) || it === 3 || (it === 4 && f.mana < 1.5) || (it === 5 && d < 5)) I.p[6] = 1;
  } else if (f.mana >= 1 && d > 3.2 && rnd() < 0.3) I.p[4] = 1;
  else if (d < 2 && (o.stun > 0 || o.frz > 0 || rnd() < 0.8)) I.p[1] = 1;
  else if (d < 2 && rnd() < 0.25) I.blk = 1;
  if (I.blk) f.ct = rr(0.2, 0.4);
  let tx;
  let tz;
  const it = !f.item && IT.find((t) => t.st === 2 && hypot(t.x - f.x, t.z - f.z) < hypot(t.x - o.x, t.z - o.z) + 2);
  if (flee) {
    tx = f.x - ux * 3 + -uz * f.side * 3;
    tz = f.z - uz * 3 + ux * f.side * 3;
  } else if (it) {
    tx = it.x;
    tz = it.z;
  } else {
    const want = f.hp < 35 && f.mana >= 1 ? 6 : o.ko ? 3 : 1.5;
    tx = o.x - ux * want - uz * f.side * 1.3;
    tz = o.z - uz * want + ux * f.side * 1.3;
  }
  const r = hypot(f.x, f.z) || 1;
  if (r > rad(atan2(f.z, f.x)) - 2.4) {
    tx -= (f.x / r) * 4;
    tz -= (f.z / r) * 4;
  }
  const mx = tx - f.x;
  const mz = tz - f.z;
  const m = hypot(mx, mz);
  I.mx = m > 0.35 ? mx / m : 0;
  I.mz = m > 0.35 ? mz / m : 0;
  if (rnd() < 0.07) f.side = -f.side;
  return I;
}

// --- Combate ---

const ATD = [0.3, 0.3, 0.44];
const ATA = [[0.07, 0.16], [0.07, 0.16], [0.15, 0.25]];
const ATK = [7, 7, 12];
const ATB = [2.5, 2.5, 8];

function hurt(B, sx, sz, dmg, kb, hst, fl = 0) {
  if (B.ko || B.fall || B.inv > 0 || phase !== 'fight') return 0;
  const dx = B.x - sx;
  const dz = B.z - sz;
  const d = hypot(dx, dz) || 1;
  const ux = dx / d;
  const uz = dz / d;
  if (!(fl & 1) && B.blk && abs(angD(B.face, atan2(-ux, -uz))) < 1.5) {
    B.hp -= dmg * (fl & 2 ? 0.25 : 0.12);
    B.kx += ux * kb * 0.4;
    B.kz += uz * kb * 0.4;
    B.hs = 0.1;
    B.gt = 0.5;
    burst(B.x + sin(B.face) * 0.5, 1.1, B.z + cos(B.face) * 0.5, 12, 6, 0.3, 0.07, 0xfff0d0, 1 | 2);
    SFX.block();
    HSTOP = 0.04;
    if (B.hp <= 0) ko(B, 'K.O.');
    return 1;
  }
  if (B.frz > 0) {
    dmg *= 1.5;
    B.frz = 0;
    burst(B.x, 1, B.z, 30, 6, 0.8, 0.09, 0xc8f4ff, 2 | 8);
    SFX.shatter();
    ftxt(B.x, 2.4, B.z, '¡ROTO!', PC[19]);
  }
  B.hp -= dmg;
  B.gt = 0.6;
  B.kx += ux * kb;
  B.kz += uz * kb;
  if (fl & 4) B.vy = max(B.vy, 5.5);
  B.hs = max(B.hs, hst);
  if (B.act !== 5) B.act = 0;
  B.blk = 0;
  B.fl = 0.1;
  ftxt(B.x, 2.2, B.z, Math.round(dmg), PC[9]);
  burst(B.x, 1.1, B.z, 10 + dmg, 5, 0.4, 0.08, 0xffffff, 1 | 2 | 4);
  burst(B.x, 0.1, B.z, 8, 3, 0.6, 0.12, 0xe8ecf8, 2 | 8);
  HSTOP = min(0.13, 0.03 + dmg * 0.005);
  SHK = max(SHK, 0.15 + dmg * 0.02);
  SFX.hit(min(1.4, 0.6 + dmg / 15));
  if (B.hp <= 0) ko(B, 'K.O.');
  return 2;
}

function ko(B, s) {
  if (B.ko) return;
  B.hp = 0;
  B.ko = 1;
  B.act = 0;
  B.blk = 0;
  B.frz = 0;
  B.burn = 0;
  if (phase === 'fight') {
    phase = 'ko';
    PT = 0;
    IMP = 3;
    say(s, 2.2);
    SFX.ko();
  }
}

function startAtk(f, k) {
  f.act = 1;
  f.at = 0;
  f.cmb = k;
  f.hd = 0;
  f.q = 0;
  f.trail = [];
}

function melee(f, o) {
  const dx = o.x - f.x;
  const dz = o.z - f.z;
  const d = hypot(dx, dz);
  if (d > 2 || abs(o.y - f.y) > 1.4 || abs(angD(f.face, atan2(dx, dz))) > 1.35) return 0;
  return 1;
}

// Desvío: el escudo en sus primeras décimas detiene golpes y devuelve hechizos
const parrying = (o, sx, sz) => o.act === 2 && o.at < 0.17 && !o.ko && abs(angD(o.face, atan2(sx - o.x, sz - o.z))) < 1.6;

function doParry(o, f) {
  f.stun = 0.85;
  f.act = 0;
  o.act = 0;
  burst((o.x + f.x) / 2, 1.2, (o.z + f.z) / 2, 26, 8, 0.4, 0.07, 0xfff4c0, 1 | 2);
  SFX.parry();
  HSTOP = 0.14;
  IMP = 2;
  ftxt(o.x, 2.5, o.z, '¡DESVÍO!', PC[17]);
}

function cast(f, o) {
  const k = f.sp;
  f.sp = (f.sp + 1) % 3;
  f.mana -= 1;
  const sp = [14, 13, 8.5][k];
  const a = f.face;
  PJ.push({ x: f.x + sin(a) * 0.9, y: f.y + 1.1, z: f.z + cos(a) * 0.9, vx: sin(a) * sp, vz: cos(a) * sp, o: f.i, k, t: 0, r: k === 2 ? 0.65 : 0.45 });
  [SFX.ice, SFX.fire, SFX.slow][k]();
}

function useItem(f, o) {
  const it = f.item;
  f.item = 0;
  if (it === 1) {
    f.hp = min(100, f.hp + 30);
    burst(f.x, 1, f.z, 30, 2.5, 1, 0.07, 0xffb0a0, 1, 2);
    ftxt(f.x, 2.4, f.z, '+30', PC[13]);
    SFX.potion();
  } else if (it === 2) {
    let tx = o.x + o.vx * 0.5;
    let tz = o.z + o.vz * 0.5;
    const d = hypot(tx - f.x, tz - f.z);
    if (d > 10) {
      tx = f.x + ((tx - f.x) / d) * 10;
      tz = f.z + ((tz - f.z) / d) * 10;
    }
    const Tf = 0.9;
    BM.push({ x: f.x, y: f.y + 1.6, z: f.z, vx: (tx - f.x) / Tf, vz: (tz - f.z) / Tf, vy: (-1.6 + 0.5 * 20 * Tf * Tf) / Tf, o: f.i, tx, tz, t: 0 });
    SFX.swing();
  } else if (it === 3) {
    LM.push({ x: o.x, z: o.z, t: 0, o: f.i, tg: o });
    SFX.chime();
  } else if (it === 4) {
    f.mana = 3;
    f.rapid = 6;
    burst(f.x, 1, f.z, 30, 3, 1, 0.07, 0x9ff4ff, 1, 2);
    SFX.ice();
  } else if (it === 5) {
    const a = f.face;
    for (let i = 0; i < 70; i++) {
      const b = a + rr(-0.6, 0.6);
      const v = rr(10, 20);
      part(f.x + sin(a) * 0.6, rr(0.2, 1.8), f.z + cos(a) * 0.6, sin(b) * v, rr(-0.5, 1), cos(b) * v, rr(0.3, 0.6), rr(0.04, 0.09), 0xf4f6ff, i & 1 ? 0 : 4);
    }
    const dx = o.x - f.x;
    const dz = o.z - f.z;
    if (hypot(dx, dz) < 7.5 && abs(angD(a, atan2(dx, dz))) < 0.8) {
      const r = hurt(o, f.x, f.z, 4, 18, 0.5, 4);
      if (r === 1) {
        o.kx += sin(a) * 6;
        o.kz += cos(a) * 6;
      }
    }
    SFX.gust();
    SHK = 0.3;
  }
}

function boom(x, z, owner) {
  for (const f of FS) {
    const d = hypot(f.x - x, f.z - z);
    if (d < 2.8 && f.y < 2.5) hurt(f, x, z, 20 * (1 - d / 4), 13, 0.5, 2 | 4);
  }
  hitObs(x, z, 2.6, 3);
  burst(x, 0.6, z, 14, 2.5, 0.5, 0.5, 0xff8a30, 1 | 4 | 16, 1.5);
  burst(x, 0.5, z, 60, 9, 0.7, 0.12, 0xffc070, 1 | 4, 2);
  burst(x, 0.5, z, 30, 4, 1.6, 0.35, 0x3a3848, 32 | 4 | 16, 2);
  burst(x, 0.2, z, 40, 7, 1, 0.08, 0xe8ecf8, 2 | 8, 4);
  stamp(x, z, 2, 60, 56, 70, 0.75);
  FLASH = 60;
  SHK = 0.7;
  SFX.boom();
  owner;
}

function hitObs(x, z, r, dmg) {
  OB.forEach((o) => {
    if (!o.al || o.k || hypot(o.x - x, o.z - z) > o.r + r) return;
    o.hp -= dmg;
    burst(o.x, 1.2, o.z, 14, 4, 0.6, 0.08, 0xdfe8ff, 2 | 8);
    if (o.hp <= 0) {
      o.al = 0;
      burst(o.x, 1.2, o.z, 70, 6, 1.4, 0.12, 0xd8e2fa, 2 | 8, 3);
      burst(o.x, 0.4, o.z, 20, 2, 1.8, 0.4, 0xc0c8e0, 32 | 16 | 4);
      SFX.shatter();
      SHK = 0.35;
    }
  });
}

function blockedAt(x, z, y) {
  for (const o of OB) if (o.al && !o.k && y < 2.3 && hypot(o.x - x, o.z - z) < o.r) return o;
  return null;
}

function land(f) {
  burst(f.x, 0.05, f.z, 10, 2.5, 0.5, 0.1, 0xe4e8f6, 2 | 8, 1);
  SFX.land();
  if (f.act === 5) {
    f.act = 6;
    f.at = 0;
    const o = FS[1 - f.i];
    if (hypot(o.x - f.x, o.z - f.z) < 2.3 && o.y < 1) hurt(o, f.x, f.z, 11, 8, 0.4, 4);
    for (let i = 0; i < 24; i++) {
      const a = (i / 24) * TAU;
      part(f.x + cos(a) * 0.4, 0.1, f.z + sin(a) * 0.4, cos(a) * 7, 1, sin(a) * 7, 0.4, 0.12, 0xe8ecf8, 4 | 8);
    }
    stamp(f.x, f.z, 1, 150, 158, 196, 0.5);
    SHK = 0.4;
    SFX.bash();
  }
}

function respawn(f) {
  const o = FS[1 - f.i];
  const a = atan2(o.z, o.x) + PI;
  f.x = cos(a) * 3;
  f.z = sin(a) * 3;
  f.y = 11;
  f.vy = -6;
  f.vx = f.vz = f.kx = f.kz = 0;
  f.fall = 0;
  f.inv = 1.6;
  f.act = 0;
}

function upF(f, o, I, dt) {
  const sl = f.slow > 0 ? 0.62 : 1;
  const adt = dt * sl;
  f.fl = max(0, f.fl - dt);
  f.inv = max(0, f.inv - dt);
  f.slow = max(0, f.slow - dt);
  f.rapid = max(0, f.rapid - dt);
  f.gt -= dt;
  if (f.gt < 0) f.gh = max(f.hp, f.gh - 60 * dt);
  if (f.gh < f.hp) f.gh = f.hp;
  if (phase === 'fight') f.mana = min(3, f.mana + (dt / 3.2) * (f.rapid > 0 ? 3.5 : 1));
  if (f.burn > 0 && !f.ko) {
    f.burn -= dt;
    f.bt -= dt;
    if (f.bt <= 0) {
      f.bt = 0.5;
      if (phase === 'fight') {
        f.hp -= 3;
        f.gt = 0.5;
        ftxt(f.x, 2.2, f.z, 3, PC[16]);
        noise(0.12, 0.12, 900);
        if (f.hp <= 0) ko(f, 'K.O.');
      }
    }
    if (rnd() < 0.6) part(f.x + rr(-0.3, 0.3), f.y + rr(0.3, 1.6), f.z + rr(-0.3, 0.3), 0, rr(1.5, 3), 0, rr(0.3, 0.6), rr(0.08, 0.15), rnd() < 0.5 ? 0xff7a28 : 0xffc040, 1 | 16);
  }
  if (f.slow > 0 && rnd() < 0.3) {
    const a = rnd() * TAU;
    part(f.x + cos(a) * 0.6, f.y + 0.2, f.z + sin(a) * 0.6, -sin(a) * 2, 0.6, cos(a) * 2, 0.6, 0.06, 0x9a70ff, 1);
  }
  for (let n = 1; n <= 6; n++)
    if (I.p[n]) {
      f.bq = n;
      f.bqt = 0.18;
    }
  f.bqt -= dt;
  if (f.fall) {
    f.vy -= 20 * dt;
    f.y += f.vy * dt;
    f.x += f.kx * dt;
    f.z += f.kz * dt;
    if (f.y < -8 && f.fall === 1) {
      f.fall = 2;
      if (phase === 'fight') {
        f.hp -= 30;
        f.gt = 0.6;
        if (f.hp <= 0) {
          f.hp = 0;
          ko(f, '¡AL VACÍO!');
        } else {
          respawn(f);
          say('¡AL VACÍO! -30', 1.2);
        }
      } else if (!f.ko) respawn(f);
    }
    return;
  }
  if (f.ko) {
    f.kod = min(1, f.kod + dt * 3);
    f.blk = 0;
  }
  const busy = f.ko || f.frz > 0 || f.stun > 0 || f.hs > 0 || phase !== 'fight';
  f.frz = max(0, f.frz - dt);
  f.stun = max(0, f.stun - dt);
  f.hs = max(0, f.hs - dt);
  let onG = f.y <= groundH(f.x, f.z) + 0.01 && f.vy <= 0;
  if (!busy) {
    if (f.act) {
      f.at += adt;
      const a = f.act;
      const t = f.at;
      if (a === 1) {
        const [w0, w1] = ATA[f.cmb];
        if (t >= w0 && t < w1 && !f.hd && !o.ko && melee(f, o)) {
          f.hd = 1;
          if (parrying(o, f.x, f.z)) doParry(o, f);
          else hurt(o, f.x, f.z, ATK[f.cmb], ATB[f.cmb], f.cmb === 2 ? 0.42 : 0.3, f.cmb === 2 ? 4 : 0);
        }
        if (t >= w0 && t - adt < w0) SFX.swing();
        if (t > 0.08 && f.bqt > 0 && f.bq === 1) {
          f.q = 1;
          f.bqt = 0;
        }
        if (f.act === 1 && ((f.q && f.cmb < 2 && t >= w1 + 0.02) || t >= ATD[f.cmb])) {
          if (f.q && f.cmb < 2) startAtk(f, f.cmb + 1);
          else f.act = 0;
        }
      } else if (a === 2) {
        if (t > 0.16 && t < 0.36 && !f.hd && !o.ko) {
          const dx = o.x - f.x;
          const dz = o.z - f.z;
          if (hypot(dx, dz) < 1.45 && abs(angD(f.face, atan2(dx, dz))) < 1.1 && abs(o.y - f.y) < 1.2) {
            f.hd = 1;
            if (parrying(o, f.x, f.z)) {
              o.kx -= sin(f.face) * 6;
              f.kx -= sin(f.face) * 6;
              SFX.block();
            } else if (o.blk) {
              o.blk = 0;
              hurt(o, f.x, f.z, 6, 9, 0, 1);
              o.stun = 0.95;
              ftxt(o.x, 2.5, o.z, '¡ROTURA!', PC[13]);
              IMP = 2;
              SFX.bash();
            } else {
              hurt(o, f.x, f.z, 8, 9, 0.4, 0);
              SFX.bash();
            }
            f.at = max(f.at, 0.36);
          }
        }
        if (t > (f.hd ? 0.5 : 0.62)) f.act = 0;
      } else if (a === 3) {
        if (t >= 0.15 && t - adt < 0.15) cast(f, o);
        if (t > 0.32) f.act = 0;
      } else if (a === 4) {
        if (t >= 0.12 && t - adt < 0.12) useItem(f, o);
        if (t > 0.3) f.act = 0;
      } else if (a === 6 && t > 0.28) f.act = 0;
    }
    if (!f.act && f.bqt > 0) {
      const b = f.bq;
      if (b === 1) {
        if (onG) startAtk(f, 0);
        else {
          f.act = 5;
          f.at = 0;
          f.vy = -15;
          SFX.swing();
        }
      } else if (b === 3 && onG) {
        f.act = 2;
        f.at = 0;
        f.hd = 0;
      } else if (b === 4 && f.mana >= 1) {
        f.act = 3;
        f.at = 0;
      } else if (b === 5 && onG) {
        f.vy = 8.6;
        onG = false;
        burst(f.x, 0.05, f.z, 8, 2, 0.4, 0.1, 0xe4e8f6, 2 | 8, 1);
        SFX.jump();
        f.bqt = 0;
      } else if (b === 6 && f.item) {
        f.act = 4;
        f.at = 0;
      }
      if (f.act) f.bqt = 0;
    }
    f.blk = !f.act && onG && I.blk ? 1 : 0;
  } else {
    f.blk = 0;
    if (f.frz > 0 || f.stun > 0 || f.ko) f.act = f.act === 5 ? 5 : 0;
  }
  let sp = 5.3 * (f.slow > 0 ? 0.55 : 1);
  if (busy) sp = 0;
  else if (f.blk) sp *= 0.36;
  else if (f.act === 1) sp *= 0.22;
  else if (f.act === 3 || f.act === 4) sp *= 0.3;
  else if (f.act === 2 || f.act === 6) sp = 0;
  const ac = 1 - exp(-(onG ? 26 : 5) * dt);
  f.vx += (I.mx * sp - f.vx) * ac;
  f.vz += (I.mz * sp - f.vz) * ac;
  if (f.act === 2 && f.at > 0.16 && f.at < 0.36) {
    f.vx = sin(f.face) * 10;
    f.vz = cos(f.face) * 10;
    if (rnd() < 0.5) part(f.x, 0.1, f.z, rr(-1, 1), 1, rr(-1, 1), 0.4, 0.1, 0xe4e8f6, 2 | 8);
  }
  const kd = exp(-(onG ? 4.2 : 0.7) * dt);
  f.kx *= kd;
  f.kz *= kd;
  const ox = f.x;
  const oz = f.z;
  f.x += (f.vx + f.kx) * dt;
  f.z += (f.vz + f.kz) * dt;
  f.vy -= (f.act === 5 ? 50 : 26) * dt;
  f.y += f.vy * dt;
  const gh = groundH(f.x, f.z);
  if (f.y <= gh) {
    if (f.vy < -3) land(f);
    f.y = gh;
    f.vy = 0;
  }
  // choques con obstáculos y rebote contra penitentes
  for (const ob of OB) {
    if (!ob.al || (ob.k && f.y >= ob.h - 0.12)) continue;
    const dx = f.x - ob.x;
    const dz = f.z - ob.z;
    const d = hypot(dx, dz) || 1;
    const R = ob.r + 0.36;
    if (d < R) {
      f.x = ob.x + (dx / d) * R;
      f.z = ob.z + (dz / d) * R;
      const kv = hypot(f.kx, f.kz);
      if (kv > 7 && !ob.k) {
        f.kx *= -0.3;
        f.kz *= -0.3;
        hurt(f, ob.x, ob.z, 6, 0, 0.45, 1);
        f.stun = max(f.stun, 0.4);
        hitObs(ob.x, ob.z, 0.1, 2);
      }
    }
  }
  // borde de la meseta: solo se cae si te lanzan
  const r = hypot(f.x, f.z);
  const ra = atan2(f.z, f.x);
  const lim = rad(ra) - 0.45;
  const kv = hypot(f.kx, f.kz);
  if (r > lim) {
    if (kv > 5.5 || f.y > gh + 0.3 || f.ko) {
      if (r > lim + 0.65 && f.y < 0.4) {
        f.fall = 1;
        f.vy = min(f.vy, 0);
        if (kv < 3) {
          f.kx = (f.x / r) * 3;
          f.kz = (f.z / r) * 3;
        }
        burst(f.x, 0, f.z, 16, 3, 0.6, 0.1, 0xe4e8f6, 2, 1);
        SFX.fall();
      }
    } else {
      f.x = (f.x / r) * lim;
      f.z = (f.z / r) * lim;
    }
  }
  // mirar al rival
  if (!busy && f.act !== 2 && f.act !== 1) {
    const tgt = !o.ko && !o.fall ? atan2(o.x - f.x, o.z - f.z) : hypot(f.vx, f.vz) > 0.5 ? atan2(f.vx, f.vz) : f.face;
    f.face += cl(angD(f.face, tgt), -14 * dt, 14 * dt);
  } else if (f.act === 1 && f.at < 0.06 && !o.ko) f.face += cl(angD(f.face, atan2(o.x - f.x, o.z - f.z)), -8 * dt, 8 * dt);
  // animación
  const mv = hypot(f.x - ox, f.z - oz) / dt;
  f.mv = mix(f.mv, min(1, mv / 5), 0.2);
  const pw = f.wk;
  f.wk += mv * dt * 2.3;
  if (onG && floor(pw / PI) !== floor(f.wk / PI) && mv > 1) {
    const s = floor(f.wk / PI) & 1 ? 1 : -1;
    stamp(f.x + cos(f.face) * 0.14 * s, f.z - sin(f.face) * 0.14 * s, 0.11, 120, 128, 168, 0.55);
    if (!f.cpu) SFX.step();
    part(f.x, 0.05, f.z, rr(-0.5, 0.5), 0.8, rr(-0.5, 0.5), 0.35, 0.06, 0xe8ecf8, 2 | 8);
  }
  let ay = 0.25;
  let ap = -0.45 + sin(T * 2.2 + f.i) * 0.05;
  let lean = f.hs > 0 ? -0.25 : f.mv * 0.12;
  if (f.act === 1) {
    const [w0, w1] = ATA[f.cmb];
    const t = f.at;
    const k = cl((t - w0) / (w1 - w0), 0, 1);
    const e = k * k * (3 - 2 * k);
    if (f.cmb === 2) {
      ap = t < w0 ? mix(-0.6, -3, t / w0) : mix(-3, -0.35, e);
      ay = 0;
    } else {
      const s0 = f.cmb ? -1.2 : 1.6;
      ap = -1.45;
      ay = t < w0 ? mix(0.3, s0, t / w0) : mix(s0, -s0 * 0.85, e);
    }
    lean = 0.18 * e;
  } else if (f.act === 3) {
    ap = -1.55;
    ay = 0.05;
  } else if (f.act === 4) ap = mix(-2.8, -0.8, cl(f.at / 0.16, 0, 1));
  else if (f.act === 2) {
    ap = -0.7;
    lean = 0.3;
  } else if (f.act === 5) {
    ap = -2.6;
    ay = 0;
  }
  if (f.stun > 0) ay = sin(T * 9) * 0.6;
  if (phase === 'end' && f.i === winner) {
    ap = -3 + sin(T * 3) * 0.1;
    ay = 0;
    lean = -0.1;
  }
  if (f.frz <= 0) {
    const k = 1 - exp(-28 * dt);
    f.ay = mix(f.ay, ay, k);
    f.ap = mix(f.ap, ap, k);
    f.lean = mix(f.lean, lean, k);
    f.bk = mix(f.bk, f.blk ? 1 : f.act === 2 ? 1.4 : 0, 1 - exp(-30 * dt));
  }
}

// Construye las cajas del personaje y guarda la punta de la espada
function pose(f) {
  if (f.fall === 2 || (f.fall && f.y < -14)) return;
  if (f.inv > 0 && (T * 20) & 1) return;
  let m = ID.slice();
  m[9] = f.x;
  m[10] = f.y;
  m[11] = f.z;
  m = mR(m, 1, f.face);
  m = f.ko ? mR(m, 0, -f.kod * 1.45) : mR(m, 0, f.lean);
  const wh = f.fl > 0 ? 2 : 0;
  const c1 = wh ? 0xffffff : PCOL[f.i];
  const c2 = wh ? 0xffffff : PCOL2[f.i];
  const dk = wh ? 0xffffff : f.frz > 0 ? 0x6080a0 : DK;
  const air = f.y > groundH(f.x, f.z) + 0.05 && !f.ko;
  const sw = sin(f.wk) * 0.75 * f.mv;
  box(mR(mTr(m, -0.13, 0.84, 0), 0, air ? -0.7 : sw), 0, -0.42, 0, 0.085, 0.42, 0.1, dk, wh);
  box(mR(mTr(m, 0.13, 0.84, 0), 0, air ? 0.4 : -sw), 0, -0.42, 0, 0.085, 0.42, 0.1, dk, wh);
  box(m, 0, 0.8, -0.02, 0.27, 0.3, 0.21, c1, wh);
  box(m, 0, 1.22, 0, 0.22, 0.2, 0.15, dk, wh);
  box(m, 0, 1.44, 0, 0.21, 0.05, 0.17, c2, wh);
  box(m, 0, 1.63, 0.01, 0.15, 0.15, 0.15, dk, wh);
  box(m, 0, 1.8, -0.04, 0.11, 0.05, 0.11, c1, wh);
  box(mR(mTr(m, 0.1, 1.42, -0.14), 0, 0.5 + 0.35 * sin(T * 11 + f.i)), 0, 0, -0.22, 0.06, 0.025, 0.22, c2, wh);
  let a = mR(mR(mTr(m, 0.3, 1.38, 0), 1, f.ay), 0, f.ap);
  box(a, 0, -0.22, 0, 0.065, 0.22, 0.065, dk, wh);
  box(a, 0, -0.46, 0, 0.12, 0.025, 0.045, dk, wh);
  box(a, 0, -0.98, 0, 0.022, 0.52, 0.06, wh ? 0xffffff : 0xdfe4f2, f.act === 3 ? 2 : wh);
  const tip = mPt(a, 0, -1.5, 0);
  const hand = mPt(a, 0, -0.5, 0);
  if (f.act === 1 || f.act === 5) {
    f.trail.unshift([hand, tip]);
    if (f.trail.length > 6) f.trail.pop();
  } else f.trail = [];
  f.tip = tip;
  const bk = f.bk;
  const s = mR(mTr(m, mix(-0.4, 0, min(1, bk)), mix(0.95, 1.12, min(1, bk)), mix(0.04, 0.45, bk)), 1, mix(-PI / 2, 0, min(1, bk)));
  box(mR(mR(mTr(m, -0.3, 1.38, 0), 0, mix(-0.2, -1.2, min(1, bk))), 1, mix(0, -0.5, min(1, bk))), 0, -0.2, 0, 0.065, 0.2, 0.065, dk, wh);
  box(s, 0, 0, 0, 0.25, 0.3, 0.045, wh ? 0xffffff : f.act === 2 && f.at < 0.17 ? 0xfff6d8 : 0xe8c4a8, wh || (f.act === 2 && f.at < 0.17) ? 2 : 0);
  box(s, 0, 0, 0.05, 0.08, 0.08, 0.03, c1, wh);
  if (f.frz > 0) box(mTr(ID, f.x, f.y, f.z), 0, 0.95, 0, 0.5, 1.02, 0.5, 0xc8f2ff, 1);
}

function itemBoxes(t) {
  let m = mR(ID, 1, T * 2);
  m[9] = t.x;
  m[10] = t.y + 0.45 + (t.st === 2 ? sin(T * 3 + t.x) * 0.1 : 0);
  m[11] = t.z;
  const c = ITC[t.k];
  if (t.k === 1) {
    box(m, 0, 0, 0, 0.13, 0.18, 0.13, c, 2);
    box(m, 0, 0.24, 0, 0.06, 0.07, 0.06, 0xc89070);
  } else if (t.k === 2) {
    box(mR(m, 0, 0.6), 0, 0, 0, 0.2, 0.2, 0.2, c);
    box(m, 0, 0.26, 0, 0.03, 0.08, 0.03, 0xffa040, 2);
  } else if (t.k === 3) box(mR(m, 2, 0.4), 0, 0, 0, 0.06, 0.26, 0.16, c, 2);
  else if (t.k === 4) {
    box(mR(m, 0, PI / 4), 0, 0, 0, 0.12, 0.12, 0.12, c, 2);
    box(mR(m, 2, PI / 4), 0, 0, 0, 0.09, 0.2, 0.09, 0xb9a2ff, 2);
  } else {
    box(mR(m, 2, T * 6), 0, 0, 0, 0.26, 0.04, 0.04, c, 2);
    box(mR(m, 2, T * 6 + PI / 2), 0, 0, 0, 0.26, 0.04, 0.04, c, 2);
  }
}

// --- Paso de simulación ---

function step(dt) {
  T += dt;
  WX += dt * 0.6;
  if (msgT > 0) msgT -= dt;
  if (IMP > 0) IMP--;
  FLASH *= 0.8;
  SHK = max(0, SHK - dt * 1.6);
  if (WG) {
    WG.gain.value = 0.035 + 0.025 * sin(T * 0.37) * sin(T * 0.13);
    WF.frequency.value = 330 + 120 * sin(T * 0.21);
  }
  if (mode === 'title' || phase === 'end') {
    if (hit.START1 || (phase === 'end' && PT > 1.5 && hit.P1_1)) {
      if (phase === 'end' && mode === 'solo' && winner === 0) newMatch('solo');
      else if (phase === 'end' && mode === 'vs') newMatch('vs');
      else {
        lvl = 0;
        streak = 0;
        newMatch('solo');
      }
      SFX.ui();
      return;
    }
    if (hit.START2 || (phase === 'end' && PT > 1.5 && hit.P2_1)) {
      lvl = 0;
      newMatch('vs');
      SFX.ui();
      return;
    }
  }
  PT += dt;
  if (HSTOP > 0) {
    HSTOP -= dt;
    stepParts(dt * 0.25);
    return;
  }
  if (phase === 'intro' && PT > (mode === 'title' ? 0.6 : 2.3)) {
    phase = 'fight';
    PT = 0;
    if (mode !== 'title') say('¡A PELEAR!', 0.9);
  }
  if (phase === 'fight') {
    TM -= dt;
    if (TM <= 0) {
      TM = 0;
      const [a, b] = FS;
      if (a.hp !== b.hp) ko(a.hp < b.hp ? a : b, 'TIEMPO');
      else {
        phase = 'ko';
        PT = 0;
        say('EMPATE', 2);
      }
    }
  }
  if (phase === 'ko') {
    TSC = PT < 0.35 ? 0.3 : 1;
    if (PT > 2.4) {
      const l = FS.find((f) => f.ko);
      const w = l ? FS[1 - l.i] : null;
      if (w) w.w++;
      if (w && w.w >= 2) {
        winner = w.i;
        phase = 'end';
        PT = 0;
        if (mode === 'solo') {
          if (winner === 0) {
            streak++;
            lvl++;
            if (streak > best) {
              best = streak;
              saveBest();
            }
          }
        }
        if (mode === 'title') newMatch('title');
        else (winner === 0 || mode === 'vs' ? SFX.potion : SFX.fall)();
      } else newRound();
      return;
    }
  }
  if (phase === 'end') {
    TSC = 1;
    if (PT > 25) {
      lvl = 0;
      newMatch('title');
    }
  }
  // luchadores
  const [A, B] = FS;
  const IA = A.cpu ? cpuIn(A, B, dt) : humIn(A);
  const IB = B.cpu ? cpuIn(B, A, dt) : humIn(B);
  upF(A, B, IA, dt);
  upF(B, A, IB, dt);
  // empuje entre luchadores
  const dx = B.x - A.x;
  const dz = B.z - A.z;
  const d = hypot(dx, dz);
  if (d < 0.8 && d > 0.001 && !A.fall && !B.fall && abs(A.y - B.y) < 1.5) {
    const p = (0.8 - d) / 2;
    A.x -= (dx / d) * p;
    A.z -= (dz / d) * p;
    B.x += (dx / d) * p;
    B.z += (dz / d) * p;
  }
  // hechizos
  for (const p of PJ) {
    p.t += dt;
    const tg = FS[1 - p.o];
    const want = atan2(tg.x - p.x, tg.z - p.z);
    const cur = atan2(p.vx, p.vz);
    const sp = hypot(p.vx, p.vz);
    const na = cur + cl(angD(cur, want), -[1.4, 1.2, 2.6][p.k] * dt, [1.4, 1.2, 2.6][p.k] * dt);
    p.vx = sin(na) * sp;
    p.vz = cos(na) * sp;
    p.x += p.vx * dt;
    p.z += p.vz * dt;
    const c = SPC[p.k];
    part(p.x, p.y, p.z, rr(-0.5, 0.5), rr(-0.3, 0.8), rr(-0.5, 0.5), 0.35, p.r * 0.5, c, 1 | 16);
    let end = p.t > 2.2 || hypot(p.x, p.z) > 17;
    const ob = blockedAt(p.x, p.z, p.y);
    if (ob) {
      hitObs(p.x, p.z, 0.2, p.k === 1 ? 2 : 1);
      end = 1;
    }
    for (const f of FS) {
      if (end || f.i === p.o || f.ko || f.fall) continue;
      if (hypot(f.x - p.x, f.z - p.z) < p.r + 0.35 && p.y > f.y - 0.2 && p.y < f.y + 1.9) {
        if (parrying(f, p.x, p.z)) {
          p.o = f.i;
          p.vx = -p.vx * 1.25;
          p.vz = -p.vz * 1.25;
          p.t = 0;
          SFX.parry();
          HSTOP = 0.08;
          ftxt(f.x, 2.5, f.z, '¡DEVUELTO!', PC[17]);
          f.act = 0;
          continue;
        }
        const r = hurt(f, p.x - p.vx, p.z - p.vz, [6, 5, 4][p.k], 3, 0.25, 2);
        if (r === 2) {
          if (p.k === 0) {
            f.frz = 1.15;
            f.act = 0;
            SFX.freeze();
            ftxt(f.x, 2.6, f.z, 'CONGELADO', PC[19]);
          } else if (p.k === 1) {
            f.burn = 3;
            f.bt = 0.5;
            ftxt(f.x, 2.6, f.z, 'QUEMADO', PC[16]);
          } else {
            f.slow = 4;
            ftxt(f.x, 2.6, f.z, 'LENTO', PC[21]);
          }
        }
        end = 1;
      }
    }
    for (const q of PJ) {
      if (!end && q !== p && q.o !== p.o && !q.dead && hypot(q.x - p.x, q.z - p.z) < p.r + q.r) {
        q.dead = 1;
        end = 1;
        burst(p.x, p.y, p.z, 30, 6, 0.5, 0.1, 0xffffff, 1 | 4);
        SFX.shatter();
      }
    }
    if (end) {
      p.dead = 1;
      burst(p.x, p.y, p.z, 26, 5, 0.6, 0.09, c, 1 | 2 | 4);
      if (p.k === 0) stamp(p.x, p.z, 1, 236, 246, 255, 0.7);
      if (p.k === 1) {
        stamp(p.x, p.z, 0.9, 74, 66, 80, 0.6);
        if (onPlat(p.x, p.z)) FP.push({ x: p.x, z: p.z, t: 2.4, tk: 0 });
      }
      if (p.k === 2 && onPlat(p.x, p.z)) SF.push({ x: p.x, z: p.z, t: 3.5 });
    }
  }
  PJ = PJ.filter((p) => !p.dead);
  // bombas
  for (const b of BM) {
    b.t += dt;
    b.vy -= 20 * dt;
    b.x += b.vx * dt;
    b.y += b.vy * dt;
    b.z += b.vz * dt;
    part(b.x, b.y + 0.3, b.z, 0, 1, 0, 0.3, 0.06, 0xffb040, 1);
    if (b.y < groundH(b.x, b.z) + 0.2 || blockedAt(b.x, b.z, b.y)) {
      b.dead = 1;
      if (onPlat(b.x, b.z) || b.y > -1) boom(b.x, b.z, b.o);
    }
  }
  BM = BM.filter((b) => !b.dead);
  // rayos marcados
  for (const l of LM) {
    l.t += dt;
    if (l.t < 0.5 && !l.tg.fall) {
      l.x = mix(l.x, l.tg.x, 0.15);
      l.z = mix(l.z, l.tg.z, 0.15);
    }
    if (l.t >= 1 && !l.dead) {
      l.dead = 1;
      for (const f of FS) if (f.i !== l.o && hypot(f.x - l.x, f.z - l.z) < 1.4) {
        if (hurt(f, l.x, l.z, 20, 4, 0.7, 1) === 2) f.stun = 0.7;
      }
      hitObs(l.x, l.z, 1, 4);
      const pts = [];
      let x = l.x;
      let z = l.z;
      for (let y = 22; y > 0; y -= 1.4) {
        pts.push([x, y, z]);
        x = l.x + rr(-1.4, 1.4) * (y / 22) ** 0.7;
        z = l.z + rr(-1.4, 1.4) * (y / 22) ** 0.7;
      }
      pts.push([l.x, 0, l.z]);
      BOLT.push({ pts, t: 0.3, x: l.x, z: l.z });
      burst(l.x, 0.3, l.z, 40, 7, 0.6, 0.08, 0xfff4b0, 1 | 2 | 4, 2);
      stamp(l.x, l.z, 1.1, 64, 60, 76, 0.7);
      FLASH = 34;
      SHK = 0.5;
      SFX.thunder();
    }
  }
  LM = LM.filter((l) => !l.dead);
  for (const b of BOLT) b.t -= dt;
  BOLT = BOLT.filter((b) => b.t > 0);
  // fuego en el suelo y campos lentos
  for (const p of FP) {
    p.t -= dt;
    p.tk -= dt;
    if (rnd() < 0.8) part(p.x + rr(-0.7, 0.7), 0.1, p.z + rr(-0.7, 0.7), 0, rr(1.5, 3.2), 0, rr(0.3, 0.7), rr(0.1, 0.2), rnd() < 0.5 ? 0xff6a20 : 0xffb848, 1 | 16);
    if (p.tk <= 0) {
      p.tk = 0.35;
      for (const f of FS)
        if (hypot(f.x - p.x, f.z - p.z) < 1.15 && f.y < 0.5 && hurt(f, p.x, p.z, 3, 0, 0, 1) === 2) {
          f.burn = max(f.burn, 1.5);
          f.bt = max(f.bt, 0.3);
        }
    }
  }
  FP = FP.filter((p) => p.t > 0);
  for (const s of SF) {
    s.t -= dt;
    if (rnd() < 0.5) {
      const a = rnd() * TAU;
      const r = rr(0, 2.2);
      part(s.x + cos(a) * r, 0.1, s.z + sin(a) * r, 0, rr(0.3, 1), 0, 0.8, 0.06, 0x9a70ff, 1);
    }
    for (const f of FS) if (hypot(f.x - s.x, f.z - s.z) < 2.2 && f.y < 0.6) f.slow = max(f.slow, 0.5);
  }
  SF = SF.filter((s) => s.t > 0);
  // objetos que caen del cielo
  if (phase === 'fight') {
    itT -= dt;
    if (itT <= 0 && IT.length < 2) {
      itT = rr(5, 8);
      for (let n = 0; n < 30; n++) {
        const a = rnd() * TAU;
        const r = rr(1, rad(a) - 3);
        const x = cos(a) * r;
        const z = sin(a) * r;
        if (OB.some((o) => o.al && hypot(o.x - x, o.z - z) < o.r + 0.9)) continue;
        IT.push({ x, z, y: 16, vy: 0, k: 1 + ((rnd() * 5) | 0), st: 0, t: 0 });
        SFX.chime();
        break;
      }
    }
  }
  for (const t of IT) {
    t.t += dt;
    if (t.st === 0 && t.t > 1.1) t.st = 1;
    if (t.st === 1) {
      t.vy -= 30 * dt;
      t.y += t.vy * dt;
      const g = groundH(t.x, t.z);
      if (t.y <= g) {
        t.y = g;
        t.st = 2;
        t.t = 0;
        burst(t.x, 0.1, t.z, 18, 3, 0.6, 0.1, 0xe8ecf8, 2 | 8, 2);
        SFX.land();
      }
    }
    if (t.st === 2) {
      if (t.t > 14) t.dead = 1;
      for (const f of FS)
        if (!t.dead && !f.item && !f.ko && !f.fall && hypot(f.x - t.x, f.z - t.z) < 1 && f.y < t.y + 0.8) {
          f.item = t.k;
          t.dead = 1;
          ftxt(f.x, 2.4, f.z, ITN[t.k], ITI[t.k]);
          SFX.pick();
        }
    }
  }
  IT = IT.filter((t) => !t.dead);
  // cóndor
  condT -= dt;
  if (condT <= 0 && !COND) {
    const a = rnd() * TAU;
    COND = { x: cos(a) * 26, z: sin(a) * 26, a: a + PI + rr(-0.4, 0.4), t: 0 };
    SFX.condor();
  }
  if (COND) {
    COND.t += dt;
    COND.x += cos(COND.a) * 7 * dt;
    COND.z += sin(COND.a) * 7 * dt;
    if (COND.t > 8) {
      COND = null;
      condT = rr(20, 35);
    }
  }
  for (const t of FT) t.t -= dt;
  FT = FT.filter((t) => t.t > 0);
  stepParts(dt);
  // cámara
  camStep(dt);
}

function camStep(dt) {
  const [a, b] = FS;
  let tx;
  let tz;
  let d;
  let yw;
  let pt;
  const px = (f) => (f.fall ? cl(f.x, -12, 12) : f.x);
  const pz = (f) => (f.fall ? cl(f.z, -12, 12) : f.z);
  if (mode === 'title') {
    tx = 0;
    tz = 0;
    d = 26;
    yw = T * 0.035;
    pt = 0.78;
  } else {
    tx = (px(a) + px(b)) / 2;
    tz = (pz(a) + pz(b)) / 2;
    const dx = px(b) - px(a);
    const dz = pz(b) - pz(a);
    const s1 = abs(dx * cY - dz * sY);
    const s2 = abs(dx * sY + dz * cY);
    d = cl(6.5 + max(s1 * 1.05, s2 * 1.55), 10, 23);
    yw = 0.14 * sin(T * 0.06);
    pt = 0.98;
    if (phase === 'ko' && PT < 0.6) {
      const l = FS.find((f) => f.ko) || a;
      tx = mix(tx, px(l), 0.6);
      tz = mix(tz, pz(l), 0.6);
      d = 8.5;
    }
    if (phase === 'end') {
      const w = FS[winner];
      tx = w.x;
      tz = w.z;
      d = 8;
      yw = T * 0.15;
      pt = 0.75;
    }
    tz += 0.6;
  }
  const k = 1 - exp(-4 * dt);
  CAM.x += (tx - CAM.x) * k;
  CAM.z += (tz - CAM.z) * k;
  CAM.d += (d - CAM.d) * (1 - exp(-(phase === 'intro' ? 1.6 : 2.6) * dt));
  CAM.yw += angD(CAM.yw, yw) * (1 - exp(-2 * dt));
  CAM.pt += (pt - CAM.pt) * (1 - exp(-1.5 * dt));
}

// --- Dibujo ---

function render() {
  const sh = SHK * SHK * 0.6;
  setCam(CAM.x + rr(-sh, sh), CAM.z + rr(-sh, sh), 0.9, CAM.d, CAM.yw, CAM.pt);
  SM.fill(0);
  nB = 0;
  for (const f of FS) pose(f);
  for (const t of IT) if (t.st) itemBoxes(t);
  for (const b of BM) {
    const m = mR(mTr(ID, b.x, b.y, b.z), 0, b.t * 9);
    box(m, 0, 0, 0, 0.18, 0.18, 0.18, 0x30303c);
  }
  // sombras: obstáculos, cajas, nubes y cóndor
  shadowMesh(OBM);
  drawBoxes(1);
  if (COND) condor(1);
  floorPass();
  // luces sobre la nieve
  for (const p of PJ) glow(p.x, p.z, p.k === 2 ? 2.4 : 1.8, sc3(SPC[p.k], 0.5));
  for (const p of FP) glow(p.x, p.z, 1.8, sc3(0xff7020, 0.4 + 0.1 * sin(T * 30 + p.x)));
  for (const s of SF) glow(s.x, s.z, 2.4, sc3(0x7a50ff, 0.32 * min(1, s.t)));
  for (const t of IT) if (t.st === 2) glow(t.x, t.z, 0.9, sc3(ITC[t.k] === 0x30303c ? 0xff9040 : ITC[t.k], 0.35));
  for (const l of LM) glow(l.x, l.z, 1.4, sc3(0xfff080, ((T * 8) & 1 ? 0.5 : 0.25) * (0.4 + l.t)));
  for (const b of BOLT) glow(b.x, b.z, 3.2, sc3(0xfff0c0, b.t * 1.6));
  for (const f of FS) {
    if (f.burn > 0 && !f.fall) glow(f.x, f.z, 1.6, sc3(0xff7020, 0.3));
    if (f.act === 3 || (f.act === 2 && f.at < 0.17)) glow(f.x, f.z, 1.4, f.act === 3 ? sc3(SPC[f.sp], 0.3) : 0x504030);
  }
  drawMesh(WALL);
  drawMesh(OBM);
  drawBoxes(0);
  // estelas de espada
  for (const f of FS) {
    const tr = f.trail;
    for (let i = 0; i + 1 < tr.length; i++) {
      const [h0, t0] = tr[i];
      const [h1, t1] = tr[i + 1];
      if (!P(h0[0], h0[1], h0[2])) continue;
      const a = [_x, _y, _z];
      if (!P(t0[0], t0[1], t0[2])) continue;
      const b = [_x, _y, _z];
      if (!P(t1[0], t1[1], t1[2])) continue;
      const c = [_x, _y, _z];
      if (!P(h1[0], h1[1], h1[2])) continue;
      const k = (1 - i / tr.length) * 0.75;
      const col = sc3(f.cmb === 2 ? 0xfff0c0 : 0xd8e4ff, k);
      const col2 = sc3(col, 0.3);
      tri(a[0], a[1], a[2] + 0.02, b[0], b[1], b[2] + 0.02, c[0], c[1], c[2] + 0.02, col2, col, col, 1);
      tri(a[0], a[1], a[2] + 0.02, c[0], c[1], c[2] + 0.02, _x, _y, _z + 0.02, col2, col, col2, 1);
    }
  }
  // hechizos
  for (const p of PJ) {
    if (!P(p.x, p.y, p.z)) continue;
    const s = p.r * F * _z;
    dot(_x, _y, _z + 0.05, s * 3.2, sc3(SPC[p.k], 0.45), 1);
    dot(_x, _y, _z + 0.05, s * 1.5, SPC[p.k], 1);
    dot(_x, _y, _z + 0.05, s * 0.8, 0xffffff, 1);
  }
  // ojos que brillan bajo la capucha
  for (const f of FS) {
    if (f.fall === 2 || f.ko) continue;
    const fx = sin(f.face);
    const fz = cos(f.face);
    for (const s of [-1, 1]) {
      if (P(f.x + fx * 0.17 + fz * 0.06 * s, f.y + 1.65, f.z + fz * 0.17 - fx * 0.06 * s)) dot(_x, _y, _z, 1, f.frz > 0 ? 0x8ff0ff : PCOL2[f.i], 1);
    }
    if (f.act === 3 && f.tip && P(f.tip[0], f.tip[1], f.tip[2])) dot(_x, _y, _z + 0.1, 0.5 * F * _z, SPC[f.sp], 1);
    if (f.stun > 0)
      for (let i = 0; i < 3; i++) {
        const a = T * 6 + (i * TAU) / 3;
        if (P(f.x + cos(a) * 0.35, f.y + 2.05, f.z + sin(a) * 0.35)) dot(_x, _y, _z, 2, 0xfff0b0, 1);
      }
  }
  // rayos y marcas
  for (const l of LM) {
    if ((T * 10) & 1)
      for (let i = 0; i < 16; i++) {
        const a = (i / 16) * TAU;
        if (P(l.x + cos(a) * 1.3, 0.05, l.z + sin(a) * 1.3)) dot(_x, _y, _z + 0.05, 1.5, 0xfff080, 1);
      }
  }
  for (const b of BOLT)
    for (let i = 0; i + 1 < b.pts.length; i++) {
      const [x0, y0, z0] = b.pts[i];
      const [x1, y1, z1] = b.pts[i + 1];
      line3(x0, y0, z0, x1, y1, z1, sc3(0xb8a0ff, min(1, b.t * 4) * 0.5), 7);
      line3(x0, y0, z0, x1, y1, z1, sc3(0xfff6d0, min(1, b.t * 5)), 3);
      line3(x0, y0, z0, x1, y1, z1, 0xffffff, 1);
    }
  // columnas de luz donde va a caer un objeto
  for (const t of IT) {
    if (t.st === 2) continue;
    const k = t.st === 0 ? min(1, t.t * 1.5) : 1;
    if (!P(t.x, 0, t.z)) continue;
    const bx = _x;
    const by = _y;
    const bz = _z;
    if (!P(t.x, 24, t.z)) continue;
    const w0 = 0.2 * F * bz;
    const w1 = 0.05 * F * _z;
    const c = sc3(ITC[t.k] === 0x30303c ? 0xffa060 : ITC[t.k], 0.3 * k);
    tri(bx - w0, by, bz + 0.05, bx + w0, by, bz + 0.05, _x + w1, _y, _z, c, c, 0, 1);
    tri(bx - w0, by, bz + 0.05, _x + w1, _y, _z, _x - w1, _y, _z, c, 0, 0, 1);
    tri(bx - w0 * 0.3, by, bz + 0.05, bx + w0 * 0.3, by, bz + 0.05, _x, _y, _z, c, c, 0, 1);
  }
  drawParts();
  snow(0, CAM.x, CAM.z);
  if (COND) condor(0);
  const fd = phase === 'boot' ? 16 : FD;
  present(FLASH, fd, IMP > 0);
  overlay();
}

// Cóndor: una silueta enorme que cruza entre la cámara y la meseta
function condor(sh) {
  const c = COND;
  const y = 5.4 + sin(c.t * 0.7) * 0.4;
  const fx = cos(c.a);
  const fz = sin(c.a);
  const rx = -fz;
  const rz = fx;
  const fl = sin(c.t * 2.2) * 0.7;
  const pts = [
    [0, 0, 1.5],
    [0, 0, -1.3],
    [1.6, fl * 0.4, 0.35],
    [4.4, fl, 0],
    [4.2, fl, -0.35],
    [4, fl, -0.7],
    [3.7, fl, -1.1],
    [1.1, 0.1, -0.9],
    [5.6, fl * 1.15, -0.25],
    [5.4, fl * 1.15, -0.7],
    [5, fl * 1.1, -1.15],
  ];
  const tris = [[0, 2, 7], [0, 7, 1], [2, 3, 6], [2, 6, 7], [3, 4, 8], [4, 5, 9], [5, 6, 10]];
  for (const s of [-1, 1]) {
    const W = pts.map(([a, h, b]) => [c.x + (rx * a * s + fx * b) * 0.55, y + h * 0.55, c.z + (rz * a * s + fz * b) * 0.55]);
    for (const [p, q, r] of tris) {
      const S = [p, q, r].map((i) => {
        const [x, yy, z] = W[i];
        return sh ? P(x - (LX / LY) * yy, 0, z - (LZ / LY) * yy) && [_x, _y, _z] : P(x, yy, z) && [_x, _y, _z];
      });
      if (!S[0] || !S[1] || !S[2]) continue;
      if (sh) stri(S[0][0], S[0][1], S[1][0], S[1][1], S[2][0], S[2][1], 1);
      else {
        const col = p === 2 && q === 6 ? 0xc4c8d6 : 0x1c1e28;
        tri(S[0][0], S[0][1], S[0][2], S[1][0], S[1][1], S[1][2], S[2][0], S[2][1], S[2][2], col, col, col, 0);
      }
    }
  }
}

// --- Interfaz sobre el tramado ---

function overlay() {
  for (const t of FT) {
    if (P(t.x, t.y + (0.9 - t.t) * 1.2, t.z)) txt(t.s, _x, _y, t.c, 1, 1, 0.5);
  }
  LB = mix(LB, phase === 'fight' && mode !== 'title' ? 0 : 22, 0.08);
  if (LB > 0.5) {
    fill(0, 0, FW, LB, PC[0]);
    fill(0, FH - LB, FW, LB + 1, PC[0]);
  }
  const blink = (T * 2.2) & 1;
  if (mode === 'title') {
    txt('PENITENTES', FW / 2, 50, PC[14], 4, 9, 0.5);
    txt('DUELO EN LA ALTA CORDILLERA', FW / 2, 106, PC[8], 1, 2, 0.5);
    if (blink) {
      txt('START 1 · UN JUGADOR', FW / 2, 196, PC[9], 1, 2, 0.5);
      txt('START 2 · DOS JUGADORES', FW / 2, 214, PC[9], 1, 2, 0.5);
    }
    txt('1 ATACAR   2 DEFENDER   3 ESCUDO/DESVÍO', FW / 2, 246, PC[7], 1, 1, 0.5);
    txt('4 HECHIZO  5 SALTAR     6 USAR OBJETO', FW / 2, 256, PC[7], 1, 1, 0.5);
    if (best) txt('RÉCORD CONTRA LA MÁQUINA: ' + best, FW / 2, 285, PC[13], 1, 1, 0.5);
    return;
  }
  // barras de vida, maná, hechizo y objeto
  for (const f of FS) {
    const L = !f.i;
    const w = 150;
    const x0 = L ? 10 : FW - 10 - w;
    const y0 = 12;
    txt(f.i ? (mode === 'solo' ? 'CPU ' + f.lv : 'J2') : 'J1', L ? x0 : x0 + w, y0 - 8, PCI[f.i], 1, 1, L ? 0 : 1);
    for (let k = 0; k < 2; k++) fill(L ? x0 + w - 6 - k * 6 : x0 + 2 + k * 6, y0 - 7, 4, 4, f.w > k ? PC[17] : PC[3]);
    fill(x0 - 1, y0 - 1, w + 2, 7, PC[0]);
    const hw = ((w * max(0, f.hp)) / 100) | 0;
    const gw = ((w * max(0, f.gh)) / 100) | 0;
    fill(L ? x0 : x0 + w - gw, y0, gw, 5, PC[9]);
    fill(L ? x0 : x0 + w - hw, y0, hw, 5, f.hp < 25 && blink ? PC[17] : PCI[f.i]);
    fill(L ? x0 : x0 + w - hw, y0, hw, 1, PC[14]);
    for (let k = 0; k < 3; k++) {
      const x = L ? x0 + k * 9 : x0 + w - 7 - k * 9;
      const full = f.mana >= k + 1;
      const part_ = cl(f.mana - k, 0, 1);
      fill(x, y0 + 9, 7, 4, PC[2]);
      fill(x, y0 + 9, (7 * part_) | 0, 4, full ? SPI[f.sp] : PC[5]);
    }
    txt(SPN[f.sp], L ? x0 + 30 : x0 + w - 30, y0 + 9, SPI[f.sp], 1, 1, L ? 0 : 1);
    if (f.item) txt(ITN[f.item], L ? x0 + 64 : x0 + w - 64, y0 + 9, ITI[f.item], 1, 1, L ? 0 : 1);
  }
  txt(ceil(TM), FW / 2, 6, TM < 10 && blink ? PC[15] : PC[9], 2, 3, 0.5);
  if (phase === 'intro' && PT > 0.3) txt('RONDA ' + RND, FW / 2, 120, PC[14], 3, 6, 0.5);
  if (phase === 'intro' && RND === 1) txt('1 ATACAR · 2 DEFENDER · 3 ESCUDO · 4 HECHIZO · 5 SALTAR · 6 OBJETO', FW / 2, FH - 14, PC[7], 1, 1, 0.5);
  if (msgT > 0) txt(msg, FW / 2, 120, msg === '¡A PELEAR!' ? PC[9] : PC[17], 3, 6, 0.5);
  if (phase === 'end') {
    const w = winner;
    const s = mode === 'solo' ? (w === 0 ? '¡GANASTE!' : 'PERDISTE') : w ? 'GANA J2' : 'GANA J1';
    txt(s, FW / 2, 60, PCI[w], 3, 7, 0.5);
    if (mode === 'solo') txt(w === 0 ? 'RACHA ' + streak + ' · RÉCORD ' + best : 'RACHA FINAL ' + streak + ' · RÉCORD ' + best, FW / 2, 108, PC[8], 1, 2, 0.5);
    if (PT > 1.5 && blink) txt(mode === 'solo' && w === 0 ? 'START 1 · SIGUIENTE RIVAL' : 'START 1 · OTRA VEZ', FW / 2, 250, PC[9], 1, 2, 0.5);
  }
}

// --- Carga: el mundo se genera de verdad mientras se ve el progreso ---

const TASKS = [];
TASKS.push(['PALETA', () => buildLut()]);
for (let i = 0; i < 32; i++) TASKS.push(['NIEVE', () => genSnow(i * 32, i * 32 + 32)]);
for (let i = 0; i < 8; i++) TASKS.push(['NUBES', () => genCloud(i * 32, i * 32 + 32)]);
TASKS.push(['NUBES', shadeCloud]);
TASKS.push(['ACANTILADOS', buildWalls]);
let ti = 0;
let BT0 = 0;
function bootStep() {
  const t0 = performance.now();
  BT0 = BT0 || t0;
  while (ti < TASKS.length && performance.now() - t0 < 5 && ti < ((t0 - BT0) / 1300) * TASKS.length + 1) TASKS[ti++][1]();
  if (O32) {
    O32.fill(PC[0]);
    const p = ti / TASKS.length;
    txt('PENITENTES', FW / 2, 118, PC[13], 2, 5, 0.5);
    fill(FW / 2 - 80, 160, 160, 2, PC[2]);
    fill(FW / 2 - 80, 160, (160 * p) | 0, 2, PC[13]);
    const lab = ti < TASKS.length ? TASKS[ti][0] : 'LISTO';
    txt(lab, FW / 2, 168, PC[6], 1, 1, 0.5);
    txt(((ti * 32768) / 1e3).toFixed(0) + ' MIL TEXELES', FW / 2, 180, PC[4], 1, 1, 0.5);
  }
  if (ti >= TASKS.length) {
    phase = 'title';
    FD = 16;
    newMatch('title');
  }
}

/*DBG*/

class Game extends Phaser.Scene {
  constructor() {
    super('penitentes');
  }
  create() {
    aInit(this);
    this.textures.createCanvas('fb', FW, FH);
    this.tex = this.textures.get('fb');
    this.ctx = this.tex.getContext();
    this.img = this.ctx.createImageData(FW, FH);
    O32 = new Uint32Array(this.img.data.buffer);
    this.add.image(W / 2, H / 2, 'fb').setScale(W / FW, H / FH);
    this.acc = 0;
    this.last = 0;
  }
  update() {
    const now = performance.now();
    const d = min(100, now - (this.last || now));
    this.last = now;
    if (phase === 'boot') bootStep();
    else {
      this.acc += d * TSC;
      let n = 0;
      while (this.acc >= 1000 / 60 && n < 4) {
        this.acc -= 1000 / 60;
        n++;
        step(1 / 60);
        hit = {};
      }
      if (this.acc > 70) this.acc = 0;
      if (FD > 0) FD = max(0, FD - d * 0.02);
      music(mode !== 'title' && (phase === 'fight' || phase === 'ko'));
      render();
    }
    this.ctx.putImageData(this.img, 0, 0);
    this.tex.refresh();
  }
}

new Phaser.Game({
  type: Phaser.AUTO,
  width: W,
  height: H,
  parent: 'game-root',
  backgroundColor: '#0b0e1a',
  pixelArt: true,
  scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH, width: W, height: H },
  scene: Game,
});
})();
