# OpenClaw Control - Windows Installer (Auto-Install Dependencies)
# Requirements: Windows 10/11
# Usage: Run as Administrator - Installs everything automatically

#Requires -Version 5.1

param(
    [string]$InstallDir = "C:\OpenClawControl",
    [string]$RepoUrl = "https://github.com/wesleiandersonti/openclaw-control.git"
)

$ErrorActionPreference = "Continue"

# Global error handler - NEVER close window without showing error
trap {
    Write-Host ""
    Write-Host "========================================" -ForegroundColor Red
    Write-Host "  ERRO CRITICO" -ForegroundColor Red
    Write-Host "========================================" -ForegroundColor Red
    Write-Host ""
    Write-Host "Erro: $_" -ForegroundColor Red
    Write-Host ""
    Write-Host "Linha: $($_.InvocationInfo.ScriptLineNumber)" -ForegroundColor Yellow
    Write-Host ""
    Write-Host "Stack: $($_.ScriptStackTrace)" -ForegroundColor Gray
    Write-Host ""
    Write-Host "========================================" -ForegroundColor Red
    Write-Host ""
    Write-Host "O instalador encontrou um erro." -ForegroundColor Yellow
    Write-Host "Verifique a mensagem acima e tente novamente." -ForegroundColor Yellow
    Write-Host ""
    Write-Host "Pressione ENTER para fechar..." -ForegroundColor Yellow -BackgroundColor Black
    Read-Host
    exit 1
}

# Configurations
$ServiceName = "OpenClawControl"
$ProjectRoot = $InstallDir
$LogDir = "$ProjectRoot\logs"
$NSSMVersion = "2.24"
$NSSMDownloadUrl = "https://nssm.cc/release/nssm-$NSSMVersion.zip"

# Global variable for local IP
$script:LocalIP = $null

# Colors for output
$Green = "Green"
$Yellow = "Yellow"
$Red = "Red"
$Cyan = "Cyan"
$White = "White"

function Write-Info($Message) {
    Write-Host "  [INFO] $Message" -ForegroundColor $White
}

function Write-OK($Message) {
    Write-Host "  [OK] $Message" -ForegroundColor $Green
}

function Write-Warn($Message) {
    Write-Host "  [WARN] $Message" -ForegroundColor $Yellow
}

function Write-Err($Message) {
    Write-Host "  [ERRO] $Message" -ForegroundColor $Red
}

function Write-Header($Message) {
    Write-Host ""
    Write-Host "========================================" -ForegroundColor $Cyan
    Write-Host "  $Message" -ForegroundColor $Cyan
    Write-Host "========================================" -ForegroundColor $Cyan
    Write-Host ""
}

# ============================================================================
# AUTO-INSTALL DEPENDENCIES
# ============================================================================

function Install-NodeJS {
    Write-Header "Instalacao Automatica - Node.js"
    Write-Info "Node.js nao encontrado. Iniciando instalacao automatica..."
    
    try {
        # Try winget first
        $wingetExists = Get-Command winget -ErrorAction SilentlyContinue
        if ($wingetExists) {
            Write-Info "Instalando Node.js via winget..."
            Write-Info "Isso pode levar alguns minutos..."
            
            # Install Node.js LTS
            $process = Start-Process -FilePath "winget" -ArgumentList "install", "OpenJS.NodeJS.LTS", "--accept-source-agreements", "--accept-package-agreements", "-e" -Wait -PassThru
            
            if ($process.ExitCode -eq 0) {
                # Refresh environment variables
                $env:Path = [System.Environment]::GetEnvironmentVariable("Path", "Machine") + ";" + [System.Environment]::GetEnvironmentVariable("Path", "User")
                
                # Verify installation
                if (Test-NodeVersion) {
                    Write-OK "Node.js $(node --version) instalado com sucesso"
                    return $true
                }
            }
        }
        
        # Fallback: Download and install manually
        Write-Info "Baixando Node.js..."
        $nodeUrl = "https://nodejs.org/dist/v20.11.0/node-v20.11.0-x64.msi"
        $nodeInstaller = "$env:TEMP\nodejs-installer.msi"
        
        Invoke-WebRequest -Uri $nodeUrl -OutFile $nodeInstaller -UseBasicParsing
        
        Write-Info "Instalando Node.js..."
        $process = Start-Process -FilePath "msiexec.exe" -ArgumentList "/i", $nodeInstaller, "/qn", "/norestart" -Wait -PassThru
        
        if ($process.ExitCode -eq 0) {
            # Refresh environment
            $env:Path = [System.Environment]::GetEnvironmentVariable("Path", "Machine") + ";" + [System.Environment]::GetEnvironmentVariable("Path", "User")
            
            if (Test-NodeVersion) {
                Write-OK "Node.js $(node --version) instalado com sucesso"
                return $true
            }
        }
        
        throw "Falha na instalacao do Node.js"
    }
    catch {
        Write-Err "Falha ao instalar Node.js automaticamente: $_"
        Write-Info "Por favor, instale manualmente:"
        Write-Info "1. Acesse: https://nodejs.org/"
        Write-Info "2. Baixe a versao LTS (v20 ou superior)"
        Write-Info "3. Execute o instalador"
        Write-Info "4. Reinicie o PowerShell e execute este script novamente"
        Read-Host "Pressione ENTER para sair"
        exit 1
    }
}

