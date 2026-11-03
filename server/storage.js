import { existsSync, mkdirSync, readFileSync, writeFileSync, renameSync, copyFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
export const dataDir = path.resolve(process.env.CAMPUS_DATA_DIR || fileURLToPath(new URL('./data/', import.meta.url)));
export const uploadsDir = path.resolve(process.env.CAMPUS_UPLOAD_DIR || fileURLToPath(new URL('./uploads/events/', import.meta.url)));
export const names = ['events', 'users', 'registrations', 'feedback'];
mkdirSync(dataDir, { recursive: true });
mkdirSync(uploadsDir, { recursive: true });
function filename(name) {
  if (!names.includes(name)) throw new Error('Unknown collection.');
  return path.join(dataDir, name + '.json');
}
export function exists(name) { return existsSync(filename(name)); }
export function read(name) {
  if (!exists(name)) return [];
  try {
    const value = JSON.parse(readFileSync(filename(name), 'utf8'));
    if (!Array.isArray(value)) throw new Error();
    return value;
  } catch { throw new Error('Stored data could not be read. Restore a valid backup before continuing.'); }
}
export function write(name, value) {
  if (!Array.isArray(value)) throw new Error('Storage requires an array.');
  const target = filename(name);
  const temporary = target + '.' + randomUUID() + '.tmp';
  try {
    writeFileSync(temporary, JSON.stringify(value, null, 2), { mode: 0o600 });
    renameSync(temporary, target);
  } catch { throw new Error('The change could not be saved. Please retry or check local storage.'); }
}
export function backup() {
  const destination = path.join(path.dirname(dataDir), 'backups', new Date().toISOString().replace(/[:.]/g, '-') + '-' + randomUUID().slice(0, 6));
  mkdirSync(destination, { recursive: true });
  for (const name of names) if (exists(name)) copyFileSync(filename(name), path.join(destination, name + '.json'));
  return destination;
}
export function migrateEvents() {
  const old = read('events');
  const now = new Date().toISOString();
  const next = old.map(event => ({ ...event, id: String(event.id), capacity: event.capacity ?? 50, createdAt: event.createdAt || now, updatedAt: event.updatedAt || now, imageUrl: event.imageUrl || '', imageAlt: event.imageAlt || '', imageFilename: event.imageFilename || '', imageMimeType: event.imageMimeType || '' }));
  if (JSON.stringify(next) !== JSON.stringify(old)) write('events', next);
}
