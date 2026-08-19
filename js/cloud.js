import { SUPABASE_ANON_KEY, SUPABASE_URL } from './supabase-config.js';
import { loadData, replaceData } from './storage.js';

let client;
let activeUser;
let syncing = false;
let syncTimer;
let handlers = { onUser: () => {}, onReady: () => {} };

/** Some browsers (private mode, embedded web views) block storage access.
 *  A crash-proof wrapper keeps the app working there; worst case the session
 *  lasts for the tab instead of the device. */
const safeStorage = {
  getItem(key) { try { return window.localStorage.getItem(key); } catch (_) { return null; } },
  setItem(key, value) { try { window.localStorage.setItem(key, value); } catch (_) {} },
  removeItem(key) { try { window.localStorage.removeItem(key); } catch (_) {} }
};

function ensureClient() {
  if (!client) throw new Error('Sign-in is unavailable right now — the cloud service could not be reached. Your records are still safe on this device.');
}

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
  syncTimer = setTimeout(() => { syncTimer = null; pushLedger(event.detail); }, 650);
}

/** Send anything still waiting in the debounce right away — used when the
 *  page is being closed or refreshed so no entry is left unsynced. */
export function flushPendingSync() {
  if (!syncTimer || !activeUser) return;
  clearTimeout(syncTimer);
  syncTimer = null;
  pushLedger(loadData());
}

async function hydrateFromCloud() {
  try {
    const cloudData = await pullCloudLedger();
    if (cloudData.customers.length || cloudData.transactions.length) replaceData(cloudData);
    else await pushLedger(loadData());
    handlers.onReady();
  } catch (error) {
    console.error('Cloud loading failed', error);
    window.dispatchEvent(new CustomEvent('ledgerly:cloud-status', { detail: 'error' }));
  }
}

export async function signInWithEmail(email, password) {
  ensureClient();
  const { error } = await client.auth.signInWithPassword({ email, password });
  if (error) throw error;
}

export async function signUpWithEmail(email, password) {
  ensureClient();
  const { data, error } = await client.auth.signUp({ email, password });
  if (error) throw error;
  return data;
}

export async function signOut() {
  if (!client) return;
  try {
    await client.auth.signOut();
  } catch (error) {
    // Offline or Supabase unreachable: supabase-js has usually cleared this
    // device's session already, so make sure the UI follows suit instead of
    // leaving the user stuck "signed in".
    console.warn('Sign out call failed; continuing locally', error);
    activeUser = null;
    handlers.onUser(null);
  }
}

export async function initCloud({ onUser, onReady }) {
  handlers = { onUser: onUser || (() => {}), onReady: onReady || (() => {}) };
  try {
    const { createClient } = await import('https://esm.sh/@supabase/supabase-js@2');
    client = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: {
        // Persist the session on this device and refresh it automatically:
        // a page refresh (or closing and reopening the installed app) must
        // never sign you out.
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
        storage: safeStorage
      }
    });
  } catch (error) {
    console.error('Could not load the cloud module', error);
    window.dispatchEvent(new CustomEvent('ledgerly:cloud-status', { detail: 'offline' }));
    return;
  }
  window.addEventListener('ledgerly:data-changed', schedulePush);
  // A refresh right after typing should not lose the newest entries.
  window.addEventListener('pagehide', flushPendingSync);
  client.auth.onAuthStateChange((event, session) => {
    const user = session?.user ?? null;
    const isNewUser = user?.id !== activeUser?.id;
    activeUser = user;
    handlers.onUser(user);
    if (!user) return;
    // On every refresh INITIAL_SESSION (and often TOKEN_REFRESHED) fire for
    // the same signed-in user; hydrate once per real sign-in, not per event.
    if (!isNewUser && event !== 'SIGNED_IN') return;
    // Running database queries directly inside this callback can deadlock
    // supabase-js (the auth lock is still held), so defer to the next tick.
    setTimeout(hydrateFromCloud, 0);
  });
}
