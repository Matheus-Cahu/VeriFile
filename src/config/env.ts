// Configuração de ambiente do app, lida de variáveis EXPO_PUBLIC_* (.env).
//
// Variáveis com o prefixo EXPO_PUBLIC_ são inlinadas no bundle pelo Metro no
// momento do `expo start`/build (ver docs/v56 "Environment variables in Expo").
// Por isso são acessadas como `process.env.EXPO_PUBLIC_API_BASE_URL` direto.

/** URL base do backend (web-ssiaas). Ex.: http://100.116.96.78:3000 */
export const API_BASE_URL = (
  process.env.EXPO_PUBLIC_API_BASE_URL ?? ''
).replace(/\/+$/, ''); // remove barra(s) final(is) para concatenar caminhos com segurança