function Install-Git {
    Write-Header "Instalacao Automatica - Git"
    Write-Info "Git nao encontrado. Iniciando instalacao automatica..."
    
    try {
        # Try winget first
        $wingetExists = Get-Command winget -ErrorAction SilentlyContinue
        if ($wingetExists) {
            Write-Info "Instalando Git via winget..."
            Write-Info "Isso pode levar alguns minutos..."
            
            $process = Start-Process -FilePath "winget" -ArgumentList "install", "Git.Git", "--accept-source-agreements", "--accept-package-agreements", "-e" -Wait -PassThru
            
            if ($process.ExitCode -eq 0) {
                # Refresh environment
                $env:Path = [System.Environment]::GetEnvironmentVariable("Path", "Machine") + ";" + [System.Environment]::GetEnvironmentVariable("Path", "User")
                
                if (Test-GitInstalled) {
                    Write-OK "Git $(git --version) instalado com sucesso"
                    return $true
                }
            }
        }
        
        # Fallback: Download and install manually
        Write-Info "Baixando Git..."
        $gitUrl = "https://github.com/git-for-windows/git/releases/download/v2.43.0.windows.1/Git-2.43.0-64-bit.exe"
        $gitInstaller = "$env:TEMP\git-installer.exe"
        
        Invoke-WebRequest -Uri $gitUrl -OutFile $gitInstaller -UseBasicParsing
        
        Write-Info "Instalando Git..."
        $process = Start-Process -FilePath $gitInstaller -ArgumentList "/VERYSILENT", "/NORESTART", "/NOCANCEL" -Wait -PassThru
        
        if ($process.ExitCode -eq 0) {
            # Refresh environment
            $env:Path = [System.Environment]::GetEnvironmentVariable("Path", "Machine") + ";" + [System.Environment]::GetEnvironmentVariable("Path", "User")
            
            if (Test-GitInstalled) {
                Write-OK "Git instalado com sucesso"
                return $true
            }
        }
        
        throw "Falha na instalacao do Git"
    }
    catch {
        Write-Err "Falha ao instalar Git automaticamente: $_"
        Write-Info "Por favor, instale manualmente:"
        Write-Info "1. Acesse: https://git-scm.com/download/win"
        Write-Info "2. Baixe e execute o instalador"
        Write-Info "3. Reinicie o PowerShell e execute este script novamente"
        Read-Host "Pressione ENTER para sair"
        exit 1
    }
}

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

# ============================================================================
# PASSWORD AND SECURITY FUNCTIONS
# ============================================================================

function Get-SecurePassword {
    Write-Header "Configuracao de Senha do Administrador"
    Write-Host "Digite a senha do usuario admin (nao sera exibida)" -ForegroundColor Yellow
    Write-Host ""
    
    do {
        # Get password (no echo)
        $password1 = Read-Host "  Senha" -AsSecureString
        
        # Check if empty
        $BSTR1 = [System.Runtime.InteropServices.Marshal]::SecureStringToBSTR($password1)
        $plain1 = [System.Runtime.InteropServices.Marshal]::PtrToStringAuto($BSTR1)
        [System.Runtime.InteropServices.Marshal]::ZeroFreeBSTR($BSTR1)
        
        if ([string]::IsNullOrWhiteSpace($plain1)) {
            Write-Err "Senha nao pode ser vazia. Tente novamente."
            Write-Host ""
            continue
        }
        
        if ($plain1.Length -lt 6) {
            Write-Err "Senha deve ter no minimo 6 caracteres. Tente novamente."
            Write-Host ""
            continue
        }
        
        # Confirm password
        $password2 = Read-Host "  Confirme a senha" -AsSecureString
        
        $BSTR2 = [System.Runtime.InteropServices.Marshal]::SecureStringToBSTR($password2)
        $plain2 = [System.Runtime.InteropServices.Marshal]::PtrToStringAuto($BSTR2)
        [System.Runtime.InteropServices.Marshal]::ZeroFreeBSTR($BSTR2)
        
        if ($plain1 -ne $plain2) {
            Write-Err "As senhas nao coincidem. Tente novamente."
            Write-Host ""
        }
        else {
            Write-OK "Senha configurada com sucesso"
            return $plain1
        }
    } while ($true)
}

