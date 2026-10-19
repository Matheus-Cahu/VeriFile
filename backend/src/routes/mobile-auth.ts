// POST /api/auth/mobile/google
// Troca o idToken do Google Sign-In nativo pelo usuário da plataforma. Se a
// conta ainda não existe, cria User + Account (provider "google") no mesmo
// formato do @auth/prisma-adapter, para que o login na web enxergue o mesmo
// usuário.
import { Router } from "express";

import { googleVerifier } from "../auth.js";
import { prisma } from "../db.js";
import { HttpError } from "../errors.js";

export const mobileAuthRouter = Router();

mobileAuthRouter.post("/api/auth/mobile/google", async (req, res) => {
  const idToken = (req.body as { idToken?: unknown } | undefined)?.idToken;
  if (typeof idToken !== "string" || idToken.length === 0) {
    throw new HttpError(400, "Missing required field: idToken");
  }

  const identity = await googleVerifier.verify(idToken);

  const user = await prisma.$transaction(async (tx) => {
    const existing = await tx.user.findUnique({ where: { email: identity.email } });
    const user =
      existing ??
      (await tx.user.create({
        data: {
          email: identity.email,
          name: identity.name,
          image: identity.picture,
          emailVerified: new Date(),
        },
      }));

    // Vincula a conta Google ao usuário (idempotente).
    await tx.account.upsert({
      where: {
        provider_providerAccountId: { provider: "google", providerAccountId: identity.sub },
      },
      create: {
        userId: user.id,
        type: "oidc",
        provider: "google",
        providerAccountId: identity.sub,
      },
      update: {},
    });

    return user;
  });

  res.json({
    user: {
      id: user.id,
      name: user.name,
      email: user.email,
      image: user.image,
      cpf: user.cpf,
    },
  });
});
