// Generates the AuraSync brand icons (modern minimal design):
//   icon.png (512) + icon.ico (7 sizes) — squircle badge, clean cloud with arrow cutout
//   tray.ico + tray-icon.png — circular badge version, crisp at 16px
// Usage: node scripts/generate-brand-icons.js
const fs = require('fs');
const path = require('path');
const os = require('os');
const { execSync } = require('child_process');

const root = path.resolve(__dirname, '..');
const outDir = path.join(os.tmpdir(), 'aurasync-icons');
fs.mkdirSync(outDir, { recursive: true });

const psScript = `
Add-Type -AssemblyName System.Drawing
$ErrorActionPreference = 'Stop'

function New-RoundRect($x, $y, $w, $h, $r) {
  $p = New-Object System.Drawing.Drawing2D.GraphicsPath
  $d = $r * 2
  $p.AddArc($x, $y, $d, $d, 180, 90)
  $p.AddArc($x + $w - $d, $y, $d, $d, 270, 90)
  $p.AddArc($x + $w - $d, $y + $h - $d, $d, $d, 0, 90)
  $p.AddArc($x, $y + $h - $d, $d, $d, 90, 90)
  $p.CloseFigure()
  return $p
}

function Save-Scaled($bmp512, $outPath, $size) {
  $b = New-Object System.Drawing.Bitmap($size, $size, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
  $g = [System.Drawing.Graphics]::FromImage($b)
  $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
  $g.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
  $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
  $g.DrawImage($bmp512, 0, 0, $size, $size)
  $g.Dispose()
  $b.Save($outPath, [System.Drawing.Imaging.ImageFormat]::Png)
  $b.Dispose()
}

# Clean 3-bump cloud silhouette built as a true union (no overlapping seams)
function Get-CloudRegion() {
  $cloud = New-Object System.Drawing.Drawing2D.GraphicsPath
  $cloud.FillMode = [System.Drawing.Drawing2D.FillMode]::Winding
  $cloud.AddEllipse(86, 210, 150, 150)   # left bump
  $cloud.AddEllipse(156, 140, 200, 200)  # center bump
  $cloud.AddEllipse(276, 210, 150, 150)  # right bump
  $base = New-RoundRect 86 268 340 138 69 # flat rounded base
  $cloud.AddPath($base, $true)
  return (New-Object System.Drawing.Region($cloud))
}

# Bold download arrow (rounded stem + triangle head)
function Get-ArrowRegion() {
  $arrow = New-Object System.Drawing.Drawing2D.GraphicsPath
  $arrow.FillMode = [System.Drawing.Drawing2D.FillMode]::Winding
  $stem = New-RoundRect 224 196 64 108 32
  $arrow.AddPath($stem, $true)
  $pts = [System.Drawing.Point[]]@(
    (New-Object System.Drawing.Point(176, 300)),
    (New-Object System.Drawing.Point(336, 300)),
    (New-Object System.Drawing.Point(256, 378))
  )
  $arrow.AddPolygon($pts)
  return (New-Object System.Drawing.Region($arrow))
}

# ---------------- App icon: squircle badge ----------------
$bmp = New-Object System.Drawing.Bitmap(512, 512, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
$g = [System.Drawing.Graphics]::FromImage($bmp)
$g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias

$badge = New-RoundRect 0 0 512 512 118
$rect = New-Object System.Drawing.Rectangle(0, 0, 512, 512)
$grad = New-Object System.Drawing.Drawing2D.LinearGradientBrush(
  $rect,
  [System.Drawing.Color]::FromArgb(255, 102, 163, 255),
  [System.Drawing.Color]::FromArgb(255, 43, 95, 232),
  90)
$g.FillPath($grad, $badge)

# soft top gloss for a modern glass feel
$g.SetClip($badge)
$glossRect = New-Object System.Drawing.Rectangle(0, 0, 512, 210)
$gloss = New-Object System.Drawing.Drawing2D.LinearGradientBrush(
  $glossRect,
  [System.Drawing.Color]::FromArgb(64, 255, 255, 255),
  [System.Drawing.Color]::FromArgb(0, 255, 255, 255),
  90)
$g.FillRectangle($gloss, $glossRect)
$g.ResetClip()

# White cloud with the arrow cleanly cut out of it
$cloudRegion = Get-CloudRegion
$cloudRegion.Exclude((Get-ArrowRegion))
$white = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::White)
$g.FillRegion($white, $cloudRegion)
$g.Dispose()

Save-Scaled $bmp (Join-Path '${outDir}' 'icon-512.png') 512
foreach ($sz in @(256, 128, 64, 48, 32, 24, 16)) {
  Save-Scaled $bmp (Join-Path '${outDir}' ("icon-" + $sz + ".png")) $sz
}
$bmp.Dispose()

# ---------------- Tray icon: circular badge, same clean cloud ----------------
$tbmp = New-Object System.Drawing.Bitmap(512, 512, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
$tg = [System.Drawing.Graphics]::FromImage($tbmp)
$tg.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias

$circleRect = New-Object System.Drawing.Rectangle(12, 12, 488, 488)
$circleGrad = New-Object System.Drawing.Drawing2D.LinearGradientBrush(
  $circleRect,
  [System.Drawing.Color]::FromArgb(255, 102, 163, 255),
  [System.Drawing.Color]::FromArgb(255, 43, 95, 232),
  90)
$tg.FillEllipse($circleGrad, $circleRect)

$tScale = 0.92
$tg.TranslateTransform(256 * (1 - $tScale), 236 * (1 - $tScale))
$tg.ScaleTransform($tScale, $tScale)

$tCloud = Get-CloudRegion
$tCloud.Exclude((Get-ArrowRegion))
$tg.FillRegion($white, $tCloud)
$tg.ResetTransform()
$tg.Dispose()

Save-Scaled $tbmp (Join-Path '${outDir}' 'tray-32.png') 32
Save-Scaled $tbmp (Join-Path '${outDir}' 'tray-64.png') 64
foreach ($tsz in @(16, 20, 24, 32, 40, 48, 64)) {
  Save-Scaled $tbmp (Join-Path '${outDir}' ("tray-" + $tsz + ".png")) $tsz
}
$tbmp.Dispose()

Write-Output 'ICONS_OK'
`;

