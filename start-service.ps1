# OpenClaw Control - Iniciar Serviço
# Uso: .\start-service.ps1
# Requer: Executar como Administrador

$ServiceName = "OpenClawControl"
$nssmPath = "$PSScriptRoot\nssm\nssm.exe"

function Write-Info($Message) { Write-Host "→ $Message" -ForegroundColor White }
function Write-Success($Message) { Write-Host "✓ $Message" -ForegroundColor Green }
function Write-Error($Message) { Write-Host "✗ $Message" -ForegroundColor Red }

if (-not ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
    Write-Error "Execute como Administrador"
    exit 1
}

$service = Get-Service -Name $ServiceName -ErrorAction SilentlyContinue

if ($service) {
    if ($service.Status -eq 'Running') {
        Write-Info "Servico '$ServiceName' ja esta em execucao"
        exit 0
    }
    
    Write-Info "Iniciando servico '$ServiceName'..."
    
    if (Test-Path $nssmPath) {
        & $nssmPath start $ServiceName
    }
    else {
        Start-Service -Name $ServiceName
    }
    
    Start-Sleep -Seconds 3
    
    $service = Get-Service -Name $ServiceName
    if ($service.Status -eq 'Running') {
        Write-Success "Servico iniciado com sucesso"
        Write-Info "Acesse: http://localhost:7000"
    }
    else {
        Write-Error "Falha ao iniciar servico"
        exit 1
    }
}
else {
    Write-Error "Servico '$ServiceName' nao encontrado"
    Write-Info "Execute install.ps1 para instalar"
    exit 1
}
