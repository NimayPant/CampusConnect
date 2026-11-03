import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createInterface } from 'node:readline/promises';
import sharp from 'sharp';
import { exists, read, write, names, backup, uploadsDir, migrateEvents } from './storage.js';
import { hashPassword, verifyPassword } from './auth.js';
import { password } from './validation.js';

const titles = [
  ['HTML and CSS Practical Session', 'Workshop'],
  ['Resume Review Workshop', 'Career'],
  ['Interdepartmental Chess Tournament', 'Sports'],
  ['Student Music Evening', 'Cultural'],
  ['UI and Accessibility Workshop', 'Workshop'],
  ['Internship Preparation Seminar', 'Career'],
  ['React Development Workshop', 'Workshop'],
  ['Football Tournament', 'Sports'],
  ['Cultural Dance Festival', 'Cultural'],
  ['Campus Placement Orientation', 'Career'],
  ['JavaScript Coding Challenge', 'Workshop'],
  ['Badminton Competition', 'Sports'],
  ['Photography Exhibition', 'Cultural'],
  ['Mock Interview Session', 'Career'],
  ['Cybersecurity Awareness Session', 'Workshop'],
  ['Campus Marathon', 'Sports'],
  ['Debate Competition', 'Cultural'],
  ['Entrepreneurship Talk', 'Career'],
  ['Open Source Contribution Workshop', 'Workshop'],
  ['Alumni Networking Event', 'Career']
];
const venues = { Workshop: 'Computer Lab 2', Career: 'Seminar Hall', Sports: 'Student Sports Centre', Cultural: 'College Auditorium' };
export async function createPosters() {
  for (const [category, color] of [['Workshop', '#28543f'], ['Career', '#304c69'], ['Sports', '#6b482c'], ['Cultural', '#67425c']]) {
    const file = path.join(uploadsDir, 'seed-' + category.toLowerCase() + '.png');
    if (existsSync(file)) continue;
    const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="1000" height="560"><rect width="1000" height="560" fill="' + color + '"/><rect x="50" y="50" width="900" height="460" fill="none" stroke="#ffffff" stroke-width="2"/><text x="90" y="150" fill="#ffffff" font-size="36" font-family="sans-serif">Campus Connect</text><text x="90" y="310" fill="#ffffff" font-size="80" font-family="sans-serif">' + category + '</text><text x="90" y="410" fill="#ffffff" font-size="30" font-family="sans-serif">Student activities and learning</text></svg>';
    await sharp(Buffer.from(svg)).png().toFile(file);
  }
}
export async function seed({ reset = false, fillEmpty = false } = {}) {
  if (process.env.NODE_ENV === 'production') {
    if (!process.env.ADMIN_PASSWORD || !process.env.STUDENT_PASSWORD || process.env.ADMIN_PASSWORD === 'Admin@12345' || process.env.STUDENT_PASSWORD === 'Student@12345') throw new Error('Production requires non-demo ADMIN_PASSWORD and STUDENT_PASSWORD.');
    password(process.env.ADMIN_PASSWORD);
    password(process.env.STUDENT_PASSWORD);
  }
  if (reset) console.log('Backup saved to ' + backup());
  const needed = Object.fromEntries(names.map(name => [name, reset || !exists(name) || (fillEmpty && read(name).length === 0)]));
  await createPosters();
  const now = new Date().toISOString();
  const adminPassword = process.env.ADMIN_PASSWORD || 'Admin@12345';
  const studentPassword = process.env.STUDENT_PASSWORD || 'Student@12345';
  if (needed.users) {
    const users = [{ id: 'admin-01', username: 'admin', fullName: 'Campus Administrator', email: 'admin@campus.example', role: 'admin', ...hashPassword(adminPassword), createdAt: now, updatedAt: now }];
    for (let i = 1; i <= 24; i++) users.push({ id: 'student-' + String(i).padStart(2, '0'), username: i === 1 ? 'student' : 'student' + i, fullName: i === 1 ? 'Demo Student' : 'Demo Student ' + i, email: 'student' + i + '@campus.example', role: 'student', ...hashPassword(studentPassword), createdAt: now, updatedAt: now });
    write('users', users);
  }
  if (needed.events) {
    write('events', titles.map(([title, category], i) => {
      const date = new Date();
      date.setDate(date.getDate() + (i < 6 ? i - 12 : i - 4));
      return { id: 'event-' + String(i + 1).padStart(2, '0'), title, category, date: date.toISOString().slice(0, 10), time: '14:00', location: venues[category], organizer: category + ' Committee', description: title + ' is a student activity combining guided participation and discussion. Arrive fifteen minutes early. Contact the organising committee for access arrangements.', capacity: [20, 30, 50, 75, 100, 200][i % 6], imageUrl: '/uploads/events/seed-' + category.toLowerCase() + '.png', imageAlt: category + ' activity poster with Campus Connect branding', imageFilename: 'seed-' + category.toLowerCase() + '.png', imageMimeType: 'image/png', createdAt: now, updatedAt: now };
    }));
  }
  migrateEvents();
  if (process.env.NODE_ENV === 'production' && read('users').some(user => verifyPassword(user.role === 'admin' ? 'Admin@12345' : 'Student@12345', user))) throw new Error('Existing demonstration passwords must be replaced before production use.');
  const users = read('users').filter(user => user.role === 'student');
  const events = read('events').filter(event => !event.deletedAt);
  if (needed.registrations) {
    const registrations = [];
    events.forEach((event, i) => {
      const count = Math.min(event.capacity, users.length, i < 6 ? 6 : i === 6 ? 20 : i === 7 ? 24 : i % 4 + 1);
      for (let j = 0; j < count; j++) registrations.push({ id: 'seed-reg-' + event.id + '-' + users[j].id, eventId: event.id, userId: users[j].id, status: 'active', registeredAt: new Date(new Date(event.date).getTime() - 3 * 86400000).toISOString() });
      if (i > 10 && users.length > count) registrations.push({ id: 'seed-cancel-' + event.id, eventId: event.id, userId: users[count].id, status: 'cancelled', registeredAt: now, cancelledAt: now });
    });
    write('registrations', registrations);
  }
  if (needed.feedback) {
    const validUsers = new Set(users.map(user => user.id));
    const pastIds = new Set(events.filter(event => new Date(event.date + 'T' + event.time) < new Date()).map(event => event.id));
    const comments = ['Clear explanation and useful examples.', 'The session needed more practice time.', 'Good organisation and helpful discussion.', 'A useful introduction to the topic.', 'The activity could have been better paced.'];
    const records = read('registrations').filter(registration => registration.status === 'active' && pastIds.has(registration.eventId) && validUsers.has(registration.userId));
    write('feedback', records.slice(0, 30).map((registration, i) => ({ id: 'seed-feedback-' + registration.id, eventId: registration.eventId, userId: registration.userId, rating: i % 5 + 1, comment: comments[i % 5], createdAt: now, updatedAt: now })));
  }
  return Object.fromEntries(names.map(name => [name, read(name).length]));
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const reset = process.argv.includes('--reset');
  if (reset) {
    console.warn('Reset replaces users, events, registrations and feedback. A JSON backup is saved first. Uploaded posters are retained.');
    if (!process.argv.includes('--yes')) {
      const terminal = createInterface({ input: process.stdin, output: process.stdout });
      const answer = await terminal.question('Type RESET to continue: ');
      terminal.close();
      if (answer !== 'RESET') process.exit(0);
    }
  }
  console.log(await seed({ reset, fillEmpty: true }));
}
