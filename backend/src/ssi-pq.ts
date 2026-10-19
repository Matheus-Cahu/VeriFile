// Acesso ao core SSI-PQ (addon N-API em Rust), o mesmo usado pelo web-ssiaas.
// Carregado sob demanda: o servidor sobe mesmo sem o addon, e só as rotas que
// precisam de criptografia (pareamento) falham se ele não estiver disponível.
import { createRequire } from "node:module";

import { config } from "./config.js";

interface SsiPqCore {
  canonicalJson(jsonString: string): string;
  base64urlEncode(bytes: Buffer): string;
  mldsaVerify(
    profile: string,
    publicKey: string,
    message: Buffer,
    context: string,
    signature: string
  ): boolean;
  didVerify(didDocument: object): boolean;
  didFingerprintMatchesKeys(didDocument: object): boolean;
}

const require = createRequire(import.meta.url);
let core: SsiPqCore | null = null;

function getCore(): SsiPqCore {
  core ??= require(config.ssiPqCorePath) as SsiPqCore;
  return core;
}

const BASE58_ALPHABET = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";

function decodeBase58(str: string): Buffer {
  let value = 0n;
  for (const char of str) {
    const digit = BASE58_ALPHABET.indexOf(char);
    if (digit < 0) throw new Error(`Caractere base58 inválido: ${char}`);
    value = value * 58n + BigInt(digit);
  }
  const hex = value === 0n ? "" : value.toString(16);
  const bytes = Buffer.from(hex.length % 2 ? `0${hex}` : hex, "hex");
  let leadingZeros = 0;
  while (str[leadingZeros] === "1") leadingZeros++;
  return Buffer.concat([Buffer.alloc(leadingZeros), bytes]);
}

/** Tamanho da chave pública ML-DSA-65 em bytes. */
const MLDSA65_PUBLIC_KEY_BYTES = 1952;

/**
 * Converte a chave pública multibase (`z` + base58btc, com prefixo multicodec)
 * para o base64url de 1952 bytes esperado por `mldsaVerify`.
 * Mesma regra de web-ssiaas: normalizeMldsaPublicKey.
 */
function normalizeMldsaPublicKey(publicKey: string): string {
  if (!publicKey.startsWith("z")) return publicKey;
  const raw = decodeBase58(publicKey.slice(1));
  const key =
    raw.length > MLDSA65_PUBLIC_KEY_BYTES ? raw.subarray(raw.length - MLDSA65_PUBLIC_KEY_BYTES) : raw;
  return getCore().base64urlEncode(key);
}

/** Auto-assinatura do DID Document e coerência entre fingerprint e chaves. */
export function verifyDidDocument(didDocument: object): boolean {
  const c = getCore();
  return c.didVerify(didDocument) && c.didFingerprintMatchesKeys(didDocument);
}

/** Verifica a assinatura ML-DSA-65 sobre o JSON canônico do desafio. */
export function verifyPairingProof(params: {
  challenge: Record<string, unknown>;
  signature: string;
  publicKey: string;
  context: string;
}): boolean {
  const c = getCore();
  const message = Buffer.from(c.canonicalJson(JSON.stringify(params.challenge)), "utf-8");
  return c.mldsaVerify(
    "ML-DSA-65",
    normalizeMldsaPublicKey(params.publicKey),
    message,
    params.context,
    params.signature
  );
}
