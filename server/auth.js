import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';
import { read, write } from './storage.js';
import { fail, username, email, password, text } from './validation.js';
const sessions = new Map();
const attempts = new Map();
const duration = 8 * 60 * 60 * 1000;
const production = process.env.NODE_ENV === 'production';
const cookieOptions = { httpOnly: true, sameSite: 'strict', secure: production, path: '/' };
export function hashPassword(value) {
  const passwordSalt = randomBytes(16).toString('hex');
  return { passwordSalt, passwordHash: scryptSync(value, passwordSalt, 64).toString('hex') };
}
export function verifyPassword(value, user) {
  if (typeof value !== 'string' || value.length > 128) return false;
  return timingSafeEqual(scryptSync(value, user.passwordSalt, 64), Buffer.from(user.passwordHash, 'hex'));
}
export function publicUser(user) { const { passwordSalt, passwordHash, ...safe } = user; return safe; }
function token(req) { return (req.headers.cookie || '').split(';').map(value => value.trim()).find(value => value.startsWith('campus_session='))?.slice(15); }
function beginSession(req, res, user) {
  sessions.delete(token(req));
  const sessionId = randomBytes(32).toString('hex');
  sessions.set(sessionId, { userId: user.id, expires: Date.now() + duration });
  res.cookie('campus_session', sessionId, { ...cookieOptions, maxAge: duration });
}
export function attachUser(req, res, next) {
  for (const [key, session] of sessions) if (session.expires <= Date.now()) sessions.delete(key);
  const session = sessions.get(token(req));
  if (session) req.user = read('users').find(user => user.id === session.userId);
  res.setHeader('Cache-Control', 'no-store');
  next();
}
export function requireUser(req, res, next) { if (!req.user) fail(401, 'Please log in to continue.'); next(); }
export function requireAdmin(req, res, next) { requireUser(req, res, () => {}); if (req.user.role !== 'admin') fail(403, 'Only an administrator can perform this action.'); next(); }
export function requireStudent(req, res, next) { requireUser(req, res, () => {}); if (req.user.role !== 'student') fail(403, 'Use a student account for this action.'); next(); }
export function protectMutation(req, res, next) {
  if (!['GET', 'HEAD', 'OPTIONS'].includes(req.method) && req.get('X-Campus-Request') !== '1') fail(403, 'This request must be made through Campus Connect.');
  next();
}
export function limitLogin(req, res, next) {
  const now = Date.now();
  for (const [key, value] of attempts) if (value.until <= now) attempts.delete(key);
  const key = req.ip + ':' + req.path;
  const record = attempts.get(key) || { count: 0, until: now + 15 * 60 * 1000 };
  if (record.count >= 10) { res.set('Retry-After', String(Math.ceil((record.until - now) / 1000))); fail(429, 'Too many attempts. Try again in 15 minutes.'); }
  record.count++;
  attempts.set(key, record);
  next();
}
export function installAuth(app) {
  app.get('/api/auth/me', (req, res) => res.json({ user: req.user ? publicUser(req.user) : null }));
  app.post('/api/auth/register', limitLogin, (req, res) => {
    const users = read('users');
    const data = { username: username(req.body.username), fullName: text(req.body.fullName, 'Full name', 100), email: email(req.body.email) };
    password(req.body.password);
    if (users.some(user => user.username === data.username || user.email === data.email)) fail(409, 'That username or email is already registered.');
    const now = new Date().toISOString();
    const user = { id: randomBytes(16).toString('hex'), ...data, role: 'student', ...hashPassword(req.body.password), createdAt: now, updatedAt: now };
    write('users', [...users, user]);
    beginSession(req, res, user);
    res.status(201).json({ user: publicUser(user) });
  });
  app.post('/api/auth/login', limitLogin, (req, res) => {
    const name = typeof req.body.username === 'string' ? req.body.username.trim().toLowerCase() : '';
    const user = read('users').find(item => item.username === name);
    if (!user || !verifyPassword(req.body.password, user)) fail(401, 'Incorrect username or password.');
    attempts.delete(req.ip + ':' + req.path);
    beginSession(req, res, user);
    res.json({ user: publicUser(user) });
  });
  app.post('/api/auth/logout', (req, res) => { sessions.delete(token(req)); res.clearCookie('campus_session', cookieOptions); res.status(204).end(); });
  app.get('/api/profile', requireUser, (req, res) => res.json(publicUser(req.user)));
  app.put('/api/profile', requireUser, (req, res) => {
    const fullName = text(req.body.fullName, 'Full name', 100);
    const address = email(req.body.email);
    const users = read('users');
    if (users.some(user => user.id !== req.user.id && user.email === address)) fail(409, 'That email is already in use.');
    const updated = { ...req.user, fullName, email: address, updatedAt: new Date().toISOString() };
    write('users', users.map(user => user.id === updated.id ? updated : user));
    res.json(publicUser(updated));
  });
  app.put('/api/profile/password', requireUser, limitLogin, (req, res) => {
    if (!verifyPassword(req.body.currentPassword, req.user)) fail(400, 'The current password is incorrect.');
    password(req.body.newPassword);
    const updated = { ...req.user, ...hashPassword(req.body.newPassword), updatedAt: new Date().toISOString() };
    write('users', read('users').map(user => user.id === updated.id ? updated : user));
    for (const [key, session] of sessions) if (session.userId === updated.id) sessions.delete(key);
    beginSession(req, res, updated);
    res.json({ message: 'Password changed. Other sessions have been signed out.' });
  });
}
