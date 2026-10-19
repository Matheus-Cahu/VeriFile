// Testes de integração: servidor real em porta efêmera + banco de teste
// (TEST_DATABASE_URL, nunca o banco de desenvolvimento) + core SSI-PQ real.
// Só a verificação do idToken do Google é substituída: os testes usam tokens
// no formato "test:<email>:<sub>".
import { after, before, beforeEach, describe, test } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { createRequire } from "node:module";
import type { AddressInfo } from "node:net";
import type { Server } from "node:http";

process.env.DATABASE_URL =
  process.env.TEST_DATABASE_URL ??
  "postgresql://vertex_user:vertex_pass@localhost:5432/verifile_test";
process.env.GOOGLE_CLIENT_IDS ??= "test-client-id";
process.env.SIGNER_SECRETS = "segredo-de-teste";

const { createApp } = await import("../src/app.js");
const { googleVerifier } = await import("../src/auth.js");
const { prisma } = await import("../src/db.js");
const { HttpError } = await import("../src/errors.js");
const { config } = await import("../src/config.js");

const core = createRequire(import.meta.url)(config.ssiPqCorePath);

googleVerifier.verify = async (token: string) => {
  const [prefix, email, sub] = token.split(":");
  if (prefix !== "test" || !email || !sub) throw new HttpError(401, "idToken do Google inválido ou expirado");
  return { sub, email, name: `Nome ${sub}`, picture: null };
};

let server: Server;
let baseUrl: string;

