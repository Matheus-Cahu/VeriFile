// Configuração do Google Sign-In nativo (@react-native-google-signin).
//
// Os Client IDs vêm do app.json (`expo.extra`), preenchidos no Google Cloud
// Console > APIs & Services > Credentials:
//   - googleWebClientId: OAuth Client ID do tipo "Web application". É ele que
//     o Android usa (via Credential Manager) e o que gera o `idToken`.
//   - googleIosClientId: OAuth Client ID do tipo "iOS" (opcional; só no iOS).
//
// O `iosUrlScheme` (reversed client ID) é configurado no plugin em app.json.
import Constants from 'expo-constants';
import { GoogleSignin } from '@react-native-google-signin/google-signin';

const extra = (Constants.expoConfig?.extra ?? {}) as {
  googleWebClientId?: string;
  googleIosClientId?: string;
};

export const GOOGLE_WEB_CLIENT_ID = extra.googleWebClientId;
export const GOOGLE_IOS_CLIENT_ID = extra.googleIosClientId;

let configured = false;

export function configureGoogleSignin(): void {
  if (configured) return;
  GoogleSignin.configure({
    webClientId: GOOGLE_WEB_CLIENT_ID,
    iosClientId: GOOGLE_IOS_CLIENT_ID,
    scopes: ['profile', 'email'],
    // Não precisamos de acesso offline (serverAuthCode) por enquanto.
    offlineAccess: false,
  });
  configured = true;
}
