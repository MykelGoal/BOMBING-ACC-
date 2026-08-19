import { addCustomer, addTransaction, exportRecords, getPeople, getPerson, removePerson, removeTransaction, updateTransaction } from './storage.js';
import { initCloud, signInWithEmail, signOut, signUpWithEmail } from './cloud.js';
import { escapeHtml, money, parseAmountExpression, parseQuickEntry } from './format.js';
import { $, personRow, setMessage, toast, transactionRow } from './ui.js';

let activePerson = null;
let selectedType = 'debt';
let installPrompt = null;
let authMode = 'signIn';
let suggestedPeople = [];
let activeSuggestion = -1;
// In-app history: every screen change is pushed into the browser history so
// the phone's back button (and the ← arrow in the header) moves to the
// previous screen instead of leaving the app.
let currentView = 'dashboard';
let navDepth = 0;

function updateBackArrow() {
  $('#topBackBtn').classList.toggle('hidden', navDepth <= 0);
}

function showView(name, { person = null, updateHistory = true } = {}) {
  ['dashboard', 'people', 'detail'].forEach((view) => $(`#${view}View`).classList.toggle('hidden', view !== name));
  document.querySelectorAll('.nav-link[data-view]').forEach((button) => button.classList.toggle('active', button.dataset.view === name));
  if (window.innerWidth <= 800) $('.sidebar').classList.remove('open');
  if (name === 'dashboard') renderDashboard();
  if (name === 'people') renderPeople($('#searchPeople').value);
  if (updateHistory) {
    // Re-opening the same screen replaces the history entry instead of piling
    // up duplicates, so "back" always feels like one real step.
    const sameScreen = name === currentView && (name !== 'detail' || person === activePerson);
    if (sameScreen) history.replaceState(history.state, '');
    else { history.pushState({ appView: name, appPerson: person }, ''); navDepth += 1; }
  }
  currentView = name;
  updateBackArrow();
}

/** Restore whatever screen a history entry represents (phone back button). */
function restoreHistoryState(state) {
  // Re-entering a dialog entry only happens when pressing Forward; reopen it.
  if (state?.appDialog) {
    navDepth = Math.max(1, navDepth);
    const dialog = document.getElementById(state.appDialog);
    if (dialog && !dialog.open) dialog.showModal();
    updateBackArrow();
    return;
  }
  const isRoot = !state || state.root;
  navDepth = isRoot ? 0 : Math.max(0, navDepth - 1);
  document.querySelectorAll('dialog[open]').forEach((dialog) => dialog.close());
  const view = state?.appView || 'dashboard';
  if (view === 'detail' && state.appPerson && getPerson(state.appPerson)) {
    openPerson(state.appPerson, { updateHistory: false });
  } else {
    // The person may have been deleted since; fall back to the list.
    showView(view === 'detail' ? 'people' : view, { updateHistory: false });
  }
  updateBackArrow();
}

/** Dialogs get their own history entry, so phone-back closes them first. */
function openDialogWithBack(dialog) {
  dialog.showModal();
  history.pushState({ appDialog: dialog.id }, '');
  navDepth += 1;
  updateBackArrow();
}

function trackDialogInHistory(dialog) {
  dialog.addEventListener('close', () => {
    if (history.state?.appDialog === dialog.id) history.back();
  });
}

/** Runs a step after the history clean-up from a closing dialog has settled,
 *  so it does not race the popstate event and clobber the stack. */
function afterHistorySettles(callback) {
  let settled = false;
  const run = () => {
    if (settled) return;
    settled = true;
    window.removeEventListener('popstate', run);
    callback();
  };
  window.addEventListener('popstate', run);
  window.setTimeout(run, 350);
}

