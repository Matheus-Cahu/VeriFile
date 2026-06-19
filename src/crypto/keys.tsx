// Identidade pós-quântica (DID did:ssipq) via core Rust SSI-PQ exposto pelo
// React Native (react-native-ssi-pq / uniffi). Substitui o antigo stub baseado
// em secp256k1: agora usamos ML-DSA (assinatura) e ML-KEM (encapsulamento).
import {
  base64urlEncode,
  createDid,
  createSchemaFromAttributes,
  didVerify,
  embedSignedCredentialInPdf,
  extractCredentialManifestFromPdf,
  issueCredentialFromSchema,
  mldsaSign,
  mldsaVerify,
  signedCredentialToPdf,
  verifySignedCredential,
  verifySignedCredentialPdf,
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

// Converte bytes (ArrayBuffer) em base64 padrão, reaproveitando o
// base64urlEncode do core e ajustando para o alfabeto/padding padrão.
function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const b64url = base64urlEncode(buffer);
  const b64 = b64url.replace(/-/g, '+').replace(/_/g, '/');
  const padding = (4 - (b64.length % 4)) % 4;
  return b64 + '='.repeat(padding);
}

/**
 * Gera o PDF **verificável** de uma credencial assinada (base64 padrão).
 *
 * Faz `signedCredentialToPdf` (PDF visual) e em seguida
 * `embedSignedCredentialInPdf`, que embute o manifesto SSI e assina o vínculo
 * PDF↔credencial com a chave ML-DSA do emissor. É este PDF que passa em
 * `verifyCredentialPdf`.
 */
export function credentialToPdfBase64(
  signedCredential: string,
  issuerDidDocument: string,
  issuerMldsaPrivateKey: string,
  labels?: Record<string, string>
): string {
  const options = labels ? JSON.stringify({ labels }) : undefined;
  const pdfBase = signedCredentialToPdf(signedCredential, options);
  const finalPdf = embedSignedCredentialInPdf(
    pdfBase,
    signedCredential,
    issuerDidDocument,
    issuerMldsaPrivateKey,
    undefined
  );
  return arrayBufferToBase64(finalPdf);
}

export interface PdfVerification {
  /** Todas as verificações obrigatórias passaram. */
  valid: boolean;
  /** Estado resumido (ex.: "valid", "invalid"). */
  status: string;
  /** DID do emissor extraído do manifesto. */
  issuerDid?: string;
  credentialId?: string;
  credentialSignatureValid: boolean;
  documentBindingSignatureValid: boolean;
  pdfBaseHashValid: boolean;
  didKeyMatch: boolean;
  errors: string[];
  /** Diagnóstico completo (JSON formatado). */
  raw: string;
}

/**
 * Extrai o DID do emissor do manifesto SSI embutido no PDF, ou `null` se o PDF
 * não contiver manifesto (ex.: PDF que não é credencial).
 */
export function extractIssuerDidFromPdf(pdfBytes: ArrayBuffer): string | null {
  try {
    const manifest = JSON.parse(extractCredentialManifestFromPdf(pdfBytes));
    return (
      manifest?.document_binding?.issuer_did ??
      manifest?.signed_credential?.credential?.issuer_did ??
      null
    );
  } catch {
    return null;
  }
}

/** Verifica criptograficamente um PDF-credencial contra o DID Document do emissor. */
export function verifyCredentialPdf(
  pdfBytes: ArrayBuffer,
  issuerDidDocument: string
): PdfVerification {
  const r = JSON.parse(verifySignedCredentialPdf(pdfBytes, issuerDidDocument));
  return {
    valid: !!r.valid,
    status: r.status,
    issuerDid: r.issuer_did ?? undefined,
    credentialId: r.credential_id ?? undefined,
    credentialSignatureValid: !!r.credential_signature_valid,
    documentBindingSignatureValid: !!r.document_binding_signature_valid,
    pdfBaseHashValid: !!r.pdf_base_hash_valid,
    didKeyMatch: !!r.did_key_match,
    errors: r.errors ?? [],
    raw: JSON.stringify(r, null, 2),
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
