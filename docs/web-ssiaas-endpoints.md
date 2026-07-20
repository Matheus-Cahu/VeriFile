# Endpoints da plataforma Vertex Web SSIaaS

Documentação dos endpoints expostos pela plataforma web de emissão de SSIs
(`vertex/web-ssiaas`), para servir de referência à integração com o app
**VeriFile**.

> **Stack:** Next.js 16 (App Router, TypeScript) · Auth.js v5 (Google OIDC) ·
> Prisma 7 · PostgreSQL 16.
> **Base URL (dev):** `http://localhost:3000`

---

## Visão geral

Por ser um app Next.js com **App Router**, a plataforma não expõe uma API REST
tradicional. Os "endpoints" se dividem em três categorias:

| Categoria | Transporte | Para que serve |
|---|---|---|
| **Rotas de API (Auth.js)** | `GET` / `POST` em `/api/auth/*` | Autenticação OIDC com Google e gestão de sessão |
| **Rotas de página (SSR)** | `GET` (HTML) | Telas da aplicação; renderizadas no servidor e protegidas por redirect |
| **Server Actions** | `POST` (RPC interno do Next.js) | Mutações de dados disparadas a partir dos formulários |

> ⚠️ **Importante para o VeriFile:** atualmente **não existe uma API pública
> JSON** para consumo por clientes externos (mobile). Toda a lógica de negócio
> roda via Server Actions acopladas à sessão de cookie do Auth.js. Para integrar
> o VeriFile será necessário criar Route Handlers REST/JSON dedicados (ver
> seção [Lacunas para integração](#lacunas-para-integração-com-o-verifile)).

---

## 1. Rotas de API — Autenticação (Auth.js)

Arquivo: `src/app/api/auth/[...nextauth]/route.ts`

```ts
import { handlers } from "@/auth";
export const { GET, POST } = handlers;
```

Esse catch-all delega para o Auth.js (configurado em `src/auth.ts`). O provedor
é **Google** e a estratégia de sessão é **`database`** (sessão persistida no
PostgreSQL, não em JWT). O Auth.js expande a rota nos seguintes sub-endpoints
padrão:

| Método | Endpoint | Descrição |
|---|---|---|
| `GET` | `/api/auth/signin` | Página/entrada de início de login |
| `POST` | `/api/auth/signin/google` | Inicia o fluxo OAuth com o Google |
| `GET` | `/api/auth/callback/google` | Callback OIDC do Google (redirect URI registrada no Google Cloud) |
| `POST` | `/api/auth/signout` | Encerra a sessão |
| `GET` | `/api/auth/session` | Retorna o JSON da sessão atual (ou vazio) |
| `GET` | `/api/auth/csrf` | Token CSRF exigido nos POSTs de auth |
| `GET` | `/api/auth/providers` | Lista os provedores configurados |

### Formato da sessão (`GET /api/auth/session`)

O callback `session` em `src/auth.ts` enriquece o objeto padrão com `id` e
`cpf` do usuário:

```jsonc
{
  "user": {
    "id": "clxxxx...",        // ID interno (cuid) da plataforma
    "cpf": "12345678901",     // null enquanto o cadastro não estiver completo
    "name": "Fulano de Tal",
    "email": "fulano@gmail.com",
    "image": "https://lh3.googleusercontent.com/..."
  },
  "expires": "2026-07-29T00:00:00.000Z"
}
```

> Este é o único endpoint que devolve JSON de forma nativa e poderia ser
> consumido para checar o estado de autenticação — desde que o cliente envie o
> cookie de sessão.

**Variáveis de ambiente exigidas:** `AUTH_SECRET`, `AUTH_GOOGLE_ID`,
`AUTH_GOOGLE_SECRET`, `NEXTAUTH_URL`, `DATABASE_URL`.

---

## 2. Rotas de página (SSR / GET)

Todas renderizam HTML no servidor e aplicam **guardas de acesso por redirect**
com base na sessão e na presença do CPF.

| Endpoint | Arquivo | Acesso / Redirect | Estado |
|---|---|---|---|
| `/` | `src/app/page.tsx` | Roteador: logado+CPF → `/dashboard`; logado sem CPF → `/completar-cadastro`; deslogado → `/login` | ✅ |
| `/login` | `src/app/login/page.tsx` | Logado com CPF → `/dashboard`. Mostra botão "Continuar com Google" | ✅ |
| `/completar-cadastro` | `src/app/completar-cadastro/page.tsx` | Exige sessão; se já tem CPF → `/dashboard`. Formulário de CPF | ✅ |
| `/dashboard` | `src/app/dashboard/page.tsx` | Exige sessão+CPF, senão redireciona. Painel Issuer/Holder | ✅ |
| `/schemas/novo` | `src/app/schemas/novo/page.tsx` | — | 🚧 Em construção |
| `/credenciais/emitir` | `src/app/credenciais/emitir/page.tsx` | — | 🚧 Em construção |

### Fluxo de navegação (guardas)

```
Usuário → /login → Google OIDC → /api/auth/callback/google → tem CPF?
├── Não → /completar-cadastro → (Server Action updateCpf) → /dashboard
└── Sim → /dashboard
```

---

## 3. Server Actions (mutações, POST/RPC)

Server Actions são funções `"use server"` invocadas via POST RPC do Next.js
(não têm URL REST estável; são chamadas pelos formulários da própria UI).

### 3.1 `updateCpf(formData)`

- **Arquivo:** `src/app/actions/update-cpf.ts`
- **Chamada por:** `CpfForm` (`src/app/completar-cadastro/CpfForm.tsx`)
- **Auth:** exige sessão ativa (`auth()`); usa `session.user.id`.
- **Entrada:** `FormData` com o campo `cpf`.
- **Lógica:**
  1. Verifica sessão; senão retorna erro.
  2. Limpa o CPF (`replace(/\D/g, "")`) e valida com `isValidCpf`
     (`src/lib/validators/cpf.ts`, dois dígitos verificadores).
  3. `prisma.user.update` grava o CPF; trata `P2002` (CPF duplicado).
  4. `revalidatePath("/completar-cadastro")`.
- **Retorno:**
  ```ts
  { success: true }
  | { success: false; error: string }
  ```

### 3.2 Login inline (Server Action anônima)

- **Arquivo:** `src/app/login/page.tsx`
- Form `action` chama `signIn("google", { redirectTo: "/dashboard" })`.

### 3.3 Logout inline (Server Action anônima)

- **Arquivo:** `src/app/dashboard/page.tsx`
- Form `action` chama `signOut({ redirectTo: "/login" })`.

---

## 4. Modelo de dados (contexto)

Schema Prisma (`prisma/schema.prisma`), relevante para entender os payloads
que futuros endpoints irão expor:

- **`User`** — `id` (cuid), `email` (único), `cpf` (opcional/único), perfil
  Google. Pode atuar como **Issuer** e **Holder**.
- **`CredentialSchema`** — estrutura de uma credencial (`jsonSchema: Json`),
  ligada ao `creator` (Issuer).
- **`VerifiableCredential`** — VC emitida no formato W3C (`vcPayload: Json`),
  com `status` (`PENDING | ACTIVE | REVOKED`), `issuer`, `holder` e `schema`.
- Tabelas do Auth.js: `Account`, `Session`, `VerificationToken`.

---

## Lacunas para integração com o VeriFile

O VeriFile (app React Native) **não consegue hoje** consumir a plataforma de
forma direta, pelos motivos:

1. **Não há Route Handlers JSON** para schemas/credenciais — apenas Server
   Actions acopladas à UI e à sessão por cookie.
2. **Autenticação por cookie de sessão** (`strategy: "database"`), não por
   token Bearer — inconveniente para cliente mobile.
3. As telas de **emissão** (`/credenciais/emitir`) e **criação de schema**
   (`/schemas/novo`) ainda estão **em construção**.

### Endpoints REST sugeridos (a implementar)

Para habilitar a integração, criar `Route Handlers` (`src/app/api/.../route.ts`)
com autenticação por token, por exemplo:

| Método | Endpoint sugerido | Função |
|---|---|---|
| `GET` | `/api/credentials` | Listar VCs do holder/issuer autenticado |
| `POST` | `/api/credentials` | Emitir nova VC a partir de um schema |
| `GET` | `/api/credentials/:id` | Obter uma VC (payload W3C) |
| `POST` | `/api/credentials/:id/accept` | Holder aceita oferta (`PENDING` → `ACTIVE`) |
| `POST` | `/api/credentials/:id/revoke` | Issuer revoga (`→ REVOKED`) |
| `GET` | `/api/schemas` | Listar schemas |
| `POST` | `/api/schemas` | Criar schema |

---

## Referências

- Código-fonte: `vertex/web-ssiaas/`
- Config do Auth.js: `vertex/web-ssiaas/src/auth.ts`
- Schema do banco: `vertex/web-ssiaas/prisma/schema.prisma`
- README do projeto: `vertex/web-ssiaas/README.md`

_Documentado em 2026-06-29 — pesquisa de IC, UNIFESP · FAPESP._
