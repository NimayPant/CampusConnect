import React, { useEffect, useId, useRef, useState } from 'react';
import { api, json } from './api';

export function DataForm({ fields, initial = {}, onSubmit, submitLabel = 'Save changes', children }) {
  const [values, setValues] = useState(initial);
  const [errors, setErrors] = useState({});
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const errorRef = useRef(null);
  const prefix = useId();
  useEffect(() => { if (Object.keys(errors).length) errorRef.current?.focus(); }, [errors]);
  async function submit(event) {
    event.preventDefault();
    const next = {};
    for (const field of fields) {
      const control = event.currentTarget.elements.namedItem(field.name);
      if (field.required !== false && !String(values[field.name] || '').trim()) next[field.name] = 'Enter ' + field.label.toLowerCase() + '.';
      else if (!control.validity.valid) next[field.name] = field.hint || 'Enter a valid ' + field.label.toLowerCase() + '.';
    }
    setErrors(next);
    if (Object.keys(next).length) return;
    setBusy(true);
    setMessage('');
    try { const result = await onSubmit(values); setMessage(result || 'Changes saved.'); }
    catch (error) { setErrors({ server: error.message }); }
    finally { setBusy(false); }
  }
  return <form onSubmit={submit} noValidate>
    <p>Fields marked required must be completed.</p>
    {!!Object.keys(errors).length && <div ref={errorRef} tabIndex={-1} role="alert" className="error-summary"><p><strong>Check your entries</strong></p><ul>{Object.entries(errors).map(([key, value]) => <li key={key}>{key === 'server' ? value : <a href={'#' + prefix + key} onClick={event => { event.preventDefault(); document.getElementById(prefix + key)?.focus(); }}>{value}</a>}</li>)}</ul></div>}
    <div className="form-grid">{fields.map(field => {
      const common = { id: prefix + field.name, name: field.name, required: field.required !== false, value: values[field.name] ?? '', onChange: event => setValues({ ...values, [field.name]: event.target.value }), 'aria-invalid': errors[field.name] ? true : undefined, 'aria-describedby': prefix + field.name + '-hint' };
      return <div className={'field ' + (field.wide ? 'wide' : '')} key={field.name}>
        <label htmlFor={common.id}>{field.label}{field.required === false ? ' (optional)' : ' (required)'}</label>
        {field.options ? <select {...common}>{field.options.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}</select> : field.type === 'textarea' ? <textarea {...common} maxLength={field.maxLength || 1000} rows={4}/> : <input {...common} type={field.type || 'text'} autoComplete={field.autoComplete} minLength={field.minLength} maxLength={field.maxLength || 150} pattern={field.pattern}/>}
        <p className={errors[field.name] ? 'field-error' : 'field-hint'} id={common.id + '-hint'}>{errors[field.name] || field.hint || ' '}</p>
      </div>;
    })}</div>
    {children}
    {message && <p role="status" className="notice">{message}</p>}
    <div className="dialog-actions"><button className="primary" disabled={busy}>{busy ? 'Saving…' : submitLabel}</button></div>
  </form>;
}
const nameField = { name: 'fullName', label: 'Full name', maxLength: 100, autoComplete: 'name' };
const emailField = { name: 'email', label: 'Email address', type: 'email', autoComplete: 'email', hint: 'Use a valid address, such as name@example.com.' };
const passwordField = { name: 'password', label: 'Password', type: 'password', minLength: 10, maxLength: 128, pattern: '(?=.*[a-z])(?=.*[A-Z])(?=.*[0-9]).{10,128}', hint: '10–128 characters, including uppercase, lowercase and a number.', autoComplete: 'new-password' };

export function LoginPage({ onLogin }) {
  const [signup, setSignup] = useState(false);
  const fields = signup ? [nameField, { name: 'username', label: 'Username', pattern: '[A-Za-z][A-Za-z0-9_]{2,29}', maxLength: 30, autoComplete: 'username', hint: '3–30 letters, numbers or underscores; start with a letter.' }, emailField, passwordField] :
    [{ name: 'username', label: 'Username', autoComplete: 'username', maxLength: 30 }, { name: 'password', label: 'Password', type: 'password', maxLength: 128, autoComplete: 'current-password' }];
  return <div className="login-page"><header className="login-brand">Campus Connect</header><main className="login-panel">
    <h1>{signup ? 'Create student account' : 'Log in'}</h1><p>{signup ? 'Join campus activities using your own account.' : 'Use your student or administrator account.'}</p>
    <DataForm key={String(signup)} fields={fields} submitLabel={signup ? 'Create account' : 'Log in'} onSubmit={async values => { const result = await api('/auth/' + (signup ? 'register' : 'login'), json('POST', values)); onLogin(result.user); }}/>
    <button className="text-link" onClick={() => setSignup(!signup)}>{signup ? 'Already registered? Log in' : 'New student? Create an account'}</button>
    <p className="muted">Administrator access is assigned on the server. Creating an account always gives student access.</p>
  </main><footer>Nimay Pant · Tapash Upadhyay Bhattarai</footer></div>;
}

