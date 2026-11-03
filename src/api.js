export async function api(path, options = {}) {
  const multipart = options.body instanceof FormData;
  const response = await fetch('/api' + path, {
    credentials: 'same-origin',
    ...options,
    headers: { 'X-Campus-Request': '1', ...(multipart ? {} : { 'Content-Type': 'application/json' }), ...options.headers }
  });
  if (response.status === 204) return null;
  const result = await response.json().catch(() => ({ message: 'The server returned an unreadable response.' }));
  if (!response.ok) {
    if (response.status === 401 && !path.startsWith('/auth/')) window.dispatchEvent(new Event('campus-session-expired'));
    throw new Error(result.message || 'Request failed.');
  }
  return result;
}
export function json(method, data) { return { method, body: JSON.stringify(data) }; }
