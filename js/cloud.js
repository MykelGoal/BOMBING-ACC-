import { SUPABASE_ANON_KEY, SUPABASE_URL } from './supabase-config.js';
import { loadData, replaceData } from './storage.js';

let client;
let activeUser;
let syncing = false;
let syncTimer;

function toDb(data, userId) {
  return {
    customers: data.customers.map((item) => ({ id: item.id, user_id: userId, name: item.name, phone: item.phone || '', note: item.note || '', created_at: item.createdAt })),
    transactions: data.transactions.map((item) => ({ id: item.id, user_id: userId, person: item.person, amount: item.amount, type: item.type, note: item.note || '', created_at: item.createdAt }))
  };
}

async function pullCloudLedger() {
  const [{ data: customers, error: customerError }, { data: transactions, error: transactionError }] = await Promise.all([
    client.from('customers').select('*').order('created_at', { ascending: false }),
    client.from('transactions').select('*').order('created_at', { ascending: false })
  ]);
  if (customerError || transactionError) throw customerError || transactionError;
  return {
    customers: customers.map((item) => ({ id: item.id, name: item.name, phone: item.phone, note: item.note, createdAt: item.created_at })),
    transactions: transactions.map((item) => ({ id: item.id, person: item.person, amount: Number(item.amount), type: item.type, note: item.note, createdAt: item.created_at }))
  };
}

async function pushLedger(data) {
  if (!activeUser || syncing) return;
  const ledger = toDb(data, activeUser.id);
  syncing = true;
  try {
    // Replacing this small personal ledger makes edits/deletions reliable too.
    // This is intentionally simple; it can be upgraded to granular sync later.
    await client.from('transactions').delete().eq('user_id', activeUser.id);
    await client.from('customers').delete().eq('user_id', activeUser.id);
    if (ledger.customers.length) {
      const { error } = await client.from('customers').insert(ledger.customers);
      if (error) throw error;
    }
    if (ledger.transactions.length) {
      const { error } = await client.from('transactions').insert(ledger.transactions);
      if (error) throw error;
    }
    window.dispatchEvent(new CustomEvent('ledgerly:cloud-status', { detail: 'saved' }));
  } catch (error) {
    console.error('Cloud sync failed', error);
    window.dispatchEvent(new CustomEvent('ledgerly:cloud-status', { detail: 'error' }));
  } finally { syncing = false; }
}

function schedulePush(event) {
  clearTimeout(syncTimer);
  syncTimer = setTimeout(() => pushLedger(event.detail), 650);
}

export async function signInWithGoogle() {
  const { error } = await client.auth.signInWithOAuth({ provider: 'google', options: { redirectTo: window.location.origin + window.location.pathname } });
  if (error) throw error;
}

export async function signOut() { await client.auth.signOut(); }

export async function initCloud({ onUser, onReady }) {
  const { createClient } = await import('https://esm.sh/@supabase/supabase-js@2');
  client = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  window.addEventListener('ledgerly:data-changed', schedulePush);
  client.auth.onAuthStateChange(async (_event, session) => {
    activeUser = session?.user;
    onUser(activeUser);
    if (!activeUser) return;
    try {
      const cloudData = await pullCloudLedger();
      if (cloudData.customers.length || cloudData.transactions.length) replaceData(cloudData);
      else await pushLedger(loadData());
      onReady();
    } catch (error) {
      console.error('Cloud loading failed', error);
      window.dispatchEvent(new CustomEvent('ledgerly:cloud-status', { detail: 'error' }));
    }
  });
}
