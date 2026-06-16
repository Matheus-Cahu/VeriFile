// wallet/WalletDatabase.ts
import { open, type DB } from '@op-engineering/op-sqlite';
import * as Keychain from 'react-native-keychain';
import { getRandomBytesAsync } from 'expo-crypto'; // ou react-native-get-random-values
import { bytesToHex } from '@noble/hashes/utils.js';

const DB_NAME = 'wallet.db';
const KEYCHAIN_SERVICE = 'com.seuapp.wallet.dbkey';

// ── Senha do banco ─────────────────────────────────────────

async function getOrCreateDbPassword(): Promise<string> {
  // Tenta recuperar senha existente
  const existing = await Keychain.getGenericPassword({
    service: KEYCHAIN_SERVICE,
  });

  if (existing) return existing.password;

  // Primeira vez: gera 32 bytes aleatórios → hex → salva
  const randomBytes = await getRandomBytesAsync(32);
  const password = bytesToHex(randomBytes);

  await Keychain.setGenericPassword('wallet', password, {
    service: KEYCHAIN_SERVICE,
    accessible: Keychain.ACCESSIBLE.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
  });

  return password;
}

// ── Abertura do banco ──────────────────────────────────────

let db: DB | null = null;

export async function openWallet(): Promise<DB> {
  if (db) return db;

  const password = await getOrCreateDbPassword();

  db = open({
    name: DB_NAME,
    encryptionKey: password, // SQLCipher recebe a chave aqui
  });

  await db.execute(`
    CREATE TABLE IF NOT EXISTS keys (
      id          TEXT PRIMARY KEY,
      did         TEXT NOT NULL,
      private_key TEXT NOT NULL,  -- hex, cifrado pelo SQLCipher
      public_key  TEXT NOT NULL,
      created_at  INTEGER NOT NULL
    )
  `);

  return db;
}

// ── Operações ──────────────────────────────────────────────

export type DidSummary = {
  id: string;
  did: string;
  public_key: string;
  created_at: number;
};

export async function saveKeyPair(params: {
  id: string;
  did: string;
  privateKeyHex: string;
  publicKeyHex: string;
}): Promise<void> {
  const wallet = await openWallet();

  await wallet.execute(
    `INSERT INTO keys (id, did, private_key, public_key, created_at)
     VALUES (?, ?, ?, ?, ?)`,
    [params.id, params.did, params.privateKeyHex, params.publicKeyHex, Date.now()]
  );
}

export async function getKeyPair(id: string) {
  const wallet = await openWallet();

  const result = await wallet.execute(
    `SELECT * FROM keys WHERE id = ?`,
    [id]
  );

  return result.rows?.[0] ?? null;
}

export async function listDIDs(): Promise<DidSummary[]> {
  const wallet = await openWallet();

  const result = await wallet.execute(
    `SELECT id, did, public_key, created_at FROM keys ORDER BY created_at DESC`
  );
  // private_key intencionalmente omitido na listagem
  return (result.rows ?? []) as unknown as DidSummary[];
}
