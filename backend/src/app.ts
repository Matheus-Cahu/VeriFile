import express from "express";

import { errorHandler } from "./errors.js";
import { didPairingRouter } from "./routes/did-pairing.js";
import { mobileAuthRouter } from "./routes/mobile-auth.js";
import { pendingCredentialsRouter } from "./routes/pending-credentials.js";

export function createApp() {
  const app = express();
  app.disable("x-powered-by");
  // DID Documents ML-DSA/ML-KEM passam de 10 kB; 1 MB dá folga.
  app.use(express.json({ limit: "1mb" }));

  app.get("/health", (_req, res) => {
    res.json({ ok: true });
  });

  app.use(mobileAuthRouter);
  app.use(pendingCredentialsRouter);
  app.use(didPairingRouter);

  app.use((req, res) => {
    res.status(404).json({ error: `Rota não encontrada: ${req.method} ${req.path}` });
  });
  app.use(errorHandler);
  return app;
}
