# 🏗️ Arquitetura do Sistema de Autoatendimento Condominial

## Diagrama de Fluxo

```mermaid
sequenceDiagram
    autonumber
    actor M as Morador (WhatsApp)
    participant E as Evolution API
    participant B as Bot Orchestrator
    participant S as Session Manager
    participant ERP as ERP Service (Mock/Real)

    M->>E: "Olá, preciso do boleto deste mês"
    E->>B: Webhook (messages.upsert)
    B->>S: Obter/Criar Sessão (Número WhatsApp)
    S-->>B: Estado: NOVO_CONTATO
    B->>E: Enviar Menu Inicial + Pedido de CPF
    E->>M: "Olá! Digite seu CPF para consultar seus débitos"

    M->>E: "123.456.789-00"
    E->>B: Webhook
    B->>B: Validação de CPF (Dígitos verificadores)
    alt CPF Inválido
        B->>E: "CPF inválido. Por favor, digite novamente."
    else CPF Válido
        B->>ERP: buscarMoradorPorCpf("12345678900")
        ERP-->>B: Morador: João Silva (Condomínio Solar, Bloco B, Apt 302)
        B->>ERP: obterBoletosEmAberto(unidadeId)
        ERP-->>B: Lista com Boleto Vencimento 15/11 (R$ 680,00)
        B->>E: Enviar dados do Boleto:
        Note over B,E: 1. Linha Digitável<br/>2. Pix Copia e Cola<br/>3. Arquivo PDF anexado
        E->>M: Recebe texto + código Pix + PDF do Boleto
    end
```

## Estrutura de Pastas

- `src/index.ts`: Ponto de entrada do servidor Express.
- `src/config.ts`: Variáveis de ambiente e configuração.
- `src/types/`: Interfaces TypeScript (Mensagens, Sessões, Boletos, Moradores).
- `src/utils/`: Validadores (CPF com verificação matemática, formatadores e gerador Pix).
- `src/services/evolution.service.ts`: Comunicação HTTP com a Evolution API.
- `src/services/erp.service.ts`: Contrato de interface para provedores de ERP.
- `src/services/mock-erp.service.ts`: Provedor simulado com dados fictícios para testes imediatos.
- `src/bot/session.manager.ts`: Controle de estado e memória da conversa por telefone.
- `src/bot/bot.orchestrator.ts`: Motor de tomada de decisão e respostas automáticas.
- `src/routes/webhook.routes.ts`: Rota para receber os eventos da Evolution API.
