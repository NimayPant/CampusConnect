import { randomUUID } from 'node:crypto';
import { read, write } from './storage.js';
import { fail, eventData } from './validation.js';
import { requireUser, requireAdmin, requireStudent } from './auth.js';
import { upload, savePoster, removeUnusedPoster } from './uploads.js';

export function getEvent(id) {
  const event = read('events').find(event => event.id === id && !event.deletedAt);
  if (!event) fail(404, 'Event not found.');
  return event;
}
export function completed(event) { return new Date(event.date + 'T' + event.time) <= new Date(); }
function overview(event, req, registrations, feedback) {
  const active = registrations.filter(item => item.eventId === event.id && item.status === 'active');
  const ratings = feedback.filter(item => item.eventId === event.id);
  return { ...event, registeredCount: active.length, remainingSeats: Math.max(0, event.capacity - active.length), utilization: Math.round(active.length / event.capacity * 100), isFull: active.length >= event.capacity, isPast: completed(event), isRegistered: active.some(item => item.userId === req.user.id), ratingCount: ratings.length, averageRating: ratings.length ? Number((ratings.reduce((sum, item) => sum + item.rating, 0) / ratings.length).toFixed(2)) : null };
}
export function eventList(req) {
  const registrations = read('registrations'), feedback = read('feedback');
  return read('events').filter(event => !event.deletedAt).map(event => overview(event, req, registrations, feedback));
}
function feedbackAccess(req) {
  const event = getEvent(req.params.id);
  if (!completed(event)) fail(409, 'Feedback opens after the event start time has passed.');
  if (!read('registrations').some(item => item.eventId === event.id && item.userId === req.user.id && item.status === 'active')) fail(403, 'Only registered students can leave feedback.');
  return event;
}
function feedbackInput(body) {
  if (!Number.isInteger(body.rating) || body.rating < 1 || body.rating > 5) fail(400, 'Choose a whole-number rating from 1 to 5.');
  if (body.comment !== undefined && (typeof body.comment !== 'string' || body.comment.trim().length > 1000)) fail(400, 'Comments must be at most 1,000 characters.');
  return { rating: body.rating, comment: (body.comment || '').trim() };
}
export function installEvents(app) {
  app.post('/api/profile/reset-progress', requireStudent, (req, res) => {
    const now = new Date().toISOString();
    write('registrations', read('registrations').map(item => item.userId === req.user.id && item.status === 'active' ? { ...item, status: 'cancelled', cancelledAt: now } : item));
    res.json({ message: 'Your active registrations have been cancelled.' });
  });
  app.get('/api/events', requireUser, (req, res) => res.json(eventList(req)));
  app.get('/api/events/:id', requireUser, (req, res) => { getEvent(req.params.id); res.json(eventList(req).find(event => event.id === req.params.id)); });
  app.post('/api/events', requireAdmin, upload, async (req, res) => {
    const data = eventData(req.body);
    const poster = req.file ? await savePoster(req.file, data.imageAlt) : { imageUrl: '', imageAlt: '', imageFilename: '', imageMimeType: '' };
    const now = new Date().toISOString();
    const event = { ...data, ...poster, id: randomUUID(), createdAt: now, updatedAt: now };
    try { write('events', [...read('events'), event]); }
    catch (error) { removeUnusedPoster(poster.imageFilename); throw error; }
    res.status(201).json(eventList(req).find(item => item.id === event.id));
  });
  app.put('/api/events/:id', requireAdmin, upload, async (req, res) => {
    const original = getEvent(req.params.id);
    const data = eventData(req.body);
    if ((req.file || original.imageUrl) && data.imageAlt.length < 8 && req.body.removePoster !== 'true') fail(400, 'Provide descriptive alternative text of at least 8 characters.');
    const poster = req.file ? await savePoster(req.file, data.imageAlt) : req.body.removePoster === 'true' ? { imageUrl: '', imageFilename: '', imageMimeType: '', imageAlt: '' } : {};
    try {
      const current = getEvent(req.params.id);
      const count = read('registrations').filter(item => item.eventId === current.id && item.status === 'active').length;
      if (data.capacity < count) fail(409, 'Capacity cannot be lower than the current ' + count + ' registrations.');
      const event = { ...current, ...data, ...poster, updatedAt: new Date().toISOString() };
      write('events', read('events').map(item => item.id === event.id ? event : item));
      if (poster.imageFilename !== undefined && original.imageFilename !== poster.imageFilename) removeUnusedPoster(original.imageFilename);
      res.json(eventList(req).find(item => item.id === event.id));
    } catch (error) { if (req.file) removeUnusedPoster(poster.imageFilename); throw error; }
  });
  app.delete('/api/events/:id', requireAdmin, (req, res) => {
    const event = getEvent(req.params.id);
    write('events', read('events').map(item => item.id === event.id ? { ...item, deletedAt: new Date().toISOString() } : item));
    removeUnusedPoster(event.imageFilename);
    res.status(204).end();
  });
  app.get('/api/registrations/me', requireUser, (req, res) => {
    const liveIds = new Set(read('events').filter(event => !event.deletedAt).map(event => event.id));
    res.json(read('registrations').filter(item => item.userId === req.user.id && liveIds.has(item.eventId)));
  });
  app.post('/api/events/:id/register', requireStudent, (req, res) => {
    const event = getEvent(req.params.id);
    if (req.body?.userId && req.body.userId !== req.user.id) fail(403, 'You can register only your own account.');
    if (completed(event)) fail(409, 'Registration has closed for this event.');
    const records = read('registrations');
    if (records.some(item => item.eventId === event.id && item.userId === req.user.id && item.status === 'active')) fail(409, 'You are already registered.');
    if (records.filter(item => item.eventId === event.id && item.status === 'active').length >= event.capacity) fail(409, 'This event is full.');
    const registration = { id: randomUUID(), eventId: event.id, userId: req.user.id, status: 'active', registeredAt: new Date().toISOString() };
    write('registrations', [...records, registration]);
    res.status(201).json(registration);
  });
  app.delete('/api/events/:id/register', requireStudent, (req, res) => {
    getEvent(req.params.id);
    const records = read('registrations');
    const registration = records.find(item => item.eventId === req.params.id && item.userId === req.user.id && item.status === 'active');
    if (!registration) fail(404, 'No active registration was found.');
    write('registrations', records.map(item => item.id === registration.id ? { ...item, status: 'cancelled', cancelledAt: new Date().toISOString() } : item));
    res.status(204).end();
  });
  app.get('/api/events/:id/feedback', requireUser, (req, res) => {
    getEvent(req.params.id);
    const users = read('users');
    const items = read('feedback').filter(item => item.eventId === req.params.id).map(item => ({ ...item, fullName: users.find(user => user.id === item.userId)?.fullName || 'Student' }));
    res.json({ items, count: items.length, average: items.length ? Number((items.reduce((sum, item) => sum + item.rating, 0) / items.length).toFixed(2)) : null, distribution: [1, 2, 3, 4, 5].map(rating => ({ rating, count: items.filter(item => item.rating === rating).length })) });
  });
  app.post('/api/events/:id/feedback', requireStudent, (req, res) => {
    feedbackAccess(req);
    const data = feedbackInput(req.body);
    const records = read('feedback');
    if (records.some(item => item.userId === req.user.id && item.eventId === req.params.id)) fail(409, 'You have already rated this event. Edit your feedback instead.');
    const now = new Date().toISOString();
    const item = { ...data, id: randomUUID(), userId: req.user.id, eventId: req.params.id, createdAt: now, updatedAt: now };
    write('feedback', [...records, item]);
    res.status(201).json(item);
  });
  app.put('/api/events/:id/feedback', requireStudent, (req, res) => {
    feedbackAccess(req);
    const data = feedbackInput(req.body);
    const records = read('feedback');
    const existing = records.find(item => item.userId === req.user.id && item.eventId === req.params.id);
    if (!existing) fail(404, 'Your feedback was not found.');
    if (req.body.userId && req.body.userId !== req.user.id) fail(403, 'You can edit only your own feedback.');
    const updated = { ...existing, ...data, updatedAt: new Date().toISOString() };
    write('feedback', records.map(item => item.id === updated.id ? updated : item));
    res.json(updated);
  });
  app.delete('/api/events/:id/feedback', requireStudent, (req, res) => {
    getEvent(req.params.id);
    const records = read('feedback');
    const existing = records.find(item => item.userId === req.user.id && item.eventId === req.params.id);
    if (!existing) fail(404, 'Your feedback was not found.');
    write('feedback', records.filter(item => item.id !== existing.id));
    res.status(204).end();
  });
  app.delete('/api/admin/feedback/:id', requireAdmin, (req, res) => {
    const records = read('feedback');
    if (!records.some(item => item.id === req.params.id)) fail(404, 'Feedback not found.');
    write('feedback', records.filter(item => item.id !== req.params.id));
    res.status(204).end();
  });
  app.get('/api/admin/stats', requireAdmin, (req, res) => {
    const events = eventList(req), ids = new Set(events.map(item => item.id));
    const registrations = read('registrations').filter(item => ids.has(item.eventId));
    const feedback = read('feedback').filter(item => ids.has(item.eventId));
    const active = registrations.filter(item => item.status === 'active').length;
    const capacity = events.reduce((sum, item) => sum + item.capacity, 0);
    res.json({
      totalEvents: events.length, upcomingEvents: events.filter(item => !item.isPast).length, completedEvents: events.filter(item => item.isPast).length,
      totalStudents: read('users').filter(item => item.role === 'student').length, activeRegistrations: active,
      cancelledRegistrations: registrations.filter(item => item.status === 'cancelled').length, totalFeedback: feedback.length,
      averageRating: feedback.length ? Number((feedback.reduce((sum, item) => sum + item.rating, 0) / feedback.length).toFixed(2)) : null,
      totalCapacity: capacity, utilization: capacity ? Math.round(active / capacity * 100) : 0,
      events, categories: ['Workshop', 'Cultural', 'Sports', 'Career'].map(category => ({ category, count: events.filter(item => item.category === category).length })),
      popular: [...events].sort((a, b) => b.registeredCount - a.registeredCount).slice(0, 5),
      highestRated: events.filter(item => item.ratingCount).sort((a, b) => b.averageRating - a.averageRating || b.ratingCount - a.ratingCount).slice(0, 5),
      recent: [...events].sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 5)
    });
  });
}
