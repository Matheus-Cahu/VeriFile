import 'react-native-get-random-values';
import * as secp from '@noble/secp256k1';

console.log('secp carregado:', secp);
console.log('secp.etc:', secp.etc);

export function generateKeyPair() {
  console.log('gerando...');
  const privateKey = secp.utils.randomPrivateKey();
  const publicKey = secp.getPublicKey(privateKey, true);
  return {
    privateKey,
    publicKey,
    publicKeyUncompressed: secp.getPublicKey(privateKey, false),
    privateKeyHex: secp.etc.bytesToHex(privateKey),
    publicKeyHex: secp.etc.bytesToHex(publicKey),
  };
}

export function publicKeyToDIDKey(publicKey: Uint8Array): string {
  return `did:key:placeholder-${secp.etc.bytesToHex(publicKey).slice(0, 8)}`;
}
