export type SessionState =
  | 'INICIO'
  | 'AGUARDANDO_CPF'
  | 'MENU_PRINCIPAL'
  | 'ESCOLHENDO_BOLETO'
  | 'AGUARDANDO_DESCRICAO_OCORRENCIA'
  | 'SIMULANDO_ACORDO'
  | 'CONFIRMANDO_ACORDO'
  | 'RESERVANDO_AREA'
  | 'ATENDIMENTO_HUMANO'
  | 'AVALIANDO_ATENDIMENTO';

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
  protocolo?: string;
  moradorId?: string;
  moradorNome?: string;
  moradorTelefone?: string;
  unidadeId?: string;
  unidadeInfratora?: string;
  categoria: string;
  gravidade?: 'leve' | 'media' | 'grave' | 'gravissima';
  descricao: string;
  artigoRegimento?: string;
  status: 'aberta' | 'em_analise' | 'advertida' | 'multada' | 'resolvida' | 'arquivada';
  tipoAcaoTomada?: 'notificacao_amigavel' | 'advertencia_formal' | 'multa' | 'arquivamento';
  valorMulta?: number;
  prazoDefesaDias?: number;
  parecerSindico?: string;
  dataCriacao: string;
  dataResolucao?: string;
  hashAuditoria?: string;
  fotos?: string[];
}

export interface EnqueteOpcao {
  id: string;
  label: string;
  votos: number;
}

export interface Enquete {
  id: string;
  titulo: string;
  descricao: string;
  opcoes: EnqueteOpcao[];
  status: 'aberta' | 'encerrada';
  dataInicio: string;
  dataFim?: string;
  totalVotos: number;
  criadoPor: string;
  criadoEm: string;
}

