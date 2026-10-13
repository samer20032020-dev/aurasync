const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

// --- CRC32 & PNG ENCODER ---
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
    raw[y * (rowSize + 1)] = 0;
    rgba.copy(raw, y * (rowSize + 1) + 1, y * rowSize, (y + 1) * rowSize);
  }
  const idat = zlib.deflateSync(raw, { level: 9 });
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    pngChunk('IHDR', ihdr),
    pngChunk('IDAT', idat),
    pngChunk('IEND', Buffer.alloc(0))
  ]);
}

// --- ICO ENCODER ---
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

// --- MATH & DRAWING UTILITIES ---
const lerp = (a, b, t) => a + (b - a) * t;
const mix = (c1, c2, t) => [lerp(c1[0], c2[0], t), lerp(c1[1], c2[1], t), lerp(c1[2], c2[2], t)];
const clamp = (v, min, max) => Math.min(max, Math.max(min, v));

function distToSegment(px, py, x1, y1, x2, y2) {
  const l2 = (x2 - x1) * (x2 - x1) + (y2 - y1) * (y2 - y1);
  if (l2 === 0) return Math.hypot(px - x1, py - y1);
  let t = ((px - x1) * (x2 - x1) + (py - y1) * (y2 - y1)) / l2;
  t = clamp(t, 0, 1);
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

/**
 * Renders the authentic Windows Yellow Folder with an illuminated Cyan/Blue outline contour.
 */
function renderYellowFolderWithBlueBorder(size) {
  const SS = size <= 32 ? 4 : 3;
  const totalSamples = SS * SS;
  const out = Buffer.alloc(size * size * 4);

  // Exact polygon of the folder silhouette
  // Coordinates are normalized 0..1
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

  // Palette
  const BLUE_GLOW = [0, 220, 255];        // #00DCFF
  const BLUE_LINE_TOP = [0, 190, 255];    // #00BEFF
  const BLUE_LINE_BOT = [0, 130, 245];    // #0082F5
  
  // Windows folder colors (warm gold / radiant amber)
  const TAB_COLOR_TOP = [255, 208, 50];   // #FFD032
  const TAB_COLOR_BOT = [238, 162, 14];   // #EEA20E
  
  const BACK_FLAP_TOP = [242, 172, 20];   // #F2AC14
  const BACK_FLAP_BOT = [224, 146, 10];   // #E0920A

  const FRONT_FLAP_TOP = [255, 230, 96];  // #FFE660 (Golden sunny yellow)
  const FRONT_FLAP_MID = [255, 198, 26];  // #FFC61A
  const FRONT_FLAP_BOT = [246, 148, 6];   // #F69406
  const FRONT_SHADOW = [200, 115, 0];     // #C87300

  const PAPER_WHITE = [255, 255, 255];
  const PAPER_SHADOW = [228, 238, 248];

  const strokeW = 0.026;  // Half-thickness of the blue contour
  const glowW = 0.052;    // Soft outer glow

  for (let py = 0; py < size; py++) {
    for (let px = 0; px < size; px++) {
      let accumR = 0, accumG = 0, accumB = 0, accumA = 0;

      for (let sy = 0; sy < SS; sy++) {
        for (let sx = 0; sx < SS; sx++) {
          const u = (px + (sx + 0.5) / SS) / size;
          const v = (py + (sy + 0.5) / SS) / size;

          const inOuter = pointInPoly(u, v, outerPoly);
          const distOuter = distToPolyBoundary(u, v, outerPoly);

          // Front flap check (rounded box from X0 to X1, Y_FRONT_TOP to Y_BOTTOM)
          const dFrontBox = sdRoundedBox(u, v, X0, Y_FRONT_TOP, X1, Y_BOTTOM, R_CORNER);
          const inFront = dFrontBox <= 0;

          // Front flap top rim distance
          const distFrontRim = (u >= X0 + R_CORNER && u <= X1 - R_CORNER) 
            ? Math.abs(v - Y_FRONT_TOP) 
            : Infinity;

          // Blue line logic:
          // Traces the outer perimeter of the folder + the front flap top rim
          const isOuterLine = distOuter <= strokeW;
          const isFrontRimLine = distFrontRim <= (strokeW * 0.7);
          const isLine = isOuterLine || isFrontRimLine;

          if (isLine) {
            // Blue contour line
            const gradT = clamp((v - Y_TAB_TOP) / (Y_BOTTOM - Y_TAB_TOP), 0, 1);
            const lineCol = mix(BLUE_LINE_TOP, BLUE_LINE_BOT, gradT);

            let alpha = 1.0;
            if (!inOuter) {
              // Antialiased outer falloff
              alpha = clamp((strokeW - distOuter) / (strokeW * 0.4), 0, 1);
            }
            accumR += lineCol[0] * alpha;
            accumG += lineCol[1] * alpha;
            accumB += lineCol[2] * alpha;
            accumA += alpha;
          } else if (inOuter) {
            // INSIDE THE FOLDER: 100% Authentic Yellow!
            if (inFront) {
              // Front flap yellow gradient
              const t = clamp((v - Y_FRONT_TOP) / (Y_BOTTOM - Y_FRONT_TOP), 0, 1);
              let yCol = t < 0.45 
                ? mix(FRONT_FLAP_TOP, FRONT_FLAP_MID, t / 0.45)
                : mix(FRONT_FLAP_MID, FRONT_FLAP_BOT, (t - 0.45) / 0.55);

              // Subtle horizontal lighting sheen
              const sheen = Math.max(0, 1 - Math.abs(u - 0.28) * 1.8) * 0.08;
              yCol = mix(yCol, [255, 255, 255], sheen);

              // Bottom subtle shadow
              if (v > Y_BOTTOM - 0.04) {
                const s = (v - (Y_BOTTOM - 0.04)) / 0.04;
                yCol = mix(yCol, FRONT_SHADOW, s * 0.25);
              }

              accumR += yCol[0];
              accumG += yCol[1];
              accumB += yCol[2];
              accumA += 1.0;
            } else {
              // Upper section (tab / document paper / back flap)
              if (u <= X_SLOPE_END && v <= Y_BACK_TOP) {
                // Tab area
                const t = clamp((v - Y_TAB_TOP) / (Y_BACK_TOP - Y_TAB_TOP), 0, 1);
                const tabCol = mix(TAB_COLOR_TOP, TAB_COLOR_BOT, t);
                accumR += tabCol[0];
                accumG += tabCol[1];
                accumB += tabCol[2];
                accumA += 1.0;
              } else if (v >= Y_BACK_TOP + 0.01 && v <= Y_FRONT_TOP && u >= X0 + 0.08 && u <= X1 - 0.08) {
                // Document paper peeking inside
                const pt = clamp((v - (Y_BACK_TOP + 0.01)) / (Y_FRONT_TOP - Y_BACK_TOP), 0, 1);
                const pCol = mix(PAPER_WHITE, PAPER_SHADOW, pt);
                accumR += pCol[0];
                accumG += pCol[1];
                accumB += pCol[2];
                accumA += 1.0;
              } else {
                // Back flap yellow
                const t = clamp((v - Y_BACK_TOP) / (Y_FRONT_TOP - Y_BACK_TOP + 0.05), 0, 1);
                const backCol = mix(BACK_FLAP_TOP, BACK_FLAP_BOT, t);
                accumR += backCol[0];
                accumG += backCol[1];
                accumB += backCol[2];
                accumA += 1.0;
              }
            }
          } else if (distOuter <= glowW) {
            // Subtle ambient outer glow around the folder
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
        const finalA = clamp(accumA / totalSamples, 0, 1);
        out[idx] = Math.round(clamp(accumR / accumA, 0, 255));
        out[idx + 1] = Math.round(clamp(accumG / accumA, 0, 255));
        out[idx + 2] = Math.round(clamp(accumB / accumA, 0, 255));
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

// Generate the icons
const root = path.resolve(__dirname, '..');
const assets = path.join(root, 'assets');

console.log('Rendering Yellow Folder with Connected Tab and Blue Contour Line...');
const icoSizes = [16, 24, 32, 48, 64, 128, 256];
const icoEntries = icoSizes.map((size) => ({
  size,
  png: encodePNG(size, size, renderYellowFolderWithBlueBorder(size))
}));

const icoBuffer = encodeICO(icoEntries);
fs.writeFileSync(path.join(assets, 'cloudvault-folder.ico'), icoBuffer);
fs.writeFileSync(path.join(assets, 'cloudvault-folder.png'), encodePNG(128, 128, renderYellowFolderWithBlueBorder(128)));
fs.writeFileSync(path.join(assets, 'cloudvault-folder-preview.png'), encodePNG(256, 256, renderYellowFolderWithBlueBorder(256)));

console.log('Successfully generated assets/cloudvault-folder.ico!');
