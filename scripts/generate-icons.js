/* AuraSync brand asset generator — pure Node.js, no external dependencies.
 * Creates a clean gradient cloud logo with a fully transparent background:
 *   icon.png, icon.ico, tray-icon.png, tray-icon@2x.png
 *   assets/cloudvault-folder.ico + assets/cloudvault-folder.png (Explorer badge)
 *
 * Usage: node scripts/generate-icons.js
 */
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

// ---------------------------------------------------------------- PNG encoder
const CRC_TABLE = (() => {
  const table = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c;
  }
  return table;
})();

function crc32(buffer) {
  let crc = 0xffffffff;
  for (let i = 0; i < buffer.length; i++) {
    crc = CRC_TABLE[(crc ^ buffer[i]) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function pngChunk(type, data) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length, 0);
  const typeBuffer = Buffer.from(type, 'ascii');
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([typeBuffer, data])), 0);
  return Buffer.concat([length, typeBuffer, data, crc]);
}

function encodePNG(width, height, rgba) {
  const rowSize = width * 4;
  const raw = Buffer.alloc((rowSize + 1) * height);
  for (let y = 0; y < height; y++) {
    raw[y * (rowSize + 1)] = 0; // filter: none
    rgba.copy(raw, y * (rowSize + 1) + 1, y * rowSize, (y + 1) * rowSize);
  }
  const idat = zlib.deflateSync(raw, { level: 9 });
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // RGBA
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    pngChunk('IHDR', ihdr),
    pngChunk('IDAT', idat),
    pngChunk('IEND', Buffer.alloc(0))
  ]);
}

// ----------------------------------------------------------------- ICO encoder
function encodeICO(entries) {
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(entries.length, 4);

  const dirSize = 16 * entries.length;
  let offset = 6 + dirSize;
  const dirs = [];
  for (const entry of entries) {
    const dir = Buffer.alloc(16);
    dir[0] = entry.size >= 256 ? 0 : entry.size;
    dir[1] = entry.size >= 256 ? 0 : entry.size;
    dir.writeUInt16LE(1, 4);
    dir.writeUInt16LE(32, 6);
    dir.writeUInt32LE(entry.png.length, 8);
    dir.writeUInt32LE(offset, 12);
    offset += entry.png.length;
    dirs.push(dir);
  }
  return Buffer.concat([header, ...dirs, ...entries.map((e) => e.png)]);
}

// --------------------------------------------------------------- drawing math
const TOP = [99, 123, 255];     // #637BFF indigo-blue
const BOTTOM = [34, 211, 238];  // #22D3EE cyan
const AURA_A = [139, 92, 246];  // #8B5CF6 violet
const AURA_B = [34, 211, 238];  // #22D3EE cyan

const lerp = (a, b, t) => a + (b - a) * t;
const mix = (c1, c2, t) => [lerp(c1[0], c2[0], t), lerp(c1[1], c2[1], t), lerp(c1[2], c2[2], t)];
const clamp01 = (v) => Math.min(1, Math.max(0, v));

function insideCloud(x, y) {
  const circles = [
    [0, -0.08, 0.50],
    [-0.47, 0.14, 0.335],
    [0.45, 0.12, 0.365]
  ];
  for (const [cx, cy, r] of circles) {
    const dx = x - cx;
    const dy = y - cy;
    if (dx * dx + dy * dy <= r * r) return true;
  }
  // rounded base bar
  const hw = 0.63;
  const hh = 0.16;
  const rad = 0.16;
  const qx = Math.abs(x) - (hw - rad);
  const qy = Math.abs(y - 0.30) - (hh - rad);
  const dx = Math.max(qx, 0);
  const dy = Math.max(qy, 0);
  const dist = Math.sqrt(dx * dx + dy * dy) + Math.min(Math.max(qx, qy), 0) - rad;
  return dist <= 0;
}

// Soft "aura" ring behind the cloud — the brand's signature halo
function insideAura(x, y) {
  const r = Math.hypot(x, y + 0.01);
  const R = 0.9;
  const T = 0.085;
  return r >= R - T / 2 && r <= R + T / 2;
}

function cloudColor(nx, ny) {
  // diagonal gradient with a gentle highlight
  const t = clamp01((ny * 0.72 + nx * 0.28 + 0.62) / 1.24);
  let color = mix(TOP, BOTTOM, t);
  const highlight = Math.max(0, 1 - Math.hypot(nx + 0.32, ny + 0.5)) * 0.28;
  color = mix(color, [255, 255, 255], clamp01(highlight));
  return color;
}

