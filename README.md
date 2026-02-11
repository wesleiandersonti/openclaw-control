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
- `POST /api/llm/chat` - Chat completion (protegido)
- `POST /api/llm/chat/stream` - Chat streaming com SSE (protegido)
- `GET /api/limits/burn-rate/:keyId` - Previsao de burn rate por API key (protegido)

## Limites Diarios por API Key

Configure limites de gasto diario por chave API com tres modos:

- **off** (padrao): Sem limite
- **alert**: Alerta quando o limite e excedido, mas permite a requisicao
- **block**: Bloqueia requisicoes quando o limite e excedido (HTTP 402)

### Criar chave com limite

```bash
curl -X POST http://localhost:7000/api/keys \
  -H "Authorization: Bearer SEU_ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "provider": "openai",
    "apiKey": "sk-...",
    "name": "Production Key",
    "dailyLimitUsd": 10.00,
    "limitMode": "block"
  }'
```

Modos validos: `off`, `alert`, `block`

### Resposta com alerta de limite (modo alert)

```json
{
  "content": "Resposta do modelo...",
  "usage": {
    "costUsd": 0.0025,
    "totalTokens": 150
  },
  "limitWarning": {
    "message": "Daily limit warning. Limit: $10.0000, Used: $10.5231",
    "todayCost": 10.5231,
    "dailyLimitUsd": 10.0
  }
}
```

### Erro de limite excedido (modo block)

```json
{
  "error": "Daily limit exceeded. Limit: $10.0000, Used: $10.5231"
}
```

Status HTTP: `402 Payment Required`

### Previsao de Burn Rate (Taxa de Consumo)

Monitore a velocidade de consumo da API key e estimativa de tempo ate atingir o limite diario.

**Endpoint:** `GET /api/limits/burn-rate/:keyId`

```bash
curl http://localhost:7000/api/limits/burn-rate/1 \
  -H "Authorization: Bearer SEU_ACCESS_TOKEN"
```

**Resposta:**

```json
{
  "todayCost": 5.2341,
  "dailyLimit": 10.0,
  "burnRateUsdPerHour": 2.50,
  "estimatedHoursToLimit": 1.91,
  "safe": false,
  "level": "danger",
  "limitMode": "block"
}
```

**Niveis de alerta:**
- `normal` - Mais de 3 horas ate o limite (`safe: true`)
- `warning` - Entre 1 e 3 horas ate o limite (`safe: true`)
- `danger` - Menos de 1 hora ate o limite (`safe: false`)

**Campos:**
- `todayCost` - Gasto total de hoje
- `dailyLimit` - Limite diario configurado
- `burnRateUsdPerHour` - Taxa de consumo na ultima hora (USD/hora)
- `estimatedHoursToLimit` - Horas estimadas ate atingir o limite (`null` se burnRate = 0)
- `safe` - Indica se esta seguro (`true`/`false`)
- `level` - Nivel de alerta (`normal`/`warning`/`danger`)
- `limitMode` - Modo de limite configurado (`off`/`alert`/`block`)

**Notas:**
- Se nao houver consumo na ultima hora (`burnRate = 0`), `estimatedHoursToLimit` sera `null` e `safe` sera `true`
- Se o limite diario nao estiver configurado (`limitMode = 'off'`), `dailyLimit` sera `null`

## Streaming (SSE)

O endpoint `POST /api/llm/chat/stream` retorna Server-Sent Events em tempo real.

### Eventos SSE

- `event: delta` - Chunk de texto incremental
- `event: done` - Resposta completa com usage e cost
- `event: error` - Erro durante o streaming

### Exemplo curl

```bash
curl -X POST http://localhost:7000/api/llm/chat/stream \
  -H "Authorization: Bearer SEU_ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "provider": "openai",
    "model": "gpt-4o-mini",
    "messages": [
      {"role": "user", "content": "Conte uma historia curta"}
    ],
    "sessionId": "sess-123"
  }' \
  --no-buffer
```

### Exemplo JavaScript (EventSource)

```javascript
const evtSource = new EventSource('/api/llm/chat/stream', {
  method: 'POST',
  headers: {
    'Authorization': 'Bearer SEU_ACCESS_TOKEN',
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    provider: 'openai',
    model: 'gpt-4o-mini',
    messages: [{ role: 'user', content: 'Ola!' }]
  })
});

let fullText = '';

evtSource.addEventListener('delta', (e) => {
  const data = JSON.parse(e.data);
  fullText += data.text;
  console.log('Chunk:', data.text);
});

evtSource.addEventListener('done', (e) => {
  const data = JSON.parse(e.data);
  console.log('Total tokens:', data.usage.totalTokens);
  console.log('Cost USD:', data.usage.costUsd);
  evtSource.close();
});

evtSource.addEventListener('error', (e) => {
  console.error('Erro:', e.data);
  evtSource.close();
});
```

### Notas PowerShell

PowerShell nao lida bem com SSE. Use curl ou um cliente JavaScript para streaming.

## Notas

- As API keys sao armazenadas com AES-256-GCM.
- O sistema nunca retorna a chave completa; apenas `maskedKey`.
- Acoes sensiveis de API keys geram evento em `audit_log`.
- O frontend permanece em `public/` sem build e sem alteracao visual.
