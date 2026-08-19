/** Local persistence and data access for Ledgerly.
 * Data is deliberately kept in one versioned localStorage document so it can
 * be migrated later to an API without changing the UI contract.
 */
const STORAGE_KEY = 'ledgerly.records.v1';

function emptyData() {
  return { version: 1, transactions: [] };
}

export function loadData() {
  try {
    const stored = JSON.parse(localStorage.getItem(STORAGE_KEY));
    if (stored?.version === 1 && Array.isArray(stored.transactions)) return stored;
  } catch (_) {
    // A corrupted browser record should never prevent access to the app.
  }
  return emptyData();
}

function save(data) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
}

export function addTransaction({ person, amount, type }) {
  const data = loadData();
  const transaction = {
    id: crypto.randomUUID(),
    person: person.trim(),
    amount: Number(amount),
    type, // debt = money lent; payment = money returned
    createdAt: new Date().toISOString()
  };
  data.transactions.unshift(transaction);
  save(data);
  return transaction;
}

export function removePerson(person) {
  const data = loadData();
  data.transactions = data.transactions.filter((item) => item.person.toLowerCase() !== person.toLowerCase());
  save(data);
}

export function getPeople() {
  const { transactions } = loadData();
  const people = new Map();
  transactions.forEach((item) => {
    const key = item.person.toLocaleLowerCase();
    const current = people.get(key) || { name: item.person, balance: 0, count: 0, lastActivity: item.createdAt };
    current.balance += item.type === 'debt' ? item.amount : -item.amount;
    current.count += 1;
    if (new Date(item.createdAt) > new Date(current.lastActivity)) current.lastActivity = item.createdAt;
    people.set(key, current);
  });
  return [...people.values()].sort((a, b) => new Date(b.lastActivity) - new Date(a.lastActivity));
}

export function getPerson(name) {
  const records = loadData().transactions
    .filter((item) => item.person.toLowerCase() === name.toLowerCase())
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  if (!records.length) return null;
  return {
    name: records[0].person,
    transactions: records,
    balance: records.reduce((sum, item) => sum + (item.type === 'debt' ? item.amount : -item.amount), 0)
  };
}

export function exportRecords() {
  return loadData().transactions;
}
