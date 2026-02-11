# OpenClaw Control - Windows Installer
# One-command installation: irm https://raw.githubusercontent.com/wesleiandersonti/openclaw-control/main/install.ps1 | iex
# Requisitos: Windows 10/11, Node.js 20+, Git

#Requires -Version 5.1

param(
    [string]$InstallDir = "C:\OpenClawControl",
    [string]$RepoUrl = "https://github.com/wesleiandersonti/openclaw-control.git"
)

$ErrorActionPreference = "Stop"

# Cores para output
$Green = "Green"
$Yellow = "Yellow"
$Red = "Red"
$Cyan = "Cyan"

function Write-Info($Message) {
    Write-Host $Message -ForegroundColor $Cyan
}

function Write-Success($Message) {
    Write-Host "[OK] $Message" -ForegroundColor $Green
}

function Write-Warning($Message) {
    Write-Host "[!] $Message" -ForegroundColor $Yellow
}

function Write-Error($Message) {
    Write-Host "[ERRO] $Message" -ForegroundColor $Red
}

function Test-NodeVersion {
    try {
        $nodeVersion = node --version 2>$null
        if (-not $nodeVersion) {
            return $false
        }
        
        # Extrai versão major (ex: v20.10.0 -> 20)
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

function Generate-RandomString($Length = 64) {
    $chars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%^&*-_+=<>?'
    $random = New-Object System.Random
    $result = -join ((1..$Length) | ForEach-Object { $chars[$random.Next($chars.Length)] })
    return $result
}

function Generate-Base64Key {
    # Gera 32 bytes aleatorios e converte para base64
    $bytes = New-Object byte[] 32
    $rng = [System.Security.Cryptography.RandomNumberGenerator]::Create()
    $rng.GetBytes($bytes)
    $rng.Dispose()
    return [Convert]::ToBase64String($bytes)
}

function New-EnvFile($Path) {
    $jwtAccess = Generate-RandomString -Length 64
    $jwtRefresh = Generate-RandomString -Length 64
    $masterKey = Generate-Base64Key
    
    $envContent = @"
# OpenClaw Control - Configuracao Automatica
# Gerado em: $(Get-Date -Format "yyyy-MM-dd HH:mm:ss")

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
    Write-Success "Arquivo .env criado com segredos gerados automaticamente"
}

function New-StartScript($Path) {
    $scriptContent = @'
# OpenClaw Control - Script de Inicializacao
# Uso: . start-control.ps1

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
    Write-Success "Script start-control.ps1 criado"
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

# 1. Verificar Node.js >= 20
Write-Info "Verificando Node.js..."
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

# 2. Verificar Git
Write-Info "Verificando Git..."
if (-not (Test-GitInstalled)) {
    Write-Error "Git nao encontrado!"
    Write-Host ""
    Write-Host "Por favor, instale o Git:" -ForegroundColor Yellow
    Write-Host "  https://git-scm.com/download/win" -ForegroundColor White
    Write-Host ""
    exit 1
}
Write-Success "Git encontrado"

# 3. Verificar/criar diretorio de instalacao
Write-Info "Verificando diretorio de instalacao..."
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

# Criar diretorio
try {
    New-Item -ItemType Directory -Path $InstallDir -Force | Out-Null
    Write-Success "Diretorio criado: $InstallDir"
}
catch {
    Write-Error "Nao foi possivel criar o diretorio $InstallDir"
    Write-Error $_.Exception.Message
    exit 1
}

# 4. Clonar repositorio
Write-Info "Clonando repositorio..."
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

# 5. Gerar arquivo .env
Write-Info "Gerando configuracao (.env)..."
New-EnvFile -Path "$InstallDir\.env"

# 6. Instalar dependencias
Write-Info "Instalando dependencias (npm install)..."
try {
    $npmOutput = npm install 2>&1
    if ($LASTEXITCODE -ne 0) {
        throw "npm install falhou"
    }
    Write-Success "Dependencias instaladas"
}
catch {
    Write-Error "Falha ao instalar dependencias"
    Write-Error $_.Exception.Message
    exit 1
}

# 7. Criar script de inicializacao
Write-Info "Criando script de inicializacao..."
New-StartScript -Path "$InstallDir\start-control.ps1"

# 8. Exibir resumo
Clear-Host
Write-Host @"
========================================
   Instalacao Concluida!
========================================
"@ -ForegroundColor Green

Write-Host "Diretorio de instalacao: " -NoNewline
Write-Host $InstallDir -ForegroundColor Cyan

Write-Host ""
Write-Host "Proximos passos:" -ForegroundColor Yellow
Write-Host "  1. Configure a senha do admin no arquivo .env"
Write-Host "     Local: $InstallDir\.env"
Write-Host ""
Write-Host "  2. Para iniciar o servidor, execute:" -ForegroundColor Yellow
Write-Host "     cd '$InstallDir'"
Write-Host "     .\start-control.ps1"
Write-Host "     ou"
Write-Host "     npm start"
Write-Host ""
Write-Host "  3. Acesse no navegador:" -ForegroundColor Yellow
Write-Host "     http://localhost:7000" -ForegroundColor Cyan
Write-Host ""

# Criar atalho no Desktop (opcional)
$createShortcut = Read-Host "Deseja criar um atalho na Area de Trabalho? (S/N) [S]"
if ($createShortcut -ne 'N') {
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
        Write-Warning "Nao foi possivel criar o atalho"
    }
}

Write-Host ""
Write-Host "Obrigado por instalar o OpenClaw Control!" -ForegroundColor Green
Write-Host ""

# Pausar se executado com duplo-clique
if ($Host.Name -eq 'ConsoleHost') {
    Read-Host "Pressione Enter para sair"
}
