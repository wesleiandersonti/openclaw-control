# OpenClaw Control - Windows Installer
# One-command installation: irm https://raw.githubusercontent.com/wesleiandersonti/openclaw-control/main/install.ps1 | iex
# Requisitos: Windows 10/11, Node.js 20+, Git

#Requires -Version 5.1

param(
    [string]$InstallDir = "C:\OpenClawControl",
    [string]$RepoUrl = "https://github.com/wesleiandersonti/openclaw-control.git"
)

$ErrorActionPreference = "Stop"
$TotalSteps = 7
$CurrentStep = 0

# Cores para output
$Green = "Green"
$Yellow = "Yellow"
$Red = "Red"
$Cyan = "Cyan"

function Write-Step($Message) {
    $CurrentStep++
    Write-Host ""
    Write-Host "[$CurrentStep/$TotalSteps] $Message" -ForegroundColor $Cyan
}

function Write-Info($Message) {
    Write-Host "  → $Message" -ForegroundColor White
}

function Write-Success($Message) {
    Write-Host "  ✓ $Message" -ForegroundColor $Green
}

function Write-Warning($Message) {
    Write-Host "  ! $Message" -ForegroundColor $Yellow
}

function Write-Error($Message) {
    Write-Host "  ✗ $Message" -ForegroundColor $Red
}

function Test-NodeVersion {
    try {
        $nodeVersion = node --version 2>$null
        if (-not $nodeVersion) {
            return $false
        }
        
        $versionMatch = $nodeVersion -match 'v(\d+)'
        if ($versionMatch) {
            $majorVersion = [int]$matches[1]
            return $majorVersion -ge 20
        }
        return $false
    }
    catch {
        return $false
    }
}

function Test-GitInstalled {
    try {
        $gitVersion = git --version 2>$null
        return [bool]$gitVersion
    }
    catch {
        return $false
    }
}

function Generate-SecureRandomString($Length = 64) {
    # Cryptographically secure random string using RNG
    $bytes = New-Object byte[] $Length
    $rng = [System.Security.Cryptography.RandomNumberGenerator]::Create()
    $rng.GetBytes($bytes)
    $rng.Dispose()
    
    # Convert to alphanumeric string (base64 without special chars for compatibility)
    $chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'
    $result = -join ($bytes | ForEach-Object { $chars[$_ % $chars.Length] })
    return $result
}

function Generate-Base64Key {
    # Generates 32 cryptographically secure random bytes and converts to base64
    $bytes = New-Object byte[] 32
    $rng = [System.Security.Cryptography.RandomNumberGenerator]::Create()
    $rng.GetBytes($bytes)
    $rng.Dispose()
    return [Convert]::ToBase64String($bytes)
}

function New-EnvFile($Path) {
    $jwtAccess = Generate-SecureRandomString -Length 64
    $jwtRefresh = Generate-SecureRandomString -Length 64
    $masterKey = Generate-Base64Key
    
    $envContent = @"
# OpenClaw Control - Configuracao Automatica
# Gerado em: $(Get-Date -Format "yyyy-MM-dd HH:mm:ss")
# NAO COMPARTILHE ESTE ARQUIVO

PORT=7000
JWT_ACCESS_SECRET=$jwtAccess
JWT_REFRESH_SECRET=$jwtRefresh
JWT_ACCESS_TTL_MIN=15
JWT_REFRESH_TTL_DAYS=7
KEY_ENC_MASTER_B64=$masterKey
DB_PATH=./data/app.db
ADMIN_USER=admin
ADMIN_PASS_HASH=
OPENCLAW_URL=http://127.0.0.1:18789
CORS_ORIGIN=http://localhost:7000
"@
    
    $envContent | Out-File -FilePath $Path -Encoding UTF8 -Force
}

function New-StartScript($Path) {
    $scriptContent = @'
# OpenClaw Control - Script de Inicializacao
# Uso: .\start-control.ps1

$ErrorActionPreference = "Stop"

Write-Host "Iniciando OpenClaw Control..." -ForegroundColor Cyan
Write-Host "Acesse http://localhost:7000" -ForegroundColor Yellow
Write-Host ""

try {
    npm start
}
catch {
    Write-Host "Erro ao iniciar: $_" -ForegroundColor Red
    Read-Host "Pressione Enter para sair"
}
'@
    
    $scriptContent | Out-File -FilePath $Path -Encoding UTF8 -Force
}

