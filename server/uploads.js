import multer from 'multer';
import sharp from 'sharp';
import path from 'node:path';
import { unlinkSync, existsSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { uploadsDir, read } from './storage.js';
import { fail } from './validation.js';
export const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024, files: 1, fields: 12 },
  fileFilter(req, file, callback) {
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.mimetype)) return callback(Object.assign(new Error('Use a JPEG, PNG or WebP image.'), { status: 415 }));
    callback(null, true);
  }
}).single('poster');
export async function savePoster(file, alt) {
  if (!alt || alt.length < 8 || alt.length > 250) fail(400, 'Provide descriptive image alternative text of 8–250 characters.');
  const filename = randomUUID() + '.webp';
  try {
    const image = sharp(file.buffer, { limitInputPixels: 25000000 });
    const meta = await image.metadata();
    const types = { jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp' };
    if (!types[meta.format] || types[meta.format] !== file.mimetype || (meta.pages || 1) > 1) fail(415, 'The image content does not match a supported single-frame image type.');
    await image.rotate().resize({ width: 1400, height: 1000, fit: 'inside', withoutEnlargement: true }).webp({ quality: 82 }).toFile(path.join(uploadsDir, filename));
    return { imageUrl: '/uploads/events/' + filename, imageFilename: filename, imageMimeType: 'image/webp', imageAlt: alt };
  } catch (error) {
    if (error.status) throw error;
    fail(415, 'The image could not be decoded. Choose a valid JPEG, PNG or WebP under 5 MB.');
  }
}
export function removeUnusedPoster(filename) {
  if (!/^[a-f0-9-]{36}\.webp$/.test(filename || '')) return;
  if (read('events').some(event => !event.deletedAt && event.imageFilename === filename)) return;
  const target = path.join(uploadsDir, filename);
  if (existsSync(target)) unlinkSync(target);
}