function Get-PasswordHash($PlainPassword) {
    Write-Info "Gerando hash bcrypt da senha (criptografia segura)..."
    
    try {
        # Use Node.js to generate bcrypt hash
        $hashScript = @"
const bcrypt = require('bcrypt');
const hash = bcrypt.hashSync('$PlainPassword', 12);
console.log(hash);
"@
        
        $hash = $hashScript | node
        $hash = $hash.Trim()
        
        if ($hash -and $hash.StartsWith('$2')) {
            Write-OK "Hash gerado com sucesso"
            return $hash
        }
        else {
            throw "Hash invalido"
        }
    }
    catch {
        Write-Err "Falha ao gerar hash: $_"
        Write-Info "Tentando metodo alternativo..."
        
        # Fallback
        $bytes = [System.Text.Encoding]::UTF8.GetBytes($PlainPassword)
        $sha256 = [System.Security.Cryptography.SHA256]::Create()
        $hashBytes = $sha256.ComputeHash($bytes)
        return [Convert]::ToBase64String($hashBytes)
    }
}

function Generate-SecureSecrets {
    Write-Info "Gerando segredos criptograficos seguros..."
    
    # JWT_ACCESS_SECRET - 64 bytes = 512 bits
    $accessBytes = New-Object byte[] 64
    $rng1 = [System.Security.Cryptography.RandomNumberGenerator]::Create()
    $rng1.GetBytes($accessBytes)
    $rng1.Dispose()
    $jwtAccess = [Convert]::ToBase64String($accessBytes)
    
    # JWT_REFRESH_SECRET - 64 bytes = 512 bits
    $refreshBytes = New-Object byte[] 64
    $rng2 = [System.Security.Cryptography.RandomNumberGenerator]::Create()
    $rng2.GetBytes($refreshBytes)
    $rng2.Dispose()
    $jwtRefresh = [Convert]::ToBase64String($refreshBytes)
    
    # KEY_ENC_MASTER_B64 - 32 bytes = 256 bits
    $masterBytes = New-Object byte[] 32
    $rng3 = [System.Security.Cryptography.RandomNumberGenerator]::Create()
    $rng3.GetBytes($masterBytes)
    $rng3.Dispose()
    $masterKey = [Convert]::ToBase64String($masterBytes)
    
    Write-OK "Segredos gerados com sucesso (RNG crypto seguro)"
    
    return @{
        JWT_ACCESS_SECRET = $jwtAccess
        JWT_REFRESH_SECRET = $jwtRefresh
        KEY_ENC_MASTER_B64 = $masterKey
    }
}

# ============================================================================
# NETWORK FUNCTIONS
# ============================================================================