function auraColor(nx, ny) {
  const angle = Math.atan2(ny + 0.01, nx);
  const t = clamp01((angle + Math.PI) / (Math.PI * 2));
  return mix(AURA_A, AURA_B, t);
}

function renderCloud(size, scale = 0.95) {
  const SS = 3;
  const out = Buffer.alloc(size * size * 4);
  const samples = SS * SS;

  for (let py = 0; py < size; py++) {
    for (let px = 0; px < size; px++) {
      let cloudHits = 0;
      let auraHits = 0;
      let cr = 0; let cg = 0; let cb = 0;
      let ar = 0; let ag = 0; let ab = 0;

      for (let sy = 0; sy < SS; sy++) {
        for (let sx = 0; sx < SS; sx++) {
          const fx = (((px + (sx + 0.5) / SS) / size) * 2 - 1) / scale;
          const fy = (((py + (sy + 0.5) / SS) / size) * 2 - 1) / scale;

          if (insideCloud(fx, fy)) {
            cloudHits++;
            const color = cloudColor(fx, fy);
            cr += color[0]; cg += color[1]; cb += color[2];
          } else if (insideAura(fx, fy)) {
            auraHits++;
            const color = auraColor(fx, fy);
            ar += color[0]; ag += color[1]; ab += color[2];
          }
        }
      }

      const auraAlpha = 0.92;
      const weight = cloudHits + auraHits * auraAlpha;
      const idx = (py * size + px) * 4;

      if (weight > 0) {
        out[idx] = Math.round((cr + ar * auraAlpha) / weight);
        out[idx + 1] = Math.round((cg + ag * auraAlpha) / weight);
        out[idx + 2] = Math.round((cb + ab * auraAlpha) / weight);
        out[idx + 3] = Math.round(((cloudHits + auraHits * auraAlpha) / samples) * 255);
      }
    }
  }
  return out;
}

// Distance to line segment
function distToSegment(px, py, x1, y1, x2, y2) {
  const l2 = (x2 - x1) * (x2 - x1) + (y2 - y1) * (y2 - y1);
  if (l2 === 0) return Math.hypot(px - x1, py - y1);
  let t = ((px - x1) * (x2 - x1) + (py - y1) * (y2 - y1)) / l2;
  t = clamp01(t);
  return Math.hypot(px - (x1 + t * (x2 - x1)), py - (y1 + t * (y2 - y1)));
}

function pointInPoly(px, py, vertices) {
  let inside = false;
  for (let i = 0, j = vertices.length - 1; i < vertices.length; j = i++) {
    const xi = vertices[i][0], yi = vertices[i][1];
    const xj = vertices[j][0], yj = vertices[j][1];
    const intersect = ((yi > py) !== (yj > py)) &&
        (px < (xj - xi) * (py - yi) / (yj - yi) + xi);
    if (intersect) inside = !inside;
  }
  return inside;
}

function distToPolyBoundary(px, py, vertices) {
  let minDist = Infinity;
  for (let i = 0, j = vertices.length - 1; i < vertices.length; j = i++) {
    const d = distToSegment(px, py, vertices[j][0], vertices[j][1], vertices[i][0], vertices[i][1]);
    if (d < minDist) minDist = d;
  }
  return minDist;
}

function sdRoundedBox(px, py, x0, y0, x1, y1, r) {
  const cx = (x0 + x1) / 2;
  const cy = (y0 + y1) / 2;
  const halfW = (x1 - x0) / 2;
  const halfH = (y1 - y0) / 2;
  const qx = Math.abs(px - cx) - halfW + r;
  const qy = Math.abs(py - cy) - halfH + r;
  return Math.min(Math.max(qx, qy), 0) + Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) - r;
}

