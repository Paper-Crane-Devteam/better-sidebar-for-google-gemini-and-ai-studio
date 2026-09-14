import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
const dir = await mkdtemp(join(tmpdir(), 'document-storage-test-'));
const files = new Map([['paper.pdf', new Uint8Array([1])]]);
let failWrite = false, failBackup = false;
globalThis.__storageTest = {
  MAX_LOCAL_BYTES: 100000,
  async stat(_, path) { return files.has(path) ? { kind: 'file' } : null; },
  async readBytes(_, path) { const bytes = files.get(path).slice(); return { bytes, size: bytes.length, modified: 0 }; },
  async writeBytes(_, path, bytes) {
    if (path.startsWith('.history/') && failBackup) throw new Error('backup quota');
    files.set(path, bytes.slice());
    if (path === 'paper.pdf' && failWrite) { failWrite = false; throw new Error('interrupted write'); }
  },
  async listFiles() { return { entries: [...files.keys()].filter(path => path.startsWith('.history/')).map(path => ({ kind: 'file', path })) }; },
  async remove(_, path) { files.delete(path); },
};
try {
  await build({ entryPoints: ['src/shared/documents/storage.ts'], bundle: true, platform: 'node', format: 'esm', outfile: join(dir, 'storage.mjs'), plugins: [{ name: 'mock-opfs', setup(builder) {
    builder.onResolve({ filter: /^@\/shared\/workspace\/fs$/ }, () => ({ path: 'fs', namespace: 'test' }));
    builder.onLoad({ filter: /.*/, namespace: 'test' }, () => ({ contents: 'export const { MAX_LOCAL_BYTES, stat, readBytes, writeBytes, listFiles, remove } = globalThis.__storageTest;' }));
  } }] });
  const { saveDocument } = await import(pathToFileURL(join(dir, 'storage.mjs')));
  const scope = { workspaceId: 'test' };
  await saveDocument(scope, 'paper.pdf', new Uint8Array([2]), { sessionId: 's', verify: async () => undefined });
  failWrite = true;
  await assert.rejects(() => saveDocument(scope, 'paper.pdf', new Uint8Array([3]), { sessionId: 's' }), /restored/);
  assert.deepEqual([...files.get('paper.pdf')], [2]);
  let checks = 0;
  await assert.rejects(() => saveDocument(scope, 'paper.pdf', new Uint8Array([4]), { sessionId: 's', verify: async () => { if (++checks === 2) throw new Error('readback invalid'); } }), /restored/);
  assert.deepEqual([...files.get('paper.pdf')], [2]);
  failBackup = true;
  await assert.rejects(() => saveDocument(scope, 'paper.pdf', new Uint8Array([5]), { sessionId: 'new' }), /nothing was written/);
  assert.deepEqual([...files.get('paper.pdf')], [2]);
  await assert.rejects(() => saveDocument(scope, 'paper.pdf', new Uint8Array([6]), { verify: async () => { throw new Error('invalid bytes'); } }), /structure check/);
  assert.deepEqual([...files.get('paper.pdf')], [2]);
  console.log('Document storage checks passed: asynchronous verification, later-session rollback, interrupted write rollback and backup failure.');
} finally { await rm(dir, { recursive: true, force: true }); delete globalThis.__storageTest; }
