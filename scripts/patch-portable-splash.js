// Prepares the portable setup for reliable installation:
//  1. Compiles scripts/aurasync-splash.cs -> assets/aurasync-splash.exe
//     (tiny native animated transparent splash, starts in <1s)
//  2. Patches electron-builder's portable NSIS template:
//     - shows the animated splash instead of the standard one
//     - gives EVERY run its own private extraction folder (electron-builder's
//       default UNPACK_DIR_NAME is shared between runs, so a second setup (or a
//       closing one) could wipe files mid-install — this caused broken installs)
//
// Runs automatically as part of `npm run dist` (idempotent).
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const root = path.resolve(__dirname, '..');
const templatePath = path.join(
  root,
  'node_modules',
  'app-builder-lib',
  'templates',
  'nsis',
  'portable.nsi'
);
const csSource = path.join(root, 'scripts', 'aurasync-splash.cs');
const exePath = path.join(root, 'assets', 'aurasync-splash.exe');

function compileSplashExe() {
  const winDir = process.env.WINDIR || 'C:\\Windows';
  const candidates = [
    path.join(winDir, 'Microsoft.NET', 'Framework64', 'v4.0.30319', 'csc.exe'),
    path.join(winDir, 'Microsoft.NET', 'Framework', 'v4.0.30319', 'csc.exe')
  ];
  const csc = candidates.find((p) => fs.existsSync(p));
  if (!csc) {
    console.error('C# compiler (csc.exe) not found — cannot build the instant splash.');
    process.exit(1);
  }

  const res = spawnSync(
    csc,
    [
      '/nologo',
      '/target:winexe',
      `/out:${exePath}`,
      '/reference:System.dll',
      '/reference:System.Windows.Forms.dll',
      '/reference:System.Drawing.dll',
      csSource
    ],
    { encoding: 'utf8' }
  );

  if (res.status !== 0 || !fs.existsSync(exePath)) {
    console.error('Splash compile failed:');
    console.error(res.stdout || '');
    console.error(res.stderr || '');
    process.exit(1);
  }
  console.log(`Compiled animated splash: ${exePath} (${Math.round(fs.statSync(exePath).size / 1024)} KB)`);
}

function patchTemplate() {
  if (!fs.existsSync(templatePath)) {
    console.error('portable.nsi template not found — run npm install first.');
    process.exit(1);
  }

  const exeNsisPath = exePath.replace(/\//g, '\\');
  let content = fs.readFileSync(templatePath, 'utf8');
  let changed = false;

  // ------------------------------------------------------------------
  // Patch 1: private extraction folder per run (fixes cross-run wipes)
  // ------------------------------------------------------------------
  if (content.includes('UNPACK_DIR_NAME')) {
    const blockLF = [
      '  StrCpy $INSTDIR "$PLUGINSDIR\\app"',
      '  !ifdef UNPACK_DIR_NAME',
      '    StrCpy $INSTDIR "$TEMP\\${UNPACK_DIR_NAME}"',
      '  !endif'
    ].join('\n');
    const blockCRLF = blockLF.replace(/\n/g, '\r\n');
    const replacement = '  StrCpy $INSTDIR "$PLUGINSDIR\\app"';

    if (content.includes(blockLF)) {
      content = content.replace(blockLF, replacement);
      changed = true;
    } else if (content.includes(blockCRLF)) {
      content = content.replace(blockCRLF, replacement.replace(/\n/g, '\r\n'));
      changed = true;
    } else {
      console.error('UNPACK_DIR_NAME block not found in the expected form — patch aborted.');
      process.exit(1);
    }
    console.log('Patched portable.nsi: each run gets its own extraction folder.');
  }

  // ------------------------------------------------------------------
  // Patch 2: animated transparent splash
  // ------------------------------------------------------------------
  if (!content.includes('aurasync-splash.exe')) {
    // 2a. Clean .onGUIInit (remove any previous splash drawing there)
    content = content.replace(
      /Function \.onGUIInit[\s\S]*?FunctionEnd/,
      `Function .onGUIInit\n  InitPluginsDir\nFunctionEnd`
    );

    // 2b. Always run the NSIS shell silently — our own splash is the visible UI
    content = content.replace(
      /  !ifndef SPLASH_IMAGE\r?\n    SetSilent silent\r?\n  !endif/,
      '  SetSilent silent'
    );

    // 2c. Launch the animated splash right at the start of the extraction section
    const sectionHead = /Section\r?\n  !ifdef SPLASH_IMAGE\r?\n    HideWindow\r?\n  !endif/;
    const newHead =
      `Section\n` +
      `  !ifdef SPLASH_IMAGE\n` +
      `    InitPluginsDir\n` +
      `    HideWindow\n` +
      `    File /oname=$PLUGINSDIR\\aurasync-splash.exe "${exeNsisPath}"\n` +
      `    Exec '"$PLUGINSDIR\\aurasync-splash.exe"'\n` +
      `  !endif`;
    if (!sectionHead.test(content)) {
      console.error('Could not find the extraction section head in portable.nsi.');
      process.exit(1);
    }
    content = content.replace(sectionHead, newHead);

    // 2d. Drop the old splash teardown (splash closes itself when AuraSync starts)
    content = content.replace(
      /  !ifdef SPLASH_IMAGE\r?\n    (?:BgImage::Destroy|AdvSplash::stop)\r?\n  !endif\r?\n/,
      ''
    );

    if (content.includes('BgImage::SetBg') || content.includes('AdvSplash')) {
      console.error('Old splash code still present — patch aborted.');
      process.exit(1);
    }
    if (!content.includes('aurasync-splash.exe')) {
      console.error('Splash patch failed to apply cleanly.');
      process.exit(1);
    }
    changed = true;
    console.log('Patched portable.nsi: animated instant splash enabled.');
  }

  if (changed) {
    fs.writeFileSync(templatePath, content, 'utf8');
  } else {
    console.log('portable.nsi already patched (splash + private extraction folder).');
  }
}

compileSplashExe();
patchTemplate();