function renderBadge(size) {
  const SS = size <= 32 ? 4 : 3;
  const totalSamples = SS * SS;
  const out = Buffer.alloc(size * size * 4);

  const X0 = 0.11;
  const X1 = 0.89;
  const Y_TAB_TOP = 0.20;
  const X_TAB_END = 0.41;
  const X_SLOPE_END = 0.49;
  const Y_BACK_TOP = 0.27;
  const Y_FRONT_TOP = 0.35;
  const Y_BOTTOM = 0.82;
  const R_CORNER = 0.04;

  const outerPoly = [
    [X0, Y_TAB_TOP + R_CORNER],
    [X0 + R_CORNER, Y_TAB_TOP],
    [X_TAB_END, Y_TAB_TOP],
    [X_SLOPE_END, Y_BACK_TOP],
    [X1 - R_CORNER, Y_BACK_TOP],
    [X1, Y_BACK_TOP + R_CORNER],
    [X1, Y_BOTTOM - R_CORNER],
    [X1 - R_CORNER, Y_BOTTOM],
    [X0 + R_CORNER, Y_BOTTOM],
    [X0, Y_BOTTOM - R_CORNER]
  ];

  const BLUE_GLOW = [0, 220, 255];
  const BLUE_LINE_TOP = [0, 190, 255];
  const BLUE_LINE_BOT = [0, 130, 245];
  
  const TAB_COLOR_TOP = [255, 208, 50];
  const TAB_COLOR_BOT = [238, 162, 14];
  const BACK_FLAP_TOP = [242, 172, 20];
  const BACK_FLAP_BOT = [224, 146, 10];

  const FRONT_FLAP_TOP = [255, 230, 96];
  const FRONT_FLAP_MID = [255, 198, 26];
  const FRONT_FLAP_BOT = [246, 148, 6];
  const FRONT_SHADOW = [200, 115, 0];

  const PAPER_WHITE = [255, 255, 255];
  const PAPER_SHADOW = [228, 238, 248];

  const strokeW = 0.026;
  const glowW = 0.052;

  for (let py = 0; py < size; py++) {
    for (let px = 0; px < size; px++) {
      let accumR = 0, accumG = 0, accumB = 0, accumA = 0;

      for (let sy = 0; sy < SS; sy++) {
        for (let sx = 0; sx < SS; sx++) {
          const u = (px + (sx + 0.5) / SS) / size;
          const v = (py + (sy + 0.5) / SS) / size;

          const inOuter = pointInPoly(u, v, outerPoly);
          const distOuter = distToPolyBoundary(u, v, outerPoly);

          const dFrontBox = sdRoundedBox(u, v, X0, Y_FRONT_TOP, X1, Y_BOTTOM, R_CORNER);
          const inFront = dFrontBox <= 0;

          const distFrontRim = (u >= X0 + R_CORNER && u <= X1 - R_CORNER) 
            ? Math.abs(v - Y_FRONT_TOP) 
            : Infinity;

          const isOuterLine = distOuter <= strokeW;
          const isFrontRimLine = distFrontRim <= (strokeW * 0.7);
          const isLine = isOuterLine || isFrontRimLine;

          if (isLine) {
            const gradT = clamp01((v - Y_TAB_TOP) / (Y_BOTTOM - Y_TAB_TOP));
            const lineCol = mix(BLUE_LINE_TOP, BLUE_LINE_BOT, gradT);

            let alpha = 1.0;
            if (!inOuter) {
              alpha = clamp01((strokeW - distOuter) / (strokeW * 0.4));
            }
            accumR += lineCol[0] * alpha;
            accumG += lineCol[1] * alpha;
            accumB += lineCol[2] * alpha;
            accumA += alpha;
          } else if (inOuter) {
            if (inFront) {
              const t = clamp01((v - Y_FRONT_TOP) / (Y_BOTTOM - Y_FRONT_TOP));
              let yCol = t < 0.45 
                ? mix(FRONT_FLAP_TOP, FRONT_FLAP_MID, t / 0.45)
                : mix(FRONT_FLAP_MID, FRONT_FLAP_BOT, (t - 0.45) / 0.55);

              const sheen = Math.max(0, 1 - Math.abs(u - 0.28) * 1.8) * 0.08;
              yCol = mix(yCol, [255, 255, 255], sheen);

              if (v > Y_BOTTOM - 0.04) {
                const s = (v - (Y_BOTTOM - 0.04)) / 0.04;
                yCol = mix(yCol, FRONT_SHADOW, s * 0.25);
              }

              accumR += yCol[0];
              accumG += yCol[1];
              accumB += yCol[2];
              accumA += 1.0;
            } else {
              if (u <= X_SLOPE_END && v <= Y_BACK_TOP) {
                const t = clamp01((v - Y_TAB_TOP) / (Y_BACK_TOP - Y_TAB_TOP));
                const tabCol = mix(TAB_COLOR_TOP, TAB_COLOR_BOT, t);
                accumR += tabCol[0];
                accumG += tabCol[1];
                accumB += tabCol[2];
                accumA += 1.0;
              } else if (v >= Y_BACK_TOP + 0.01 && v <= Y_FRONT_TOP && u >= X0 + 0.08 && u <= X1 - 0.08) {
                const pt = clamp01((v - (Y_BACK_TOP + 0.01)) / (Y_FRONT_TOP - Y_BACK_TOP));
                const pCol = mix(PAPER_WHITE, PAPER_SHADOW, pt);
                accumR += pCol[0];
                accumG += pCol[1];
                accumB += pCol[2];
                accumA += 1.0;
              } else {
                const t = clamp01((v - Y_BACK_TOP) / (Y_FRONT_TOP - Y_BACK_TOP + 0.05));
                const backCol = mix(BACK_FLAP_TOP, BACK_FLAP_BOT, t);
                accumR += backCol[0];
                accumG += backCol[1];
                accumB += backCol[2];
                accumA += 1.0;
              }
            }
          } else if (distOuter <= glowW) {
            const glowFactor = (1 - (distOuter - strokeW) / (glowW - strokeW)) * 0.25;
            if (glowFactor > 0) {
              accumR += BLUE_GLOW[0] * glowFactor;
              accumG += BLUE_GLOW[1] * glowFactor;
              accumB += BLUE_GLOW[2] * glowFactor;
              accumA += glowFactor;
            }
          }
        }
      }

      const idx = (py * size + px) * 4;
      if (accumA > 0) {
        const finalA = clamp01(accumA / totalSamples);
        out[idx] = Math.round(clamp01(accumR / accumA / 255) * 255);
        out[idx + 1] = Math.round(clamp01(accumG / accumA / 255) * 255);
        out[idx + 2] = Math.round(clamp01(accumB / accumA / 255) * 255);
        out[idx + 3] = Math.round(finalA * 255);
      } else {
        out[idx] = 0;
        out[idx + 1] = 0;
        out[idx + 2] = 0;
        out[idx + 3] = 0;
      }
    }
  }

  return out;
}

