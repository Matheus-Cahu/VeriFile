// Contexto de autenticação do VeriFile. Login com Google Sign-In nativo:
// autentica no device, troca o idToken pelo usuário do backend (web-ssiaas),
// guarda o perfil no Keychain (account-store) e expõe o estado para o resto do
// app. Se o backend estiver inacessível, o login segue local (sem travar).
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from 'react';
import {
  GoogleSignin,
  isErrorWithCode,
  isSuccessResponse,
  statusCodes,
} from '@react-native-google-signin/google-signin';

import { configureGoogleSignin } from './google-config';
import { exchangeGoogleToken } from './backend';
import {
  clearAccount,
  loadAccount,
  saveAccount,
  type GoogleAccount,
} from './account-store';

type AuthContextValue = {
  /** Conta logada, ou null se ninguém está autenticado. */
  user: GoogleAccount | null;
  /** True enquanto carregamos a sessão persistida no boot. */
  initializing: boolean;
  /** True durante o fluxo interativo de login. */
  signingIn: boolean;
  signIn: () => Promise<void>;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<GoogleAccount | null>(null);
  const [initializing, setInitializing] = useState(true);
  const [signingIn, setSigningIn] = useState(false);

  // Boot: configura o SDK e restaura a conta salva no Keychain.
  useEffect(() => {
    configureGoogleSignin();
    loadAccount()
      .then(setUser)
      .catch(() => setUser(null))
      .finally(() => setInitializing(false));
  }, []);

  const signIn = useCallback(async () => {
    setSigningIn(true);
    try {
      await GoogleSignin.hasPlayServices({ showPlayServicesUpdateDialog: true });
      const response = await GoogleSignin.signIn();

      // Usuário cancelou o seletor de contas.
      if (!isSuccessResponse(response)) return;

      const { user: profile, idToken } = response.data;
      const account: GoogleAccount = {
        id: profile.id,
        name: profile.name,
        email: profile.email,
        photo: profile.photo,
        givenName: profile.givenName,
        familyName: profile.familyName,
        idToken,
        backend: null,
      };

      // Troca o idToken pelo usuário do backend. Se falhar (rede/servidor
      // fora), o login segue local — o backend sincroniza no próximo login.
      if (idToken) {
        try {
          account.backend = await exchangeGoogleToken(idToken);
        } catch (err) {
          console.warn('[auth] backend indisponível, seguindo login local:', err);
        }
      }

      await saveAccount(account);
      setUser(account);
    } catch (error) {
      // Cancelamentos não são erros de fato; ignoramos silenciosamente.
      if (
        isErrorWithCode(error) &&
        (error.code === statusCodes.SIGN_IN_CANCELLED ||
          error.code === statusCodes.IN_PROGRESS)
      ) {
        return;
      }
      throw error;
    } finally {
      setSigningIn(false);
    }
  }, []);

  const signOut = useCallback(async () => {
    try {
      await GoogleSignin.signOut();
    } catch {
      // Mesmo que o SDK falhe, limpamos o estado local.
    }
    await clearAccount();
    setUser(null);
  }, []);

  return (
    <AuthContext.Provider value={{ user, initializing, signingIn, signIn, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error('useAuth deve ser usado dentro de <AuthProvider>');
  }
  return ctx;
}