export interface EnqueteVoto {
  id: string;
  enqueteId: string;
  cpf: string;
  moradorNome: string;
  unidadeId: string;
  opcaoId: string;
  opcaoLabel: string;
  canal: 'whatsapp' | 'painel';
  dataHora: string;
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
  aguardandoHumano?: number;
  emAtendimento?: number;
  resolvidosIA?: number;
  mediaCSAT?: number;
  totalAvaliacoes?: number;
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
  rgOuCpf?: string;
  unidade: string;
  tipo: 'visita' | 'prestador' | 'delivery' | 'airbnb' | 'visitante';
  dataEntrada: string;
  horaEntrada: string;
  dataVisita?: string;
  horaEstimada?: string;
  estacionamento?: string;
  qrCodeToken: string;
  qrCode?: string;
  pinAcesso?: string;
  moradorResponsavel?: string;
  observacao?: string;
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

export interface AvaliacaoCSAT {
  id: string;
  remoteJid: string;
  moradorNome?: string;
  unidadeId?: string;
  carteiraId?: string;
  operadorId?: string;
  operadorNome?: string;
  nota: number; // 1 to 5
  comentario?: string;
  criadoEm: number;
}

export interface ReguaDisparo {
  id: string;
  cobrancaId: string;
  remoteJid: string;
  moradorNome?: string;
  unidadeId?: string;
  tipoRegua: 'D-3' | 'D-0' | 'D+3';
  valor: number;
  vencimento: string;
  disparadoEm: string;
  status: 'enviado' | 'falha';
}

export interface PautaAssembleia {
  id: string;
  titulo: string;
  descricao: string;
  votosSim: number;
  votosNao: number;
  votosAbstencao: number;
}

export interface Assembleia {
  id: string;
  titulo: string;
  tipo: 'ordinaria' | 'extraordinaria';
  dataInicio: string;
  dataFim?: string;
  status: 'aberta' | 'encerrada';
  quorumPercentual: number;
  pautas: PautaAssembleia[];
  ataOficialTexto?: string;
  ataGeradaEm?: string;
  criadoEm: string;
}

export interface AssembleiaVoto {
  id: string;
  assembleiaId: string;
  pautaId: string;
  unidadeId: string;
  moradorNome: string;
  cpf: string;
  voto: 'sim' | 'nao' | 'abstencao';
  canal: 'whatsapp' | 'web' | 'presencial';
  timestamp: string;
  hashComprovante: string;
}

export interface ConsentimentoLGPD {
  id: string;
  cpf: string;
  moradorNome: string;
  unidadeId: string;
  telefone?: string;
  tipoConsentimento: 'cobranca_whatsapp' | 'notificacoes_portaria' | 'comunicados_gerais' | 'assembleia_virtual' | 'tratamento_dados_siscon';
  status: 'aceito' | 'revogado';
  canal: 'whatsapp' | 'painel' | 'totem';
  dataHora: string;
  hashAuditoria: string;
}

export interface DossieLGPD {
  cpf: string;
  morador: Morador | null;
  consentimentos: ConsentimentoLGPD[];
  boletosHistorico: Boleto[];
  ocorrenciasHistorico: Ocorrencia[];
  visitasHistorico: any[];
  encomendasHistorico: any[];
  geradoEm: string;
  hashValidador: string;
}

// ==========================================
// MÓDULO 1: PREVISÃO ORÇAMENTÁRIA & SIMULADOR DE COTA IA
// ==========================================
export interface ItemOrcamento {
  id?: string;
  categoria: 'pessoal_folha' | 'concessionarias' | 'manutencao_conservacao' | 'seguros_laudos' | 'administrativo' | 'fundo_reserva' | 'obras_melhorias';
  descricao: string;
  valorPrevistoMensal?: number;
  valorPrevistoAnual: number;
  valorRealizadoAcumulado: number;
  percentualDesvio?: number;
}

export interface FracaoIdealCota {
  tipo: string; // Ex: "Apto Padrão 2D", "Apto 3D", "Cobertura Duplex"
  fracao: number; // Ex: 0.00385
  cotaMensal: number;
  unidadesQtd: number;
}

export interface PrevisaoOrcamentaria {
  id: string;
  anoExercicio: number; // Ex: 2026, 2027
  titulo: string;
  status: 'em_estudo' | 'aprovada_ago' | 'encerrada';
  despesasOrcadasTotal: number;
  receitasPrevistasTotal: number;
  totalUnidades: number;
  cotaSugeridaUnitaria: number;
  fundoReservaPercentual: number; // Padrão: 10%
  fundoObrasPercentual: number; // Padrão: 5%
  inflacaoProjetada: number; // Padrão: 4.5% IPCA
  parecerIa?: string;
  itens: ItemOrcamento[];
  fracoes?: FracaoIdealCota[];
  aprovadoAgoEm?: string;
  ataProtocolo?: string;
  criadoEm: string;
}

export interface SimulacaoCotaResultado {
  anoExercicio: number;
  despesaMensalBase: number;
  fundoReservaMensal: number;
  fundoObrasMensal: number;
  totalMensalNecessario: number;
  cotaMediaUnitaria: number;
  impactoPercentualAnoAnterior: number;
  fracoes: FracaoIdealCota[];
  analiseIa: string;
}

// ==========================================
// MÓDULO 3: GESTÃO DE CONTRATOS, LAUDOS & SEGURO PREDIAL
// ==========================================
export type CategoriaServicoContrato =
  | 'elevadores'
  | 'seguro_predial'
  | 'avcb_bombeiros'
  | 'spda_para_raios'
  | 'caixa_dagua'
  | 'portaria_seguranca'
  | 'limpeza_conservacao'
  | 'gerador'
  | 'portoes_cameras'
  | 'dedetizacao'
  | 'gas_encanado'
  | 'outros';

export interface ContratoFornecedor {
  id: string;
  fornecedorNome: string;
  cnpj?: string;
  servicoCategoria: CategoriaServicoContrato;
  descricao: string;
  valorMensal: number;
  valorTotalAnual: number;
  dataInicio: string;
  dataVencimento: string;
  renovacaoAutomatica: boolean;
  contatoNome: string;
  contatoTelefone: string;
  contatoEmail?: string;
  status: 'vigente' | 'vence_em_breve' | 'vencido' | 'renovado';
  laudoObrigatorioPorLei: boolean;
  artigoLegal?: string;
  apoliceNumero?: string;
  seguradoraNome?: string;
  arquivoAnexoUrl?: string;
  diasParaVencer?: number;
  alertaDiasAntecedencia: number[]; // Ex: [60, 30, 15]
  alertasDisparados: string[]; // Histórico de datas em que o alerta foi disparado
  criadoEm: string;
}

export interface AlertaContrato {
  id: string;
  contratoId: string;
  fornecedorNome: string;
  servicoCategoria: CategoriaServicoContrato;
  dataVencimento: string;
  diasRestantes: number;
  severidade: 'info' | 'alerta' | 'critico';
  notificadoWhatsapp: boolean;
  criadoEm: string;
}

// ==========================================
// MÓDULO 2: PORTAL WEBAPP DO CONDÔMINO (LINK MÁGICO)
// ==========================================
export interface PortalMoradorPerfil {
  unidadeId: string;
  unidadeDescricao: string;
  moradorNome: string;
  cpf: string;
  telefone: string;
  email?: string;
  bloco?: string;
  condominioNome: string;
}

export interface PortalMoradorDados {
  perfil: PortalMoradorPerfil;
  cotaAtual?: Cobranca;
  historicoCotas: Cobranca[];
  passesAtivos: Visita[];
  encomendasPendentes: Encomenda[];
  encomendasRetiradas: Encomenda[];
  ocorrenciasRecentes: Ocorrencia[];
  comunicadosRecentes: Comunicado[];
  pixChaveOficial: string;
  magicToken: string;
}

// ==========================================
// MÓDULO 5: BALANCETE MENSAL CONSOLIDADO & PRESTAÇÃO DE CONTAS
// ==========================================
export interface BalanceteItemConta {
  categoria: string;
  descricao: string;
  valor: number;
  tipo: 'receita' | 'despesa';
}

export interface BalanceteMensal {
  id: string;
  competencia: string; // Ex: "11/2026", "10/2026"
  mes: number;
  ano: number;
  saldoAnterior: number;
  receitasOrdinarias: number;
  receitasExtraordinarias: number;
  receitasTotal: number;
  despesasPessoal: number;
  despesasConcessionarias: number;
  despesasManutencao: number;
  despesasAdministrativas: number;
  despesasSegurosLaudos: number;
  despesasTotal: number;
  resultadoMes: number; // receitasTotal - despesasTotal (Superávit/Déficit)
  saldoAtualMovimento: number;
  fundoReservaSaldo: number;
  fundoObrasSaldo: number;
  saldoConsolidadoTotal: number;
  inadimplenciaPercentual: number;
  inadimplenciaValorTotal: number;
  parecerConselhoFiscal: string;
  parecerIa: string;
  status: 'em_elaboracao' | 'aprovado_conselho' | 'publicado';
  aprovadoConselhoEm?: string;
  conselheirosAssinantes?: string[];
  itens?: BalanceteItemConta[];
  hashAuditoria: string;
  criadoEm: string;
}
