// Autenticação do app: o VeriFile envia o idToken emitido pelo Google Sign-In
// nativo. Validamos assinatura, emissor, expiração e audiência com as chaves
// públicas do Google e identificamos o usuário da plataforma pelo email.
import type { NextFunction, Request, Response } from "express";
import { OAuth2Client, type TokenPayload } from "google-auth-library";
import type { User } from "@prisma/client";

import { config } from "./config.js";
import { prisma } from "./db.js";
import { HttpError } from "./errors.js";

const oauthClient = new OAuth2Client();

export type GoogleIdentity = {
  sub: string;
  email: string;
  name: string | null;
  picture: string | null;
};

export async function verifyGoogleIdToken(idToken: string): Promise<GoogleIdentity> {
  let payload: TokenPayload | undefined;
  try {
    const ticket = await oauthClient.verifyIdToken({
      idToken,
      audience: config.googleClientIds,
    });
    payload = ticket.getPayload();
  } catch (err) {
    throw new HttpError(401, "idToken do Google inválido ou expirado", errorMessage(err));
  }

  if (!payload?.sub || !payload.email) {
    throw new HttpError(401, "idToken do Google sem sub/email");
  }
  if (!payload.email_verified) {
    throw new HttpError(403, "Email da conta Google não verificado");
  }

  return {
    sub: payload.sub,
    email: payload.email.toLowerCase(),
    name: payload.name ?? null,
    picture: payload.picture ?? null,
  };
}

/** Ponto de troca do verificador (os testes substituem `verify`). */
export const googleVerifier = { verify: verifyGoogleIdToken };

export function bearerToken(req: Request): string {
  const [scheme, token] = (req.headers.authorization ?? "").split(" ");
  if (scheme !== "Bearer" || !token) {
    throw new HttpError(401, "Envie o idToken do Google em Authorization: Bearer <idToken>");
  }
  return token;
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: User;
    }
  }
}

/**
 * Middleware: exige um idToken válido de uma conta já cadastrada na plataforma
 * (o cadastro acontece no login, POST /api/auth/mobile/google, ou na web).
 */
export async function requireUser(req: Request, _res: Response, next: NextFunction) {
  const identity = await googleVerifier.verify(bearerToken(req));
  const user = await prisma.user.findUnique({ where: { email: identity.email } });
  if (!user) {
    throw new HttpError(403, "Conta não cadastrada na plataforma. Faça login no app novamente.");
  }
  req.user = user;
  next();
}

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
