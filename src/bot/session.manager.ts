import { UserSession, ChatMessage } from '../types/index.js';

export class SessionManager {
  private sessions: Map<string, UserSession> = new Map();

  constructor() {
    this.seedDemoSessions();
  }

  private seedDemoSessions(): void {
    const now = new Date();
    
    // Morador 1: Carlos Eduardo Silva (Res. Jardins do Bosque, Bloco A, Apt 101)
    const jid1 = '5511999999999@s.whatsapp.net';
    this.sessions.set(jid1, {
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
          text: 'Olá, gostaria de tirar uma dúvida sobre meu condomínio',
          timestamp: '09:30',
        },
        {
          id: 'm2',
          sender: 'bot',
          text: 'Olá Carlos Eduardo! Seja bem-vindo à Central de Autoatendimento WhatsApp conectada ao SISCON. Como posso te ajudar hoje?',
          timestamp: '09:30',
        },
        {
          id: 'm3',
          sender: 'user',
          text: 'Quero a 2ª via do boleto deste mês por favor',
          timestamp: '09:31',
        },
        {
          id: 'm4',
          sender: 'bot',
          text: 'Encontrei seu débito em aberto no SISCON:\n\n📄 Cota Condominial - 11/2026\n💰 Valor: R$ 650,00\n📅 Vencimento: 15/11/2026\n\nAqui está a sua linha digitável e o código Pix Copia e Cola.',
          timestamp: '09:31',
        },
      ],
    });

    // Morador 2: Mariana de Souza (Cond. Solar das Palmeiras, Torre 2, Apt 204)
    const jid2 = '5511988888888@s.whatsapp.net';
    this.sessions.set(jid2, {
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
          text: 'Bom dia, gostaria de falar com um atendente humano para negociar um acordo',
          timestamp: '09:15',
        },
        {
          id: 'm22',
          sender: 'bot',
          text: 'Transferindo seu atendimento para nossa equipe financeira humana. Por favor aguarde um momento com o histórico preservado.',
          timestamp: '09:15',
        },
      ],
    });
  }

  getSession(remoteJid: string, pushName?: string): UserSession {
    let session = this.sessions.get(remoteJid);
    if (!session) {
      session = {
        remoteJid,
        pushName,
        state: 'INICIO',
        lastInteraction: new Date(),
        messages: [],
      };
      this.sessions.set(remoteJid, session);
    } else {
      session.lastInteraction = new Date();
      if (pushName && !session.pushName) {
        session.pushName = pushName;
      }
    }
    return session;
  }

  addMessage(remoteJid: string, message: ChatMessage): void {
    const session = this.getSession(remoteJid);
    if (!session.messages) session.messages = [];
    session.messages.push(message);
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
  }

  resetSession(remoteJid: string): void {
    const existing = this.sessions.get(remoteJid);
    this.sessions.set(remoteJid, {
      remoteJid,
      pushName: existing?.pushName,
      state: 'INICIO',
      lastInteraction: new Date(),
      messages: [],
    });
  }
}
