// wallet/WalletDatabase.ts
// Carteira local cifrada (SQLCipher via op-sqlite) para guardar as identidades
// pós-quânticas geradas pelo core SSI-PQ. A senha do banco fica no Keychain.
import { open, type DB } from '@op-engineering/op-sqlite';
import * as Keychain from 'react-native-keychain';
import { getRandomBytesAsync } from 'expo-crypto'; // ou react-native-get-random-values
import { bytesToHex } from '@noble/hashes/utils.js';
import type { PqIdentity } from '../crypto/keys';

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

  // Identidades pós-quânticas: o DID Document é público; as chaves privadas
  // ML-DSA/ML-KEM ficam cifradas em repouso pelo SQLCipher.
  await db.execute(`
    CREATE TABLE IF NOT EXISTS identities (
      id                TEXT PRIMARY KEY,
      did               TEXT NOT NULL,
      fingerprint       TEXT NOT NULL,
      did_document      TEXT NOT NULL,
      mldsa_private_key TEXT NOT NULL,
      mlkem_private_key TEXT NOT NULL,
      created_at        INTEGER NOT NULL
    )
  `);

  return db;
}

// ── Operações ──────────────────────────────────────────────

export type DidSummary = {
  id: string;
  did: string;
  fingerprint: string;
  created_at: number;
};

export type StoredIdentity = DidSummary & {
  did_document: string;
  mldsa_private_key: string;
  mlkem_private_key: string;
};

export async function saveIdentity(params: {
  id: string;
  identity: PqIdentity;
}): Promise<void> {
  const wallet = await openWallet();
  const { identity } = params;

  await wallet.execute(
    `INSERT INTO identities
       (id, did, fingerprint, did_document, mldsa_private_key, mlkem_private_key, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [
      params.id,
      identity.did,
      identity.fingerprint,
      identity.didDocument,
      identity.privateKeys.mldsaPrivateKey,
      identity.privateKeys.mlkemPrivateKey,
      Date.now(),
    ]
  );
}

export async function getIdentity(id: string): Promise<StoredIdentity | null> {
  const wallet = await openWallet();

  const result = await wallet.execute(`SELECT * FROM identities WHERE id = ?`, [
    id,
  ]);

  return (result.rows?.[0] as unknown as StoredIdentity) ?? null;
}

export async function listDIDs(): Promise<DidSummary[]> {
  const wallet = await openWallet();

  const result = await wallet.execute(
    `SELECT id, did, fingerprint, created_at FROM identities ORDER BY created_at DESC`
  );
  // chaves privadas intencionalmente omitidas na listagem
  return (result.rows ?? []) as unknown as DidSummary[];
}
