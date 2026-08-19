/** Local persistence and data access for Ledgerly.
 * Data is deliberately kept in one versioned localStorage document so it can
 * be migrated later to an API without changing the UI contract.
 */
const STORAGE_KEY = 'ledgerly.records.v1';

function emptyData() {
  return { version: 2, customers: [], transactions: [] };
}

export function loadData() {
  try {
    const stored = JSON.parse(localStorage.getItem(STORAGE_KEY));
    if (stored?.version === 2 && Array.isArray(stored.customers) && Array.isArray(stored.transactions)) return stored;
    // Seamless migration for records created before the customer register existed.
    if (stored?.version === 1 && Array.isArray(stored.transactions)) {
      const names = [...new Map(stored.transactions.map((item) => [item.person.toLowerCase(), item.person])).values()];
      const migrated = { version: 2, customers: names.map((name) => ({ id: crypto.randomUUID(), name, phone: '', note: '', createdAt: new Date().toISOString() })), transactions: stored.transactions };
      save(migrated);
      return migrated;
    }
  } catch (_) {
    // A corrupted browser record should never prevent access to the app.
  }
  return emptyData();
}

function save(data, notify = true) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  if (notify) window.dispatchEvent(new CustomEvent('ledgerly:data-changed', { detail: data }));
}

/** Used by cloud sync to safely hydrate this device from the signed-in account. */
export function replaceData(data) {
  save({ version: 2, customers: data.customers || [], transactions: data.transactions || [] }, false);
}

export function addCustomer({ name, phone = '', note = '' }) {
  const data = loadData();
  const cleanName = name.trim();
  if (data.customers.some((customer) => customer.name.toLowerCase() === cleanName.toLowerCase())) throw new Error('A customer with this name is already registered.');
  const customer = { id: crypto.randomUUID(), name: cleanName, phone: phone.trim(), note: note.trim(), createdAt: new Date().toISOString() };
  data.customers.push(customer);
  save(data);
  return customer;
}

export function addTransaction({ person, amount, type, note = '' }) {
  const data = loadData();
  const customer = data.customers.find((item) => item.name.toLowerCase() === person.trim().toLowerCase());
  if (!customer) throw new Error('Register this customer before adding a transaction.');
  const transaction = {
    id: crypto.randomUUID(), person: customer.name, amount: Number(amount), type,
    note: note.trim(), createdAt: new Date().toISOString()
  };
  data.transactions.unshift(transaction);
  save(data);
  return transaction;
}

export function removePerson(person) {
  const data = loadData();
  data.transactions = data.transactions.filter((item) => item.person.toLowerCase() !== person.toLowerCase());
  data.customers = data.customers.filter((item) => item.name.toLowerCase() !== person.toLowerCase());
  save(data);
}

/** Deletes one mistaken transaction without affecting the rest of a person's history. */
export function removeTransaction(transactionId) {
  const data = loadData();
  data.transactions = data.transactions.filter((item) => item.id !== transactionId);
  save(data);
}

/** Correct a transaction in place while preserving its original saved time. */
export function updateTransaction(transactionId, { amount, type }) {
  const data = loadData();
  const transaction = data.transactions.find((item) => item.id === transactionId);
  if (!transaction) return null;
  transaction.amount = Number(amount);
  transaction.type = type;
  save(data);
  return transaction;
}

export function getPeople() {
  const { customers, transactions } = loadData();
  const people = new Map(customers.map((customer) => [customer.name.toLowerCase(), { ...customer, balance: 0, count: 0, lastActivity: customer.createdAt }]));
  transactions.forEach((item) => {
    const key = item.person.toLocaleLowerCase();
    const current = people.get(key);
    if (!current) return;
    current.balance += item.type === 'debt' ? item.amount : -item.amount;
    current.count += 1;
    if (new Date(item.createdAt) > new Date(current.lastActivity)) current.lastActivity = item.createdAt;
  });
  // The register reads A → Z, ignoring capitals; a digit inside a name sorts
  // numerically (Shop 2 before Shop 10), which matches a paper ledger.
  return [...people.values()].sort((a, b) => a.name.localeCompare(b.name, 'en', { sensitivity: 'base', numeric: true }));
}

export function getPerson(name) {
  const data = loadData();
  const customer = data.customers.find((item) => item.name.toLowerCase() === name.toLowerCase());
  if (!customer) return null;
  const records = data.transactions.filter((item) => item.person.toLowerCase() === name.toLowerCase()).sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  return { ...customer, transactions: records, balance: records.reduce((sum, item) => sum + (item.type === 'debt' ? item.amount : -item.amount), 0) };
}

export function exportRecords() {
  return loadData().transactions;
}
