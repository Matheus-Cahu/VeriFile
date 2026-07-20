// Cliente da rota de credenciais pendentes do backend (web-ssiaas).
//
// O app busca as VCs com status PENDING em que o usuário logado é o HOLDER —
// ofertas emitidas por um issuer aguardando o aceite/assinatura do holder. A
// autenticação é a mesma do login mobile: mandamos o idToken do Google em
// `Authorization: Bearer <idToken>` (ver src/auth/backend.ts e, no backend,
// lib/mobile-auth.ts).
import { API_BASE_URL } from '../config/env';

const ENDPOINT = '/api/mobile/credenciais/pendentes';

/** Tempo máximo de espera pelo backend antes de desistir (fetch do RN não tem). */
const TIMEOUT_MS = 8000;

/** Issuer que emitiu a oferta (resumo devolvido pela rota). */
export type CredentialIssuer = {
  id: string;
  name: string | null;
  email: string | null;
  image: string | null;
};

/** Schema da credencial (resumo devolvido pela rota). */
export type CredentialSchema = {
  id: string;
  name: string;
  version: string;
};

/**
 * Uma credencial pendente devolvida pela rota. `vcPayload` é o JSON W3C da
 * oferta (com @context, type, credentialSubject, etc.); mantemos como `unknown`
 * e extraímos os campos na hora de exibir/assinar.
 */
export type PendingCredential = {
  id: string;
  vcPayload: unknown;
  status: string;
  issuedAt: string;
  expiresAt: string | null;
  issuer: CredentialIssuer;
  schema: CredentialSchema;
};

/**
 * Busca as credenciais pendentes do holder logado.
 *
 * `idToken` é o JWT do Google guardado na conta (ver account-store). Lança em
 * rede indisponível, timeout ou resposta de erro — a tela decide como reagir.
 */
export async function fetchPendingCredentials(
  idToken: string
): Promise<PendingCredential[]> {
  if (!API_BASE_URL) {
    throw new Error('EXPO_PUBLIC_API_BASE_URL não configurada (.env)');
  }
  if (!idToken) {
    throw new Error('sessão sem idToken do Google — faça login novamente');
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

  let res: Response;
  try {
    res = await fetch(`${API_BASE_URL}${ENDPOINT}`, {
      method: 'GET',
      headers: { Authorization: `Bearer ${idToken}` },
      signal: controller.signal,
    });
  } catch (err) {
    if (controller.signal.aborted) {
      throw new Error(`backend não respondeu em ${TIMEOUT_MS}ms (${API_BASE_URL})`);
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }

  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    throw new Error(`backend respondeu ${res.status}: ${detail}`);
  }

  const data = (await res.json()) as { credentials?: PendingCredential[] };
  return data.credentials ?? [];
}

/**
 * Extrai os atributos assináveis do `vcPayload` (o `credentialSubject`, sem o
 * campo `id`). É esse conjunto que a carteira assina localmente com o DID do
 * holder. Se o payload não seguir o formato esperado, devolve {}.
 */
export function extractCredentialAttributes(
  vcPayload: unknown
): Record<string, unknown> {
  if (!vcPayload || typeof vcPayload !== 'object') return {};
  const subject = (vcPayload as Record<string, unknown>).credentialSubject;
  if (!subject || typeof subject !== 'object') return {};

  const { id: _omitId, ...attributes } = subject as Record<string, unknown>;
  return attributes;
}
