# Script para corrigir banco de dados corrompido
# Remove todos os arquivos SQLite e forca recriacao

Write-Host "========================================" -ForegroundColor Red
Write-Host "  CORRECAO CRITICA - Banco Corrompido" -ForegroundColor Red
Write-Host "========================================" -ForegroundColor Red
Write-Host ""

$DataDir = "C:\OpenClawControl\data"
$ServiceName = "OpenClawControl"

# 1. Parar servico
Write-Host "1. Parando servico..." -ForegroundColor Yellow
try {
    Stop-Service -Name $ServiceName -Force -ErrorAction Stop
    Write-Host "   [OK] Servico parado" -ForegroundColor Green
}
catch {
    Write-Host "   [WARN] Nao foi possivel parar o servico (pode ja estar parado)" -ForegroundColor Yellow
}

Start-Sleep -Seconds 2

# 2. Remover todos os arquivos do banco
Write-Host ""
Write-Host "2. Removendo arquivos corrompidos..." -ForegroundColor Yellow

$files = @(
    "$DataDir\app.db",
    "$DataDir\app.db-shm", 
    "$DataDir\app.db-wal",
    "$DataDir\app.db-journal"
)

foreach ($file in $files) {
    if (Test-Path $file) {
        Remove-Item $file -Force
        Write-Host "   [OK] Removido: $(Split-Path $file -Leaf)" -ForegroundColor Gray
    }
}

# 3. Verificar se pasta data existe
if (-not (Test-Path $DataDir)) {
    Write-Host "   [INFO] Criando pasta data..." -ForegroundColor Gray
    New-Item -ItemType Directory -Path $DataDir -Force | Out-Null
}

Write-Host "   [OK] Arquivos removidos" -ForegroundColor Green

# 4. Iniciar servico (vai recriar o banco automaticamente)
Write-Host ""
Write-Host "3. Iniciando servico (vai recriar o banco)..." -ForegroundColor Yellow
try {
    Start-Service -Name $ServiceName
    Start-Sleep -Seconds 5
    
    $service = Get-Service -Name $ServiceName
    if ($service.Status -eq 'Running') {
        Write-Host "   [OK] Servico iniciado com sucesso!" -ForegroundColor Green
        
        # Verificar se banco foi criado
        if (Test-Path "$DataDir\app.db") {
            Write-Host "   [OK] Banco de dados recriado!" -ForegroundColor Green
        }
    }
    else {
        Write-Host "   [ERRO] Servico nao iniciou. Status: $($service.Status)" -ForegroundColor Red
    }
}
catch {
    Write-Host "   [ERRO] Falha ao iniciar: $_" -ForegroundColor Red
}

# 5. Mostrar logs se houver erro
Write-Host ""
Write-Host "4. Verificando logs..." -ForegroundColor Yellow
$logFile = "C:\OpenClawControl\logs\stderr.log"
if (Test-Path $logFile) {
    $lastErrors = Get-Content $logFile -Tail 5
    Write-Host "   Ultimos erros:" -ForegroundColor Gray
    $lastErrors | ForEach-Object {
        Write-Host "     $_" -ForegroundColor Gray
    }
}

Write-Host ""
Write-Host "========================================" -ForegroundColor Green
Write-Host "  Correcao Concluida!" -ForegroundColor Green
Write-Host "========================================" -ForegroundColor Green
Write-Host ""
Write-Host "Agora voce PRECISA configurar a senha do admin novamente:" -ForegroundColor Yellow
Write-Host "  Execute: C:\OpenClawControl\fix-login.ps1" -ForegroundColor White
Write-Host ""
Read-Host "Pressione ENTER para sair"