// -------------------------------------------------------------------- generate
function pngFor(renderFn, size) {
  return encodePNG(size, size, renderFn(size));
}

// ------------------------------------------------------- BMP (NSIS artwork)
function encodeBMP(width, height, rgba) {
  const rowSize = Math.ceil((width * 3) / 4) * 4;
  const pixelData = Buffer.alloc(rowSize * height);
  for (let y = 0; y < height; y++) {
    const srcY = height - 1 - y; // BMP rows are bottom-up
    for (let x = 0; x < width; x++) {
      const si = (srcY * width + x) * 4;
      const di = y * rowSize + x * 3;
      pixelData[di] = rgba[si + 2];
      pixelData[di + 1] = rgba[si + 1];
      pixelData[di + 2] = rgba[si];
    }
  }
  const fileHeader = Buffer.alloc(14);
  fileHeader.write('BM', 0, 2, 'ascii');
  const dataOffset = 14 + 40;
  fileHeader.writeUInt32LE(dataOffset + pixelData.length, 2);
  fileHeader.writeUInt32LE(dataOffset, 10);
  const info = Buffer.alloc(40);
  info.writeUInt32LE(40, 0);
  info.writeInt32LE(width, 4);
  info.writeInt32LE(height, 8);
  info.writeUInt16LE(1, 12);
  info.writeUInt16LE(24, 14);
  info.writeUInt32LE(pixelData.length, 20);
  return Buffer.concat([fileHeader, info, pixelData]);
}

function makeCanvas(width, height, topColor, bottomColor) {
  const canvas = Buffer.alloc(width * height * 4);
  for (let y = 0; y < height; y++) {
    const t = y / (height - 1);
    const color = mix(topColor, bottomColor, t);
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      canvas[i] = Math.round(color[0]);
      canvas[i + 1] = Math.round(color[1]);
      canvas[i + 2] = Math.round(color[2]);
      canvas[i + 3] = 255;
    }
  }
  return canvas;
}

function blendImage(canvas, W, H, img, size, x0, y0) {
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const dx = x0 + x;
      const dy = y0 + y;
      if (dx < 0 || dy < 0 || dx >= W || dy >= H) continue;
      const si = (y * size + x) * 4;
      const di = (dy * W + dx) * 4;
      const a = img[si + 3] / 255;
      if (a <= 0) continue;
      canvas[di] = Math.round(img[si] * a + canvas[di] * (1 - a));
      canvas[di + 1] = Math.round(img[si + 1] * a + canvas[di + 1] * (1 - a));
      canvas[di + 2] = Math.round(img[si + 2] * a + canvas[di + 2] * (1 - a));
    }
  }
}

