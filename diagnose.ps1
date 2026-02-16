# Diagnostic Script for OpenClaw Control Service
# Run as Administrator

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  OpenClaw Control - Diagnostico" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

$ProjectRoot = "C:\OpenClawControl"
$ServiceName = "OpenClawControl"

# 1. Check if directory exists
Write-Host "1. Verificando diretorio..." -ForegroundColor Yellow
if (Test-Path $ProjectRoot) {
    Write-Host "   [OK] Diretorio existe: $ProjectRoot" -ForegroundColor Green
} else {
    Write-Host "   [ERRO] Diretorio NAO EXISTE: $ProjectRoot" -ForegroundColor Red
    exit 1
}

# 2. Check if server.js exists
Write-Host ""
Write-Host "2. Verificando server.js..." -ForegroundColor Yellow
$serverJs = "$ProjectRoot\src\server.js"
if (Test-Path $serverJs) {
    Write-Host "   [OK] server.js encontrado" -ForegroundColor Green
} else {
    Write-Host "   [ERRO] server.js NAO ENCONTRADO em: $serverJs" -ForegroundColor Red
    Write-Host "   Conteudo da pasta src:" -ForegroundColor Gray
    Get-ChildItem "$ProjectRoot\src" -ErrorAction SilentlyContinue | ForEach-Object {
        Write-Host "     - $($_.Name)" -ForegroundColor Gray
    }
}

# 3. Check Node.js
Write-Host ""
Write-Host "3. Verificando Node.js..." -ForegroundColor Yellow
try {
    $nodeVersion = node --version
    Write-Host "   [OK] Node.js: $nodeVersion" -ForegroundColor Green
    $nodePath = (Get-Command node).Source
    Write-Host "   [INFO] Caminho: $nodePath" -ForegroundColor Gray
} catch {
    Write-Host "   [ERRO] Node.js nao encontrado!" -ForegroundColor Red
}

# 4. Check NSSM
Write-Host ""
Write-Host "4. Verificando NSSM..." -ForegroundColor Yellow
$nssmPath = "$ProjectRoot\nssm\nssm.exe"
if (Test-Path $nssmPath) {
    Write-Host "   [OK] NSSM encontrado: $nssmPath" -ForegroundColor Green
    try {
        $nssmVersion = & $nssmPath version 2>&1
        Write-Host "   [INFO] Versao: $nssmVersion" -ForegroundColor Gray
    } catch {
        Write-Host "   [WARN] Nao foi possivel verificar versao do NSSM" -ForegroundColor Yellow
    }
} else {
    Write-Host "   [ERRO] NSSM NAO ENCONTRADO!" -ForegroundColor Red
    Write-Host "   [INFO] Deve estar em: $nssmPath" -ForegroundColor Gray
}

# 5. Check Windows Service
Write-Host ""
Write-Host "5. Verificando Servico Windows..." -ForegroundColor Yellow
$service = Get-Service -Name $ServiceName -ErrorAction SilentlyContinue
if ($service) {
    Write-Host "   [OK] Servico encontrado: $ServiceName" -ForegroundColor Green
    Write-Host "   [INFO] Status: $($service.Status)" -ForegroundColor Gray
    Write-Host "   [INFO] Startup: $($service.StartType)" -ForegroundColor Gray
} else {
    Write-Host "   [ERRO] Servico NAO EXISTE: $ServiceName" -ForegroundColor Red
}

# 6. Check .env file
Write-Host ""
Write-Host "6. Verificando arquivo .env..." -ForegroundColor Yellow
$envFile = "$ProjectRoot\.env"
if (Test-Path $envFile) {
    Write-Host "   [OK] .env encontrado" -ForegroundColor Green
    $envContent = Get-Content $envFile -Raw
    if ($envContent -match "ADMIN_PASS_HASH=") {
        if ($envContent -match "ADMIN_PASS_HASH=") {
            $line = $envContent -split "`n" | Where-Object { $_ -match "ADMIN_PASS_HASH=" }
            if ($line -match "ADMIN_PASS_HASH=$") {
                Write-Host "   [WARN] ADMIN_PASS_HASH esta vazio!" -ForegroundColor Yellow
            } else {
                Write-Host "   [OK] ADMIN_PASS_HASH configurado" -ForegroundColor Green
            }
        }
    }
} else {
    Write-Host "   [ERRO] .env NAO ENCONTRADO!" -ForegroundColor Red
}

# 7. Test service creation manually (if not exists)
Write-Host ""
Write-Host "7. Teste manual de criacao de servico..." -ForegroundColor Yellow
if (-not $service -and (Test-Path $nssmPath)) {
    Write-Host "   [INFO] Tentando criar servico manualmente..." -ForegroundColor Gray
    try {
        $nodeExe = (Get-Command node).Source
        $output = & $nssmPath install $ServiceName $nodeExe "$ProjectRoot\src\server.js" 2>&1
        Write-Host "   [INFO] Comando executado" -ForegroundColor Gray
        Write-Host "   [INFO] Output: $output" -ForegroundColor Gray
        
        # Check if created
        Start-Sleep -Seconds 2
        $newService = Get-Service -Name $ServiceName -ErrorAction SilentlyContinue
        if ($newService) {
            Write-Host "   [OK] Servico criado com sucesso!" -ForegroundColor Green
            Write-Host "   [INFO] Iniciando servico..." -ForegroundColor Gray
            Start-Service $ServiceName
        } else {
            Write-Host "   [ERRO] Servico nao aparece apos criacao" -ForegroundColor Red
        }
    } catch {
        Write-Host "   [ERRO] Falha ao criar servico: $_" -ForegroundColor Red
    }
}

# 8. Show logs if exists
Write-Host ""
Write-Host "8. Verificando logs..." -ForegroundColor Yellow
$logFile = "$ProjectRoot\logs\stderr.log"
if (Test-Path $logFile) {
    Write-Host "   [INFO] Ultimas 5 linhas do log de erro:" -ForegroundColor Gray
    Get-Content $logFile -Tail 5 | ForEach-Object {
        Write-Host "      $_" -ForegroundColor Gray
    }
} else {
    Write-Host "   [INFO] Arquivo de log nao encontrado (ainda)" -ForegroundColor Gray
}

Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  Diagnostico Concluido" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "Se houver erros acima, verifique:" -ForegroundColor Yellow
Write-Host "  1. Node.js esta instalado e no PATH" -ForegroundColor White
Write-Host "  2. O diretorio C:\OpenClawControl existe" -ForegroundColor White
Write-Host "  3. Os arquivos foram clonados corretamente" -ForegroundColor White
Write-Host "  4. O arquivo .env esta configurado" -ForegroundColor White
Write-Host ""
Read-Host "Pressione ENTER para sair"
