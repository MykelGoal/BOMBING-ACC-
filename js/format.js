export const money = (value) => new Intl.NumberFormat('en-NG', {
  style: 'currency', currency: 'NGN', maximumFractionDigits: 2
}).format(value).replace('NGN', '₦').replace(/\s/g, '');

export const dateTime = (iso) => new Intl.DateTimeFormat('en-NG', {
  day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit'
}).format(new Date(iso));

export const shortDate = (iso) => new Intl.DateTimeFormat('en-NG', {
  day: 'numeric', month: 'short', year: 'numeric'
}).format(new Date(iso));

/** Accepts natural one-line entries such as "Michael +500" or "Michael -200". */
export function parseQuickEntry(input) {
  const match = input.trim().match(/^(.+?)\s*([+-])\s*(?:₦|NGN\s*)?([\d,]+(?:\.\d{1,2})?)\s*$/i);
  if (!match) return null;
  const person = match[1].trim();
  const amount = Number(match[3].replaceAll(',', ''));
  if (!person || !Number.isFinite(amount) || amount <= 0) return null;
  return { person, amount, type: match[2] === '+' ? 'debt' : 'payment' };
}

export function escapeHtml(value) {
  return String(value).replace(/[&<>'"]/g, (char) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;'
  })[char]);
}
