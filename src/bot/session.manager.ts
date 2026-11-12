import { UserSession } from '../types/index.js';

export class SessionManager {
  private sessions: Map<string, UserSession> = new Map();

  getSession(remoteJid: string, pushName?: string): UserSession {
    let session = this.sessions.get(remoteJid);
    if (!session) {
      session = {
        remoteJid,
        pushName,
        state: 'INICIO',
        lastInteraction: new Date(),
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
    });
  }
}
