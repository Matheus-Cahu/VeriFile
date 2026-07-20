// Persistência local da conta Google logada. Segue o mesmo padrão da carteira
// (WalletDatabase): os dados ficam no Keychain, acessíveis só com o device
// desbloqueado. Guardamos o perfil + idToken e, quando o backend responde, o
// usuário correspondente no web-ssiaas (id interno + cpf).
import * as Keychain from 'react-native-keychain';

const KEYCHAIN_SERVICE = 'com.verifile.account';

/** Usuário retornado pelo backend (web-ssiaas) após validar o idToken. */
export type BackendUser = {
  /** ID interno da plataforma (web-ssiaas), NÃO o `sub` do Google. */
  id: string;
  name: string | null;
  email: string;
  image: string | null;
  /** CPF; null até o usuário preencher no backend. */
  cpf: string | null;
};

export type GoogleAccount = {
  /** ID estável do usuário no Google (`sub`). */
  id: string;
  name: string | null;
  email: string;
  photo: string | null;
  givenName: string | null;
  familyName: string | null;
  /** JWT de identidade emitido pelo Google. Pode ser null e expira. */
  idToken: string | null;
  /**
   * Usuário correspondente no backend. null quando o backend estava
   * inacessível no login (uso local; sincroniza na próxima vez).
   */
  backend: BackendUser | null;
};

export async function saveAccount(account: GoogleAccount): Promise<void> {
  await Keychain.setGenericPassword('account', JSON.stringify(account), {
    service: KEYCHAIN_SERVICE,
    accessible: Keychain.ACCESSIBLE.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
  });
}

export async function loadAccount(): Promise<GoogleAccount | null> {
  const stored = await Keychain.getGenericPassword({ service: KEYCHAIN_SERVICE });
  if (!stored) return null;
  try {
    return JSON.parse(stored.password) as GoogleAccount;
  } catch {
    // Conteúdo corrompido: limpa para não travar o login.
    await clearAccount();
    return null;
  }
}

export async function clearAccount(): Promise<void> {
  await Keychain.resetGenericPassword({ service: KEYCHAIN_SERVICE });
}