/** Called once at start-up: adopt any screen that was open before a refresh. */
function initHistory() {
  const existing = history.state;
  if (existing?.appView === 'detail' && existing.appPerson && getPerson(existing.appPerson)) {
    openPerson(existing.appPerson, { updateHistory: false });
    history.replaceState(existing, '');
    navDepth = 1;
  } else if (existing?.appView === 'people') {
    showView('people', { updateHistory: false });
    history.replaceState(existing, '');
    navDepth = 1;
  } else {
    history.replaceState({ appView: 'dashboard', root: true }, '');
    navDepth = 0;
    showView('dashboard', { updateHistory: false });
  }
  updateBackArrow();
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

function openPerson(name, { updateHistory = true } = {}) {
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
  updateAmountPreview();
  setMessage($('#personFormMessage'), '');
  showView('detail', { person: person.name, updateHistory });
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
  if (!entry) return setMessage($('#formMessage'), 'Try a name and amount, e.g. “Michael +500+200-100”.');
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
  const amount = parseAmountExpression($('#personAmount').value);
  if (amount == null) return setMessage($('#personFormMessage'), 'Enter an amount greater than zero. You can write 500+200-100.');
  try {
    addTransaction({ person: activePerson, amount, type: selectedType, note: $('#personNote').value });
  } catch (error) {
    return setMessage($('#personFormMessage'), error.message);
  }
  toast('Entry saved');
  openPerson(activePerson);
}

/** A phone's number keypad has no + or − key, so the sign buttons put the
 *  sign straight into the amount field at the cursor: 500, tap +, then 200
 *  becomes 500+200. On the person page, tapping a sign while the box is still
 *  empty instead picks what the entry means (borrowed / paid back). */
function insertSign(field, sign) {
  if (!field.value.trim()) {
    if (field.id === 'personAmount') {
      selectedType = sign === '+' ? 'debt' : 'payment';
      document.querySelectorAll('.type-choice').forEach((item) => item.classList.toggle('selected', item.dataset.type === selectedType));
      toast(sign === '+' ? 'Sign set to + — money borrowed' : 'Sign set to − — money paid back');
    } else {
      toast('Type the customer’s name first, then tap + or −');
    }
    field.focus();
    return;
  }
  const start = field.selectionStart ?? field.value.length;
  const end = field.selectionEnd ?? field.value.length;
  field.value = field.value.slice(0, start) + sign + field.value.slice(end);
  field.focus();
  field.setSelectionRange(start + 1, start + 1);
  // Keep dependent widgets (name suggestions, live total) in sync.
  field.dispatchEvent(new Event('input', { bubbles: true }));
}

/** Shows the running total of a combined amount such as 500+200−100. */
function updateAmountPreview() {
  const value = $('#personAmount').value;
  const amount = value.trim() ? parseAmountExpression(value) : null;
  $('#personAmountPreview').textContent = amount == null ? '' : `Total: ${money(amount)}`;
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
  openDialogWithBack($('#authDialog')); $('#authEmail').focus();
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
  openDialogWithBack($('#customerDialog'));
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
    // Wait for the dialog's history clean-up so the person page lands on a
    // clean stack entry (phone back then returns to the overview).
    afterHistorySettles(() => openPerson(customer.name));
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
    if ($('#authBtn').dataset.signedIn) {
      try { await signOut(); } catch (error) { toast(error.message || 'Could not sign out. Please try again.'); }
      return;
    }
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
  document.querySelectorAll('.sign-key').forEach((button) => button.addEventListener('click', () => {
    const field = document.getElementById(button.dataset.signTarget);
    if (field) insertSign(field, button.dataset.sign);
  }));
  $('#personAmount').addEventListener('input', updateAmountPreview);
  $('#personEntryForm').addEventListener('submit', savePersonEntry);
  $('#newEntryBtn').addEventListener('click', () => { showView('dashboard'); $('#quickEntry').focus(); });
  $('#backBtn').addEventListener('click', () => { if (navDepth > 0) history.back(); else showView('people'); });
  $('#topBackBtn').addEventListener('click', () => { if (navDepth > 0) history.back(); });
  window.addEventListener('popstate', (event) => restoreHistoryState(event.state));
  trackDialogInHistory($('#customerDialog'));
  trackDialogInHistory($('#authDialog'));
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
  setupEvents();
  initHistory();
  window.addEventListener('ledgerly:cloud-status', (event) => {
    const labels = { saved: '☁ Saved securely', error: '⚠ Could not sync', offline: '⚡ Offline — saved on this device' };
    $('#cloudState').textContent = labels[event.detail] || 'Saved on this device';
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
