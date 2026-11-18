# 📋 Guia de Onboarding & Checklist de Implantação — CondoVolto AI
> **Instruções e Requisitos para Configuração do Ambiente e Construção da Base de Conhecimento RAG**

Este documento detalha **tudo o que o cliente (Administradora de Condomínios ou Síndico)** precisa fornecer para a equipe técnica parametrizar o ambiente do condomínio no **CondoVolto AI** e construir o agente com inteligência jurídica e operacional hiperprecisa (RAG).

---

## 📌 Sumário Executivo do Processo
A implantação do condomínio ocorre em **4 etapas sequenciais**:
1. **Cadastro Estrutural & Identidade:** Unidades, blocos, áreas comuns e equipe.
2. **Construção da Base de Inteligência (RAG):** Leitura semântica da Convenção e do Regimento Interno.
3. **Conexão de Canais & ERP:** WhatsApp Oficial e integração com o sistema de gestão condominial.
4. **Homologação & Ativação dos Níveis de Autonomia:** Validação com o síndico antes do lançamento aos moradores.

---

## 1. Documentos Obrigatórios para a Base de Conhecimento (RAG)
O motor de RAG (*Retrieval-Augmented Generation*) do CondoVolto AI indexa os documentos oficiais do condomínio para responder dúvidas dos moradores citando artigos exatos e evitando alucinações.

| Documento | Formato Recomendado | Para que serve no CondoVolto AI? |
| :--- | :--- | :--- |
| **Regimento Interno Atualizado** | PDF (com texto selecionável) ou Word | Regras de convivência do dia a dia: horários de mudança, limite de ruído/som, regras de animais (pets), uso de elevadores, uso de piscinas, quadras e churrasqueiras, vagas de garagem e estacionamento. |
| **Convenção Condominial Registrada** | PDF digitalizado | Normas fundamentais: fração ideal, quórum para assembleias (AGO/AGE), multas regimentais, juros de mora legais e regras estruturais de fachada. |
| **Regulamento de Uso de Áreas Comuns** | PDF ou Doc | Taxas de locação do Salão de Festas / Espaço Gourmet, antecedência mínima para reserva, regras de cancelamento e política de limpeza. |
| **Normas de Obras & Reformas** | PDF ou Doc | Horários permitidos para barulho de furadeira/martelete, exigência de ART/RRT de engenheiro/arquiteto e regras de caçamba/entulho. |
| **Atas das Últimas 3 Assembleias (AGO/AGE)** | PDF | Decisões recentes votadas (ex: proibição de Airbnb, aprovação de cota extra, taxa de pintura de fachada, eleição do síndico vigente). |

> [!TIP]
> **Dica de Formato:** PDFs gerados diretamente do computador (*PDF com texto selecionável*) têm indexação semântica 100% perfeita. Caso o cliente só tenha documentos escaneados antigos, nossa equipe utiliza OCR para extração, mas cópias digitais limpas aceleram a ativação.

---

## 2. Dados Cadastrais & Estruturais do Condomínio
Informações essenciais para cadastrar a entidade no painel:

- [ ] **Razão Social do Condomínio:** (Ex: Condomínio Residencial Jardins do Bosque)
- [ ] **CNPJ do Condomínio:**
- [ ] **Endereço Completo:** Logradouro, Número, Bairro, Cidade, Estado, CEP.
- [ ] **Estrutura Física:**
  - Quantidade total de unidades (apartamentos, salas ou lotes);
  - Quantidade e identificação de blocos/torres (ex: Bloco A, Bloco B);
  - Vagas de garagem (quantidade de vagas privativas e vagas rotativas de visitantes).
- [ ] **Lista de Áreas Comuns Reserváveis:**
  - Nome do espaço (Ex: *Salão de Festas Master*, *Espaço Gourmet Churrasqueira*, *Quadra de Beach Tennis*);
  - Valor da taxa regimental de uso (se houver);
  - Horário de funcionamento (ex: das 09h às 22h);
  - Capacidade máxima de convidados.

---

## 3. Conexão do Canal WhatsApp (Portaria & Atendimento)
Para o CondoVolto AI atender os moradores 24/7 via WhatsApp oficial:

- [ ] **Número de WhatsApp Dedicado:**
  - Fornecer um número de telefone fixo ou chip móvel exclusivo para o condomínio/administradora.
  - *Recomendação:* Não utilizar o WhatsApp pessoal do síndico ou de funcionários para garantir que o histórico pertença ao condomínio.
