import { UserSession, ChatMessage } from '../types/index.js';
import { DbService } from '../services/db.service.js';
import { EventsService } from '../services/events.service.js';

export class SessionManager {
  private sessions: Map<string, UserSession> = new Map();
  private db = DbService.getInstance();
  private events = EventsService.getInstance();

  constructor() {
    this.carregarOuSemearSessoes();
  }

  private carregarOuSemearSessoes(): void {
    const sessoesSalvas = this.db.getAllSessions();
    if (sessoesSalvas.length > 0) {
      sessoesSalvas.forEach(s => this.sessions.set(s.remoteJid, s));
      console.log(`[SessionManager] ${sessoesSalvas.length} sessões persistentes carregadas do SQLite.`);
      return;
    }

    // Se o banco estiver vazio, semeia os atendimentos iniciais completos
    this.seedDemoSessions();
  }

  private seedDemoSessions(): void {
    const now = new Date();
    
    // 1. Carlos Eduardo Silva (Res. Jardins do Bosque, Bloco A, Apt 101) - Atendido por IA, Regular
    const jid1 = '5511999999999@s.whatsapp.net';
    const sessao1: UserSession = {
      remoteJid: jid1,
      pushName: 'Carlos Eduardo Silva',
      state: 'MENU_PRINCIPAL',
      cpf: '12345678909',
      cpfFormatted: '123.***.***-09',
      telefone: '(11) 99999-9999',
      avatar: 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=200&auto=format&fit=crop&q=80',
      lastInteraction: now,
      isHumanHandoff: false,
      status: 'ai',
      statusFinanceiro: 'regular',
      statusFinanceiroLabel: '● Regular',
      statusFinanceiroBadgeClass: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30',
      cotaLabel: 'Cota Atual:',
      cotaValor: 'R$ 650,00',
      cotaVenc: '15/11/2026',
      splitAdm: 'R$ 19,50 (3%)',
      pixValor: '650.00',
      morador: {
        id: 'morador_1',
        nome: 'Carlos Eduardo Silva',
        cpf: '12345678909',
        telefone: '5511999999999',
        unidades: [
          {
            id: 'unid_101',
            condominioNome: 'Residencial Jardins do Bosque',
            bloco: 'Bloco A',
            numero: 'Apt 101',
          },
        ],
      },
      selectedUnidadeId: 'unid_101',
      messages: [
        {
          id: 'm1',
          sender: 'user',
          text: 'Olá, qual é a regra para mudanças no sábado?',
          timestamp: '09:30',
        },
        {
          id: 'm2',
          sender: 'bot',
          text: '📦 *Regimento Interno (Art. 24):*\nMudanças são permitidas aos sábados das **08h às 12h**, mediante agendamento com 48h de antecedência junto à administração para colocação de mantas no elevador.',
          timestamp: '09:30',
        },
        {
          id: 'm3',
          sender: 'user',
          text: 'Perfeito, e pode me mandar o boleto deste mês?',
          timestamp: '09:31',
        },
        {
          id: 'm4',
          sender: 'bot',
          text: 'Encontrei seu boleto no sistema predial:\n\n📄 Cota Condominial - 11/2026\n💰 Valor: R$ 650,00\n📅 Vencimento: 15/11/2026\n\nLinha Digitável:\n`34191.79001 01043.510047 91020.150008 8 95420000065000`',
          timestamp: '09:31',
          pixCode: '00020126580014BR.GOV.BCB.PIX0128financeiro@condominio.com.br5204000053039865406650.005802BR5925CONDOMINIO JARDINS DO BO6009SAO PAULO62130509ZELORIS016304E8A2'
        },
      ],
      tempData: {
        sentiment: 'positivo'
      }
    };

    // 2. Mariana de Souza (Solar das Palmeiras, Torre 2, Apt 204) - Aguardando Atendente, Risco Jurídico
    const jid2 = '5511988888888@s.whatsapp.net';
    const sessao2: UserSession = {
      remoteJid: jid2,
      pushName: 'Mariana de Souza',
      state: 'ATENDIMENTO_HUMANO',
      cpf: '98765432100',
      cpfFormatted: '987.***.***-00',
      telefone: '(11) 98888-8888',
      avatar: 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=200&auto=format&fit=crop&q=80',
      lastInteraction: new Date(now.getTime() - 1000 * 60 * 14),
      isHumanHandoff: true,
      status: 'waiting_human',
      slaStartedAt: new Date(now.getTime() - 1000 * 60 * 14).toISOString(),
      statusFinanceiro: 'inadimplente',
      statusFinanceiroLabel: '⚠️ Inadimplente (42d)',
      statusFinanceiroBadgeClass: 'bg-rose-500/20 text-rose-300 border-rose-500/30',
      cotaLabel: 'Total em Aberto:',
      cotaValor: 'R$ 1.350,00',
      cotaVenc: 'Vencido há 42 dias (05/10)',
      splitAdm: 'R$ 40,50 (3%)',
      pixValor: '1350.00',
      morador: {
        id: 'morador_2',
        nome: 'Mariana de Souza',
        cpf: '98765432100',
        telefone: '5511988888888',
        unidades: [
          {
            id: 'unid_204',
            condominioNome: 'Condomínio Solar das Palmeiras',
            bloco: 'Torre 2',
            numero: 'Apt 204',
          },
        ],
      },
      selectedUnidadeId: 'unid_204',
      messages: [
        {
          id: 'm21',
          sender: 'user',
          text: 'Bom dia, recebi uma notificação com juros abusivos. Se não tirarem a multa vou acionar meu advogado e abrir processo!',
          timestamp: '09:15',
        },
        {
          id: 'm22',
          sender: 'bot',
          text: 'Compreendo sua preocupação, Mariana. Transferi seu contato com prioridade máxima para nosso gestor financeiro humano para renegociação amigável.',
          timestamp: '09:15',
        },
      ],
      tempData: {
        sentiment: 'risco_juridico'
      }
    };

    // 3. Roberto Guimarães (Jardins do Bosque, Apt 302) - Aguardando Atendente, Mensagem de Áudio
    const jid3 = '5511977777777@s.whatsapp.net';
    const sessao3: UserSession = {
      remoteJid: jid3,
      pushName: 'Roberto Guimarães',
      state: 'ATENDIMENTO_HUMANO',
      cpf: '45678912345',
      cpfFormatted: '456.***.***-45',
      telefone: '(11) 97777-7777',
      avatar: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=200&auto=format&fit=crop&q=80',
      lastInteraction: new Date(now.getTime() - 1000 * 60 * 8),
      isHumanHandoff: true,
      status: 'waiting_human',
      slaStartedAt: new Date(now.getTime() - 1000 * 60 * 8).toISOString(),
      statusFinanceiro: 'inadimplente',
      statusFinanceiroLabel: '⚠️ Inadimplente (18d)',
      statusFinanceiroBadgeClass: 'bg-amber-500/20 text-amber-300 border-amber-500/30',
      cotaLabel: 'Total em Aberto:',
      cotaValor: 'R$ 780,00',
      cotaVenc: 'Vencido há 18 dias',
      splitAdm: 'R$ 23,40 (3%)',
      pixValor: '780.00',
      morador: {
        id: 'morador_3',
        nome: 'Roberto Guimarães',
        cpf: '45678912345',
        telefone: '5511977777777',
        unidades: [
          {
            id: 'unid_302',
            condominioNome: 'Residencial Jardins do Bosque',
            bloco: 'Bloco B',
            numero: 'Apt 302'
          }
        ]
      },
      selectedUnidadeId: 'unid_302',
      messages: [
        {
          id: 'm31',
          sender: 'user',
          text: '🎵 [Nota de Voz - 28s]: Morador contesta consumo de água medido no hidrômetro individual.',
          timestamp: '09:22',
          isAudio: true,
          duration: '0:28',
          audioSummary: 'Morador contesta valor da água aferido na telemetria, alegando que esteve em viagem.',
          audioTranscription: 'Oi, bom dia. Tô mandando esse áudio porque a conta de água do 302 veio o dobro do mês passado e eu fiquei dez dias viajando a trabalho. Tem algum vazamento ou o hidrômetro tá desregulado? Quero que alguém da administração verifique isso antes de eu pagar o boleto.'
        },
        {
          id: 'm32',
          sender: 'bot',
          text: 'Recebi seu áudio, Roberto. Localizei o chamado e encaminhei para verificação técnica do zelador e análise da telemetria individual. Um operador responderá em instantes.',
          timestamp: '09:22'
        }
      ],
      tempData: {
        sentiment: 'negativo'
      }
    };

    // 4. Dra. Fernanda Lima (Residencial Jardins, Apt 501) - AI, Regular, Reserva
    const jid4 = '5511966666666@s.whatsapp.net';
    const sessao4: UserSession = {
      remoteJid: jid4,
      pushName: 'Dra. Fernanda Lima',
      state: 'MENU_PRINCIPAL',
      cpf: '78912345678',
      cpfFormatted: '789.***.***-78',
      telefone: '(11) 96666-6666',
      avatar: 'https://images.unsplash.com/photo-1544005313-94ddf0286df2?w=200&auto=format&fit=crop&q=80',
      lastInteraction: new Date(now.getTime() - 1000 * 60 * 35),
      isHumanHandoff: false,
      status: 'ai',
      statusFinanceiro: 'regular',
      statusFinanceiroLabel: '● Regular',
      statusFinanceiroBadgeClass: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30',
      cotaLabel: 'Cota Atual:',
      cotaValor: 'R$ 650,00',
      cotaVenc: '15/11/2026',
      splitAdm: 'R$ 19,50 (3%)',
      pixValor: '650.00',
      morador: {
        id: 'morador_4',
        nome: 'Dra. Fernanda Lima',
        cpf: '78912345678',
        telefone: '5511966666666',
        unidades: [
          {
            id: 'unid_501',
            condominioNome: 'Residencial Jardins do Bosque',
            bloco: 'Bloco A',
            numero: 'Apt 501'
          }
        ]
      },
      selectedUnidadeId: 'unid_501',
      messages: [
        {
          id: 'm41',
          sender: 'user',
          text: 'Boa tarde! Gostaria de reservar o Espaço Gourmet para o próximo sábado.',
          timestamp: '08:50'
        },
        {
          id: 'm42',
          sender: 'bot',
          text: '📅 *Reserva de Área Comum*\nO Espaço Gourmet & Churrasqueira A está **disponível** no próximo sábado!\n\nTaxa de locação: R$ 100,00 + Limpeza: R$ 50,00 (Total R$ 150,00).\nConfirma a reserva com lançamento no próximo boleto?',
          timestamp: '08:50'
        }
      ],
      tempData: {
        sentiment: 'neutro'
      }
    };

    // 5. Lucas Andrade (Cond. Solar das Palmeiras, Torre 1, Apt 104) - Atendimento Concluído
    const jid5 = '5511955555555@s.whatsapp.net';
    const sessao5: UserSession = {
      remoteJid: jid5,
      pushName: 'Lucas Andrade',
      state: 'INICIO',
      cpf: '32165498711',
      cpfFormatted: '321.***.***-11',
      telefone: '(11) 95555-5555',
      avatar: 'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=200&auto=format&fit=crop&q=80',
      lastInteraction: new Date(now.getTime() - 1000 * 60 * 120),
      isHumanHandoff: false,
      status: 'closed',
      statusFinanceiro: 'regular',
      statusFinanceiroLabel: '● Regular',
      statusFinanceiroBadgeClass: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30',
      cotaLabel: 'Cota Atual:',
      cotaValor: 'R$ 650,00',
      cotaVenc: '15/11/2026',
      splitAdm: 'R$ 19,50 (3%)',
      pixValor: '650.00',
      morador: {
        id: 'morador_5',
        nome: 'Lucas Andrade',
        cpf: '32165498711',
        telefone: '5511955555555',
        unidades: [
          {
            id: 'unid_104',
            condominioNome: 'Condomínio Solar das Palmeiras',
            bloco: 'Torre 1',
            numero: 'Apt 104'
          }
        ]
      },
      selectedUnidadeId: 'unid_104',
      messages: [
        {
          id: 'm51',
          sender: 'user',
          text: 'Boa noite, preciso cadastrar a placa do meu carro novo para o leitor da garagem.',
          timestamp: 'Ontem'
        },
        {
          id: 'm52',
          sender: 'bot',
          text: '🚗 Placa ABC-4D56 cadastrada com sucesso no sistema LPR da Portaria Digital. A liberação na cancela é automática!',
          timestamp: 'Ontem'
        }
      ],
      tempData: {
        sentiment: 'positivo'
      }
    };

    const seeds = [sessao1, sessao2, sessao3, sessao4, sessao5];
    seeds.forEach(s => {
      this.sessions.set(s.remoteJid, s);
      this.db.saveSession(s);
      s.messages?.forEach(m => this.db.saveMessage(s.remoteJid, m));
    });
  }

