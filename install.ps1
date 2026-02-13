# OpenClaw Control - Instalador Windows
# Requisitos: Windows 10/11, Node.js 20+, Git
# Uso: Execute como Administrador

#Requires -Version 5.1

param(
    [string]$InstallDir = "C:\OpenClawControl",
    [string]$RepoUrl = "https://github.com/wesleiandersonti/openclaw-control.git",
    [switch]$SkipOpenClawCLI
)

$ErrorActionPreference = "Continue"

# Global error handler to show errors before window closes
trap {
    Write-Host ""
    Write-Host "========================================" -ForegroundColor Red
    Write-Host "  ERROR OCCURRED" -ForegroundColor Red
    Write-Host "========================================" -ForegroundColor Red
    Write-Host ""
    Write-Host "Error: $_" -ForegroundColor Red
    Write-Host ""
    Write-Host "Line: $($_.InvocationInfo.ScriptLineNumber)" -ForegroundColor Yellow
    Write-Host ""
    Write-Host "Press Enter to exit..." -ForegroundColor Yellow
    Read-Host
    exit 1
}

# Configurações
$ServiceName = "OpenClawControl"
$ProjectRoot = $InstallDir
$LogDir = "$ProjectRoot\logs"
$NSSMVersion = "2.24"
$NSSMDownloadUrl = "https://nssm.cc/release/nssm-$NSSMVersion.zip"

# Cores para output
$Green = "Green"
$Yellow = "Yellow"
$Red = "Red"
$Cyan = "Cyan"
$White = "White"

