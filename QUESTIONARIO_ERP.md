# 📋 Questionário Técnico de Integração para a Empresa do ERP

> **Finalidade**: Requisitos técnicos para integrar o chatbot WhatsApp da administradora com o software de gestão condominial.
> **Destinatário**: TI / Suporte / Gerência de Integrações do ERP.

---

### Prezado(a) responsável técnico(a),

Estamos desenvolvendo o sistema de autoatendimento WhatsApp para a administradora de condomínios.
Para homologarmos a comunicação via API com seu sistema, precisamos das seguintes definições técnicas:

---

### 1. Disponibilidade e Documentação da API
- [ ] O sistema possui **API REST** (ou Web Services) disponível para integração externa?
- [ ] Onde podemos acessar a **documentação técnica** dos endpoints (Swagger, Postman Collection ou portal do desenvolvedor)?
- [ ] A administradora já possui acesso liberado a essa API no plano contratado, ou é necessária a contratação de algum módulo adicional?

---

### 2. Autenticação e Credenciais
- [ ] Qual é o método de autenticação utilizado pela API?
  - ( ) Chave de API estática (`x-api-key` ou token de aplicativo)
  - ( ) OAuth 2.0 (Client ID / Client Secret / Bearer Token)
  - ( ) Usuário e Senha com geração de token de sessão
- [ ] Como é feito o isolamento por condomínio? (Ex: token único para a administradora com parâmetro `id_condominio` ou token individual?)

---

### 3. Consulta de Moradores e Unidades (LGPD e Autenticação)
- [ ] Existe endpoint para **buscar titular/morador pelo CPF/CNPJ**?
- [ ] O retorno informa a lista de condomínios, blocos e unidades vinculadas a esse CPF?
- [ ] É possível obter o número de telefone celular cadastrado para conferência de segurança?

---

### 4. Módulo Financeiro: Emissão de Boletos e Pix
- [ ] Existe endpoint para consultar os **boletos em aberto** (a vencer e vencidos) de uma unidade ou morador?
- [ ] Quando o boleto está vencido, a API permite:
  - ( ) Gerar uma **2ª via atualizada** com recálculo automático de juros e multa?
  - ( ) Ou retorna as instruções/dados para cálculo externo?
- [ ] O que a API retorna na consulta do boleto?
  - [ ] **Linha digitável / Código de barras** (texto para copiar e colar).
  - [ ] **Código Pix Copia e Cola** (chave dinâmica / payload EMV).
  - [ ] **Link direto do PDF** ou arquivo em **Base64** para envio no WhatsApp.
  - [ ] Data de vencimento e valor original/atualizado.

---

### 5. Outros Recursos (Reservas e Chamados)
- [ ] Existe endpoint para consultar **disponibilidade de áreas comuns** (salão de festas, churrasqueira) e realizar agendamentos?
- [ ] Existe endpoint para **abertura de ocorrências/chamados** de moradores (com envio de texto e fotos anexas)?
- [ ] É possível listar **comunicados recentes** e convocações de assembleias?

---

### 6. Ambiente de Testes (Sandbox)
- [ ] É fornecido um ambiente de testes (**Sandbox / Homologação**) com dados fictícios para desenvolvimento prévio?
- [ ] Há limite de requisições por minuto/hora (**Rate Limit**)?
- [ ] Qual é o contato direto com o suporte técnico de desenvolvedores?
