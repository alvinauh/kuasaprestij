// offlineAccounts.ts — student accounts created on this device with no internet.
//
// A student can sign up offline and practise straight away under a temporary id
// ("offline-<uuid>"). Their answers queue under that id. When the device is online
// they finish sign-up with Supabase; once the account is confirmed and signed in,
// the queued answers are moved to the real user id and sync as normal. Nothing
// reaches the server under a temporary id.
//
// Only a salted PBKDF2 hash of the password is stored (to unlock the account on this
// device); the student types the password again to create the real account.

import { kvGet, kvSet, reassignSyncItems } from "./offlineDb";

export type OfflineAccountStatus =
  | "local"                  // created offline, sign-up not sent yet
  | "awaiting_confirmation"  // sign-up sent; Supabase is waiting for the email link
  | "email_exists";          // that email already has an account: sign in to merge

export interface OfflineAccount {
  id: string;                // temporary student id used in the answer queue
  email: string;             // lower-cased
  full_name: string;
  school: string | null;
  grade: string | null;
  password_salt: string;     // base64
  password_hash: string;     // base64, PBKDF2-SHA256
  consent_at: string;        // ISO time the student accepted the terms
  created_at: string;
  status: OfflineAccountStatus;
  real_user_id?: string;     // Supabase user id once sign-up was sent
}

const ACCOUNTS_KEY = "offline_accounts";
const ACTIVE_KEY = "kp_offline_active_account";  // localStorage: read synchronously at start-up
export const OFFLINE_ID_PREFIX = "offline-";

export function isOfflineId(id: string | null | undefined): boolean {
  return !!id && id.startsWith(OFFLINE_ID_PREFIX);
}

// ── password hashing (WebCrypto, no dependency) ─────────────────────────────
const ITERATIONS = 150_000;

const b64 = (buf: ArrayBuffer | Uint8Array) =>
  btoa(String.fromCharCode(...new Uint8Array(buf instanceof Uint8Array ? buf : new Uint8Array(buf))));
const unb64 = (s: string) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));

async function hashPassword(password: string, salt: Uint8Array): Promise<string> {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(password), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", hash: "SHA-256", salt: salt as BufferSource, iterations: ITERATIONS }, key, 256);
  return b64(bits);
}

export async function checkPassword(acc: OfflineAccount, password: string): Promise<boolean> {
  return (await hashPassword(password, unb64(acc.password_salt))) === acc.password_hash;
}

// ── store ───────────────────────────────────────────────────────────────────
export async function listOfflineAccounts(): Promise<OfflineAccount[]> {
  if (typeof indexedDB === "undefined") return [];
  try {
    return (await kvGet<OfflineAccount[]>(ACCOUNTS_KEY)) ?? [];
  } catch {
    return [];
  }
}

async function save(accounts: OfflineAccount[]) {
  await kvSet(ACCOUNTS_KEY, accounts);
}

export async function updateOfflineAccount(id: string, patch: Partial<OfflineAccount>): Promise<OfflineAccount | null> {
  const all = await listOfflineAccounts();
  const i = all.findIndex((a) => a.id === id);
  if (i < 0) return null;
  all[i] = { ...all[i], ...patch };
  await save(all);
  return all[i];
}

export async function findByEmail(email: string): Promise<OfflineAccount | null> {
  const e = email.trim().toLowerCase();
  return (await listOfflineAccounts()).find((a) => a.email === e) ?? null;
}

export async function createOfflineAccount(p: {
  email: string; password: string; full_name: string; school?: string; grade?: string;
}): Promise<OfflineAccount> {
  const email = p.email.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error("Please enter a valid email.");
  if (p.password.length < 6) throw new Error("Password must be at least 6 characters.");
  if (await findByEmail(email)) throw new Error("An offline account with this email already exists on this device. Sign in instead.");
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const acc: OfflineAccount = {
    id: `${OFFLINE_ID_PREFIX}${crypto.randomUUID()}`,
    email,
    full_name: p.full_name.trim(),
    school: p.school?.trim() || null,
    grade: p.grade?.trim() || null,
    password_salt: b64(salt),
    password_hash: await hashPassword(p.password, salt),
    consent_at: new Date().toISOString(),
    created_at: new Date().toISOString(),
    status: "local",
  };
  await save([...(await listOfflineAccounts()), acc]);
  return acc;
}

/** Unlock an offline account on this device. Returns null if email/password don't match. */
export async function unlockOfflineAccount(email: string, password: string): Promise<OfflineAccount | null> {
  const acc = await findByEmail(email);
  return acc && (await checkPassword(acc, password)) ? acc : null;
}

// ── which offline account is signed in on this device ───────────────────────
export function activeOfflineAccountId(): string | null {
  try { return localStorage.getItem(ACTIVE_KEY); } catch { return null; }
}

export function setActiveOfflineAccount(id: string | null) {
  try {
    if (id) localStorage.setItem(ACTIVE_KEY, id);
    else localStorage.removeItem(ACTIVE_KEY);
  } catch { /* storage blocked */ }
}

/**
 * The student is now signed in to Supabase as `realUserId` with this email: move the
 * offline account's queued answers to the real id and forget the offline account.
 * Returns how many queued answers moved.
 */
export async function adoptOfflineAccount(acc: OfflineAccount, realUserId: string): Promise<number> {
  const moved = await reassignSyncItems(acc.id, realUserId);
  await save((await listOfflineAccounts()).filter((a) => a.id !== acc.id));
  if (activeOfflineAccountId() === acc.id) setActiveOfflineAccount(null);
  return moved;
}
