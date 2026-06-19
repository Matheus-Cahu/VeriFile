// Identidade pós-quântica (DID did:ssipq) via core Rust SSI-PQ exposto pelo
// React Native (react-native-ssi-pq / uniffi). Substitui o antigo stub baseado
// em secp256k1: agora usamos ML-DSA (assinatura) e ML-KEM (encapsulamento).
import {
  createDid,
  createSchemaFromAttributes,
  didVerify,
  issueCredentialFromSchema,
  mldsaSign,
  mldsaVerify,
  verifySignedCredential,
} from 'react-native-ssi-pq';

export const DEFAULT_MLDSA_PROFILE = 'ML-DSA-65';
export const DEFAULT_MLKEM_PROFILE = 'ML-KEM-768';

export interface PqPrivateKeys {
  mldsaPrivateKey: string;
  mlkemPrivateKey: string;
}

export interface PqIdentity {
  /** DID no formato `did:ssipq:z...`. */
  did: string;
  /** Fingerprint multibase/base58btc das chaves públicas. */
  fingerprint: string;
  /** DID Document público assinado (JSON). */
  didDocument: string;
  /** Chaves privadas ML-DSA e ML-KEM em base64url. */
  privateKeys: PqPrivateKeys;
}

/**
 * Gera uma identidade pós-quântica completa. A geração roda no Rust; aqui só
 * normalizamos o resultado (as chaves privadas vêm como JSON string).
 */
export function createPqIdentity(options?: {
  mldsa?: string;
  mlkem?: string;
}): PqIdentity {
  const result = createDid({
    mldsa: options?.mldsa ?? DEFAULT_MLDSA_PROFILE,
    mlkem: options?.mlkem ?? DEFAULT_MLKEM_PROFILE,
  });

  return {
    did: result.did,
    fingerprint: result.fingerprint,
    didDocument: result.didDocument,
    privateKeys: JSON.parse(result.privateKeys) as PqPrivateKeys,
  };
}

/** Verifica a auto-assinatura e a coerência de fingerprint de um DID Document. */
export function verifyDidDocument(didDocumentJson: string): boolean {
  return didVerify(didDocumentJson);
}

/** Assina uma mensagem com a chave ML-DSA da identidade. */
export function signMessage(
  mldsaPrivateKey: string,
  message: Uint8Array,
  context: string,
  profile: string = DEFAULT_MLDSA_PROFILE
): string {
  return mldsaSign(profile, mldsaPrivateKey, toArrayBuffer(message), context);
}

export interface IssuedCredential {
  /** Credencial assinada (JSON, com provas Merkle e assinatura ML-DSA). */
  signedCredential: string;
  /** Resultado da verificação criptográfica logo após a emissão. */
  verified: boolean;
}

/**
 * Emite uma Credencial Verificável assinada pelo emissor.
 *
 * Infere o Schema a partir dos atributos, emite a credencial revelando todos os
 * atributos (visiblePaths default) e a verifica em seguida como sanidade.
 */
export function issueCredential(
  issuerDidDocument: string,
  issuerMldsaPrivateKey: string,
  attributes: Record<string, unknown>
): IssuedCredential {
  const attributesJson = JSON.stringify(attributes);
  const schema = createSchemaFromAttributes(attributesJson, undefined);
  const signedCredential = issueCredentialFromSchema(
    schema,
    attributesJson,
    issuerDidDocument,
    issuerMldsaPrivateKey,
    undefined
  );
  const verified = verifySignedCredential(signedCredential, issuerDidDocument);
  return { signedCredential, verified };
}

/** Verifica uma assinatura ML-DSA contra a chave pública correspondente. */
export function verifySignature(
  mldsaPublicKey: string,
  message: Uint8Array,
  context: string,
  signature: string,
  profile: string = DEFAULT_MLDSA_PROFILE
): boolean {
  return mldsaVerify(
    profile,
    mldsaPublicKey,
    toArrayBuffer(message),
    context,
    signature
  );
}

// A fronteira JSI espera um ArrayBuffer puro (sem offset/visão parcial).
function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  if (bytes.byteOffset === 0 && bytes.byteLength === bytes.buffer.byteLength) {
    return bytes.buffer as ArrayBuffer;
  }
  return bytes.slice().buffer;
}
