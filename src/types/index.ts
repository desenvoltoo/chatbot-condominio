export type SessionState =
  | 'INICIO'
  | 'AGUARDANDO_CPF'
  | 'MENU_PRINCIPAL'
  | 'ESCOLHENDO_BOLETO'
  | 'AGUARDANDO_DESCRICAO_OCORRENCIA'
  | 'SIMULANDO_ACORDO'
  | 'CONFIRMANDO_ACORDO'
  | 'RESERVANDO_AREA'
  | 'ATENDIMENTO_HUMANO';

export interface Unidade {
  id: string;
  condominioNome: string;
  bloco?: string;
  numero: string;
}

export interface Boleto {
  id: string;
  unidadeId: string;
  mesReferencia: string;
  vencimento: string;
  valor: number;
  linhaDigitavel: string;
  codigoPix: string;
  pdfUrl: string;
  status: 'aberto' | 'vencido' | 'pago';
}

export interface Morador {
  id: string;
  nome: string;
  cpf: string;
  telefone: string;
  unidades: Unidade[];
}

export interface Ocorrencia {
  id: string;
  moradorId: string;
  categoria: string;
  descricao: string;
  dataCriacao: string;
  status: 'aberta' | 'em_analise' | 'resolvida';
}

export interface Comunicado {
  id: string;
  condominioId: string;
  condominioNome: string;
  titulo: string;
  conteudo: string;
  data: string;
  categoria: 'manutencao' | 'assembleia' | 'geral' | 'urgente';
  autor: string;
  publico?: string;
  disparadoWhatsapp?: boolean;
}

export interface Carteira {
  id: string;
  nome: string;
  descricao?: string;
  cor?: string;
  operadorResponsavelId?: string;
  operadorResponsavelNome?: string;
  tipo?: 'contatos' | 'grupos' | 'misto';
  criadoEm?: number;
  totalConversas?: number;
}

export interface ChatMessage {
  id: string;
  sender: 'user' | 'bot' | 'operator' | 'system';
  senderName?: string;
  senderRole?: 'morador' | 'operador' | 'bot' | 'sistema' | 'sindico';
  operatorId?: string;
  text: string;
  timestamp: string;
  mediaUrl?: string;
  mediaType?: 'pdf' | 'image' | 'audio';
  read?: boolean;
  pixCode?: string;
  isAudio?: boolean | number;
  duration?: string;
  audioSummary?: string;
  audioTranscription?: string;
}

export interface UserSession {
  remoteJid: string; // ex: 5511999999999@s.whatsapp.net
  pushName?: string;
  state: SessionState;
  cpf?: string;
  cpfFormatted?: string;
  telefone?: string;
  avatar?: string;
  morador?: Morador;
  selectedUnidadeId?: string;
  boletosDisponiveis?: Boleto[];
  tempData?: Record<string, any>;
  lastInteraction: Date;
  messages?: ChatMessage[];
  npsRating?: number;
  isHumanHandoff?: boolean;
  status?: 'waiting_human' | 'in_service' | 'ai' | 'closed';
  assignedOperator?: string;
  assignedOperatorId?: string;
  carteiraId?: string;
  carteiraNome?: string;
  isGroup?: boolean;
  slaStartedAt?: string;
  statusFinanceiro?: 'regular' | 'inadimplente' | 'acordo_ativo';
  statusFinanceiroLabel?: string;
  statusFinanceiroBadgeClass?: string;
  cotaLabel?: string;
  cotaValor?: string;
  cotaVenc?: string;
  splitAdm?: string;
  pixValor?: string;
  notasInternas?: string[];
}

export interface WebhookMessage {
  event: string;
  instance: string;
  data: {
    key: {
      remoteJid: string;
      fromMe: boolean;
      id: string;
    };
    pushName?: string;
    message?: {
      conversation?: string;
      extendedTextMessage?: {
        text?: string;
      };
      buttonsResponseMessage?: {
        selectedButtonId?: string;
      };
      listResponseMessage?: {
        singleSelectReply?: {
          selectedRowId?: string;
        };
      };
    };
  };
}

export interface AcordoOpcao {
  parcelas: number;
  valorEntrada: number;
  valorParcela: number;
  totalGeral: number;
  descontoAplicado: number;
  descricao: string;
}