before(async () => {
  server = createApp().listen(0);
  await new Promise((resolve) => server.once("listening", resolve));
  baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

after(async () => {
  server.close();
  await prisma.$disconnect();
});

beforeEach(async () => {
  await prisma.verifiableCredential.deleteMany();
  await prisma.didPairingChallenge.deleteMany();
  await prisma.account.deleteMany();
  await prisma.user.deleteMany();
});

function api(path: string, init: { method?: string; token?: string; body?: unknown } = {}) {
  return fetch(`${baseUrl}${path}`, {
    method: init.method ?? (init.body ? "POST" : "GET"),
    headers: {
      ...(init.body ? { "Content-Type": "application/json" } : {}),
      ...(init.token ? { Authorization: `Bearer ${init.token}` } : {}),
    },
    body: init.body ? JSON.stringify(init.body) : undefined,
  });
}

const tokenFor = (email: string, sub = "sub-1") => `test:${email}:${sub}`;

async function login(email: string, sub = "sub-1") {
  const res = await api("/api/auth/mobile/google", { body: { idToken: tokenFor(email, sub) } });
  assert.equal(res.status, 200);
  return ((await res.json()) as { user: { id: string } }).user;
}

describe("POST /api/auth/mobile/google", () => {
  test("cria usuário + conta Google no primeiro login e reaproveita depois", async () => {
    const first = await login("ana@example.com");
    const second = await login("ana@example.com");
    assert.equal(first.id, second.id);
    assert.equal(await prisma.user.count(), 1);
    const account = await prisma.account.findFirstOrThrow();
    assert.deepEqual([account.provider, account.type, account.providerAccountId], ["google", "oidc", "sub-1"]);
  });

  test("devolve o usuário já criado pela web, com CPF", async () => {
    await prisma.user.create({ data: { email: "web@example.com", cpf: "12345678909" } });
    const res = await api("/api/auth/mobile/google", { body: { idToken: tokenFor("web@example.com") } });
    const { user } = (await res.json()) as { user: { cpf: string } };
    assert.equal(user.cpf, "12345678909");
  });

  test("rejeita idToken inválido ou ausente", async () => {
    assert.equal((await api("/api/auth/mobile/google", { body: { idToken: "lixo" } })).status, 401);
    assert.equal((await api("/api/auth/mobile/google", { body: {} })).status, 400);
  });
});

describe("GET /api/mobile/credenciais/pendentes", () => {
  async function seed() {
    const issuer = await prisma.user.create({ data: { email: "emissor@example.com", name: "Emissor" } });
    const holder = await prisma.user.create({ data: { email: "titular@example.com" } });
    const payload = (name: string) => ({
      type: ["VerifiableCredential", "Diploma"],
      credentialSchema: { id: "schema-1", name, version: "2.0" },
      credentialSubject: { id: "did:x", curso: "Computação" },
    });
    await prisma.verifiableCredential.createMany({
      data: [
        { issuerId: issuer.id, holderId: holder.id, status: "PENDING", vcPayload: payload("Diploma") },
        { issuerId: issuer.id, holderId: holder.id, status: "OFFERED", vcPayload: payload("Oferta") },
        { issuerId: issuer.id, holderId: holder.id, status: "ACTIVE", vcPayload: payload("Ativa") },
      ],
    });
  }

  test("emissor recebe as PENDING que precisa assinar", async () => {
    await seed();
    const res = await api("/api/mobile/credenciais/pendentes", { token: tokenFor("emissor@example.com") });
    assert.equal(res.status, 200);
    const body = (await res.json()) as { credentials: { status: string; schema: unknown; issuer: { name: string } }[] };
    assert.equal(body.credentials.length, 1);
    assert.equal(body.credentials[0].status, "PENDING");
    assert.deepEqual(body.credentials[0].schema, { id: "schema-1", name: "Diploma", version: "2.0" });
    assert.equal(body.credentials[0].issuer.name, "Emissor");
  });

  test("titular recebe as ofertas OFFERED com papel=titular", async () => {
    await seed();
    const res = await api("/api/mobile/credenciais/pendentes?papel=titular", {
      token: tokenFor("titular@example.com"),
    });
    const body = (await res.json()) as { credentials: { status: string }[] };
    assert.deepEqual(body.credentials.map((c) => c.status), ["OFFERED"]);
  });

  test("exige idToken de conta cadastrada", async () => {
    assert.equal((await api("/api/mobile/credenciais/pendentes")).status, 401);
    const res = await api("/api/mobile/credenciais/pendentes", { token: tokenFor("ninguem@example.com") });
    assert.equal(res.status, 403);
  });

  test("valida o parâmetro papel", async () => {
    await seed();
    const res = await api("/api/mobile/credenciais/pendentes?papel=x", { token: tokenFor("emissor@example.com") });
    assert.equal(res.status, 400);
  });
});

describe("POST /api/v1/did-pairings/:pairingId/complete", () => {
  async function setup(email = "par@example.com", expiresInMs = 600_000) {
    const user = await prisma.user.create({ data: { email, cpf: `cpf-${email}` } });
    const challenge = await prisma.didPairingChallenge.create({
      data: {
        userId: user.id,
        cpf: user.cpf!,
        email,
        pairingId: `pid-${email}`,
        nonce: "nonce-123",
        expiresAt: new Date(Date.now() + expiresInMs),
      },
    });
    const identity = core.createDid({ mldsa: "ML-DSA-65", mlkem: "ML-KEM-768", createdAt: new Date().toISOString() });
    return { user, challenge, identity };
  }

  // Monta o corpo exatamente como o app (VeriFile/src/auth/did-pairing.ts).
  function pairingBody(
    challenge: { pairingId: string; nonce: string; expiresAt: Date },
    identity: { did: string; didDocument: { keys: { type: string; public_key_multibase: string }[] }; privateKeys: { mldsaPrivateKey: string } },
    signedNonce = challenge.nonce
  ) {
    const signed = {
      pairingId: challenge.pairingId,
      nonce: signedNonce,
      expiresAt: challenge.expiresAt.toISOString(),
      did: identity.did,
    };
    const message = Buffer.from(core.canonicalJson(JSON.stringify(signed)), "utf-8");
    const proofValue = core.mldsaSign("ML-DSA-65", identity.privateKeys.mldsaPrivateKey, message, "did-pairing-challenge");
    return {
      pairingId: challenge.pairingId,
      nonce: challenge.nonce,
      expiresAt: challenge.expiresAt.toISOString(),
      did: identity.did,
      didDocument: identity.didDocument,
      mlDsaPublicKey: identity.didDocument.keys[0].public_key_multibase,
      proof: { type: "ML-DSA-65", proofValue },
    };
  }

  const url = (pairingId: string) => `/api/v1/did-pairings/${pairingId}/complete`;

  test("pareia com prova válida, grava DID/chaves e devolve o token M2M", async () => {
    const { challenge, identity } = await setup();
    const res = await api(url(challenge.pairingId), {
      token: tokenFor("par@example.com"),
      body: pairingBody(challenge, identity),
    });
    const body = (await res.json()) as { paired: boolean; did: string; bearerToken: string };
    assert.equal(res.status, 200, JSON.stringify(body));
    assert.equal(body.paired, true);
    assert.match(body.bearerToken, /^[0-9a-f]{64}$/);

    const user = await prisma.user.findUniqueOrThrow({ where: { email: "par@example.com" } });
    assert.equal(user.did, identity.did);
    assert.ok(user.didPublicKey && user.didMlkemKey && user.didPairedAt);
    const stored = await prisma.didPairingChallenge.findUniqueOrThrow({ where: { id: challenge.id } });
    assert.equal(stored.status, "COMPLETED");

    // Reuso do mesmo desafio é recusado.
    const replay = await api(url(challenge.pairingId), {
      token: tokenFor("par@example.com"),
      body: pairingBody(challenge, identity),
    });
    assert.equal(replay.status, 409);
  });

  test("recusa prova assinada sobre outro nonce", async () => {
    const { challenge, identity } = await setup();
    const res = await api(url(challenge.pairingId), {
      token: tokenFor("par@example.com"),
      body: pairingBody(challenge, identity, "nonce-forjado"),
    });
    assert.equal(res.status, 400);
    assert.equal((await prisma.user.findFirstOrThrow()).did, null);
  });

  test("recusa pareamento sem prova", async () => {
    const { challenge, identity } = await setup();
    const { proof: _proof, ...body } = pairingBody(challenge, identity);
    const res = await api(url(challenge.pairingId), { token: tokenFor("par@example.com"), body });
    assert.equal(res.status, 400);
  });

  test("não deixa outra conta concluir o desafio", async () => {
    const { challenge, identity } = await setup();
    await prisma.user.create({ data: { email: "intruso@example.com" } });
    const res = await api(url(challenge.pairingId), {
      token: tokenFor("intruso@example.com"),
      body: pairingBody(challenge, identity),
    });
    assert.equal(res.status, 404);
  });

  test("marca desafio expirado", async () => {
    const { challenge, identity } = await setup("exp@example.com", -1000);
    const res = await api(url(challenge.pairingId), {
      token: tokenFor("exp@example.com"),
      body: pairingBody(challenge, identity),
    });
    assert.equal(res.status, 410);
    const stored = await prisma.didPairingChallenge.findUniqueOrThrow({ where: { id: challenge.id } });
    assert.equal(stored.status, "EXPIRED");
  });

  test("recusa DID já pareado em outra conta", async () => {
    const a = await setup("a@example.com");
    const b = await setup("b@example.com");
    const first = await api(url(a.challenge.pairingId), {
      token: tokenFor("a@example.com"),
      body: pairingBody(a.challenge, a.identity),
    });
    assert.equal(first.status, 200);
    const res = await api(url(b.challenge.pairingId), {
      token: tokenFor("b@example.com"),
      body: pairingBody(b.challenge, a.identity),
    });
    assert.equal(res.status, 409);
  });
});

describe("POST /api/mobile/credenciais/:id/assinatura", () => {
  type Identity = { did: string; didDocument: object; privateKeys: { mldsaPrivateKey: string } };

  // Gera o PDF-credencial final como o app (VeriFile/src/crypto/keys.tsx).
  function signedPdf(identity: Identity, attributes: object, statusRef?: object): string {
    const now = new Date().toISOString();
    const schema = core.createSchemaFromAttributes(attributes, { createdAt: now });
    const signed = core.issueCredentialFromSchema(
      schema,
      attributes,
      identity.didDocument,
      identity.privateKeys.mldsaPrivateKey,
      { issuedAt: now, statusRef }
    );
    const base = core.signedCredentialToPdf(signed);
    const pdf = core.embedSignedCredentialInPdf(
      base,
      signed,
      identity.didDocument,
      identity.privateKeys.mldsaPrivateKey,
      { createdAt: now }
    );
    return Buffer.from(pdf).toString("base64");
  }

  const newIdentity = (): Identity =>
    core.createDid({ mldsa: "ML-DSA-65", mlkem: "ML-KEM-768", createdAt: new Date().toISOString() });

  async function setup() {
    const identity = newIdentity();
    const issuer = await prisma.user.create({
      data: { email: "emissor@example.com", did: identity.did, didDocument: identity.didDocument },
    });
    const holder = await prisma.user.create({ data: { email: "titular@example.com", did: "did:ssipq:titular" } });
    const vc = await prisma.verifiableCredential.create({
      data: {
        issuerId: issuer.id,
        holderId: holder.id,
        status: "PENDING",
        batchId: "lote-web",
        vcPayload: { credentialSubject: { id: "did:x", curso: "Computação" } },
        metadata: { schemaName: "Diploma" },
      },
    });
    return { identity, issuer, vc };
  }

  const url = (id: string) => `/api/mobile/credenciais/${id}/assinatura`;
  const token = tokenFor("emissor@example.com");

  test("PDF assinado pelo DID pareado passa a VC para ACTIVE", async () => {
    const { identity, vc } = await setup();
    const batch = { type: "verifile_batch_v1", batch_id: "lote-app", index: 1, total: 1 };
    const pdf = signedPdf(identity, { curso: "Computação" }, batch);
    const res = await api(url(vc.id), { token, body: { pdf } });
    const body = (await res.json()) as { status: string; pdfHash: string };
    assert.equal(res.status, 200, JSON.stringify(body));
    assert.equal(body.status, "ACTIVE");

    const stored = await prisma.verifiableCredential.findUniqueOrThrow({ where: { id: vc.id } });
    const expectedHash = createHash("sha256").update(Buffer.from(pdf, "base64")).digest("hex");
    assert.equal(stored.status, "ACTIVE");
    assert.equal(stored.pdfHash, expectedHash);
    assert.equal(stored.batchId, "lote-web");
    const metadata = stored.metadata as Record<string, unknown>;
    assert.equal(metadata.schemaName, "Diploma");
    assert.equal(metadata.issuerDid, identity.did);
    assert.equal(metadata.recipientDid, "did:ssipq:titular");
    assert.deepEqual(metadata.signingBatch, batch);

    // Reenvio não processa de novo.
    assert.equal((await api(url(vc.id), { token, body: { pdf } })).status, 409);
  });

  test("recusa PDF assinado por outro DID", async () => {
    const { vc } = await setup();
    const res = await api(url(vc.id), { token, body: { pdf: signedPdf(newIdentity(), { curso: "X" }) } });
    assert.equal(res.status, 422);
    assert.equal((await prisma.verifiableCredential.findUniqueOrThrow({ where: { id: vc.id } })).status, "PENDING");
  });

  test("recusa PDF adulterado", async () => {
    const { identity, vc } = await setup();
    const bytes = Buffer.from(signedPdf(identity, { curso: "Computação" }), "base64");
    // Altera um byte do conteúdo visual (início do PDF-base), fora do manifesto.
    bytes[200] ^= 0xff;
    const res = await api(url(vc.id), { token, body: { pdf: bytes.toString("base64") } });
    assert.ok([400, 422].includes(res.status), String(res.status));
    assert.equal((await prisma.verifiableCredential.findUniqueOrThrow({ where: { id: vc.id } })).status, "PENDING");
  });

  test("recusa arquivo que não é credencial e corpo sem PDF", async () => {
    const { vc } = await setup();
    assert.equal((await api(url(vc.id), { token, body: { pdf: Buffer.from("%PDF-1.4 nada").toString("base64") } })).status, 400);
    assert.equal((await api(url(vc.id), { token, body: {} })).status, 400);
  });

  test("só o emissor da VC pode marcá-la como assinada", async () => {
    const { vc } = await setup();
    const intruder = newIdentity();
    await prisma.user.create({
      data: { email: "intruso@example.com", did: intruder.did, didDocument: intruder.didDocument },
    });
    const res = await api(url(vc.id), {
      token: tokenFor("intruso@example.com"),
      body: { pdf: signedPdf(intruder, { curso: "X" }) },
    });
    assert.equal(res.status, 404);
    assert.equal((await api(url("nao-existe"), { token, body: { pdf: "eA==" } })).status, 404);
  });

  test("exige DID pareado na conta", async () => {
    const { vc } = await setup();
    await prisma.user.update({ where: { email: "emissor@example.com" }, data: { did: null } });
    const res = await api(url(vc.id), { token, body: { pdf: signedPdf(newIdentity(), { curso: "X" }) } });
    assert.equal(res.status, 409);
  });

  test("só aceita VCs PENDING", async () => {
    const { identity, vc } = await setup();
    await prisma.verifiableCredential.update({ where: { id: vc.id }, data: { status: "OFFERED" } });
    const res = await api(url(vc.id), { token, body: { pdf: signedPdf(identity, { curso: "X" }) } });
    assert.equal(res.status, 409);
  });
});

test("rota desconhecida responde 404 em JSON", async () => {
  const res = await api("/api/nao-existe");
  assert.equal(res.status, 404);
  assert.match(((await res.json()) as { error: string }).error, /Rota não encontrada/);
});