  getSession(remoteJid: string, pushName?: string): UserSession {
    let session = this.sessions.get(remoteJid);
    if (!session) {
      session = this.db.getSession(remoteJid) || {
        remoteJid,
        pushName,
        state: 'INICIO',
        status: 'ai',
        lastInteraction: new Date(),
        messages: [],
      };
      this.sessions.set(remoteJid, session);
      this.db.saveSession(session);
    } else {
      session.lastInteraction = new Date();
      if (pushName && !session.pushName) {
        session.pushName = pushName;
      }
      this.db.saveSession(session);
    }
    return session;
  }

  addMessage(remoteJid: string, message: ChatMessage): void {
    const session = this.getSession(remoteJid);
    if (!session.messages) session.messages = [];
    session.messages.push(message);
    this.db.saveMessage(remoteJid, message);
    this.updateSession(session);

    // Notificação em tempo real via Server-Sent Events
    this.events.broadcast({
      type: 'new_message',
      remoteJid,
      data: {
        message,
        session
      },
      timestamp: new Date().toISOString()
    });
  }

  getAllSessions(): UserSession[] {
    return Array.from(this.sessions.values()).sort(
      (a, b) => new Date(b.lastInteraction).getTime() - new Date(a.lastInteraction).getTime()
    );
  }