function blendCircle(canvas, W, H, cx, cy, radius, color, alpha) {
  for (let y = Math.max(0, cy - radius); y < Math.min(H, cy + radius); y++) {
    for (let x = Math.max(0, cx - radius); x < Math.min(W, cx + radius); x++) {
      const d = Math.hypot(x - cx, y - cy);
      if (d > radius) continue;
      const a = alpha * (1 - d / radius);
      const i = (y * W + x) * 4;
      canvas[i] = Math.round(color[0] * a + canvas[i] * (1 - a));
      canvas[i + 1] = Math.round(color[1] * a + canvas[i + 1] * (1 - a));
      canvas[i + 2] = Math.round(color[2] * a + canvas[i + 2] * (1 - a));
    }
  }
}

// Tiny 5x7 bitmap font (only the letters used by the installer artwork)
const FONT = {
  A: ['01110', '10001', '10001', '11111', '10001', '10001', '10001'],
  B: ['11110', '10001', '10001', '11110', '10001', '10001', '11110'],
  C: ['01110', '10001', '10000', '10000', '10000', '10001', '01110'],
  D: ['11110', '10001', '10001', '10001', '10001', '10001', '11110'],
  E: ['11111', '10000', '10000', '11110', '10000', '10000', '11111'],
  K: ['10001', '10010', '10100', '11000', '10100', '10010', '10001'],
  L: ['10000', '10000', '10000', '10000', '10000', '10000', '11111'],
  N: ['10001', '11001', '10101', '10011', '10001', '10001', '10001'],
  O: ['01110', '10001', '10001', '10001', '10001', '10001', '01110'],
  P: ['11110', '10001', '10001', '11110', '10000', '10000', '10000'],
  R: ['11110', '10001', '10001', '11110', '10100', '10010', '10001'],
  S: ['01111', '10000', '10000', '01110', '00001', '00001', '11110'],
  U: ['10001', '10001', '10001', '10001', '10001', '10001', '01110'],
  Y: ['10001', '10001', '01010', '00100', '00100', '00100', '00100'],
  ' ': ['00000', '00000', '00000', '00000', '00000', '00000', '00000']
};

function textWidth(text, scale, gap) {
  return text.length * 5 * scale + (text.length - 1) * gap;
}

function drawText(canvas, W, H, text, x0, y0, scale, color, gap) {
  let cursor = x0;
  for (const ch of text) {
    const glyph = FONT[ch] || FONT[' '];
    for (let gy = 0; gy < 7; gy++) {
      for (let gx = 0; gx < 5; gx++) {
        if (glyph[gy][gx] !== '1') continue;
        for (let sy = 0; sy < scale; sy++) {
          for (let sx = 0; sx < scale; sx++) {
            const x = cursor + gx * scale + sx;
            const y = y0 + gy * scale + sy;
            if (x < 0 || y < 0 || x >= W || y >= H) continue;
            const i = (y * W + x) * 4;
            canvas[i] = color[0];
            canvas[i + 1] = color[1];
            canvas[i + 2] = color[2];
            canvas[i + 3] = 255;
          }
        }
      }
    }
    cursor += 5 * scale + gap;
  }
}

function buildInstallerArtwork(assets) {
  // Welcome/sidebar image (164x314 as expected by NSIS)
  const SW = 164;
  const SH = 314;
  const sidebar = makeCanvas(SW, SH, [14, 20, 36], [8, 9, 14]);
  blendCircle(sidebar, SW, SH, SW / 2, 120, 90, [91, 140, 255], 0.16);
  blendCircle(sidebar, SW, SH, SW / 2, 120, 55, [34, 211, 238], 0.12);

  const cloudSide = renderCloud(120);
  blendImage(sidebar, SW, SH, cloudSide, 120, Math.round((SW - 120) / 2), 60);

  const title = 'AURASYNC';
  const titleScale = 3;
  drawText(sidebar, SW, SH, title, Math.round((SW - textWidth(title, titleScale, 3)) / 2), 206, titleScale, [245, 245, 247], 3);

  const subtitle = 'CLOUD BACKUP';
  const subScale = 2;
  drawText(sidebar, SW, SH, subtitle, Math.round((SW - textWidth(subtitle, subScale, 2)) / 2), 240, subScale, [124, 132, 148], 2);

  fs.writeFileSync(path.join(assets, 'installer-sidebar.bmp'), encodeBMP(SW, SH, sidebar));
  fs.writeFileSync(path.join(assets, 'installer-sidebar.png'), encodePNG(SW, SH, sidebar));

  // Header image (150x57 as expected by NSIS) - keep custom realistic cloud if exists
  if (!fs.existsSync(path.join(assets, 'installer-header.bmp'))) {
    const HW = 150;
    const HH = 57;
    const header = makeCanvas(HW, HH, [255, 255, 255], [255, 255, 255]);
    const cloudHeader = renderCloud(48);
    blendImage(header, HW, HH, cloudHeader, 48, Math.round((HW - 48) / 2), 4);
    fs.writeFileSync(path.join(assets, 'installer-header.bmp'), encodeBMP(HW, HH, header));
    fs.writeFileSync(path.join(assets, 'installer-header.png'), encodePNG(HW, HH, header));
  }
}


