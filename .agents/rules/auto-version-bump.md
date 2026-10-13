---
name: auto-version-bump
description: Enforce automatic version bumping, full file synchronization, testing, and executable rebuilding after every modification in AuraSync
trigger: always_on
---

# Automatic Version Bumping & Full Project Sync Rule

Whenever ANY modification is made in this project:
1. Increment the version number (`x.y.z` ➔ `x.y.z+1`).
2. Update all version occurrences:
   - `package.json`
   - `package-lock.json`
   - `electron/main.js`
   - `src/App.jsx`
   - `src/components/Sidebar.jsx`
   - `src/components/SettingsPage.jsx`
   - `src/components/CloudInstaller.jsx`
   - `website/index.html`
   - `README.md`
   - `scripts/test-suite.js`
3. Run `npm run check` and `npm test` (100% pass required).
4. Run `npm run dist` to produce updated `AuraSync-Setup.exe` and `AuraSync-Portable.exe` in root and `release/`.
5. Run `node scripts/clean-release.js` which automatically archives `AuraSync-Setup-vX.Y.Z.exe` and `AuraSync-Portable-vX.Y.Z.exe` permanently into `releases-archive/`.
