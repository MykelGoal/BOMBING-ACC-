import { addCustomer, addTransaction, exportRecords, getPeople, getPerson, removePerson, removeTransaction, updateTransaction } from './storage.js';
import { initCloud, signInWithEmail, signOut, signUpWithEmail } from './cloud.js';
import { escapeHtml, money, parseQuickEntry } from './format.js';
import { $, personRow, setMessage, toast, transactionRow } from './ui.js';

let activePerson = null;
let selectedType = 'debt';
let installPrompt = null;
let authMode = 'signIn';
let suggestedPeople = [];
let activeSuggestion = -1;

function showView(name) {
  ['dashboard', 'people', 'detail'].forEach((view) => $(`#${view}View`).classList.toggle('hidden', view !== name));
  document.querySelectorAll('.nav-link[data-view]').forEach((button) => button.classList.toggle('active', button.dataset.view === name));
  if (window.innerWidth <= 800) $('.sidebar').classList.remove('open');
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
  $('#personNote').value = '';
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

function currentNameQuery(value) {
  // Everything before + or - is the name the person is looking for.
  return value.split(/[+-]/, 1)[0].trim();
}

function hideSuggestions() {
  $('#entrySuggestions').classList.add('hidden');
  activeSuggestion = -1;
}

function renderSuggestions() {
  const field = $('#quickEntry');
  const query = currentNameQuery(field.value).toLowerCase();
  if (!query) return hideSuggestions();
  suggestedPeople = getPeople().filter((person) => person.name.toLowerCase().startsWith(query)).slice(0, 6);
  // A fully typed single match does not need to get in the way.
  if (!suggestedPeople.length || (suggestedPeople.length === 1 && suggestedPeople[0].name.toLowerCase() === query)) return hideSuggestions();
  $('#entrySuggestions').innerHTML = suggestedPeople.map((person, index) => `<button type="button" class="suggestion ${index === activeSuggestion ? 'active' : ''}" data-suggestion="${index}" role="option"><span class="avatar">${escapeHtml(person.name.charAt(0).toUpperCase())}</span><span>${escapeHtml(person.name)}</span><small>${money(person.balance)}</small></button>`).join('');
  $('#entrySuggestions').classList.remove('hidden');
  $('#entrySuggestions').querySelectorAll('[data-suggestion]').forEach((button) => button.addEventListener('mousedown', (event) => {
    event.preventDefault(); chooseSuggestion(Number(button.dataset.suggestion));
  }));
}

function chooseSuggestion(index) {
  const person = suggestedPeople[index];
  if (!person) return;
  const field = $('#quickEntry');
  const namePart = currentNameQuery(field.value);
  const remainder = field.value.slice(namePart.length).trimStart();
  field.value = `${person.name}${remainder ? ` ${remainder}` : ' '}`;
  hideSuggestions();
  field.focus();
}

function handleQuickEntryKeys(event) {
  if ($('#entrySuggestions').classList.contains('hidden')) return;
  if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
    event.preventDefault();
    activeSuggestion = event.key === 'ArrowDown' ? Math.min(activeSuggestion + 1, suggestedPeople.length - 1) : Math.max(activeSuggestion - 1, 0);
    renderSuggestions();
  }
  if (event.key === 'Enter' && activeSuggestion >= 0) {
    event.preventDefault(); chooseSuggestion(activeSuggestion);
  }
  if (event.key === 'Escape') hideSuggestions();
}

function saveQuickEntry(event) {
  event.preventDefault();
  const entry = parseQuickEntry($('#quickEntry').value);
  if (!entry) return setMessage($('#formMessage'), 'Try a name and amount, e.g. “Michael +500”.');
  const exactCustomer = getPeople().find((person) => person.name.toLowerCase() === entry.person.toLowerCase());
  if (!exactCustomer) return setMessage($('#formMessage'), `“${entry.person}” is not registered yet. Add the customer first to avoid spelling mistakes.`);
  try {
    addTransaction({ ...entry, person: exactCustomer.name, note: $('#quickNote').value });
  } catch (error) {
    return setMessage($('#formMessage'), error.message);
  }
  $('#quickEntry').value = '';
  $('#quickNote').value = '';
  setMessage($('#formMessage'), `${exactCustomer.name}'s record was updated.`, true);
  renderDashboard();
  toast('Entry saved');
}

function savePersonEntry(event) {
  event.preventDefault();
  const amount = Number($('#personAmount').value.replaceAll(',', ''));
  if (!Number.isFinite(amount) || amount <= 0) return setMessage($('#personFormMessage'), 'Enter an amount greater than zero.');
  addTransaction({ person: activePerson, amount, type: selectedType, note: $('#personNote').value });
  toast('Entry saved');
  openPerson(activePerson);
}

function renderAuthDialog() {
  const signingUp = authMode === 'signUp';
  $('#authTitle').textContent = signingUp ? 'Create your account' : 'Sign in';
  $('#authCopy').textContent = signingUp ? 'Use your own email and password. Your account is created instantly and you are signed in right away — no confirmation email needed.' : 'Sign in to keep this ledger safely synced across your devices.';
  $('#authSubmit').textContent = signingUp ? 'Create account' : 'Sign in';
  $('#authSwitch').textContent = signingUp ? 'Already have an account? Sign in' : 'New here? Create an account';
  $('#authPassword').autocomplete = signingUp ? 'new-password' : 'current-password';
}

