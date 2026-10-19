// Identidade pós-quântica (DID did:ssipq) via core Rust SSI-PQ exposto pelo
// React Native (react-native-ssi-pq / @ssi-pq/react-native). Usa ML-DSA
// (assinatura) e ML-KEM (encapsulamento).
//
// A API nativa é assíncrona (TurboModule): todas as funções abaixo são async.
// Bytes de PDF cruzam a ponte como base64 padrão.
import {
  canonicalJson,
  createDidRaw,
  createSchemaFromAttributes,
  embedSignedCredentialInPdfBytes,
  extractCredentialManifestFromPdf,
  issueCredentialFromSchemaRaw,
  mldsaSign,
  signedCredentialToPdf,
  verifyDidDocument as verifyDidDocumentNative,
  verifySignedCredential,
  verifySignedCredentialPdfBytes,
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
  /** DID Document público assinado (JSON serializado). */
  didDocument: string;
  /** Chaves privadas ML-DSA e ML-KEM em base64url. */
  privateKeys: PqPrivateKeys;
}

/**
 * Gera uma identidade pós-quântica completa. A geração roda no Rust; aqui só
 * normalizamos o resultado. `createdAt` é obrigatório na API nova.
 */
export async function createPqIdentity(options?: {
  mldsa?: string;
  mlkem?: string;
}): Promise<PqIdentity> {
  const result = (await createDidRaw({
    mldsa: options?.mldsa ?? DEFAULT_MLDSA_PROFILE,
    mlkem: options?.mlkem ?? DEFAULT_MLKEM_PROFILE,
    createdAt: new Date().toISOString(),
  } as any)) as any;

  return {
    did: String(result.did),
    fingerprint: String(result.fingerprint),
    // Na API nova o didDocument volta como objeto: serializamos para armazenar
    // e para repassar às funções nativas (que esperam JSON textual).
    didDocument:
      typeof result.didDocument === 'string'
        ? result.didDocument
        : JSON.stringify(result.didDocument),
    privateKeys: result.privateKeys as PqPrivateKeys,
  };
}

// Converte bytes (ArrayBuffer) em base64 padrão (com padding), formato aceito
// pela ponte nativa (Base64.NO_WRAP no Kotlin).
const B64_CHARS =
  'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let result = '';
  let i = 0;
  for (; i + 2 < bytes.length; i += 3) {
    const n = (bytes[i] << 16) | (bytes[i + 1] << 8) | bytes[i + 2];
    result +=
      B64_CHARS[(n >> 18) & 63] +
      B64_CHARS[(n >> 12) & 63] +
      B64_CHARS[(n >> 6) & 63] +
      B64_CHARS[n & 63];
  }
  const rem = bytes.length - i;
  if (rem === 1) {
    const n = bytes[i] << 16;
    result += B64_CHARS[(n >> 18) & 63] + B64_CHARS[(n >> 12) & 63] + '==';
  } else if (rem === 2) {
    const n = (bytes[i] << 16) | (bytes[i + 1] << 8);
    result +=
      B64_CHARS[(n >> 18) & 63] +
      B64_CHARS[(n >> 12) & 63] +
      B64_CHARS[(n >> 6) & 63] +
      '=';
  }
  return result;
}

/**
 * Gera o PDF **verificável** de uma credencial assinada (base64 padrão).
 *
 * Renderiza o PDF visual (`signedCredentialToPdf`) e em seguida embute o
 * manifesto SSI assinando o vínculo PDF↔credencial com a chave ML-DSA do
 * emissor (`embedSignedCredentialInPdfBytes`). É este PDF que passa em
 * `verifyCredentialPdf`.
 */
export async function credentialToPdfBase64(
  signedCredential: string,
  issuerDidDocument: string,
  issuerMldsaPrivateKey: string,
  labels?: Record<string, string>
): Promise<string> {
  const options = labels ? JSON.stringify({ labels }) : undefined;
  const pdfBaseBase64 = await signedCredentialToPdf(signedCredential, options);
  // O embed (binding PDF↔credencial) exige `createdAt` (ISO) nas options —
  // senão o core rejeita com "invalid PDF: createdAt is required".
  const finalPdfBase64 = await embedSignedCredentialInPdfBytes(
    pdfBaseBase64,
    signedCredential,
    issuerDidDocument,
    issuerMldsaPrivateKey,
    { createdAt: new Date().toISOString() } as any
  );
  return finalPdfBase64;
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
  /** Lote de emissão, se a credencial foi assinada em lote. */
  batch: BatchRef | null;
  /** Diagnóstico completo (JSON formatado). */
  raw: string;
}

/**
 * Extrai o DID do emissor do manifesto SSI embutido no PDF, ou `null` se o PDF
 * não contiver manifesto (ex.: PDF que não é credencial).
 */
