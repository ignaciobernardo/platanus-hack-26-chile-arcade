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
// poses guardadas como texto: cada carácter es un número (código - 79) / 25
const pz = (s) => [...s].map((c) => (c.charCodeAt() - 79) / 25);

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
}

// --- Lienzo: color, profundidad (1/z) y máscara de sombras ---

const CR = new Uint8ClampedArray(NP);
const CG = new Uint8ClampedArray(NP);
const CB = new Uint8ClampedArray(NP);
const ZB = new Float32Array(NP);
const SM = new Uint8Array(NP);
let O32 = null;

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
        } else if (md > 4) SM[i] = 1;
        else if (z > ZB[i] && BAY[ro | (x & 3)] < 8) {
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

// Triángulo de sombra: solo marca la máscara
const stri = (ax, ay, bx, by, cx, cy) => tri(ax, ay, 0, bx, by, 0, cx, cy, 0, 0, 0, 0, 5);

// Punto/disco en pantalla. md 0 opaco, 1 aditivo con caída suave, 3 trama
function dot(sx, sy, iz, s, c, md) {
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
        const t = DO[b] + 96 + fl;
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
const SHR = [1, 0.56];
const SHG = [1, 0.63];
const SHB = [1, 0.79];

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
const rad0 = (a) => AR + 0.85 * sin(3 * a + 1) + 0.55 * sin(5 * a + 2.2) + 0.3 * sin(9 * a + 0.4) + 0.16 * sin(17 * a + 3);
const rad = (a) => rad0(a) * ES;
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
        R = mix(R, 82 * q + v, pt);
        G = mix(G, 82 * q + v, pt);
        B = mix(B, 108 * q + v, pt);
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
      CR.fill(FOGR, i, i + FW);
      CG.fill(FOGG, i, i + FW);
      CB.fill(FOGB, i, i + FW);
      ZB.fill(0, i, (i += FW));
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
// sh: proyecta la malla sobre el suelo en la dirección del sol y marca su sombra
function drawMesh(m, sh = 0, s = 1) {
  const v = m.v;
  const n = m.c.length;
  for (let i = 0; i < n; i++) {
    const y = v[i * 3 + 1];
    const k = sh ? y / LY : 0;
    PVb[i] = P(v[i * 3] * s - LX * k, sh ? 0 : y, v[i * 3 + 2] * s - LZ * k);
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
    if (!sh && N[j] * (ex - v[a * 3] * s) + N[j + 1] * (ey - v[a * 3 + 1]) + N[j + 2] * (ez - v[a * 3 + 2] * s) <= 0) continue;
    tri(PXb[a], PYb[a], PZb[a], PXb[b], PYb[b], PZb[b], PXb[c], PYb[c], PZb[c], PCb[a], PCb[b], PCb[c], sh ? 5 : 0);
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
    OB.push({ x, z, r: R, h: k ? 0.55 + sr() * 0.2 : 2.2, k, al: 1 });
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

const MB = 240;
const BXc = new Float32Array(MB * 24);
const BXk = new Int32Array(MB);
const BXm = new Uint8Array(MB);
let nB = 0;
const FACES = [
  [1, 3, 7, 5],
  [0, 4, 6, 2],
  [2, 6, 7, 3],
  [0, 1, 5, 4],
  [4, 5, 7, 6],
  [0, 2, 3, 1],
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
// Caja o tronco (ts escala la cara de arriba). md: 0 mate, 1 vidrio, 2 emisivo, 4 metal con brillo
function box(m, x, y, z, hx, hy, hz, col, md = 0, ts = 1) {
  if (nB >= MB) return;
  const o = mPt(m, x, y, z);
  const b = nB++;
  for (let k = 0; k < 8; k++) {
    const t = k & 2 ? ts : 1;
    const sx = (k & 1 ? hx : -hx) * t;
    const sy = k & 2 ? hy : -hy;
    const sz = (k & 4 ? hz : -hz) * t;
    for (let q = 0; q < 3; q++) BXc[b * 24 + k * 3 + q] = o[q] + sx * m[q] + sy * m[3 + q] + sz * m[6 + q];
  }
  BXk[b] = col;
  BXm[b] = md;
}
// Marco con -Y apuntando en la dirección (dx, dy, dz)
function look(m, p, dx, dy, dz) {
  const l = hypot(dx, dy, dz) || 1e-4;
  return mR(mR(mTr(m, p[0], p[1], p[2]), 1, atan2(dx, dz)), 0, -Math.acos(cl(-dy / l, -1, 1)));
}
// Hueso entre dos puntos
function seg(m, a, b, hx, hz, col, md, ts = 1) {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const dz = b[2] - a[2];
  const l = hypot(dx, dy, dz) / 2;
  box(look(m, a, dx, dy, dz), 0, -l, 0, hx, l, hz, col, md, ts);
}
// Cinemática inversa de dos huesos: [codo o rodilla, extremo alcanzable]
function ik(a, t, l1, l2, bd) {
  let dx = t[0] - a[0];
  let dy = t[1] - a[1];
  let dz = t[2] - a[2];
  const d = hypot(dx, dy, dz) || 1e-4;
  const D = min(d, l1 + l2 - 0.002);
  dx /= d;
  dy /= d;
  dz /= d;
  const x = (D * D + l1 * l1 - l2 * l2) / (2 * D);
  const k = bd[0] * dx + bd[1] * dy + bd[2] * dz;
  const px = bd[0] - k * dx;
  const py = bd[1] - k * dy;
  const pz = bd[2] - k * dz;
  const h = sqrt(max(0, l1 * l1 - x * x)) / (hypot(px, py, pz) || 1);
  return [
    [a[0] + dx * x + px * h, a[1] + dy * x + py * h, a[2] + dz * x + pz * h],
    [a[0] + dx * D, a[1] + dy * D, a[2] + dz * D],
  ];
}
const BSX = new Float32Array(8);
const BSY = new Float32Array(8);
const BSZ = new Float32Array(8);
function drawBoxes(shadow) {
  for (let b = 0; b < nB; b++) {
    const md = BXm[b];
    if (shadow && md === 1) continue;
    const C = b * 24;
    let ok = 1;
    let bx = 0;
    let by = 0;
    let bz = 0;
    for (let k = 0; k < 8; k++) {
      const o = C + k * 3;
      const y = BXc[o + 1];
      bx += BXc[o] / 8;
      by += y / 8;
      bz += BXc[o + 2] / 8;
      if (!(shadow ? P(BXc[o] - (LX / LY) * y, 0, BXc[o + 2] - (LZ / LY) * y) : P(BXc[o], y, BXc[o + 2]))) ok = 0;
      BSX[k] = _x;
      BSY[k] = _y;
      BSZ[k] = _z;
    }
    if (!ok) continue;
    const dep = 1 / BSZ[0];
    for (const [p, q, r, t] of FACES) {
      const a = C + p * 3;
      const e = C + q * 3;
      const g = C + t * 3;
      const h = C + r * 3;
      const ux = BXc[e] - BXc[a];
      const uy = BXc[e + 1] - BXc[a + 1];
      const uz = BXc[e + 2] - BXc[a + 2];
      const wx = BXc[g] - BXc[a];
      const wy = BXc[g + 1] - BXc[a + 1];
      const wz = BXc[g + 2] - BXc[a + 2];
      let nx = uy * wz - uz * wy;
      let ny = uz * wx - ux * wz;
      let nz = ux * wy - uy * wx;
      const fx = (BXc[a] + BXc[h]) / 2;
      const fy = (BXc[a + 1] + BXc[h + 1]) / 2;
      const fz = (BXc[a + 2] + BXc[h + 2]) / 2;
      let l = hypot(nx, ny, nz) || 1;
      if (nx * (fx - bx) + ny * (fy - by) + nz * (fz - bz) < 0) l = -l;
      nx /= l;
      ny /= l;
      nz /= l;
      if (shadow) {
        if (nx * LX + ny * LY + nz * LZ > 0) {
          stri(BSX[p], BSY[p], BSX[q], BSY[q], BSX[r], BSY[r]);
          stri(BSX[p], BSY[p], BSX[r], BSY[r], BSX[t], BSY[t]);
        }
        continue;
      }
      const vx = ex - fx;
      const vy = ey - fy;
      const vz = ez - fz;
      if (nx * vx + ny * vy + nz * vz <= 0) continue;
      let c = md === 2 ? BXk[b] : shade(BXk[b], nx, ny, nz);
      if (md === 4) {
        const vl = hypot(vx, vy, vz);
        const hx = LX + vx / vl;
        const hy = LY + vy / vl;
        const hz = LZ + vz / vl;
        const s = max(0, (nx * hx + ny * hy + nz * hz) / hypot(hx, hy, hz)) ** 12 * 190;
        c = pk((c >> 16) + s, ((c >> 8) & 255) + s * 0.95, (c & 255) + s * 0.85);
      }
      c = fogc(c, dep);
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
// --- Partículas ---

const MP = 1500;
// partículas en un solo arreglo: x y z vx vy vz vida vidaMax tamaño color banderas
const QQ = new Float32Array(MP * 11);
let qn = 0;
// fl: 1 aditiva, 2 gravedad, 4 roce, 8 choca con el suelo, 16 crece
function part(x, y, z, vx, vy, vz, l, s, c, fl) {
  if (qn < MP) QQ.set([x, y, z, vx, vy, vz, l, l, s, c, fl], 11 * qn++);
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
    const o = i * 11;
    if ((QQ[o + 6] -= dt) <= 0) {
      QQ.copyWithin(o, --qn * 11, qn * 11 + 11);
      i--;
      continue;
    }
    const f = QQ[o + 10];
    if (f & 2) QQ[o + 4] -= 14 * dt;
    if (f & 4) for (let k = 3; k < 6; k++) QQ[o + k] *= exp(-3 * dt);
    for (let k = 0; k < 3; k++) QQ[o + k] += QQ[o + k + 3] * dt;
    if (f & 8 && QQ[o + 1] < 0 && onPlat(QQ[o], QQ[o + 2])) {
      QQ[o + 1] = 0;
      QQ[o + 4] *= -0.25;
      QQ[o + 3] *= 0.5;
      QQ[o + 5] *= 0.5;
    }
  }
}
function drawParts() {
  for (let i = 0; i < qn; i++) {
    const o = i * 11;
    if (!P(QQ[o], QQ[o + 1], QQ[o + 2])) continue;
    const f = QQ[o + 10];
    const k = QQ[o + 6] / QQ[o + 7];
    const s = max(1, min(40, QQ[o + 8] * F * _z * (f & 16 ? 2 - k : 1)));
    dot(_x, _y, _z + 0.02, s, f & 1 ? sc3(QQ[o + 9], k) : fogc(QQ[o + 9], _d), f & 1);
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
  '!': '22202', '¡': '20222', '.': '00002', ':': '02020', '-': '00700', '+': '02720',
  '·': '00200', '<': '12421', '>': '42124',
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
const ER = 'exponentialRampToValueAtTime';
function tone(f, dur, type, vol, f2 = 0, dl = 0) {
  if (!AC || AC.state !== 'running' || (mode === 'title' && !MUS)) return;
  const t = AC.currentTime + dl;
  const o = AC.createOscillator();
  const g = AC.createGain();
  o.type = { s: 'sine', q: 'square', t: 'triangle', w: 'sawtooth' }[type];
  o.frequency.setValueAtTime(f, t);
  if (f2) o.frequency[ER](f2, t + dur);
  g.gain.setValueAtTime(vol, t);
  g.gain[ER](0.0008, t + dur);
  o.connect(g);
  bus(g);
  o.start(t);
  o.stop(t + dur + 0.05);
}
function noise(dur, vol, fq, type = 'l', dl = 0, f2 = 0) {
  if (!AC || AC.state !== 'running' || (mode === 'title' && !MUS)) return;
  const t = AC.currentTime + dl;
  const s = AC.createBufferSource();
  s.buffer = NB;
  const f = AC.createBiquadFilter();
  f.type = { l: 'lowpass', h: 'highpass', b: 'bandpass' }[type];
  f.frequency.setValueAtTime(fq, t);
  if (f2) f.frequency[ER](f2, t + dur);
  const g = AC.createGain();
  g.gain.setValueAtTime(vol, t);
  g.gain[ER](0.0008, t + dur);
  s.connect(f);
  f.connect(g);
  bus(g);
  s.start(t, rnd());
  s.stop(t + dur + 0.05);
}
const SFX = {
  swing: () => noise(0.13, 0.22, 900, 'b', 0, 3200),
  hit: (v = 1) => {
    noise(0.16, 0.5 * v, 1300);
    tone(150, 0.14, 'q', 0.2 * v, 55);
  },
  block: () => {
    tone(1250, 0.2, 'q', 0.06);
    tone(1870, 0.3, 't', 0.08);
    noise(0.05, 0.2, 4000, 'h');
  },
  parry: () => {
    tone(2093, 0.6, 't', 0.13);
    tone(3136, 0.7, 's', 0.08);
    noise(0.1, 0.25, 5000, 'h');
  },
  bash: () => {
    noise(0.2, 0.55, 420);
    tone(95, 0.25, 's', 0.45, 45);
  },
  jump: () => noise(0.14, 0.12, 500, 'b', 0, 1500),
  roll: () => noise(0.3, 0.22, 1400, 'b', 0, 300),
  charge: () => tone(180, 0.7, 'w', 0.035, 620),
  full: () => {
    tone(1760, 0.35, 't', 0.08);
    tone(2637, 0.5, 's', 0.05, 0, 0.04);
  },
  heavy: () => {
    noise(0.4, 0.5, 500, 'b', 0, 2600);
    tone(110, 0.35, 'q', 0.1, 50);
  },
  land: () => noise(0.09, 0.15, 2600, 'h'),
  step: () => noise(0.04, 0.03, 2200, 'h'),
  ice: () => {
    [1568, 2093, 2637, 3136].forEach((f, i) => tone(f, 0.3, 't', 0.06, 0, i * 0.03));
    noise(0.3, 0.08, 6000, 'h');
  },
  fire: () => {
    noise(0.4, 0.35, 600, 'l', 0, 2400);
    tone(110, 0.3, 'w', 0.06, 70);
  },
  slow: () => {
    tone(440, 0.7, 's', 0.12, 160);
    tone(446, 0.7, 's', 0.1, 163);
  },
  shatter: () => {
    noise(0.35, 0.35, 3500, 'h');
    [3520, 2960, 4186].forEach((f, i) => tone(f, 0.2, 'q', 0.03, 0, i * 0.04));
  },
  boom: (v = 1) => {
    noise(1, 0.9 * v, 520, 'l', 0, 120);
    tone(75, 0.9, 's', 0.7 * v, 28);
  },
  gust: () => noise(0.7, 0.45, 400, 'b', 0, 2200),
  pick: () => {
    tone(880, 0.1, 'q', 0.06);
    tone(1320, 0.18, 'q', 0.06, 0, 0.07);
  },
  chime: () => tone(1760, 1.2, 's', 0.05),
  ko: () => {
    tone(220, 1.2, 'w', 0.15, 50);
    SFX.boom(0.8);
  },
  gong: () => [98, 147, 196].forEach((f) => tone(f, 2.6, 's', 0.11)),
  fall: () => tone(900, 1.3, 's', 0.1, 120),
  ui: () => tone(880, 0.07, 'q', 0.06),
};

// Música: en el título una quena sobre un colchón; en el combate un bombo legüero acelerado
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
        tone(78, 0.28, 's', 0.32, 40, d);
        noise(0.06, 0.12, 180, 'l', d);
      }
      if (s === 4 || s === 12) noise(0.08, 0.1, 1800, 'b', d);
      if (!(s & 1)) noise(0.03, 0.025, 7000, 'h', d);
      if (s === 0 || s === 10) tone(b, 0.3, 't', 0.1, 0, d);
    } else {
      if (!(mi & 7)) [1, 1.5, 2.4].forEach((k) => tone(b * k, 2, 't', 0.035, 0, d));
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
const ITN = ['', 'POCIÓN', 'BOMBA', 'VENDAVAL'];
const ITC = [0, 0xff6f8a, 0x30303c, 0xf2f4ff];
const ITI = [0, PC[13], PC[15], PC[9]];

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
let TM = 60;
let RND = 0;
let lvl = 0;
let streak = 0;
let msg = '';
let msgT = 0;
let winner = -1;
let MSEL = 0;
let FS = [];
let PJ = [];
let IT = [];
let BM = [];
let FP = [];
let FT = [];
let LT = [];
let itT = 4;
const CAM = { x: 0, z: 0, d: 30, yw: 0, pt: 0.8 };

const onPlat = (x, z) => hypot(x, z) < rad(atan2(z, x));

function mkF(i) {
  return {
    i, x: 0, z: 0, y: 0, vx: 0, vz: 0, vy: 0, kx: 0, kz: 0, face: 0, hp: 100, gh: 100, gt: 0, mana: 1, sp: 0,
    item: 0, act: 0, at: 0, cmb: 0, q: 0, hd: 0, blk: 0, stun: 0, frz: 0, burn: 0, bt: 0, slow: 0,
    hs: 0, inv: 0, fl: 0, fall: 0, ko: 0, kod: 0, wk: 0, mv: 0, trail: [], w: 0, pw: 0, pf: 0, spin: 0, rl: 0,
    rb: 0, rx: 0, rz: 0, ds: 0, bst: 9, pbc: 0, gb: 0, dg: 0, aid: 0, pa: -1, plan: 0, hold: 0, tn: 0, kd: 0, hang: 0,
    Q: pz('UTWI]JSUEOOPPO'),
    bq: 0, bqt: 0, cpu: 0, ct: 0, side: 1, skl: 0.6, lag: 1, ci: { mx: 0, mz: 0, p: [], blk: 0, hu: 0 },
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
  GA0 = GA0 || GA.slice();
  GA.set(GA0);
  ES = ESa = 1;
  FIN = null;
  for (const o of OB) stamp(o.x, o.z, o.r + 1, 112, 118, 156, 0.45);
  FS = FS.map((f, i) =>
    Object.assign(mkF(i), { w: f.w, cpu: f.cpu, skl: f.skl, lag: f.lag, lv: f.lv, x: i ? 5.5 : -5.5, face: i ? -PI / 2 : PI / 2, sp: (RND + i) % 3 }),
  );
  PJ = [];
  IT = [];
  BM = [];
  FP = [];
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
  I.hu = held[k + '1'] ? 1 : 0;
  return I;
}

// Rodar: invulnerable durante la vuelta
const dodging = (f) => f.act === 2 && f.at > 0.02 && f.at < 0.3;
function dodged(f) {
  if (f.dg > 0) return;
  f.dg = 0.5;
  ftxt(f.x, 2.3, f.z, '¡ESQUIVA!', PC[8]);
  SFX.pick();
}

function cpuIn(f, o, dt) {
  const I = f.ci;
  I.p = [];
  f.hold -= dt;
  I.hu = f.hold > 0 ? 1 : 0;
  if (phase !== 'fight') {
    I.mx = I.mz = I.blk = 0;
    return I;
  }
  if (f.fall || f.hang) {
    I.p[5] = rnd() < (f.hang ? 0.04 : f.skl * 0.15);
    return I;
  }
  const dx = o.x - f.x;
  const dz = o.z - f.z;
  const d = hypot(dx, dz) || 1;
  const ux = dx / d;
  const uz = dz / d;
  if (f.act === 7 && d > 2.4 && d < 6 && rnd() < 0.05) I.p[3] = 1;
  if (o.tn && o.stun > 0.15 && d < 2.6) {
    I.p[[1, 2, 4][(rnd() * 3) | 0]] = 1;
    return I;
  }
  // ante cada ataque del rival elige: parada perfecta, rodar o cubrirse
  const thr = (o.act === 1 || o.act === 5 || o.act > 6) && d < 3.4;
  if (thr && f.pa !== o.aid) {
    f.pa = o.aid;
    const r = rnd() / f.skl;
    f.plan = r < 0.3 ? 1 : r < 0.58 ? 2 : r < 1 ? 3 : 0;
  }
  if (thr && f.plan) {
    const now = o.act === 8 || o.act === 5 || (o.act === 1 && o.at > ATA[o.cmb][0] - 0.07);
    I.blk = f.plan === 3 || (f.plan === 1 && now) ? 1 : 0;
    I.mx = I.mz = 0;
    if (f.plan === 2 && now) {
      I.p[o.act === 8 || (o.act === 1 && o.cmb < 2 && rnd() < 0.5) ? 5 : 3] = 1;
      I.mx = -uz * f.side;
      I.mz = ux * f.side;
      f.plan = 0;
    }
    f.ct = 0.2;
    return I;
  }
  f.ct -= dt;
  if (f.ct > 0) return I;
  f.ct = rr(0.09, 0.2) * f.lag;
  I.blk = 0;
  const inc = PJ.find((p) => p.o !== f.i && hypot(p.x - f.x, p.z - f.z) < 5 && p.vx * (f.x - p.x) + p.vz * (f.z - p.z) > 0);
  const flee = BM.some((b) => hypot(b.tx - f.x, b.tz - f.z) < 3);
  if (flee) I.p[3] = rnd() < 0.3;
  else if (inc && rnd() < f.skl) {
    const r = rnd();
    if (r < 0.3) I.p[5] = 1;
    else if (r < 0.65) {
      I.p[3] = 1;
      I.mx = -uz * f.side;
      I.mz = ux * f.side;
      return I;
    } else I.blk = 1;
  } else if ((o.stun > 0.3 || o.frz > 0.35) && d < 2.3) {
    I.p[1] = 1;
    f.hold = rr(0.45, 0.9);
  } else if (o.blk && d < 2.4 && rnd() < 0.45) {
    I.p[1] = 1;
    f.hold = 0.95;
  } else if (f.item && rnd() < 0.15) I.p[6] = 1;
  else if (f.mana >= 1 && d > 3.2 && rnd() < 0.3) I.p[4] = 1;
  else if (f.y > 0.6 && d < 3) I.p[1] = 1;
  else if (d < 2.1) {
    const r = rnd();
    if (r < 0.12) {
      I.p[1] = 1;
      f.hold = rr(0.3, 0.8);
    } else if (r < 0.85) I.p[1] = 1;
    else I.blk = 1;
  }
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

const ATD = [0.3, 0.28, 0.42];
const ATA = [
  [0.11, 0.19],
  [0.1, 0.18],
  [0.14, 0.24],
];
const ATK = [7, 7, 12];
const ATB = [3, 3, 8];
// colgado: manos arriba en el borde, cabeza mirando hacia arriba
const HANG = pz('T_VOmJ_VO1OQOF');
const ease = (k) => k * k * (3 - 2 * k);
// Pose de un tajo: c combo (0 derecha a izquierda, 1 revés, 2 de arriba), k -1..0 preparación, 0..1 golpe
function atkPose(c, k) {
  if (c === 2) {
    const ph = k < 0 ? mix(0.4, 2.5, k + 1) : mix(2.5, -0.75, ease(k));
    return [0.06, 0.45 + 0.45 * sin(ph), 0.05 + 0.45 * cos(ph), 0, ph, -0.18, 0.3, 0.18, -0.6, 0, 0, k < 0 ? -0.12 : 0.3 * k, k < 0 ? 0 : 0.14 * k, 0];
  }
  const s0 = c ? -1.6 : 1.9;
  const th = k < 0 ? mix(0.3, s0, k + 1) : mix(s0, c ? 1.5 : -1.3, ease(k));
  return [sin(th) * 0.46, c ? 0.5 : 0.42, cos(th) * 0.46 + 0.05, th, 0.08, -0.16, 0.32, 0.16, -0.6, 0, th * 0.35, k < 0 ? 0 : 0.15 * k, 0.06, 0];
}
// Atontado: escudo y espada arriba, tambaleándose
const stunA = () => {
  const w = sin(T * 7);
  return [0.3, 0.98 + w * 0.04, 0.02, 0.3, 1.45, -0.32, 0.92 - w * 0.04, 0.08, -0.5, 0.9, w * 0.15, -0.12, 0, w * 0.25];
};

// fl: 1 no se puede bloquear, 2 hechizo, 4 lanza al aire, 8 cuerpo a cuerpo, 16 cargado, 32 rompe la guardia
// Devuelve 0 nada/esquivado, 1 bloqueado, 2 golpe, 3 parada perfecta
function hurt(B, sx, sz, dmg, kb, hst, fl = 0, A = null) {
  if (B.ko || B.fall || B.inv > 0 || phase !== 'fight') return 0;
  if (dodging(B)) {
    dodged(B);
    return 0;
  }
  const dx = B.x - sx;
  const dz = B.z - sz;
  const d = hypot(dx, dz) || 1;
  const ux = dx / d;
  const uz = dz / d;
  if (!(fl & 1) && B.blk && abs(angD(B.face, atan2(-ux, -uz))) < 1.5) {
    const sx_ = B.x + sin(B.face) * 0.5;
    const sz_ = B.z + cos(B.face) * 0.5;
    if (B.bst < 0.2) {
      // parada perfecta: el atacante queda atontado, escudo y espada arriba
      if (A) {
        A.stun = fl & 16 ? 1.2 : 0.95;
        A.act = 0;
        A.hold = 0;
        A.tn = 1;
        B.bqt = 0;
        A.kx -= ux * 3;
        A.kz -= uz * 3;
      }
      burst(sx_, 1.2, sz_, 30, 8, 0.45, 0.07, 0xfff4c0, 1 | 2);
      SFX.parry();
      HSTOP = 0.15;
      IMP = 2;
      ftxt(B.x, 2.6, B.z, '¡PARADA!', PC[17]);
      return 3;
    }
    B.hp -= dmg * (fl & 2 ? 0.25 : fl & 16 ? 0.3 : 0.12);
    const k = fl & 16 ? 0.85 : 0.4;
    B.kx += ux * kb * k;
    B.kz += uz * kb * k;
    B.hs = 0.12;
    B.gt = 0.5;
    if (fl & 32) {
      B.blk = 0;
      B.stun = 0.75;
      B.gb = 0.35;
      ftxt(B.x, 2.6, B.z, '¡ROTURA!', PC[13]);
      IMP = 2;
      SFX.bash();
    }
    burst(sx_, 1.1, sz_, 12, 6, 0.3, 0.07, 0xfff0d0, 1 | 2);
    SFX.block();
    HSTOP = 0.05;
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
  if (B.hang) {
    B.hang = 0;
    B.fall = 1;
    B.vy = -14;
  }
  if (B.act !== 5) B.act = 0;
  B.blk = 0;
  B.hold = 0;
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
  f.aid++;
  f.trail = [];
}

function melee(f, o) {
  const dx = o.x - f.x;
  const dz = o.z - f.z;
  return hypot(dx, dz) < 2.05 && abs(angD(f.face, atan2(dx, dz))) < 1.35 ? (f.cmb < 2 && o.y > 0.5 ? 2 : abs(o.y - f.y) < 1.6) : 0;
}

function cast(f, o) {
  const k = f.sp;
  f.sp = (f.sp + 1) % 3;
  f.mana -= 1;
  const sp = [16, 15, 10][k];
  const a = f.face;
  PJ.push({ x: f.x + sin(a) * 0.9, y: f.y + 0.75, z: f.z + cos(a) * 0.9, vx: sin(a) * sp, vz: cos(a) * sp, o: f.i, k, t: 0, r: k === 2 ? 0.65 : 0.45 });
  [SFX.ice, SFX.fire, SFX.slow][k]();
}

function useItem(f, o) {
  const it = f.item;
  f.item = 0;
  if (it === 1) {
    f.hp = min(100, f.hp + 30);
    burst(f.x, 1, f.z, 30, 2.5, 1, 0.07, 0xffb0a0, 1, 2);
    ftxt(f.x, 2.4, f.z, '+30', PC[13]);
    SFX.full();
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

function boom(x, z) {
  for (const f of FS) {
    const d = hypot(f.x - x, f.z - z);
    if (d < 2.8 && f.y < 2.5) hurt(f, x, z, 20 * (1 - d / 4), 13, 0.5, 2 | 4);
  }
  burst(x, 0.6, z, 14, 2.5, 0.5, 0.5, 0xff8a30, 1 | 4 | 16, 1.5);
  burst(x, 0.5, z, 60, 9, 0.7, 0.12, 0xffc070, 1 | 4, 2);
  burst(x, 0.2, z, 40, 7, 1, 0.08, 0xe8ecf8, 2 | 8, 4);
  stamp(x, z, 2, 60, 56, 70, 0.75);
  FLASH = 60;
  SHK = 0.7;
  SFX.boom();
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
    const d = hypot(o.x - f.x, o.z - f.z);
    if (d < 3 && o.y < 1) hurt(o, f.x, f.z, Math.round(14 - d * 2), 13, 0.45, 4 | 8 | 16, f);
    for (let i = 0; i < 32; i++) {
      const a = (i / 32) * TAU;
      part(f.x + cos(a) * 0.4, 0.1, f.z + sin(a) * 0.4, cos(a) * 10, 1.5, sin(a) * 10, 0.4, 0.14, 0xe8ecf8, 4 | 8);
    }
    stamp(f.x, f.z, 1.6, 150, 158, 196, 0.6);
    SHK = 0.55;
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
  f.dg -= dt;
  f.gb = max(0, f.gb - dt);
  f.gt -= dt;
  if (f.gt < 0) f.gh = max(f.hp, f.gh - 60 * dt);
  if (f.gh < f.hp) f.gh = f.hp;
  if (phase === 'fight') f.mana = min(3, f.mana + dt / 2.8);
  if (f.burn > 0 && !f.ko) {
    f.burn -= dt;
    f.bt -= dt;
    if (f.bt <= 0) {
      f.bt = 0.5;
      if (phase === 'fight') {
        f.hp -= 3;
        f.gt = 0.5;
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
  if (f.hang > 0) {
    // colgado del borde: 5 para trepar; si se acaba el agarre, cae
    f.hang -= dt;
    if (f.hang <= 0) f.fall = 1;
    else if (I.p[5]) {
      const g = atan2(f.z, f.x);
      Object.assign(f, { hang: 0, y: 0.45, vy: 8, kx: -cos(g) * 4.5, kz: -sin(g) * 4.5 });
      SFX.jump();
    }
    const k = 1 - exp(-20 * dt);
    HANG.forEach((v, i) => (f.Q[i] += (v - f.Q[i]) * k));
    return;
  }
  if (f.fall) {
    const g = atan2(f.z, f.x);
    const r = rad(g) + 0.2;
    if (f.fall < 2 && !f.ko && f.y > -3 && hypot(f.x, f.z) < r + 2.5 && I.p[5]) {
      // agarrarse al borde antes de caer
      Object.assign(f, { x: cos(g) * r, z: sin(g) * r, y: -1.5, vy: 0, kx: 0, kz: 0, fall: 0, hang: 2.5, face: atan2(-cos(g), -sin(g)) });
      SFX.land();
      return;
    }
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
  if (!f.stun) f.tn = 0;
  if (!f.ko) f.kd = max(0, f.kd - dt * 2.2);
  f.hs = max(0, f.hs - dt);
  let onG = f.y <= 0 + 0.01 && f.vy <= 0;
  if (!busy) {
    if (f.act) {
      f.at += adt;
      const a = f.act;
      const t = f.at;
      if (a === 1) {
        const [w0, w1] = ATA[f.cmb];
        if (t >= w0 && t - adt < w0) {
          if (I.hu && f.cmb < 2) {
            // mantener el botón: cargar
            f.act = 7;
            f.at = 0;
            f.pw = 0;
            f.pf = 0;
            SFX.charge();
          } else {
            SFX.swing();
            if (hypot(o.x - f.x, o.z - f.z) > 1.3) {
              f.kx += sin(f.face) * 3;
              f.kz += cos(f.face) * 3;
            }
          }
        }
        if (f.act === 1) {
          const m = t >= w0 && t < w1 && !f.hd && !o.ko && melee(f, o);
          if (m) {
            f.hd = 1;
            if (m > 1) dodged(o);
            else hurt(o, f.x, f.z, ATK[f.cmb], ATB[f.cmb], f.cmb === 2 ? 0.42 : 0.3, 8 | (f.cmb === 2 ? 4 : 0), f);
          }
          if (t > 0.08 && f.bqt > 0 && f.bq === 1) {
            f.q = 1;
            f.bqt = 0;
          }
          if ((f.q && f.cmb < 2 && t >= w1 + 0.02) || t >= ATD[f.cmb]) {
            if (f.q && f.cmb < 2) startAtk(f, f.cmb + 1);
            else f.act = 0;
          }
        }
      } else if (a === 7) {
        f.pw = min(1, t / 0.7);
        if (f.pw >= 1 && !f.pf) {
          f.pf = 1;
          SFX.full();
          if (f.tip) burst(f.tip[0], f.tip[1], f.tip[2], 16, 3, 0.4, 0.06, 0xfff0c0, 1);
        }
        if (f.tip && rnd() < 0.6) part(f.tip[0], f.tip[1], f.tip[2], rr(-1, 1), rr(0, 1.5), rr(-1, 1), 0.3, 0.05, f.pf ? 0xfff0c0 : 0x9fb8ff, 1);
        if (!I.hu || t > 2 || I.p[3]) {
          // soltar: giro cargado; con 3 mientras carga: torbellino en carrera
          f.ds = I.p[3];
          f.rx = I.mx || sin(f.face);
          f.rz = I.mx || I.mz ? I.mz : cos(f.face);
          f.act = 8;
          f.at = 0;
          f.hd = 0;
          f.bqt = 0;
          f.aid++;
          f.trail = [];
          SFX.heavy();
          if (f.ds) ftxt(f.x, 2.6, f.z, '¡TORBELLINO!', PC[14]);
        }
      } else if (a === 8) {
        const ds = f.ds;
        f.spin = TAU * (1 + ds) * ease(cl((t - 0.03) / (0.27 + ds * 0.08), 0, 1));
        if (t > 0.05 && t < 0.3 + ds * 0.08 && !f.hd && !o.ko && hypot(o.x - f.x, o.z - f.z) < 2.4) {
          f.hd = 1;
          const p = f.pw;
          if (o.y > 0.5) dodged(o);
          else hurt(o, f.x, f.z, ds ? 21 : 9 + 12 * p, ds ? 10 : 8 + 9 * p, 0.45, 8 | 16 | 4 | (p >= 1 ? 32 : 0), f);
        }
        // tras el torbellino queda expuesto con la espada en alto
        if (t > (ds ? 1 : 0.55)) f.act = 0;
      } else if (a === 2) {
        f.rl = (f.rb ? -TAU : TAU) * ease(cl(t / 0.4, 0, 1));
        if (t > 0.48) f.act = 0;
      } else if (a === 3) {
        if (t >= 0.13 && t - adt < 0.13) cast(f, o);
        if (t > 0.28) f.act = 0;
      } else if (a === 4) {
        if (t >= 0.12 && t - adt < 0.12) useItem(f, o);
        if (t > 0.3) f.act = 0;
      } else if (a === 6 && t > 0.24) f.act = 0;
    }
    if (!f.act && f.bqt > 0) {
      const b = f.bq;
      if (o.tn && o.stun > 0.1 && hypot(o.x - f.x, o.z - f.z) < 2.6 && (b === 1 || b === 2 || (b === 4 && f.mana >= 1))) {
        f.bqt = 0;
        startFin(f, o, b);
        return;
      }
      if (b === 1) {
        if (onG) startAtk(f, 0);
        else {
          f.act = 5;
          f.at = 0;
          f.aid++;
          f.vy = -15;
          SFX.swing();
        }
      } else if (b === 3 && onG) {
        // rodar hacia donde apunta el stick; sin dirección, voltereta hacia atrás
        let rx = I.mx;
        let rz = I.mz;
        f.rb = !(rx || rz);
        if (f.rb) {
          rx = -sin(f.face);
          rz = -cos(f.face);
        } else f.face = atan2(rx, rz);
        f.rx = rx;
        f.rz = rz;
        f.act = 2;
        f.at = 0;
        burst(f.x, 0.05, f.z, 10, 2.5, 0.5, 0.1, 0xe4e8f6, 2 | 8, 1);
        SFX.roll();
      } else if (b === 4 && f.mana >= 1) {
        f.act = 3;
        f.at = 0;
      } else if (b === 5 && onG) {
        f.vy = 9.2;
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
    // escudo: la parada perfecta solo vale en las primeras décimas, y no si se machaca el botón
    const nb = !f.act && onG && I.blk ? 1 : 0;
    if (nb && !f.blk) f.bst = f.pbc > 0 ? 9 : 0;
    if (!nb && f.blk) f.pbc = 0.3;
    f.blk = nb;
  } else {
    f.blk = 0;
    if (f.frz > 0 || f.stun > 0 || f.ko) f.act = f.act === 5 ? 5 : 0;
  }
  f.bst += dt;
  f.pbc -= dt;
  let sp = 6.4 * (f.slow > 0 ? 0.55 : 1);
  if (busy) sp = 0;
  else if (f.blk) sp *= 0.35;
  else if (f.act === 1) sp *= 0.25;
  else if (f.act === 3 || f.act === 4) sp *= 0.3;
  else if (f.act === 7) sp *= 0.12;
  else if (f.act === 6 || f.act === 8) sp = 0;
  const ac = 1 - exp(-(onG ? 30 : 5) * dt);
  f.vx += (I.mx * sp - f.vx) * ac;
  f.vz += (I.mz * sp - f.vz) * ac;
  if (f.act === 8 && f.ds && f.at < 0.36) {
    f.vx = f.rx * 12;
    f.vz = f.rz * 12;
  }
  if (f.act === 2) {
    const v = (f.at < 0.28 ? 10.5 : f.at < 0.42 ? mix(10.5, 0, (f.at - 0.28) / 0.14) : 0) * sl;
    f.vx = f.rx * v;
    f.vz = f.rz * v;
    if (rnd() < 0.5) part(f.x, 0.1, f.z, rr(-1, 1), 1, rr(-1, 1), 0.4, 0.1, 0xe4e8f6, 2 | 8);
  }
  const kd = exp(-(onG ? 4.2 : 0.7) * dt);
  f.kx *= kd;
  f.kz *= kd;
  const ox = f.x;
  const oz = f.z;
  f.x += (f.vx + f.kx) * dt;
  f.z += (f.vz + f.kz) * dt;
  f.vy -= (f.act === 5 ? 60 : 30) * dt;
  f.y += f.vy * dt;
  const gh = 0;
  if (f.y <= gh) {
    if (f.vy < -3) land(f);
    f.y = gh;
    f.vy = 0;
  }
  // choques con obstáculos y rebote contra penitentes
  for (const ob of OB) {
    if (!ob.al) continue;
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
      }
    }
  }
  // borde de la meseta: solo se cae si te lanzan
  const r = hypot(f.x, f.z);
  const lim = rad(atan2(f.z, f.x)) - 0.45;
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
  if (!busy && f.act !== 2 && f.act !== 1 && f.act !== 8) {
    const tgt = !o.ko && !o.fall ? atan2(o.x - f.x, o.z - f.z) : hypot(f.vx, f.vz) > 0.5 ? atan2(f.vx, f.vz) : f.face;
    const tr = (f.act === 7 ? 6 : 15) * dt;
    f.face += cl(angD(f.face, tgt), -tr, tr);
  } else if (f.act === 1 && f.at < 0.08 && !o.ko) f.face += cl(angD(f.face, atan2(o.x - f.x, o.z - f.z)), -9 * dt, 9 * dt);
  // pasos
  const mvv = hypot(f.x - ox, f.z - oz) / dt;
  f.mv = mix(f.mv, min(1, mvv / 6.4), 0.2);
  const pwk = f.wk;
  f.wk += mvv * dt * 1.9;
  if (onG && floor(pwk / PI) !== floor(f.wk / PI) && mvv > 1 && f.act !== 2) {
    if (!f.cpu) SFX.step();
    part(f.x, 0.05, f.z, rr(-0.5, 0.5), 0.8, rr(-0.5, 0.5), 0.35, 0.06, 0xe8ecf8, 2 | 8);
  }
  // pose objetivo: mano de la espada (xyz), hoja (rumbo, alzada), mano del escudo (xyz),
  // normal del escudo (rumbo, alzada), giro e inclinación del torso, agachado, cabeza
  const br = sin(T * 2.2 + f.i);
  const run = sin(f.wk) * f.mv;
  let A = [0.22, 0.2 + br * 0.015, 0.3 + run * 0.1, -0.25, 0.55, -0.21, 0.17, 0.25 - run * 0.08, -0.4, 0, run * 0.12, 0.05 + f.mv * 0.14, 0.04 + br * 0.01, 0];
  let fast = 0;
  const t = f.at;
  if (f.ko) A = pz('[SSmJCSQ,YOMOG');
  else if (f.gb > 0) A = pz('Z^M^h?]J WGGOG');
  else if (f.stun > 0) A = stunA();
  else if (f.hs > 0) A = pz('XUQ^TFUQ9OOGPG');
  else if (f.act === 1) {
    const [w0, w1] = ATA[f.cmb];
    fast = 1;
    A = atkPose(f.cmb, t < w0 ? t / w0 - 1 : cl((t - w0) / (w1 - w0), 0, 1));
  } else if (f.act === 7) {
    const p = f.pw;
    A = [0.42, 0.55, -0.3, 2.5, 0.35 + p * 0.3, -0.25, 0.35, 0.3, -0.2, 0, 0.7, 0.1, 0.12 + p * 0.1, 0];
  } else if (f.act === 8) {
    fast = 1;
    A = f.ds && t > 0.36 ? pz('SiROuGQQ1OOMOK') : pz('[YTqNFWP,OORQO');
  } else if (f.act === 2) A = pz('SSUcGJSTEOOTWW');
  else if (f.act === 3) A = pz('RZ]ORHYWJ@OQQO');
  else if (f.act === 4) {
    const k = cl(t / 0.14, 0, 1);
    fast = 1;
    A = [0.22, mix(1, 0.35, k), mix(-0.25, 0.5, k), 0, mix(1.8, -0.2, k), -0.25, 0.3, 0.2, -0.5, 0, mix(0.4, -0.3, k), mix(-0.2, 0.25, k), 0.05, 0];
  } else if (f.act === 5) A = pz('QXXO-IYS@OOTTT');
  else if (f.act === 6) A = pz('SQYO1ITT@OOXWT');
  else if (f.blk) A = pz('VRPXnOXYOPJRRP');
  else if (phase === 'end' && f.i === winner) A = pz('SiROuGQQ1OOMOK');
  else if (!onG) {
    A[1] += 0.18;
    A[6] += 0.18;
  }
  if (f.frz <= 0) {
    const k = 1 - exp(-(fast ? 60 : 24) * dt);
    for (let i = 0; i < 14; i++) f.Q[i] += (A[i] - f.Q[i]) * k;
  }
}

// Caballero articulado: piernas y brazos por cinemática inversa, armadura con brillo metálico
function pose(f) {
  if (f.fall === 2 || (f.fall && f.y < -14)) return;
  if (f.inv > 0 && (T * 20) & 1) return;
  const Q = f.Q;
  let B = mR(mTr(ID, f.x, f.y, f.z), 1, f.face + (f.act === 8 ? f.spin : 0));
  if (f.ko || f.kd) B = mR(B, 0, -(f.ko ? f.kod : f.kd) * 1.45);
  if (f.act === 2) B = mTr(mR(mTr(B, 0, 0.5, 0), 0, f.rl), 0, -0.5, 0);
  const wh = f.fl > 0;
  const WH = 0xffffff;
  const mt = wh ? 2 : 4;
  const mc = wh ? 2 : 0;
  const ST = wh ? WH : f.frz > 0 ? 0xa8d8f0 : 0x9aa2bc;
  const c1 = wh ? WH : PCOL[f.i];
  const c2 = wh ? WH : PCOL2[f.i];
  const dk = wh ? WH : DK;
  const gd = wh ? WH : 0xb89a5c;
  const air = (f.y > 0 + 0.05 && !f.ko) || f.act === 2;
  const hy = 0.93 - Q[12] - (air ? 0 : abs(sin(f.wk)) * 0.05 * f.mv);
  const cf = cos(f.face);
  const sf = sin(f.face);
  const v = hypot(f.vx, f.vz) || 1;
  const lx = (f.vx * cf - f.vz * sf) / v;
  const lz = (f.vx * sf + f.vz * cf) / v;
  const st = sin(f.wk) * 0.3 * f.mv;
  const lf = cos(f.wk) * 0.17 * f.mv;
  const wd = f.blk || f.act > 6 ? 0.07 : 0;
  for (const q of [-1, 1]) {
    const ft = air ? [q * 0.13, 0.42, 0.1] : [q * (0.13 + wd) + lx * st * q, max(0, lf * q), -q * (0.11 + wd) + lz * st * q];
    const hp = [q * 0.1, hy, 0];
    const [kn, an] = ik(hp, ft, 0.47, 0.47, [q * 0.15, 0, 1]);
    seg(B, hp, kn, 0.075, 0.085, dk, mc, 1.15);
    seg(B, kn, an, 0.062, 0.07, ST, mt, 1.15);
    box(B, kn[0], kn[1], kn[2] + 0.06, 0.05, 0.055, 0.03, ST, mt);
    box(B, an[0], an[1] + 0.04, an[2] + 0.05, 0.06, 0.04, 0.12, ST, mt, 0.8);
  }
  const Pm = mTr(B, 0, hy, 0);
  box(Pm, 0, 0, 0, 0.15, 0.08, 0.1, dk, mc);
  box(Pm, 0, -0.15, 0, 0.19, 0.13, 0.14, c1, mc, 0.75);
  const Tm = mR(mR(mTr(Pm, 0, 0.05, 0), 1, Q[10]), 0, Q[11]);
  box(Tm, 0, 0.12, 0, 0.13, 0.1, 0.095, dk, mc);
  box(Tm, 0, 0.03, 0, 0.15, 0.035, 0.11, gd, mt);
  box(Tm, 0, 0.36, 0.01, 0.15, 0.14, 0.11, ST, mt, 1.32);
  box(Tm, 0, 0.53, 0, 0.08, 0.04, 0.08, ST, mt);
  for (const q of [-1, 1]) box(mR(mTr(Tm, q * 0.25, 0.5, 0), 2, -q * 0.4), 0, 0, 0, 0.1, 0.07, 0.12, ST, mt, 0.6);
  // capa
  const ca = 0.1 + f.mv * 0.6 + sin(T * 5 + f.i) * 0.05;
  const k1 = mR(mTr(Tm, 0, 0.5, -0.13), 0, ca);
  box(k1, 0, -0.27, 0, 0.16, 0.27, 0.015, c1, mc, 0.8);
  box(mR(mTr(k1, 0, -0.54, 0), 0, ca * 0.5), 0, -0.2, 0, 0.2, 0.2, 0.014, c1, mc, 0.92);
  // yelmo con visera y penacho
  const Hm = mR(mTr(Tm, 0, 0.59, 0.01), 0, Q[13]);
  box(Hm, 0, 0.13, 0, 0.115, 0.14, 0.125, ST, mt, 0.82);
  box(Hm, 0, 0.14, 0.126, 0.086, 0.014, 0.006, wh ? WH : 0x0b0e1a, 2);
  let pl = mTr(Hm, 0, 0.27, 0.04);
  for (let i = 0; i < 3; i++) {
    pl = mR(pl, 0, (i ? -0.45 : 0.25) - 0.1 * sin(T * 7 + i + f.mv * 3));
    box(pl, 0, 0.02, -0.06, 0.024, 0.05, 0.075, c2, 2);
    pl = mTr(pl, 0, 0, -0.12);
  }
  f.eyes = [mPt(Hm, -0.04, 0.14, 0.14), mPt(Hm, 0.04, 0.14, 0.14)];
  // brazos
  const SR = [0.25, 0.47, 0];
  const SL = [-0.25, 0.47, 0];
  const [eR, aR] = ik(SR, [Q[0], Q[1], Q[2]], 0.28, 0.27, [0.8, -0.3, -0.6]);
  const [eL, aL] = ik(SL, [Q[5], Q[6], Q[7]], 0.28, 0.27, [-0.8, -0.3, -0.6]);
  seg(Tm, SR, eR, 0.055, 0.06, dk, mc, 1.1);
  seg(Tm, eR, aR, 0.05, 0.055, ST, mt, 1.3);
  seg(Tm, SL, eL, 0.055, 0.06, dk, mc, 1.1);
  seg(Tm, eL, aL, 0.05, 0.055, ST, mt, 1.3);
  // espada
  const G = look(Tm, aR, sin(Q[3]) * cos(Q[4]), sin(Q[4]), cos(Q[3]) * cos(Q[4]));
  box(G, 0, 0, 0, 0.05, 0.05, 0.05, dk, mc);
  box(G, 0, 0.1, 0, 0.02, 0.07, 0.02, dk, mc);
  box(G, 0, -0.06, 0, 0.12, 0.02, 0.035, gd, mt);
  const lit = wh || (f.act === 7 && f.pw >= 1);
  box(G, 0, -0.58, 0, 0.042, 0.5, 0.011, lit ? 0xfff4d8 : 0xdfe4f2, lit ? 2 : mt, 1.2);
  const tip = mPt(G, 0, -1.08, 0);
  if (f.act === 1 || f.act === 5 || f.act > 7) {
    f.trail.unshift([mPt(G, 0, -0.55, 0), tip]);
    if (f.trail.length > 5) f.trail.pop();
  } else f.trail = [];
  f.tip = tip;
  // escudo de cometa; brilla mientras dura la ventana de parada perfecta
  const Sm = mR(mR(mTr(Tm, aL[0], aL[1], aL[2]), 1, Q[8]), 0, -Q[9]);
  const pb = f.blk && f.bst < 0.2;
  box(Sm, 0, -0.04, 0.06, 0.16, 0.3, 0.03, pb ? 0xfff4d8 : c1, pb ? 2 : mc, 1.65);
  box(Sm, 0, 0.27, 0.075, 0.27, 0.03, 0.03, ST, mt);
  box(Sm, 0, 0.02, 0.1, 0.06, 0.06, 0.03, ST, mt);
  if (f.frz > 0) box(mTr(ID, f.x, f.y, f.z), 0, 0.95, 0, 0.5, 1.05, 0.5, 0xc8f2ff, 1);
}

function itemBoxes(t) {
  let m = mR(ID, 1, T * 2);
  m[9] = t.x;
  m[10] = t.y + 0.45 + (t.st === 2 ? sin(T * 3 + t.x) * 0.1 : 0);
  m[11] = t.z;
  box(mR(m, 0, PI / 4), 0, 0, 0, 0.15, 0.15, 0.15, ITC[t.k], t.k === 2 ? 0 : 2);
}

// --- Remates ---
// Tras una parada perfecta el rival queda atontado: 1 espada, 2 escudo, 4 hechizo.
// Cámara cercana de costado, franjas de cine y cámara lenta. Nunca matan: dejan al menos 1 de vida.
let FIN = null;
const SWS = [
  [0, 0, 0.22, 0.32],
  [1, 0.32, 0.44, 0.54],
  [2, 0.54, 0.92, 1.02],
];
function startFin(a, b, k) {
  const g = atan2(b.x - a.x, b.z - a.z);
  const s = a.sp;
  a.x = b.x - sin(g) * 1.25;
  a.z = b.z - cos(g) * 1.25;
  a.face = g;
  b.face = g + PI;
  a.act = 9;
  a.trail = [];
  b.act = b.tn = 0;
  if (k === 4) {
    a.mana -= 1;
    a.sp = (s + 1) % 3;
  }
  FIN = {
    a, b, k, s, t: 0, h: -1,
    yw: g + (abs(angD(CAM.yw, g + PI / 2)) < PI / 2 ? PI / 2 : -PI / 2),
    n: k === 1 ? 'TRIPLE TAJO' : k === 2 ? 'ESCUDAZO' : ['PRISIÓN DE HIELO', 'COLUMNA DE FUEGO', 'PESO DEL CIELO'][s],
  };
  SFX.full();
}
function finHit(b, dmg, last) {
  b.hp = max(1, b.hp - dmg);
  b.gt = 0.7;
  b.fl = 0.08;
  FIN.h = FIN.t;
  ftxt(b.x, 2.4, b.z, dmg, PC[17]);
  burst(b.x, 1.2, b.z, 18, 6, 0.4, 0.07, 0xfff4d8, 1 | 2 | 4);
  SFX.hit(1.3);
  SHK = last ? 0.6 : 0.3;
  FLASH = last ? 40 : 14;
  if (last) {
    IMP = 3;
    burst(b.x, 0.1, b.z, 40, 6, 0.9, 0.1, 0xe8ecf8, 2 | 8, 3);
    stamp(b.x, b.z, 1.3, 96, 100, 132, 0.6);
    SFX.boom(0.6);
  }
}
function finStep(dt) {
  const { a, b, k, s } = FIN;
  const t0 = FIN.t;
  const t = (FIN.t += dt);
  b.fl = max(0, b.fl - dt);
  b.gt -= dt;
  for (const q of FT) q.t -= dt;
  const ev = (x) => t0 < x && t >= x;
  const V = stunA();
  let A;
  if (k === 1) {
    // tres tajos; el último, de arriba, en cámara lenta
    const [c, s0, we, se] = SWS.filter((q) => q[1] <= t).pop();
    A = atkPose(c, t < we ? (t - s0) / (we - s0) - 1 : min(1, (t - we) / (se - we)));
    SWS.forEach((q, i) => ev(q[3] - 0.04) && finHit(b, [8, 8, 11][i], i > 1));
    TSC = t > 0.7 && t < 0.97 ? 0.35 : 1;
  } else if (k === 2) {
    // dos golpes de escudo y un salto que lo aplasta
    const p = max(0, 1 - abs(t - 0.26) / 0.08) + max(0, 1 - abs(t - 0.48) / 0.08);
    const j = cl((t - 0.62) / 0.38, 0, 1);
    a.y = sin(PI * j) * 1.3;
    A = j > 0 && j < 1 ? [0.3, 0.7, -0.1, 0, 1.2, -0.04, j < 0.75 ? 0.95 : 0.3, 0.3, 0, -1.4, 0, 0.1 + j * 0.2, 0.1, 0.2] : [0.3, 0.25, -0.1, 0.3, 0.9, -0.02, 0.4, 0.3 + p * 0.35, 0, 0.05, -0.2, 0.1 + p * 0.25, t > 1 ? 0.3 : 0.08, 0];
    if (ev(0.26) || ev(0.48)) finHit(b, 6, 0);
    if (ev(1)) {
      finHit(b, 9, 1);
      for (let i = 0; i < 24; i++) part(b.x, 0.1, b.z, cos(i / 3.82) * 7, 1, sin(i / 3.82) * 7, 0.45, 0.12, 0xe8ecf8, 4 | 8);
    }
    TSC = t > 0.75 && t < 0.98 ? 0.4 : 1;
  } else {
    // el hechizo activo, concentrado: hielo, fuego o lentitud
    const c = SPC[s];
    A = t < 0.8 ? pz('SiROuGQQ1OOMOJ') : pz('RZ]ORHYWJ@OQQO');
    const tp = a.tip;
    if (t < 0.85 && tp) {
      const g = rnd() * TAU;
      const r = rr(1.5, 3);
      const x = a.x + cos(g) * r;
      const z = a.z + sin(g) * r;
      const y = rr(0, 3);
      part(x, y, z, (tp[0] - x) * 2.5, (tp[1] - y) * 2.5, (tp[2] - z) * 2.5, 0.4, 0.07, c, 1);
    }
    if (ev(0.95)) {
      finHit(b, 15, 1);
      burst(b.x, 1, b.z, 60, s === 1 ? 3 : 7, 1, 0.12, c, 1 | 4, s === 1 ? 6 : 1);
      stamp(b.x, b.z, 1.5, s ? 64 : 236, s ? 60 : 246, s ? 76 : 255, 0.7);
      if (!s) b.frz = 0.9;
    }
    if (t > 0.95) {
      if (s === 1) part(b.x + rr(-0.6, 0.6), 0.1, b.z + rr(-0.6, 0.6), 0, rr(4, 8), 0, rr(0.3, 0.6), rr(0.12, 0.25), rnd() < 0.5 ? 0xff6a20 : 0xffc048, 1 | 16);
      if (s === 2) {
        b.y = sin(min(1, (t - 0.95) / 0.5) * PI) * 0.8;
        const g = rnd() * TAU;
        part(b.x + cos(g) * 2.5, 0.2, b.z + sin(g) * 2.5, -cos(g) * 6, 1, -sin(g) * 6, 0.4, 0.07, c, 1);
      }
    }
    TSC = t > 0.55 && t < 0.92 ? 0.4 : 1;
  }
  if (FIN.h >= 0 && t - FIN.h < 0.12) {
    V[11] = -0.45;
    V[13] = -0.4;
  }
  if (t > (k === 4 ? 1.1 : 1) && !(k === 4 && !s)) b.kd = min(1, b.kd + dt * 5);
  const q = 1 - exp(-50 * dt);
  for (let i = 0; i < 14; i++) {
    a.Q[i] += (A[i] - a.Q[i]) * q;
    b.Q[i] += (V[i] - b.Q[i]) * q;
  }
  if (t > (k === 4 ? 1.75 : 1.55)) {
    a.act = 0;
    a.y = b.y = 0;
    b.stun = 0;
    b.hs = 0.6;
    b.inv = 0.8;
    if (s === 1 && k === 4) {
      b.burn = 3;
      b.bt = 0.5;
    }
    if (s === 2 && k === 4) b.slow = 5;
    TSC = 1;
    FIN = null;
  }
}

// La meseta se desmorona en los últimos 20 segundos (solo entre dos personas)
let ES = 1;
let ESa = 1;
let GA0 = null;
function crumble() {
  for (let i = 0; i < 2560; i++) {
    const a = (i / 2560) * TAU;
    const r0 = rad0(a);
    for (let r = r0 * ES; r < r0 * ESa + 0.06; r += 0.03) GA[(((sin(a) * r + TH) * TK) | 0) * TS + (((cos(a) * r + TH) * TK) | 0)] = 0;
    if (!(i % 40)) part(cos(a) * r0 * ES, 0, sin(a) * r0 * ES, rr(-1, 1), rr(0, 2), rr(-1, 1), 2.5, rr(0.12, 0.3), rnd() < 0.5 ? 0xd8dcee : 0x6a6280, 2);
  }
  for (const o of OB)
    if (o.al && hypot(o.x, o.z) + o.r > rad(atan2(o.z, o.x))) {
      o.al = 0;
      burst(o.x, 0.6, o.z, 30, 3, 1.5, 0.15, 0xd8e2fa, 2, 1);
    }
  IT = IT.filter((t) => onPlat(t.x, t.z));
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
  if (mode === 'title' && (hit.P1_U || hit.P1_D)) {
    MSEL ^= 1;
    SFX.ui();
  }
  if (mode === 'title' && MSEL && (hit.START1 || hit.P1_1)) hit.START2 = 1;
  if (mode === 'title' || phase === 'end') {
    if (hit.START2 || (phase === 'end' && PT > 1.5 && hit.P2_1)) {
      lvl = 0;
      newMatch('vs');
      SFX.ui();
      return;
    }
    if (hit.START1 || hit.P1_1 * (mode === 'title' || PT > 1.5)) {
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
  if (phase === 'fight' && !FIN) {
    TM -= dt;
    if (mode === 'vs' && TM < 20) {
      if (ES === 1) {
        say('¡LA MESETA SE DESMORONA!', 1.6);
        SFX.boom(0.5);
      }
      ES = 1 - ((20 - TM) / 20) * 0.55;
      SHK = max(SHK, 0.06);
      if (ESa - ES > 0.008) {
        crumble();
        ESa = ES;
      }
    }
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
      if (w && w.w >= 3) {
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
        else (winner === 0 || mode === 'vs' ? SFX.full : SFX.fall)();
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
  if (FIN) {
    finStep(dt);
    stepParts(dt);
    camStep(dt);
    return;
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
    if (blockedAt(p.x, p.z, p.y)) end = 1;
    for (const f of FS) {
      if (end || f.i === p.o || f.ko || f.fall) continue;
      if (hypot(f.x - p.x, f.z - p.z) < p.r + 0.35 && p.y > f.y - 0.2 && p.y < f.y + 1.9) {
        if (dodging(f)) {
          dodged(f);
          continue;
        }
        if (f.blk && f.bst < 0.2 && abs(angD(f.face, atan2(p.x - f.x, p.z - f.z))) < 1.5) {
          p.o = f.i;
          p.vx = -p.vx * 1.25;
          p.vz = -p.vz * 1.25;
          p.t = 0;
          SFX.parry();
          HSTOP = 0.08;
          ftxt(f.x, 2.5, f.z, '¡DEVUELTO!', PC[17]);
          continue;
        }
        const r = hurt(f, p.x - p.vx, p.z - p.vz, [6, 5, 4][p.k], 3, 0.25, 2);
        if (r === 2) {
          if (p.k === 0) {
            f.frz = 1.15;
            f.act = 0;
            SFX.ice();
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
    if (b.y < 0 + 0.2 || blockedAt(b.x, b.z, b.y)) {
      b.dead = 1;
      if (onPlat(b.x, b.z) || b.y > -1) boom(b.x, b.z, b.o);
    }
  }
  BM = BM.filter((b) => !b.dead);
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
        IT.push({ x, z, y: 16, vy: 0, k: 1 + ((rnd() * 3) | 0), st: 0, t: 0 });
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
      const g = 0;
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
  if (FIN) {
    // remate: cámara de costado que se acerca y gira despacio
    tx = (FIN.a.x + FIN.b.x) / 2;
    tz = (FIN.a.z + FIN.b.z) / 2;
    d = 5.4 - FIN.t * 0.7;
    yw = FIN.yw + FIN.t * 0.3;
    pt = 0.42;
  } else if (mode === 'title') {
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
    d = cl(8 + max(s1 * 1.05, s2 * 1.55), 12.5, 24);
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
  const f = FIN ? 3 : 1;
  const k = 1 - exp(-4 * f * dt);
  CAM.x += (tx - CAM.x) * k;
  CAM.z += (tz - CAM.z) * k;
  CAM.d += (d - CAM.d) * (1 - exp(-(phase === 'intro' ? 1.6 : 2.6) * f * dt));
  CAM.yw += angD(CAM.yw, yw) * (1 - exp(-2 * f * dt));
  CAM.pt += (pt - CAM.pt) * (1 - exp(-1.5 * f * dt));
}

// --- Dibujo ---

function render() {
  const sh = SHK * SHK * 0.6;
  setCam(CAM.x + rr(-sh, sh), CAM.z + rr(-sh, sh), 0.9, CAM.d, CAM.yw, CAM.pt);
  SM.fill(0);
  nB = 0;
  for (const f of FS) pose(f);
  if (FIN && FIN.k === 4 && !FIN.s && FIN.t > 0.95) {
    // prisión de hielo: cristales que brotan alrededor
    const { b } = FIN;
    const h = min(1, (FIN.t - 0.95) * 6) * 1.1;
    for (let i = 0; i < 7; i++) box(mR(mR(mTr(ID, b.x + cos(i) * 0.5, 0, b.z + sin(i) * 0.5), 1, i), 0, -0.3), 0, h * (1 + (i % 3) * 0.3), 0, 0.16, h * (1 + (i % 3) * 0.3), 0.16, 0x8ff0ff, 1, 0.12);
  }
  for (const t of IT) if (t.st) itemBoxes(t);
  for (const b of BM) {
    const m = mR(mTr(ID, b.x, b.y, b.z), 0, b.t * 9);
    box(m, 0, 0, 0, 0.18, 0.18, 0.18, 0x30303c);
  }
  // sombras: obstáculos, cajas, nubes y cóndor
  drawMesh(OBM, 1);
  drawBoxes(1);
  floorPass();
  // luces sobre la nieve
  for (const p of PJ) glow(p.x, p.z, p.k === 2 ? 2.4 : 1.8, sc3(SPC[p.k], 0.5));
  for (const p of FP) glow(p.x, p.z, 1.8, sc3(0xff7020, 0.4 + 0.1 * sin(T * 30 + p.x)));
  for (const t of IT) if (t.st === 2) glow(t.x, t.z, 0.9, sc3(ITC[t.k] === 0x30303c ? 0xff9040 : ITC[t.k], 0.35));
  for (const f of FS) {
    if (f.burn > 0 && !f.fall) glow(f.x, f.z, 1.6, sc3(0xff7020, 0.3));
    if (f.act === 3 || f.act === 7) glow(f.x, f.z, 1.4, f.act === 3 ? sc3(SPC[f.sp], 0.3) : sc3(f.pw >= 1 ? 0xfff0c0 : 0x9fb8ff, 0.12 + f.pw * 0.2));
  }
  if (FIN && FIN.k === 4) glow(FIN.b.x, FIN.b.z, 1 + FIN.t, sc3(SPC[FIN.s], min(0.5, FIN.t * 0.5)));
  drawMesh(WALL, 0, ES);
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
      const k = (1 - i / tr.length) * 0.3;
      const col = sc3(f.cmb === 2 ? 0xffd890 : 0xa8c8ff, k);
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
  // ojos que brillan tras la visera, espada cargada y estrellas del aturdido
  for (const f of FS) {
    if (f.fall === 2 || f.ko || !f.eyes) continue;
    for (const e of f.eyes) if (P(e[0], e[1], e[2])) dot(_x, _y, _z + 0.05, 1, f.frz > 0 ? 0x8ff0ff : PCOL2[f.i], 1);
    const tp = f.tip;
    if (tp && (f.act === 3 || f.act === 7) && P(tp[0], tp[1], tp[2])) {
      const full = f.act === 7 && f.pw >= 1;
      dot(_x, _y, _z + 0.1, (f.act === 3 ? 0.5 : 0.1 + f.pw * 0.2 + (full ? 0.08 * sin(T * 30) : 0)) * F * _z, f.act === 3 ? SPC[f.sp] : full ? 0xfff0c0 : 0x9fb8ff, 1);
    }
    if (f.stun > 0)
      for (let i = 0; i < 3; i++) {
        const a = T * 6 + (i * TAU) / 3;
        if (P(f.x + cos(a) * 0.35, f.y + 2.25, f.z + sin(a) * 0.35)) dot(_x, _y, _z, 2, 0xfff0b0, 1);
      }
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
  const fd = phase === 'boot' ? 16 : FD;
  present(FLASH, fd, IMP > 0);
  overlay();
}

// --- Interfaz sobre el tramado ---

const CTL = [
  ['ATACAR', 'MANTÉN: CARGA'],
  ['ESCUDO', 'A TIEMPO: PARADA'],
  ['RODAR', 'CARGANDO: TORBELLINO'],
  ['HECHIZO', 'HIELO FUEGO LENTO'],
  ['SALTAR', '+1: EN PICADA'],
  ['OBJETO', 'CAEN DEL CIELO'],
];
function overlay() {
  if (mode !== 'title') for (const t of FT) if (P(t.x, t.y + (0.9 - t.t) * 1.2, t.z)) txt(t.s, _x, _y, t.c, 1, 1, 0.5);
  const blink = (T * 2.2) & 1;
  if (mode === 'title') {
    // degradado tramado hacia abajo para que el menú se lea sobre la pelea de fondo
    for (let y = 128; y < FH; y++) for (let x = 0; x < FW; x++) if (BAY[((y & 3) << 2) | (x & 3)] < (y - 120) / 4) O32[y * FW + x] = PC[1];
    txt('PENITENTES', FW / 2, 32, PC[14], 4, 9, 0.5);
    txt('DUELO EN LA ALTA CORDILLERA', FW / 2, 86, PC[8], 1, 2, 0.5);
    ['UN JUGADOR', 'DOS JUGADORES'].forEach((s, i) => {
      const on = MSEL === i;
      txt(s, FW / 2, 140 + i * 18, on ? PC[14] : PC[7], 2, 2, 0.5);
      if (on && blink) {
        txt('>', FW / 2 - s.length * 4 - 12, 140 + i * 18, PC[14], 2, 2);
        txt('<', FW / 2 + s.length * 4 + 6, 140 + i * 18, PC[14], 2, 2);
      }
    });
    // los seis botones como en el gabinete
    CTL.forEach(([a, b], i) => {
      const x = 26 + (i % 3) * 128;
      const y = 204 + (i > 2) * 30;
      for (let j = -5; j <= 5; j++) for (let k = -5; k <= 5; k++) if (j * j + k * k < 28) O32[(y + 5 + j) * FW + x + k] = PC[13];
      txt(i + 1, x, y + 3, PC[1], 1, 1, 0.5, 0);
      txt(a, x + 9, y, PC[9], 1, 2);
      txt(b, x + 9, y + 12, PC[8], 1, 1);
    });
    if (best) txt('RÉCORD CONTRA LA MÁQUINA · ' + best, FW / 2, FH - 15, PC[13], 1, 1, 0.5);
    return;
  }
  if (FIN) {
    txt(FIN.n, FW / 2, FH - 17, PC[14], 2, 2, 0.5);
    return;
  }
  // barras de vida, maná, hechizo y objeto
  for (const f of FS) {
    const L = !f.i;
    const w = 150;
    const x0 = L ? 10 : FW - 10 - w;
    const y0 = 12;
    txt(f.i ? (mode === 'solo' ? 'CPU ' + f.lv : 'J2') : 'J1', L ? x0 : x0 + w, y0 - 8, PCI[f.i], 1, 1, L ? 0 : 1);
    for (let k = 0; k < 3; k++) fill(L ? x0 + w - 6 - k * 6 : x0 + 2 + k * 6, y0 - 7, 4, 4, f.w > k ? PC[17] : PC[3]);
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
  for (const f of FS) {
    const o = FS[1 - f.i];
    if (!f.cpu && ((f.fall === 1 && f.y > -3) || f.hang) && P(f.x, 1.4, f.z)) txt(f.hang ? '5 · SUBIR' : '5 · ¡AGÁRRATE!', _x, _y, blink ? PC[17] : PC[9], 1, 2, 0.5);
    if (!f.cpu && o.tn && o.stun > 0 && hypot(o.x - f.x, o.z - f.z) < 2.6 && P(o.x, o.y + 2.6, o.z)) {
      txt('¡REMATE!', _x, _y - 12, blink ? PC[17] : PC[14], 1, 2, 0.5);
      txt('1 ESPADA · 2 ESCUDO · 4 HECHIZO', _x, _y, PC[9], 1, 1, 0.5);
    }
  }
  txt(ceil(TM), FW / 2, 6, TM < 10 && blink ? PC[15] : PC[9], 2, 3, 0.5);
  if (phase === 'intro' && PT > 0.3) txt('RONDA ' + RND, FW / 2, 120, PC[14], 3, 6, 0.5);
  if (msgT > 0) txt(msg, FW / 2, 120, PC[17], 3, 6, 0.5);
  if (phase === 'end') {
    const w = winner;
    const s = mode === 'solo' ? (w === 0 ? '¡GANASTE!' : 'PERDISTE') : w ? 'GANA J2' : 'GANA J1';
    txt(s, FW / 2, 60, PCI[w], 3, 7, 0.5);
    if (mode === 'solo') txt('RACHA ' + streak + ' · RÉCORD ' + best, FW / 2, 108, PC[8], 1, 2, 0.5);
    if (PT > 1.5 && blink) txt(mode === 'solo' && w === 0 ? 'START 1 · SIGUIENTE RIVAL' : 'START 1 · OTRA VEZ', FW / 2, 250, PC[9], 1, 2, 0.5);
  }
}

// --- Carga: el mundo se genera de verdad mientras se ve el progreso ---

const TASKS = [];
TASKS.push([0, buildLut]);
for (let i = 0; i < 32; i++) TASKS.push([0, () => genSnow(i * 32, i * 32 + 32)]);
for (let i = 0; i < 8; i++) TASKS.push([0, () => genCloud(i * 32, i * 32 + 32)]);
TASKS.push([0, shadeCloud]);
TASKS.push([0, buildWalls]);
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