- [ ] **Forma de Conexão:**
  - **Opção A (QR Code Rápido):** O responsável lê o QR Code gerado no painel do CondoVolto AI diretamente pelo WhatsApp do aparelho (ativação em 2 minutos).
  - **Opção B (WhatsApp Cloud API Oficial da Meta):** Para grandes condomínios com selo verde, fornecer o ID da conta do WhatsApp Business e Token da Meta.

---

## 4. Integração com o ERP Condominial & Dados Financeiros
Para automação de boletos, emissão de Pix Copia e Cola instantâneo e conciliação bancária:

- [ ] **Qual é o ERP de Gestão Condominial utilizado?**
  - Ex: *Superlógica*, *Ahreas*, *Condomob*, *Alterdata*, *CondoVolto ERP Nativo* ou outro.
- [ ] **Chaves de Acesso / API do ERP:**
  - URL Base da API do ERP;
  - Chave de Integração / Token de Acesso da Administradora (*API Token / Access Token*);
  - ID da Empresa ou ID do Condomínio no ERP.
- [ ] **Instituição Bancária para Baixa Automática de Pix:**
  - Banco emissor das cotas (ex: Banco Inter, Santander, Itaú, Bradesco, Sicoob, Sicredi, Cora);
  - Chave Pix oficial do condomínio (CNPJ ou Chave Aleatória EVP cadastrada na conta).

---

## 5. Parâmetros de Cobrança & Alçadas de Decisão (Governança)
Para calibrar os 3 Níveis de Autonomia da Inteligência Artificial:

| Parâmetro | Padrão Recomendado | Valor Escolhido pelo Condomínio |
| :--- | :--- | :--- |
| **Multa por atraso de cota** | 2,0% (conforme Código Civil Art. 1336) | `____ %` |
| **Juros moratórios mensais** | 1,0% ao mês (0,033% ao dia) | `____ %` |
| **Máximo de parcelas para acordo** | Até 6x ou até 12x | `____ parcelas` |
| **Entrada mínima para acordo de dívida** | 20% a 30% do total | `____ %` |
| **Renúncia de juros permitida à IA?** | Não (exige aprovação do síndico) | `[ ] Sim  [x] Não` |

### Alçadas de Acesso da Equipe (Quem opera o quê?):
1. **Síndico Geral:**
   - Nome completo, E-mail e WhatsApp.
   - *Poder no sistema:* Recebe alertas de Nível 2 (aprovação de acordos com desconto, notificações regimentais) e acessa relatórios executivos em PDF.
2. **Operador Financeiro (Administradora):**
   - Nome, E-mail e WhatsApp.
   - *Poder no sistema:* Acompanha régua de cobrança, conciliação de Pix e acordos firmados.
3. **Portaria / Zeladoria:**
   - Nome(s) ou perfil genérico (*Portaria 24h*).
   - *Poder no sistema:* Acesso exclusivo à leitura de QR Code de visitantes, registro de encomendas e rondas.

---

## 6. Modelo de Mensagem Pronta para Enviar ao Cliente (Copiar & Colar)

Caso precise solicitar esses dados ao síndico ou à administradora via WhatsApp ou E-mail, copie o modelo abaixo:

```text
Olá, [Nome do Síndico / Gestor]! Tudo bem?

Estamos iniciando a implantação do CondoVolto AI no [Nome do Condomínio]. Para deixarmos o assistente de inteligência artificial 100% calibrado e conectado ao seu condomínio, precisamos de alguns materiais:

📄 1. Documentos para a Inteligência Jurídica (RAG):
- Regimento Interno atualizado (PDF);
- Convenção Condominial (PDF);
- Regulamento do Salão de Festas/Espaço Gourmet (se houver);
- Atas das últimas assembleias.

📱 2. WhatsApp & Portaria:
- O número de telefone que será o canal oficial do condomínio;
- Lista de áreas comuns que podem ser reservadas pelos moradores.

🏛️ 3. Integração Financeira:
- Qual sistema ERP vocês utilizam (ex: Superlógica, Ahreas, Condomob);
- Chave de integração/token da API do ERP;
- Percentual de multa e juros padrão para cálculo de acordos.

Assim que nos enviar esses arquivos, faremos a indexação dos regulamentos e liberaremos o painel com o assistente pronto para testes! Qualquer dúvida, estamos à disposição.
```

---

> **CondoVolto AI** — Inteligência Operacional, Jurídica e Financeira para Condomínios Modernos.
