# OpenClaw Control - Status do Serviço
# Uso: .\status-service.ps1

$ServiceName = "OpenClawControl"
$LogDir = "$PSScriptRoot\logs"

function Write-Info($Message) { Write-Host "→ $Message" -ForegroundColor White }
function Write-Success($Message) { Write-Host "✓ $Message" -ForegroundColor Green }
function Write-Warning($Message) { Write-Host "! $Message" -ForegroundColor Yellow }
function Write-Error($Message) { Write-Host "✗ $Message" -ForegroundColor Red }

Write-Host ""
Write-Host "=== OpenClaw Control - Status ===" -ForegroundColor Cyan
Write-Host ""

$service = Get-Service -Name $ServiceName -ErrorAction SilentlyContinue

if ($service) {
    $color = if ($service.Status -eq 'Running') { 'Green' } else { 'Yellow' }
    
    Write-Host "Servico: " -NoNewline
    Write-Host $ServiceName -ForegroundColor White
    
    Write-Host "Status:  " -NoNewline
    Write-Host $service.Status -ForegroundColor $color
    
    if ($service.Status -eq 'Running') {
        try {
            $response = Invoke-WebRequest -Uri "http://localhost:7000/api/health" -TimeoutSec 5 -UseBasicParsing -ErrorAction SilentlyContinue
            if ($response.StatusCode -eq 200) {
                Write-Host "HTTP:    " -NoNewline
                Write-Host "Online (http://localhost:7000)" -ForegroundColor Green
            }
        }
        catch {
            Write-Host "HTTP:    " -NoNewline
            Write-Host "Iniciando..." -ForegroundColor Yellow
        }
    }
    
    Write-Host ""
    Write-Host "Logs:" -ForegroundColor White
    
    $logFile = "$LogDir\stdout.log"
    if (Test-Path $logFile) {
        $logSize = (Get-Item $logFile).Length
        Write-Host "  stdout: $logFile ($([math]::Round($logSize/1KB, 2)) KB)"
    }
    
    $errFile = "$LogDir\stderr.log"
    if (Test-Path $errFile) {
        $errSize = (Get-Item $errFile).Length
        if ($errSize -gt 0) {
            Write-Host "  stderr: $errFile ($([math]::Round($errSize/1KB, 2)) KB)" -ForegroundColor Yellow
        }
    }
    
    Write-Host ""
    Write-Host "Comandos:" -ForegroundColor White
    Write-Host "  Iniciar:  .\start-service.ps1"
    Write-Host "  Parar:    .\stop-service.ps1"
    Write-Host "  Services: services.msc"
}
else {
    Write-Error "Servico '$ServiceName' nao instalado"
    Write-Host ""
    Write-Host "Execute install.ps1 para instalar." -ForegroundColor Yellow
    exit 1
}

Write-Host ""