export function Profile({ user, onUserChange }) {
  return <section className="panel"><h2>Account details</h2><p>Username: <strong>{user.username}</strong> · Role: <strong>{user.role}</strong></p>
    <DataForm fields={[nameField, emailField]} initial={user} onSubmit={async values => { onUserChange(await api('/profile', json('PUT', values))); return 'Profile updated.'; }}/>
    <h2>Change password</h2>
    <DataForm submitLabel="Change password" fields={[{ name: 'currentPassword', label: 'Current password', type: 'password', autoComplete: 'current-password', maxLength: 128 }, { ...passwordField, name: 'newPassword', label: 'New password' }]} onSubmit={async values => (await api('/profile/password', json('PUT', values))).message}/>
  </section>;
}

export function Poster({ event, className = '' }) {
  return event.imageUrl ? <img className={'poster ' + className} src={event.imageUrl} alt={event.imageAlt} loading="lazy" width="1000" height="560"/> :
    <div className={'poster-placeholder ' + className}>No poster supplied for this event.</div>;
}
export function Capacity({ event }) {
  return <div className="capacity"><p>{event.registeredCount} registered / {event.capacity} capacity · <strong>{event.isFull ? 'Event full' : event.remainingSeats + ' seats remaining'}</strong></p><meter min="0" max={event.capacity} value={Math.min(event.registeredCount, event.capacity)} aria-label={'Capacity used for ' + event.title}/><span>{event.utilization}% capacity used</span></div>;
}

export function Feedback({ event, user, onChanged, onRemove }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [version, setVersion] = useState(0);
  useEffect(() => { let active = true; api('/events/' + event.id + '/feedback').then(result => { if (active) setData(result); }).catch(error => { if (active) setError(error.message); }); return () => { active = false; }; }, [event.id, version]);
  if (error) return <p role="alert">{error}</p>;
  if (!data) return <p role="status">Loading feedback…</p>;
  const mine = data.items.find(item => item.userId === user.id);
  return <section className="feedback"><h3>Feedback and ratings</h3>
    <p>{data.count ? data.average + ' out of 5 from ' + data.count + ' ratings' : 'No ratings yet.'}</p>
    <div className="rating-distribution">{data.distribution.map(item => <div key={item.rating}><span>{item.rating} / 5</span><meter min="0" max={Math.max(1, data.count)} value={item.count} aria-label={item.rating + ' out of 5: ' + item.count + ' ratings'}/><span>{item.count} ratings</span></div>)}</div>
    {user.role === 'student' && event.isPast && event.isRegistered ? <DataForm key={version} initial={{ rating: mine?.rating || '5', comment: mine?.comment || '' }} fields={[{ name: 'rating', label: 'Your rating', options: [5, 4, 3, 2, 1].map(n => ({ value: n, label: n + ' out of 5' })) }, { name: 'comment', label: 'Your comment', type: 'textarea', required: false, wide: true, maxLength: 1000, hint: 'Maximum 1,000 characters. Describe your experience respectfully.' }]} submitLabel={mine ? 'Update feedback' : 'Submit feedback'} onSubmit={async values => { await api('/events/' + event.id + '/feedback', json(mine ? 'PUT' : 'POST', { rating: Number(values.rating), comment: values.comment })); setVersion(version + 1); await onChanged(); return 'Feedback saved.'; }}/> : <p>Feedback is available to registered students after the event start time.</p>}
    {data.items.map(item => <article className="feedback-item" key={item.id}><h4>{item.fullName} · {item.rating} / 5</h4><p>{item.comment || 'Rating only; no comment.'}</p>{user.role === 'admin' && <button className="danger" onClick={() => onRemove(item)}>Remove feedback</button>}</article>)}
  </section>;
}

