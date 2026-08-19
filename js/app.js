import { addTransaction, exportRecords, getPeople, getPerson, removePerson, removeTransaction, updateTransaction } from './storage.js';
import { money, parseQuickEntry } from './format.js';
import { $, personRow, setMessage, toast, transactionRow } from './ui.js';

let activePerson = null;
let selectedType = 'debt';

function showView(name) {
  ['dashboard', 'people', 'detail'].forEach((view) => $(`#${view}View`).classList.toggle('hidden', view !== name));
  document.querySelectorAll('.nav-link[data-view]').forEach((button) => button.classList.toggle('active', button.dataset.view === name));
  if (name === 'dashboard') renderDashboard();
  if (name === 'people') renderPeople();
}

function bindRows(container) {
  container.querySelectorAll('[data-person]').forEach((row) => {
    const open = () => openPerson(row.dataset.person);
    row.addEventListener('click', open);
    row.addEventListener('keydown', (event) => { if (event.key === 'Enter' || event.key === ' ') open(); });
  });
}

function renderDashboard() {
  const people = getPeople();
  const owing = people.filter((person) => person.balance > 0);
  const total = owing.reduce((sum, person) => sum + person.balance, 0);
  $('#totalOutstanding').textContent = money(total);
  $('#totalPeople').textContent = `${owing.length} ${owing.length === 1 ? 'person owes' : 'people owe'} you`;
  $('#personCount').textContent = people.length;
  $('#debtorList').innerHTML = owing.slice(0, 6).map(personRow).join('');
  $('#emptyState').classList.toggle('hidden', people.length > 0);
  bindRows($('#debtorList'));
}

function renderPeople(filter = '') {
  const query = filter.trim().toLowerCase();
  const people = getPeople().filter((person) => person.name.toLowerCase().includes(query));
  $('#allPeopleList').innerHTML = people.map(personRow).join('');
  $('#peopleEmpty').classList.toggle('hidden', people.length > 0);
  bindRows($('#allPeopleList'));
}

function openPerson(name) {
  const person = getPerson(name);
  if (!person) return;
  activePerson = person.name;
  $('#detailName').textContent = person.name;
  $('#sidePersonName').textContent = person.name;
  $('#detailAvatar').textContent = person.name.charAt(0).toUpperCase();
  $('#detailBalance').textContent = money(person.balance);
  $('#detailMeta').textContent = `${person.transactions.length} ${person.transactions.length === 1 ? 'entry' : 'entries'} recorded`;
  $('#historyList').innerHTML = person.transactions.map(transactionRow).join('');
  bindTransactionActions(person);
  $('#personAmount').value = '';
  setMessage($('#personFormMessage'), '');
  showView('detail');
}

function bindTransactionActions(person) {
  $('#historyList').querySelectorAll('[data-delete-transaction]').forEach((button) => button.addEventListener('click', () => {
    if (!window.confirm('Delete this entry? The balance will update immediately.')) return;
    removeTransaction(button.dataset.deleteTransaction);
    const updated = getPerson(person.name);
    toast('Entry deleted and balance updated');
    updated ? openPerson(updated.name) : showView('people');
  }));

  $('#historyList').querySelectorAll('[data-edit-transaction]').forEach((button) => button.addEventListener('click', () => {
    const transaction = person.transactions.find((item) => item.id === button.dataset.editTransaction);
    if (!transaction) return;
    const response = window.prompt('Correct the amount for this entry:', transaction.amount);
    if (response === null) return;
    const amount = Number(response.replaceAll(',', '').trim());
    if (!Number.isFinite(amount) || amount <= 0) return toast('Please enter an amount greater than zero');
    const isPayment = window.confirm('Is this a repayment? Select OK for payment received, or Cancel for money borrowed.');
    updateTransaction(transaction.id, { amount, type: isPayment ? 'payment' : 'debt' });
    toast('Entry corrected and balance updated');
    openPerson(person.name);
  }));
}

function saveQuickEntry(event) {
  event.preventDefault();
  const entry = parseQuickEntry($('#quickEntry').value);
  if (!entry) return setMessage($('#formMessage'), 'Try a name and amount, e.g. “Michael +500”.');
  addTransaction(entry);
  $('#quickEntry').value = '';
  setMessage($('#formMessage'), `${entry.person}'s record was updated.`, true);
  renderDashboard();
  toast('Entry saved');
}

function savePersonEntry(event) {
  event.preventDefault();
  const amount = Number($('#personAmount').value.replaceAll(',', ''));
  if (!Number.isFinite(amount) || amount <= 0) return setMessage($('#personFormMessage'), 'Enter an amount greater than zero.');
  addTransaction({ person: activePerson, amount, type: selectedType });
  toast('Entry saved');
  openPerson(activePerson);
}

function downloadExport() {
  const data = exportRecords();
  const header = 'Person,Type,Amount,Date and time\n';
  const rows = data.map((item) => `"${item.person.replaceAll('"', '""')}",${item.type},${item.amount},${item.createdAt}`).join('\n');
  const link = document.createElement('a');
  link.href = URL.createObjectURL(new Blob([header + rows], { type: 'text/csv' }));
  link.download = `ledgerly-records-${new Date().toISOString().slice(0, 10)}.csv`;
  link.click(); URL.revokeObjectURL(link.href);
  toast('Your records were exported');
}

function setupEvents() {
  $('#quickEntryForm').addEventListener('submit', saveQuickEntry);
  $('#personEntryForm').addEventListener('submit', savePersonEntry);
  $('#newEntryBtn').addEventListener('click', () => { showView('dashboard'); $('#quickEntry').focus(); });
  $('#backBtn').addEventListener('click', () => showView('people'));
  $('#exportBtn').addEventListener('click', downloadExport);
  $('#searchPeople').addEventListener('input', (event) => renderPeople(event.target.value));
  $('#deletePersonBtn').addEventListener('click', () => {
    if (activePerson && window.confirm(`Clear all records for ${activePerson}? This cannot be undone.`)) {
      removePerson(activePerson); toast(`${activePerson}'s record was cleared`); showView('people');
    }
  });
  document.querySelectorAll('.nav-link[data-view], [data-view].text-button').forEach((button) => button.addEventListener('click', () => showView(button.dataset.view)));
  document.querySelectorAll('.type-choice').forEach((button) => button.addEventListener('click', () => {
    selectedType = button.dataset.type;
    document.querySelectorAll('.type-choice').forEach((item) => item.classList.toggle('selected', item === button));
  }));
  $('#menuBtn').addEventListener('click', () => $('.sidebar').classList.toggle('open'));
}

function init() {
  $('#today').textContent = new Intl.DateTimeFormat('en-NG', { weekday: 'short', day: 'numeric', month: 'short' }).format(new Date());
  setupEvents(); renderDashboard();
}

init();