function Get-SecurePassword {
    $password = Read-Host "Digite a senha de administrador (sera criptografada)" -AsSecureString
    $BSTR = [System.Runtime.InteropServices.Marshal]::SecureStringToBSTR($password)
    $plainPassword = [System.Runtime.InteropServices.Marshal]::PtrToStringAuto($BSTR)
    [System.Runtime.InteropServices.Marshal]::ZeroFreeBSTR($BSTR)
    return $plainPassword
}

# ============================================================================
# INICIO DA INSTALACAO
# ============================================================================

Clear-Host
Write-Host @"
========================================
   OpenClaw Control - Instalador Windows
========================================
"@ -ForegroundColor Cyan

Write-Host ""
Write-Host "Este instalador ira configurar o OpenClaw Control em seu sistema." -ForegroundColor White
Write-Host "Requisitos: Windows 10/11, Node.js 20+, Git" -ForegroundColor Gray
Write-Host ""

# Step 1: Verificar Node.js >= 20
Write-Step "Verificando Node.js..."
Write-Info "Verificando versao do Node.js..."
if (-not (Test-NodeVersion)) {
    Write-Error "Node.js 20+ nao encontrado!"
    Write-Host ""
    Write-Host "Por favor, instale o Node.js 20 ou superior:" -ForegroundColor Yellow
    Write-Host "  https://nodejs.org/" -ForegroundColor White
    Write-Host ""
    Write-Host "Depois de instalar, execute este instalador novamente." -ForegroundColor Yellow
    exit 1
}
$nodeVer = node --version
Write-Success "Node.js $nodeVer encontrado"

# Step 2: Verificar Git
Write-Step "Verificando Git..."
Write-Info "Verificando instalacao do Git..."
if (-not (Test-GitInstalled)) {
    Write-Error "Git nao encontrado!"
    Write-Host ""
    Write-Host "Por favor, instale o Git:" -ForegroundColor Yellow
    Write-Host "  https://git-scm.com/download/win" -ForegroundColor White
    Write-Host ""
    exit 1
}
$gitVer = (git --version).Split(' ')[2]
Write-Success "Git $gitVer encontrado"

# Step 3: Verificar/criar diretorio de instalacao
Write-Step "Preparando diretorio de instalacao..."
if (Test-Path $InstallDir) {
    Write-Warning "Diretorio ja existe: $InstallDir"
    $response = Read-Host "Deseja sobrescrever? (S/N) [N]"
    
    if ($response -eq 'S' -or $response -eq 's') {
        Write-Info "Removendo instalacao anterior..."
        try {
            Remove-Item -Path $InstallDir -Recurse -Force -ErrorAction Stop
            Write-Success "Diretorio anterior removido"
        }
        catch {
            Write-Error "Nao foi possivel remover o diretorio. Execute como Administrador ou feche aplicacoes usando a pasta."
            exit 1
        }
    }
    else {
        Write-Host "Instalacao cancelada pelo usuario." -ForegroundColor Yellow
        exit 0
    }
}

Write-Info "Criando diretorio $InstallDir..."
try {
    New-Item -ItemType Directory -Path $InstallDir -Force | Out-Null
    Write-Success "Diretorio criado"
}
catch {
    Write-Error "Nao foi possivel criar o diretorio $InstallDir"
    Write-Error $_.Exception.Message
    exit 1
}

# Step 4: Clonar repositorio
Write-Step "Baixando OpenClaw Control..."
Write-Info "Clonando repositorio (isso pode levar alguns segundos)..."
Set-Location $InstallDir

try {
    $gitOutput = git clone $RepoUrl . 2>&1
    if ($LASTEXITCODE -ne 0) {
        throw "Git clone falhou: $gitOutput"
    }
    Write-Success "Repositorio clonado com sucesso"
}
catch {
    Write-Error "Falha ao clonar repositorio"
    Write-Error $_.Exception.Message
    exit 1
}

