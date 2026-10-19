// Pareamento do DID da carteira com a conta na plataforma (web-ssiaas).
//
// Fluxo: a tela /settings da plataforma cria um desafio de curta duração e o
// exibe como QR Code (JSON com pairingId, nonce, expiresAt, userId, email e
// endpoint). O app lê esse JSON, assina {pairingId, nonce, expiresAt, did} com
// a chave ML-DSA do DID e envia DID Document + chaves públicas + prova para
// POST /api/v1/did-pairings/:pairingId/complete. A plataforma valida a prova e
// associa o DID à conta. Ver vertex/web-ssiaas/PAREAMENTO_DID_RECOMENDACOES.md.
import * as Keychain from 'react-native-keychain';

import { API_BASE_URL } from '../config/env';
import { getDidPublicKey, signPairingChallenge } from '../crypto/keys';
import type { StoredIdentity } from '../wallet/WalletDatabase';

const KEYCHAIN_SERVICE = 'com.verifile.pairing';

/** Tempo máximo de espera pelo backend (o fetch do RN não tem limite). */
const TIMEOUT_MS = 8000;

/** Conteúdo do QR Code exibido pela plataforma. */
export type PairingChallenge = {
  pairingId: string;
  nonce: string;
  /** ISO 8601 UTC, exatamente como a plataforma serializou (entra na assinatura). */
  expiresAt: string;
  userId?: string;
  email?: string;
  /** Endpoint de conclusão informado pela web (pode ser localhost do PC). */
  endpoint?: string;
};

/** Pareamento concluído, guardado localmente. */
export type PairingRecord = {
  did: string;
  /** Id da identidade na carteira local (WalletDatabase). */
  identityId: string;
  /** Conta Google que fez o pareamento. */
  email: string;
  pairedAt: string;
  /** Token M2M devolvido pela plataforma para o assinador (null se não configurado). */
  bearerToken: string | null;
};

/**
 * Lê o texto do QR Code (ou colado) e valida o formato do desafio. Lança com
 * mensagem amigável se não for um desafio de pareamento ou se já expirou.
 */
export function parsePairingPayload(raw: string): PairingChallenge {
  let data: unknown;
  try {
    data = JSON.parse(raw.trim());
  } catch {
    throw new Error('O código lido não é um desafio de pareamento da plataforma.');
  }

  const d = data as Record<string, unknown>;
  if (
    typeof d.pairingId !== 'string' ||
    typeof d.nonce !== 'string' ||
    typeof d.expiresAt !== 'string'
  ) {
    throw new Error('Desafio incompleto: faltam pairingId, nonce ou expiresAt.');
  }

  const expires = new Date(d.expiresAt).getTime();
  if (Number.isNaN(expires)) {
    throw new Error('Data de expiração do desafio inválida.');
  }
  if (expires <= Date.now()) {
    throw new Error('Este desafio expirou. Gere um novo QR Code na plataforma.');
  }

  return {
    pairingId: d.pairingId,
    nonce: d.nonce,
    expiresAt: d.expiresAt,
    userId: typeof d.userId === 'string' ? d.userId : undefined,
    email: typeof d.email === 'string' ? d.email : undefined,
    endpoint: typeof d.endpoint === 'string' ? d.endpoint : undefined,
  };
}

/**
 * URL de conclusão. Preferimos o backend configurado no app: o `endpoint` do
 * QR usa a origem do navegador, que costuma ser `localhost` do PC (inacessível
 * pelo celular). Ele só é usado quando o app não tem backend configurado.
 */
function completeUrl(challenge: PairingChallenge): string {
  if (API_BASE_URL) {
    return `${API_BASE_URL}/api/v1/did-pairings/${encodeURIComponent(challenge.pairingId)}/complete`;
  }
  if (challenge.endpoint) return challenge.endpoint;
  throw new Error('EXPO_PUBLIC_API_BASE_URL não configurada (.env)');
}

/**
 * Assina o desafio com o DID da carteira e conclui o pareamento na plataforma.
 * `account` identifica a conta Google logada no app; o backend autentica pelo
 * `idToken` e exige que seja a dona do desafio.
 */
export async function completePairing(params: {
  challenge: PairingChallenge;
  identity: StoredIdentity;
  account: { email: string; idToken: string | null; backendUserId?: string };
}): Promise<PairingRecord> {
  const { challenge, identity, account } = params;

  if (challenge.email && challenge.email.toLowerCase() !== account.email.toLowerCase()) {
    throw new Error(
      `Este QR Code é da conta ${challenge.email}. Entre no app com a mesma conta Google.`
    );
  }

  if (!account.idToken) {
    throw new Error('Sessão sem idToken do Google — faça login novamente.');
  }

  const mldsa = getDidPublicKey(identity.did_document, 'ML-DSA');
  const mlkem = getDidPublicKey(identity.did_document, 'ML-KEM');
  if (!mldsa) throw new Error('O DID Document não tem chave ML-DSA.');

  const proofValue = await signPairingChallenge(
    {
      pairingId: challenge.pairingId,
      nonce: challenge.nonce,
      expiresAt: challenge.expiresAt,
      did: identity.did,
    },
    mldsa.type,
    identity.mldsa_private_key
  );

  const body = {
    pairingId: challenge.pairingId,
    nonce: challenge.nonce,
    expiresAt: challenge.expiresAt,
    userId: account.backendUserId ?? challenge.userId,
    email: account.email,
    did: identity.did,
    didDocument: JSON.parse(identity.did_document),
    mlDsaPublicKey: mldsa.publicKeyMultibase,
    mlKemPublicKey: mlkem?.publicKeyMultibase,
    proof: {
      type: mldsa.type,
      created: new Date().toISOString(),
      verificationMethod: `${identity.did}#mldsa-1`,
      proofValue,
    },
  };

  const url = completeUrl(challenge);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

  let res: Response;
  try {
    res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${account.idToken}`,
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
  } catch (err) {
    if (controller.signal.aborted) {
      throw new Error(`backend não respondeu em ${TIMEOUT_MS}ms (${url})`);
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }

  const data = (await res.json().catch(() => ({}))) as {
    paired?: boolean;
    did?: string;
    pairedAt?: string;
    bearerToken?: string | null;
    error?: string;
    details?: string;
  };

  if (!res.ok || !data.paired) {
    const reason = [data.error, data.details].filter(Boolean).join(' — ');
    throw new Error(`Plataforma recusou o pareamento (${res.status})${reason ? `: ${reason}` : ''}`);
  }

  const record: PairingRecord = {
    did: data.did ?? identity.did,
    identityId: identity.id,
    email: account.email,
    pairedAt: data.pairedAt ?? new Date().toISOString(),
    bearerToken: data.bearerToken ?? null,
  };
  await savePairing(record);
  return record;
}

// ── Persistência (Keychain) ────────────────────────────────

async function savePairing(record: PairingRecord): Promise<void> {
  await Keychain.setGenericPassword('pairing', JSON.stringify(record), {
    service: KEYCHAIN_SERVICE,
    accessible: Keychain.ACCESSIBLE.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
  });
}

/** Pareamento salvo para a conta `email`, ou null (outra conta ou nenhum). */
export async function loadPairing(email: string): Promise<PairingRecord | null> {
  const stored = await Keychain.getGenericPassword({ service: KEYCHAIN_SERVICE });
  if (!stored) return null;
  try {
    const record = JSON.parse(stored.password) as PairingRecord;
    return record.email.toLowerCase() === email.toLowerCase() ? record : null;
  } catch {
    await Keychain.resetGenericPassword({ service: KEYCHAIN_SERVICE });
    return null;
  }
}
