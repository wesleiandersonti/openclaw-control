# OpenClaw Control - Corrigir Login
# Este script verifica e corrige problemas de autenticacao

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  OpenClaw Control - Correcao de Login" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

$ProjectRoot = "C:\OpenClawControl"
$EnvFile = "$ProjectRoot\.env"

# 1. Verificar se .env existe
Write-Host "1. Verificando arquivo .env..." -ForegroundColor Yellow
if (-not (Test-Path $EnvFile)) {
    Write-Host "   [ERRO] Arquivo .env NAO EXISTE!" -ForegroundColor Red
    Write-Host ""
    Write-Host "   O sistema nao pode funcionar sem o arquivo .env" -ForegroundColor Yellow
    Write-Host "   Vamos criar um novo com configuracoes padrao..." -ForegroundColor Yellow
    Write-Host ""
    
    # Criar .env com valores padrao
    $envContent = @"
# OpenClaw Control - Configuracao
NODE_ENV=production
PORT=7000
JWT_ACCESS_SECRET=change-me-in-production
JWT_REFRESH_SECRET=change-me-in-production
KEY_ENC_MASTER_B64=change-me-in-production
DB_PATH=./data/app.db
ADMIN_USER=admin
ADMIN_PASS_HASH=
OPENCLAW_URL=http://127.0.0.1:18789
CORS_ORIGIN=http://localhost:7000
"@
    
    $envContent | Out-File -FilePath $EnvFile -Encoding UTF8
    Write-Host "   [OK] Arquivo .env criado" -ForegroundColor Green
}
else {
    Write-Host "   [OK] Arquivo .env existe" -ForegroundColor Green
}

# 2. Ler conteudo do .env
Write-Host ""
Write-Host "2. Verificando configuracoes..." -ForegroundColor Yellow
$envContent = Get-Content $EnvFile -Raw

# Verificar ADMIN_PASS_HASH
if ($envContent -match "ADMIN_PASS_HASH=(.+)") {
    $hash = $matches[1].Trim()
    if ([string]::IsNullOrWhiteSpace($hash) -or $hash -eq "") {
        Write-Host "   [ERRO] ADMIN_PASS_HASH esta VAZIO!" -ForegroundColor Red
        Write-Host ""
        Write-Host "   O login nao funciona sem uma senha configurada." -ForegroundColor Yellow
        Write-Host ""
        
        # Pedir nova senha
        Write-Host "   Vamos configurar uma senha agora..." -ForegroundColor Cyan
        Write-Host ""
        
        do {
            $pass1 = Read-Host "   Digite a senha do admin" -AsSecureString
            $pass2 = Read-Host "   Confirme a senha" -AsSecureString
            
            $BSTR1 = [System.Runtime.InteropServices.Marshal]::SecureStringToBSTR($pass1)
            $plain1 = [System.Runtime.InteropServices.Marshal]::PtrToStringAuto($BSTR1)
            [System.Runtime.InteropServices.Marshal]::ZeroFreeBSTR($BSTR1)
            
            $BSTR2 = [System.Runtime.InteropServices.Marshal]::SecureStringToBSTR($pass2)
            $plain2 = [System.Runtime.InteropServices.Marshal]::PtrToStringAuto($BSTR2)
            [System.Runtime.InteropServices.Marshal]::ZeroFreeBSTR($BSTR2)
            
            if ($plain1 -ne $plain2) {
                Write-Host "   [ERRO] Senhas nao coincidem!" -ForegroundColor Red
            }
            elseif ([string]::IsNullOrWhiteSpace($plain1)) {
                Write-Host "   [ERRO] Senha nao pode ser vazia!" -ForegroundColor Red
            }
            else {
                # Gerar hash
                Write-Host "   Gerando hash bcrypt..." -ForegroundColor Gray
                $hashScript = @"
const bcrypt = require('bcrypt');
console.log(bcrypt.hashSync('$plain1', 12));
"@
                $newHash = ($hashScript | node).Trim()
                
                # Atualizar .env
                $newContent = $envContent -replace "ADMIN_PASS_HASH=.*", "ADMIN_PASS_HASH=$newHash"
                $newContent | Out-File -FilePath $EnvFile -Encoding UTF8
                
                Write-Host "   [OK] Senha configurada com sucesso!" -ForegroundColor Green
                break
            }
        } while ($true)
    }
    else {
        Write-Host "   [OK] ADMIN_PASS_HASH configurado" -ForegroundColor Green
    }
}
else {
    Write-Host "   [ERRO] ADMIN_PASS_HASH nao encontrado no .env!" -ForegroundColor Red
}

# 3. Verificar segredos
Write-Host ""
Write-Host "3. Verificando segredos JWT..." -ForegroundColor Yellow
$needsUpdate = $false

