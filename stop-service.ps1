# OpenClaw Control - Parar Serviço
# Uso: .\stop-service.ps1
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
    if ($service.Status -eq 'Stopped') {
        Write-Info "Servico '$ServiceName' ja esta parado"
        exit 0
    }
    
    Write-Info "Parando servico '$ServiceName'..."
    
    if (Test-Path $nssmPath) {
        & $nssmPath stop $ServiceName
    }
    else {
        Stop-Service -Name $ServiceName -Force
    }
    
    Start-Sleep -Seconds 3
    
    $service = Get-Service -Name $ServiceName
    if ($service.Status -eq 'Stopped') {
        Write-Success "Servico parado com sucesso"
    }
    else {
        Write-Error "Falha ao parar servico"
        exit 1
    }
}
else {
    Write-Error "Servico '$ServiceName' nao encontrado"
    exit 1
}
