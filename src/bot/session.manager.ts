import { UserSession, ChatMessage } from '../types/index.js';
import { DbService } from '../services/db.service.js';

export class SessionManager {
  private sessions: Map<string, UserSession> = new Map();
  private db = DbService.getInstance();

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

    // Se o banco estiver vazio, semeia os atendimentos iniciais
    this.seedDemoSessions();
  }

  private seedDemoSessions(): void {
    const now = new Date();
    
    // Morador 1: Carlos Eduardo Silva (Res. Jardins do Bosque, Bloco A, Apt 101)
    const jid1 = '5511999999999@s.whatsapp.net';
    const sessao1: UserSession = {
      remoteJid: jid1,
      pushName: 'Carlos Eduardo Silva',
      state: 'MENU_PRINCIPAL',
      cpf: '12345678909',
      lastInteraction: now,
      isHumanHandoff: false,
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
        },
      ],
      tempData: {
        sentiment: 'positivo'
      }
    };

    // Morador 2: Mariana de Souza (Cond. Solar das Palmeiras, Torre 2, Apt 204)
    const jid2 = '5511988888888@s.whatsapp.net';
    const sessao2: UserSession = {
      remoteJid: jid2,
      pushName: 'Mariana de Souza',
      state: 'ATENDIMENTO_HUMANO',
      cpf: '98765432100',
      lastInteraction: new Date(now.getTime() - 1000 * 60 * 15),
      isHumanHandoff: true,
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

    this.sessions.set(jid1, sessao1);
    this.sessions.set(jid2, sessao2);

    // Persiste no SQLite
    this.db.saveSession(sessao1);
    sessao1.messages?.forEach(m => this.db.saveMessage(jid1, m));
    this.db.saveSession(sessao2);
    sessao2.messages?.forEach(m => this.db.saveMessage(jid2, m));
  }

  getSession(remoteJid: string, pushName?: string): UserSession {
    let session = this.sessions.get(remoteJid);
    if (!session) {
      session = this.db.getSession(remoteJid) || {
        remoteJid,
        pushName,
        state: 'INICIO',
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
  }

  getAllSessions(): UserSession[] {
    return Array.from(this.sessions.values()).sort(
      (a, b) => new Date(b.lastInteraction).getTime() - new Date(a.lastInteraction).getTime()
    );
  }

  setHumanHandoff(remoteJid: string, isHuman: boolean): void {
    const session = this.getSession(remoteJid);
    session.isHumanHandoff = isHuman;
    session.state = isHuman ? 'ATENDIMENTO_HUMANO' : 'MENU_PRINCIPAL';
    this.updateSession(session);
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
      lastInteraction: new Date(),
      messages: [],
    };
    this.sessions.set(remoteJid, updated);
    this.db.saveSession(updated);
  }
}