  setHumanHandoff(remoteJid: string, isHuman: boolean, operatorName?: string): void {
    const session = this.getSession(remoteJid);
    session.isHumanHandoff = isHuman;
    session.state = isHuman ? 'ATENDIMENTO_HUMANO' : 'MENU_PRINCIPAL';

    if (isHuman) {
      session.status = operatorName ? 'in_service' : 'waiting_human';
      session.assignedOperator = operatorName || session.assignedOperator;
      if (!session.slaStartedAt) {
        session.slaStartedAt = new Date().toISOString();
      }
    } else {
      session.status = 'ai';
      session.assignedOperator = undefined;
      session.slaStartedAt = undefined;
    }

    this.updateSession(session);

    this.events.broadcast({
      type: 'handoff_changed',
      remoteJid,
      data: {
        isHuman,
        operatorName,
        status: session.status,
        session
      },
      timestamp: new Date().toISOString()
    });
  }

  setTicketStatus(remoteJid: string, status: 'waiting_human' | 'in_service' | 'ai' | 'closed', operatorName?: string): void {
    const session = this.getSession(remoteJid);
    session.status = status;

    if (status === 'closed') {
      session.isHumanHandoff = false;
      session.state = 'INICIO';
      session.assignedOperator = undefined;
      session.slaStartedAt = undefined;
    } else if (status === 'in_service') {
      session.isHumanHandoff = true;
      session.state = 'ATENDIMENTO_HUMANO';
      if (operatorName) session.assignedOperator = operatorName;
    } else if (status === 'waiting_human') {
      session.isHumanHandoff = true;
      session.state = 'ATENDIMENTO_HUMANO';
      if (!session.slaStartedAt) session.slaStartedAt = new Date().toISOString();
    } else if (status === 'ai') {
      session.isHumanHandoff = false;
      session.state = 'MENU_PRINCIPAL';
      session.assignedOperator = undefined;
      session.slaStartedAt = undefined;
    }

    this.updateSession(session);

    this.events.broadcast({
      type: 'ticket_status',
      remoteJid,
      data: {
        status,
        operatorName,
        session
      },
      timestamp: new Date().toISOString()
    });
  }

  addNotaInterna(remoteJid: string, autor: string, texto: string): void {
    const session = this.getSession(remoteJid);
    if (!session.notasInternas) session.notasInternas = [];
    const timestamp = new Date().toLocaleString('pt-BR');
    session.notasInternas.push(`[${timestamp} - ${autor}]: ${texto}`);
    this.updateSession(session);

    this.events.broadcast({
      type: 'session_updated',
      remoteJid,
      data: { session },
      timestamp: new Date().toISOString()
    } as any);
  }

  updateSession(session: UserSession): void {
    session.lastInteraction = new Date();
    this.sessions.set(session.remoteJid, session);
    this.db.saveSession(session);
  }

  resetSession(remoteJid: string): void {
    const existing = this.sessions.get(remoteJid);
    const updated: UserSession = {
      remoteJid,
      pushName: existing?.pushName,
      state: 'INICIO',
      status: 'ai',
      lastInteraction: new Date(),
      messages: [],
    };
    this.sessions.set(remoteJid, updated);
    this.db.saveSession(updated);
  }
}
