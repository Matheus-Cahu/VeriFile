// Troca o idToken do Google por um usuário do backend (web-ssiaas).
//
// O app obtém o idToken via Google Sign-In nativo e o envia para o endpoint
// POST /api/auth/mobile/google, que valida o token e devolve o usuário da
// plataforma (mesmas tabelas do Auth.js).
import { API_BASE_URL } from '../config/env';
import type { BackendUser } from './account-store';

const ENDPOINT = '/api/auth/mobile/google';

/** Tempo máximo de espera pelo backend antes de seguir login local. */
const TIMEOUT_MS = 8000;

/**
 * Envia o idToken ao backend e retorna o usuário correspondente.
 * Lança em caso de rede indisponível, timeout ou resposta de erro — o chamador
 * decide se segue local (ver auth-context: login não trava se o backend falha).
 *
 * O timeout é essencial: o fetch do React Native não tem limite por padrão, e
 * um backend inalcançável deixaria a conexão pendurada (spinner infinito).
 */
export async function exchangeGoogleToken(idToken: string): Promise<BackendUser> {
  if (!API_BASE_URL) {
    throw new Error('EXPO_PUBLIC_API_BASE_URL não configurada (.env)');
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

  let res: Response;
  try {
    res = await fetch(`${API_BASE_URL}${ENDPOINT}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ idToken }),
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

  const data = (await res.json()) as { user?: BackendUser };
  if (!data.user) {
    throw new Error('backend não retornou "user"');
  }
  return data.user;
}
