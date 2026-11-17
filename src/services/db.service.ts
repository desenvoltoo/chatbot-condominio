import { DatabaseSync } from 'node:sqlite';
import path from 'node:path';
import fs from 'node:fs';
import { UserSession, ChatMessage } from '../types/index.js';

export class DbService {
  private static instance: DbService;
  private db: DatabaseSync;

  private constructor() {
    const dataDir = path.join(process.cwd(), 'data');
    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true });
    }

    const dbPath = path.join(dataDir, 'domus.db');
    this.db = new DatabaseSync(dbPath);
    this.initTables();
  }

  public static getInstance(): DbService {
    if (!DbService.instance) {
      DbService.instance = new DbService();
    }
    return DbService.instance;
  }

  private initTables() {
    // 1. Tabela de Sessões de Atendimento WhatsApp
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS sessions (
        remoteJid TEXT PRIMARY KEY,
        pushName TEXT,
        state TEXT NOT NULL,
        cpf TEXT,
        moradorJson TEXT,
        selectedUnidadeId TEXT,
        isHumanHandoff INTEGER DEFAULT 0,
        sentiment TEXT DEFAULT 'neutro',
        lastInteraction TEXT NOT NULL,
        status TEXT DEFAULT 'ai',
        assignedOperator TEXT,
        slaStartedAt TEXT,
        statusFinanceiro TEXT,
        cotaValor TEXT,
        pixValor TEXT,
        avatar TEXT,
        telefone TEXT,
        notasInternasJson TEXT
      );
    `);

    // Migrações seguras caso colunas não existam em banco pré-existente
    const colunasExtras = [
      'status TEXT DEFAULT "ai"',
      'assignedOperator TEXT',
      'slaStartedAt TEXT',
      'statusFinanceiro TEXT',
      'cotaValor TEXT',
      'pixValor TEXT',
      'avatar TEXT',
      'telefone TEXT',
      'notasInternasJson TEXT'
    ];
    for (const col of colunasExtras) {
      try {
        this.db.exec(`ALTER TABLE sessions ADD COLUMN ${col};`);
      } catch (e) {
        // Coluna já existe
      }
    }

    // 2. Tabela de Mensagens do Chat
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS messages (
        id TEXT PRIMARY KEY,
        remoteJid TEXT NOT NULL,
        sender TEXT NOT NULL,
        text TEXT NOT NULL,
        timestamp TEXT NOT NULL,
        mediaUrl TEXT,
        mediaType TEXT,
        pixCode TEXT,
        isAudio INTEGER DEFAULT 0,
        duration TEXT,
        audioSummary TEXT,
        audioTranscription TEXT,
        createdAt INTEGER NOT NULL
      );
    `);

    // 3. Tabela de Acordos de Dívidas e Confissões
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS acordos (
        id TEXT PRIMARY KEY,
        unidadeId TEXT NOT NULL,
        condominioNome TEXT NOT NULL,
        moradorNome TEXT NOT NULL,
        cpf TEXT NOT NULL,
        valorOriginal REAL NOT NULL,
        valorAcordo REAL NOT NULL,
        qtdParcelas INTEGER NOT NULL,
        valorParcela REAL NOT NULL,
        descontoJuros REAL DEFAULT 0,
        status TEXT DEFAULT 'aguardando_assinatura',
        termoHash TEXT,
        criadoEm TEXT NOT NULL
      );
    `);

    // 4. Trilha de Auditoria (Logs de Ações Críticas)
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS audit_logs (
        id TEXT PRIMARY KEY,
        userId TEXT,
        userEmail TEXT,
        acao TEXT NOT NULL,
        detalhes TEXT,
        ip TEXT,
        timestamp TEXT NOT NULL
      );
    `);
  }

  // ==========================================
  // OPERAÇÕES DE SESSÃO
  // ==========================================

  public saveSession(session: UserSession) {
    const stmt = this.db.prepare(`
      INSERT INTO sessions (
        remoteJid, pushName, state, cpf, moradorJson, selectedUnidadeId, isHumanHandoff, sentiment, lastInteraction,
        status, assignedOperator, slaStartedAt, statusFinanceiro, cotaValor, pixValor, avatar, telefone, notasInternasJson
      ) VALUES (
        ?, ?, ?, ?, ?, ?, ?, ?, ?,
        ?, ?, ?, ?, ?, ?, ?, ?, ?
      )
      ON CONFLICT(remoteJid) DO UPDATE SET
        pushName = excluded.pushName,
        state = excluded.state,
        cpf = excluded.cpf,
        moradorJson = excluded.moradorJson,
        selectedUnidadeId = excluded.selectedUnidadeId,
        isHumanHandoff = excluded.isHumanHandoff,
        sentiment = excluded.sentiment,
        lastInteraction = excluded.lastInteraction,
        status = excluded.status,
        assignedOperator = excluded.assignedOperator,
        slaStartedAt = excluded.slaStartedAt,
        statusFinanceiro = excluded.statusFinanceiro,
        cotaValor = excluded.cotaValor,
        pixValor = excluded.pixValor,
        avatar = excluded.avatar,
        telefone = excluded.telefone,
        notasInternasJson = excluded.notasInternasJson;
    `);

    stmt.run(
      session.remoteJid,
      session.pushName || null,
      session.state,
      session.cpf || null,
      session.morador ? JSON.stringify(session.morador) : null,
      session.selectedUnidadeId || null,
      session.isHumanHandoff ? 1 : 0,
      session.tempData?.sentiment || 'neutro',
      session.lastInteraction instanceof Date ? session.lastInteraction.toISOString() : new Date().toISOString(),
      session.status || (session.isHumanHandoff ? 'waiting_human' : 'ai'),
      session.assignedOperator || null,
      session.slaStartedAt || null,
      session.statusFinanceiro || 'regular',
      session.cotaValor || 'R$ 650,00',
      session.pixValor || '650.00',
      session.avatar || null,
      session.telefone || null,
      session.notasInternas ? JSON.stringify(session.notasInternas) : null
    );
  }

  public getSession(remoteJid: string): UserSession | null {
    const stmt = this.db.prepare('SELECT * FROM sessions WHERE remoteJid = ?');
    const row = stmt.get(remoteJid) as any;
    if (!row) return null;

    const messages = this.getMessages(remoteJid);

    return {
      remoteJid: row.remoteJid,
      pushName: row.pushName,
      state: row.state as any,
      cpf: row.cpf,
      morador: row.moradorJson ? JSON.parse(row.moradorJson) : undefined,
      selectedUnidadeId: row.selectedUnidadeId,
      isHumanHandoff: Boolean(row.isHumanHandoff),
      lastInteraction: new Date(row.lastInteraction),
      status: row.status || (row.isHumanHandoff ? 'waiting_human' : 'ai'),
      assignedOperator: row.assignedOperator || undefined,
      slaStartedAt: row.slaStartedAt || undefined,
      statusFinanceiro: row.statusFinanceiro || 'regular',
      cotaValor: row.cotaValor || 'R$ 650,00',
      pixValor: row.pixValor || '650.00',
      avatar: row.avatar || undefined,
      telefone: row.telefone || undefined,
      notasInternas: row.notasInternasJson ? JSON.parse(row.notasInternasJson) : [],
      messages,
      tempData: {
        sentiment: row.sentiment || 'neutro'
      }
    };
  }

  public getAllSessions(): UserSession[] {
    const stmt = this.db.prepare('SELECT * FROM sessions ORDER BY lastInteraction DESC');
    const rows = stmt.all() as any[];

    return rows.map(row => {
      const messages = this.getMessages(row.remoteJid);
      return {
        remoteJid: row.remoteJid,
        pushName: row.pushName,
        state: row.state as any,
        cpf: row.cpf,
        morador: row.moradorJson ? JSON.parse(row.moradorJson) : undefined,
        selectedUnidadeId: row.selectedUnidadeId,
        isHumanHandoff: Boolean(row.isHumanHandoff),
        lastInteraction: new Date(row.lastInteraction),
        status: row.status || (row.isHumanHandoff ? 'waiting_human' : 'ai'),
        assignedOperator: row.assignedOperator || undefined,
        slaStartedAt: row.slaStartedAt || undefined,
        statusFinanceiro: row.statusFinanceiro || 'regular',
        cotaValor: row.cotaValor || 'R$ 650,00',
        pixValor: row.pixValor || '650.00',
        avatar: row.avatar || undefined,
        telefone: row.telefone || undefined,
        notasInternas: row.notasInternasJson ? JSON.parse(row.notasInternasJson) : [],
        messages,
        tempData: {
          sentiment: row.sentiment || 'neutro'
        }
      };
    });
  }

  // ==========================================
  // OPERAÇÕES DE MENSAGEM
  // ==========================================

  public saveMessage(remoteJid: string, msg: ChatMessage) {
    const stmt = this.db.prepare(`
      INSERT INTO messages (
        id, remoteJid, sender, text, timestamp, mediaUrl, mediaType, pixCode, isAudio, duration, audioSummary, audioTranscription, createdAt
      ) VALUES (
        ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?
      )
      ON CONFLICT(id) DO UPDATE SET
        text = excluded.text,
        pixCode = excluded.pixCode;
    `);

    stmt.run(
      msg.id,
      remoteJid,
      msg.sender,
      msg.text,
      msg.timestamp,
      msg.mediaUrl || null,
      msg.mediaType || null,
      msg.pixCode || null,
      msg.isAudio ? 1 : 0,
      msg.duration || null,
      msg.audioSummary || null,
      msg.audioTranscription || null,
      Date.now()
    );
  }

  public getMessages(remoteJid: string): ChatMessage[] {
    const stmt = this.db.prepare('SELECT * FROM messages WHERE remoteJid = ? ORDER BY createdAt ASC');
    const rows = stmt.all(remoteJid) as any[];

    return rows.map(r => ({
      id: r.id,
      sender: r.sender as any,
      text: r.text,
      timestamp: r.timestamp,
      mediaUrl: r.mediaUrl || undefined,
      mediaType: r.mediaType || undefined,
      pixCode: r.pixCode || undefined,
      isAudio: Boolean(r.isAudio),
      duration: r.duration || undefined,
      audioSummary: r.audioSummary || undefined,
      audioTranscription: r.audioTranscription || undefined
    }));
  }

  // ==========================================
  // AUDITORIA E ACORDOS
  // ==========================================

  public logAudit(userId: string, userEmail: string, acao: string, detalhes?: string, ip?: string) {
    const stmt = this.db.prepare(`
      INSERT INTO audit_logs (id, userId, userEmail, acao, detalhes, ip, timestamp)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);

    stmt.run(
      `log_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      userId,
      userEmail,
      acao,
      detalhes || null,
      ip || null,
      new Date().toISOString()
    );
  }

  public getAuditLogs(limit: number = 50): any[] {
    const stmt = this.db.prepare('SELECT * FROM audit_logs ORDER BY timestamp DESC LIMIT ?');
    return stmt.all(limit) as any[];
  }
}