export async function extractIssuerDidFromPdf(
  pdfBytes: ArrayBuffer
): Promise<string | null> {
  try {
    const manifest = (await extractCredentialManifestFromPdf(
      arrayBufferToBase64(pdfBytes)
    )) as any;
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
export async function verifyCredentialPdf(
  pdfBytes: ArrayBuffer,
  issuerDidDocument: string
): Promise<PdfVerification> {
  const pdfBase64 = arrayBufferToBase64(pdfBytes);
  const r = (await verifySignedCredentialPdfBytes(
    pdfBase64,
    issuerDidDocument
  )) as any;
  const manifest = (await extractCredentialManifestFromPdf(pdfBase64).catch(
    () => null
  )) as any;
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
    batch: manifest?.signed_credential
      ? getBatchRef(manifest.signed_credential)
      : null,
    raw: JSON.stringify(r, null, 2),
  };
}

/** Chave pública de um DID Document (formato `ssi_pq_did_document_v1`). */
export interface DidPublicKey {
  /** Perfil do algoritmo, ex.: "ML-DSA-65" ou "ML-KEM-768". */
  type: string;
  /** Chave pública multibase/base58btc (prefixo `z`). */
  publicKeyMultibase: string;
}

/** Extrai a chave pública ML-DSA (`prefix = 'ML-DSA'`) ou ML-KEM do DID Document. */
export function getDidPublicKey(
  didDocumentJson: string,
  prefix: 'ML-DSA' | 'ML-KEM'
): DidPublicKey | null {
  const doc = JSON.parse(didDocumentJson) as {
    keys?: { type?: string; public_key_multibase?: string }[];
  };
  const key = doc.keys?.find((k) => k.type?.startsWith(prefix));
  if (!key?.type || !key.public_key_multibase) return null;
  return { type: key.type, publicKeyMultibase: key.public_key_multibase };
}

/** Contexto ML-DSA do desafio de pareamento (o mesmo verificado pela plataforma). */
export const PAIRING_SIGNATURE_CONTEXT = 'did-pairing-challenge';

/**
 * Assina o desafio de pareamento da plataforma com a chave ML-DSA do DID.
 *
 * A mensagem é o JSON canônico de `{pairingId, nonce, expiresAt, did}` em
 * UTF-8, exatamente como a plataforma reconstrói para verificar
 * (web-ssiaas: verifyPairingChallengeProof). Retorna a assinatura em base64url.
 */
export async function signPairingChallenge(
  challenge: { pairingId: string; nonce: string; expiresAt: string; did: string },
  mldsaProfile: string,
  mldsaPrivateKey: string
): Promise<string> {
  const canonical = await canonicalJson(JSON.stringify(challenge));
  const messageBytes = new TextEncoder().encode(canonical);
  return mldsaSign(
    mldsaProfile,
    mldsaPrivateKey,
    arrayBufferToBase64(messageBytes.buffer as ArrayBuffer),
    PAIRING_SIGNATURE_CONTEXT
  );
}

/** Verifica a auto-assinatura e a coerência de fingerprint de um DID Document. */
export async function verifyDidDocument(
  didDocumentJson: string
): Promise<boolean> {
  const r = (await verifyDidDocumentNative(didDocumentJson)) as any;
  return !!(r?.valid ?? r?.fingerprintMatchesKeys);
}

/** Valor de `BatchRef.type`, para distinguir de outros usos de `status_ref`. */
export const BATCH_REF_TYPE = 'verifile_batch_v1';

/**
 * Identificação do lote de emissão. Vai em `credential.status_ref`, que entra
 * no JSON canônico assinado pelo emissor: não dá para mover uma credencial de
 * lote sem invalidar a assinatura. Credenciais do mesmo lote compartilham
 * `batch_id` (e `issued_at`).
 */
export interface BatchRef {
  type: typeof BATCH_REF_TYPE;
  batch_id: string;
  /** Posição da credencial no lote, começando em 1. */
  index: number;
  total: number;
}

/** Lê o `BatchRef` de uma credencial assinada (JSON ou objeto), se houver. */
export function getBatchRef(signedCredential: string | object): BatchRef | null {
  const obj =
    typeof signedCredential === 'string'
      ? JSON.parse(signedCredential)
      : (signedCredential as any);
  const ref = obj?.credential?.status_ref;
  return ref?.type === BATCH_REF_TYPE && typeof ref.batch_id === 'string'
    ? (ref as BatchRef)
    : null;
}

export interface IssuedCredential {
  /** Credencial assinada (JSON serializado, com provas Merkle e assinatura ML-DSA). */
  signedCredential: string;
  /** Resultado da verificação criptográfica logo após a emissão. */
  verified: boolean;
}

/**
 * Emite uma Credencial Verificável assinada pelo emissor.
 *
 * Infere o Schema a partir dos atributos, emite a credencial revelando todos os
 * atributos e a verifica em seguida como sanidade.
 */
export async function issueCredential(
  issuerDidDocument: string,
  issuerMldsaPrivateKey: string,
  attributes: Record<string, unknown>,
  options?: { issuedAt?: string; batch?: BatchRef }
): Promise<IssuedCredential> {
  const attributesJson = JSON.stringify(attributes);
  const now = options?.issuedAt ?? new Date().toISOString();
  const schema = await createSchemaFromAttributes(attributesJson, {
    createdAt: now,
  } as any);
  // A emissão exige `issuedAt` (ISO) nas options — sem ele o core rejeita com
  // "invalid credential: issuedAt is required".
  const signedCredentialObj = await issueCredentialFromSchemaRaw(
    schema,
    attributesJson,
    issuerDidDocument,
    issuerMldsaPrivateKey,
    { issuedAt: now, statusRef: options?.batch ?? null } as any
  );
  const signedCredential = JSON.stringify(signedCredentialObj);
  const verification = (await verifySignedCredential(
    signedCredential,
    issuerDidDocument
  )) as any;
  return {
    signedCredential,
    verified: !!(verification?.valid ?? verification?.status === 'valid'),
  };
}