const ps1 = path.join(outDir, 'gen-icons.ps1');
fs.writeFileSync(ps1, '\uFEFF' + psScript, 'utf8');
const out = execSync(`powershell -NoProfile -ExecutionPolicy Bypass -File "${ps1}"`, { encoding: 'utf8' });
if (!out.includes('ICONS_OK')) {
  console.error('Icon drawing failed.');
  process.exit(1);
}

// ---------------- Assemble multi-size ICOs (PNG entries) ----------------
function buildIco(sizes, fileFor) {
  const buffers = sizes.map((s) => fs.readFileSync(path.join(outDir, fileFor(s))));
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(buffers.length, 4);
  const entries = [];
  let offset = 6 + buffers.length * 16;
  buffers.forEach((buf, i) => {
    const size = sizes[i];
    const entry = Buffer.alloc(16);
    entry.writeUInt8(size >= 256 ? 0 : size, 0);
    entry.writeUInt8(size >= 256 ? 0 : size, 1);
    entry.writeUInt8(0, 2);
    entry.writeUInt8(0, 3);
    entry.writeUInt16LE(1, 4);
    entry.writeUInt16LE(32, 6);
    entry.writeUInt32LE(buf.length, 8);
    entry.writeUInt32LE(offset, 12);
    entries.push(entry);
    offset += buf.length;
  });
  return Buffer.concat([header, ...entries, ...buffers]);
}

const icoSizes = [16, 24, 32, 48, 64, 128, 256];
const ico = buildIco(icoSizes, (s) => `icon-${s}.png`);
fs.writeFileSync(path.join(root, 'icon.ico'), ico);
fs.copyFileSync(path.join(outDir, 'icon-512.png'), path.join(root, 'icon.png'));

const traySizes = [16, 20, 24, 32, 40, 48, 64];
const trayIco = buildIco(traySizes, (s) => `tray-${s}.png`);
fs.writeFileSync(path.join(root, 'tray.ico'), trayIco);
fs.copyFileSync(path.join(outDir, 'tray-32.png'), path.join(root, 'tray-icon.png'));
fs.copyFileSync(path.join(outDir, 'tray-64.png'), path.join(root, 'tray-icon@2x.png'));

console.log(`icon.ico: ${Math.round(ico.length / 1024)} KB (7 sizes)`);
console.log(`tray.ico: ${Math.round(trayIco.length / 1024)} KB (7 sizes)`);
console.log(`icon.png: ${Math.round(fs.statSync(path.join(root, 'icon.png')).size / 1024)} KB (512px)`);
console.log('brand icons regenerated (modern minimal)');