export interface AcordoSimulacao {
  unidadeId: string;
  moradorNome: string;
  totalPrincipal: number;
  multa: number;
  juros: number;
  correcaoMonetaria: number;
  totalConsolidado: number;
  boletosNegociados: string[];
  opcoes: AcordoOpcao[];
}

export interface AcordoEfetivado {
  id: string;
  unidadeId: string;
  moradorCpf: string;
  moradorNome: string;
  dataAcordo: string;
  totalDivida: number;
  qtdParcelas: number;
  valorEntrada: number;
  valorParcela: number;
  status: 'ativo' | 'cumprido' | 'quebrado';
  boletosGerados: Boleto[];
  termoUrl?: string;
}

export interface AreaComum {
  id: string;
  condominioId: string;
  condominioNome: string;
  nome: string;
  capacidade: number;
  taxaUso: number;
  taxaLimpeza: number;
  horarioFuncionamento: string;
  fotos: string[];
  regras: string[];
}

export interface Reserva {
  id: string;
  areaId: string;
  areaNome: string;
  unidadeId: string;
  moradorNome: string;
  moradorTelefone: string;
  remoteJid?: string;
  dataReserva: string;
  periodo: string;
  convidadosQtd: number;
  taxaTotal: number;
  status: 'confirmada' | 'pendente_aprovacao' | 'recusada' | 'cancelada';
  statusCobranca: 'faturado_proximo_boleto' | 'pago_antecipado' | 'isento';
  cobrancaId?: string;
  protocoloSiscon: string;
  criadoEm?: string;
}

export interface Cobranca {
  id: string;
  unidadeId: string;
  moradorNome: string;
  moradorTelefone?: string;
  remoteJid?: string;
  tipo: 'cota_condominial' | 'taxa_reserva' | 'acordo' | 'multa';
  competencia: string;
  vencimento: string;
  valor: number;
  linhaDigitavel?: string;
  txid: string;
  pixCopiaECola: string;
  status: 'aberto' | 'pago' | 'vencido' | 'cancelado';
  pagoEm?: string;
  formaPagamento?: 'pix' | 'boleto' | 'transferencia';
  comprovanteId?: string;
  splitCondominio: number;
  splitAdministradora: number;
  criadoEm: string;
}

export interface OrdemManutencao {
  id: string;
  codigo: string; // ex: 'OS-2026-088'
  titulo: string;
  descricao?: string;
  categoria: 'eletrica' | 'hidraulica' | 'portoes' | 'elevadores' | 'pintura' | 'civil' | 'seguranca';
  localizacao: string;
  urgencia: 'baixa' | 'media' | 'alta' | 'urgente';
  status: 'pendente' | 'em_andamento' | 'concluido' | 'cancelado';
  solicitanteNome: string;
  solicitanteUnidade?: string;
  solicitanteTelefone?: string;
  remoteJid?: string;
  responsavelNome?: string;
  responsavelTelefone?: string;
  custoEstimado?: number;
  custoReal?: number;
  fotoAntesUrl?: string;
  fotoDepoisUrl?: string;
  observacoes?: string;
  criadoEm: string;
  concluidoEm?: string;
}

export interface ReguaCobrancaConfig {
  ativo: boolean;
  diasAvisoPrevio: number;
  notificarDiaVencimento: boolean;
  diasPosVencimento1: number;
  diasPosVencimento2: number;
  oferecerAcordoAutomatico: boolean;
  horarioDisparo: string;
}

export interface SisconSystemConfig {
  erpProvider: 'siscon' | 'mock';
  sisconBaseUrl: string;
  sisconApiToken: string;
  sisconClientId: string;
  sisconClientSecret: string;
  sisconEmpresaId: string;
  bancoIntegrado: 'inter' | 'itau' | 'santander' | 'sicoob' | 'sicredi' | 'cora' | 'bradesco';
  usarCashbackTarifa: boolean;
  multaPercentual: number;
  jurosMensalPercentual: number;
  maxParcelasAcordo: number;
  valorMinimoParcela: number;
  reguaCobranca: ReguaCobrancaConfig;
  evolution: {
    apiUrl: string;
    apiKey: string;
    instanceName: string;
  };
  aiConfig?: AIConfig;
}

