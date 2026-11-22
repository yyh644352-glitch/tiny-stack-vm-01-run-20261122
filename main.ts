// Tiny stack-machine VM for make.fun's tiny stack ISA, version 1.
// One run answers every /input/<id>/program.bin on its /input/<id>/input.bin,
// writing /output/<id>/stdout.bin and /output/<id>/exit.txt. Node 22, no deps.
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

function run(p: Uint8Array, inp: Uint8Array): [Uint8Array, number] {
  const S = new Int32Array(256);
  const C = new Int32Array(64);
  const M = new Int32Array(256);
  const O = new Uint8Array(65536);
  let sp = 0, cp = 0, ol = 0, pc = 0, ip = 0, st = 0;
  const n = p.length;
  const done = (code: number): [Uint8Array, number] => [O.subarray(0, ol), code];
  for (;;) {
    if (st === 1000000) return done(10);
    if (pc < 0 || pc >= n) return done(9);
    const op = p[pc];
    const ok = op < 8 || (op >= 0x10 && op <= 0x1e) || (op >= 0x20 && op <= 0x22) ||
      (op >= 0x30 && op <= 0x34) || (op >= 0x40 && op <= 0x41) || (op >= 0x50 && op <= 0x53);
    if (!ok) return done(5);
    const im = op === 1 ? 1 : op === 2 ? 4 : op >= 0x30 && op <= 0x33 ? 2 : 0;
    if (pc + im >= n) return done(9);
    st++;
    const nx = pc + 1 + im;
    let pops = 0, push = 0;
    if (op === 3 || op === 4 || op === 0x17 || op === 0x1b || op === 0x31 || op === 0x32 ||
      op === 0x40 || op === 0x50 || op === 0x51 || op === 0x53) pops = 1;
    else if (op === 5 || op === 6 || (op >= 0x10 && op <= 0x22 && op !== 0x17 && op !== 0x1b) || op === 0x41) pops = 2;
    else if (op === 7) pops = 3;
    if (op === 1 || op === 2 || (op >= 0x10 && op <= 0x22) || op === 0x40 || op === 0x52) push = 1;
    else if (op === 4 || op === 5) push = 2;
    else if (op === 6 || op === 7) push = 3;
    if (sp < pops) return done(2);
    if (sp - pops + push > 256) return done(3);
    pc = nx;
    switch (op) {
      case 0x00: return done(0);
      case 0x01: S[sp++] = (p[nx - 1] << 24) >> 24; break;
      case 0x02: S[sp++] = p[nx - 4] | (p[nx - 3] << 8) | (p[nx - 2] << 16) | (p[nx - 1] << 24); break;
      case 0x03: sp--; break;
      case 0x04: S[sp] = S[sp - 1]; sp++; break;
      case 0x05: { const t = S[sp - 1]; S[sp - 1] = S[sp - 2]; S[sp - 2] = t; break; }
      case 0x06: S[sp] = S[sp - 2]; sp++; break;
      case 0x07: { const a = S[sp - 3]; S[sp - 3] = S[sp - 2]; S[sp - 2] = S[sp - 1]; S[sp - 1] = a; break; }
      case 0x17: S[sp - 1] = -S[sp - 1] | 0; break;
      case 0x1b: S[sp - 1] = ~S[sp - 1]; break;
      case 0x10: case 0x11: case 0x12: case 0x13: case 0x14: case 0x15: case 0x16:
      case 0x18: case 0x19: case 0x1a: case 0x1c: case 0x1d: case 0x1e:
      case 0x20: case 0x21: case 0x22: {
        const b = S[sp - 1], a = S[sp - 2];
        let r = 0;
        if (op === 0x10) r = (a + b) | 0;
        else if (op === 0x11) r = (a - b) | 0;
        else if (op === 0x12) r = Math.imul(a, b);
        else if (op === 0x13) { if (b === 0) return done(4); r = a === -2147483648 && b === -1 ? a : (a / b) | 0; }
        else if (op === 0x14) { if (b === 0) return done(4); r = b === -1 ? 0 : (a % b) | 0; }
        else if (op === 0x15) { if (b === 0) return done(4); r = Math.floor((a >>> 0) / (b >>> 0)) | 0; }
        else if (op === 0x16) { if (b === 0) return done(4); r = ((a >>> 0) % (b >>> 0)) | 0; }
        else if (op === 0x18) r = a & b;
        else if (op === 0x19) r = a | b;
        else if (op === 0x1a) r = a ^ b;
        else if (op === 0x1c) r = a << (b & 31);
        else if (op === 0x1d) r = a >> (b & 31);
        else if (op === 0x1e) r = (a >>> (b & 31)) | 0;
        else if (op === 0x20) r = a === b ? 1 : 0;
        else if (op === 0x21) r = a < b ? 1 : 0;
        else r = (a >>> 0) < (b >>> 0) ? 1 : 0;
        sp -= 2; S[sp++] = r; break;
      }
      case 0x30: case 0x31: case 0x32: {
        const rel = ((p[nx - 2] | (p[nx - 1] << 8)) << 16) >> 16;
        if (op === 0x30) pc = nx + rel;
        else if (op === 0x31) { if (S[--sp] === 0) pc = nx + rel; }
        else if (S[--sp] !== 0) pc = nx + rel;
        break;
      }
      case 0x33:
        if (cp === 64) return done(7);
        C[cp++] = nx; pc = p[nx - 2] | (p[nx - 1] << 8); break;
      case 0x34:
        if (cp === 0) return done(8);
        pc = C[--cp]; break;
      case 0x40: {
        const a = S[sp - 1];
        if (a < 0 || a > 255) return done(6);
        S[sp - 1] = M[a]; break;
      }
      case 0x41: {
        const a = S[sp - 1], v = S[sp - 2];
        if (a < 0 || a > 255) return done(6);
        sp -= 2; M[a] = v; break;
      }
      case 0x50: {
        const s = String(S[sp - 1]);
        if (ol + s.length > 65536) return done(11);
        sp--;
        for (let i = 0; i < s.length; i++) O[ol++] = s.charCodeAt(i);
        break;
      }
      case 0x51:
        if (ol + 1 > 65536) return done(11);
        O[ol++] = S[--sp] & 255; break;
      case 0x52: S[sp++] = ip < inp.length ? inp[ip++] : -1; break;
      case 0x53: return done(S[--sp] & 255);
    }
  }
}

const I = process.env.MAKEFUN_INPUT_DIR ?? '/input';
const O = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';
for (const id of readdirSync(I).sort()) {
  const [out, code] = run(
    new Uint8Array(readFileSync(join(I, id, 'program.bin'))),
    new Uint8Array(readFileSync(join(I, id, 'input.bin'))),
  );
  mkdirSync(join(O, id), { recursive: true });
  writeFileSync(join(O, id, 'stdout.bin'), out);
  writeFileSync(join(O, id, 'exit.txt'), `${code}\n`);
}