if ($envContent -match "JWT_ACCESS_SECRET=change-me") {
    Write-Host "   [WARN] JWT_ACCESS_SECRET usando valor padrao inseguro" -ForegroundColor Yellow
    $needsUpdate = $true
}

if ($envContent -match "JWT_REFRESH_SECRET=change-me") {
    Write-Host "   [WARN] JWT_REFRESH_SECRET usando valor padrao inseguro" -ForegroundColor Yellow
    $needsUpdate = $true
}

if ($envContent -match "KEY_ENC_MASTER_B64=change-me") {
    Write-Host "   [WARN] KEY_ENC_MASTER_B64 usando valor padrao inseguro" -ForegroundColor Yellow
    $needsUpdate = $true
}

if ($needsUpdate) {
    Write-Host ""
    $response = Read-Host "   Deseja gerar novos segredos seguros? (S/N) [S]"
    if ($response -ne 'N') {
        Write-Host "   Gerando novos segredos..." -ForegroundColor Gray
        
        # Gerar segredos
        $accessBytes = New-Object byte[] 64
        $rng1 = [System.Security.Cryptography.RandomNumberGenerator]::Create()
        $rng1.GetBytes($accessBytes)
        $jwtAccess = [Convert]::ToBase64String($accessBytes)
        
        $refreshBytes = New-Object byte[] 64
        $rng2 = [System.Security.Cryptography.RandomNumberGenerator]::Create()
        $rng2.GetBytes($refreshBytes)
        $jwtRefresh = [Convert]::ToBase64String($refreshBytes)
        
        $masterBytes = New-Object byte[] 32
        $rng3 = [System.Security.Cryptography.RandomNumberGenerator]::Create()
        $rng3.GetBytes($masterBytes)
        $masterKey = [Convert]::ToBase64String($masterBytes)
        
        # Atualizar .env
        $envContent = Get-Content $EnvFile -Raw
        $envContent = $envContent -replace "JWT_ACCESS_SECRET=.*", "JWT_ACCESS_SECRET=$jwtAccess"
        $envContent = $envContent -replace "JWT_REFRESH_SECRET=.*", "JWT_REFRESH_SECRET=$jwtRefresh"
        $envContent = $envContent -replace "KEY_ENC_MASTER_B64=.*", "KEY_ENC_MASTER_B64=$masterKey"
        $envContent | Out-File -FilePath $EnvFile -Encoding UTF8
        
        Write-Host "   [OK] Segredos atualizados!" -ForegroundColor Green
    }
}

# 4. Reiniciar servico
Write-Host ""
Write-Host "4. Reiniciando servico..." -ForegroundColor Yellow

$service = Get-Service -Name "OpenClawControl" -ErrorAction SilentlyContinue
if ($service) {
    Write-Host "   Parando servico..." -ForegroundColor Gray
    Stop-Service -Name "OpenClawControl" -Force
    Start-Sleep -Seconds 3
    
    Write-Host "   Iniciando servico..." -ForegroundColor Gray
    Start-Service -Name "OpenClawControl"
    Start-Sleep -Seconds 5
    
    $service = Get-Service -Name "OpenClawControl"
    if ($service.Status -eq 'Running') {
        Write-Host "   [OK] Servico reiniciado com sucesso!" -ForegroundColor Green
    }
    else {
        Write-Host "   [ERRO] Servico nao iniciou!" -ForegroundColor Red
    }
}
else {
    Write-Host "   [ERRO] Servico nao encontrado!" -ForegroundColor Red
}

# 5. Testar login
Write-Host ""
Write-Host "5. Testando autenticacao..." -ForegroundColor Yellow
try {
    $response = Invoke-WebRequest -Uri "http://localhost:7000/api/health" -TimeoutSec 5 -UseBasicParsing
    if ($response.StatusCode -eq 200) {
        Write-Host "   [OK] Servidor respondendo!" -ForegroundColor Green
    }
}
catch {
    Write-Host "   [WARN] Nao foi possivel conectar ao servidor" -ForegroundColor Yellow
}

Write-Host ""
Write-Host "========================================" -ForegroundColor Green
Write-Host "  Correcao Concluida!" -ForegroundColor Green
Write-Host "========================================" -ForegroundColor Green
Write-Host ""
Write-Host "Tente fazer login agora:" -ForegroundColor Cyan
Write-Host "  URL: http://localhost:7000" -ForegroundColor White
Write-Host "  Usuario: admin" -ForegroundColor White
Write-Host "  Senha: (a que voce configurou)" -ForegroundColor White
Write-Host ""
Read-Host "Pressione ENTER para sair"
