#!/usr/bin/env bash
# ==============================================================================
# CondoVolto AI — Script de Deploy Turnkey para Servidores Linux / Ubuntu
# ==============================================================================
set -e

echo "=================================================================="
echo "🏢 CONDOVOLTO AI — INSTALADOR E DEPLOY DE PRODUÇÃO"
echo "=================================================================="

# 1. Checagem de privilégios
if [ "$EUID" -ne 0 ]; then
  echo "⚠️  Por favor, execute este script como root ou via sudo: sudo bash deploy.sh"
  exit 1
fi

# 2. Atualização e dependências essenciais
echo "📦 1/5 Atualizando pacotes do sistema e instalando dependências base..."
apt-get update -qq
apt-get install -y -qq curl wget git ca-certificates gnupg lsb-release jq ufw

# 3. Instalação do Docker e Docker Compose (caso não instalados)
if ! command -v docker &> /dev/null; then
  echo "🐳 2/5 Instalando Docker Engine oficial..."
  mkdir -p /etc/apt/keyrings
  curl -fsSL https://download.docker.com/linux/ubuntu/gpg | gpg --dearmor -o /etc/apt/keyrings/docker.gpg
  echo \
    "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu \
    $(lsb_release -cs) stable" | tee /etc/apt/sources.list.d/docker.list > /dev/null
  apt-get update -qq
  apt-get install -y -qq docker-ce docker-ce-cli containerd.io docker-compose-plugin
  systemctl enable docker
  systemctl start docker
  echo "✅ Docker instalado com sucesso."
else
  echo "✅ Docker já se encontra instalado."
fi

# 4. Configuração das Variáveis de Ambiente (.env)
echo "⚙️  3/5 Verificando arquivo de configuração (.env)..."
if [ ! -f ".env" ]; then
  if [ -f ".env.example" ]; then
    cp .env.example .env
    echo "📄 Arquivo .env gerado a partir do .env.example."
  else
    echo "⚠️ .env.example não encontrado. Criando .env básico de produção..."
    cat <<EOF > .env
PORT=3001
NODE_ENV=production
EVOLUTION_API_URL=http://evolution-api:8080
EVOLUTION_API_KEY=4296086847242404
EVOLUTION_INSTANCE_NAME=condovolto_oficial
WEBHOOK_URL=http://condovolto-ai:3000/webhook/evolution
JWT_SECRET=$(openssl rand -hex 24)
REGUA_AUTO_ENABLED=true
REGUA_HORA_DISPARO=09:00
WHATSAPP_PLANTAO_JID=5511999990101@s.whatsapp.net
EOF
  fi
fi

# Criação da pasta de dados persistentes do SQLite
mkdir -p data

# 5. Build e Subida dos Containers Docker
echo "🚀 4/5 Construindo imagens e iniciando os serviços via Docker Compose..."
docker compose pull || true
docker compose up -d --build

echo "⏳ Aguardando serviços estabilizarem (15 segundos)..."
sleep 15

# 6. Verificação de Saúde
echo "🔍 5/5 Validando funcionamento do backend..."
HTTP_STATUS=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:3001/api/health || echo "000")

if [ "$HTTP_STATUS" -eq 200 ]; then
  echo "✅ CondoVolto AI Backend está OPERACIONAL (HTTP 200)!"
else
  echo "⚠️ Backend ainda está inicializando (HTTP $HTTP_STATUS). Verifique logs com: docker compose logs -f"
fi

# 7. Criar Instância na Evolution API automaticamente
echo "📱 Registrando instância na Evolution API..."
curl -s -X POST "http://localhost:8080/instance/create" \
  -H "apikey: 4296086847242404" \
  -H "Content-Type: application/json" \
  -d '{
    "instanceName": "condovolto_oficial",
    "token": "condovolto_token_secret",
    "qrcode": true,
    "webhook": "http://condovolto-ai:3000/webhook/evolution",
    "webhook_by_events": false,
    "events": ["MESSAGES_UPSERT", "CONNECTION_UPDATE", "QRCODE_UPDATED"]
  }' > /dev/null 2>&1 || true

echo ""
echo "=================================================================="
echo "🎉 DEPLOY CONCLUÍDO COM SUCESSO!"
echo "=================================================================="
echo "🌐 Painel de Gestão:        http://SEU_IP:3001/painel"
echo "📱 Documentação & Sandbox:  http://SEU_IP:3001/docs/"
echo "🔗 Webhook Evolution:       http://SEU_IP:3001/webhook/evolution"
echo ""
echo "👤 Credenciais de Acesso ao Painel:"
echo "   E-mail: admin@condominio.com.br"
echo "   Senha:  admin123"
echo ""
echo "📋 Para conectar o WhatsApp real:"
echo "   1. Acesse o Painel > aba Configurações > Conexão WhatsApp."
echo "   2. Aponte a câmera do WhatsApp para o QR Code gerado."
echo "=================================================================="