function Get-LocalIP {
    Write-Info "Detectando IP da rede local..."
    
    try {
        # Get all network adapters
        $adapters = Get-NetIPAddress -AddressFamily IPv4 -ErrorAction SilentlyContinue | 
            Where-Object { 
                $_.IPAddress -ne '127.0.0.1' -and 
                $_.IPAddress -notlike '169.254.*' -and
                ($_.PrefixOrigin -eq 'Dhcp' -or $_.PrefixOrigin -eq 'Manual')
            }
        
        # Prefer Ethernet, then Wi-Fi
        $preferred = $adapters | Where-Object { 
            $interface = Get-NetAdapter -InterfaceIndex $_.InterfaceIndex -ErrorAction SilentlyContinue
            $interface.Name -like '*Ethernet*' -or $interface.Name -like '*Wi-Fi*' -or $interface.Name -like '*Wireless*'
        } | Select-Object -First 1
        
        if ($preferred) {
            $script:LocalIP = $preferred.IPAddress
            Write-OK "IP detectado: $script:LocalIP"
            return $script:LocalIP
        }
        
        # Fallback: any valid IP
        if ($adapters) {
            $script:LocalIP = $adapters[0].IPAddress
            Write-OK "IP detectado: $script:LocalIP"
            return $script:LocalIP
        }
        
        # Last resort
        $script:LocalIP = (Get-NetIPAddress -AddressFamily IPv4 | Where-Object {$_.IPAddress -ne '127.0.0.1'} | Select-Object -First 1).IPAddress
        if ($script:LocalIP) {
            Write-OK "IP detectado: $script:LocalIP"
        }
        else {
            $script:LocalIP = "127.0.0.1"
            Write-Warn "Nao foi possivel detectar IP automatico. Usando localhost."
        }
        
        return $script:LocalIP
    }
    catch {
        $script:LocalIP = "127.0.0.1"
        Write-Warn "Erro ao detectar IP: $_. Usando localhost."
        return $script:LocalIP
    }
}

# ============================================================================
# ENV FILE CREATION
# ============================================================================

function New-EnvFile($Path, $PasswordHash, $Secrets) {
    Write-Info "Criando arquivo de configuracao .env..."
    
    $envContent = @"
# OpenClaw Control - Configuracao Automatica
# Gerado em: $(Get-Date -Format "yyyy-MM-dd HH:mm:ss")
# NAO COMPARTILHE ESTE ARQUIVO

# Ambiente
NODE_ENV=production
PORT=7000

# Seguranca - JWT Tokens
JWT_ACCESS_SECRET=$($Secrets.JWT_ACCESS_SECRET)
JWT_REFRESH_SECRET=$($Secrets.JWT_REFRESH_SECRET)
JWT_ACCESS_TTL_MIN=15
JWT_REFRESH_TTL_DAYS=7

# Seguranca - Criptografia
KEY_ENC_MASTER_B64=$($Secrets.KEY_ENC_MASTER_B64)

# Banco de Dados
DB_PATH=./data/app.db

# Administrador
ADMIN_USER=admin
ADMIN_PASS_HASH=$PasswordHash

# Configuracoes
OPENCLAW_URL=http://127.0.0.1:18789
CORS_ORIGIN=http://localhost:7000
"@
    
    $envContent | Out-File -FilePath $Path -Encoding UTF8 -Force
    Write-OK "Arquivo .env criado com segredos e senha configurados"
}

# ============================================================================
# FINAL OUTPUT
# ============================================================================

function Show-FinalResult($IsUpdate, $ServiceStatus) {
    Write-Host ""
    Write-Host "========================================" -ForegroundColor Green
    Write-Host "   OpenClaw Control - Instalado com Sucesso" -ForegroundColor Green
    Write-Host "========================================" -ForegroundColor Green
    Write-Host ""
    
    Write-Host "ACESSO LOCAL:" -ForegroundColor Cyan
    Write-Host "  http://localhost:7000" -ForegroundColor Green
    Write-Host ""
    
    Write-Host "ACESSO NA REDE:" -ForegroundColor Cyan
    if ($script:LocalIP -and $script:LocalIP -ne "127.0.0.1") {
        Write-Host "  http://$($script:LocalIP):7000" -ForegroundColor Green
    }
    else {
        Write-Host "  (Nao disponivel - apenas localhost)" -ForegroundColor Yellow
    }
    Write-Host ""
    
    Write-Host "SERVICO WINDOWS:" -ForegroundColor Cyan
    Write-Host "  Nome: $ServiceName"
    Write-Host "  Status: $ServiceStatus" -ForegroundColor $(if ($ServiceStatus -eq 'Running') { $Green } else { $Yellow })
    Write-Host ""
    
    Write-Host "USUARIO ADMIN:" -ForegroundColor Cyan
    Write-Host "  Usuario: admin" -ForegroundColor White
    Write-Host "  Senha: (configurada durante instalacao)" -ForegroundColor White
    Write-Host ""
    
    Write-Host "========================================" -ForegroundColor Green
    Write-Host ""
    Write-Host "Pressione ENTER para finalizar..." -ForegroundColor Yellow
    Read-Host
}

# ============================================================================
# SERVICE MANAGEMENT
# ============================================================================

function Test-ServiceExists {
    return (Get-Service -Name $ServiceName -ErrorAction SilentlyContinue) -ne $null
}

