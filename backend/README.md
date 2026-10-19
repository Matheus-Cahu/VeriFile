# VeriFile backend

Backend monolítico (Node + Express + Prisma) que serve o app VeriFile. Usa o
**mesmo PostgreSQL** da plataforma `vertex/web-ssiaas` e o core SSI-PQ nativo
para verificar o pareamento. O schema Prisma é uma cópia do web-ssiaas:
migrações continuam sendo feitas lá (`prisma/schema.prisma` aqui só gera o client).

## Rotas

Todas as rotas autenticadas recebem o idToken do Google Sign-In nativo em
`Authorization: Bearer <idToken>`, validado contra as chaves do Google e
`GOOGLE_CLIENT_IDS`.

| Método | Rota | Função |
|---|---|---|
| `GET` | `/health` | Liveness |
| `POST` | `/api/auth/mobile/google` | Corpo `{ idToken }`. Devolve `{ user: { id, name, email, image, cpf } }`; cria `User` + `Account` Google se a conta não existir |
| `GET` | `/api/mobile/credenciais/pendentes?papel=emissor\|titular` | `emissor` (padrão): VCs `PENDING` que o usuário precisa assinar. `titular`: ofertas `OFFERED` aguardando aceite. Devolve `{ papel, credentials: [...] }` |
| `POST` | `/api/v1/did-pairings/:pairingId/complete` | Conclui o pareamento criado em `/settings` na web. Exige DID Document válido e prova ML-DSA sobre o JSON canônico de `{pairingId, nonce, expiresAt, did}` (contexto `did-pairing-challenge`). Devolve `{ paired, did, status, pairedAt, bearerToken }` |

Erros sempre em JSON: `{ error, details? }`.

## Rodando

Pré-requisitos: Postgres do web-ssiaas no ar (`docker compose up -d` em
`vertex/web-ssiaas`) e o addon do core gerado (`npm run build` em
`vertex/ssi-pq-core`, produz `npm/ssi_pq_core.node`).

```sh
cd backend
cp .env.example .env   # ajuste GOOGLE_CLIENT_IDS / SIGNER_SECRETS
npm install            # também roda prisma generate
npm run dev            # http://0.0.0.0:3001
```

No app, aponte `EXPO_PUBLIC_API_BASE_URL` (arquivo `.env` na raiz) para
`http://<IP-do-PC>:3001`.

## Testes

Testes de integração com servidor real, core SSI-PQ real e um banco **separado**
(`verifile_test`); só a verificação do idToken do Google é simulada.

```sh
docker exec vertex_postgres psql -U vertex_user -d vertex_db -c "CREATE DATABASE verifile_test;"
DATABASE_URL=postgresql://vertex_user:vertex_pass@localhost:5432/verifile_test npx prisma db push
npm test
```
