## OpenClaw Control

Backend Node.js + Express (CommonJS), com frontend estatico em `public/` e arquitetura em camadas, pronto para evolucao SaaS.

## Requisitos

- Node.js 20+
- npm 10+

## Estrutura

```text
src/
  server.js
  config/
    env.js
    security.js
  core/
    auth/jwt.js
    crypto/keyVault.js
    rbac/requireRole.js
    audit/audit.service.js
    errors/httpError.js
  storage/
    sqlite.js
    migrate.js
  modules/
    auth/
      auth.routes.js
      auth.service.js
    keys/
      keys.routes.js
      keys.service.js
    usage/
      usage.routes.js
      usage.service.js
    system/
      system.routes.js
  middlewares/
    requireAuth.js
public/
  index.html
  styles.css
  app.js
```

## Setup rapido

1. Copie o arquivo de ambiente:

```bash
copy .env.example .env
```

2. Instale dependencias:

```bash
npm install
```

3. Suba a aplicacao:

```bash
npm start
```

Aplicacao: `http://localhost:7000`

Health check: `GET http://localhost:7000/api/health`

## Variaveis de ambiente

Use o `.env.example` como base:

```env
PORT=7000
JWT_ACCESS_SECRET=...
JWT_REFRESH_SECRET=...
JWT_ACCESS_TTL_MIN=15
JWT_REFRESH_TTL_DAYS=7
KEY_ENC_MASTER_B64=...
DB_PATH=./data/app.db
ADMIN_USER=admin
ADMIN_PASS_HASH=...
OPENCLAW_URL=http://127.0.0.1:18789
CORS_ORIGIN=http://localhost:7000
```

## Como gerar `KEY_ENC_MASTER_B64`

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
```

## Como gerar `ADMIN_PASS_HASH` (bcrypt)

```bash
node -e "require('bcrypt').hash('SuaSenhaForte123!', 12).then(h => console.log(h))"
```

## Login e uso com Bearer Token

### cURL

Login:

```bash
curl -X POST http://localhost:7000/api/auth/login \
  -H "Content-Type: application/json" \
  -d "{\"user\":\"admin\",\"pass\":\"SuaSenhaForte123!\"}"
```

Refresh:

```bash
curl -X POST http://localhost:7000/api/auth/refresh \
  -H "Content-Type: application/json" \
  -d "{\"refreshToken\":\"SEU_REFRESH_TOKEN\"}"
```

Endpoint protegido:

```bash
curl http://localhost:7000/api/usage/summary \
  -H "Authorization: Bearer SEU_ACCESS_TOKEN"
```

Logout (revoga refresh token):

```bash
curl -X POST http://localhost:7000/api/auth/logout \
  -H "Content-Type: application/json" \
  -d "{\"refreshToken\":\"SEU_REFRESH_TOKEN\"}"
```

### PowerShell (Invoke-RestMethod)

Login:

```powershell
$login = Invoke-RestMethod -Method Post -Uri "http://localhost:7000/api/auth/login" `
  -ContentType "application/json" `
  -Body '{"user":"admin","pass":"SuaSenhaForte123!"}'

$access = $login.accessToken
$refresh = $login.refreshToken
```

Chamada autenticada:

```powershell
Invoke-RestMethod -Method Get -Uri "http://localhost:7000/api/usage/summary" `
  -Headers @{ Authorization = "Bearer $access" }
```

Refresh:

```powershell
Invoke-RestMethod -Method Post -Uri "http://localhost:7000/api/auth/refresh" `
  -ContentType "application/json" `
  -Body (@{ refreshToken = $refresh } | ConvertTo-Json)
```

## Endpoints principais

- `GET /api/health`
- `GET /api/system/health` (protegido)
- `POST /api/auth/login`
- `POST /api/auth/refresh`
- `POST /api/auth/logout`
- `GET /api/keys`
- `POST /api/keys`
- `PATCH /api/keys/:id/toggle`
- `DELETE /api/keys/:id`
- `POST /api/keys/:id/default`
- `POST /api/usage/record`
- `GET /api/usage/summary?from=YYYY-MM-DD&to=YYYY-MM-DD`
- `GET /api/usage/per-model?from=YYYY-MM-DD&to=YYYY-MM-DD`
- `GET /api/usage/per-session?from=YYYY-MM-DD&to=YYYY-MM-DD`
- `GET /api/usage/per-key?from=YYYY-MM-DD&to=YYYY-MM-DD`

## Notas

- As API keys sao armazenadas com AES-256-GCM.
- O sistema nunca retorna a chave completa; apenas `maskedKey`.
- Acoes sensiveis de API keys geram evento em `audit_log`.
- O frontend permanece em `public/` sem build e sem alteracao visual.
