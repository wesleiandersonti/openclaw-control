# OpenClaw Control

<p align="center">
  <img src="public/assets/background.jpg" width="800" alt="OpenClaw Control Dashboard">
</p>

<p align="center">
  <strong>Dashboard e Gateway Inteligente para Gerenciamento de APIs LLM</strong>
</p>

<p align="center">
  <a href="#recursos">Recursos</a> •
  <a href="#instalação">Instalação</a> •
  <a href="#primeiros-passos">Primeiros Passos</a> •
  <a href="#documentação">Documentação</a>
</p>

---

## Visão Geral

O **OpenClaw Control** é uma plataforma completa para gerenciamento, monitoramento e controle de uso de APIs de Inteligência Artificial (LLM). Projetado para desenvolvedores, equipes e organizações que precisam de controle total sobre seus consumos de API com interface visual moderna e intuitiva.

### Por que OpenClaw Control?

- 📊 **Visibilidade Total**: Acompanhe em tempo real o consumo e custos das suas APIs
- 🔒 **Segurança de Dados**: Suas chaves API são criptografadas com AES-256-GCM
- 💰 **Controle de Custos**: Defina limites diários e receba alertas antes de ultrapassar orçamentos
- ⚡ **Integração Simples**: Suporte nativo para OpenAI, Anthropic, Google e mais
- 🎨 **Interface Moderna**: Dashboard visual com indicadores de risco em tempo real

---

## Recursos

### 🔐 Gerenciamento Seguro de API Keys

- Armazenamento criptografado de chaves API (AES-256-GCM)
- Suporte a múltiplos provedores: OpenAI, Anthropic, Google, OpenRouter
- Nunca exibimos sua chave completa - apenas máscara (ex: `sk-...9xK1`)
- Definição de chave padrão por provedor
- Ativação/desativação rápida de chaves

### 📊 Monitoramento em Tempo Real

- **Dashboard Visual**: Barra de progresso mostrando consumo diário
- **Indicadores de Risco**: Cores intuitivas (azul/vermelho/amarelo) baseadas no tempo até o limite
- **Previsão Inteligente**: Calcule automaticamente quanto tempo falta para atingir o limite
- **Atualização Automática**: Dados atualizados a cada 30 segundos

### 💰 Controle de Gastos

- **Limites Diários Configuráveis**: Defina orçamentos em USD para cada chave API
- **Modos de Proteção**:
  - **Off**: Sem limite (padrão)
  - **Alert**: Aviso visual quando próximo do limite
  - **Block**: Bloqueio automático ao atingir o limite (HTTP 402)
- **Burn Rate**: Acompanhe a velocidade de consumo e previsão de esgotamento

### 🤖 Gateway LLM Unificado

- **Chat Completion**: Envie requisições padronizadas para qualquer provedor
- **Streaming SSE**: Respostas em tempo real com Server-Sent Events
- **Cálculo Automático de Custos**: Cada requisição calcula e registra o custo exato
- **Histórico Completo**: Registro detalhado de todas as requisições com custos

### 📈 Analytics e Relatórios

- Resumo de uso por período
- Breakdown por modelo (GPT-4, Claude, etc.)
- Análise por sessão
- Custos por chave API
- Exportação de dados via API

### 🛡️ Segurança e Auditoria

- Autenticação JWT com tokens de curta duração
- Sistema de roles (Admin, Operator, Viewer)
- Log de auditoria completo para ações sensíveis
- Rate limiting integrado
- Proteção Helmet contra vulnerabilidades web

---

## Instalação

### Requisitos

- Windows 10/11
- Node.js 20 ou superior
- Git

### Instalação Rápida (Windows)

Execute este comando único no PowerShell:

```powershell
irm https://raw.githubusercontent.com/wesleiandersonti/openclaw-control/main/install.ps1 | iex
```

O instalador irá:
1. ✅ Verificar dependências (Node.js, Git)
2. 📁 Criar diretório em `C:\OpenClawControl`
3. 📥 Clonar o repositório
4. 🔐 Gerar automaticamente chaves de segurança
5. 📦 Instalar dependências
6. 🚀 Criar atalho na Área de Trabalho

### Instalação Manual

```bash
# Clone o repositório
git clone https://github.com/wesleiandersonti/openclaw-control.git
cd openclaw-control

# Instale dependências
npm install

# Configure o ambiente
copy .env.example .env
# Edite o arquivo .env e configure sua senha de admin

# Inicie o servidor
npm start
```

Acesse: `http://localhost:7000`

---

## Primeiros Passos

### 1. Configurar Senha de Administrador

Edite o arquivo `.env` e adicione um hash bcrypt da sua senha:

```bash
# No terminal PowerShell:
node -e "require('bcrypt').hash('SuaSenhaSegura123!', 12).then(h => console.log(h))"
```

Cole o resultado em `ADMIN_PASS_HASH=` no arquivo `.env`

### 2. Acessar o Dashboard

1. Acesse `http://localhost:7000`
2. Faça login com usuário `admin` e sua senha configurada
3. Você verá o **Card de Burn Rate** mostrando o consumo atual

