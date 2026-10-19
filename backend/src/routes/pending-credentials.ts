// GET /api/mobile/credenciais/pendentes?papel=emissor|titular
//
// Ciclo de vida na plataforma (VCStatus): o emissor cria a oferta (OFFERED),
// o titular aceita na web (PENDING) e então o emissor assina no app (ACTIVE).
// Por isso:
//   papel=emissor (padrão) → PENDING em que o usuário é o issuer: aguardando a
//                            assinatura dele no app;
//   papel=titular          → OFFERED em que o usuário é o holder: ofertas
//                            aguardando o aceite dele.
import { Router } from "express";
import type { Prisma } from "@prisma/client";

import { requireUser } from "../auth.js";
import { prisma } from "../db.js";
import { HttpError } from "../errors.js";

export const pendingCredentialsRouter = Router();

type SchemaSummary = { id: string; name: string; version: string };

/**
 * O schema não é uma relação da credencial: ele vai como snapshot em
 * `vcPayload.credentialSchema`. Payloads antigos só têm a URL do schema em
 * `@context` e o nome no segundo `type`.
 */
function schemaFromPayload(payload: Prisma.JsonValue): SchemaSummary {
  const p = (payload && typeof payload === "object" && !Array.isArray(payload) ? payload : {}) as Record<
    string,
    unknown
  >;
  const snapshot = p.credentialSchema as Partial<SchemaSummary> | undefined;
  if (snapshot?.id && snapshot.name) {
    return { id: snapshot.id, name: snapshot.name, version: snapshot.version ?? "1.0" };
  }

  const contextUrl = (Array.isArray(p["@context"]) ? p["@context"] : []).find(
    (c): c is string => typeof c === "string" && c.includes("/api/schemas/")
  );
  const types = Array.isArray(p.type) ? p.type : [];
  return {
    id: contextUrl?.split("/api/schemas/")[1] ?? "",
    name: String(types.find((t) => t !== "VerifiableCredential") ?? "Credencial"),
    version: "1.0",
  };
}

pendingCredentialsRouter.get("/api/mobile/credenciais/pendentes", requireUser, async (req, res) => {
  const papel = req.query.papel ?? "emissor";
  if (papel !== "emissor" && papel !== "titular") {
    throw new HttpError(400, "papel deve ser 'emissor' ou 'titular'");
  }
  const userId = req.user!.id;

  const credentials = await prisma.verifiableCredential.findMany({
    where:
      papel === "emissor"
        ? { status: "PENDING", issuerId: userId }
        : { status: "OFFERED", holderId: userId },
    select: {
      id: true,
      vcPayload: true,
      status: true,
      issuedAt: true,
      expiresAt: true,
      batchId: true,
      issuer: { select: { id: true, name: true, email: true, image: true, did: true } },
      holder: { select: { id: true, name: true, email: true, did: true } },
    },
    orderBy: { issuedAt: "asc" },
  });

  res.json({
    papel,
    credentials: credentials.map((vc) => ({
      id: vc.id,
      vcPayload: vc.vcPayload,
      status: vc.status,
      issuedAt: vc.issuedAt.toISOString(),
      expiresAt: vc.expiresAt?.toISOString() ?? null,
      batchId: vc.batchId,
      issuer: vc.issuer,
      holder: vc.holder,
      schema: schemaFromPayload(vc.vcPayload),
    })),
  });
});