export function Dashboard() {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [version, setVersion] = useState(0);
  useEffect(() => { setError(''); api('/admin/stats').then(setData).catch(error => setError(error.message)); }, [version]);
  if (error) return <div role="alert">{error}<button onClick={() => setVersion(version + 1)}>Retry</button></div>;
  if (!data) return <p role="status">Loading statistics…</p>;
  return <section><h2>Campus activity statistics</h2><button onClick={() => setVersion(version + 1)}>Refresh statistics</button>
    <dl className="stats-grid">{[['Events', data.totalEvents], ['Upcoming', data.upcomingEvents], ['Completed', data.completedEvents], ['Students', data.totalStudents], ['Active registrations', data.activeRegistrations], ['Cancelled registrations', data.cancelledRegistrations], ['Feedback submissions', data.totalFeedback], ['Average rating', data.averageRating === null ? 'No ratings' : data.averageRating + ' / 5'], ['Capacity utilization', data.utilization + '%']].map(([name, value]) => <div key={name}><dt>{name}</dt><dd>{value}</dd></div>)}</dl>
    <h3>Events by category</h3><div className="category-chart">{data.categories.map(item => <div key={item.category}><span>{item.category}</span><div className="chart-track" aria-hidden="true"><div style={{ width: (data.totalEvents ? item.count / data.totalEvents * 100 : 0) + '%' }}/></div><span>{item.count} events</span></div>)}</div>
    <div className="table-scroll" tabIndex={0} role="region" aria-label="Event registration statistics"><table><caption>Registration counts and available seats</caption><thead><tr>{['Event', 'Registered', 'Capacity', 'Remaining', 'Utilization'].map(name => <th key={name} scope="col">{name}</th>)}</tr></thead><tbody>{data.events.map(item => <tr key={item.id}><th scope="row">{item.title}</th><td>{item.registeredCount}</td><td>{item.capacity}</td><td>{item.remainingSeats}</td><td>{item.utilization}%</td></tr>)}</tbody></table></div>
    {[['Most popular events', data.popular, 'registeredCount'], ['Highest rated events', data.highestRated, 'averageRating'], ['Recently created events', data.recent, 'createdAt']].map(([title, items, key]) => <section key={title}><h3>{title}</h3>{items.length ? <ol>{items.map(item => <li key={item.id}>{item.title} — {key === 'createdAt' ? new Date(item[key]).toLocaleDateString('en-IN') : key === 'averageRating' ? item[key] + ' / 5 (' + item.ratingCount + ' ratings)' : item[key] + ' registrations'}</li>)}</ol> : <p>No events in this group.</p>}</section>)}
  </section>;
}

export function Help() {
  return <section className="panel"><h2>Using Campus Connect</h2><p>Listen to the short guide or read the equivalent transcript below.</p>
    <audio controls preload="metadata" aria-label="Campus Connect audio guide" aria-describedby="guide-transcript"><source src="/media/guide.mp3" type="audio/mpeg"/>Your browser does not support audio playback. Read the transcript below.</audio>
    <h3 id="guide-transcript">Audio transcript</h3><p>Welcome to Campus Connect. Create a student account or log in. Browse events and check the remaining seats. Select Register to reserve a place. Open My schedule to cancel a registration. After an event, open its details to leave a rating and comment. Administrators can manage events, upload posters, remove feedback and view the dashboard. Use the Profile page to update your details or change your password. All forms can be operated with the keyboard.</p>
    <h3>Keyboard instructions</h3><p>Use Tab and Shift plus Tab to move between controls. Press Enter or Space to activate a button. Press Escape to close a dialog when no save is in progress. The Skip to content link moves directly to the main area.</p>
    <h3>Images and media</h3><p>Event posters have descriptive alternative text. The patterned divider below is decorative and is hidden from assistive technology. The audio guide has no autoplay and its full transcript is available on this page.</p><img src="/media/divider.svg" className="decorative-divider" alt="" aria-hidden="true" width="1000" height="18"/>
    <h3>Site map</h3><p>Log in or create an account, then use the main navigation to reach Events, My schedule, Saved events, Profile, Help and About. Administrators also have Manage events and Admin dashboard. Event details open from each listing; profile editing and password changes are on Profile.</p>
    <h3>Privacy and contact</h3><p>This local assignment stores your name, email, password hash, registrations and feedback on its server. Your name appears with feedback; your email and password hash are not published in event listings. Bookmarks are stored in this browser. Log out on shared computers. Contact the event organiser shown in its details for activity questions, or the project team named in About for account or data requests. Use demonstration information during assessment.</p>
  </section>;
}
