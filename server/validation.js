export function fail(status, message, fields) { const error = new Error(message); error.status = status; error.fields = fields; throw error; }
export function text(value, label, max = 120, required = true) {
  if (typeof value !== 'string' || (required && !value.trim()) || value.trim().length > max) fail(400, label + ' is required and must be at most ' + max + ' characters.');
  return value.trim();
}
export function username(value) {
  const result = text(value, 'Username', 30).toLowerCase();
  if (!/^[a-z][a-z0-9_]{2,29}$/.test(result)) fail(400, 'Username must be 3–30 characters, start with a letter, and contain only letters, numbers or underscores.');
  return result;
}
export function email(value) {
  const result = text(value, 'Email', 150).toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(result)) fail(400, 'Enter a valid email address.');
  return result;
}
export function password(value) {
  if (typeof value !== 'string' || value.length < 10 || value.length > 128 || !/[a-z]/.test(value) || !/[A-Z]/.test(value) || !/[0-9]/.test(value)) fail(400, 'Password must be 10–128 characters with uppercase, lowercase and a number.');
  return value;
}
export const categories = ['Workshop', 'Cultural', 'Sports', 'Career'];
export function eventData(body) {
  const value = {};
  for (const key of ['title', 'category', 'date', 'time', 'location', 'organizer', 'description']) value[key] = text(body[key], key, key === 'description' ? 1000 : 120);
  if (!categories.includes(value.category)) fail(400, 'Choose a valid category.');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value.date) || Number.isNaN(Date.parse(value.date)) || new Date(value.date).toISOString().slice(0, 10) !== value.date) fail(400, 'Enter a valid date.');
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(value.time)) fail(400, 'Enter a valid time.');
  value.capacity = Number(body.capacity);
  if (!Number.isInteger(value.capacity) || value.capacity < 1 || value.capacity > 10000) fail(400, 'Capacity must be a whole number from 1 to 10,000.');
  value.imageAlt = typeof body.imageAlt === 'string' ? body.imageAlt.trim() : '';
  if (value.imageAlt.length > 250) fail(400, 'Alternative text must be at most 250 characters.');
  return value;
}