function main() {
  const root = path.resolve(__dirname, '..');
  const assets = path.join(root, 'assets');
  if (!fs.existsSync(assets)) fs.mkdirSync(assets, { recursive: true });

  // App icon (transparent)
  const icon512 = pngFor(renderCloud, 512);
  fs.writeFileSync(path.join(root, 'icon.png'), icon512);

  const icoSizes = [16, 24, 32, 48, 64, 128, 256];
  const iconIco = encodeICO(icoSizes.map((size) => ({ size, png: pngFor(renderCloud, size) })));
  fs.writeFileSync(path.join(root, 'icon.ico'), iconIco);

  // Tray icons
  fs.writeFileSync(path.join(root, 'tray-icon.png'), pngFor(renderCloud, 32));
  fs.writeFileSync(path.join(root, 'tray-icon@2x.png'), pngFor(renderCloud, 64));

  // Explorer folder badge (saves both new and legacy filenames)
  const badgeIco = encodeICO([16, 24, 32, 48, 64, 128, 256].map((size) => ({ size, png: pngFor(renderBadge, size) })));
  fs.writeFileSync(path.join(assets, 'aurasync-folder.ico'), badgeIco);
  fs.writeFileSync(path.join(assets, 'aurasync-folder.png'), pngFor(renderBadge, 128));
  fs.writeFileSync(path.join(assets, 'cloudvault-folder.ico'), badgeIco);
  fs.writeFileSync(path.join(assets, 'cloudvault-folder.png'), pngFor(renderBadge, 128));

  // NSIS installer artwork (sidebar + header)
  buildInstallerArtwork(assets);

  console.log('AuraSync icons generated:');
  console.log('  icon.png             ', icon512.length, 'bytes');
  console.log('  icon.ico             ', iconIco.length, 'bytes');
  console.log('  tray-icon.png        ', fs.statSync(path.join(root, 'tray-icon.png')).size, 'bytes');
  console.log('  tray-icon@2x.png     ', fs.statSync(path.join(root, 'tray-icon@2x.png')).size, 'bytes');
  console.log('  cloudvault-folder.ico', badgeIco.length, 'bytes');

  if (process.argv.includes('--preview')) {
    const sizes = [16, 24, 32, 48, 64, 128];
    const gap = 16;
    const maxSize = 128;
    const W = sizes.reduce((sum, s) => sum + s + gap, gap);
    const H = maxSize * 2 + gap * 3;
    const canvas = Buffer.alloc(W * H * 4);

    for (let y = 0; y < H; y++) {
      const light = y > maxSize + gap * 1.5;
      for (let x = 0; x < W; x++) {
        const i = (y * W + x) * 4;
        canvas[i] = light ? 244 : 10;
        canvas[i + 1] = light ? 246 : 11;
        canvas[i + 2] = light ? 249 : 14;
        canvas[i + 3] = 255;
      }
    }

    const paste = (img, s, x0, y0) => {
      for (let y = 0; y < s; y++) {
        for (let x = 0; x < s; x++) {
          const si = (y * s + x) * 4;
          const di = ((y0 + y) * W + (x0 + x)) * 4;
          const a = img[si + 3] / 255;
          for (let k = 0; k < 3; k++) {
            canvas[di + k] = Math.round(img[si + k] * a + canvas[di + k] * (1 - a));
          }
          canvas[di + 3] = 255;
        }
      }
    };

    let x = gap;
    for (const s of sizes) {
      const img = renderCloud(s);
      paste(img, s, x, gap + (maxSize - s) / 2);
      paste(img, s, x, 2 * gap + maxSize + (maxSize - s) / 2);
      x += s + gap;
    }

    fs.writeFileSync(path.join(assets, 'icon-preview.png'), encodePNG(W, H, canvas));
    console.log('  icon-preview.png      written');
  }
}

main();
