import React, { useEffect, useState } from 'react';
export default function PosterEditor({ existing, file, onFile, alt, onAlt, remove, onRemove }) {
  const [preview, setPreview] = useState('');
  const [error, setError] = useState('');
  useEffect(() => {
    if (!file) { setPreview(''); return; }
    const url = URL.createObjectURL(file);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);
  function change(event) {
    const candidate = event.target.files[0];
    setError('');
    if (!candidate) return onFile(null);
    if (!['image/png', 'image/jpeg', 'image/webp'].includes(candidate.type) || candidate.size > 5 * 1024 * 1024) {
      setError('Choose a JPEG, PNG or WebP image no larger than 5 MB.');
      event.target.value = '';
      onFile(null);
      return;
    }
    onRemove(false);
    onFile(candidate);
  }
  const source = preview || (!remove && existing?.imageUrl);
  return <fieldset className="poster-editor"><legend>Event poster</legend>
    <label htmlFor="event-poster">Upload poster (optional)</label><input id="event-poster" name="poster" type="file" accept="image/png,image/jpeg,image/webp" onChange={change} aria-invalid={error ? true : undefined} aria-describedby="poster-hint"/>
    <p id="poster-hint" className={error ? 'field-error' : 'field-hint'}>{error || 'JPEG, PNG or WebP only. Maximum 5 MB. New files replace the current poster.'}</p>
    <label htmlFor="event-imageAlt">Alternative text {source ? '(required)' : '(required when a poster is supplied)'}</label><input id="event-imageAlt" name="imageAlt" value={alt} onChange={event => onAlt(event.target.value)} minLength={source ? 8 : undefined} maxLength={250} required={Boolean(source)} aria-describedby="alt-hint"/><p id="alt-hint">Describe the poster's meaning in 8–250 characters. Event details remain available as text.</p>
    {existing?.imageUrl && <label className="check-label"><input type="checkbox" checked={remove} onChange={event => { onRemove(event.target.checked); if (event.target.checked) onFile(null); }}/>Remove current poster</label>}
    {source && <figure><img className="poster-preview" src={source} alt={alt || 'Preview of the selected event poster'}/><figcaption>Poster preview</figcaption></figure>}
  </fieldset>;
}