function Stop-OpenClawService {
    if (Test-ServiceExists) {
        Write-Info "Parando servico $ServiceName..."
        try {
            Stop-Service -Name $ServiceName -Force -ErrorAction Stop
            Start-Sleep -Seconds 3
            Write-OK "Servico parado"
        }
        catch {
            Write-Warn "Nao foi possivel parar o servico: $_"
        }
    }
}

function Start-OpenClawService {
    if (Test-ServiceExists) {
        Write-Info "Iniciando servico $ServiceName..."
        try {
            Start-Service -Name $ServiceName
            Start-Sleep -Seconds 5
            
            $service = Get-Service -Name $ServiceName
            if ($service.Status -eq 'Running') {
                Write-OK "Servico iniciado com sucesso"
                return 'Running'
            }
            else {
                Write-Warn "Servico nao esta em execucao. Verifique os logs em $LogDir"
                return $service.Status
            }
        }
        catch {
            Write-Err "Falha ao iniciar servico: $_"
            return 'Error'
        }
    }
    return 'NotInstalled'
}

function Install-WindowsService {
    Write-Header "Configurando Servico Windows"
    
    $nssmPath = "$ProjectRoot\nssm\nssm.exe"
    
    # Download NSSM if needed
    if (-not (Test-Path $nssmPath)) {
        Write-Info "Baixando NSSM (Non-Sucking Service Manager)..."
        try {
            $nssmDir = "$ProjectRoot\nssm"
            New-Item -ItemType Directory -Path $nssmDir -Force | Out-Null
            
            $nssmZip = "$env:TEMP\nssm-$NSSMVersion.zip"
            [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
            
            Write-Info "Fazendo download do NSSM..."
            Invoke-WebRequest -Uri $NSSMDownloadUrl -OutFile $nssmZip -UseBasicParsing
            
            if (-not (Test-Path $nssmZip)) {
                throw "Download falhou - arquivo nao encontrado"
            }
            
            Write-Info "Extraindo NSSM..."
            Expand-Archive -Path $nssmZip -DestinationPath "$env:TEMP\nssm-extract" -Force
            
            $win32Exe = Get-ChildItem -Path "$env:TEMP\nssm-extract" -Recurse -Filter "nssm.exe" | 
                Where-Object { $_.DirectoryName -like "*win32*" } |
                Select-Object -First 1
            
            if (-not $win32Exe) {
                # Try without win32 filter
                $win32Exe = Get-ChildItem -Path "$env:TEMP\nssm-extract" -Recurse -Filter "nssm.exe" | 
                    Select-Object -First 1
            }
            
            if ($win32Exe) {
                Write-Info "Copiando nssm.exe para $nssmDir..."
                Copy-Item -Path $win32Exe.FullName -Destination $nssmDir -Force
                Remove-Item -Path $nssmZip -Force -ErrorAction SilentlyContinue
                Remove-Item -Path "$env:TEMP\nssm-extract" -Recurse -Force -ErrorAction SilentlyContinue
                Write-OK "NSSM instalado em $nssmPath"
            }
            else {
                throw "nssm.exe nao encontrado no arquivo zip"
            }
        }
        catch {
            Write-Err "Falha ao instalar NSSM: $_"
            Write-Info "Tentando continuar sem NSSM (modo manual)..."
            return 'NotInstalled'
        }
    }
    else {
        Write-OK "NSSM ja existe em $nssmPath"
    }
    
    # Verify NSSM exists
    if (-not (Test-Path $nssmPath)) {
        Write-Err "NSSM nao encontrado em $nssmPath"
        return 'NotInstalled'
    }
    
    # Check if service already exists
    if (Test-ServiceExists) {
        Write-Info "Servico ja existe, apenas reiniciando..."
        return (Start-OpenClawService)
    }
    
    Write-Info "Criando novo servico $ServiceName..."
    
    # Create log directory
    New-Item -ItemType Directory -Path $LogDir -Force | Out-Null
    
    $nodeExe = (Get-Command node).Source
    Write-Info "Node.js encontrado em: $nodeExe"
    Write-Info "Diretorio do projeto: $ProjectRoot"
    Write-Info "Arquivo de entrada: $ProjectRoot\src\server.js"
    
    try {
        # Install service using NSSM
        Write-Info "Registrando servico no Windows..."
        $installOutput = & $nssmPath install $ServiceName $nodeExe "$ProjectRoot\src\server.js" 2>&1
        if ($LASTEXITCODE -ne 0) {
            throw "Falha ao registrar servico: $installOutput"
        }
        Write-OK "Servico registrado"
        
        # Configure service parameters
        Write-Info "Configurando parametros do servico..."
        
        $params = @(
            @{name="AppDirectory"; value=$ProjectRoot},
            @{name="AppRestartDelay"; value="5000"},
            @{name="AppStdout"; value="$LogDir\stdout.log"},
            @{name="AppStderr"; value="$LogDir\stderr.log"},
            @{name="AppRotateFiles"; value="1"},
            @{name="AppRotateOnline"; value="1"},
            @{name="AppRotateSeconds"; value="86400"},
            @{name="AppRotateBytes"; value="10485760"},
            @{name="Start"; value="SERVICE_AUTO_START"}
        )
        
        foreach ($param in $params) {
            $output = & $nssmPath set $ServiceName $param.name $param.value 2>&1
            if ($LASTEXITCODE -ne 0) {
                Write-Warn "Falha ao configurar $($param.name): $output"
            }
        }
        
        Write-OK "Parametros configurados"
        
        # Verify service was created
        Start-Sleep -Seconds 2
        if (Test-ServiceExists) {
            Write-OK "Servico $ServiceName criado com sucesso"
            return (Start-OpenClawService)
        }
        else {
            throw "Servico nao aparece na lista apos criacao"
        }
    }
    catch {
        Write-Err "Erro ao criar servico: $_"
        Write-Info "Verificando logs..."
        
        # Show error details
        if (Test-Path "$LogDir\stderr.log") {
            Write-Info "Conteudo do log de erros:"
            Get-Content "$LogDir\stderr.log" -Tail 10 | ForEach-Object {
                Write-Host "    $_" -ForegroundColor Gray
            }
        }
        
        return 'NotInstalled'
    }
}

# ============================================================================
# INSTALLATION MODES
# ============================================================================

function Update-Application {
    Write-Header "Modo UPDATE - Atualizando OpenClaw Control"
    
    Set-Location $ProjectRoot
    
    # Stop service
    Stop-OpenClawService
    
    # Backup .env
    if (Test-Path "$ProjectRoot\.env") {
        Copy-Item "$ProjectRoot\.env" "$ProjectRoot\.env.backup" -Force
        Write-Info "Backup do .env criado"
    }
    
    # Git pull
    Write-Info "Atualizando codigo-fonte..."
    try {
        $gitOutput = git pull origin main 2>&1
        if ($LASTEXITCODE -ne 0) {
            throw "Git pull falhou: $gitOutput"
        }
        Write-OK "Codigo atualizado"
    }
    catch {
        Write-Err "Falha ao atualizar codigo: $_"
        exit 1
    }
    
    # npm install
    Write-Info "Atualizando dependencias..."
    try {
        npm install --production 2>&1 | ForEach-Object {
            Write-Host "    $_" -ForegroundColor Gray
        }
        if ($LASTEXITCODE -ne 0) {
            throw "npm install falhou"
        }
        Write-OK "Dependencias atualizadas"
    }
    catch {
        Write-Err "Falha ao atualizar dependencias: $_"
        exit 1
    }
    
    # Restore .env if needed
    if (-not (Test-Path "$ProjectRoot\.env")) {
        if (Test-Path "$ProjectRoot\.env.backup") {
            Move-Item "$ProjectRoot\.env.backup" "$ProjectRoot\.env" -Force
            Write-OK ".env restaurado do backup"
        }
    }
    else {
        Remove-Item "$ProjectRoot\.env.backup" -Force -ErrorAction SilentlyContinue
    }
    
    Write-OK "Atualizacao concluida com sucesso!"
}

function Install-NewApplication($PasswordHash, $Secrets) {
    Write-Header "Instalacao Nova - OpenClaw Control"
    
    # Create directory
    Write-Info "Criando diretorio $InstallDir..."
    New-Item -ItemType Directory -Path $InstallDir -Force | Out-Null
    Set-Location $InstallDir
    
    # Clone repository
    Write-Info "Clonando repositorio..."
    try {
        git clone $RepoUrl . 2>&1 | Out-Null
        if ($LASTEXITCODE -ne 0) {
            throw "Git clone falhou"
        }
        Write-OK "Repositorio clonado"
    }
    catch {
        Write-Err "Falha ao clonar: $_"
        exit 1
    }
    
    # npm install
    Write-Info "Instalando dependencias..."
    try {
        npm install --production 2>&1 | ForEach-Object {
            Write-Host "    $_" -ForegroundColor Gray
        }
        if ($LASTEXITCODE -ne 0) {
            throw "npm install falhou"
        }
        Write-OK "Dependencias instaladas"
    }
    catch {
        Write-Err "Falha ao instalar dependencias: $_"
        exit 1
    }
    
    # Create .env
    New-EnvFile -Path "$ProjectRoot\.env" -PasswordHash $PasswordHash -Secrets $Secrets
    
    # Create service
    return (Install-WindowsService)
}

# ============================================================================
# MAIN - WITH ERROR HANDLING
# ============================================================================

try {
    # Check admin
    if (-not ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
        Write-Err "Este script deve ser executado como ADMINISTRADOR"
        Write-Info "Clique com botao direito no PowerShell e selecione 'Executar como Administrador'"
        Read-Host "Pressione ENTER para sair"
        exit 1
    }

    Clear-Host
    Write-Header "OpenClaw Control - Instalador Windows (Auto-Install)"
    Write-Info "Iniciando instalacao..."
    Write-Info "Este processo pode levar 5-10 minutos"
    Write-Host ""

    # Check and install Node.js
    Write-Info "Verificando Node.js..."
    if (-not (Test-NodeVersion)) {
        Write-Warn "Node.js nao encontrado - Instalando automaticamente..."
        Install-NodeJS
    }
    else {
        Write-OK "Node.js $(node --version) encontrado"
    }

    # Check and install Git
    Write-Info "Verificando Git..."
    if (-not (Test-GitInstalled)) {
        Write-Warn "Git nao encontrado - Instalando automaticamente..."
        Install-Git
    }
    else {
        Write-OK "Git $(git --version) encontrado"
    }

    # Detect local IP
    Get-LocalIP

    # Check existing installation
    $isUpdate = $false
    if (Test-Path $ProjectRoot) {
        Write-Info "Diretorio $ProjectRoot existe"
        
        if (Test-Path "$ProjectRoot\.git") {
            Write-OK "Instalacao existente detectada - Modo UPDATE"
            $isUpdate = $true
        }
        else {
            Write-Warn "Diretorio existe mas nao e uma instalacao OpenClaw Control"
            $response = Read-Host "Deseja instalar mesmo assim? (S/N) [N]"
            if ($response -ne 'S' -and $response -ne 's') {
                Write-Info "Instalacao cancelada"
                Read-Host "Pressione ENTER para sair"
                exit 0
            }
        }
    }

    # Execute installation or update
    if ($isUpdate) {
        Update-Application
        $serviceStatus = (Start-OpenClawService)
        Show-FinalResult -IsUpdate $true -ServiceStatus $serviceStatus
    }
    else {
        # Get admin password
        $plainPassword = Get-SecurePassword
        
        # Generate hash
        $passwordHash = Get-PasswordHash -PlainPassword $plainPassword
        
        # Clear password from memory
        $plainPassword = $null
        [System.GC]::Collect()
        
        # Generate secrets
        $secrets = Generate-SecureSecrets
        
        # Install
        $serviceStatus = Install-NewApplication -PasswordHash $passwordHash -Secrets $secrets
        
        # Show final result
        Show-FinalResult -IsUpdate $false -ServiceStatus $serviceStatus
    }
}
catch {
    Write-Host ""
    Write-Host "========================================" -ForegroundColor Red
    Write-Host "  ERRO DURANTE INSTALACAO" -ForegroundColor Red
    Write-Host "========================================" -ForegroundColor Red
    Write-Host ""
    Write-Host "Mensagem: $_" -ForegroundColor Red
    Write-Host ""
    Write-Host "Detalhes do erro salvos acima." -ForegroundColor Yellow
    Write-Host ""
}
finally {
    # ALWAYS show final message and wait
    Write-Host ""
    Write-Host "========================================" -ForegroundColor Cyan
    Write-Host "  Instalador Finalizado" -ForegroundColor Cyan
    Write-Host "========================================" -ForegroundColor Cyan
    Write-Host ""
    Write-Host "Pressione ENTER para fechar esta janela..." -ForegroundColor Yellow -BackgroundColor Black
    Read-Host
}