# Step 5: Gerar arquivo .env
Write-Step "Configurando ambiente seguro..."
Write-Info "Gerando chaves de seguranca (isso pode levar alguns segundos)..."
New-EnvFile -Path "$InstallDir\.env"
Write-Success "Arquivo .env criado com segredos gerados automaticamente"

# Step 6: Instalar dependencias
Write-Step "Instalando dependencias..."
Write-Info "Executando 'npm install' (isso pode levar 1-2 minutos)..."
try {
    $npmOutput = npm install 2>&1
    if ($LASTEXITCODE -ne 0) {
        throw "npm install falhou"
    }
    Write-Success "Dependencias instaladas com sucesso"
}
catch {
    Write-Error "Falha ao instalar dependencias"
    Write-Error $_.Exception.Message
    exit 1
}

# Step 7: Criar script de inicializacao
Write-Step "Finalizando instalacao..."
Write-Info "Criando script de inicializacao..."
New-StartScript -Path "$InstallDir\start-control.ps1"
Write-Success "Script start-control.ps1 criado"

# Criar atalho no Desktop
Write-Info "Criando atalho na Area de Trabalho..."
try {
    $WshShell = New-Object -ComObject WScript.Shell
    $Shortcut = $WshShell.CreateShortcut("$env:USERPROFILE\Desktop\OpenClaw Control.lnk")
    $Shortcut.TargetPath = "powershell.exe"
    $Shortcut.Arguments = "-ExecutionPolicy Bypass -File `"$InstallDir\start-control.ps1`""
    $Shortcut.WorkingDirectory = $InstallDir
    $Shortcut.Description = "OpenClaw Control - Dashboard e Gateway LLM"
    $Shortcut.Save()
    Write-Success "Atalho criado na Area de Trabalho"
}
catch {
    Write-Warning "Nao foi possivel criar o atalho (nao critico)"
}

# ============================================================================
# RESUMO DA INSTALACAO
# ============================================================================

Clear-Host
Write-Host @"
========================================
   Instalacao Concluida com Sucesso!
========================================
"@ -ForegroundColor Green

Write-Host ""
Write-Host "Configuracao:" -ForegroundColor Yellow
Write-Host "  Diretorio: $InstallDir" -ForegroundColor White
Write-Host "  Banco de dados: $InstallDir\data\app.db" -ForegroundColor White
Write-Host "  Configuracao: $InstallDir\.env" -ForegroundColor White
Write-Host ""

Write-Host "IMPORTANTE:" -ForegroundColor Red -BackgroundColor Black
Write-Host "  Antes de iniciar, configure a senha de administrador:" -ForegroundColor Yellow
Write-Host "  1. Abra o arquivo: $InstallDir\.env" -ForegroundColor White
Write-Host "  2. Localize a linha: ADMIN_PASS_HASH=" -ForegroundColor White
Write-Host "  3. Execute este comando para gerar o hash:" -ForegroundColor White
Write-Host "     node -e `"require('bcrypt').hash('SuaSenhaAqui', 12).then(h => console.log(h))`"" -ForegroundColor Cyan
Write-Host "  4. Cole o resultado em ADMIN_PASS_HASH= -ForegroundColor White
Write-Host ""

Write-Host "Como iniciar:" -ForegroundColor Yellow
Write-Host "  Opcao 1: Clique no atalho 'OpenClaw Control' na Area de Trabalho" -ForegroundColor White
Write-Host "  Opcao 2: Execute: cd '$InstallDir'; .\start-control.ps1" -ForegroundColor White
Write-Host "  Opcao 3: Execute: cd '$InstallDir'; npm start" -ForegroundColor White
Write-Host ""

Write-Host "Acesso:" -ForegroundColor Yellow
Write-Host "  URL: http://localhost:7000" -ForegroundColor Cyan
Write-Host "  Usuario: admin" -ForegroundColor White
Write-Host "  Senha: (a que voce configurou no passo acima)" -ForegroundColor White
Write-Host ""

Write-Host "Obrigado por instalar o OpenClaw Control!" -ForegroundColor Green
Write-Host ""

# Pausar se executado com duplo-clique
if ($Host.Name -eq 'ConsoleHost') {
    Read-Host "Pressione Enter para sair"
}