export type UserRole = 'admin' | 'sindico' | 'operador' | 'portaria';

export interface User {
  id: string;
  nome: string;
  email: string;
  senhaHash?: string;
  role: UserRole;
  cargo: string;
  avatarUrl?: string;
  ativo: boolean;
  ultimoAcesso?: string;
  condominioIds?: string[];
}

export interface AuthSession {
  token: string;
  user: Omit<User, 'senhaHash'>;
  expiresIn: string;
}

export type AIProvider = 'openai' | 'gemini' | 'anthropic' | 'deepseek' | 'groq' | 'openrouter' | 'custom';

export interface AIConfig {
  provider: AIProvider;
  apiKey: string;
  baseUrl?: string;
  modelName: string;
  temperature: number;
  maxTokens: number;
  systemPrompt: string;
  embeddingProvider: 'openai' | 'gemini' | 'local';
  guardrailsAtivos: boolean;
  encaminharHumanoBaixaConfianca: boolean;
  modoAutonomoTotal: boolean;
  tarefasAutonomas?: {
    cobrancaPix: boolean;
    acordoDividas: boolean;
    regrasRag: boolean;
    reservasAreas: boolean;
    encomendasOcr: boolean;
    passesVisitantes: boolean;
    assembleiasVoto: boolean;
    ocorrenciasChamados: boolean;
  };
}

export interface DocumentoRAG {
  id: string;
  titulo: string;
  categoria: 'regimento_interno' | 'convencao' | 'ata_assembleia' | 'faq' | 'geral';
  tamanhoBytes: number;
  qtdChunks: number;
  dataUpload: string;
  status: 'indexado' | 'processando' | 'erro';
  conteudoTexto?: string;
}

export interface ChunkRAG {
  id: string;
  documentoId: string;
  documentoTitulo: string;
  texto: string;
  tags?: string[];
  embedding?: number[];
}

export interface RAGSearchResult {
  chunk: ChunkRAG;
  score: number;
  documentoTitulo: string;
}

export interface CitacaoRAG {
  artigo?: string;
  documentoTitulo: string;
  versao: string;
  textoCitado: string;
  scoreRelevancia: string;
}

export interface Condominio {
  id: string;
  nome: string;
  cnpj: string;
  endereco: string;
  cidade: string;
  estado: string;
  unidadesQtd: number;
  administradoraNome: string;
  taxaAdmPercentual: number;
  logoUrl?: string;
  criadoEm: string;
}

export interface AIDecision {
  id: string;
  condominioId: string;
  pergunta: string;
  resposta: string;
  artigoCitado?: string;
  documentoCitado?: string;
  scoreConfianca: number;
  nivelAutonomia: 1 | 2 | 3;
  statusAprovacao: 'auto_aprovado' | 'pendente_sindico' | 'aprovado' | 'rejeitado';
  aprovadoPor?: string;
  tokensConsumidos: number;
  provedor: string;
  modelo: string;
  timestamp: string;
}

export interface Visita {
  id: string;
  visitanteNome: string;
  documento?: string;
  unidade: string;
  tipo: 'visita' | 'prestador' | 'delivery' | 'airbnb';
  dataEntrada: string;
  horaEntrada: string;
  estacionamento?: string;
  qrCodeToken: string;
  status: 'autorizado' | 'entrou' | 'saiu' | 'expirado';
  criadoEm: string;
}

export interface Encomenda {
  id: string;
  destinatarioNome: string;
  unidade: string;
  transportadora: string;
  codigoRastreio: string;
  dataChegada: string;
  horaChegada: string;
  codigoRetirada: string;
  status: 'aguardando_retirada' | 'entregue';
  fotoUrl?: string;
  notificadoWhatsapp: boolean;
  retiradoEm?: string;
  criadoEm: string;
}

export interface PendenciaSupervisao {
  id: string;
  condominioId: string;
  tipo: 'desconto_acordo' | 'isencao_reserva' | 'infracao_multa' | 'liberacao_acesso';
  descricao: string;
  solicitanteNome: string;
  unidadeId: string;
  dadosJson?: string;
  status: 'pendente' | 'aprovado' | 'rejeitado';
  analisadoPor?: string;
  justificativa?: string;
  criadoEm: string;
  respondidoEm?: string;
}
