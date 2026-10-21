---
name: auto-version-bump
description: Enforce independent automatic version bumping and isolated release pipelines for Desktop and Mobile platforms
trigger: always_on
---

# Independent Desktop & Mobile Version Bumping & Release Pipelines

Whenever ANY modification is made in this project:

### 1. If Mobile files modified (`src/components/mobile/`, `src/mobile/`, `mobile/`):
1. Run `node update-version.js --mobile` (bumps Mobile version only, e.g., `1.0.8` ➔ `1.0.9`).
2. Run `npm run check`.
3. Run `npm run dist:mobile` to build and publish only `AuraSync.apk` and `AuraSync-v1.0.x.apk` to GitHub Releases. Desktop builds are completely skipped.

### 2. If Desktop files modified (`electron/`, desktop components):
1. Run `node update-version.js --desktop` (bumps Desktop version only, e.g., `1.7.98` ➔ `1.7.99`).
2. Run `npm run check` and `npm test` (100% pass required).
3. Run `npm run dist:desktop` to build and publish only Windows executables (`AuraSync-Setup.exe` & `AuraSync-Portable.exe`) to GitHub Releases. Android APK builds are completely skipped.

### 3. If both modified:
1. Run `node update-version.js` to bump both.
2. Run `npm run check` and `npm test`.
3. Run `npm run dist` to build and publish both platforms.
