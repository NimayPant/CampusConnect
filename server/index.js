import express from 'express';
import path from 'node:path';
import { attachUser, protectMutation, installAuth } from './auth.js';
import { uploadsDir } from './storage.js';
import { installEvents } from './events.js';
import { seed } from './seed.js';

await seed();
const app = express();
app.disable('x-powered-by');
app.use(express.json({ limit: '64kb' }));
app.use('/api', attachUser, protectMutation);
installAuth(app);
installEvents(app);
app.get('/uploads/events/:filename', (req, res, next) => {
  if (!/^(seed-[a-z]+\.png|[a-f0-9-]{36}\.webp)$/.test(req.params.filename)) return res.status(404).end();
  res.set('X-Content-Type-Options', 'nosniff');
  res.sendFile(path.join(uploadsDir, req.params.filename), { maxAge: '1h' }, error => { if (error) next(Object.assign(new Error('Poster not found.'), { status: 404 })); });
});
app.use('/api', (req, res) => res.status(404).json({ message: 'API route not found.' }));
app.use((error, req, res, next) => {
  const status = error.code === 'LIMIT_FILE_SIZE' ? 413 : error.code?.startsWith('LIMIT_') ? 400 : error.status || 500;
  const message = status === 413 ? 'The poster exceeds the 5 MB limit.' : status === 500 ? 'The server could not complete this request. Check local storage and retry.' : error.message;
  if (!res.headersSent) res.status(status).json({ message, ...(error.fields ? { fields: error.fields } : {}) });
});
app.listen(process.env.PORT || 4000, '127.0.0.1', () => console.log('Campus Connect API ready on port ' + (process.env.PORT || 4000)));
