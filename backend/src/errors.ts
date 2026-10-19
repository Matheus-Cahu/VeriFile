import type { NextFunction, Request, Response } from "express";

/** Erro com status HTTP; vira `{ error, details? }` na resposta. */
export class HttpError extends Error {
  constructor(
    readonly status: number,
    message: string,
    readonly details?: string
  ) {
    super(message);
  }
}

export function errorHandler(err: unknown, req: Request, res: Response, _next: NextFunction) {
  if (err instanceof HttpError) {
    res.status(err.status).json({ error: err.message, ...(err.details ? { details: err.details } : {}) });
    return;
  }
  // Corpo JSON malformado (express.json).
  if (err instanceof SyntaxError && "body" in err) {
    res.status(400).json({ error: "Invalid JSON body" });
    return;
  }
  console.error(`[${req.method} ${req.path}] Unexpected error:`, err);
  res.status(500).json({ error: "Internal server error" });
}
