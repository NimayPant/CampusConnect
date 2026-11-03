import React, { useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import './styles.css';
import { api, json } from './api';
import { LoginPage, Profile, Dashboard, Poster, Capacity, Feedback, Help } from './components';
import PosterEditor from './PosterEditor';

const categories = ['Workshop', 'Cultural', 'Sports', 'Career'];
const blank = { title: '', category: 'Workshop', date: '', time: '', location: '', organizer: '', description: '', capacity: 50, imageAlt: '' };
function storageKey(username) { return 'campus-connect-progress-v3-' + username; }
function readProgress(username) {
  try {
    const data = JSON.parse(localStorage.getItem(storageKey(username)));
    if (Array.isArray(data?.saved) && Array.isArray(data?.registered)) return data;
    return { saved: [], registered: [] };
  } catch { return { saved: [], registered: [] }; }
}
function dateLabel(event) {
  return new Date(event.date + 'T' + event.time).toLocaleString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit' });
}
function past(event) { return event.isPast ?? new Date(event.date + 'T' + event.time) < new Date(); }
async function request(path = '', options = {}) { return api('/events' + path, options); }

function Modal({ title, onClose, busy, children }) {
  const ref = useRef(null);
  useEffect(() => {
    const previous = document.activeElement;
    ref.current.showModal();
    return () => {
      if (previous?.isConnected) previous.focus();
      else document.getElementById('page-title')?.focus();
    };
  }, []);
  useEffect(() => { document.getElementById('dialog-title')?.focus(); }, [title]);
  return <dialog ref={ref} onCancel={event => { event.preventDefault(); if (!busy) onClose(); }} aria-labelledby="dialog-title" aria-busy={busy}>
    <div className="dialog-heading"><h2 id="dialog-title" tabIndex={-1}>{title}</h2><button disabled={busy} onClick={onClose}>Close</button></div>{children}
  </dialog>;
}

const fieldLabels = {
  title: 'Event title',
  category: 'Category',
  organizer: 'Organiser',
  date: 'Date',
  time: 'Time',
  location: 'Venue',
  description: 'Description',
  capacity: 'Capacity'
};

function EventField({ name, form, setForm, errors }) {
  const id = 'event-' + name;
  const hint = name === 'description' ? 'Describe the activity and what attendees should bring. Maximum 1,000 characters.' :
    name === 'time' ? 'Enter the start time in your local time zone.' :
    name === 'date' ? 'Select the date of the activity.' :
    name === 'category' ? 'Choose the category that best describes this event.' : name === 'capacity' ? 'Enter a whole number from 1 to 10,000. Capacity cannot be below existing registrations.' : 'Maximum 120 characters.';
  const common = {
    id,
    name,
    required: true,
    value: form[name],
    onChange: event => setForm(current => ({ ...current, [name]: event.target.value })),
    'aria-invalid': errors[name] ? true : undefined,
    'aria-describedby': id + '-hint' + (errors[name] ? ' ' + id + '-error' : '')
  };
  return <div className={['title', 'location', 'description'].includes(name) ? 'field wide' : 'field'}>
    <label htmlFor={id}>{fieldLabels[name]} (required)</label>
    {name === 'category' ? <select {...common}>{categories.map(item => <option key={item}>{item}</option>)}</select> :
      name === 'description' ? <textarea {...common} rows={4} maxLength={1000}/> :
      <input {...common} type={name === 'capacity' ? 'number' : ['date', 'time'].includes(name) ? name : 'text'} min={name === 'capacity' ? 1 : undefined} max={name === 'capacity' ? 10000 : undefined} step={name === 'capacity' ? 1 : undefined} maxLength={120}/>}
    <p className="field-hint" id={id + '-hint'}>{hint}</p>
    {errors[name] && <p className="field-error" id={id + '-error'}>{errors[name]}</p>}
  </div>;
}


async function authRequest(action, body) {
  const response = await fetch('/api/auth/' + action, {
    method: action === 'me' ? 'GET' : 'POST',
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json', 'X-Campus-Request': '1' },
    ...(body ? { body: JSON.stringify(body) } : {})
  });
  if (response.status === 204) return null;
  const data = await response.json().catch(() => ({ message: 'The login server is unavailable. Check that npm run dev is running.' }));
  if (!response.ok || (action !== 'logout' && !('user' in data))) throw new Error(data.message || 'Unable to connect to the login server.');
  return data;
}

function AuthGate() {
  const [user, setUser] = useState(null);
  const [checking, setChecking] = useState(true);
  const [error, setError] = useState('');
  async function check() {
    setChecking(true);
    setError('');
    try { setUser((await authRequest('me')).user); }
    catch (error) { setError(error.message); }
    finally { setChecking(false); }
  }
  useEffect(() => {
    check();
    const expire = () => setUser(null);
    window.addEventListener('campus-session-expired', expire);
    return () => window.removeEventListener('campus-session-expired', expire);
  }, []);
  useEffect(() => { if (!user) document.title = 'Log in | Campus Connect'; }, [user]);
  if (checking) return <main className="container"><p role="status">Checking your session…</p></main>;
  if (error) return <main className="container"><h1>Connection unavailable</h1><p role="alert">{error}</p><button onClick={check}>Retry</button></main>;
  return user ? <App key={user.id} user={user} onUserChange={setUser} onLogout={async () => { await authRequest('logout'); setUser(null); }}/> : <LoginPage onLogin={setUser}/>;
}

function App({ user, onLogout, onUserChange }) {
  const [events, setEvents] = useState([]);
  const [registrations, setRegistrations] = useState([]);
  const [poster, setPoster] = useState(null);
  const [removePoster, setRemovePoster] = useState(false);
  const [progress, setProgress] = useState(() => readProgress(user.username));
  const [page, setPage] = useState('Events');
  const isAdmin = user.role === 'admin';
  const [loggingOut, setLoggingOut] = useState(false);
  async function logout() {
    setLoggingOut(true);
    try { await onLogout(); } catch (error) { setError(error.message); }
    finally { setLoggingOut(false); }
  }
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState('All categories');
  const [sort, setSort] = useState('date');
  const [period, setPeriod] = useState('upcoming');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [modal, setModal] = useState(null);
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState('');
  const [form, setForm] = useState(blank);
  const [fieldErrors, setFieldErrors] = useState({});
  useEffect(() => {
    if (Object.keys(fieldErrors).length) document.getElementById('form-errors')?.focus();
  }, [fieldErrors]);
  useEffect(() => { load(); }, []);
  useEffect(() => {
    try { localStorage.setItem(storageKey(user.username), JSON.stringify(progress)); }
    catch { setError('Browser storage is unavailable. Bookmarks cannot be saved here; server registrations are unaffected.'); }
  }, [progress, user.username]);
  async function load() {
    setLoading(true);
    setError('');
    try { const [items, records] = await Promise.all([request(), api('/registrations/me')]); setEvents(items); setRegistrations(records); }
    catch { setError('Cannot load events. Start both servers with npm run dev, then select Retry.'); }
    finally { setLoading(false); }
  }
  function open(value) { setFormError(''); setFieldErrors({}); setModal(value); }
  function toggle(key, id) {
    setProgress(current => ({ ...current, [key]: current[key].includes(id) ? current[key].filter(item => item !== id) : [...current[key], id] }));
  }
  async function importRegistrations() {
    setBusy(true);
    const messages = [];
    const remaining = [];
    for (const id of [...new Set(progress.registered)]) {
      const event = events.find(item => item.id === String(id));
      if (event?.isRegistered) continue;
      try { await api('/events/' + encodeURIComponent(id) + '/register', json('POST', {})); }
      catch (error) { remaining.push(id); messages.push((event?.title || id) + ': ' + error.message); }
    }
    setProgress(current => ({ ...current, registered: remaining }));
    await load();
    setNotice(messages.length ? 'Some old registrations could not be imported. ' + messages.join(' ') : 'Old browser registrations have been imported into your server account.');
    setBusy(false);
  }
  async function register(event) {
    if (event.isRegistered) { open({ type: 'unregister', event }); return; }
    try { await api('/events/' + event.id + '/register', json('POST', {})); await load(); setNotice('Registered for ' + event.title + '.'); }
    catch (error) { setNotice(error.message); await load(); }
  }
  function edit(event) {
    if (!isAdmin) return;
    setPoster(null);
    setRemovePoster(false);
    setForm(event || { ...blank });
    open({ type: 'edit', event });
  }
  async function submit(e) {
    e.preventDefault();
    const errors = {};
    for (const name of Object.keys(fieldLabels)) {
      const input = e.currentTarget.elements.namedItem(name);
      if (!String(form[name] ?? '').trim()) errors[name] = 'Enter ' + fieldLabels[name].toLowerCase() + '.';
      else if (!input.validity.valid) errors[name] = 'Enter a valid ' + fieldLabels[name].toLowerCase() + '.';
    }
    if ((poster || (modal.event?.imageUrl && !removePoster)) && (form.imageAlt || '').trim().length < 8) errors.imageAlt = 'Provide descriptive alternative text of at least 8 characters.';
    setFieldErrors(errors);
    if (Object.keys(errors).length) return;
    setBusy(true);
    setFormError('');
    try {
      const existing = modal.event;
      const payload = new FormData();
      for (const key of [...Object.keys(fieldLabels), 'imageAlt']) payload.append(key, form[key] ?? '');
      payload.append('removePoster', String(removePoster));
      if (poster) payload.append('poster', poster);
      const result = await request(existing ? '/' + existing.id : '', { method: existing ? 'PUT' : 'POST', body: payload });
      setEvents(current => existing ? current.map(item => item.id === result.id ? result : item) : [...current, result]);
      setModal(null);
      setNotice(existing ? 'Event updated.' : 'Event published.');
    } catch (error) { setFormError(error.message); }
    finally { setBusy(false); }
  }
  async function confirm() {
    setBusy(true);
    setFormError('');
    try {
      if (modal.type === 'reset') {
        if (!isAdmin) await api('/profile/reset-progress', json('POST', {}));
        setProgress({ saved: [], registered: [] });
        await load();
        setNotice('Your saved events and registrations have been cleared. Published events are unchanged.');
      } else if (modal.type === 'unregister') {
        await api('/events/' + modal.event.id + '/register', { method: 'DELETE' });
        await load();
        setNotice('Registration cancelled. You can register again at any time before the event.');
      } else if (modal.type === 'remove-feedback') {
        await api('/admin/feedback/' + modal.feedback.id, { method: 'DELETE' });
        setNotice('Feedback removed.');
        await load();
      } else {
        await request('/' + modal.event.id, { method: 'DELETE' });
        setEvents(current => current.filter(event => event.id !== modal.event.id));
        setProgress(current => ({ saved: current.saved.filter(id => id !== modal.event.id), registered: current.registered.filter(id => id !== modal.event.id) }));
        setNotice('Event deleted from this local project.');
      }
      setModal(null);
    } catch (error) { setFormError(error.message); }
    finally { setBusy(false); }
  }
  const selected = events.filter(event => page === 'Saved events' ? progress.saved.includes(event.id) : page === 'My schedule' ? event.isRegistered : true);
  const visible = selected.filter(event => (
    (category === 'All categories' || category === event.category) &&
    (period === 'all' || (period === 'past' ? past(event) : !past(event))) &&
    [event.title, event.location, event.organizer, event.description].join(' ').toLowerCase().includes(query.toLowerCase())
  )).sort((a, b) => sort === 'name' ? a.title.localeCompare(b.title) : (a.date + a.time).localeCompare(b.date + b.time) * (sort === 'latest' ? -1 : 1));
  function clear() { setQuery(''); setCategory('All categories'); setPeriod('upcoming'); setSort('date'); }
  function navigate(name) {
    if (['Manage events', 'Admin dashboard'].includes(name) && !isAdmin) return;
    setPage(name);
    clear();
    setNotice('');
    requestAnimationFrame(() => document.getElementById('page-title')?.focus());
  }
  useEffect(() => { document.title = page + ' | Campus Connect'; }, [page]);
  const detailEvent = modal?.event ? events.find(event => event.id === modal.event.id) || modal.event : null;
  const upcoming = events.filter(event => !event.isPast);
  const next = upcoming.filter(event => event.isRegistered).sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time))[0];
  return <>
    <a className="skip" href="#main">Skip to content</a>
    <header className="site-header">
      <div className="header-inner"><a className="brand" href="#main" onClick={() => navigate('Events')}>Campus Connect<span>Student activity noticeboard</span></a><p>Web Technology Project<br/><strong>Nimay Pant · Tapash Upadhyay Bhattarai</strong></p><div className="account-controls"><span>Signed in: {user.username} ({isAdmin ? 'Admin' : 'Student'})</span><button disabled={loggingOut} onClick={logout}>{loggingOut ? 'Logging out…' : 'Log out'}</button></div></div>
      <nav aria-label="Main navigation"><div>{['Events', 'My schedule', 'Saved events', ...(isAdmin ? ['Manage events', 'Admin dashboard'] : []), 'Profile', 'Help', 'About'].map(name => <button key={name} aria-current={page === name ? 'page' : undefined} onClick={() => navigate(name)}>{name}</button>)}</div></nav>
    </header>
    <main id="main" className="container" tabIndex={-1}>
      <nav className="breadcrumb" aria-label="Breadcrumb"><a href="#main" onClick={() => navigate('Events')}>Campus Connect</a><span aria-hidden="true"> / </span><span aria-current="page">{page}</span></nav>
      {!isAdmin && progress.registered.length > 0 && <section className="panel"><h2>Import your earlier registrations</h2><p>This browser has registrations from the older version. Import them into your current account. Full, past or removed events cannot be imported.</p><button disabled={busy} onClick={importRegistrations}>{busy ? 'Importing…' : 'Import earlier registrations'}</button></section>}
      {notice && <div className="notice" role="status">{notice}<button onClick={() => setNotice('')}>Dismiss</button></div>}
      <section className="page-heading"><div><p className="overline">Campus activities</p><h1 id="page-title" tabIndex={-1}>{page === 'Events' ? 'The campus noticeboard' : page}</h1><p>{page === 'Events' ? 'Find an activity, check the details and plan your week.' : page === 'My schedule' ? 'Your registrations. Cancel a booking whenever your plans change.' : page === 'Saved events' ? 'Activities you have bookmarked for later.' : page === 'Manage events' ? 'Create, edit and remove events in this local demonstration.' : 'A student-built event management project.'}</p></div>{isAdmin && ['Events', 'Manage events'].includes(page) && <button className="primary" onClick={() => edit()}>Add event</button>}</section>
      {page === 'Profile' ? <Profile user={user} onUserChange={onUserChange}/> : page === 'Admin dashboard' && isAdmin ? <Dashboard/> : page === 'Help' ? <Help/> : page === 'About' ? <section className="about panel"><h2>About this project</h2><p>Campus Connect brings event notices, registrations and personal schedules into one place. It uses semantic HTML through React, a separate CSS stylesheet, browser JavaScript and a Node.js REST API.</p><h3>Division of work</h3><h4>Tapash Upadhyay Bhattarai</h4><ol><li>Authentication and authorization: login, logout, sessions, hashing, roles, protected routes and rate limiting.</li><li>Event management and capacity: creation, editing, deletion, seat counts, full-event status and validation.</li><li>Feedback and ratings: submissions, average ratings, editing and admin moderation.</li><li>Admin dashboard: statistics, capacity utilization, popular events and the protected statistics API.</li></ol><h4>Nimay Pant</h4><ol><li>Student registration and profiles: sign-up, profile editing, validation and password changes.</li><li>Event registration and schedule: server-side records, duplicate/full prevention and cancellation.</li><li>Posters: uploads, replacement, type/size checks, preview, responsive display and alternative text.</li><li>Data storage and seeding: JSON utilities, atomic writes, seed/reset commands, accounts, events, registrations, feedback and posters.</li></ol><p>Each member owns four connected modules spanning frontend and backend work. Nimay's account pages use the login/session APIs owned by Tapash. Shared integration, accessibility review and report preparation have a planned 50% allocation each.</p><h3>How data is stored</h3><p>Events, accounts, registrations and feedback are saved in four JSON files on the server. Bookmarks stay in this browser, separately for each account. Accounts are assigned either student or admin access. Only admins can change published events. The server checks permissions for every event creation, edit and deletion request.</p><h3>Start again</h3><p>Reset my progress clears your bookmarks and registrations only. It does not delete published events or unrelated browser data.</p><button className="danger" onClick={() => open({ type: 'reset' })}>Reset my progress</button></section> : <>
        <section className="summary" aria-label="Activity summary"><div><strong>{upcoming.length}</strong><span>Upcoming events</span></div><div><strong>{registrations.filter(item => item.status === 'active').length}</strong><span>My registrations</span></div><div><strong>{events.filter(event => progress.saved.includes(event.id)).length}</strong><span>Saved events</span></div><div className="next"><span>Next in my schedule</span><strong>{next?.title || 'No upcoming registrations'}</strong>{next && <small>{dateLabel(next)}</small>}</div></section>
        <section className="filters" aria-label="Event filters">
          <label className="search">Search events<input type="search" placeholder="Search title, venue or organiser" value={query} onChange={e => setQuery(e.target.value)}/></label>
          <label>Category<select value={category} onChange={e => setCategory(e.target.value)}>{['All categories', ...categories].map(item => <option key={item}>{item}</option>)}</select></label>
          <label>Show<select value={period} onChange={e => setPeriod(e.target.value)}><option value="upcoming">Upcoming</option><option value="all">All dates</option><option value="past">Past events</option></select></label>
          <label>Sort by<select value={sort} onChange={e => setSort(e.target.value)}><option value="date">Soonest first</option><option value="latest">Latest first</option><option value="name">Event name</option></select></label>
          <button onClick={clear}>Clear filters</button>
        </section>
        <div className="list-heading"><h2>{page === 'Manage events' ? 'Event management' : page === 'My schedule' ? 'Registered events' : page === 'Saved events' ? 'Your bookmarks' : 'Event listings'}</h2><span role="status" aria-live="polite" aria-atomic="true">{loading ? 'Loading' : visible.length} result{visible.length === 1 ? '' : 's'}</span></div>
        {error ? <div role="alert" className="error panel">{error}<button onClick={load}>Retry</button></div> : loading ? <p role="status" className="panel">Loading events…</p> : !visible.length ? <div className="empty panel"><h3>No events to show</h3><p>Try another filter or browse all events.</p><button onClick={() => { navigate('Events'); setPeriod('all'); }}>Browse all events</button></div> :
        <div className="event-list">{visible.map(event => <article className="event-row" key={event.id}>
          <div className="date-block"><strong>{new Date(event.date + 'T12:00').getDate()}</strong><span>{new Date(event.date + 'T12:00').toLocaleDateString('en-IN', { month: 'short' })}</span></div>
          <div className="event-copy"><Poster event={event}/><div className="tags"><span>{event.category}</span>{event.isRegistered && <span className="registered">Registered</span>}{past(event) && <span>Past event</span>}</div><h3><button onClick={() => open({ type: 'details', event })}>{event.title}</button></h3><p className="metadata">{dateLabel(event)} · {event.location}</p><p className="description">{event.description}</p><p className="organizer">Organised by {event.organizer}</p><Capacity event={event}/><p>{event.ratingCount ? event.averageRating + " / 5 from " + event.ratingCount + " ratings" : "No ratings yet"}</p></div>
          <div className="event-actions">{!isAdmin && <button className={event.isRegistered ? 'danger' : 'primary'} disabled={(event.isPast || event.isFull) && !event.isRegistered} onClick={() => register(event)}>{event.isRegistered ? 'Unregister' : event.isPast ? 'Registration closed' : event.isFull ? 'Event full' : 'Register'}</button>}<button aria-pressed={progress.saved.includes(event.id)} onClick={() => toggle('saved', event.id)}>{progress.saved.includes(event.id) ? 'Remove saved' : 'Save event'}</button><button onClick={() => open({ type: 'details', event })}>View details</button>{isAdmin && page === 'Manage events' && <><button onClick={() => edit(event)}>Edit event</button><button className="danger" onClick={() => open({ type: 'delete', event })}>Delete event</button></>}</div>
        </article>)}</div>}
        <section className="bottom-note"><p><strong>Local project demo.</strong> Event examples are fictional. Registrations are stored on the server. Bookmarks belong to your account in this browser.</p><button onClick={() => open({ type: 'reset' })}>Reset my progress</button></section>
      </>}
    </main>
    <footer><div><strong>Campus Connect</strong><p>HTML · CSS · JavaScript · React · Node.js</p></div><nav aria-label="Footer navigation">{['Events', 'My schedule', 'Help', 'About'].map(name => <button key={name} onClick={() => { navigate(name); window.scrollTo(0, 0); }}>{name}</button>)}</nav></footer>
    {modal && <Modal title={modal.type === 'edit' ? modal.event ? 'Edit event' : 'Add an event' : modal.type === 'details' ? modal.event.title : modal.type === 'reset' ? 'Reset your progress?' : modal.type === 'delete' ? 'Delete this event?' : modal.type === 'remove-feedback' ? 'Remove this feedback?' : 'Cancel your registration?'} busy={busy} onClose={() => !busy && setModal(null)}>
      {modal.type === 'edit' ? <form onSubmit={submit} noValidate aria-describedby="form-instructions"><p id="form-instructions" className="muted">Complete every field marked required. A poster is optional; alternative text is required when a poster is supplied. Then select Save event.</p>
      {Object.keys(fieldErrors).length > 0 && <div id="form-errors" className="error-summary" role="alert" tabIndex={-1}>
        <h3>Please correct the following fields</h3>
        <ul>{Object.entries(fieldErrors).map(([name, message]) => <li key={name}><a href={'#event-' + name} onClick={event => { event.preventDefault(); document.getElementById('event-' + name)?.focus(); }}>{message}</a></li>)}</ul>
      </div>}
      <div className="form-grid">{Object.keys(fieldLabels).map(name => <EventField key={name} name={name} form={form} setForm={setForm} errors={fieldErrors}/>)}</div><PosterEditor existing={modal.event} file={poster} onFile={setPoster} alt={form.imageAlt || ''} onAlt={value => setForm({ ...form, imageAlt: value })} remove={removePoster} onRemove={setRemovePoster}/>
      {formError && <p role="alert" className="error">Could not save event: {formError}</p>}
      <div className="dialog-actions"><button type="button" onClick={() => setModal(null)} disabled={busy}>Cancel</button><button className="primary" disabled={busy}>{busy ? 'Saving…' : 'Save event'}</button></div></form> :
      modal.type === 'details' ? <><Poster event={detailEvent}/><dl><dt>Date and time</dt><dd>{dateLabel(detailEvent)}</dd><dt>Venue</dt><dd>{detailEvent.location}</dd><dt>Organiser</dt><dd>{detailEvent.organizer}</dd><dt>Category</dt><dd>{detailEvent.category}</dd></dl><p>{detailEvent.description}</p><Capacity event={detailEvent}/><div className="dialog-actions"><button onClick={() => toggle('saved', detailEvent.id)}>{progress.saved.includes(detailEvent.id) ? 'Remove saved' : 'Save event'}</button>{!isAdmin && <button className="primary" disabled={(detailEvent.isPast || detailEvent.isFull) && !detailEvent.isRegistered} onClick={() => register(detailEvent)}>{detailEvent.isRegistered ? 'Unregister' : detailEvent.isPast ? 'Registration closed' : detailEvent.isFull ? 'Event full' : 'Register'}</button>}</div><Feedback event={detailEvent} user={user} onChanged={load} onRemove={feedback => open({ type: 'remove-feedback', event: detailEvent, feedback })}/></> :
      <><p>{modal.type === 'reset' ? 'This clears bookmarks in this browser and cancels your active server registrations across devices. Your account, previous feedback and published events remain unchanged. This cannot be undone.' : modal.type === 'remove-feedback' ? 'This removes the selected rating and comment from the event. This cannot be undone.' : modal.type === 'delete' ? 'This removes “' + modal.event.title + '” from listings and schedules. Its record and registration history are retained. This cannot be undone through the website.' : 'Your registration for “' + modal.event.title + '” will be removed from My schedule. Your bookmark, if any, will remain.'}</p>{formError && <p role="alert" className="error">{formError}</p>}<div className="dialog-actions"><button disabled={busy} onClick={() => setModal(null)}>Keep it</button><button className="danger" disabled={busy} onClick={confirm}>{busy ? 'Please wait…' : modal.type === 'reset' ? 'Reset my progress' : modal.type === 'delete' ? 'Delete event' : modal.type === 'remove-feedback' ? 'Remove feedback' : 'Unregister'}</button></div></>}
    </Modal>}
  </>;
}
createRoot(document.getElementById('root')).render(<AuthGate/>);
