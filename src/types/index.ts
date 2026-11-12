export type SessionState =
  | 'INICIO'
  | 'AGUARDANDO_CPF'
  | 'MENU_PRINCIPAL'
  | 'ESCOLHENDO_BOLETO'
  | 'AGUARDANDO_DESCRICAO_OCORRENCIA'
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

export interface UserSession {
  remoteJid: string; // ex: 5511999999999@s.whatsapp.net
  pushName?: string;
  state: SessionState;
  cpf?: string;
  morador?: Morador;
  selectedUnidadeId?: string;
  boletosDisponiveis?: Boleto[];
  tempData?: Record<string, any>;
  lastInteraction: Date;
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