function openAuthDialog() {
  $('#authForm').reset(); setMessage($('#authFormMessage'), ''); renderAuthDialog();
  $('#authDialog').showModal(); $('#authEmail').focus();
}

async function submitAuth(event) {
  event.preventDefault();
  const email = $('#authEmail').value.trim();
  const password = $('#authPassword').value;
  const message = $('#authFormMessage');
  try {
    if (authMode === 'signUp') {
      const result = await signUpWithEmail(email, password);
      // With "Confirm email" turned off in the Supabase dashboard, signUp
      // returns a session right away: the account is created AND signed in.
      if (result.session) { $('#authDialog').close(); return; }
      // No session means the Supabase project still requires an email
      // confirmation. Try signing in directly anyway — this succeeds once
      // "Confirm email" is turned off, so signup becomes instant.
      try {
        await signInWithEmail(email, password);
        $('#authDialog').close();
      } catch (_) {
        setMessage(message, 'Account created, but this Supabase project still requires an email confirmation before signing in. To create accounts and log in instantly without the email, turn off “Confirm email” in Supabase → Authentication → Sign In / Providers → Email, then create the account again.', true);
      }
    } else {
      await signInWithEmail(email, password);
      $('#authDialog').close();
    }
  } catch (error) { setMessage(message, error.message || 'Could not sign in. Please try again.'); }
}

function openCustomerDialog() {
  $('#customerForm').reset();
  setMessage($('#customerFormMessage'), '');
  $('#customerDialog').showModal();
  $('#customerName').focus();
}

function registerCustomer(event) {
  event.preventDefault();
  const name = $('#customerName').value.trim();
  if (!name) return setMessage($('#customerFormMessage'), 'Enter the customer’s name.');
  try {
    const customer = addCustomer({ name, phone: $('#customerPhone').value, note: $('#customerNote').value });
    $('#customerDialog').close();
    renderDashboard();
    toast(`${customer.name} was registered`);
    openPerson(customer.name);
  } catch (error) {
    setMessage($('#customerFormMessage'), error.message);
  }
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

async function installApplication() {
  if (!installPrompt) return toast('Use your browser menu and choose “Add to Home screen”.');
  installPrompt.prompt();
  const result = await installPrompt.userChoice;
  if (result.outcome === 'accepted') toast('AJ Dolly Ledger is installing');
  installPrompt = null;
  $('#installBtn').classList.add('hidden');
}

function setupPwa() {
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('./sw.js').catch(() => {});
  window.addEventListener('beforeinstallprompt', (event) => {
    event.preventDefault();
    installPrompt = event;
    $('#installBtn').classList.remove('hidden');
  });
  window.addEventListener('appinstalled', () => {
    installPrompt = null;
    $('#installBtn').classList.add('hidden');
    toast('AJ Dolly Ledger was installed');
  });
}

function setupEvents() {
  $('#quickEntryForm').addEventListener('submit', saveQuickEntry);
  $('#newCustomerBtn').addEventListener('click', openCustomerDialog);
  $('#authBtn').addEventListener('click', async () => {
    if ($('#authBtn').dataset.signedIn) { await signOut(); return; }
    openAuthDialog();
  });
  $('#authForm').addEventListener('submit', submitAuth);
  $('#authSwitch').addEventListener('click', () => { authMode = authMode === 'signUp' ? 'signIn' : 'signUp'; renderAuthDialog(); });
  $('#closeAuthDialog').addEventListener('click', () => $('#authDialog').close());
  $('#installBtn').addEventListener('click', installApplication);
  $('#customerForm').addEventListener('submit', registerCustomer);
  $('#closeCustomerDialog').addEventListener('click', () => $('#customerDialog').close());
  $('#quickEntry').addEventListener('input', () => { activeSuggestion = -1; renderSuggestions(); });
  $('#quickEntry').addEventListener('keydown', handleQuickEntryKeys);
  $('#quickEntry').addEventListener('blur', () => window.setTimeout(hideSuggestions, 120));
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
  // On phones, tapping the page outside the menu closes the drawer.
  $('main').addEventListener('click', (event) => {
    if (window.innerWidth <= 800 && !event.target.closest('#menuBtn')) $('.sidebar').classList.remove('open');
  });
}

function init() {
  $('#today').textContent = new Intl.DateTimeFormat('en-NG', { weekday: 'short', day: 'numeric', month: 'short' }).format(new Date());
  setupPwa();
  setupEvents(); renderDashboard();
  window.addEventListener('ledgerly:cloud-status', (event) => {
    $('#cloudState').textContent = event.detail === 'saved' ? '☁ Saved securely' : '⚠ Could not sync';
  });
  initCloud({
    onUser: (user) => {
      const button = $('#authBtn');
      button.dataset.signedIn = user ? 'true' : '';
      button.textContent = user ? 'Sign out' : 'Sign in';
      $('#cloudState').textContent = user ? '☁ Syncing securely' : 'Saved on this device';
    },
    onReady: () => { renderDashboard(); if (!$('#detailView').classList.contains('hidden') && activePerson) openPerson(activePerson); }
  }).catch(() => { $('#cloudState').textContent = 'Saved on this device'; });
}

init();
