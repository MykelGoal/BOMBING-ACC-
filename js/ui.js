import { dateTime, escapeHtml, money, shortDate } from './format.js';

export const $ = (selector) => document.querySelector(selector);

export function personRow(person) {
  return `<article class="debtor-row" data-person="${escapeHtml(person.name)}" tabindex="0" role="button">
    <div class="avatar">${escapeHtml(person.name.charAt(0).toUpperCase())}</div>
    <div><div class="person-name">${escapeHtml(person.name)}</div><div class="person-date">Last activity ${shortDate(person.lastActivity)}</div></div>
    <div class="balance">${money(person.balance)}</div><div class="row-arrow">→</div>
  </article>`;
}

export function transactionRow(transaction) {
  const isDebt = transaction.type === 'debt';
  return `<div class="history-row"><div class="history-symbol ${transaction.type}">${isDebt ? '+' : '−'}</div>
    <div><div class="history-title">${isDebt ? 'Money borrowed' : 'Payment received'}</div>${transaction.note ? `<div class="history-note">${escapeHtml(transaction.note)}</div>` : ''}<div class="history-date">${dateTime(transaction.createdAt)}</div></div>
    <div class="history-amount ${transaction.type}">${isDebt ? '+' : '−'}${money(transaction.amount)}</div>
    <div class="record-actions"><button class="record-action" data-edit-transaction="${transaction.id}" aria-label="Edit this entry" title="Edit entry">✎</button><button class="record-action danger" data-delete-transaction="${transaction.id}" aria-label="Delete this entry" title="Delete entry">×</button></div></div>`;
}

export function toast(message) {
  const element = $('#toast');
  element.textContent = message;
  element.classList.add('show');
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => element.classList.remove('show'), 2600);
}

export function setMessage(element, message, success = false) {
  element.textContent = message;
  element.classList.toggle('success', success);
}
