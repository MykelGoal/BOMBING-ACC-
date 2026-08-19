export const money = (value) => new Intl.NumberFormat('en-NG', {
  style: 'currency', currency: 'NGN', maximumFractionDigits: 2
}).format(value).replace('NGN', '₦').replace(/\s/g, '');

export const dateTime = (iso) => new Intl.DateTimeFormat('en-NG', {
  day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit'
}).format(new Date(iso));

export const shortDate = (iso) => new Intl.DateTimeFormat('en-NG', {
  day: 'numeric', month: 'short', year: 'numeric'
}).format(new Date(iso));

/** Adds and subtracts figures such as 500+200+300 or 500+200-100. */
export function parseAmountExpression(input) {
  const cleaned = String(input ?? '').trim().replace(/[₦,\s]/gi, '').replace(/^NGN/i, '');
  if (!cleaned || /[^0-9.+-]/.test(cleaned)) return null;
  const expression = cleaned.replace(/^\+/, '');
  if (!/^\d/.test(expression)) return null;
  const tokens = expression.match(/[+-]?\d+(?:\.\d{1,2})?/g);
  if (!tokens || tokens.join('') !== expression) return null;
  let total = 0;
  for (const token of tokens) {
    const value = Number(token);
    if (!Number.isFinite(value)) return null;
    total += value;
  }
  return total > 0 ? Number(total.toFixed(2)) : null;
}

/** Accepts "Michael +500", "Michael -200", or "Michael +500+200+300+850". */
export function parseQuickEntry(input) {
  const match = input.trim().match(/^(.+?)\s*([+-])\s*(.+)$/);
  if (!match) return null;
  const person = match[1].trim();
  const amount = parseAmountExpression(match[3]);
  if (!person || amount == null) return null;
  return { person, amount, type: match[2] === '+' ? 'debt' : 'payment' };
}

export function escapeHtml(value) {
  return String(value).replace(/[&<>'"]/g, (char) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;'
  })[char]);
}