### 3. Adicionar Primeira Chave API

1. Vá para "Gerenciar Chaves"
2. Clique em "Nova Chave"
3. Selecione o provedor (ex: OpenAI)
4. Cole sua chave API
5. Configure um limite diário (opcional, ex: $10.00)
6. Escolha o modo de proteção: Alert ou Block

### 4. Fazer Primeira Requisição

```bash
# Obter token de acesso
TOKEN=$(curl -X POST http://localhost:7000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"user":"admin","pass":"SuaSenhaSegura123!"}' | jq -r '.accessToken')

# Enviar mensagem para o LLM
curl -X POST http://localhost:7000/api/llm/chat \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "provider": "openai",
    "model": "gpt-4o-mini",
    "messages": [
      {"role": "user", "content": "Olá, como vai?"}
    ]
  }'
```

---

## Documentação

### Endpoints Principais

| Endpoint | Descrição | Acesso |
|----------|-----------|--------|
| `GET /api/health` | Status do sistema | Público |
| `POST /api/auth/login` | Autenticação | Público |
| `GET /api/keys` | Listar chaves API | Autenticado |
| `POST /api/keys` | Criar nova chave | Admin |
| `GET /api/limits/burn-rate/:id` | Previsão de consumo | Operator+ |
| `POST /api/llm/chat` | Chat completion | Operator+ |
| `POST /api/llm/chat/stream` | Streaming SSE | Operator+ |

### Exemplos de Uso

#### Ver Burn Rate (Previsão de Consumo)

```bash
curl http://localhost:7000/api/limits/burn-rate/1 \
  -H "Authorization: Bearer SEU_TOKEN"
```

**Resposta:**
```json
{
  "todayCost": 5.23,
  "dailyLimit": 10.00,
  "burnRateUsdPerHour": 2.50,
  "estimatedHoursToLimit": 1.91,
  "safe": false,
  "level": "danger"
}
```

#### Streaming com EventSource (JavaScript)

```javascript
const evtSource = new EventSource('/api/llm/chat/stream', {
  method: 'POST',
  headers: {
    'Authorization': 'Bearer SEU_TOKEN',
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    provider: 'openai',
    model: 'gpt-4o-mini',
    messages: [{ role: 'user', content: 'Conte uma historia' }]
  })
});

evtSource.addEventListener('delta', (e) => {
  const data = JSON.parse(e.data);
  console.log('Chunk:', data.text); // Texto incremental
});

evtSource.addEventListener('done', (e) => {
  const data = JSON.parse(e.data);
  console.log('Total custo:', data.usage.costUsd);
  evtSource.close();
});
```

---

## Interface Visual

### Dashboard Principal

O dashboard apresenta:

- **Card de Burn Rate**: Barra de progresso colorida mostrando:
  - 🔵 **Azul**: Consumo normal (>3h até o limite)
  - 🟡 **Amarelo**: Atenção (1-3h até o limite)
  - 🔴 **Vermelho**: Crítico (<1h até o limite)
  - Tempo estimado até atingir o limite
  - Percentual de uso do orçamento diário

- **Status do Sistema**: Indicador visual se o gateway está online
- **Login Seguro**: Interface de autenticação JWT

### Cores e Indicadores

| Cor | Significado | Ação Recomendada |
|-----|-------------|------------------|
| 🟢 Verde | Sistema online | - |
| 🔵 Azul | Consumo normal | Continue monitorando |
| 🟡 Amarelo | Alerta de consumo | Considere ajustar uso |
| 🔴 Vermelho | Limite próximo | Reduza requisições ou aumente limite |

---

## Segurança

- ✅ **Criptografia**: Chaves API armazenadas com AES-256-GCM
- ✅ **Autenticação**: JWT com refresh tokens e expiração curta (15 min)
- ✅ **Rate Limiting**: Proteção contra ataques de força bruta
- ✅ **Helmet**: Headers de segurança HTTP
- ✅ **Auditoria**: Log completo de ações administrativas
- ✅ **Variáveis Sensíveis**: Configurações em arquivo `.env` separado

---

## Suporte

### Provedores Suportados

- ✅ **OpenAI** (GPT-4, GPT-3.5, etc.)
- ✅ **Anthropic** (Claude 3 Opus, Sonnet, Haiku)
- ✅ **Google** (Gemini Pro, Gemini Ultra)
- ✅ **OpenRouter** (Acesso unificado a múltiplos modelos)
- ✅ **Custom** (Provedores compatíveis com OpenAI)

### Sistemas Operacionais

- ✅ Windows 10/11 (recomendado)
- ✅ Linux (via instalação manual)
- ✅ macOS (via instalação manual)

---

## Contribuição

Contribuições são bem-vindas! Por favor, abra uma issue para discutir mudanças grandes antes de enviar um PR.

## Licença

MIT License - veja o arquivo [LICENSE](LICENSE) para detalhes.

---

<p align="center">
  <strong>Feito por Weslei Anderson</strong> <span style="color: #ff4d6d;">❤️</span>
</p>

<p align="center">
  <sub>Versão 0.1.0</sub>
</p>
