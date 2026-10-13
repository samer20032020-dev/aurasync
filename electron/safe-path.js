'use strict';

const fs = require('fs');
const path = require('path');

const WINDOWS_RESERVED = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\..*)?$/i;

function validateRelativePath(value) {
  if (typeof value !== 'string' || value.length === 0 || value.includes('\0')) {
    throw new Error('Invalid relative path');
  }
  if (path.isAbsolute(value) || path.win32.isAbsolute(value) || /^[a-z]:/i.test(value)) {
    throw new Error('Absolute paths are not allowed');
  }
  if (value.includes('\\')) throw new Error('Backslashes are not allowed in cloud paths');

  const segments = value.split('/');
  for (const segment of segments) {
    if (!segment || segment === '.' || segment === '..' || segment.length > 255 || /[<>:"|?*\x00-\x1f]/.test(segment)) {
      throw new Error('Invalid path segment');
    }
    if (/[. ]$/.test(segment) || WINDOWS_RESERVED.test(segment)) {
      throw new Error('Unsupported path segment');
    }
  }
  return segments;
}

function resolveWithin(rootDir, relativePath) {
  const segments = validateRelativePath(relativePath);
  const root = path.resolve(rootDir);
  const destination = path.resolve(root, ...segments);
  const relative = path.relative(root, destination);
  if (!relative || relative === '..' || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) {
    throw new Error('Path is outside the destination folder');
  }
  if (destination.length > 32760) throw new Error('Destination path is too long');
  return destination;
}

function prepareSafeOutputPath(rootDir, relativePath) {
  const destination = resolveWithin(rootDir, relativePath);
  fs.mkdirSync(rootDir, { recursive: true });
  const realRoot = fs.realpathSync(rootDir);
  const relative = path.relative(path.resolve(rootDir), destination);
  const segments = relative.split(path.sep).filter(Boolean);
  let current = realRoot;

  for (const segment of segments.slice(0, -1)) {
    current = path.join(current, segment);
    try {
      const stat = fs.lstatSync(current);
      if (stat.isSymbolicLink() || !stat.isDirectory()) {
        throw new Error('Destination contains a symbolic link or non-directory component');
      }
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
      fs.mkdirSync(current);
    }
  }

  // Preserve the path the caller selected (it may be a valid junction or
  // drive alias) while validating each component against the canonical root.
  const outputPath = path.resolve(rootDir, ...segments);
  try {
    const targetStat = fs.lstatSync(outputPath);
    if (targetStat.isSymbolicLink()) throw new Error('Destination file is a symbolic link');
    if (targetStat.isDirectory()) throw new Error('Destination file path is already a directory');
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
  return outputPath;
}

module.exports = { validateRelativePath, resolveWithin, prepareSafeOutputPath };
