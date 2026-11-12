# 🏢 Chatbot Condomínio - Autoatendimento WhatsApp & 2ª Via de Boletos

[![GitHub Pages](https://img.shields.io/badge/Demo%20Online-GitHub%20Pages-22c55e?style=for-the-badge&logo=github)](https://desenvoltoo.github.io/chatbot-condominio/docs/)
[![Evolution API](https://img.shields.io/badge/WhatsApp-Evolution%20API-075E54?style=for-the-badge&logo=whatsapp)](https://github.com/EvolutionAPI/evolution-api)
[![TypeScript](https://img.shields.io/badge/TypeScript-007ACC?style=for-the-badge&logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Docker](https://img.shields.io/badge/Docker-Ready-2496ED?style=for-the-badge&logo=docker&logoColor=white)](https://www.docker.com/)

Sistema inteligente de autoatendimento via **WhatsApp** desenvolvido especialmente para **administradoras de condomínios** e **síndicos profissionais**.

Elimina até **80% dos chamados repetitivos**, permitindo que os condôminos consultem débitos, copiem o **Pix Copia e Cola**, recebam a **linha digitável** e baixem o **arquivo PDF do boleto** em segundos, além de registrar ocorrências de manutenção e transferir para atendimento humano quando necessário.

---

## 🌐 Demonstração Online no GitHub Pages

Você pode experimentar o fluxo do morador no simulador web interativo hospedado no GitHub Pages:

👉 **[https://desenvoltoo.github.io/chatbot-condominio/docs/](https://desenvoltoo.github.io/chatbot-condominio/docs/)**

Nele você pode testar:
- Validação real de CPF (com cálculo de dígitos verificadores da Receita Federal).
- Entrega de boletos com linha digitável clicável, chave Pix Copia e Cola e visualizador de PDF.
- Registro de chamados com protocolo gerado automaticamente.
- Cópia com 1 clique do questionário técnico para o ERP da administradora.

---

## 🔍 Soluções de Mercado & O Que Podemos Reaproveitar

Durante o levantamento de soluções prontas para condomínios no mercado brasileiro, mapeamos 3 opções consolidadas:

| Solução | Tecnologias Envolvidas | Custo Mensal | Vantagens | Desvantagens |
| :--- | :--- | :--- | :--- | :--- |
| **Nossa Solução (Stack Aberta)** | **Node.js + Evolution API + Chatwoot + Typebot** | Baixo (Apenas VPS ~R$ 35 a R$ 60/mês) | Custo zero por mensagem, dados 100% sob controle da administradora (LGPD), sem bloqueio de fornecedor. | Requer hospedar a VPS própria. |
| **Módulos Nativos do ERP** | Superlógica (Atende), uCondo (Móra), SeuCondomínio, Siscon (ChatXP) | Taxa adicional por condomínio no plano do ERP | Já integrado com a base financeira do sistema. | Fica amarrado àquele ERP específico; menos flexível para customizações. |
| **SaaS Especializado** | Kaptia, Digisac, Beeia | R$ 400 a R$ 1.500+/mês | Implantação rápida e suporte do fornecedor. | Custo recorrente elevado que escala conforme a quantidade de condôminos. |

### 💡 Estratégia Recomendada
A melhor estratégia adotada por administradoras modernas é a **Stack Aberta**:
1. Usar a **Evolution API** (open-source) para não pagar taxas por mensagem do WhatsApp.
2. Usar o **Chatwoot** (open-source) para os atendentes humanos responderem quando o morador pedir.
3. Usar nosso **Backend Node.js** (deste repositório) para orquestrar a lógica de negócio e se conectar à API do ERP da administradora.

---

## 📋 Questionário de Integração para a Empresa do ERP

Para que a administradora consulte e emita os boletos reais de seus condomínios, preparamos um questionário técnico completo para ser encaminhado à equipe de TI / suporte do software:

📄 **[Visualizar Questionário Técnico (docs/QUESTIONARIO_ERP.md)](docs/QUESTIONARIO_ERP.md)**

---

## 🛠️ Arquitetura do Projeto

```
chatbot-condominio/
├── docs/
│   ├── index.html                 # Página interativa e simulador web do WhatsApp (GitHub Pages)
│   ├── QUESTIONARIO_ERP.md        # Questionário técnico para o fornecedor do software
│   └── ARQUITETURA_SISTEMA.md     # Especificação técnica e diagramas de sequência
├── src/
│   ├── bot/
│   │   ├── bot.orchestrator.ts    # Motor de regras, menus e respostas automáticas
│   │   └── session.manager.ts     # Gerenciador de sessões e histórico por número
│   ├── services/
│   │   ├── erp.service.ts         # Contrato da interface para conexão com qualquer ERP
│   │   ├── mock-erp.service.ts    # Provedor simulado com dados para testes imediatos
│   │   └── evolution.service.ts   # Cliente HTTP para envio de mensagens/PDFs no WhatsApp
│   ├── utils/
│   │   ├── cpf.util.ts            # Validador oficial de Dígito Verificador de CPF
│   │   └── pix.util.ts            # Formatador padrão BR Code Pix Copia e Cola
│   ├── routes/
│   │   └── webhook.routes.ts      # Endpoint receptor de webhooks da Evolution API
│   ├── config.ts                  # Centralização de variáveis de ambiente
│   ├── types/index.ts             # Tipagens completas TypeScript
│   └── index.ts                   # Ponto de entrada do servidor Express
├── docker-compose.yml             # Evolution API v2 + PostgreSQL + Redis
├── package.json
└── tsconfig.json
```

---

## 🚀 Como Executar Localmente ou em uma VPS

### 1. Clonar o Repositório
```bash
git clone https://github.com/desenvoltoo/chatbot-condominio.git
cd chatbot-condominio
```

### 2. Subir a Evolution API (WhatsApp)
```bash
docker compose up -d
```
Acesse `http://localhost:8080/manager` para criar uma instância e escanear o QR Code no WhatsApp da administradora.

### 3. Configurar Variáveis de Ambiente
Copie o arquivo `.env.example` para `.env`:
```bash
cp .env.example .env
```

### 4. Executar o Chatbot
```bash
npm install
npm run dev
```

O servidor iniciará em `http://localhost:3000`. Configure a Evolution API para enviar os webhooks para:
`http://seu-servidor:3000/webhook/evolution`

---

## ⚖️ Conformidade com a LGPD
- O sistema não expõe o CPF completo em nenhuma resposta, utilizando máscara de segurança (`***.456.789-**`).
- Somente moradores validados pelo CPF conseguem visualizar e gerar a 2ª via de suas respectivas unidades.
- Todos os logs de acesso e solicitações são auditáveis.

---

## 📄 Licença
Distribuído sob a licença MIT. Veja `LICENSE` para mais informações.
