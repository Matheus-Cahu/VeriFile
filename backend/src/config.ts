// Configuração lida do ambiente (.env). Falha cedo se algo obrigatório faltar.
import "dotenv/config";
import path from "node:path";
import { fileURLToPath } from "node:url";

const backendRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function list(value: string | undefined): string[] {
  return (value ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Variável de ambiente obrigatória ausente: ${name}`);
  return value;
}

export const config = {
  port: Number(process.env.PORT ?? 3001),
  databaseUrl: required("DATABASE_URL"),
  /** Audiences aceitas no idToken do Google (Client IDs OAuth). */
  googleClientIds: list(process.env.GOOGLE_CLIENT_IDS),
  /** Segredos M2M compartilhados com o web-ssiaas (o primeiro gera tokens). */
  signerSecrets: list(process.env.SIGNER_SECRETS ?? process.env.SIGNER_SECRET),
  ssiPqCorePath: path.resolve(
    backendRoot,
    process.env.SSI_PQ_CORE_PATH ?? "../../vertex/ssi-pq-core/npm/ssi_pq_core.node"
  ),
};

if (config.googleClientIds.length === 0) {
  throw new Error("Configure GOOGLE_CLIENT_IDS com ao menos um Client ID do Google.");
}
