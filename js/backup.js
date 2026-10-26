// Full-data export/import as a single JSON file. Photos travel as data URLs.
import * as db from './db.js';
import { download, todayKey } from './util.js';

const FORMAT = 'nutrifer-backup';

const blobToDataUrl = (blob) => new Promise((resolve, reject) => {
  const r = new FileReader();
  r.onload = () => resolve(r.result);
  r.onerror = () => reject(r.error);
  r.readAsDataURL(blob);
});

const dataUrlToBlob = async (url) => (await fetch(url)).blob();

export async function exportBackup() {
  const data = {};
  for (const store of db.STORES) {
    const rows = await db.all(store, { includeDeleted: true });
    data[store] = store === 'photos'
      ? await Promise.all(rows.map(async (r) => (r.blob ? { ...r, blob: await blobToDataUrl(r.blob) } : r)))
      : rows;
  }
  const json = JSON.stringify({ format: FORMAT, version: 1, exportedAt: new Date().toISOString(), data });
  download(`nutrifer-copia-${todayKey()}.json`, new Blob([json], { type: 'application/json' }));
  try { localStorage.setItem('nutrifer:lastBackup', String(Date.now())); } catch { /* storage blocked */ }
}

export async function importBackup(file) {
  const parsed = JSON.parse(await file.text());
  if (parsed?.format !== FORMAT || typeof parsed.data !== 'object') throw new Error('format');
  let written = 0;
  for (const store of db.STORES) {
    const rows = parsed.data[store];
    if (!Array.isArray(rows)) continue;
    const ready = store === 'photos'
      ? await Promise.all(rows.map(async (r) => (typeof r.blob === 'string' ? { ...r, blob: await dataUrlToBlob(r.blob) } : r)))
      : rows;
    written += await db.mergeRecords(store, ready.filter((r) => r && r.id));
  }
  return written;
}
