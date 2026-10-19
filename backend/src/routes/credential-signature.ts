// POST /api/mobile/credenciais/:id/assinatura
//
// O app avisa a plataforma que assinou uma VC PENDING: manda o PDF-credencial
// final (base64) e a VC passa a ACTIVE — a mesma transição do callback do
// assinador no web-ssiaas (/api/signer/callback), mas autenticada pelo idToken
// do Google do emissor. Antes de atualizar, o PDF é verificado com o core
// SSI-PQ contra o DID pareado do emissor: só sai de PENDING o que foi de fato
// assinado por ele.
//
// O PDF não é guardado (pdfFile no web-ssiaas é o PDF cifrado para o titular);
// guardamos o SHA-256 em hex, o mesmo hash que o verificador da web procura.
import { createHash } from "node:crypto";
import { Router } from "express";
import type { Prisma } from "@prisma/client";

import { requireUser } from "../auth.js";
import { prisma } from "../db.js";
import { HttpError } from "../errors.js";
import { extractCredentialManifest, verifyCredentialPdf } from "../ssi-pq.js";

export const credentialSignatureRouter = Router();

type SignatureBody = { pdf?: unknown };

credentialSignatureRouter.post("/api/mobile/credenciais/:id/assinatura", requireUser, async (req, res) => {
  const { id } = req.params as { id: string };
  const { pdf } = (req.body ?? {}) as SignatureBody;
  const user = req.user!;

  if (typeof pdf !== "string" || pdf.length === 0) {
    throw new HttpError(400, "Envie o PDF-credencial assinado em base64 no campo 'pdf'");
  }
  const pdfBytes = Buffer.from(pdf, "base64");

  if (!user.did || !user.didDocument) {
    throw new HttpError(409, "Conta sem DID pareado. Pareie o DID do app na plataforma antes de assinar.");
  }

  const credential = await prisma.verifiableCredential.findUnique({
    where: { id },
    select: { id: true, status: true, issuerId: true, metadata: true, holder: { select: { did: true } } },
  });
  // Mesmo erro para "não existe" e "é de outro emissor": não revela VCs alheias.
  if (!credential || credential.issuerId !== user.id) {
    throw new HttpError(404, "Credencial não encontrada");
  }
  if (credential.status !== "PENDING") {
    throw new HttpError(409, `Credencial não está pendente de assinatura (status: ${credential.status})`);
  }

  const manifest = extractCredentialManifest(pdfBytes);
  const signed = manifest?.signed_credential?.credential;
  if (!manifest || !signed) {
    throw new HttpError(400, "O PDF não contém um manifesto de credencial SSI-PQ");
  }
  const issuerDid = manifest.document_binding?.issuer_did ?? signed.issuer_did;
  if (issuerDid !== user.did) {
    throw new HttpError(
      422,
      "Credencial assinada com um DID diferente do pareado na conta",
      `assinada por ${issuerDid ?? "?"}; DID pareado: ${user.did}`
    );
  }

  const verification = verifyCredentialPdf(pdfBytes, user.didDocument as object);
  if (!verification.valid) {
    throw new HttpError(422, "Assinatura do PDF-credencial inválida", (verification.errors ?? []).join(", "));
  }

  const pdfHash = createHash("sha256").update(pdfBytes).digest("hex");
  // Preserva o que a web gravou ao criar a oferta (schemaName, issuerName...)
  // e acrescenta os dados da assinatura nos mesmos campos do callback da web.
  const previous =
    credential.metadata && typeof credential.metadata === "object" && !Array.isArray(credential.metadata)
      ? credential.metadata
      : {};
  const metadata = {
    ...previous,
    issuerDid,
    recipientDid: credential.holder.did,
    timestamp: signed.issued_at ?? new Date().toISOString(),
    schemaId: signed.schema_id ?? null,
    pdfHash,
    expirationDate: signed.expires_at ?? null,
    credentialId: signed.credential_id ?? null,
    // Lote de assinatura do app (BatchRef em VeriFile/src/crypto/keys.tsx).
    // Não confundir com a coluna batchId, que é o lote de oferta da web.
    signingBatch: signed.status_ref ?? null,
  } as Prisma.InputJsonObject;

  // `status: PENDING` no where torna a transição atômica contra envios paralelos.
  const updated = await prisma.verifiableCredential.updateMany({
    where: { id, issuerId: user.id, status: "PENDING" },
    data: { status: "ACTIVE", pdfHash, metadata },
  });
  if (updated.count !== 1) {
    throw new HttpError(409, "Credencial já foi processada");
  }

  res.json({ credentialId: id, status: "ACTIVE", pdfHash });
});
