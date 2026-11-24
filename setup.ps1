# ==============================================================================
# CondoVolto AI — Script de Inicialização Automatizada para Windows (PowerShell)
# ==============================================================================
Write-Host "==================================================================" -ForegroundColor Cyan
Write-Host "🏢 CONDOVOLTO AI — CONFIGURAÇÃO E EXECUÇÃO LOCAL (WINDOWS)" -ForegroundColor Cyan
Write-Host "==================================================================" -ForegroundColor Cyan

# 1. Checagem de Node.js
if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
    Write-Host "❌ Node.js não foi encontrado. Instale o Node.js v20+ em https://nodejs.org/" -ForegroundColor Red
    exit 1
}

# 2. Arquivo .env
if (-not (Test-Path ".env")) {
    if (Test-Path ".env.example") {
        Copy-Item ".env.example" ".env"
        Write-Host "📄 Arquivo .env criado a partir de .env.example." -ForegroundColor Green
    }
}

# 3. Instalação de Dependências
Write-Host "📦 1/3 Instalando dependências (npm install)..." -ForegroundColor Yellow
npm install --silent

# 4. Compilação TypeScript
Write-Host "⚙️ 2/3 Compilando TypeScript (npm run build)..." -ForegroundColor Yellow
npm run build

# 5. Inicialização
Write-Host "🚀 3/3 Iniciando o servidor CondoVolto AI..." -ForegroundColor Green
Write-Host "------------------------------------------------------------------" -ForegroundColor Gray
Write-Host "💻 Painel: http://localhost:3001/painel" -ForegroundColor Cyan
Write-Host "📱 Simulador: http://localhost:3001/docs/" -ForegroundColor Cyan
Write-Host "👤 Login: admin@condominio.com.br | Senha: admin123" -ForegroundColor Cyan
Write-Host "------------------------------------------------------------------" -ForegroundColor Gray
node dist/index.js
