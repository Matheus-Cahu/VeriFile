// POST /api/v1/did-pairings/:pairingId/complete
//
// Conclui o pareamento iniciado na tela /settings da plataforma (que cria o
// desafio em did_pairing_challenges). Mesmo contrato do web-ssiaas, com
// validação mais estrita para o cliente mobile:
//   - o app se autentica com o idToken do Google (dono do desafio);
//   - DID Document e prova ML-DSA são obrigatórios e verificados;
//   - a conclusão é atômica: só um pedido consegue tirar o desafio de PENDING.
import { createHmac } from "node:crypto";
import { Router } from "express";
import { DidPairingStatus, Prisma } from "@prisma/client";

import { requireUser } from "../auth.js";
import { config } from "../config.js";
import { prisma } from "../db.js";
import { HttpError } from "../errors.js";
import { verifyDidDocument, verifyPairingProof } from "../ssi-pq.js";

export const didPairingRouter = Router();

const PAIRING_CONTEXT = "did-pairing-challenge";

type DidKey = { type?: string; public_key_multibase?: string };

type CompletePairingBody = {
  pairingId?: string;
  nonce?: string;
  did?: string;
  didDocument?: { id?: string; keys?: DidKey[] } & Record<string, unknown>;
  proof?: { proofValue?: string };
};

/** Token M2M do assinador, igual ao web-ssiaas (lib/signer-auth.ts). */
function signerToken(did: string): string | null {
  const secret = config.signerSecrets[0];
  return secret ? createHmac("sha256", secret).update(did).digest("hex") : null;
}

function findKey(keys: DidKey[] | undefined, prefix: string): string | null {
  return keys?.find((k) => k.type?.startsWith(prefix))?.public_key_multibase ?? null;
}

didPairingRouter.post("/api/v1/did-pairings/:pairingId/complete", requireUser, async (req, res) => {
  const { pairingId } = req.params as { pairingId: string };
  const body = (req.body ?? {}) as CompletePairingBody;
  const user = req.user!;

  if (body.pairingId && body.pairingId !== pairingId) {
    throw new HttpError(400, "Mismatched pairingId between URL and payload");
  }

  const didDocument = body.didDocument;
  const did = body.did?.trim() || didDocument?.id;
  if (!did?.startsWith("did:") || !didDocument || didDocument.id !== did) {
    throw new HttpError(400, "did e didDocument (com o mesmo id) são obrigatórios");
  }
  const proofValue = body.proof?.proofValue;
  if (!proofValue) throw new HttpError(400, "Missing proof.proofValue");

  const mldsaKey = findKey(didDocument.keys, "ML-DSA");
  const mlkemKey = findKey(didDocument.keys, "ML-KEM");
  if (!mldsaKey) throw new HttpError(400, "DID Document sem chave ML-DSA");

  const challenge = await prisma.didPairingChallenge.findUnique({ where: { pairingId } });
  // Mesmo erro para "não existe" e "é de outro usuário": não revela desafios alheios.
  if (!challenge || challenge.userId !== user.id) {
    throw new HttpError(404, "Pairing challenge not found");
  }
  if (challenge.status !== DidPairingStatus.PENDING) {
    throw new HttpError(409, `Invalid challenge status: ${challenge.status}`);
  }
  if (new Date() > challenge.expiresAt) {
    await prisma.didPairingChallenge.updateMany({
      where: { id: challenge.id, status: DidPairingStatus.PENDING },
      data: { status: DidPairingStatus.EXPIRED },
    });
    throw new HttpError(410, "Challenge expired");
  }
  if (body.nonce && body.nonce !== challenge.nonce) {
    throw new HttpError(400, "Invalid nonce");
  }
  if (user.did) {
    throw new HttpError(409, "User already has a paired DID");
  }

  if (!verifyDidDocument(didDocument)) {
    throw new HttpError(400, "Invalid DID Document cryptographic structure or key mismatch");
  }

  // A mensagem assinada é reconstruída com os valores do banco, não do corpo.
  const proofValid = verifyPairingProof({
    challenge: {
      pairingId: challenge.pairingId,
      nonce: challenge.nonce,
      expiresAt: challenge.expiresAt.toISOString(),
      did,
    },
    signature: proofValue,
    publicKey: mldsaKey,
    context: PAIRING_CONTEXT,
  });
  if (!proofValid) throw new HttpError(400, "Invalid cryptographic proof signature");

  const pairedAt = new Date();
  try {
    await prisma.$transaction(async (tx) => {
      const claimed = await tx.didPairingChallenge.updateMany({
        where: { id: challenge.id, status: DidPairingStatus.PENDING },
        data: { status: DidPairingStatus.COMPLETED, usedAt: pairedAt },
      });
      if (claimed.count !== 1) {
        throw new HttpError(409, "Challenge is no longer pending");
      }
      // `did: null` impede sobrescrever um DID pareado em paralelo.
      const updated = await tx.user.updateMany({
        where: { id: user.id, did: null },
        data: {
          did,
          didPublicKey: mldsaKey,
          didMlkemKey: mlkemKey,
          didDocument: didDocument as Prisma.InputJsonValue,
          didPairedAt: pairedAt,
        },
      });
      if (updated.count !== 1) {
        throw new HttpError(409, "User already has a paired DID");
      }
    });
  } catch (err) {
    // P2002: o DID já pertence a outra conta.
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      throw new HttpError(409, "This DID is already registered to another account");
    }
    throw err;
  }

  res.json({
    paired: true,
    did,
    status: "ACTIVE",
    pairedAt: pairedAt.toISOString(),
    bearerToken: signerToken(did),
  });
});