function Write-Info($Message) {
    Write-Host "  → $Message" -ForegroundColor $White
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

function Write-Header($Message) {
    Write-Host ""
    Write-Host "========================================" -ForegroundColor $Cyan
    Write-Host "  $Message" -ForegroundColor $Cyan
    Write-Host "========================================" -ForegroundColor $Cyan
    Write-Host ""
}

# ============================================================================
# VERIFICAÇÃO DE DEPENDÊNCIAS
# ============================================================================

function Test-NodeVersion {
    try {
        $nodeVersion = node --version 2>$null
        if (-not $nodeVersion) { return $false }
        $versionMatch = $nodeVersion -match 'v(\d+)'
        if ($versionMatch) {
            return [int]$matches[1] -ge 20
        }
        return $false
    }
    catch { return $false }
}

function Test-GitInstalled {
    try {
        $gitVersion = git --version 2>$null
        return [bool]$gitVersion
    }
    catch { return $false }
}

function Test-OpenClawCLI {
    try {
        $version = openclaw --version 2>$null
        return [bool]$version
    }
    catch { return $false }
    }

# ============================================================================
# INSTALAÇÃO OPENCLAW CLI
# ============================================================================

function Install-OpenClawCLI {
    Write-Header "Verificando OpenClaw CLI"
    
    if (Test-OpenClawCLI) {
        $version = openclaw --version
        Write-Success "OpenClaw CLI detectado (versão: $version)"
        Write-Info "Pulando instalação do CLI"
        return
    }
    
    if ($SkipOpenClawCLI) {
        Write-Warning "OpenClaw CLI não detectado, mas -SkipOpenClawCLI foi especificado"
        Write-Info "Continuando sem OpenClaw CLI..."
        return
    }
    
    Write-Info "OpenClaw CLI não encontrado. Instalando..."
    
    try {
        # Tenta instalar via winget (Windows 10/11)
        $wingetExists = Get-Command winget -ErrorAction SilentlyContinue
        if ($wingetExists) {
            Write-Info "Instalando via winget..."
            winget install --id OpenClaw.OpenClaw -e --accept-source-agreements --accept-package-agreements
            if (Test-OpenClawCLI) {
                Write-Success "OpenClaw CLI instalado com sucesso"
                return
            }
        }
        
        # Fallback: Download direto
        Write-Info "Baixando OpenClaw CLI..."
        $cliUrl = "https://github.com/openclaw/openclaw/releases/latest/download/openclaw-windows-amd64.exe"
        $cliPath = "$env:TEMP\openclaw.exe"
        
        Invoke-WebRequest -Uri $cliUrl -OutFile $cliPath -UseBasicParsing
        
        # Mover para pasta do sistema
        $installPath = "C:\Program Files\OpenClaw\openclaw.exe"
        $targetDir = Split-Path $installPath -Parent
        
        if (-not (Test-Path $targetDir)) {
            New-Item -ItemType Directory -Path $targetDir -Force | Out-Null
        }
        
        Move-Item -Path $cliPath -Destination $installPath -Force
        
        # Adicionar ao PATH
        $currentPath = [Environment]::GetEnvironmentVariable("Path", "Machine")
        if ($currentPath -notlike "*$targetDir*") {
            [Environment]::SetEnvironmentVariable("Path", "$currentPath;$targetDir", "Machine")
            $env:Path = "$env:Path;$targetDir"
        }
        
        if (Test-OpenClawCLI) {
            Write-Success "OpenClaw CLI instalado com sucesso"
        }
        else {
            Write-Warning "Instalação do CLI concluída, mas comando não disponível. Reinicie o terminal."
        }
    }
    catch {
        Write-Error "Falha ao instalar OpenClaw CLI: $_"
        Write-Info "Continuando sem OpenClaw CLI..."
    }
}

# ============================================================================
# VERIFICAÇÃO DE SERVIÇO WINDOWS
# ============================================================================

function Test-ServiceExists {
    return (Get-Service -Name $ServiceName -ErrorAction SilentlyContinue) -ne $null
}

function Stop-OpenClawService {
    if (Test-ServiceExists) {
        Write-Info "Parando serviço $ServiceName..."
        try {
            Stop-Service -Name $ServiceName -Force -ErrorAction Stop
            Start-Sleep -Seconds 3
            Write-Success "Serviço parado"
        }
        catch {
            Write-Warning "Não foi possível parar o serviço: $_"
        }
    }
}

function Start-OpenClawService {
    if (Test-ServiceExists) {
        Write-Info "Iniciando serviço $ServiceName..."
        try {
            Start-Service -Name $ServiceName
            Start-Sleep -Seconds 3
            
            $service = Get-Service -Name $ServiceName
            if ($service.Status -eq 'Running') {
                Write-Success "Serviço iniciado com sucesso"
            }
            else {
                Write-Warning "Serviço não está em execução. Verifique os logs em $LogDir"
            }
        }
        catch {
            Write-Error "Falha ao iniciar serviço: $_"
        }
    }
}

# ============================================================================
# INSTALAÇÃO/ATUALIZAÇÃO DO PROJETO
# ============================================================================

function Install-NSSM {
    Write-Info "Verificando NSSM..."
    
    $nssmPath = "$ProjectRoot\nssm\nssm.exe"
    
    if (Test-Path $nssmPath) {
        Write-Success "NSSM já encontrado"
        return $nssmPath
    }
    
    Write-Info "Baixando NSSM..."
    
    try {
        $nssmDir = "$ProjectRoot\nssm"
        New-Item -ItemType Directory -Path $nssmDir -Force | Out-Null
        
        $nssmZip = "$env:TEMP\nssm-$NSSMVersion.zip"
        [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
        Invoke-WebRequest -Uri $NSSMDownloadUrl -OutFile $nssmZip -UseBasicParsing
        
        Expand-Archive -Path $nssmZip -DestinationPath "$env:TEMP\nssm-extract" -Force
        
        $win32Exe = Get-ChildItem -Path "$env:TEMP\nssm-extract" -Recurse -Filter "nssm.exe" | 
            Where-Object { $_.DirectoryName -like "*win32*" } | 
            Select-Object -First 1
        
        if (-not $win32Exe) {
            $win32Exe = Get-ChildItem -Path "$env:TEMP\nssm-extract" -Recurse -Filter "nssm.exe" | 
                Select-Object -First 1
        }
        
        if ($win32Exe) {
            Copy-Item -Path $win32Exe.FullName -Destination $nssmDir -Force
            Remove-Item -Path $nssmZip -Force -ErrorAction SilentlyContinue
            Remove-Item -Path "$env:TEMP\nssm-extract" -Recurse -Force -ErrorAction SilentlyContinue
            Write-Success "NSSM instalado"
            return $nssmPath
        }
        
        throw "NSSM.exe não encontrado"
    }
    catch {
        Write-Error "Falha ao instalar NSSM: $_"
        exit 1
    }
}

function Install-WindowsService {
    $nssmPath = Install-NSSM
    
    Write-Info "Configurando serviço Windows..."
    
    if (Test-ServiceExists) {
        Write-Info "Serviço já existe, apenas reiniciando..."
        Start-OpenClawService
        return
    }
    
    Write-Info "Criando novo serviço $ServiceName..."
    
    New-Item -ItemType Directory -Path $LogDir -Force | Out-Null
    
    $nodeExe = (Get-Command node).Source
    
    & $nssmPath install $ServiceName $nodeExe "$ProjectRoot\src\server.js"
    & $nssmPath set $ServiceName AppDirectory $ProjectRoot
    & $nssmPath set $ServiceName AppRestartDelay 5000
    & $nssmPath set $ServiceName AppStdout "$LogDir\stdout.log"
    & $nssmPath set $ServiceName AppStderr "$LogDir\stderr.log"
    & $nssmPath set $ServiceName AppRotateFiles 1
    & $nssmPath set $ServiceName AppRotateOnline 1
    & $nssmPath set $ServiceName AppRotateSeconds 86400
    & $nssmPath set $ServiceName AppRotateBytes 10485760
    & $nssmPath set $ServiceName Start SERVICE_AUTO_START
    
    Write-Success "Serviço criado"
    Start-OpenClawService
}

function New-EnvFile($Path) {
    Write-Info "Gerando arquivo .env com segredos..."
    
    $jwtAccess = -join ((1..64) | ForEach-Object { Get-Random -Maximum 16 | ForEach-Object { "0123456789abcdef"[$_] } })
    $jwtRefresh = -join ((1..64) | ForEach-Object { Get-Random -Maximum 16 | ForEach-Object { "0123456789abcdef"[$_] } })
    
    $bytes = New-Object byte[] 32
    $rng = [System.Security.Cryptography.RandomNumberGenerator]::Create()
    $rng.GetBytes($bytes)
    $rng.Dispose()
    $masterKey = [Convert]::ToBase64String($bytes)
    
    $envContent = @"
# OpenClaw Control - Configuração Automática
# Gerado em: $(Get-Date -Format "yyyy-MM-dd HH:mm:ss")
# NÃO COMPARTILHE ESTE ARQUIVO

NODE_ENV=production
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
    Write-Success "Arquivo .env criado"
    Write-Warning "IMPORTANTE: Configure a senha do admin em ADMIN_PASS_HASH"
}

function Update-Application {
    Write-Header "Modo UPDATE - Atualizando OpenClaw Control"
    
    Set-Location $ProjectRoot
    
    # Parar serviço se existir
    Stop-OpenClawService
    
    # Backup do .env (caso algo dê errado)
    if (Test-Path "$ProjectRoot\.env") {
        Copy-Item "$ProjectRoot\.env" "$ProjectRoot\.env.backup" -Force
        Write-Info "Backup do .env criado (.env.backup)"
    }
    
    # Git pull
    Write-Info "Atualizando código-fonte..."
    try {
        $gitOutput = git pull origin main 2>&1
        if ($LASTEXITCODE -ne 0) {
            throw "Git pull falhou: $gitOutput"
        }
        Write-Success "Código atualizado"
    }
    catch {
        Write-Error "Falha ao atualizar código: $_"
        exit 1
    }
    
    # npm install
    Write-Info "Atualizando dependências..."
    try {
        npm install --production 2>&1 | Out-Null
        if ($LASTEXITCODE -ne 0) {
            throw "npm install falhou"
        }
        Write-Success "Dependências atualizadas"
    }
    catch {
        Write-Error "Falha ao atualizar dependências: $_"
        exit 1
    }
    
    # Verificar se .env ainda existe
    if (-not (Test-Path "$ProjectRoot\.env")) {
        Write-Warning ".env não encontrado! Restaurando backup..."
        if (Test-Path "$ProjectRoot\.env.backup") {
            Move-Item "$ProjectRoot\.env.backup" "$ProjectRoot\.env" -Force
            Write-Success ".env restaurado do backup"
        }
        else {
            Write-Error ".env perdido e sem backup!"
            exit 1
        }
    }
    else {
        # Remover backup se tudo OK
        if (Test-Path "$ProjectRoot\.env.backup") {
            Remove-Item "$ProjectRoot\.env.backup" -Force
        }
    }
    
    Write-Success "Atualização concluída com sucesso!"
}

function Install-NewApplication {
    Write-Header "Instalação Nova - OpenClaw Control"
    
    # Criar diretório
    Write-Info "Criando diretório $InstallDir..."
    New-Item -ItemType Directory -Path $InstallDir -Force | Out-Null
    Set-Location $InstallDir
    
    # Clonar repositório
    Write-Info "Clonando repositório..."
    try {
        git clone $RepoUrl . 2>&1 | Out-Null
        if ($LASTEXITCODE -ne 0) {
            throw "Git clone falhou"
        }
        Write-Success "Repositório clonado"
    }
    catch {
        Write-Error "Falha ao clonar: $_"
        exit 1
    }
    
    # npm install
    Write-Info "Instalando dependências..."
    try {
        npm install --production 2>&1 | Out-Null
        if ($LASTEXITCODE -ne 0) {
            throw "npm install falhou"
        }
        Write-Success "Dependências instaladas"
    }
    catch {
        Write-Error "Falha ao instalar dependências: $_"
        exit 1
    }
    
    # Criar .env
    if (-not (Test-Path "$ProjectRoot\.env")) {
        New-EnvFile -Path "$ProjectRoot\.env"
    }
    
    # Criar serviço
    Install-WindowsService
}

# ============================================================================
# MAIN
# ============================================================================

# Verificar admin
if (-not ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
    Write-Error "Este script deve ser executado como ADMINISTRADOR"
    Write-Info "Clique com botão direito no PowerShell e selecione 'Executar como Administrador'"
    exit 1
}

Clear-Host
Write-Header "OpenClaw Control - Instalador Windows"

# Verificar dependências
Write-Info "Verificando Node.js..."
if (-not (Test-NodeVersion)) {
    Write-Error "Node.js 20+ não encontrado!"
    Write-Info "Instale o Node.js: https://nodejs.org/"
    exit 1
}
Write-Success "Node.js $(node --version) encontrado"

Write-Info "Verificando Git..."
if (-not (Test-GitInstalled)) {
    Write-Error "Git não encontrado!"
    Write-Info "Instale o Git: https://git-scm.com/download/win"
    exit 1
}
Write-Success "Git encontrado"

# OpenClaw CLI
Install-OpenClawCLI

# Verificar instalação existente
$isUpdate = $false
if (Test-Path $ProjectRoot) {
    Write-Info "Diretório $ProjectRoot existe"
    
    if (Test-Path "$ProjectRoot\.git") {
        Write-Success "Instalação existente detectada (repositório git encontrado)"
        $isUpdate = $true
    }
    else {
        Write-Warning "Diretório existe mas não parece ser uma instalação OpenClaw Control"
        $response = Read-Host "Deseja instalar mesmo assim? (S/N) [N]"
        if ($response -ne 'S' -and $response -ne 's') {
            Write-Info "Instalação cancelada"
            exit 0
        }
    }
}

# Executar instalação ou update
if ($isUpdate) {
    Update-Application
    
    # Garantir que serviço existe e está rodando
    Install-WindowsService
}
else {
    Install-NewApplication
}

# Resumo
Write-Header "Instalação Concluída!"

Write-Host "Diretório: " -NoNewline
Write-Host $ProjectRoot -ForegroundColor $Cyan

Write-Host ""
Write-Host "Status do Serviço:"
if (Test-ServiceExists) {
    $svc = Get-Service -Name $ServiceName
    Write-Host "  Nome: $ServiceName"
    Write-Host "  Status: $($svc.Status)" -ForegroundColor $(if ($svc.Status -eq 'Running') { $Green } else { $Yellow })
}

Write-Host ""
Write-Host "Comandos úteis:"
Write-Host "  Iniciar:    Start-Service $ServiceName"
Write-Host "  Parar:      Stop-Service $ServiceName"
Write-Host "  Status:     Get-Service $ServiceName"
Write-Host "  Logs:       Get-Content '$LogDir\stdout.log' -Tail 50"
Write-Host "  Acesso:     http://localhost:7000" -ForegroundColor $Cyan

if (-not $isUpdate) {
    Write-Host ""
    Write-Host "⚠️  IMPORTANTE:" -ForegroundColor $Yellow
    Write-Host "Configure a senha do administrador no arquivo .env"
    Write-Host "Local: $ProjectRoot\.env"
}

Write-Host ""
Write-Host "To update in the future, run this script again." -ForegroundColor $Green
Write-Host ""

# Keep PowerShell open when running via IEX
if ($Host.Name -eq 'ConsoleHost') {
    Write-Host ""
    Write-Host "Press Enter to exit..." -ForegroundColor Yellow
    Read-Host
}
