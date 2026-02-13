# OpenClaw Control - Atualização Rápida
# Uso: .\update.ps1
# Atualiza o OpenClaw Control sem reinstalar o serviço

param(
    [switch]$SkipNpmInstall,
    [switch]$SkipServiceRestart
)

$ProjectRoot = "C:\OpenClawControl"
$ServiceName = "OpenClawControl"

function Write-Info($Message) { Write-Host "→ $Message" -ForegroundColor White }
function Write-Success($Message) { Write-Host "✓ $Message" -ForegroundColor Green }
function Write-Warning($Message) { Write-Host "! $Message" -ForegroundColor Yellow }
function Write-Error($Message) { Write-Host "✗ $Message" -ForegroundColor Red }

if (-not ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
    Write-Error "Execute como Administrador"
    exit 1
}

if (-not (Test-Path $ProjectRoot)) {
    Write-Error "Diretorio $ProjectRoot nao encontrado"
    Write-Info "Execute install.ps1 primeiro"
    exit 1
}

Write-Host ""
Write-Host "=== OpenClaw Control - Atualizacao ===" -ForegroundColor Cyan
Write-Host ""

Set-Location $ProjectRoot

# Verificar se é um repositório git
if (-not (Test-Path "$ProjectRoot\.git")) {
    Write-Error "Diretorio nao e um repositorio git valido"
    exit 1
}

# Parar serviço
if (-not $SkipServiceRestart) {
    $service = Get-Service -Name $ServiceName -ErrorAction SilentlyContinue
    if ($service -and $service.Status -eq 'Running') {
        Write-Info "Parando servico..."
        Stop-Service -Name $ServiceName -Force
        Start-Sleep -Seconds 2
        Write-Success "Servico parado"
    }
}

# Backup do .env
if (Test-Path "$ProjectRoot\.env") {
    Copy-Item "$ProjectRoot\.env" "$ProjectRoot\.env.backup" -Force
    Write-Info "Backup do .env criado"
}

# Git pull
Write-Info "Atualizando codigo..."
try {
    git pull origin main
    if ($LASTEXITCODE -ne 0) { throw "Git pull falhou" }
    Write-Success "Codigo atualizado"
}
catch {
    Write-Error "Falha ao atualizar: $_"
    exit 1
}

# npm install
if (-not $SkipNpmInstall) {
    Write-Info "Atualizando dependencias..."
    try {
        npm install --production
        if ($LASTEXITCODE -ne 0) { throw "npm install falhou" }
        Write-Success "Dependencias atualizadas"
    }
    catch {
        Write-Error "Falha: $_"
        exit 1
    }
}

# Restaurar .env se necessário
if (-not (Test-Path "$ProjectRoot\.env")) {
    if (Test-Path "$ProjectRoot\.env.backup") {
        Move-Item "$ProjectRoot\.env.backup" "$ProjectRoot\.env" -Force
        Write-Success ".env restaurado"
    }
}
else {
    Remove-Item "$ProjectRoot\.env.backup" -Force -ErrorAction SilentlyContinue
}

# Iniciar serviço
if (-not $SkipServiceRestart) {
    Write-Info "Iniciando servico..."
    Start-Service -Name $ServiceName
    Start-Sleep -Seconds 3
    
    $service = Get-Service -Name $ServiceName
    if ($service.Status -eq 'Running') {
        Write-Success "Servico iniciado"
        Write-Info "Acesse: http://localhost:7000"
    }
    else {
        Write-Warning "Servico nao iniciou. Verifique os logs."
    }
}

Write-Host ""
Write-Success "Atualizacao concluida!"
Write-Host ""
