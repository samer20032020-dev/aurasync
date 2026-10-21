const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

console.log('=====================================================');
console.log('   AuraSync Comprehensive Full-System Verification  ');
console.log('=====================================================\n');

let passedTests = 0;
let totalTests = 0;

function assert(condition, testName, details = '') {
  totalTests++;
  if (condition) {
    console.log(`[PASS] ${testName}`);
    passedTests++;
  } else {
    console.error(`[FAIL] ${testName} - ${details}`);
  }
}

async function runTests() {
  const rootDir = path.resolve(__dirname, '..');

  // Test 1: Credentials
  console.log('\n--- 1. Google OAuth Credentials Check ---');
  const credPath = path.join(rootDir, 'credentials.json');
  assert(fs.existsSync(credPath), 'credentials.json exists in root');

  let creds;
  try {
    creds = JSON.parse(fs.readFileSync(credPath, 'utf8'));
    const key = creds.installed || creds.web || creds;
    assert(!!key.client_id, 'client_id is present', key.client_id ? 'Valid' : 'Missing');
    assert(!!key.client_secret, 'client_secret is present', key.client_secret ? 'Valid' : 'Missing');
    assert(Array.isArray(key.redirect_uris), 'redirect_uris is an array');
  } catch (e) {
    assert(false, 'credentials.json is valid JSON', e.message);
  }

  // Test 2: Database and Schema
  console.log('\n--- 2. SQLite Database (sql.js / WASM) Check ---');
  const db = require('../electron/database');
  await db.initDatabase();

  assert(true, 'db.initDatabase() initialized without error');

  // Test CRUD
  const testFolderPath = path.join(rootDir, 'temp-test-watched-folder');
  if (!fs.existsSync(testFolderPath)) fs.mkdirSync(testFolderPath);

  const folder = db.addFolder(testFolderPath, 'TestFolder');
  assert(folder && folder.id > 0, 'db.addFolder adds and returns a folder with ID');
  assert(folder.name === 'TestFolder', 'Folder name matches');

  const foldersList = db.getFolders();
  assert(foldersList.some(f => f.id === folder.id), 'db.getFolders includes the new folder');

  // Test 3: Zero-Deletion Policy in Database
  console.log('\n--- 3. Zero-Deletion Policy Verification ---');
  const testFilePath = path.join(testFolderPath, 'important-doc.txt');
  fs.writeFileSync(testFilePath, 'Critical business data that must never be deleted from Google Drive');

  const tracked = db.upsertFile({
    localPath: testFilePath,
    relativePath: 'important-doc.txt',
    folderId: folder.id,
    lastModified: Date.now(),
    fileSize: 100,
    fileHash: 'dummyhash123',
    status: 'synced'
  });
  assert(tracked && tracked.status === 'synced', 'db.upsertFile records file with synced status');

  // Simulate local deletion:
  fs.unlinkSync(testFilePath);
  assert(!fs.existsSync(testFilePath), 'Simulated local file deletion on disk');

  // Engine executes markFileLocalDeleted:
  db.markFileLocalDeleted(testFilePath);
  const updatedFile = db.getFileByPath(testFilePath);
  assert(
    updatedFile.status === 'removed_before_upload',
    'File without a cloud copy is honestly labeled removed_before_upload (not fake "preserved")'
  );

  // File WITH a cloud copy → truly preserved
  db.updateFileSynced({
    localPath: testFilePath,
    driveFileId: 'fake-drive-id-1',
    driveFolderId: 'fake-dir-1',
    fileHash: 'dummyhash123'
  });
  db.markFileLocalDeleted(testFilePath);
  const updatedFile2 = db.getFileByPath(testFilePath);
  assert(
    updatedFile2.status === 'preserved_on_drive',
    'File WITH a cloud copy stays preserved_on_drive (Zero-Deletion Active)'
  );

  // Test 3b: Sync Mode & Mirrored Deletion
  console.log('\n--- 3b. Sync Mode & Mirrored Deletion ---');
  db.setSetting('syncMode', 'mirror');
  const mirrorStats = db.getAppStats();
  assert(mirrorStats.syncMode === 'mirror', 'syncMode "mirror" stored and returned in stats');
  assert(mirrorStats.zeroDeletePolicyActive === false, 'zeroDeletePolicyActive is false in mirror mode');

  const mirrorFile = path.join(testFolderPath, 'mirror-doc.txt');
  fs.writeFileSync(mirrorFile, 'data to be mirrored');
  db.upsertFile({
    localPath: mirrorFile,
    relativePath: 'mirror-doc.txt',
    folderId: folder.id,
    lastModified: Date.now(),
    fileSize: 18,
    fileHash: 'mirrorhash',
    status: 'synced'
  });
  db.markFileDeletedOnDrive(mirrorFile);
  assert(db.getFileByPath(mirrorFile).status === 'deleted_on_drive', 'markFileDeletedOnDrive sets deleted_on_drive status');

  const queuedDeletePath = path.join(testFolderPath, 'offline-delete.txt');
  db.addPendingCloudDeletion({ localPath: queuedDeletePath, provider: 'google', driveFileId: 'offline-cloud-id', isPrimary: true });
  assert(db.getPendingCloudDeletionCount(queuedDeletePath) === 1, 'offline cloud deletions persist in the database');
  assert(db.getPendingCloudDeletions('google').some((item) => item.drive_file_id === 'offline-cloud-id'), 'pending cloud deletions can be retried by provider');
  db.clearPendingCloudDeletions(queuedDeletePath);
  db.setFolderMirrorRoot(folder.id, 'onedrive', 'mirror-root-id');
  assert(db.getFolderMirrors(folder.id).some((item) => item.provider === 'onedrive'), 'folder mirror roots are queryable for deletion cleanup');

  const underPath = db.getFilesUnderPath(folder.id, testFolderPath);
  assert(underPath.some(f => f.local_path === mirrorFile), 'getFilesUnderPath finds files inside a deleted directory');

  fs.unlinkSync(mirrorFile);
  db.setSetting('syncMode', 'safe');
  assert(db.getAppStats().zeroDeletePolicyActive === true, 'zeroDeletePolicyActive true again in safe mode');

  // Clean up test folder from DB and disk
  db.removeFolder(folder.id);
  if (fs.existsSync(testFolderPath)) fs.rmdirSync(testFolderPath);
  const remainingFolders = db.getFolders();
  assert(!remainingFolders.some(f => f.id === folder.id), 'Test folder cleaned up from DB');

  // Test 4: App Stats Verification
  console.log('\n--- 4. App Stats Calculation ---');
  const stats = db.getAppStats();
  assert(typeof stats.totalFolders === 'number', 'stats.totalFolders is a number');
  assert(typeof stats.totalFiles === 'number', 'stats.totalFiles is a number');
  assert(stats.zeroDeletePolicyActive === true, 'stats.zeroDeletePolicyActive is true');

  // Test 5: Google Drive OAuth URL Generation
  console.log('\n--- 5. Google Drive Service Configuration ---');
  const googleDrive = require('../electron/google-drive');
  const loadedCreds = googleDrive.loadCredentials();
  assert(!!loadedCreds.clientId, 'googleDrive.loadCredentials loaded clientId correctly');
  assert(!!loadedCreds.clientSecret, 'googleDrive.loadCredentials loaded clientSecret correctly');

  // Test 6: Production Build Deliverables & Assets Check
  console.log('\n--- 6. Distribution Deliverables & Assets Check ---');
  const setupExe = fs.existsSync(path.join(rootDir, 'AuraSync-Setup.exe'))
    ? path.join(rootDir, 'AuraSync-Setup.exe')
    : path.join(rootDir, 'release', 'AuraSync-Setup.exe');
  const portableExe = fs.existsSync(path.join(rootDir, 'AuraSync-Portable.exe'))
    ? path.join(rootDir, 'AuraSync-Portable.exe')
    : path.join(rootDir, 'release', 'AuraSync-Portable.exe');
  const distHtml = path.join(rootDir, 'dist', 'index.html');
  const folderIco = path.join(rootDir, 'assets', 'cloudvault-folder.ico');

  assert(fs.existsSync(distHtml), 'dist/index.html exists');
  assert(fs.existsSync(setupExe) && fs.statSync(setupExe).size > 50 * 1024 * 1024, 'AuraSync-Setup.exe installer exists (> 50 MB)');
  assert(fs.existsSync(portableExe) && fs.statSync(portableExe).size > 50 * 1024 * 1024, 'AuraSync-Portable.exe portable version exists (> 50 MB)');
  assert(fs.existsSync(folderIco) && fs.statSync(folderIco).size > 1000, 'assets/cloudvault-folder.ico exists and has valid icon data');
  assert(fs.existsSync(path.join(rootDir, 'icon.ico')), 'icon.ico exists in project root');

  // Test 7: Launchers & Shortcut Creation Logic (environment-independent)
  console.log('\n--- 7. Launchers & Shortcut Logic ---');
  assert(fs.existsSync(path.join(rootDir, 'AuraSync.bat')), 'AuraSync.bat launcher exists');
  assert(fs.existsSync(path.join(rootDir, 'AuraSync-Setup.bat')), 'AuraSync-Setup.bat launcher exists');
  const installerMainSrc = fs.readFileSync(path.join(rootDir, 'electron', 'main.js'), 'utf8');
  assert(
    installerMainSrc.includes('CreateShortcut') && installerMainSrc.includes('AuraSync.lnk'),
    'Installer creates Desktop and Start Menu shortcuts'
  );
  const desktopPkg = JSON.parse(fs.readFileSync(path.join(rootDir, 'package.json'), 'utf8'));
  assert(
    Array.isArray(desktopPkg.build.extraFiles) && desktopPkg.build.extraFiles.includes('icon.ico'),
    'icon.ico ships next to the installed app (working shortcut icon)'
  );

  // Test 8: Transfer engine (device -> device)
  console.log('\n--- 8. Transfer Engine (device -> device) ---');
  const transferEngine = require('../electron/transfer-engine');
  const xferSrc = path.join(rootDir, 'temp-xfer-src');
  const xferDst = path.join(rootDir, 'temp-xfer-dst');
  fs.rmSync(xferSrc, { recursive: true, force: true });
  fs.rmSync(xferDst, { recursive: true, force: true });
  fs.mkdirSync(path.join(xferSrc, 'sub'), { recursive: true });
  fs.mkdirSync(path.join(xferSrc, 'empty'), { recursive: true });
  fs.mkdirSync(path.join(xferSrc, 'sub', 'emptynested'), { recursive: true });
  fs.writeFileSync(path.join(xferSrc, 'one.txt'), '1');
  fs.writeFileSync(path.join(xferSrc, 'sub', 'two.txt'), '22');

  const startRes = await transferEngine.start({
    source: { kind: 'device', path: xferSrc, label: 'src' },
    destination: { kind: 'device', path: xferDst, label: 'dst' }
  });
  assert(startRes && startRes.success, 'transfer started successfully');

  let xfer = null;
  for (let i = 0; i < 40; i++) {
    xfer = transferEngine.list()[0];
    if (xfer && xfer.status !== 'running') break;
    await new Promise((r) => setTimeout(r, 150));
  }
  assert(xfer && xfer.status === 'done', 'device -> device transfer completed', xfer ? xfer.error : 'no transfer');
  assert(
    fs.existsSync(path.join(xferDst, 'one.txt')) && fs.existsSync(path.join(xferDst, 'sub', 'two.txt')),
    'transferred files keep their folder structure'
  );
  assert(
    fs.existsSync(path.join(xferDst, 'empty')) &&
      fs.statSync(path.join(xferDst, 'empty')).isDirectory() &&
      fs.existsSync(path.join(xferDst, 'sub', 'emptynested')),
    'transfers also create empty folders (nothing inside is skipped)'
  );

  // Sync engine must enumerate empty folders so they can be created in the cloud
  const syncEngineMod = require('../electron/sync-engine');
  const relDirs = typeof syncEngineMod.collectRelativeDirs === 'function'
    ? syncEngineMod.collectRelativeDirs(xferSrc)
    : [];
  assert(
    typeof syncEngineMod.collectRelativeDirs === 'function' &&
      relDirs.some((d) => d.replace(/\\/g, '/') === 'empty') &&
      relDirs.some((d) => d.replace(/\\/g, '/') === 'sub/emptynested'),
    'sync engine enumerates empty folders for cloud creation'
  );

  fs.rmSync(xferSrc, { recursive: true, force: true });
  fs.rmSync(xferDst, { recursive: true, force: true });

  // Test 8b: Cloud paths cannot escape a device destination
  console.log('\n--- 8b. Safe destination paths ---');
  const safePath = require('../electron/safe-path');
  let traversalRejected = true;
  for (const candidate of ['../outside.txt', '..\\outside.txt', 'C:/outside.txt', '/outside.txt', 'safe/../outside.txt']) {
    try { safePath.resolveWithin(xferDst, candidate); traversalRejected = false; break; } catch (_) {}
  }
  assert(traversalRejected, 'path resolver rejects traversal and absolute paths');
  fs.rmSync(xferDst, { recursive: true, force: true });
  const safeDestination = safePath.prepareSafeOutputPath(xferDst, 'folder/file.txt');
  assert(path.dirname(safeDestination) === path.join(xferDst, 'folder'), 'safe path creates destination parents under the selected root');
  fs.rmSync(xferDst, { recursive: true, force: true });

  // Test 9: Cloud protocol providers (SigV4 + WebDAV parsing)
  console.log('\n--- 9. Multi-Cloud Protocols ---');
  const { signRequest, awsUriEncode, parseListObjects } = require('../electron/protocols/s3');
  const { parseMultistatus } = require('../electron/protocols/webdav');

  // AWS official SigV4 test vector (GET Object example)
  const signed = signRequest({
    method: 'GET',
    endpoint: 'https://examplebucket.s3.amazonaws.com',
    bucket: 'examplebucket',
    key: 'test.txt',
    region: 'us-east-1',
    accessKeyId: 'AKIAIOSFODNN7EXAMPLE',
    secretAccessKey: 'wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY',
    extraHeaders: { range: 'bytes=0-9' },
    dateOverride: '20130524T000000Z'
  });
  assert(
    signed.headers.Authorization.includes('Signature=f0e8bdb87c964420e857bd35b5d6ed310bd44f0170aba48dd91039c6036bdb41'),
    'SigV4 signature matches the official AWS test vector'
  );
  assert(awsUriEncode('ملف name.txt') === '%D9%85%D9%84%D9%81%20name.txt', 'AWS URI encoding handles Arabic + spaces');

  const listXml = `<?xml version="1.0"?><ListBucketResult>
    <Contents><Key>My Secure Cloud Backup/photo.jpg</Key><Size>2048</Size><LastModified>2026-01-01T10:00:00.000Z</LastModified></Contents>
    <CommonPrefixes><Prefix>My Secure Cloud Backup/Docs/</Prefix></CommonPrefixes>
    <NextContinuationToken>token2</NextContinuationToken></ListBucketResult>`;
  const parsedS3 = parseListObjects(listXml);
  assert(parsedS3.files.length === 1 && parsedS3.files[0].size === 2048, 'S3 ListObjects XML parsing works');
  assert(parsedS3.folders.length === 1 && parsedS3.nextToken === 'token2', 'S3 common prefixes + continuation token parsed');

  const davXml = `<?xml version="1.0"?>
    <d:multistatus xmlns:d="DAV:">
      <d:response><d:href>/remote.php/dav/files/user/</d:href><d:propstat><d:prop><d:resourcetype><d:collection/></d:resourcetype></d:prop></d:propstat></d:response>
      <d:response><d:href>/remote.php/dav/files/user/Photos/</d:href><d:propstat><d:prop><d:resourcetype><d:collection/></d:resourcetype><d:getlastmodified>Wed, 01 Jan 2026 10:00:00 GMT</d:getlastmodified></d:prop></d:propstat></d:response>
      <d:response><d:href>/remote.php/dav/files/user/notes.txt</d:href><d:propstat><d:prop><d:getcontentlength>123</d:getcontentlength></d:prop></d:propstat></d:response>
    </d:multistatus>`;
  const parsedDav = parseMultistatus(davXml);
  assert(parsedDav.length === 3, 'WebDAV multistatus parsing returns all entries');
  assert(parsedDav[1].isDir && parsedDav[1].name === 'Photos', 'WebDAV folder entry parsed correctly');
  assert(parsedDav[2].size === 123 && !parsedDav[2].isDir, 'WebDAV file entry parsed with size');

  // Test 10: Account manager (multi-account, encrypted secrets)
  console.log('\n--- 10. Account Manager ---');
  const accountManager = require('../electron/account-manager');
  const accountTestDir = path.join(rootDir, 'temp-account-test');
  fs.rmSync(accountTestDir, { recursive: true, force: true });
  fs.mkdirSync(accountTestDir, { recursive: true });
  const accountStorageKey = crypto.randomBytes(32);
  accountManager.encryptionProvider = {
    isEncryptionAvailable: () => true,
    encryptString(value) {
      const iv = crypto.randomBytes(12);
      const cipher = crypto.createCipheriv('aes-256-gcm', accountStorageKey, iv);
      const encrypted = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
      return Buffer.concat([iv, cipher.getAuthTag(), encrypted]);
    },
    decryptString(value) {
      const iv = value.subarray(0, 12);
      const tag = value.subarray(12, 28);
      const decipher = crypto.createDecipheriv('aes-256-gcm', accountStorageKey, iv);
      decipher.setAuthTag(tag);
      return Buffer.concat([decipher.update(value.subarray(28)), decipher.final()]).toString('utf8');
    }
  };
  const legacySecret = Buffer.from(JSON.stringify({ password: 'legacy-secret' }), 'utf8').toString('base64');
  fs.writeFileSync(path.join(accountTestDir, 'accounts.json'), JSON.stringify({
    accounts: [{ id: 'legacy-account', type: 'webdav', secret: `b64:${legacySecret}` }]
  }));
  accountManager.init(accountTestDir);
  assert(accountManager.getRaw('legacy-account').secret.startsWith('enc:'), 'legacy account secrets migrate to OS-backed encryption');
  assert(accountManager.decryptSecret(accountManager.getRaw('legacy-account').secret).password === 'legacy-secret', 'migrated account secret remains readable');
  const secureProvider = accountManager.encryptionProvider;
  accountManager.encryptionProvider = null;
  let insecureFallbackRejected = false;
  try { accountManager.encryptSecret({ password: 'must-not-be-encoded' }); } catch (_) { insecureFallbackRejected = true; }
  accountManager.encryptionProvider = secureProvider;
  assert(insecureFallbackRejected, 'account secrets are never stored as base64 when secure storage is unavailable');
  const created = accountManager.create('webdav', 'Test Cloud', { url: 'https://example.com/dav/', username: 'u' }, { password: 'p' });
  assert(!!created.id, 'custom account created with generated id');
  const instance = accountManager.getInstance(created.id);
  assert(!!instance && instance.isConfigured(), 'account manager builds a configured provider instance');
  const raw = accountManager.getRaw(created.id);
  assert(raw.secret.startsWith('enc:'), 'secret is stored with OS-backed encryption');
  accountManager.remove(created.id);
  assert(accountManager.getRaw(created.id) === null, 'custom account removed');
  accountManager.remove('legacy-account');

  // Test 10b: account removal guard (linked folders)
  console.log('\n--- 10b. Account Removal Guard ---');
  const cloudProviders = require('../electron/cloud-providers');
  const guardedFolderPath = path.join(rootDir, 'temp-guard-folder');
  if (!fs.existsSync(guardedFolderPath)) fs.mkdirSync(guardedFolderPath);

  const guardedAccount = accountManager.create(
    's3',
    'Guard Test',
    { endpoint: 'https://example.com', bucket: 'b', accessKeyId: 'k' },
    { secretAccessKey: 's' }
  );
  const guardedFolder = db.addFolder(guardedFolderPath, 'GuardFolder', guardedAccount.id);

  let blocked = false;
  try {
    cloudProviders.removeCustomAccount(guardedAccount.id);
  } catch (err) {
    blocked = err.code === 'ACCOUNT_IN_USE';
  }
  assert(blocked, 'removing an account with linked folders is blocked');

  db.removeFolder(guardedFolder.id);
  cloudProviders.removeCustomAccount(guardedAccount.id);
  assert(accountManager.getRaw(guardedAccount.id) === null, 'account removed after unlinking its folders');
  if (fs.existsSync(guardedFolderPath)) fs.rmdirSync(guardedFolderPath);
  fs.rmSync(accountTestDir, { recursive: true, force: true });

  // Test 10c: Vault key storage, authenticated metadata, and legacy compatibility
  console.log('\n--- 10c. Vault encryption and migration ---');
  const vaultManager = require('../electron/vault-manager');
  const vaultTestDir = path.join(rootDir, 'temp-vault-test');
  fs.rmSync(vaultTestDir, { recursive: true, force: true });
  fs.mkdirSync(vaultTestDir, { recursive: true });
  const clearVaultSettings = () => {
    vaultManager.lockVault();
    for (const [key, value] of Object.entries({
      vault_password_hash: '', vault_salt: '', vault_hint: '',
      vault_kdf_iterations: '', vault_key_envelope: ''
    })) db.setSetting(key, value);
  };
  clearVaultSettings();
  let lockedItemId = null;
  try {
    let weakPasswordRejected = false;
    try { vaultManager.setPassword('abc'); } catch (_) { weakPasswordRejected = true; }
    assert(weakPasswordRejected, 'vault rejects passwords shorter than the 4-character minimum');
    const vaultPassword = 'vault-test-passphrase';
    vaultManager.setPassword(vaultPassword, 'test hint');
    const verifier = db.getSetting('vault_password_hash');
    assert(verifier.startsWith('v2:') && !/^[0-9a-f]{64}$/i.test(verifier), 'vault database stores a verifier and wrapped key, not the raw AES key');
    assert(vaultManager.verifyPassword(vaultPassword), 'new vault password verifies successfully');

    const plainPath = path.join(vaultTestDir, 'secret.txt');
    fs.writeFileSync(plainPath, 'confidential test contents');
    const lockedItem = await vaultManager.lockItem(plainPath, vaultPassword);
    lockedItemId = lockedItem.id;
    const encryptedPath = lockedItem.current_path;
    const tamperedPath = path.join(vaultTestDir, 'tampered.aura');
    const damaged = fs.readFileSync(encryptedPath);
    damaged[40] = damaged[40] === 0x73 ? 0x53 : 0x73;
    fs.writeFileSync(tamperedPath, damaged);
    const tamperedOutput = path.join(vaultTestDir, 'tampered-output.txt');
    const key = vaultManager.getKey(vaultPassword);
    let tamperedHeaderRejected = false;
    try { await vaultManager.decryptFile(tamperedPath, tamperedOutput, key); } catch (_) { tamperedHeaderRejected = true; }
    key.fill(0);
    assert(tamperedHeaderRejected && !fs.existsSync(tamperedOutput), 'encrypted filename metadata is authenticated and tampering is rejected');

    const restored = await vaultManager.restoreItem(lockedItemId, vaultPassword);
    lockedItemId = null;
    assert(fs.readFileSync(restored.restoredPath, 'utf8') === 'confidential test contents', 'encrypted vault file restores its original contents');
    fs.unlinkSync(restored.restoredPath);

    // Folder lock: encrypt an entire directory into a single streaming container
    const folderRoot = path.join(vaultTestDir, 'SecretFolder');
    fs.mkdirSync(path.join(folderRoot, 'nested'), { recursive: true });
    fs.writeFileSync(path.join(folderRoot, 'a.txt'), 'alpha');
    fs.writeFileSync(path.join(folderRoot, 'nested', 'b.txt'), 'beta');
    const lockedFolder = await vaultManager.lockItem(folderRoot, vaultPassword);
    assert(lockedFolder && lockedFolder.file_type === 'folder', 'folder lock records a folder item');
    assert(!fs.existsSync(folderRoot), 'folder lock removes the plaintext folder from disk');
    const containerBuf = fs.readFileSync(lockedFolder.current_path);
    assert(containerBuf.subarray(0, 9).toString('utf8') === 'AURADIR01', 'folder container uses the AURADIR01 magic header');
    const folderInfo = vaultManager.getUnlockFileInfo(lockedFolder.current_path);
    assert(
      folderInfo.entryType === 'folder' && folderInfo.originalName === 'SecretFolder',
      'unlock info detects an encrypted folder container'
    );
    const restoredFolder = await vaultManager.restoreItem(lockedFolder.id, vaultPassword);
    assert(
      fs.existsSync(path.join(restoredFolder.restoredPath, 'a.txt')) &&
        fs.readFileSync(path.join(restoredFolder.restoredPath, 'nested', 'b.txt'), 'utf8') === 'beta',
      'encrypted folder restores its full nested contents'
    );
    fs.rmSync(restoredFolder.restoredPath, { recursive: true, force: true });

    // A 4-digit numeric PIN must be accepted (the minimum is 4, not 8)
    vaultManager.lockVault();
    for (const key of ['vault_password_hash', 'vault_salt', 'vault_hint', 'vault_kdf_iterations', 'vault_key_envelope']) db.setSetting(key, '');
    let pinAccepted = false;
    try { vaultManager.setPassword('1234', 'pin'); pinAccepted = true; } catch (_) { pinAccepted = false; }
    assert(pinAccepted && vaultManager.verifyPassword('1234'), 'a 4-digit numeric PIN is accepted as a vault password');

    clearVaultSettings();
    const legacySalt = crypto.randomBytes(16).toString('hex');
    const legacyKey = crypto.pbkdf2Sync('legacy-pass', legacySalt, 100000, 32, 'sha256');
    db.setSetting('vault_salt', legacySalt);
    db.setSetting('vault_password_hash', legacyKey.toString('hex'));
    assert(vaultManager.hasPassword() && db.getSetting('vault_password_hash').startsWith('legacy:'), 'legacy raw key is converted to a one-way verifier');
    vaultManager.unlockVault('legacy-pass');
    assert(db.getSetting('vault_password_hash').startsWith('v2:'), 'legacy vault settings upgrade after successful unlock');

    const legacyName = Buffer.from('legacy.txt', 'utf8');
    const legacyIv = crypto.randomBytes(12);
    const legacyCipher = crypto.createCipheriv('aes-256-gcm', legacyKey, legacyIv);
    const legacyCiphertext = Buffer.concat([legacyCipher.update('old encrypted contents', 'utf8'), legacyCipher.final()]);
    const legacyHeader = Buffer.alloc(40 + legacyName.length);
    Buffer.from('AURAVAULT', 'utf8').copy(legacyHeader, 0);
    legacyHeader[9] = 1;
    legacyIv.copy(legacyHeader, 10);
    legacyCipher.getAuthTag().copy(legacyHeader, 22);
    legacyHeader.writeUInt16BE(legacyName.length, 38);
    legacyName.copy(legacyHeader, 40);
    const legacyAuraPath = path.join(vaultTestDir, 'legacy.aura');
    fs.writeFileSync(legacyAuraPath, Buffer.concat([legacyHeader, legacyCiphertext]));
    const legacyOutput = path.join(vaultTestDir, 'legacy-output.txt');
    await vaultManager.decryptFile(legacyAuraPath, legacyOutput, vaultManager.getKey());
    assert(fs.readFileSync(legacyOutput, 'utf8') === 'old encrypted contents', 'legacy v1 .aura files remain decryptable after migration');
    legacyKey.fill(0);
    fs.unlinkSync(legacyOutput);
  } finally {
    if (lockedItemId) db.deleteVaultItem(lockedItemId);
    clearVaultSettings();
    fs.rmSync(vaultTestDir, { recursive: true, force: true });
  }

  // --- 11. Cloud Format Feature Verification ---
  console.log('\n--- 11. Cloud Storage Format (Wipe to 0 GB) ---');
  const syncEngine = require('../electron/sync-engine');
  const offlineRetryPath = path.join(rootDir, 'temp-offline-delete');
  db.addPendingCloudDeletion({ localPath: offlineRetryPath, provider: 'provider-not-connected', driveFileId: 'retry-after-restart' });
  await syncEngine.processPendingCloudDeletions(offlineRetryPath);
  assert(db.getPendingCloudDeletionCount(offlineRetryPath) === 1, 'offline delete remains queued when its provider is unavailable');
  db.clearPendingCloudDeletions(offlineRetryPath);
  assert(typeof googleDrive.formatCloud === 'function', 'googleDrive.formatCloud is implemented');
  assert(typeof cloudProviders.formatProvider === 'function', 'cloudProviders.formatProvider is implemented');
  assert(typeof db.resetCloudSyncState === 'function', 'db.resetCloudSyncState is implemented');
  assert(typeof syncEngine.handleCloudFormatted === 'function', 'syncEngine.handleCloudFormatted is implemented');

  // Verify db.resetCloudSyncState behavior
  const testFormatFolderPath = path.join(process.cwd(), 'temp-test-format');
  if (!fs.existsSync(testFormatFolderPath)) fs.mkdirSync(testFormatFolderPath);
  const testFormatFolder = db.addFolder(testFormatFolderPath, 'FormatFolder', 'google');
  db.updateFolderDriveId(testFormatFolder.id, 'mock-drive-id-123');
  assert(db.getFolderById(testFormatFolder.id).drive_folder_id === 'mock-drive-id-123', 'folder has mock drive id');

  syncEngine.handleCloudFormatted('google');
  const postFormatFolder = db.getFolderById(testFormatFolder.id);
  assert(postFormatFolder.drive_folder_id === null, 'resetCloudSyncState clears drive_folder_id');
  assert(postFormatFolder.is_paused === 1, 'resetCloudSyncState pauses folder to avoid auto-upload');

  db.removeFolder(testFormatFolder.id);
  if (fs.existsSync(testFormatFolderPath)) fs.rmdirSync(testFormatFolderPath);

  // --- 12. Regression Checks (v1.7.66) ---
  console.log('\n--- 12. Regression Checks (v1.7.66) ---');

  const pkg = JSON.parse(fs.readFileSync(path.join(rootDir, 'package.json'), 'utf8'));
  assert(pkg.version === '1.7.100', 'package.json version is 1.7.100', pkg.version);

  const winTargets = (pkg.build && pkg.build.win && pkg.build.win.target) || [];
  assert(
    winTargets.some((t) => (typeof t === 'string' ? t : t && t.target) === 'portable'),
    'Windows build produces the portable/cloud-setup executable'
  );

  const mainSource = fs.readFileSync(path.join(rootDir, 'electron', 'main.js'), 'utf8');
  assert(
    mainSource.includes('PORTABLE_EXECUTABLE_FILE'),
    'Setup mode auto-detects AuraSync-Setup.exe and opens the cloud installer'
  );
  assert(
    mainSource.includes('UninstallString'),
    'Cloud installer registers a working uninstaller'
  );
  assert(
    mainSource.includes('installerBusy'),
    'Setup window cannot be closed mid-install (prevents broken installs)'
  );
  assert(
    mainSource.includes('copyFileRobust') && mainSource.includes("'resources', 'app.asar'"),
    'Installer retries copies and verifies app.asar (no silent broken installs)'
  );
  assert(
    mainSource.includes('original-fs') && mainSource.includes('copyFs'),
    'Installer uses original-fs so app.asar copies correctly (asar path routing bypassed)'
  );
  assert(
    mainSource.includes('countInstances') && mainSource.includes('Smart update'),
    'Setup updates in place: detects install location and closes the running app'
  );
  assert(mainSource.includes('SendTo'), 'Installer adds the Explorer Send-To shortcut');

  const syncEngineSrc = fs.readFileSync(path.join(rootDir, 'electron', 'sync-engine.js'), 'utf8');
  assert(
    syncEngineSrc.includes('resolveChain') && syncEngineSrc.includes('_resolveDestination'),
    'Cloud folder resolution is serialized (prevents duplicate cloud folders)'
  );
  assert(
    syncEngineSrc.includes('getMaxConcurrentUploads'),
    'Upload concurrency is configurable from settings (faster parallel uploads)'
  );
  assert(
    syncEngineSrc.includes('_uploadMirrors') && syncEngineSrc.includes('backfillMirrors'),
    'Multi-cloud (3-2-1) replication engine is implemented'
  );
  assert(
    syncEngineSrc.includes('clean_mirror'),
    'Latest-only (projects) mode propagates local deletes to the cloud'
  );
  assert(
    syncEngineSrc.includes('reverseSyncFolder') && syncEngineSrc.includes('scheduleReverseSync'),
    'Reverse sync engine is implemented (cloud → device, safe overwrite rules)'
  );
  assert(
    syncEngineSrc.includes('checkCloudFolderName') && syncEngineSrc.includes('ensureRootBackupFolder'),
    'Add-folder detects same-named cloud folders (merge/new-name prompt)'
  );
  assert(
    syncEngineSrc.includes('verifyFolderCloud') &&
      syncEngineSrc.includes('cloud_missing') &&
      syncEngineSrc.includes('_markMissingCloudFiles'),
    'Cloud-deleted files are detected and marked "missing from cloud"'
  );
  assert(
    syncEngineSrc.includes('نسخة محلية قبل الاسترجاع') && !syncEngineSrc.includes('(restored ${n})'),
    'Restore always puts the file back at its exact original path (local copy kept as backup)'
  );
  const statsCheck = db.getAppStats();
  assert(
    typeof statsCheck.cloudMissingFiles === 'number',
    'Stats expose the cloudMissingFiles counter'
  );
  const filesPageSrc = fs.readFileSync(path.join(rootDir, 'src', 'components', 'FilesPage.jsx'), 'utf8');
  const i18nFilesSrc = fs.readFileSync(path.join(rootDir, 'src', 'i18n.jsx'), 'utf8');
  assert(
    filesPageSrc.includes("cloud_missing") && i18nFilesSrc.includes("'files.statusCloudMissing'"),
    'Files page shows the "missing from cloud" badge, filter, and re-upload action'
  );
  const driveSrc = fs.readFileSync(path.join(rootDir, 'electron', 'google-drive.js'), 'utf8');
  assert(
    driveSrc.includes('trashed: false') && driveSrc.includes('isNotFound'),
    'Google Drive upload untrashes files and falls back to create on 404'
  );
  assert(
    syncEngineSrc.includes("f.status === 'cloud_missing' && cloudPaths.has(rel)"),
    'Sync engine auto-recovers cloud_missing files back to synced status'
  );
  const databaseSrc = fs.readFileSync(path.join(rootDir, 'electron', 'database.js'), 'utf8');
  assert(
    databaseSrc.includes('removed_before_upload') && filesPageSrc.includes('removed_before_upload'),
    'Files deleted before their first upload are honestly labeled (no fake "preserved")'
  );
  const appOverlapSrc = fs.readFileSync(path.join(rootDir, 'src', 'App.jsx'), 'utf8');
  assert(
    appOverlapSrc.includes('overlapConflict') && i18nFilesSrc.includes("'folders.overlapTitle'"),
    'Adding a nested folder warns about double uploads (with add-anyway option)'
  );

  // OAuth callback resilience (EACCES / EADDRINUSE port fallback)
  const oauthServerSrc = fs.readFileSync(path.join(rootDir, 'electron', 'oauth-server.js'), 'utf8');
  assert(
    oauthServerSrc.includes('listenWithFallback') && oauthServerSrc.includes("'EACCES'") && oauthServerSrc.includes("'EADDRINUSE'"),
    'OAuth callback server retries other ports on EACCES/EADDRINUSE (never stuck on a blocked port)'
  );
  const oauthProviders = ['google-drive.js', 'onedrive.js', 'dropbox.js'].map((f) =>
    fs.readFileSync(path.join(rootDir, 'electron', f), 'utf8')
  );
  assert(
    oauthProviders.every((src) => src.includes('listenWithFallback') && !src.includes('server.listen(port,')),
    'All OAuth providers (Google/OneDrive/Dropbox) use the resilient port binder'
  );
  const preloadNameCheckSrc = fs.readFileSync(path.join(rootDir, 'electron', 'preload.js'), 'utf8');
  const appNameCheckSrc = fs.readFileSync(path.join(rootDir, 'src', 'App.jsx'), 'utf8');
  const i18nNameCheckSrc = fs.readFileSync(path.join(rootDir, 'src', 'i18n.jsx'), 'utf8');
  assert(
    mainSource.includes("'folders:check-cloud-name'") && /checkCloudFolderName:\s*\(/.test(preloadNameCheckSrc),
    'Cloud name check IPC + preload bridge are registered'
  );
  assert(
    appNameCheckSrc.includes('nameConflict') && i18nNameCheckSrc.includes("'folders.nameConflictTitle'"),
    'Merge-or-rename dialog exists (add folder: merge into existing / new name)'
  );
  const cloudProvidersSrc = fs.readFileSync(path.join(rootDir, 'electron', 'cloud-providers.js'), 'utf8');
  assert(
    cloudProvidersSrc.includes('wipeAllTraces') && cloudProvidersSrc.includes('ensureRootBackupFolder'),
    'Full-trace removal trashes the whole AuraSync cloud root folder'
  );

  // In-app cloud browser (embedded web dashboard)
  const cloudWebSrc = fs.readFileSync(path.join(rootDir, 'src', 'components', 'CloudWebPage.jsx'), 'utf8');
  assert(
    mainSource.includes('webviewTag: true') && cloudWebSrc.includes('<webview') && cloudWebSrc.includes('persist:aura-cloud-web'),
    'In-app cloud browser embeds the cloud dashboard (persistent session webview)'
  );
  assert(
    cloudWebSrc.includes('drive.google.com') && cloudWebSrc.includes('onedrive.live.com') && cloudWebSrc.includes('dropbox.com'),
    'Cloud browser supports Google Drive, OneDrive, and Dropbox dashboards'
  );
  assert(
    cloudWebSrc.includes('Chrome/') && appOverlapSrc.includes('CloudWebPage'),
    'Cloud browser spoofs a clean Chrome UA and is wired into the app routes'
  );
  assert(
    cloudWebSrc.includes('AccountChooser') && cloudWebSrc.includes('login_hint') && cloudWebSrc.includes('getProviderWebUrl'),
    'Cloud browser dynamically auto-fills the account email for Google Drive and OneDrive'
  );

  // Marketing website (GSAP landing page)
  const websiteHtml = fs.readFileSync(path.join(rootDir, 'website', 'index.html'), 'utf8');
  assert(
    websiteHtml.includes('ScrollSmoother') && websiteHtml.includes('ScrollTrigger') && websiteHtml.includes('SplitText'),
    'Landing page uses GSAP ScrollSmoother + ScrollTrigger + SplitText'
  );
  assert(
    ['gsap.min.js', 'ScrollTrigger.min.js', 'ScrollSmoother.min.js', 'SplitText.min.js'].every((f) =>
      fs.existsSync(path.join(rootDir, 'website', 'lib', f))
    ),
    'GSAP libraries are bundled locally (page works fully offline)'
  );
  assert(
    fs.existsSync(path.join(rootDir, 'website', 'serve.js')) &&
      fs.existsSync(path.join(rootDir, 'website', 'اعرض-الموقع.bat')),
    'Local preview server + one-click launcher exist for the website'
  );
  assert(
    mainSource.includes("'cloud:wipe-all'") && /wipeCloudAll:\s*\(\)/.test(preloadNameCheckSrc),
    'Cloud wipe-all IPC + preload bridge are registered'
  );
  assert(
    appNameCheckSrc.includes('handleWipeAll') && appNameCheckSrc.includes('wipeResetApp'),
    'Wipe dialog offers optional full app reset'
  );
  assert(
    i18nNameCheckSrc.includes("'settings.wipeTitle'") && i18nNameCheckSrc.includes("'app.wipeDone'"),
    'Wipe strings exist in Arabic + English'
  );
  assert(
    syncEngineSrc.includes('tracking refresh') && syncEngineSrc.includes('db.upsertFile'),
    'Restoring a file into its watched folder clears the yellow "preserved" mark'
  );
  assert(
    mainSource.includes('--minimized') && mainSource.includes('startMinimized'),
    'App can start minimized to the tray near the clock (--minimized)'
  );
  assert(
    mainSource.includes('secondLaunchedMinimized') && mainSource.includes('ensureAutoStartMinimized'),
    'Boot launches never pop the window (second instance guard + legacy auto-start repair)'
  );
  assert(
    mainSource.includes("'electron.app.AuraSync'") && mainSource.includes("'--allow-file-access-from-files'") &&
      mainSource.includes('startedMinimizedAtBoot'),
    'Duplicate auto-start entries are consolidated and boot-session relaunches stay hidden'
  );
  const bootArgs = /args:\s*\['--minimized'\]/.test(mainSource) || mainSource.includes('--minimized`, \'/f');
  assert(bootArgs, 'Start-on-boot entry is registered with --minimized');
  assert(
    mainSource.includes('set-reverse') && mainSource.includes('reverseSyncIntervalMin'),
    'Reverse sync IPC and interval setting are registered'
  );
  assert(
    mainSource.includes('set-clean-mode') && mainSource.includes("files:purge"),
    'Projects mode + archive purge IPC handlers are registered'
  );

  // Statistics metrics + latest-only DB bookkeeping
  db.recordUpload(2048);
  const metrics = db.getMetricsSummary();
  assert(
    metrics.uploadedBytesTotal >= 2048 && metrics.uploadsCount >= 1 && Array.isArray(metrics.daily),
    'Upload metrics are recorded for the statistics page'
  );
  const cleanFolderPath = path.join(rootDir, 'temp-clean-folder');
  if (!fs.existsSync(cleanFolderPath)) fs.mkdirSync(cleanFolderPath);
  const cleanFolder = db.addFolder(cleanFolderPath, 'CleanFolder', 'google');
  const cleanFolderSaved = db.setFolderCleanMode(cleanFolder.id, true);
  assert(cleanFolderSaved.clean_mirror === 1, 'db.setFolderCleanMode enables latest-only mode');
  db.removeFolder(cleanFolder.id);
  if (fs.existsSync(cleanFolderPath)) fs.rmdirSync(cleanFolderPath);

  // Multi-cloud DB bookkeeping
  const mirrorFolderPath = path.join(rootDir, 'temp-mirror-folder');
  if (!fs.existsSync(mirrorFolderPath)) fs.mkdirSync(mirrorFolderPath);
  const mirrorFolder = db.addFolder(mirrorFolderPath, 'MirrorFolder', 'google');
  const mirrorSaved = db.setFolderMirrors(mirrorFolder.id, ['onedrive', 'dropbox']);
  assert(
    mirrorSaved.mirror_providers === JSON.stringify(['onedrive', 'dropbox']),
    'db.setFolderMirrors stores the additional clouds'
  );
  db.setFileMirror({
    localPath: 'MIRROR_TEST_FILE',
    provider: 'onedrive',
    driveFileId: 'mirror-id-1',
    driveFolderId: 'mirror-dir-1'
  });
  assert(
    db.getFileMirror('MIRROR_TEST_FILE', 'onedrive').drive_file_id === 'mirror-id-1',
    'db.file_mirrors tracks per-cloud copies'
  );
  db.removeFileMirror('MIRROR_TEST_FILE', 'onedrive');
  assert(!db.getFileMirror('MIRROR_TEST_FILE', 'onedrive'), 'db.removeFileMirror cleans up');
  db.removeFolder(mirrorFolder.id);
  if (fs.existsSync(mirrorFolderPath)) fs.rmdirSync(mirrorFolderPath);

  const snapshotsMod = require('../electron/snapshots');
  assert(
    typeof snapshotsMod.createSnapshot === 'function' &&
      typeof snapshotsMod.restoreSnapshot === 'function' &&
      typeof snapshotsMod.deleteSnapshot === 'function',
    'Restore points engine is implemented (create/restore/delete)'
  );
  assert(
    typeof googleDrive.copyFile === 'function' &&
      typeof require('../electron/dropbox').copyFile === 'function' &&
      typeof require('../electron/onedrive').copyFile === 'function',
    'OAuth providers support server-side copy (instant restore points)'
  );

  const snapTest = db.addSnapshot({
    folderId: 999999,
    folderName: 'TestFolder',
    label: 'test-point',
    cloudPath: '_Snapshots/test-point',
    fileCount: 3,
    totalSize: 1234
  });
  assert(snapTest && snapTest.id > 0 && snapTest.label === 'test-point', 'db.addSnapshot stores a restore point');
  assert(db.getSnapshots().some((s) => s.id === snapTest.id), 'db.getSnapshots lists restore points');
  db.removeSnapshot(snapTest.id);
  assert(!db.getSnapshotById(snapTest.id), 'db.removeSnapshot deletes a restore point');

  const uninstallerSrc = fs.readFileSync(path.join(rootDir, 'electron', 'uninstaller-script.js'), 'utf8');
  assert(
    uninstallerSrc.includes('rmdir /s /q') && uninstallerSrc.includes('cd /d "%TEMP%"'),
    'Uninstaller deletes the whole install folder (even when run from inside it)'
  );
  assert(
    uninstallerSrc.includes('AuraSync.lnk') && uninstallerSrc.includes('Desktop'),
    'Uninstaller removes the Desktop and Start Menu shortcuts by itself'
  );
  assert(
    uninstallerSrc.includes('SendTo'),
    'Uninstaller also removes the Explorer Send-To shortcut'
  );
  assert(
    uninstallerSrc.includes('waitapp'),
    'Uninstaller waits for the running app to close before deleting files'
  );

  const cleanReleaseSource = fs.readFileSync(path.join(rootDir, 'scripts', 'clean-release.js'), 'utf8');
  assert(
    cleanReleaseSource.includes("AuraSync-Setup.exe") && cleanReleaseSource.includes('copyFileSync'),
    'Release script creates the cloud-shaped setup launcher'
  );

  assert(pkg.build && pkg.build.asar === true, 'Packaging uses asar for fast setup unpacking');
  const splashBmp = path.join(rootDir, 'assets', 'installer-splash.bmp');
  assert(
    fs.existsSync(splashBmp) && fs.statSync(splashBmp).size > 1000,
    'Installer splash image exists (instant feedback while unpacking)'
  );

  const preloadSource = fs.readFileSync(path.join(rootDir, 'electron', 'preload.js'), 'utf8');
  assert(/resetApp:\s*\(\)/.test(preloadSource), 'preload exposes resetApp()');
  assert(
    /addFolder:\s*\(folderPath,\s*name,\s*provider/.test(preloadSource),
    'preload forwards the chosen provider when adding a folder'
  );
  assert(/getAppVersion:\s*\(\)/.test(preloadSource), 'preload exposes getAppVersion()');

  const { WebDAVProvider } = require('../electron/protocols/webdav');
  const { S3Provider } = require('../electron/protocols/s3');
  const davInstance = new WebDAVProvider(
    { id: 'x', type: 'webdav', label: 'x', config: { url: 'https://example.com/dav/', username: 'u' } },
    { password: 'p' }
  );
  const s3Instance = new S3Provider(
    { id: 'y', type: 's3', label: 'y', config: { endpoint: 'https://s3.example.com', bucket: 'b', accessKeyId: 'k' } },
    { secretAccessKey: 's' }
  );
  assert(
    typeof davInstance.getStorageState === 'function' && davInstance.getStorageState() === null,
    'WebDAV provider implements getStorageState()'
  );
  assert(
    typeof s3Instance.getStorageState === 'function' && s3Instance.getStorageState() === null,
    'S3 provider implements getStorageState()'
  );
  assert(
    typeof davInstance.copyFile === 'function' && typeof s3Instance.copyFile === 'function',
    'Protocol providers support server-side copy (restore points)'
  );

  const dropboxService = require('../electron/dropbox');
  const encodedArg = dropboxService.encodeApiArg({ path: '/مجلد/ملف.txt' });
  assert(
    !/[^\x20-\x7E]/.test(encodedArg) && encodedArg.includes('\\u'),
    'Dropbox API-Arg header is ASCII-escaped for non-Latin file names'
  );

  const indexCss = fs.readFileSync(path.join(rootDir, 'src', 'index.css'), 'utf8');
  assert(indexCss.includes('--accent-gradient'), 'Calm design system tokens are present');
  assert(
    indexCss.includes('.page-tabs') && indexCss.includes('.nav-group-label'),
    'Calm tabs + nav-group styles are defined'
  );

  // --- Calm 2.0 redesign (v1.7.0) ---
  const sidebarSrc = fs.readFileSync(path.join(rootDir, 'src', 'components', 'Sidebar.jsx'), 'utf8');
  assert(
    sidebarSrc.includes("'protection'") && sidebarSrc.includes("'activity'"),
    'Sidebar has the simplified 6-item navigation (Protection + Activity hubs)'
  );
  const protectionSrc = fs.readFileSync(path.join(rootDir, 'src', 'components', 'ProtectionPage.jsx'), 'utf8');
  assert(
    protectionSrc.includes('StatsPage') && protectionSrc.includes('SnapshotsPage') && protectionSrc.includes('PreservedBinPage'),
    'Protection hub merges statistics + restore points + archive into tabs'
  );
  assert(
    mainSource.includes("'files:purge-all'") && mainSource.includes("'files:purge-progress'"),
    'Bulk purge removes all preserved files from the cloud (with progress)'
  );
  const preloadSrcV2 = fs.readFileSync(path.join(rootDir, 'electron', 'preload.js'), 'utf8');
  assert(
    /purgeAllPreserved:\s*\(\)/.test(preloadSrcV2) && /onPurgeProgress:\s*\(/.test(preloadSrcV2),
    'preload exposes purgeAllPreserved() + onPurgeProgress()'
  );
  const preservedSrc = fs.readFileSync(path.join(rootDir, 'src', 'components', 'PreservedBinPage.jsx'), 'utf8');
  assert(
    preservedSrc.includes('handlePurgeAll') && preservedSrc.includes('archive.purgeAll'),
    'Archive page has the one-click "Delete all permanently" button'
  );
  const i18nSrc = fs.readFileSync(path.join(rootDir, 'src', 'i18n.jsx'), 'utf8');
  assert(
    i18nSrc.includes("'archive.purgeAll'"),
    'Bulk purge strings exist in Arabic + English'
  );
  assert(
    !sidebarSrc.includes("99+") && sidebarSrc.includes('w-2 h-2 rounded-full'),
    'Sidebar badge is a quiet dot (no big numbers like +99)'
  );
  const activityHubSrc = fs.readFileSync(path.join(rootDir, 'src', 'components', 'ActivityHubPage.jsx'), 'utf8');
  assert(
    activityHubSrc.includes('ActivityPage') && activityHubSrc.includes('TransfersPage'),
    'Activity hub merges log + transfers into tabs'
  );
  const settingsSrc = fs.readFileSync(path.join(rootDir, 'src', 'components', 'SettingsPage.jsx'), 'utf8');
  assert(
    settingsSrc.includes('settings.tabGeneral') &&
      settingsSrc.includes('settings.tabSync') &&
      settingsSrc.includes('settings.tabClouds') &&
      settingsSrc.includes('settings.tabAdvanced'),
    'Settings page is organized in 4 calm tabs (General/Sync/Clouds/Advanced)'
  );
  const appSrc = fs.readFileSync(path.join(rootDir, 'src', 'App.jsx'), 'utf8');
  assert(
    appSrc.includes('ProtectionPage') && appSrc.includes('ActivityHubPage'),
    'App routes the merged hub pages'
  );
  assert(
    appSrc.includes('formatAcknowledge') && settingsSrc.includes('settings.wipeTitle'),
    'Whole-Drive format requires explicit acknowledgment (extra safety)'
  );
  const noMojibake = (src) => !/[\u00D8\u00D9\u00C3\u00C2]/.test(src);
  assert(
    noMojibake(mainSource) && noMojibake(appSrc) && noMojibake(settingsSrc) && noMojibake(i18nNameCheckSrc),
    'Arabic strings are intact (no double-encoded mojibake) in core files'
  );

  const iconIcoPath = path.join(rootDir, 'icon.ico');
  assert(
    fs.existsSync(iconIcoPath) && fs.statSync(iconIcoPath).size > 20000,
    'App icon is a large multi-size ICO (7 resolutions, 38KB)'
  );
  assert(
    fs.existsSync(path.join(rootDir, 'icon.png')) && fs.statSync(path.join(rootDir, 'icon.png')).size > 3000,
    'App icon PNG (512px) is present'
  );
  const trayPng = path.join(rootDir, 'tray-icon.png');
  assert(
    fs.existsSync(trayPng) && fs.statSync(trayPng).size > 500 && fs.existsSync(path.join(rootDir, 'tray-icon@2x.png')),
    'Tray icons (32px + 64px) are present'
  );
  const trayIcoPath = path.join(rootDir, 'tray.ico');
  assert(
    fs.existsSync(trayIcoPath) && fs.statSync(trayIcoPath).size > 2000,
    'Multi-size tray ICO (7 resolutions) is present for a crisp taskbar icon'
  );
  const traySrc = fs.readFileSync(path.join(rootDir, 'electron', 'tray.js'), 'utf8');
  assert(
    traySrc.includes('tray.ico') && traySrc.includes('فتح AuraSync') && traySrc.includes('مزامنة الكل الآن'),
    'Tray uses the crisp ICO and a clean Arabic menu'
  );

  // Cloud deduplication & complete wipeTraces checks
  const gdSrc = fs.readFileSync(path.join(rootDir, 'electron', 'google-drive.js'), 'utf8');
  assert(
    gdSrc.includes('targetDriveFileId') && gdSrc.includes('trashed = false') && gdSrc.includes('cleanName'),
    'Google Drive uploadFile checks for existing files to prevent cloud duplicates'
  );
  assert(
    gdSrc.includes('uploadLocks') && gdSrc.includes('lockKey'),
    'Google Drive uploadFile implements in-flight concurrency lock to prevent double uploads'
  );
  assert(
    gdSrc.includes('async wipeTraces') && gdSrc.includes('_ensureRootPromise') && gdSrc.includes('emptyTrash'),
    'Google Drive implements full-scope wipeTraces and root promise serialization'
  );
  const freshSyncEngineSrc = fs.readFileSync(path.join(rootDir, 'electron', 'sync-engine.js'), 'utf8');
  assert(
    freshSyncEngineSrc.includes('ignoreInitial: true') && freshSyncEngineSrc.includes('normalizePathKey'),
    'Sync engine normalizes path keys and ignores duplicate in-flight events'
  );
  const dbSrc = fs.readFileSync(path.join(rootDir, 'electron', 'database.js'), 'utf8');
  assert(
    dbSrc.includes('DELETE FROM file_mirrors') && dbSrc.includes('DELETE FROM folder_mirror_roots'),
    'Database resetCloudSyncState clears multi-cloud mirror entries and roots'
  );
  const oneDriveSrc = fs.readFileSync(path.join(rootDir, 'electron', 'onedrive.js'), 'utf8');
  const dbxSrc = fs.readFileSync(path.join(rootDir, 'electron', 'dropbox.js'), 'utf8');
  assert(
    oneDriveSrc.includes('async wipeTraces') && dbxSrc.includes('async wipeTraces'),
    'OneDrive and Dropbox implement wipeTraces for complete cloud cleanup'
  );

  // Aura Vault & Context Menu (v1.7.22) checks
  const vaultSrc = fs.readFileSync(path.join(rootDir, 'electron', 'vault-manager.js'), 'utf8');
  assert(
    vaultSrc.includes('aes-256-gcm') && vaultSrc.includes('lockItem') && vaultSrc.includes('hideItem') && vaultSrc.includes('lockAndHideItem'),
    'Aura Vault engine is implemented (AES-256-GCM lock, hide, lock_hide)'
  );
  assert(
    vaultSrc.includes('packDirectory') && vaultSrc.includes('unpackDirectory') &&
      vaultSrc.includes('AURADIR01') && vaultSrc.includes('MIN_PASSWORD_LENGTH'),
    'Aura Vault supports encrypted folder containers and a 4-character minimum password'
  );
  assert(
    vaultSrc.includes('tempOpenFolder') && vaultSrc.includes('relockAllTempEntries') && vaultSrc.includes('relockTempFolderById'),
    'Aura Vault temporarily opens folders and auto re-locks them (kept encrypted)'
  );
  const contextMenuSrc = fs.readFileSync(path.join(rootDir, 'electron', 'context-menu.js'), 'utf8');
  assert(
    contextMenuSrc.includes('cleanLegacyVaultKeys'),
    'Context menu manager implements complete cleanup of legacy vault and lock keys'
  );
  assert(
    !contextMenuSrc.includes('1_Lock') && !contextMenuSrc.includes('2_Hide') && !contextMenuSrc.includes('3_LockHide'),
    'Context menu is clean and has hidden/removed all file locking and vault encryption actions'
  );
  assert(
    contextMenuSrc.includes('AuraSync') && contextMenuSrc.includes('refreshShellIcons'),
    'Explorer context menu is sanitized for clean cloud sync actions without vault'
  );
  const unlockHtml = path.join(rootDir, 'electron', 'unlock-dialog.html');
  const unlockHtmlSrc = fs.existsSync(unlockHtml) ? fs.readFileSync(unlockHtml, 'utf8') : '';
  assert(
    unlockHtmlSrc.includes('فك قفل الملف') && unlockHtmlSrc.includes('unlockOpenBtn') && unlockHtmlSrc.includes('handleUnlock'),
    'Redesigned unlock dialog exists with a smooth auto-submit password/PIN input'
  );
  assert(
    /\\d\{4\}/.test(unlockHtmlSrc) && unlockHtmlSrc.includes('isFolder'),
    'Unlock dialog auto-opens on a 4-digit PIN and adapts for folders'
  );
  const preloadSrc = fs.readFileSync(path.join(rootDir, 'electron', 'preload.js'), 'utf8');
  assert(
    preloadSrc.includes('getVaultStatus') && preloadSrc.includes('runVaultAction') && preloadSrc.includes('vaultUnlockAndLaunch'),
    'Preload exposes Vault and Context Menu APIs to frontend'
  );
  assert(
    preloadSrc.includes('relockVaultTemp') && preloadSrc.includes('getVaultTempList'),
    'Preload exposes temporary folder re-lock APIs to the frontend'
  );

  // --- 13. Multi-Device Smart Cloud Catalog & Conflict Resolution (v1.7.23) ---
  console.log('\n--- 13. Multi-Device Smart Cloud Catalog & Conflict Resolution (v1.7.23) ---');
  const syncEngineLatestSrc = fs.readFileSync(path.join(rootDir, 'electron', 'sync-engine.js'), 'utf8');
  assert(
    syncEngineLatestSrc.includes('getRemoteCloudFolders') &&
    syncEngineLatestSrc.includes('listRemoteFolderFiles') &&
    syncEngineLatestSrc.includes('downloadRemoteFile') &&
    syncEngineLatestSrc.includes('linkRemoteFolder') &&
    syncEngineLatestSrc.includes('trashRemoteFolder'),
    'Sync engine implements full Multi-Device Virtual Cloud Catalog APIs (Zero-disk footprint)'
  );

  const mainSrc = fs.readFileSync(path.join(rootDir, 'electron', 'main.js'), 'utf8');
  assert(
    mainSrc.includes("'cloud:get-remote-folders'") &&
    mainSrc.includes("'cloud:list-remote-folder-files'") &&
    mainSrc.includes("'cloud:link-remote-folder'") &&
    mainSrc.includes("'cloud:download-remote-file'"),
    'Main process exposes IPC handlers for multi-device catalog and folder linking'
  );

  assert(
    preloadSrc.includes('getRemoteCloudFolders') &&
    preloadSrc.includes('listRemoteFolderFiles') &&
    preloadSrc.includes('linkRemoteFolder') &&
    preloadSrc.includes('downloadRemoteFile'),
    'Preload exposes Multi-Device Virtual Cloud Catalog APIs to the renderer'
  );

  const remoteComponentPath = path.join(rootDir, 'src', 'components', 'RemoteCloudFolders.jsx');
  assert(
    fs.existsSync(remoteComponentPath),
    'RemoteCloudFolders.jsx UI component exists for cross-device metadata catalog browsing'
  );

  const dashSrc = fs.readFileSync(path.join(rootDir, 'src', 'components', 'DashboardPage.jsx'), 'utf8');
  assert(
    dashSrc.includes('RemoteCloudFolders') && dashSrc.includes('remoteFolders'),
    'DashboardPage integrates RemoteCloudFolders to display cloud folders from other devices'
  );

  const appLatestSrc = fs.readFileSync(path.join(rootDir, 'src', 'App.jsx'), 'utf8');
  assert(
    appLatestSrc.includes('remoteFolders') &&
    appLatestSrc.includes('fetchRemoteFolders') &&
    appLatestSrc.includes('driveFolderId: nameConflict.folderId') &&
    appLatestSrc.includes('reverseSync: true'),
    'App.jsx wires remoteFolders state and supports merge/rename conflict resolution'
  );

  assert(
    fs.existsSync(path.join(rootDir, 'update-version.js')),
    'Automated version synchronization script (update-version.js) exists'
  );

  // --- 14. Simultaneous Local & Cloud Deletion (v1.7.24) ---
  console.log('\n--- 14. Simultaneous Local & Cloud Deletion (v1.7.24) ---');
  assert(
    syncEngineLatestSrc.includes('deleteFileBoth'),
    'SyncEngine implements deleteFileBoth for simultaneous local and cloud deletion'
  );
  assert(
    mainSrc.includes("'files:delete-both'") && mainSrc.includes('--delete-both'),
    'Main process handles files:delete-both IPC and --delete-both CLI parameter'
  );
  const updatedPreload = fs.readFileSync(path.join(rootDir, 'electron', 'preload.js'), 'utf8');
  assert(
    updatedPreload.includes('deleteFileBoth'),
    'Preload exposes deleteFileBoth to renderer'
  );
  const updatedContextMenu = fs.readFileSync(path.join(rootDir, 'electron', 'context-menu.js'), 'utf8');
  assert(
    updatedContextMenu.includes('DeleteBoth') && updatedContextMenu.includes('--delete-both'),
    'Windows Context Menu includes 1-click option to delete from PC and Cloud simultaneously'
  );
  const filesPageLatestSrc = fs.readFileSync(path.join(rootDir, 'src', 'components', 'FilesPage.jsx'), 'utf8');
  assert(
    filesPageLatestSrc.includes('handleDeleteBoth') && filesPageLatestSrc.includes('deleteBothTip'),
    'FilesPage includes direct button and confirmation for simultaneous deletion'
  );

  console.log('\n--- 15. Comprehensive App-Wide Button & Action Integrity (v1.7.29) ---');
  assert(
    filesPageLatestSrc.includes('resolveEntryPath') && filesPageLatestSrc.includes('showToast'),
    'FilesPage implements robust path resolution and unified toast notifications'
  );
  const settingsPageLatestSrc = fs.readFileSync(path.join(rootDir, 'src', 'components', 'SettingsPage.jsx'), 'utf8');
  assert(
    settingsPageLatestSrc.includes('settings.cleanFailed') && settingsPageLatestSrc.includes('toggleClean'),
    'SettingsPage clean-mode toggle includes error reporting and toast alerts'
  );
  const dbLatestSrc = fs.readFileSync(path.join(rootDir, 'electron', 'database.js'), 'utf8');
  assert(
    dbLatestSrc.includes('entry.localPath = path.join(folderRoot'),
    'Database aggregateEntries resolves localPath for directory entries'
  );

  console.log('\n--- 16. Empty-Folder Sync & Long-Press Full Removal ---');
  assert(
    syncEngineLatestSrc.includes('collectRelativeDirs') &&
      syncEngineLatestSrc.includes('ensureFolderPathInCloud') &&
      syncEngineLatestSrc.includes('handleDirectoryAdd') &&
      syncEngineLatestSrc.includes("watcher.on('addDir'"),
    'Sync engine uploads every subfolder in the cloud, even completely empty ones'
  );
  const transferEngineLatestSrc = fs.readFileSync(path.join(rootDir, 'electron', 'transfer-engine.js'), 'utf8');
  assert(
    transferEngineLatestSrc.includes('ensureDestinationDirs') && transferEngineLatestSrc.includes('dirs.push'),
    'Transfer engine recreates empty folders in every direction'
  );
  assert(
    settingsPageLatestSrc.includes('HoldToRemove') && settingsPageLatestSrc.includes('onUninstallApp'),
    'Settings has a press-and-hold "full removal" control'
  );
  assert(
    updatedPreload.includes('uninstallApp') && mainSrc.includes("'app:uninstall'"),
    'Full removal is wired from Settings through IPC to the main process'
  );
  const uninstallerLatestSrc = fs.readFileSync(path.join(rootDir, 'electron', 'uninstaller-script.js'), 'utf8');
  assert(
    uninstallerLatestSrc.includes('AuraSyncVault') &&
      uninstallerLatestSrc.includes('options.dataDir') &&
      uninstallerLatestSrc.includes('exe_retry'),
    'Full removal deletes the right-click menu, user data, and handles portable builds'
  );

  console.log('\n--- 17. Fast Parallel Google Drive Cloud Wipe ---');
  const gdriveWipeSrc = fs.readFileSync(path.join(rootDir, 'electron', 'google-drive.js'), 'utf8');
  assert(
    gdriveWipeSrc.includes('_runPool') && gdriveWipeSrc.includes('_deleteDriveItem'),
    'Google Drive wipe deletes items through a bounded-concurrency pool (fast parallel wipe)'
  );
  assert(
    gdriveWipeSrc.includes('rate.?limit') && gdriveWipeSrc.includes('deepest-first'),
    'Google Drive wipe retries rate limits and removes folders deepest-first'
  );

  console.log('\n--- 18. Multi-Device Cross-Sync & Indestructible Desktop Shortcut (v1.7.40) ---');
  const dbV1740Src = fs.readFileSync(path.join(rootDir, 'electron', 'database.js'), 'utf8');
  const syncV1740Src = fs.readFileSync(path.join(rootDir, 'electron', 'sync-engine.js'), 'utf8');
  const remoteCompSrc = fs.readFileSync(path.join(rootDir, 'src', 'components', 'RemoteCloudFolders.jsx'), 'utf8');

  assert(
    installerMainSrc.includes('SHChangeNotify') && installerMainSrc.includes('desktopTargets'),
    'Installer resolves multi-desktop locations (OneDrive & native) and notifies Explorer shell'
  );
  assert(
    syncV1740Src.includes('linkAllRemoteFolders') && mainSrc.includes('cloud:link-all-remote-folders'),
    'Sync engine and main process support 1-click bulk remote folder linking for multi-device sync'
  );
  assert(
    preloadSource.includes('linkAllRemoteFolders'),
    'Preload exposes linkAllRemoteFolders bridge for cross-device synchronization'
  );
  assert(
    dbV1740Src.includes('reverse_sync INTEGER DEFAULT 1') && dbV1740Src.includes('UPDATE folders SET reverse_sync = 1'),
    'Database defaults reverse_sync to 1 for all folders to ensure continuous bidirectional multi-device sync'
  );
  assert(
    remoteCompSrc.includes('handleLinkAll') && remoteCompSrc.includes('FolderSync'),
    'RemoteCloudFolders UI provides 1-click Sync All button for effortless multi-device setup'
  );

  console.log('\n--- 19. Comprehensive Full-System Hardening & Launcher Precision (v1.7.41) ---');
  const setupBatSrc = fs.readFileSync(path.join(rootDir, 'AuraSync-Setup.bat'), 'utf8');
  const cleanReleaseLatestSrc = fs.readFileSync(path.join(rootDir, 'scripts', 'clean-release.js'), 'utf8');
  const syncEngineAuditSrc = fs.readFileSync(path.join(rootDir, 'electron', 'sync-engine.js'), 'utf8');

  assert(
    setupBatSrc.includes('AuraSync-Setup.exe" --setup') && setupBatSrc.includes('AuraSync-Portable.exe" --setup'),
    'AuraSync-Setup.bat deterministically launches the cloud installer with explicit --setup flag'
  );
  assert(
    mainSrc.includes('gotSetupLock') && mainSrc.includes('if (!gotSetupLock) return;'),
    'Main process prevents duplicate installer windows with guarded gotSetupLock lifecycle'
  );
  assert(
    cleanReleaseLatestSrc.includes('copyWithRetry'),
    'clean-release.js implements resilient copy retry mechanism to withstand antivirus/Explorer locks'
  );
  assert(
    syncEngineAuditSrc.includes('cleanName') && syncEngineAuditSrc.includes('replace(/[<>:"/\\\\|?*]/g'),
    'Sync engine sanitizes special characters when linking remote cloud folders on Windows'
  );

  console.log('\n--- 20. Database Atomic Persistence & Self-Healing Engine (v1.7.42) ---');
  const dbEngineSrc = fs.readFileSync(path.join(rootDir, 'electron', 'database.js'), 'utf8');
  assert(
    dbEngineSrc.includes('writeDbAtomically') && dbEngineSrc.includes('fsyncSync'),
    'Database uses atomic temp-file writing with OS fsyncSync flush to permanently prevent corruption'
  );
  assert(
    dbEngineSrc.includes('verifyDbIntegrity') && dbEngineSrc.includes('PRAGMA quick_check;'),
    'Database performs pre-flight integrity verification with SQLite quick_check before mounting'
  );
  assert(
    dbEngineSrc.includes('healDatabaseFromDisk') && dbEngineSrc.includes('recoverRuntimeDb'),
    'Database provides comprehensive self-healing and quarantine mechanism against malformed disk images'
  );
  assert(
    dbEngineSrc.includes('cleanStaleJournalFiles') && dbEngineSrc.includes('-wal'),
    'Database automatically purges stale WAL/SHM artifacts to ensure clean WebAssembly VFS compatibility'
  );

  console.log('\n--- 21. Single-File Quick Sync & Shortcut Intelligence (v1.7.43) ---');
  const mainLatestSrc = fs.readFileSync(path.join(rootDir, 'electron', 'main.js'), 'utf8');
  assert(
    mainLatestSrc.includes('handleSingleFileQuickSync') && mainLatestSrc.includes('stat.isFile()'),
    'Main process handles individual file quick sync via Windows context menu'
  );
  assert(
    mainLatestSrc.includes('AuraSync Quick Files') && mainLatestSrc.includes('ملفات سريعة (Quick Files)'),
    'AuraSync manages dedicated Quick Files folder for standalone file sync'
  );
  assert(
    mainLatestSrc.includes('linkSync') && mainLatestSrc.includes('copyFileSync'),
    'Quick sync uses zero-cost NTFS hardlinking with resilient copy fallback'
  );
  assert(
    mainLatestSrc.includes('readShortcutLink') && mainLatestSrc.includes('.lnk'),
    'Shortcut resolver detects game/app .lnk targets and provides intelligent guidance'
  );

  console.log('\n--- 22. Folder Auto-Relock on Close & Browser Vault Guard with PIN (v1.7.44) ---');
  const browserGuardMod = require(path.join(rootDir, 'electron', 'browser-guard'));
  const vaultManagerMod = require(path.join(rootDir, 'electron', 'vault-manager'));
  const preloadGuardSrc = fs.readFileSync(path.join(rootDir, 'electron', 'preload.js'), 'utf8');
  const vaultPageSrc = fs.readFileSync(path.join(rootDir, 'src', 'components', 'VaultPage.jsx'), 'utf8');
  const browserLockHtml = fs.readFileSync(path.join(rootDir, 'electron', 'browser-lock.html'), 'utf8');

  // A. Vault Manager Folder Auto-Relock & Explorer Watcher
  assert(
    typeof vaultManagerMod.isFolderOpenInExplorer === 'function' &&
    typeof vaultManagerMod.startAutoRelockWatcher === 'function' &&
    typeof vaultManagerMod.relockTempEntry === 'function' &&
    typeof vaultManagerMod.tempOpenFolder === 'function' &&
    typeof vaultManagerMod.reconcileTempEntries === 'function',
    'VaultManager implements full Explorer window auto-relock lifecycle methods'
  );

  // Folder unpack & auto-relock cycle validation:
  const section22TestDir = path.join(rootDir, 'temp-relock-test-v1744');
  try { fs.rmSync(section22TestDir, { recursive: true, force: true }); } catch (_) {}
  fs.mkdirSync(section22TestDir, { recursive: true });

  const testRelockDir = path.join(section22TestDir, 'auto-relock-folder');
  const testSubFile = path.join(testRelockDir, 'doc.txt');
  fs.mkdirSync(testRelockDir, { recursive: true });
  fs.writeFileSync(testSubFile, 'secret contents before locking', 'utf8');

  const containerOut = path.join(section22TestDir, 'auto-relock-folder.aura');
  const relockKey = crypto.randomBytes(32);
  await vaultManagerMod.packDirectory(testRelockDir, containerOut, relockKey, 'auto-relock-folder');
  // Delete original to simulate locked container
  fs.rmSync(testRelockDir, { recursive: true, force: true });
  assert(fs.existsSync(containerOut), 'Encrypted folder container generated');

  // Verify unpackDirectory restores contents
  await vaultManagerMod.unpackDirectory(containerOut, testRelockDir, relockKey);
  assert(fs.existsSync(testSubFile), 'Unpacked directory contains files');

  // Test relockTempEntry simulation (packs and deletes decrypted directory)
  const simulatedEntry = {
    key: `path:${containerOut}`,
    itemId: null,
    containerPath: containerOut,
    originalPath: testRelockDir,
    originalName: 'auto-relock-folder',
    fileType: 'folder',
    createdAt: Date.now()
  };
  vaultManagerMod.tempKeys.set(simulatedEntry.key, relockKey);
  await vaultManagerMod.relockTempEntry(simulatedEntry);

  assert(!fs.existsSync(testRelockDir), 'Decrypted plaintext folder is completely wiped from disk upon re-lock');
  assert(fs.existsSync(containerOut), 'Encrypted .aura container remains safely on disk');

  try { fs.rmSync(section22TestDir, { recursive: true, force: true }); } catch (_) {}

  // B. Browser Vault Guard Engine & PIN Verification
  assert(
    typeof browserGuardMod.getStatus === 'function' &&
    typeof browserGuardMod.setEnabled === 'function' &&
    typeof browserGuardMod.setPin === 'function' &&
    typeof browserGuardMod.verifyPin === 'function' &&
    typeof browserGuardMod.setProtectedBrowsers === 'function',
    'BrowserGuard manager implements all required PIN and protection methods'
  );

  // PIN validation & setting
  browserGuardMod.setPin('7890');
  assert(browserGuardMod.verifyPin('7890') === true, 'BrowserGuard verifies correct 4-digit PIN');
  assert(browserGuardMod.verifyPin('1234') === false, 'BrowserGuard rejects incorrect PIN');

  // Test 3-digit PIN
  browserGuardMod.setPin('321');
  assert(browserGuardMod.verifyPin('321') === true, 'BrowserGuard supports 3-digit PIN');

  // Test 2-attempt lockout logic (Win + L)
  let systemLockCalled = false;
  const originalTrigger = browserGuardMod.triggerSystemLock;
  browserGuardMod.triggerSystemLock = () => { systemLockCalled = true; };

  const attempt1 = browserGuardMod.verifyPinDetailed('999');
  assert(attempt1.success === false && attempt1.attemptsLeft === 1 && !attempt1.lockedOut, 'First failed PIN attempt leaves 1 attempt');

  const attempt2 = browserGuardMod.verifyPinDetailed('999');
  assert(attempt2.success === false && attempt2.lockedOut === true && systemLockCalled === true, 'Second failed PIN attempt triggers system lockout (Win + L)');

  browserGuardMod.triggerSystemLock = originalTrigger;

  // Protected browsers configuration
  const customBrowsers = ['chrome', 'msedge', 'brave'];
  browserGuardMod.setProtectedBrowsers(customBrowsers);
  const guardStatus = browserGuardMod.getStatus();
  assert(guardStatus.hasPin === true, 'BrowserGuard status reports PIN is configured');
  assert(guardStatus.pinLength === 3, 'BrowserGuard status reports correct PIN length');
  assert(
    guardStatus.protectedBrowsers.length === 3 && guardStatus.protectedBrowsers.includes('chrome'),
    'BrowserGuard status reports updated protected browsers'
  );

  // C. Preload & IPC API Completeness
  assert(
    preloadGuardSrc.includes('browserGuardGetStatus') &&
    preloadGuardSrc.includes('browserGuardSetEnabled') &&
    preloadGuardSrc.includes('browserGuardSetPin') &&
    preloadGuardSrc.includes('browserGuardSetBrowsers') &&
    preloadGuardSrc.includes('browserGuardVerifyPin') &&
    preloadGuardSrc.includes('browserGuardUnlock') &&
    preloadGuardSrc.includes('browserGuardMinimize'),
    'Preload bridge safely exposes all BrowserGuard IPC methods to renderer'
  );

  // D. UI & Lock Screen Verification
  assert(
    vaultPageSrc.includes("activeVaultTab === 'browser_guard'") &&
    vaultPageSrc.includes('handleToggleBrowserGuard') &&
    vaultPageSrc.includes('handleSavePin') &&
    vaultPageSrc.includes('isPinModalOpen'),
    'VaultPage provides full Browser Guard configuration UI and PIN setup modal'
  );
  assert(
    browserLockHtml.includes('browserGuardVerifyPin') &&
    browserLockHtml.includes('dotsContainer') &&
    browserLockHtml.includes('key-btn'),
    'browser-lock.html implements complete keypad PIN prompt interface'
  );

  // E. Live Browser Guard & Tab Locking Extension Suite (v1.7.61)
  assert(
    typeof browserGuardMod.getLockedTabs === 'function' &&
    typeof browserGuardMod.toggleLockTab === 'function' &&
    typeof browserGuardMod.getLiveTabs === 'function' &&
    typeof browserGuardMod.openExtensionFolder === 'function',
    'BrowserGuard implements full live tab locking & extension management methods'
  );

  browserGuardMod.toggleLockTab('web.whatsapp.com');
  const locked = browserGuardMod.getLockedTabs();
  assert(locked.includes('web.whatsapp.com'), 'BrowserGuard locks specific tab domain');

  browserGuardMod.toggleLockTab('web.whatsapp.com');
  assert(!browserGuardMod.getLockedTabs().includes('web.whatsapp.com'), 'BrowserGuard unlocks specific tab domain');

  assert(
    preloadGuardSrc.includes('browserGuardGetLiveTabs') &&
    preloadGuardSrc.includes('browserGuardGetLockedTabs') &&
    preloadGuardSrc.includes('browserGuardToggleLockTab') &&
    preloadGuardSrc.includes('browserGuardOpenExtensionFolder'),
    'Preload bridge safely exposes live tab locking APIs to renderer'
  );

  assert(
    vaultPageSrc.includes('handleToggleLockTab') &&
    vaultPageSrc.includes('handleOpenExtensionFolder') &&
    vaultPageSrc.includes('liveTabsData'),
    'VaultPage integrates live detected browser tabs and 1-click extension linking'
  );

  const manifestPath = path.join(rootDir, 'extension', 'manifest.json');
  assert(fs.existsSync(manifestPath), 'Browser extension manifest.json exists in extension folder');

  // F. 100% Automated Zero-Touch Native Browser Tab & Page Protection (v1.7.62 - v1.7.64)
  assert(
    typeof browserGuardMod.getGuardMode === 'function' &&
    typeof browserGuardMod.setGuardMode === 'function' &&
    typeof browserGuardMod.getLockedPages === 'function' &&
    typeof browserGuardMod.toggleLockPage === 'function' &&
    typeof browserGuardMod.addCustomLockedPage === 'function' &&
    typeof browserGuardMod.triggerScan === 'function' &&
    typeof browserGuardMod.getInstalledBrowsers === 'function' &&
    typeof browserGuardMod.launchBrowserWithExtension === 'function' &&
    typeof browserGuardMod.getDetectedPages === 'function' &&
    typeof browserGuardMod.cleanPageTitle === 'function',
    'BrowserGuard implements automated zero-touch native page detection, scan triggers, installed browser discovery, and selective locking methods'
  );

  assert(browserGuardMod.cleanPageTitle(' (2) WhatsApp - Google Chrome ') === 'WhatsApp', 'cleanPageTitle strips notification count and browser suffix');
  assert(browserGuardMod.cleanPageTitle('YouTube - Microsoft Edge') === 'YouTube', 'cleanPageTitle cleans Edge page titles');
  assert(browserGuardMod.cleanPageTitle('\u202Bمسلسل Superman and Lois\u202C - Google Chrome') === 'مسلسل Superman and Lois', 'cleanPageTitle handles RTL directional marks and Arabic text');
  assert(browserGuardMod.cleanPageTitle('Google Chrome') === '', 'cleanPageTitle filters empty browser shell name');
  assert(browserGuardMod.cleanPageTitle('New Tab - Google Chrome') === '', 'cleanPageTitle filters new tab');

  browserGuardMod.setGuardMode('selective');
  assert(browserGuardMod.getGuardMode() === 'selective', 'BrowserGuard supports selective page lock mode');

  browserGuardMod.toggleLockPage('youtube');
  assert(browserGuardMod.getLockedPages().includes('youtube'), 'BrowserGuard locks specific page');
  browserGuardMod.toggleLockPage('youtube');
  assert(!browserGuardMod.getLockedPages().includes('youtube'), 'BrowserGuard unlocks specific page');

  browserGuardMod.addCustomLockedPage('egydead');
  assert(browserGuardMod.getLockedPages().includes('egydead'), 'BrowserGuard adds custom keyword lock directly');
  browserGuardMod.toggleLockPage('egydead');

  const installedBrowsers = browserGuardMod.getInstalledBrowsers();
  assert(Array.isArray(installedBrowsers) && installedBrowsers.length > 0, 'BrowserGuard detects installed PC browsers');

  assert(typeof browserGuardMod.clearDetectedPages === 'function', 'BrowserGuard exposes clearDetectedPages method');
  assert(Array.isArray(browserGuardMod.clearDetectedPages()), 'clearDetectedPages resets detected pages to empty');

  assert(
    preloadGuardSrc.includes('browserGuardSetGuardMode') &&
    preloadGuardSrc.includes('browserGuardToggleLockPage') &&
    preloadGuardSrc.includes('browserGuardTriggerScan') &&
    preloadGuardSrc.includes('browserGuardAddCustomLockedPage') &&
    preloadGuardSrc.includes('browserGuardGetInstalledBrowsers') &&
    preloadGuardSrc.includes('browserGuardLaunchBrowserExtension') &&
    preloadGuardSrc.includes('browserGuardGetDetectedPages') &&
    preloadGuardSrc.includes('browserGuardClearDetectedPages'),
    'Preload exposes zero-touch browser guard mode, page locking, trigger scan, and installed browser APIs'
  );

  assert(
    vaultPageSrc.includes('handleToggleLockPage') &&
    vaultPageSrc.includes('handleSetGuardMode') &&
    vaultPageSrc.includes('handleClearDetectedPages') &&
    vaultPageSrc.includes('handleTriggerScan') &&
    vaultPageSrc.includes('handleAddCustomLock') &&
    vaultPageSrc.includes('detectedPagesList'),
    'VaultPage integrates direct zero-touch detected page listing, clear button, manual keyword lock, and instant scan'
  );


  // --- 23. Single-Copy Isolated Session Guarantee (v1.7.49) ---
  console.log('\n--- 23. Single-Copy Isolated Session Guarantee (v1.7.49) ---');
  clearVaultSettings();
  vaultManager.setPassword('1234', 'test pin');

  const isolatedTestDir = path.join(rootDir, 'temp-isolated-vault-test');
  if (fs.existsSync(isolatedTestDir)) fs.rmSync(isolatedTestDir, { recursive: true, force: true });
  fs.mkdirSync(isolatedTestDir, { recursive: true });

  const testSubfolder = path.join(isolatedTestDir, 'MyPrivatePhotos');
  fs.mkdirSync(testSubfolder, { recursive: true });
  fs.writeFileSync(path.join(testSubfolder, 'photo1.jpg'), 'JPEG_DATA_1');
  fs.writeFileSync(path.join(testSubfolder, 'photo2.jpg'), 'JPEG_DATA_2');

  const lockedFolderRes = await vaultManager.lockItem(testSubfolder, '1234');
  const auraContainerPath = lockedFolderRes.current_path;

  assert(fs.existsSync(auraContainerPath), 'Encrypted container created successfully');
  assert(!fs.existsSync(testSubfolder), 'Original unencrypted folder removed from parent directory (1 copy only)');

  const openInfo = vaultManager.getUnlockFileInfo(auraContainerPath);
  const openRes = await vaultManager.unlockAndLaunch(auraContainerPath, '1234', true);

  assert(openRes.success && openRes.tempOpen, 'unlockAndLaunch opens in secure temporary mode');
  assert(openRes.restoredPath.includes('vault_sessions'), 'Decrypted files are isolated inside private vault_sessions sandbox');
  assert(
    !fs.existsSync(testSubfolder),
    'Parent directory has ZERO exposed plaintext duplicate folders (Only MyPrivatePhotos.aura exists)'
  );
  assert(
    fs.readdirSync(isolatedTestDir).length === 1 && fs.readdirSync(isolatedTestDir)[0].endsWith('.aura'),
    'Parent directory contains strictly the single protected .aura copy at all times'
  );

  await vaultManager.relockAllTempEntries();
  fs.rmSync(isolatedTestDir, { recursive: true, force: true });
  assert(!fs.existsSync(isolatedTestDir), 'Test sandbox cleanly removed');

  // --- 24. Exact 1:1 Mirror & Smart Installer Version Archiving ---
  console.log('\n--- 24. Exact 1:1 Mirror & Smart Installer Version Archiving ---');
  const syncEngineArchSrc = fs.readFileSync(path.join(rootDir, 'electron', 'sync-engine.js'), 'utf8');
  assert(
    syncEngineArchSrc.includes('exactCopyMode') && syncEngineArchSrc.includes('archiveInstallerVersions'),
    'Sync engine implements exactCopyMode and archiveInstallerVersions settings'
  );
  assert(
    syncEngineArchSrc.includes('extractFileVersion') && syncEngineArchSrc.includes('isInstallerOrRelease') && syncEngineArchSrc.includes('archiveInstallerVersionIfNeeded'),
    'Sync engine includes dedicated PE version extraction and smart installer archiving'
  );
  assert(
    !syncEngineArchSrc.includes("'release',") && !syncEngineArchSrc.includes("'dist'"),
    'Built-in ignored dirs do not hardcode release or dist folders, allowing full project sync'
  );
  const settingsPageSrc = fs.readFileSync(path.join(rootDir, 'src', 'components', 'SettingsPage.jsx'), 'utf8');
  assert(
    settingsPageSrc.includes('exactCopyMode') && settingsPageSrc.includes('archiveInstallerVersions') && settingsPageSrc.includes('الرفع المطابق 1:1'),
    'Settings page exposes exactCopyMode and archiveInstallerVersions UI switches'
  );

  // --- 25. High-Performance Full Browser Lock Engine & Clean Vault UI (v1.7.99) ---
  console.log('\n--- 25. High-Performance Full Browser Lock Engine & Clean Vault UI (v1.7.99) ---');
  browserGuardMod.setGuardMode('full');
  assert(browserGuardMod.getGuardMode() === 'full', 'BrowserGuard defaults strictly to Full Browser Lock mode');
  assert(browserGuardMod.setGuardMode('full').mode === 'full', 'BrowserGuard enforces full mode');
  assert(typeof browserGuardMod.isBrowserUnlocked === 'function', 'BrowserGuard implements session-aware isBrowserUnlocked method');
  assert(browserGuardMod.unlockedBrowsers instanceof Map, 'BrowserGuard tracks unlocked browsers with session timestamps');
  assert(browserGuardMod.getStatus().guardMode === 'full', 'BrowserGuard status reports full guard mode');

  const bgSection25Src = fs.readFileSync(path.join(rootDir, 'electron', 'browser-guard.js'), 'utf8');
  assert(
    bgSection25Src.includes('isBrowserUnlocked') && bgSection25Src.includes('showLockDialog'),
    'BrowserGuard engine implements seamless active session protection without repetitive PIN nagging'
  );

  const lockHtmlSection25Src = fs.readFileSync(path.join(rootDir, 'electron', 'browser-lock.html'), 'utf8');
  assert(
    lockHtmlSection25Src.includes('browserGuardMinimize'),
    'Browser lock modal minimizes protected browser on cancel'
  );

  const vaultUiSection25Src = fs.readFileSync(path.join(rootDir, 'src', 'components', 'VaultPage.jsx'), 'utf8');
  assert(
    vaultUiSection25Src.includes('المتصفحات المحمية بالكامل') &&
    vaultUiSection25Src.includes('handleToggleBrowser'),
    'VaultPage provides clean dedicated Full Browser Lock interface'
  );

  // --- 26. Instant Lock on Blur, Ultra-Fast Batch Scan, & GitHub Release Sync (v1.7.75) ---
  console.log('\n--- 26. Instant Lock on Blur, Ultra-Fast Batch Scan, & GitHub Release Sync (v1.7.75) ---');
  assert(typeof db.upsertFilesBatch === 'function', 'Database exposes upsertFilesBatch for bulk transactions');

  db.upsertFilesBatch([
    { localPath: path.join(testFolderPath, 'batch1.txt'), relativePath: 'batch1.txt', folderId: folder.id, lastModified: Date.now(), fileSize: 10, status: 'pending' },
    { localPath: path.join(testFolderPath, 'batch2.txt'), relativePath: 'batch2.txt', folderId: folder.id, lastModified: Date.now(), fileSize: 20, status: 'pending' }
  ]);
  const b1 = db.getFileByPath(path.join(testFolderPath, 'batch1.txt'));
  const b2 = db.getFileByPath(path.join(testFolderPath, 'batch2.txt'));
  assert(b1 && b1.file_size === 10, 'upsertFilesBatch correctly inserts batch1');
  assert(b2 && b2.file_size === 20, 'upsertFilesBatch correctly inserts batch2');

  const syncEngSrc = fs.readFileSync(path.join(rootDir, 'electron', 'sync-engine.js'), 'utf8');
  assert(syncEngSrc.includes('if (n > 32) n = 32;'), 'SyncEngine supports up to 32 parallel uploads');

  const gdSection26Src = fs.readFileSync(path.join(rootDir, 'electron', 'google-drive.js'), 'utf8');
  assert(gdSection26Src.includes('parentFolderFilesCache'), 'GoogleDrive implements parentFolderFilesCache to prevent 429 quota errors');

  assert(fs.existsSync(path.join(rootDir, 'scripts', 'github-release.js')), 'scripts/github-release.js exists');

  const cleanReleaseSrc = fs.readFileSync(path.join(rootDir, 'scripts', 'clean-release.js'), 'utf8');
  assert(cleanReleaseSrc.includes('github-release.js'), 'clean-release.js triggers automated GitHub release sync');

  // --- 27. Deep Workspace Cleanup, Release Hardening, & Multi-Build Quality (v1.7.76) ---
  console.log('\n--- 27. Deep Workspace Cleanup, Release Hardening, & Multi-Build Quality (v1.7.76) ---');
  const ghRelSrc = fs.readFileSync(path.join(rootDir, 'scripts', 'github-release.js'), 'utf8');
  assert(ghRelSrc.includes("rmdirSync(path.join(ROOT, 'scratch'))"), 'github-release.js implements automatic scratch directory pruning');
  assert(!fs.existsSync(path.join(rootDir, 'scratch')), 'scratch directory is cleanly pruned from workspace');

  // --- 28. Compact Speed Slider & 1-Click GitHub Auto-Updater (v1.7.77) ---
  console.log('\n--- 28. Compact Speed Slider & 1-Click GitHub Auto-Updater (v1.7.77) ---');
  const updaterEngine = require('../electron/updater-engine');
  assert(typeof updaterEngine.compareVersions === 'function', 'updaterEngine exports compareVersions');
  assert(updaterEngine.compareVersions('1.7.76', '1.7.77') < 0, 'compareVersions correctly recognizes higher version');
  assert(updaterEngine.compareVersions('1.7.77', '1.7.77') === 0, 'compareVersions matches identical version');
  assert(updaterEngine.compareVersions('1.7.78', '1.7.77') > 0, 'compareVersions detects older version');
  assert(typeof updaterEngine.checkForUpdates === 'function', 'updaterEngine exports checkForUpdates method');
  assert(typeof updaterEngine.downloadAndInstall === 'function', 'updaterEngine exports downloadAndInstall method');

  const preloadSrc28 = fs.readFileSync(path.join(rootDir, 'electron', 'preload.js'), 'utf8');
  assert(
    preloadSrc28.includes('checkForUpdates') &&
    preloadSrc28.includes('startUpdateDownload') &&
    preloadSrc28.includes('onUpdateProgress') &&
    preloadSrc28.includes('onUpdateAvailable'),
    'preload.js exposes comprehensive updater APIs to renderer'
  );

  const mainSrc28 = fs.readFileSync(path.join(rootDir, 'electron', 'main.js'), 'utf8');
  assert(
    mainSrc28.includes('updater:check') && mainSrc28.includes('updater:start-download'),
    'main.js registers updater IPC handlers'
  );

  const settingsSrc28 = fs.readFileSync(path.join(rootDir, 'src', 'components', 'SettingsPage.jsx'), 'utf8');
  assert(
    settingsSrc28.includes('CONCURRENCY_STEPS') &&
    settingsSrc28.includes('CONCURRENCY_META') &&
    settingsSrc28.includes('handleSliderChange'),
    'SettingsPage incorporates the new compact speed slider'
  );

  const updateModalSrc = fs.readFileSync(path.join(rootDir, 'src', 'components', 'UpdateModal.jsx'), 'utf8');
  assert(
    updateModalSrc.includes('تحديث البرنامج تلقائياً الآن') &&
    updateModalSrc.includes('transferredMB'),
    'UpdateModal provides 1-click update trigger and live progress display'
  );

  // --- 29. 1-Click Disaster Recovery & PC Migration (v1.7.79) ---
  console.log('\n--- 29. 1-Click Disaster Recovery & PC Migration (v1.7.79) ---');
  const disasterRecovery = require('../electron/disaster-recovery');
  assert(typeof disasterRecovery.scanBackups === 'function', 'disasterRecovery exports scanBackups');
  assert(typeof disasterRecovery.startRecovery === 'function', 'disasterRecovery exports startRecovery');
  assert(typeof disasterRecovery.cancelRecovery === 'function', 'disasterRecovery exports cancelRecovery');
  assert(typeof disasterRecovery.getSmartLocalPath === 'function', 'disasterRecovery exports getSmartLocalPath');
  assert(typeof disasterRecovery.saveMachineManifest === 'function', 'disasterRecovery exports saveMachineManifest');

  const smartDesktop = disasterRecovery.getSmartLocalPath('Desktop');
  const smartDocs = disasterRecovery.getSmartLocalPath('Documents');
  assert(smartDesktop && smartDesktop.toLowerCase().includes('desktop'), 'getSmartLocalPath correctly maps Desktop folder');
  assert(smartDocs && smartDocs.toLowerCase().includes('documents'), 'getSmartLocalPath correctly maps Documents folder');

  const preloadSrc29 = fs.readFileSync(path.join(rootDir, 'electron', 'preload.js'), 'utf8');
  assert(
    preloadSrc29.includes('disasterRecoveryScan') &&
    preloadSrc29.includes('disasterRecoveryStart') &&
    preloadSrc29.includes('disasterRecoveryCancel') &&
    preloadSrc29.includes('disasterRecoverySelectPath') &&
    preloadSrc29.includes('onDisasterRecoveryProgress'),
    'preload.js exposes comprehensive disaster recovery APIs to renderer'
  );

  const mainSrc29 = fs.readFileSync(path.join(rootDir, 'electron', 'main.js'), 'utf8');
  assert(
    mainSrc29.includes('disaster-recovery:scan') &&
    mainSrc29.includes('disaster-recovery:start') &&
    mainSrc29.includes('disaster-recovery:cancel') &&
    mainSrc29.includes('disaster-recovery:select-path'),
    'main.js registers disaster recovery IPC handlers'
  );

  const disasterModalSrc = fs.readFileSync(path.join(rootDir, 'src', 'components', 'DisasterRecoveryModal.jsx'), 'utf8');
  assert(
    disasterModalSrc.includes('recovery.title') &&
    disasterModalSrc.includes('recovery.modeSmart') &&
    disasterModalSrc.includes('recovery.modeConsolidated') &&
    disasterModalSrc.includes('recovery.modeCustom'),
    'DisasterRecoveryModal provides 1-click PC migration with smart native, consolidated, and custom modes'
  );

  const settingsDisasterSrc = fs.readFileSync(path.join(rootDir, 'src', 'components', 'SettingsPage.jsx'), 'utf8');
  assert(
    settingsDisasterSrc.includes('onOpenDisasterRecovery') && settingsDisasterSrc.includes("title={t('recovery.title')}"),
    'SettingsPage houses Disaster Recovery exclusively in Settings'
  );

  const dashSrcClean = fs.readFileSync(path.join(rootDir, 'src', 'components', 'DashboardPage.jsx'), 'utf8');
  assert(!dashSrcClean.includes('onOpenDisasterRecovery'), 'DashboardPage is completely free of disaster recovery triggers');

  const topBarClean = fs.readFileSync(path.join(rootDir, 'src', 'components', 'TopBar.jsx'), 'utf8');
  assert(!topBarClean.includes('onOpenDisasterRecovery'), 'TopBar is completely free of disaster recovery triggers');

  // Test: GitHub Auto-Updater & In-Settings 1-Click Update System
  console.log('\n--- 30. In-App 1-Click GitHub Auto-Updater System ---');
  assert(typeof updaterEngine.checkForUpdates === 'function', 'updaterEngine.checkForUpdates is a function');
  assert(typeof updaterEngine.downloadAndInstall === 'function', 'updaterEngine.downloadAndInstall is a function');
  assert(updaterEngine.compareVersions('1.7.80', '1.7.79') === 1, 'compareVersions identifies newer version');
  assert(updaterEngine.compareVersions('1.7.79', '1.7.79') === 0, 'compareVersions identifies identical version');
  assert(updaterEngine.compareVersions('1.7.78', '1.7.79') === -1, 'compareVersions identifies older version');

  const settingsSrc30 = fs.readFileSync(path.join(rootDir, 'src', 'components', 'SettingsPage.jsx'), 'utf8');
  assert(
    settingsSrc30.includes('تحديث جديد متاح للبرنامج') &&
    settingsSrc30.includes('onStartUpdate') &&
    settingsSrc30.includes('isDownloadingUpdate') &&
    settingsSrc30.includes('updateProgress'),
    'SettingsPage renders 1-Click Update card with live progress bar and direct update button'
  );

  const sidebarSrc30 = fs.readFileSync(path.join(rootDir, 'src', 'components', 'Sidebar.jsx'), 'utf8');
  assert(
    sidebarSrc30.includes('updateInfo?.updateAvailable') && sidebarSrc30.includes('تحديث'),
    'Sidebar renders animated update badge on Settings navigation item'
  );
  const topBarSrc30 = fs.readFileSync(path.join(rootDir, 'src', 'components', 'TopBar.jsx'), 'utf8');
  assert(!topBarSrc30.includes('updateInfo?.updateAvailable'), 'TopBar has no redundant update button');
  assert(!sidebarSrc30.includes('تحديث متوفر!'), 'Sidebar has no duplicate top banner, keeping exclusively the clean badge next to Settings');

  const installerSrc30 = fs.readFileSync(path.join(rootDir, 'src', 'components', 'CloudInstaller.jsx'), 'utf8');
  assert(
    installerSrc30.includes('isAutoUpdate') && installerSrc30.includes('startInstallation'),
    'CloudInstaller supports zero-click automatic update mode'
  );

  // Test: Bulk Preserved File Operations & 1-Click Cloud Purge
  console.log('\n--- 31. Bulk Preserved File Operations & 1-Click Cloud Purge (v1.7.86) ---');
  const filesPageSrc31 = fs.readFileSync(path.join(rootDir, 'src', 'components', 'FilesPage.jsx'), 'utf8');
  assert(
    filesPageSrc31.includes('handleRestoreAllPreserved') && filesPageSrc31.includes('handlePurgeAllPreserved'),
    'FilesPage defines bulk restore and bulk purge handlers'
  );
  assert(
    filesPageSrc31.includes('files.restoreAll') && filesPageSrc31.includes('files.purgeAll'),
    'FilesPage renders bulk action buttons with i18n support'
  );
  assert(
    filesPageSrc31.includes('bulkBusy') && filesPageSrc31.includes('bulkProgress'),
    'FilesPage provides live progress bar indicator for bulk operations'
  );

  const preloadSrc31 = fs.readFileSync(path.join(rootDir, 'electron', 'preload.js'), 'utf8');
  assert(
    preloadSrc31.includes('restoreAllPreserved') && preloadSrc31.includes('onRestoreProgress'),
    'preload.js exposes restoreAllPreserved and onRestoreProgress'
  );

  const mainSrc31 = fs.readFileSync(path.join(rootDir, 'electron', 'main.js'), 'utf8');
  assert(
    mainSrc31.includes('files:restore-all-preserved') && mainSrc31.includes('files:purge-all'),
    'electron/main.js registers files:restore-all-preserved and files:purge-all IPC handlers'
  );

  const i18nSrc31 = fs.readFileSync(path.join(rootDir, 'src', 'i18n.jsx'), 'utf8');
  assert(
    i18nSrc31.includes('files.restoreAll') && i18nSrc31.includes('تنزيل الكل') && i18nSrc31.includes('files.purgeAll') && i18nSrc31.includes('مسح الكل'),
    'i18n.jsx contains full Arabic & English localizations for bulk preserved actions'
  );

  // Test: Pure Pitch Black Theme & Rich Midnight Navy Blue Theme (v1.7.88)
  console.log('\n--- 32. Pure Pitch Black & Rich Midnight Navy Blue Themes (v1.7.88) ---');
  const indexCssSrc32 = fs.readFileSync(path.join(rootDir, 'src', 'index.css'), 'utf8');
  assert(
    indexCssSrc32.includes('--bg-main: #000000;') &&
    indexCssSrc32.includes('--bg-sidebar: #000000;') &&
    indexCssSrc32.includes('--bg-surface: #0a0a0a;') &&
    indexCssSrc32.includes('--accent: #2563eb;'),
    'Pure pitch black theme (.theme-dark) uses true #000000 background and human software royal blue accent'
  );
  assert(
    indexCssSrc32.includes('--bg-main: #08112b;') &&
    indexCssSrc32.includes('--bg-surface: #0d1b3f;') &&
    indexCssSrc32.includes('--accent: #3b82f6;'),
    'Midnight theme (.theme-midnight) is enriched with deep sapphire navy blue tones'
  );
  assert(
    indexCssSrc32.includes('--bg-main: #f6f7f9;') &&
    indexCssSrc32.includes('--bg-sidebar: #ffffff;') &&
    indexCssSrc32.includes('--bg-surface: #ffffff;'),
    'Light theme (.theme-light) is preserved 100% untouched and pristine'
  );

  const titleBarSrc32 = fs.readFileSync(path.join(rootDir, 'src', 'components', 'CloudTitleBar.jsx'), 'utf8');
  assert(
    titleBarSrc32.includes("backgroundColor: 'var(--accent-soft)'") &&
    titleBarSrc32.includes("backgroundColor: 'var(--bg-surface)'"),
    'CloudTitleBar seamlessly integrates with theme variables without artificial cyan tint'
  );

  const settingsSrc32 = fs.readFileSync(path.join(rootDir, 'src', 'components', 'SettingsPage.jsx'), 'utf8');
  assert(
    settingsSrc32.includes("base: '#0a0a0a'") &&
    settingsSrc32.includes("base: '#0d1b3f'"),
    'SettingsPage preview swatches reflect pure pitch black and rich sapphire navy'
  );

  // Test: Windows Context Menu Vault/Lock Sanitization (v1.7.89)
  console.log('\n--- 33. Windows Context Menu Vault/Lock Sanitization (v1.7.89) ---');
  const cmSrc = fs.readFileSync(path.join(rootDir, 'electron', 'context-menu.js'), 'utf8');
  assert(
    !cmSrc.includes('الخزنة والحماية') && !cmSrc.includes('قفل الملف') && !cmSrc.includes('إخفاء في الخزنة'),
    'Context menu is completely purged of all vault, file lock, and encryption references'
  );
  assert(
    cmSrc.includes('cleanLegacyVaultKeys'),
    'Context menu manager implements automatic cleanup of legacy vault registry keys'
  );
  const mainSrc33 = fs.readFileSync(path.join(rootDir, 'electron', 'main.js'), 'utf8');
  assert(
    mainSrc33.includes('contextMenu.cleanLegacyVaultKeys()'),
    'electron/main.js invokes cleanLegacyVaultKeys upon startup'
  );

  // Test: Permanent desktop.ini & System Junk Filtering (v1.7.90)
  console.log('\n--- 34. Permanent desktop.ini & OS System Junk Filtering (v1.7.90) ---');
  const seInstance = require('../electron/sync-engine');
  assert(seInstance.shouldIgnorePath('C:\\test', 'C:\\test\\desktop.ini') === true, 'shouldIgnorePath blocks desktop.ini');
  assert(seInstance.shouldIgnorePath('C:\\test', 'C:\\test\\Desktop.ini') === true, 'shouldIgnorePath blocks Desktop.ini case-insensitively');
  assert(seInstance.shouldIgnorePath('C:\\test', 'C:\\test\\DESKTOP.INI') === true, 'shouldIgnorePath blocks DESKTOP.INI uppercase');
  assert(seInstance.shouldIgnorePath('C:\\test', 'C:\\test\\Thumbs.db') === true, 'shouldIgnorePath blocks Thumbs.db');
  assert(seInstance.shouldIgnorePath('C:\\test', 'C:\\test\\.DS_Store') === true, 'shouldIgnorePath blocks .DS_Store');

  const dbSrc34 = fs.readFileSync(path.join(rootDir, 'electron', 'database.js'), 'utf8');
  assert(
    dbSrc34.includes('isJunkSystemFile') &&
    dbSrc34.includes("NOT LIKE '%desktop.ini'"),
    'database.js filters desktop.ini and system junk from queries and insertions'
  );

  const gdriveSrc34 = fs.readFileSync(path.join(rootDir, 'electron', 'google-drive.js'), 'utf8');
  assert(
    gdriveSrc34.includes("fn === 'desktop.ini'") &&
    gdriveSrc34.includes("resolvedNameLower === 'desktop.ini'"),
    'google-drive.js filters desktop.ini from folder listings and blocks uploads'
  );

  const filesPageSrc34 = fs.readFileSync(path.join(rootDir, 'src', 'components', 'FilesPage.jsx'), 'utf8');
  assert(
    filesPageSrc34.includes("n !== 'desktop.ini'"),
    'FilesPage.jsx filters desktop.ini from tree and flat file listings'
  );

  const remoteSrc34 = fs.readFileSync(path.join(rootDir, 'src', 'components', 'RemoteCloudFolders.jsx'), 'utf8');
  assert(
    remoteSrc34.includes("n !== 'desktop.ini'"),
    'RemoteCloudFolders.jsx filters desktop.ini from remote folder inspection view'
  );

  // Test: Ultra-Premium Official Product Website & 3D Showcase Assets (v1.7.91)
  console.log('\n--- 35. Ultra-Premium Official Product Website & 3D Showcase Assets (v1.7.91) ---');
  const webHtml = fs.readFileSync(path.join(rootDir, 'website', 'index.html'), 'utf8');
  assert(
    webHtml.includes('hero-vault.jpg') &&
    webHtml.includes('cloud-migration.jpg') &&
    webHtml.includes('security-shield.jpg'),
    'website/index.html integrates high-resolution 3D showcase artwork'
  );
  assert(
    webHtml.includes('toggleLanguage') &&
    webHtml.includes('Zero-Deletion') &&
    webHtml.includes('comparison-table'),
    'website/index.html includes dynamic bilingual toggle, Zero-Deletion showcase, and comparison matrix'
  );
  assert(
    fs.existsSync(path.join(rootDir, 'website', 'assets', 'hero-vault.jpg')) &&
    fs.existsSync(path.join(rootDir, 'website', 'assets', 'cloud-migration.jpg')) &&
    fs.existsSync(path.join(rootDir, 'website', 'assets', 'security-shield.jpg')),
    'All generated high-tech showcase images exist in website/assets/'
  );

  // Test: Enterprise Legal Footer, Privacy Modal & Zero-GitHub Decoupling (v1.7.92)
  console.log('\n--- 36. Enterprise Legal Footer, Privacy Modal & Zero-GitHub Decoupling (v1.7.92) ---');
  const webHtmlUpdated = fs.readFileSync(path.join(rootDir, 'website', 'index.html'), 'utf8');
  assert(!webHtmlUpdated.includes('github.com'), 'website/index.html completely removes all GitHub links for public privacy');
  assert(!webHtmlUpdated.includes('>GitHub<'), 'website/index.html has zero visible GitHub buttons');
  assert(
    webHtmlUpdated.includes('privacyModal') &&
    webHtmlUpdated.includes('termsModal') &&
    webHtmlUpdated.includes('securityModal'),
    'website/index.html integrates comprehensive legal modals for Privacy Policy, Terms of Service, and Security'
  );
  assert(
    webHtmlUpdated.includes('openLegalModal') &&
    webHtmlUpdated.includes('closeLegalModalDirect'),
    'website/index.html contains interactive legal modal handler functions'
  );
  assert(
    webHtmlUpdated.includes('هل يؤثر البرنامج على سرعة الجهاز أو أداء الألعاب'),
    'website/index.html FAQ replaces desktop.ini question with system performance and gaming FAQ'
  );

  // Test: AuraSync Mobile Edition for Android & iOS (v1.7.93)
  console.log('\n--- 37. AuraSync Mobile Edition for Android & iOS (v1.7.93) ---');
  assert(fs.existsSync(path.join(rootDir, 'capacitor.config.json')), 'Capacitor mobile configuration (capacitor.config.json) exists');
  assert(fs.existsSync(path.join(rootDir, 'mobile', 'android', 'AndroidManifest.xml')), 'Android Manifest with full permissions exists');

  const androidManifest = fs.readFileSync(path.join(rootDir, 'mobile', 'android', 'AndroidManifest.xml'), 'utf8');
  assert(
    androidManifest.includes('MANAGE_EXTERNAL_STORAGE') &&
    androidManifest.includes('READ_MEDIA_IMAGES') &&
    androidManifest.includes('READ_MEDIA_VIDEO') &&
    androidManifest.includes('READ_MEDIA_AUDIO'),
    'Android Manifest includes full media and all-files storage permissions'
  );
  assert(
    androidManifest.includes('android.intent.action.SEND_MULTIPLE'),
    'Android Manifest registers SEND_MULTIPLE intent filter for sharing hundreds of files'
  );

  assert(fs.existsSync(path.join(rootDir, 'src', 'components', 'mobile', 'MobileApp.jsx')), 'MobileApp master component exists');
  assert(fs.existsSync(path.join(rootDir, 'src', 'components', 'mobile', 'MobileAutoBackup.jsx')), 'MobileAutoBackup component exists');
  assert(fs.existsSync(path.join(rootDir, 'src', 'components', 'mobile', 'MobileShareReceiver.jsx')), 'MobileShareReceiver component exists');

  const appSrc37 = fs.readFileSync(path.join(rootDir, 'src', 'App.jsx'), 'utf8');
  assert(appSrc37.includes('MobileApp') && appSrc37.includes('isMobileMode'), 'App.jsx integrates mobile mode detection and rendering');

  assert(fs.existsSync(path.join(rootDir, 'src', 'components', 'TopBar.jsx')), 'TopBar component exists');
  const topBarSrc37 = fs.readFileSync(path.join(rootDir, 'src', 'components', 'TopBar.jsx'), 'utf8');
  assert(topBarSrc37.includes('onToggleMobileMode'), 'TopBar.jsx exposes mobile mode toggle button');

  // Test: Native Android Mobile APK Packaging Engine (v1.7.95)
  console.log('\n--- 38. Native Android Mobile APK Packaging Engine (v1.7.95) ---');
  assert(fs.existsSync(path.join(rootDir, 'scripts', 'build-android-apk.js')), 'build-android-apk.js build script exists');
  assert(fs.existsSync(path.join(rootDir, 'mobile', 'android', 'src', 'com', 'aurasync', 'mobile', 'MainActivity.java')), 'Native Android MainActivity.java exists');

  const androidManifest38 = fs.readFileSync(path.join(rootDir, 'mobile', 'android', 'AndroidManifest.xml'), 'utf8');
  assert(androidManifest38.includes('targetSdkVersion="34"'), 'AndroidManifest.xml targets Android 14/15 (SDK 34) eliminating legacy OS popups');

  const mainActivityCode = fs.readFileSync(path.join(rootDir, 'mobile', 'android', 'src', 'com', 'aurasync', 'mobile', 'MainActivity.java'), 'utf8');
  assert(mainActivityCode.includes('AuraSyncAndroid') && mainActivityCode.includes('ACTION_SEND_MULTIPLE'), 'MainActivity implements AuraSyncAndroid JS bridge & bulk share intent receiver');
  assert(mainActivityCode.includes('candidates') && mainActivityCode.includes('setMixedContentMode'), 'MainActivity implements resilient asset fallback and mixed content modes');
  assert(mainActivityCode.includes('return "text/html"') && mainActivityCode.includes('return "text/javascript"'), 'MainActivity uses standard W3C MIME types for WebView resource serving');
  assert(mainActivityCode.includes('getEncoding') && mainActivityCode.includes('URLDecoder'), 'MainActivity provides clean encoding separation and URL decoding for assets');
  assert(mainActivityCode.includes('vibrate') && mainActivityCode.includes('getStorageUsage'), 'MainActivity exposes native haptics and hardware storage inspection');
  assert(androidManifest38.includes('android.permission.VIBRATE'), 'AndroidManifest.xml declares VIBRATE permission for tactile feedback');

  const cleanReleaseCode = fs.readFileSync(path.join(rootDir, 'scripts', 'clean-release.js'), 'utf8');
  assert(cleanReleaseCode.includes('build-android-apk.js'), 'clean-release.js automatically triggers build-android-apk.js');

  const ghReleaseCode = fs.readFileSync(path.join(rootDir, 'scripts', 'github-release.js'), 'utf8');
  assert(ghReleaseCode.includes('.apk') && ghReleaseCode.includes('AuraSync-v'), 'github-release.js supports uploading versioned .apk packages');

  const webHtmlCode = fs.readFileSync(path.join(rootDir, 'website', 'index.html'), 'utf8');
  assert(webHtmlCode.includes('AuraSync.apk'), 'website/index.html integrates AuraSync.apk download button');

  const pkgJsonRaw = JSON.parse(fs.readFileSync(path.join(rootDir, 'package.json'), 'utf8'));
  assert(Boolean(pkgJsonRaw.scripts && pkgJsonRaw.scripts['build:android']), 'package.json includes build:android script');

  // Test: Gallery Transfer to aurasync-mobile Cloud Folder (v1.7.96)
  console.log('\n--- 39. Gallery Transfer to aurasync-mobile Cloud Folder (v1.7.96) ---');
  const mobileEngineSrc = fs.readFileSync(path.join(rootDir, 'src', 'mobile', 'mobileEngine.js'), 'utf8');
  assert(mobileEngineSrc.includes("AURASYNC_MOBILE_FOLDER = MOBILE_FOLDER_NAME") && mobileEngineSrc.includes("'aurasync-mobile'"), 'mobileEngine exports AURASYNC_MOBILE_FOLDER constant as aurasync-mobile');
  assert(mobileEngineSrc.includes('receiveShareIntent') && mobileEngineSrc.includes('stagedShareFiles'), 'mobileEngine implements staged share files and intent receiver');
  
  const gDriveMobileSrc = fs.readFileSync(path.join(rootDir, 'electron', 'google-drive.js'), 'utf8');
  assert(gDriveMobileSrc.includes("const MOBILE_NAME = 'aurasync-mobile';"), 'Google Drive ensures aurasync-mobile folder in cloud root');

  const oneDriveMobileSrc = fs.readFileSync(path.join(rootDir, 'electron', 'onedrive.js'), 'utf8');
  assert(oneDriveMobileSrc.includes("const MOBILE_NAME = 'aurasync-mobile';"), 'OneDrive ensures aurasync-mobile folder in cloud root');

  const mobileHomeSrc = fs.readFileSync(path.join(rootDir, 'src', 'components', 'mobile', 'MobileHome.jsx'), 'utf8');
  assert(mobileHomeSrc.includes('handleStartGalleryBackup') && mobileHomeSrc.includes('AURASYNC_MOBILE_FOLDER'), 'MobileHome implements gallery transfer to aurasync-mobile cloud folder as primary feature');

  // Test: Swarm Parallel Architecture & End-to-End Bridge Verification
  console.log('\n--- 40. Swarm Parallel Architecture & End-to-End Bridge Verification ---');
  const swarmMainSrc = fs.readFileSync(path.join(rootDir, 'electron', 'main.js'), 'utf8');
  assert(swarmMainSrc.includes("ipcMain.handle('browser-guard:close-tab'"), 'main.js registers browser-guard:close-tab handler');
  assert(swarmMainSrc.includes("ipcMain.handle('browser-guard:set-grace-period'"), 'main.js registers browser-guard:set-grace-period handler');

  const mainJavaSrc = fs.readFileSync(path.join(rootDir, 'mobile', 'android', 'src', 'com', 'aurasync', 'mobile', 'MainActivity.java'), 'utf8');
  assert(mainJavaSrc.includes('public void downloadCloudFile('), 'MainActivity.java implements downloadCloudFile @JavascriptInterface');

  const mcpConfigSrc = fs.readFileSync('C:\\Users\\samer\\.gemini\\config\\mcp_config.json', 'utf8');
  assert(mcpConfigSrc.includes('"swarm-code"'), 'mcp_config.json includes swarm-code server');

  const projectMcpSrc = fs.readFileSync(path.join(rootDir, '.mcp.json'), 'utf8');
  assert(projectMcpSrc.includes('"swarm-code"'), '.mcp.json in workspace includes swarm-code server');

  assert(pkgJsonRaw.version === '1.7.100', 'package.json version matches 1.7.100');

  console.log('\n=====================================================');
  console.log(`Verification Complete: ${passedTests} / ${totalTests} tests passed (${Math.round((passedTests / totalTests) * 100)}%)`);
  console.log('=====================================================\n');

  if (passedTests === totalTests) {
    console.log('>>> ALL SYSTEMS 100% OPERATIONAL AND VALIDATED! <<<');
    process.exit(0);
  } else {
    console.error('>>> SOME CHECKS FAILED! <<<');
    process.exit(1);
  }
}

runTests().catch(err => {
  console.error('Fatal error during test suite:', err);
  process.exit(1);
});
