import { DatabaseSync } from 'node:sqlite';
import path from 'node:path';
import fs from 'node:fs';
import { UserSession, ChatMessage, Carteira, Cobranca, Reserva, OrdemManutencao, Condominio, AIDecision, PendenciaSupervisao, Visita, Encomenda, Comunicado, AvaliacaoCSAT, ReguaDisparo } from '../types/index.js';
import { gerarPayloadPix } from '../utils/pix.util.js';

export class DbService {
  private static instance: DbService;
  private db: DatabaseSync;

  private constructor() {
    const dataDir = path.join(process.cwd(), 'data');
    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true });
    }

    const dbPath = path.join(dataDir, 'condovolto.db');
    const legacyZelorisPath = path.join(dataDir, 'zeloris.db');
    const legacyPath = path.join(dataDir, 'domus.db');
    if (!fs.existsSync(dbPath)) {
      if (fs.existsSync(legacyZelorisPath)) {
        try {
          fs.copyFileSync(legacyZelorisPath, dbPath);
        } catch (e) {}
      } else if (fs.existsSync(legacyPath)) {
        try {
          fs.copyFileSync(legacyPath, dbPath);
        } catch (e) {}
      }
    }
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
    // 0. Tabela de Carteiras de Atendimento
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS carteiras (
        id TEXT PRIMARY KEY,
        nome TEXT NOT NULL,
        descricao TEXT,
        cor TEXT DEFAULT '#4F46E5',
        operadorResponsavelId TEXT,
        operadorResponsavelNome TEXT,
        tipo TEXT DEFAULT 'contatos',
        criadoEm INTEGER NOT NULL
      );
    `);

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

    // Migrações seguras de sessions
    const colunasExtras = [
      'status TEXT DEFAULT "ai"',
      'assignedOperator TEXT',
      'slaStartedAt TEXT',
      'statusFinanceiro TEXT',
      'cotaValor TEXT',
      'pixValor TEXT',
      'avatar TEXT',
      'telefone TEXT',
      'notasInternasJson TEXT',
      'carteiraId TEXT DEFAULT "carteira_atendimento"',
      'carteiraNome TEXT DEFAULT "Atendimento Geral & Reservas"',
      'assignedOperatorId TEXT',
      'assignedOperatorName TEXT',
      'isGroup INTEGER DEFAULT 0'
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
        senderName TEXT,
        senderRole TEXT,
        operatorId TEXT,
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

    const colunasMensagens = [
      'senderName TEXT',
      'senderRole TEXT',
      'operatorId TEXT'
    ];
    for (const col of colunasMensagens) {
      try {
        this.db.exec(`ALTER TABLE messages ADD COLUMN ${col};`);
      } catch (e) {
        // Coluna já existe
      }
    }

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

    // 5. Tabela de Cobranças e Boletos com Split Pix
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS cobrancas (
        id TEXT PRIMARY KEY,
        unidadeId TEXT NOT NULL,
        moradorNome TEXT NOT NULL,
        moradorTelefone TEXT,
        remoteJid TEXT,
        tipo TEXT NOT NULL,
        competencia TEXT NOT NULL,
        vencimento TEXT NOT NULL,
        valor REAL NOT NULL,
        linhaDigitavel TEXT,
        txid TEXT UNIQUE NOT NULL,
        pixCopiaECola TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'aberto',
        pagoEm TEXT,
        formaPagamento TEXT,
        comprovanteId TEXT,
        splitCondominio REAL NOT NULL,
        splitAdministradora REAL NOT NULL,
        criadoEm TEXT NOT NULL
      );
    `);

    // 6. Tabela de Reservas de Espaços Comuns
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS reservas (
        id TEXT PRIMARY KEY,
        areaId TEXT NOT NULL,
        areaNome TEXT NOT NULL,
        unidadeId TEXT NOT NULL,
        moradorNome TEXT NOT NULL,
        moradorTelefone TEXT NOT NULL,
        remoteJid TEXT,
        dataReserva TEXT NOT NULL,
        periodo TEXT NOT NULL,
        convidadosQtd INTEGER DEFAULT 0,
        taxaTotal REAL NOT NULL DEFAULT 0,
        status TEXT NOT NULL DEFAULT 'confirmada',
        statusCobranca TEXT NOT NULL DEFAULT 'faturado_proximo_boleto',
        cobrancaId TEXT,
        protocoloSiscon TEXT NOT NULL,
        criadoEm TEXT NOT NULL
      );
    `);

    // 7. Tabela de Ordens de Serviço (Manutenção Predial)
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS manutencoes (
        id TEXT PRIMARY KEY,
        codigo TEXT UNIQUE NOT NULL,
        titulo TEXT NOT NULL,
        descricao TEXT,
        categoria TEXT NOT NULL,
        localizacao TEXT NOT NULL,
        urgencia TEXT NOT NULL DEFAULT 'media',
        status TEXT NOT NULL DEFAULT 'pendente',
        solicitanteNome TEXT NOT NULL,
        solicitanteUnidade TEXT,
        solicitanteTelefone TEXT,
        remoteJid TEXT,
        responsavelNome TEXT,
        responsavelTelefone TEXT,
        custoEstimado REAL DEFAULT 0,
        custoReal REAL DEFAULT 0,
        fotoAntesUrl TEXT,
        fotoDepoisUrl TEXT,
        observacoes TEXT,
        criadoEm TEXT NOT NULL,
        concluidoEm TEXT
      );
    `);

    // 8. Tabela de Condomínios (Multi-Condomínio / White-label)
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS condominios (
        id TEXT PRIMARY KEY,
        nome TEXT NOT NULL,
        cnpj TEXT NOT NULL,
        endereco TEXT NOT NULL,
        cidade TEXT NOT NULL,
        estado TEXT NOT NULL,
        unidadesQtd INTEGER NOT NULL,
        administradoraNome TEXT NOT NULL,
        taxaAdmPercentual REAL NOT NULL,
        logoUrl TEXT,
        criadoEm TEXT NOT NULL
      );
    `);

    // 9. Tabela de Decisões e Auditoria de IA (Transparência & Governança)
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS ai_decisions (
        id TEXT PRIMARY KEY,
        condominioId TEXT NOT NULL,
        pergunta TEXT NOT NULL,
        resposta TEXT NOT NULL,
        artigoCitado TEXT,
        documentoCitado TEXT,
        scoreConfianca REAL NOT NULL,
        nivelAutonomia INTEGER NOT NULL,
        statusAprovacao TEXT NOT NULL,
        aprovadoPor TEXT,
        tokensConsumidos INTEGER NOT NULL,
        provedor TEXT NOT NULL,
        modelo TEXT NOT NULL,
        timestamp TEXT NOT NULL
      );
    `);

    // 10. Tabela de Pendências de Supervisão (Human-in-the-Loop Guardrails)
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS pendencias_supervisao (
        id TEXT PRIMARY KEY,
        condominioId TEXT NOT NULL,
        tipo TEXT NOT NULL,
        descricao TEXT NOT NULL,
        solicitanteNome TEXT NOT NULL,
        unidadeId TEXT NOT NULL,
        dadosJson TEXT,
        status TEXT NOT NULL DEFAULT 'pendente',
        analisadoPor TEXT,
        justificativa TEXT,
        criadoEm TEXT NOT NULL,
        respondidoEm TEXT
      );
    `);

    // 11. Tabela de Visitas e Controle de Acesso (Portaria Digital)
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS visitas (
        id TEXT PRIMARY KEY,
        visitanteNome TEXT NOT NULL,
        documento TEXT,
        unidade TEXT NOT NULL,
        tipo TEXT NOT NULL DEFAULT 'visita',
        dataEntrada TEXT NOT NULL,
        horaEntrada TEXT NOT NULL,
        estacionamento TEXT,
        qrCodeToken TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'autorizado',
        criadoEm TEXT NOT NULL
      );
    `);

    // 12. Tabela de Encomendas Recebidas
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS encomendas (
        id TEXT PRIMARY KEY,
        destinatarioNome TEXT NOT NULL,
        unidade TEXT NOT NULL,
        transportadora TEXT NOT NULL,
        codigoRastreio TEXT NOT NULL,
        dataChegada TEXT NOT NULL,
        horaChegada TEXT NOT NULL,
        codigoRetirada TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'aguardando_retirada',
        fotoUrl TEXT,
        notificadoWhatsapp INTEGER DEFAULT 1,
        retiradoEm TEXT,
        criadoEm TEXT NOT NULL
      );
    `);

    // 13. Tabela de Comunicados Oficiais e Murais
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS comunicados (
        id TEXT PRIMARY KEY,
        condominioId TEXT NOT NULL,
        condominioNome TEXT NOT NULL,
        titulo TEXT NOT NULL,
        conteudo TEXT NOT NULL,
        data TEXT NOT NULL,
        categoria TEXT NOT NULL DEFAULT 'geral',
        autor TEXT NOT NULL,
        publico TEXT DEFAULT 'todos',
        disparadoWhatsapp INTEGER DEFAULT 0,
        criadoEm TEXT NOT NULL
      );
    `);

    // 14. Tabela de Avaliações de Satisfação (CSAT / NPS)
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS avaliacoes_csat (
        id TEXT PRIMARY KEY,
        remoteJid TEXT NOT NULL,
        moradorNome TEXT,
        unidadeId TEXT,
        carteiraId TEXT,
        operadorId TEXT,
        operadorNome TEXT,
        nota INTEGER NOT NULL,
        comentario TEXT,
        criadoEm INTEGER NOT NULL
      );
    `);

    // 15. Tabela de Disparos da Régua de Cobrança Preventiva
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS regua_disparos (
        id TEXT PRIMARY KEY,
        cobrancaId TEXT NOT NULL,
        remoteJid TEXT NOT NULL,
        moradorNome TEXT,
        unidadeId TEXT,
        tipoRegua TEXT NOT NULL,
        valor REAL NOT NULL,
        vencimento TEXT NOT NULL,
        disparadoEm TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'enviado'
      );
    `);

    // Alimentação inicial de dados operacionais (se tabelas estiverem vazias)
    this.seedInitialOperationalData();
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
      assignedOperatorId: row.assignedOperatorId || undefined,
      carteiraId: row.carteiraId || (row.remoteJid.endsWith('@g.us') ? 'carteira_grupos' : 'carteira_atendimento'),
      carteiraNome: row.carteiraNome || (row.remoteJid.endsWith('@g.us') ? 'Grupos de WhatsApp dos Blocos' : 'Atendimento Geral & Reservas'),
      isGroup: Boolean(row.isGroup || row.remoteJid.endsWith('@g.us')),
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
        id, remoteJid, sender, senderName, senderRole, operatorId, text, timestamp, mediaUrl, mediaType, pixCode, isAudio, duration, audioSummary, audioTranscription, createdAt
      ) VALUES (
        ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?
      )
      ON CONFLICT(id) DO UPDATE SET
        text = excluded.text,
        senderName = excluded.senderName,
        senderRole = excluded.senderRole,
        operatorId = excluded.operatorId,
        pixCode = excluded.pixCode;
    `);

    stmt.run(
      msg.id,
      remoteJid,
      msg.sender,
      msg.senderName || null,
      msg.senderRole || null,
      msg.operatorId || null,
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
      senderName: r.senderName || undefined,
      senderRole: r.senderRole || undefined,
      operatorId: r.operatorId || undefined,
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
  // OPERAÇÕES DE CARTEIRAS DE ATENDIMENTO
  // ==========================================

  public getCarteiras(): Carteira[] {
    const stmt = this.db.prepare('SELECT * FROM carteiras ORDER BY criadoEm ASC');
    const rows = stmt.all() as any[];

    // Adiciona contagem de atendimentos ativos por carteira e status operacionais
    const stmtMetrics = this.db.prepare(`
      SELECT 
        carteiraId, 
        count(*) as total,
        sum(CASE WHEN status = 'waiting_human' OR isHumanHandoff = 1 THEN 1 ELSE 0 END) as aguardandoHumano,
        sum(CASE WHEN status = 'in_service' THEN 1 ELSE 0 END) as emAtendimento,
        sum(CASE WHEN status = 'ai' OR status = 'closed' THEN 1 ELSE 0 END) as resolvidosIA
      FROM sessions 
      GROUP BY carteiraId
    `);
    const metrics = stmtMetrics.all() as any[];
    const mapMetrics = new Map<string, { total: number; aguardandoHumano: number; emAtendimento: number; resolvidosIA: number }>();
    metrics.forEach(m => mapMetrics.set(m.carteiraId, {
      total: Number(m.total || 0),
      aguardandoHumano: Number(m.aguardandoHumano || 0),
      emAtendimento: Number(m.emAtendimento || 0),
      resolvidosIA: Number(m.resolvidosIA || 0)
    }));

    // Métricas de CSAT / NPS por carteira
    const mapCsat = new Map<string, { media: number; total: number }>();
    try {
      const stmtCsat = this.db.prepare(`
        SELECT carteiraId, avg(nota) as media, count(*) as total
        FROM avaliacoes_csat
        WHERE carteiraId IS NOT NULL
        GROUP BY carteiraId
      `);
      const csatRows = stmtCsat.all() as any[];
      csatRows.forEach(c => {
        if (c.carteiraId) {
          mapCsat.set(c.carteiraId, {
            media: Number(Number(c.media || 0).toFixed(1)),
            total: Number(c.total || 0)
          });
        }
      });
    } catch (e) {}

    return rows.map(r => {
      const met = mapMetrics.get(r.id) || { total: 0, aguardandoHumano: 0, emAtendimento: 0, resolvidosIA: 0 };
      const csat = mapCsat.get(r.id) || { media: 5.0, total: 0 };
      return {
        id: r.id,
        nome: r.nome,
        descricao: r.descricao || undefined,
        cor: r.cor || '#4F46E5',
        operadorResponsavelId: r.operadorResponsavelId || undefined,
        operadorResponsavelNome: r.operadorResponsavelNome || undefined,
        tipo: r.tipo as any || 'contatos',
        criadoEm: r.criadoEm,
        totalConversas: met.total,
        aguardandoHumano: met.aguardandoHumano,
        emAtendimento: met.emAtendimento,
        resolvidosIA: met.resolvidosIA,
        mediaCSAT: csat.media,
        totalAvaliacoes: csat.total
      };
    });
  }

  public getCarteira(id: string): Carteira | null {
    const stmt = this.db.prepare('SELECT * FROM carteiras WHERE id = ?');
    const r = stmt.get(id) as any;
    if (!r) return null;
    return {
      id: r.id,
      nome: r.nome,
      descricao: r.descricao || undefined,
      cor: r.cor || '#4F46E5',
      operadorResponsavelId: r.operadorResponsavelId || undefined,
      operadorResponsavelNome: r.operadorResponsavelNome || undefined,
      tipo: r.tipo as any || 'contatos',
      criadoEm: r.criadoEm
    };
  }

  public saveCarteira(c: Carteira): void {
    const stmt = this.db.prepare(`
      INSERT INTO carteiras (id, nome, descricao, cor, operadorResponsavelId, operadorResponsavelNome, tipo, criadoEm)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        nome = excluded.nome,
        descricao = excluded.descricao,
        cor = excluded.cor,
        operadorResponsavelId = excluded.operadorResponsavelId,
        operadorResponsavelNome = excluded.operadorResponsavelNome,
        tipo = excluded.tipo;
    `);
    stmt.run(
      c.id,
      c.nome,
      c.descricao || null,
      c.cor || '#4F46E5',
      c.operadorResponsavelId || null,
      c.operadorResponsavelNome || null,
      c.tipo || 'contatos',
      c.criadoEm || Date.now()
    );
  }

  public atribuirConversaCarteira(
    remoteJid: string,
    carteiraId: string,
    carteiraNome?: string,
    operadorId?: string,
    operadorNome?: string
  ): boolean {
    const carteira = this.getCarteira(carteiraId);
    const finalNome = carteiraNome || carteira?.nome || 'Carteira Geral';
    const finalOpNome = operadorNome || carteira?.operadorResponsavelNome;
    const finalOpId = operadorId || carteira?.operadorResponsavelId;

    const stmt = this.db.prepare(`
      UPDATE sessions SET
        carteiraId = ?,
        carteiraNome = ?,
        assignedOperator = ?,
        assignedOperatorId = ?
      WHERE remoteJid = ?;
    `);
    const res = stmt.run(carteiraId, finalNome, finalOpNome || null, finalOpId || null, remoteJid);
    return res.changes > 0;
  }

  // ==========================================
  // OPERAÇÕES DE COBRANÇAS & FINTECH SPLIT
  // ==========================================

  public saveCobranca(c: Cobranca): void {
    const stmt = this.db.prepare(`
      INSERT INTO cobrancas (
        id, unidadeId, moradorNome, moradorTelefone, remoteJid, tipo, competencia, vencimento, valor,
        linhaDigitavel, txid, pixCopiaECola, status, pagoEm, formaPagamento, comprovanteId,
        splitCondominio, splitAdministradora, criadoEm
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        status = excluded.status,
        pagoEm = excluded.pagoEm,
        formaPagamento = excluded.formaPagamento,
        comprovanteId = excluded.comprovanteId;
    `);

    stmt.run(
      c.id,
      c.unidadeId,
      c.moradorNome,
      c.moradorTelefone || null,
      c.remoteJid || null,
      c.tipo,
      c.competencia,
      c.vencimento,
      c.valor,
      c.linhaDigitavel || null,
      c.txid,
      c.pixCopiaECola,
      c.status,
      c.pagoEm || null,
      c.formaPagamento || null,
      c.comprovanteId || null,
      c.splitCondominio,
      c.splitAdministradora,
      c.criadoEm || new Date().toISOString()
    );
  }

  public getCobrancas(filtro?: { status?: string; unidadeId?: string }): Cobranca[] {
    let query = 'SELECT * FROM cobrancas';
    const params: any[] = [];
    const where: string[] = [];

    if (filtro?.status && filtro.status !== 'todos') {
      where.push('status = ?');
      params.push(filtro.status);
    }
    if (filtro?.unidadeId) {
      where.push('unidadeId = ?');
      params.push(filtro.unidadeId);
    }

    if (where.length > 0) {
      query += ' WHERE ' + where.join(' AND ');
    }
    query += ' ORDER BY criadoEm DESC';

    const stmt = this.db.prepare(query);
    const rows = stmt.all(...params) as any[];

    return rows.map(r => ({
      id: r.id,
      unidadeId: r.unidadeId,
      moradorNome: r.moradorNome,
      moradorTelefone: r.moradorTelefone || undefined,
      remoteJid: r.remoteJid || undefined,
      tipo: r.tipo as any,
      competencia: r.competencia,
      vencimento: r.vencimento,
      valor: r.valor,
      linhaDigitavel: r.linhaDigitavel || undefined,
      txid: r.txid,
      pixCopiaECola: r.pixCopiaECola,
      status: r.status as any,
      pagoEm: r.pagoEm || undefined,
      formaPagamento: r.formaPagamento || undefined,
      comprovanteId: r.comprovanteId || undefined,
      splitCondominio: r.splitCondominio,
      splitAdministradora: r.splitAdministradora,
      criadoEm: r.criadoEm
    }));
  }

  public getCobrancaByTxid(txid: string): Cobranca | null {
    const stmt = this.db.prepare('SELECT * FROM cobrancas WHERE txid = ? OR id = ?');
    const r = stmt.get(txid, txid) as any;
    if (!r) return null;

    return {
      id: r.id,
      unidadeId: r.unidadeId,
      moradorNome: r.moradorNome,
      moradorTelefone: r.moradorTelefone || undefined,
      remoteJid: r.remoteJid || undefined,
      tipo: r.tipo as any,
      competencia: r.competencia,
      vencimento: r.vencimento,
      valor: r.valor,
      linhaDigitavel: r.linhaDigitavel || undefined,
      txid: r.txid,
      pixCopiaECola: r.pixCopiaECola,
      status: r.status as any,
      pagoEm: r.pagoEm || undefined,
      formaPagamento: r.formaPagamento || undefined,
      comprovanteId: r.comprovanteId || undefined,
      splitCondominio: r.splitCondominio,
      splitAdministradora: r.splitAdministradora,
      criadoEm: r.criadoEm
    };
  }

  public liquidarCobranca(txidOuId: string, formaPagamento: string = 'pix', comprovanteId?: string): Cobranca | null {
    const cobranca = this.getCobrancaByTxid(txidOuId);
    if (!cobranca) return null;

    const dataPagamento = new Date().toISOString();
    const compId = comprovanteId || `COMP-BACEN-${Date.now().toString().slice(-8)}`;

    const stmt = this.db.prepare(`
      UPDATE cobrancas
      SET status = 'pago', pagoEm = ?, formaPagamento = ?, comprovanteId = ?
      WHERE id = ?
    `);
    stmt.run(dataPagamento, formaPagamento, compId, cobranca.id);

    // Se o morador tiver sessão ativa no WhatsApp e a cobrança for cota, regulariza seu status
    if (cobranca.remoteJid) {
      const sessStmt = this.db.prepare(`
        UPDATE sessions
        SET statusFinanceiro = 'regular', pixValor = '0.00'
        WHERE remoteJid = ?
      `);
      sessStmt.run(cobranca.remoteJid);
    }

    return this.getCobrancaByTxid(cobranca.id);
  }

  public getMetricasFinanceiras() {
    const rows = this.db.prepare('SELECT status, valor, splitCondominio, splitAdministradora FROM cobrancas').all() as any[];

    const pagas = rows.filter(r => r.status === 'pago');
    const totalTransacionado = pagas.reduce((acc, r) => acc + (r.valor || 0), 0);
    const saldoSplitAdm = pagas.reduce((acc, r) => acc + (r.splitAdministradora || 0), 0);
    const saldoCondominio = pagas.reduce((acc, r) => acc + (r.splitCondominio || 0), 0);

    // O condomínio tem 240 unidades no total.
    // 228 são adimplentes pré-carregadas + qualquer pagamento recente das demais
    const cobrancasPagasCount = pagas.length;
    const unidadesBaseAdimplentes = 227; // Base de unidades pagantes
    const unidadesAdimplentesCalculadas = Math.min(240, unidadesBaseAdimplentes + cobrancasPagasCount);
    const totalUnidades = 240;
    const taxaAdimplencia = parseFloat(((unidadesAdimplentesCalculadas / totalUnidades) * 100).toFixed(1));

    return {
      totalTransacionado,
      saldoSplitAdm,
      saldoCondominio,
      unidadesAdimplentes: unidadesAdimplentesCalculadas,
      totalUnidades,
      taxaAdimplencia: `${taxaAdimplencia}%`,
      cobrancasPagas: pagas.length,
      cobrancasAbertas: rows.filter(r => r.status === 'aberto' || r.status === 'vencido').length
    };
  }

  // ==========================================
  // OPERAÇÕES DE RESERVAS DE ÁREAS COMUNS
  // ==========================================

  public saveReserva(r: Reserva): void {
    const stmt = this.db.prepare(`
      INSERT INTO reservas (
        id, areaId, areaNome, unidadeId, moradorNome, moradorTelefone, remoteJid, dataReserva,
        periodo, convidadosQtd, taxaTotal, status, statusCobranca, cobrancaId, protocoloSiscon, criadoEm
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        status = excluded.status,
        statusCobranca = excluded.statusCobranca,
        cobrancaId = excluded.cobrancaId;
    `);

    stmt.run(
      r.id,
      r.areaId,
      r.areaNome,
      r.unidadeId,
      r.moradorNome,
      r.moradorTelefone,
      r.remoteJid || null,
      r.dataReserva,
      r.periodo,
      r.convidadosQtd || 0,
      r.taxaTotal || 0,
      r.status,
      r.statusCobranca,
      r.cobrancaId || null,
      r.protocoloSiscon,
      r.criadoEm || new Date().toISOString()
    );
  }

  public getReservas(filtro?: { areaId?: string; dataReserva?: string }): Reserva[] {
    let query = 'SELECT * FROM reservas';
    const params: any[] = [];
    const where: string[] = [];

    if (filtro?.areaId) {
      where.push('areaId = ?');
      params.push(filtro.areaId);
    }
    if (filtro?.dataReserva) {
      where.push('dataReserva = ?');
      params.push(filtro.dataReserva);
    }

    if (where.length > 0) {
      query += ' WHERE ' + where.join(' AND ');
    }
    query += ' ORDER BY dataReserva ASC';

    const stmt = this.db.prepare(query);
    const rows = stmt.all(...params) as any[];

    return rows.map(r => ({
      id: r.id,
      areaId: r.areaId,
      areaNome: r.areaNome,
      unidadeId: r.unidadeId,
      moradorNome: r.moradorNome,
      moradorTelefone: r.moradorTelefone,
      remoteJid: r.remoteJid || undefined,
      dataReserva: r.dataReserva,
      periodo: r.periodo,
      convidadosQtd: r.convidadosQtd,
      taxaTotal: r.taxaTotal,
      status: r.status as any,
      statusCobranca: r.statusCobranca as any,
      cobrancaId: r.cobrancaId || undefined,
      protocoloSiscon: r.protocoloSiscon,
      criadoEm: r.criadoEm
    }));
  }

  public verificarConflitoReserva(areaId: string, dataReserva: string, ignorarId?: string): boolean {
    let query = `
      SELECT COUNT(*) as count FROM reservas
      WHERE areaId = ? AND dataReserva = ? AND status != 'cancelada'
    `;
    const params: any[] = [areaId, dataReserva];

    if (ignorarId) {
      query += ' AND id != ?';
      params.push(ignorarId);
    }

    const res = this.db.prepare(query).get(...params) as any;
    return Boolean(res && res.count > 0);
  }

  public cancelarReserva(id: string): boolean {
    const stmt = this.db.prepare("UPDATE reservas SET status = 'cancelada' WHERE id = ?");
    const info = stmt.run(id);
    return info.changes > 0;
  }

  // ==========================================
  // OPERAÇÕES DE MANUTENÇÃO PREDIAL (ORDENS DE SERVIÇO)
  // ==========================================

  public saveManutencao(m: OrdemManutencao): void {
    const stmt = this.db.prepare(`
      INSERT INTO manutencoes (
        id, codigo, titulo, descricao, categoria, localizacao, urgencia, status, solicitanteNome,
        solicitanteUnidade, solicitanteTelefone, remoteJid, responsavelNome, responsavelTelefone,
        custoEstimado, custoReal, fotoAntesUrl, fotoDepoisUrl, observacoes, criadoEm, concluidoEm
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        status = excluded.status,
        responsavelNome = excluded.responsavelNome,
        responsavelTelefone = excluded.responsavelTelefone,
        custoReal = excluded.custoReal,
        fotoDepoisUrl = excluded.fotoDepoisUrl,
        observacoes = excluded.observacoes,
        concluidoEm = excluded.concluidoEm;
    `);

    stmt.run(
      m.id,
      m.codigo,
      m.titulo,
      m.descricao || null,
      m.categoria,
      m.localizacao,
      m.urgencia,
      m.status,
      m.solicitanteNome,
      m.solicitanteUnidade || null,
      m.solicitanteTelefone || null,
      m.remoteJid || null,
      m.responsavelNome || null,
      m.responsavelTelefone || null,
      m.custoEstimado || 0,
      m.custoReal || 0,
      m.fotoAntesUrl || null,
      m.fotoDepoisUrl || null,
      m.observacoes || null,
      m.criadoEm || new Date().toISOString(),
      m.concluidoEm || null
    );
  }

  public getManutencoes(filtro?: { status?: string; categoria?: string }): OrdemManutencao[] {
    let query = 'SELECT * FROM manutencoes';
    const params: any[] = [];
    const where: string[] = [];

    if (filtro?.status && filtro.status !== 'todos') {
      where.push('status = ?');
      params.push(filtro.status);
    }
    if (filtro?.categoria && filtro.categoria !== 'todas') {
      where.push('categoria = ?');
      params.push(filtro.categoria);
    }

    if (where.length > 0) {
      query += ' WHERE ' + where.join(' AND ');
    }
    query += ' ORDER BY criadoEm DESC';

    const stmt = this.db.prepare(query);
    const rows = stmt.all(...params) as any[];

    return rows.map(r => ({
      id: r.id,
      codigo: r.codigo,
      titulo: r.titulo,
      descricao: r.descricao || undefined,
      categoria: r.categoria as any,
      localizacao: r.localizacao,
      urgencia: r.urgencia as any,
      status: r.status as any,
      solicitanteNome: r.solicitanteNome,
      solicitanteUnidade: r.solicitanteUnidade || undefined,
      solicitanteTelefone: r.solicitanteTelefone || undefined,
      remoteJid: r.remoteJid || undefined,
      responsavelNome: r.responsavelNome || undefined,
      responsavelTelefone: r.responsavelTelefone || undefined,
      custoEstimado: r.custoEstimado,
      custoReal: r.custoReal,
      fotoAntesUrl: r.fotoAntesUrl || undefined,
      fotoDepoisUrl: r.fotoDepoisUrl || undefined,
      observacoes: r.observacoes || undefined,
      criadoEm: r.criadoEm,
      concluidoEm: r.concluidoEm || undefined
    }));
  }

  public getManutencaoById(idOuCodigo: string): OrdemManutencao | null {
    const stmt = this.db.prepare('SELECT * FROM manutencoes WHERE id = ? OR codigo = ?');
    const r = stmt.get(idOuCodigo, idOuCodigo) as any;
    if (!r) return null;

    return {
      id: r.id,
      codigo: r.codigo,
      titulo: r.titulo,
      descricao: r.descricao || undefined,
      categoria: r.categoria as any,
      localizacao: r.localizacao,
      urgencia: r.urgencia as any,
      status: r.status as any,
      solicitanteNome: r.solicitanteNome,
      solicitanteUnidade: r.solicitanteUnidade || undefined,
      solicitanteTelefone: r.solicitanteTelefone || undefined,
      remoteJid: r.remoteJid || undefined,
      responsavelNome: r.responsavelNome || undefined,
      responsavelTelefone: r.responsavelTelefone || undefined,
      custoEstimado: r.custoEstimado,
      custoReal: r.custoReal,
      fotoAntesUrl: r.fotoAntesUrl || undefined,
      fotoDepoisUrl: r.fotoDepoisUrl || undefined,
      observacoes: r.observacoes || undefined,
      criadoEm: r.criadoEm,
      concluidoEm: r.concluidoEm || undefined
    };
  }

  public updateManutencaoStatus(
    idOuCodigo: string,
    status: 'pendente' | 'em_andamento' | 'concluido' | 'cancelado',
    responsavelNome?: string,
    fotoDepoisUrl?: string,
    observacoes?: string
  ): OrdemManutencao | null {
    const os = this.getManutencaoById(idOuCodigo);
    if (!os) return null;

    const concluidoEm = status === 'concluido' ? new Date().toISOString() : os.concluidoEm || null;
    const novoResp = responsavelNome || os.responsavelNome;
    const novaFoto = fotoDepoisUrl || os.fotoDepoisUrl;
    const novaObs = observacoes || os.observacoes;

    const stmt = this.db.prepare(`
      UPDATE manutencoes
      SET status = ?, responsavelNome = ?, fotoDepoisUrl = ?, observacoes = ?, concluidoEm = ?
      WHERE id = ?
    `);
    stmt.run(status, novoResp || null, novaFoto || null, novaObs || null, concluidoEm, os.id);

    return this.getManutencaoById(os.id);
  }

  public proximoCodigoOs(): string {
    const res = this.db.prepare('SELECT COUNT(*) as total FROM manutencoes').get() as any;
    const nextNum = (res?.total || 0) + 89;
    return `OS-2026-${String(nextNum).padStart(3, '0')}`;
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

  // ==========================================
  // CONDOMÍNIOS (MULTI-CONDOMÍNIO / WHITE-LABEL)
  // ==========================================
  public getCondominios(): Condominio[] {
    const stmt = this.db.prepare('SELECT * FROM condominios ORDER BY nome ASC');
    return stmt.all() as any[];
  }

  public getCondominioById(id: string): Condominio | null {
    const stmt = this.db.prepare('SELECT * FROM condominios WHERE id = ?');
    const row = stmt.get(id);
    return (row as any) || null;
  }

  public saveCondominio(c: Condominio): void {
    const stmt = this.db.prepare(`
      INSERT INTO condominios (id, nome, cnpj, endereco, cidade, estado, unidadesQtd, administradoraNome, taxaAdmPercentual, logoUrl, criadoEm)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        nome = excluded.nome,
        cnpj = excluded.cnpj,
        endereco = excluded.endereco,
        cidade = excluded.cidade,
        estado = excluded.estado,
        unidadesQtd = excluded.unidadesQtd,
        administradoraNome = excluded.administradoraNome,
        taxaAdmPercentual = excluded.taxaAdmPercentual,
        logoUrl = excluded.logoUrl
    `);
    stmt.run(
      c.id, c.nome, c.cnpj, c.endereco, c.cidade, c.estado, c.unidadesQtd,
      c.administradoraNome, c.taxaAdmPercentual, c.logoUrl || null, c.criadoEm
    );
  }

  // ==========================================
  // GOVERNANÇA DE IA & AUDITORIA DE DECISÕES
  // ==========================================
  public saveAIDecision(d: AIDecision): void {
    const stmt = this.db.prepare(`
      INSERT INTO ai_decisions (
        id, condominioId, pergunta, resposta, artigoCitado, documentoCitado,
        scoreConfianca, nivelAutonomia, statusAprovacao, aprovadoPor,
        tokensConsumidos, provedor, modelo, timestamp
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    stmt.run(
      d.id, d.condominioId, d.pergunta, d.resposta, d.artigoCitado || null, d.documentoCitado || null,
      d.scoreConfianca, d.nivelAutonomia, d.statusAprovacao, d.aprovadoPor || null,
      d.tokensConsumidos, d.provedor, d.modelo, d.timestamp
    );
  }

  public getAIDecisions(condominioId?: string, limit: number = 30): AIDecision[] {
    if (condominioId) {
      const stmt = this.db.prepare('SELECT * FROM ai_decisions WHERE condominioId = ? ORDER BY timestamp DESC LIMIT ?');
      return stmt.all(condominioId, limit) as any[];
    }
    const stmt = this.db.prepare('SELECT * FROM ai_decisions ORDER BY timestamp DESC LIMIT ?');
    return stmt.all(limit) as any[];
  }

  // ==========================================
  // HUMAN-IN-THE-LOOP / PENDÊNCIAS DE SUPERVISÃO
  // ==========================================
  public getPendenciasSupervisao(condominioId?: string, status?: string): PendenciaSupervisao[] {
    let sql = 'SELECT * FROM pendencias_supervisao WHERE 1=1';
    const params: any[] = [];
    if (condominioId) {
      sql += ' AND condominioId = ?';
      params.push(condominioId);
    }
    if (status) {
      sql += ' AND status = ?';
      params.push(status);
    }
    sql += ' ORDER BY criadoEm DESC';
    const stmt = this.db.prepare(sql);
    return stmt.all(...params) as any[];
  }

  public getPendenciaSupervisaoById(id: string): PendenciaSupervisao | null {
    const stmt = this.db.prepare('SELECT * FROM pendencias_supervisao WHERE id = ?');
    const row = stmt.get(id);
    return (row as any) || null;
  }

  public criarPendenciaSupervisao(p: PendenciaSupervisao): void {
    const stmt = this.db.prepare(`
      INSERT INTO pendencias_supervisao (
        id, condominioId, tipo, descricao, solicitanteNome, unidadeId, dadosJson, status, criadoEm
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    stmt.run(
      p.id, p.condominioId, p.tipo, p.descricao, p.solicitanteNome, p.unidadeId,
      p.dadosJson || null, p.status || 'pendente', p.criadoEm
    );
  }

  public responderPendenciaSupervisao(
    id: string,
    status: 'aprovado' | 'rejeitado',
    analisadoPor: string,
    justificativa?: string
  ): PendenciaSupervisao | null {
    const respondidoEm = new Date().toISOString();
    const stmt = this.db.prepare(`
      UPDATE pendencias_supervisao
      SET status = ?, analisadoPor = ?, justificativa = ?, respondidoEm = ?
      WHERE id = ?
    `);
    stmt.run(status, analisadoPor, justificativa || null, respondidoEm, id);
    return this.getPendenciaSupervisaoById(id);
  }

  // ==========================================
  // SEED DE DADOS OPERACIONAIS (FASE 3 & FASE 4/5)
  // ==========================================

  private seedInitialOperationalData() {
    // 1. Seed Cobranças
    const cCount = (this.db.prepare('SELECT COUNT(*) as total FROM cobrancas').get() as any)?.total || 0;
    if (cCount === 0) {
      const chavePix = 'financeiro@condominio.com.br';
      const condNome = 'CONDOMINIO RESIDENCIAL';
      const cidade = 'SAO PAULO';

      const cobrancasIniciais: Cobranca[] = [
        {
          id: 'cbr_101',
          unidadeId: 'unid_101',
          moradorNome: 'Carlos Eduardo Silva',
          moradorTelefone: '5511999990001',
          remoteJid: '5511999990001@s.whatsapp.net',
          tipo: 'cota_condominial',
          competencia: '11/2026',
          vencimento: 'Hoje (17/11/2026)',
          valor: 650.00,
          linhaDigitavel: '34191.79001 01043.510047 91020.150008 1 95380000065000',
          txid: 'CONDOVOLTO101NOV26',
          pixCopiaECola: gerarPayloadPix({ chave: chavePix, nomeBeneficiario: condNome, cidadeBeneficiario: cidade, valor: 650.00, txid: 'CONDOVOLTO101NOV26' }),
          status: 'aberto',
          splitCondominio: 630.50,
          splitAdministradora: 19.50,
          criadoEm: '2026-11-01T08:00:00.000Z'
        },
        {
          id: 'cbr_204',
          unidadeId: 'unid_204',
          moradorNome: 'Mariana de Souza',
          moradorTelefone: '5511999990002',
          remoteJid: '5511999990002@s.whatsapp.net',
          tipo: 'cota_condominial',
          competencia: '10/2026',
          vencimento: '10/10/2026 (Vencido)',
          valor: 1350.00,
          linhaDigitavel: '34191.79001 01043.510047 91020.150008 2 95380000135000',
          txid: 'CONDOVOLTO204OUT26',
          pixCopiaECola: gerarPayloadPix({ chave: chavePix, nomeBeneficiario: condNome, cidadeBeneficiario: cidade, valor: 1350.00, txid: 'CONDOVOLTO204OUT26' }),
          status: 'vencido',
          splitCondominio: 1309.50,
          splitAdministradora: 40.50,
          criadoEm: '2026-10-01T08:00:00.000Z'
        },
        {
          id: 'cbr_304',
          unidadeId: 'unid_304',
          moradorNome: 'Roberta Pires',
          moradorTelefone: '5511999990003',
          remoteJid: '5511999990003@s.whatsapp.net',
          tipo: 'taxa_reserva',
          competencia: '11/2026',
          vencimento: '16/11/2026',
          valor: 150.00,
          linhaDigitavel: '34191.79001 01043.510047 91020.150008 3 95380000015000',
          txid: 'CONDOVOLTO304RES15',
          pixCopiaECola: gerarPayloadPix({ chave: chavePix, nomeBeneficiario: condNome, cidadeBeneficiario: cidade, valor: 150.00, txid: 'CONDOVOLTO304RES15' }),
          status: 'pago',
          pagoEm: '2026-11-16T17:42:00.000Z',
          formaPagamento: 'pix',
          comprovanteId: 'E90400888202611161742000',
          splitCondominio: 145.50,
          splitAdministradora: 4.50,
          criadoEm: '2026-11-10T14:00:00.000Z'
        },
        {
          id: 'cbr_112',
          unidadeId: 'unid_112',
          moradorNome: 'Fernando Dias',
          moradorTelefone: '5511999990004',
          remoteJid: '5511999990004@s.whatsapp.net',
          tipo: 'acordo',
          competencia: '11/2026',
          vencimento: '16/11/2026',
          valor: 380.00,
          linhaDigitavel: '34191.79001 01043.510047 91020.150008 4 95380000038000',
          txid: 'CONDOVOLTO112AC2',
          pixCopiaECola: gerarPayloadPix({ chave: chavePix, nomeBeneficiario: condNome, cidadeBeneficiario: cidade, valor: 380.00, txid: 'CONDOVOLTO112AC2' }),
          status: 'pago',
          pagoEm: '2026-11-16T14:15:00.000Z',
          formaPagamento: 'pix',
          comprovanteId: 'E90400888202611161415000',
          splitCondominio: 368.60,
          splitAdministradora: 11.40,
          criadoEm: '2026-11-05T09:00:00.000Z'
        },
        {
          id: 'cbr_401',
          unidadeId: 'unid_401',
          moradorNome: 'Juliana Castro',
          moradorTelefone: '5511999990005',
          tipo: 'cota_condominial',
          competencia: '11/2026',
          vencimento: '17/11/2026',
          valor: 650.00,
          linhaDigitavel: '34191.79001 01043.510047 91020.150008 5 95380000065000',
          txid: 'CONDOVOLTO401NOV26',
          pixCopiaECola: gerarPayloadPix({ chave: chavePix, nomeBeneficiario: condNome, cidadeBeneficiario: cidade, valor: 650.00, txid: 'CONDOVOLTO401NOV26' }),
          status: 'pago',
          pagoEm: '2026-11-17T09:31:00.000Z',
          formaPagamento: 'pix',
          comprovanteId: 'E90400888202611170931000',
          splitCondominio: 630.50,
          splitAdministradora: 19.50,
          criadoEm: '2026-11-01T08:00:00.000Z'
        }
      ];

      for (const cob of cobrancasIniciais) {
        this.saveCobranca(cob);
      }
    }

    // 2. Seed Reservas
    const rCount = (this.db.prepare('SELECT COUNT(*) as total FROM reservas').get() as any)?.total || 0;
    if (rCount === 0) {
      const reservasIniciais: Reserva[] = [
        {
          id: 'res_9482',
          areaId: 'area_churrasqueira',
          areaNome: 'Espaço Gourmet & Churrasqueira A',
          unidadeId: 'unid_204',
          moradorNome: 'Mariana de Souza',
          moradorTelefone: '5511999990002',
          remoteJid: '5511999990002@s.whatsapp.net',
          dataReserva: '2026-11-21',
          periodo: '12:00 às 22:00',
          convidadosQtd: 20,
          taxaTotal: 150.00,
          status: 'confirmada',
          statusCobranca: 'faturado_proximo_boleto',
          protocoloSiscon: 'SIS-RES-9482',
          criadoEm: '2026-11-15T11:00:00.000Z'
        },
        {
          id: 'res_8821',
          areaId: 'area_salao_festas',
          areaNome: 'Salão de Festas Nobre',
          unidadeId: 'unid_101',
          moradorNome: 'Carlos Eduardo Silva',
          moradorTelefone: '5511999990001',
          remoteJid: '5511999990001@s.whatsapp.net',
          dataReserva: '2026-11-28',
          periodo: '18:00 às 02:00',
          convidadosQtd: 60,
          taxaTotal: 350.00,
          status: 'confirmada',
          statusCobranca: 'faturado_proximo_boleto',
          protocoloSiscon: 'SIS-RES-8821',
          criadoEm: '2026-11-14T16:30:00.000Z'
        },
        {
          id: 'res_7612',
          areaId: 'area_quadra',
          areaNome: 'Quadra Poliesportiva Iluminada',
          unidadeId: 'unid_304',
          moradorNome: 'Roberta Pires',
          moradorTelefone: '5511999990003',
          remoteJid: '5511999990003@s.whatsapp.net',
          dataReserva: '2026-11-19',
          periodo: '09:00 às 11:00',
          convidadosQtd: 10,
          taxaTotal: 0.00,
          status: 'confirmada',
          statusCobranca: 'isento',
          protocoloSiscon: 'SIS-RES-7612',
          criadoEm: '2026-11-16T10:15:00.000Z'
        }
      ];

      for (const res of reservasIniciais) {
        this.saveReserva(res);
      }
    }

    // 3. Seed Ordens de Manutenção
    const mCount = (this.db.prepare('SELECT COUNT(*) as total FROM manutencoes').get() as any)?.total || 0;
    if (mCount === 0) {
      const manutencoesIniciais: OrdemManutencao[] = [
        {
          id: 'manut_88',
          codigo: 'OS-2026-088',
          titulo: 'Lâmpada de LED Queimada no Corredor 3º Andar',
          descricao: 'Morador informou que a lâmpada em frente ao elevador social do 3º andar está oscilando e apagou.',
          categoria: 'eletrica',
          localizacao: 'Torre B - 3º Andar',
          urgencia: 'baixa',
          status: 'pendente',
          solicitanteNome: 'Carlos Eduardo Silva',
          solicitanteUnidade: 'Apt 101',
          solicitanteTelefone: '5511999990001',
          remoteJid: '5511999990001@s.whatsapp.net',
          responsavelNome: 'Zelador José Carlos',
          custoEstimado: 45.00,
          criadoEm: '2026-11-17T14:10:00.000Z'
        },
        {
          id: 'manut_87',
          codigo: 'OS-2026-087',
          titulo: 'Trava Eletromagnética do Portão da Garagem G1 com Ruído',
          descricao: 'Acionamento do portão basculante apresentando ruído metálico forte ao travar.',
          categoria: 'portoes',
          localizacao: 'Garagem Subsolo G1',
          urgencia: 'media',
          status: 'pendente',
          solicitanteNome: 'Portaria Principal',
          solicitanteUnidade: 'Portaria',
          responsavelNome: 'Zelador José Carlos',
          custoEstimado: 180.00,
          criadoEm: '2026-11-17T11:20:00.000Z'
        },
        {
          id: 'manut_86',
          codigo: 'OS-2026-086',
          titulo: 'Inspeção Preventiva de Vazamento na Válvula de Descarga',
          descricao: 'Telemetria detectou consumo atípico contínuo durante a madrugada.',
          categoria: 'hidraulica',
          localizacao: 'Apt 101 (Banheiro Suíte)',
          urgencia: 'alta',
          status: 'em_andamento',
          solicitanteNome: 'Carlos Eduardo Silva',
          solicitanteUnidade: 'Apt 101',
          solicitanteTelefone: '5511999990001',
          remoteJid: '5511999990001@s.whatsapp.net',
          responsavelNome: 'Zelador José Carlos',
          custoEstimado: 120.00,
          criadoEm: '2026-11-17T09:15:00.000Z'
        },
        {
          id: 'manut_85',
          codigo: 'OS-2026-085',
          titulo: 'Reparo na Mola Hidráulica da Porta do Hall de Entrada',
          descricao: 'Porta de vidro social batendo com força. Ajuste da mola de piso Dorma efetuado.',
          categoria: 'civil',
          localizacao: 'Hall Social Torre A',
          urgencia: 'baixa',
          status: 'concluido',
          solicitanteNome: 'Zeladoria',
          responsavelNome: 'Otávio Serralheria',
          custoEstimado: 250.00,
          custoReal: 230.00,
          fotoDepoisUrl: 'https://images.unsplash.com/photo-1558618666-fcd25c85cd64?w=600&auto=format&fit=crop&q=80',
          observacoes: 'Substituído o óleo hidráulico e recalibrada a velocidade de fechamento.',
          criadoEm: '2026-11-16T14:00:00.000Z',
          concluidoEm: '2026-11-16T16:30:00.000Z'
        }
      ];

      for (const m of manutencoesIniciais) {
        this.saveManutencao(m);
      }
    }

    // 4. Seed Condomínios (Multi-Condomínio)
    const condoCount = (this.db.prepare('SELECT COUNT(*) as total FROM condominios').get() as any)?.total || 0;
    if (condoCount === 0) {
      const condominiosIniciais: Condominio[] = [
        {
          id: 'condo_1',
          nome: 'Condomínio Residencial Jardins do Bosque',
          cnpj: '12.345.678/0001-90',
          endereco: 'Av. das Castanheiras, 1500 - Campo Belo',
          cidade: 'São Paulo',
          estado: 'SP',
          unidadesQtd: 240,
          administradoraNome: 'Nova Era Adm Condominial',
          taxaAdmPercentual: 6.5,
          logoUrl: 'https://images.unsplash.com/photo-1545324418-cc1a3fa10c00?w=120&auto=format&fit=crop&q=80',
          criadoEm: '2026-01-10T08:00:00.000Z'
        },
        {
          id: 'condo_2',
          nome: 'Edifício Solar dos Pinheiros',
          cnpj: '98.765.432/0001-10',
          endereco: 'Rua dos Pinheiros, 450 - Batel',
          cidade: 'Curitiba',
          estado: 'PR',
          unidadesQtd: 84,
          administradoraNome: 'Nova Era Adm Condominial',
          taxaAdmPercentual: 7.0,
          logoUrl: 'https://images.unsplash.com/photo-1560518883-ce09059eeffa?w=120&auto=format&fit=crop&q=80',
          criadoEm: '2026-03-15T08:00:00.000Z'
        },
        {
          id: 'condo_3',
          nome: 'Grand Tower Corporate & Living',
          cnpj: '33.221.100/0001-55',
          endereco: 'Av. Brigadeiro Faria Lima, 3200 - Itaim Bibi',
          cidade: 'São Paulo',
          estado: 'SP',
          unidadesQtd: 310,
          administradoraNome: 'Atlas Gestão de Ativos',
          taxaAdmPercentual: 5.8,
          logoUrl: 'https://images.unsplash.com/photo-1486406146926-c627a92ad1ab?w=120&auto=format&fit=crop&q=80',
          criadoEm: '2026-06-01T08:00:00.000Z'
        }
      ];

      for (const c of condominiosIniciais) {
        this.saveCondominio(c);
      }
    }

    // 5. Seed Pendências de Supervisão (Human-in-the-Loop)
    const pendCount = (this.db.prepare('SELECT COUNT(*) as total FROM pendencias_supervisao').get() as any)?.total || 0;
    if (pendCount === 0) {
      const pendenciasIniciais: PendenciaSupervisao[] = [
        {
          id: 'pend_1',
          condominioId: 'condo_1',
          tipo: 'desconto_acordo',
          descricao: 'Morador solicita 50% de desconto nos juros moratórios para quitação à vista de 3 cotas em atraso.',
          solicitanteNome: 'Carlos Eduardo Silva',
          unidadeId: 'Apt 101',
          dadosJson: JSON.stringify({ valorOriginal: 2450.00, propostaAVista: 2100.00, descontoJuros: 350.00 }),
          status: 'pendente',
          criadoEm: '2026-11-17T10:00:00.000Z'
        },
        {
          id: 'pend_2',
          condominioId: 'condo_1',
          tipo: 'isencao_reserva',
          descricao: 'Solicitação de isenção da taxa do Salão Gourmet para reunião extraordinária da comissão de obras.',
          solicitanteNome: 'Mariana de Souza',
          unidadeId: 'Apt 202',
          dadosJson: JSON.stringify({ dataReserva: '2026-11-25', motivo: 'Reunião Comissão de Obras' }),
          status: 'pendente',
          criadoEm: '2026-11-17T11:30:00.000Z'
        },
        {
          id: 'pend_3',
          condominioId: 'condo_1',
          tipo: 'infracao_multa',
          descricao: 'IA detectou reincidência de ruído após 22h e propõe notificação formal com advertência por infração ao Regimento.',
          solicitanteNome: 'Sistema IA - Guardrails',
          unidadeId: 'Apt 402',
          dadosJson: JSON.stringify({ artigo: 'Artigo 42 do Regimento', decibeis: 72, horario: '23:45' }),
          status: 'pendente',
          criadoEm: '2026-11-16T23:50:00.000Z'
        }
      ];

      for (const p of pendenciasIniciais) {
        this.criarPendenciaSupervisao(p);
      }
    }

    // 6. Seed Histórico de Decisões de IA
    const decCount = (this.db.prepare('SELECT COUNT(*) as total FROM ai_decisions').get() as any)?.total || 0;
    if (decCount === 0) {
      const decisoesIniciais: AIDecision[] = [
        {
          id: 'dec_1',
          condominioId: 'condo_1',
          pergunta: 'Até que horas posso usar a piscina com convidados?',
          resposta: 'De acordo com o Artigo 18 do Regimento Interno, a piscina funciona das 08h às 20h nos dias de semana e das 08h às 22h aos fins de semana e feriados. Visitantes são permitidos até o limite de 2 por unidade.',
          artigoCitado: 'Artigo 18',
          documentoCitado: 'Regimento Interno 2026',
          scoreConfianca: 0.96,
          nivelAutonomia: 1,
          statusAprovacao: 'auto_aprovado',
          tokensConsumidos: 320,
          provedor: 'Gemini',
          modelo: 'gemini-1.5-flash',
          timestamp: '2026-11-17T12:04:00.000Z'
        },
        {
          id: 'dec_2',
          condominioId: 'condo_1',
          pergunta: 'Posso pintar a porta do meu apartamento de preto fosco?',
          resposta: 'Não é permitido alterar a cor ou padrão da porta exterior. Conforme a Convenção Condominial (Artigo 5º, Parágrafo Único), qualquer alteração na fachada interna dos corredores depende de aprovação prévia em AGE com quórum qualificado.',
          artigoCitado: 'Artigo 5º, Parágrafo Único',
          documentoCitado: 'Convenção Condominial',
          scoreConfianca: 0.94,
          nivelAutonomia: 1,
          statusAprovacao: 'auto_aprovado',
          tokensConsumidos: 285,
          provedor: 'Gemini',
          modelo: 'gemini-1.5-flash',
          timestamp: '2026-11-17T11:42:00.000Z'
        },
        {
          id: 'dec_3',
          condominioId: 'condo_1',
          pergunta: 'Gostaria de negociar o parcelamento da cota de outubro com isenção total dos juros.',
          resposta: 'A proposta de parcelamento com isenção de encargos moratórios excede a autonomia automática da IA (Nível 2). A solicitação foi protocolada como pendência de supervisão e encaminhada à análise do síndico.',
          artigoCitado: 'Artigo 12 da Convenção',
          documentoCitado: 'Convenção Condominial',
          scoreConfianca: 0.91,
          nivelAutonomia: 2,
          statusAprovacao: 'pendente_sindico',
          tokensConsumidos: 310,
          provedor: 'Gemini',
          modelo: 'gemini-1.5-flash',
          timestamp: '2026-11-17T10:00:15.000Z'
        }
      ];

      for (const d of decisoesIniciais) {
        this.saveAIDecision(d);
      }
    }

    // 7. Seed Visitas (Portaria Digital)
    const visCount = (this.db.prepare('SELECT COUNT(*) as total FROM visitas').get() as any)?.total || 0;
    if (visCount === 0) {
      const visitasIniciais: Visita[] = [
        {
          id: 'vis_1',
          visitanteNome: 'Fernanda Rocha',
          documento: '44.891.203-9',
          unidade: '2511',
          tipo: 'visita',
          dataEntrada: 'Hoje',
          horaEntrada: '10:42',
          estacionamento: 'Vaga 3',
          qrCodeToken: 'QR-VIS-2511-8841',
          status: 'autorizado',
          criadoEm: '2026-11-17T10:40:00.000Z'
        },
        {
          id: 'vis_2',
          visitanteNome: 'Marcos Vinícius (Técnico Claro)',
          documento: '38.102.994-1',
          unidade: '1402',
          tipo: 'prestador',
          dataEntrada: 'Hoje',
          horaEntrada: '11:15',
          estacionamento: 'Vaga Visitante 1',
          qrCodeToken: 'QR-VIS-1402-9921',
          status: 'entrou',
          criadoEm: '2026-11-17T11:10:00.000Z'
        },
        {
          id: 'vis_3',
          visitanteNome: 'Lucas Oliveira',
          documento: '52.341.119-0',
          unidade: '101',
          tipo: 'visita',
          dataEntrada: 'Hoje',
          horaEntrada: '12:00',
          estacionamento: 'Vaga Visitante 2',
          qrCodeToken: 'QR-VIS-101-3312',
          status: 'autorizado',
          criadoEm: '2026-11-17T11:50:00.000Z'
        }
      ];
      for (const v of visitasIniciais) this.saveVisita(v);
    }

    // 8. Seed Encomendas (Portaria Digital)
    const encCount = (this.db.prepare('SELECT COUNT(*) as total FROM encomendas').get() as any)?.total || 0;
    if (encCount === 0) {
      const encomendasIniciais: Encomenda[] = [
        {
          id: 'enc_1',
          destinatarioNome: 'Carlos Eduardo Silva',
          unidade: 'Apt 101',
          transportadora: 'Mercado Livre',
          codigoRastreio: 'ML-88421092',
          dataChegada: 'Hoje',
          horaChegada: '09:15',
          codigoRetirada: 'RET-101-842',
          status: 'aguardando_retirada',
          fotoUrl: 'https://images.unsplash.com/photo-1586528116311-ad8dd3c8310d?w=400&auto=format&fit=crop&q=80',
          notificadoWhatsapp: true,
          criadoEm: '2026-11-17T09:15:00.000Z'
        },
        {
          id: 'enc_2',
          destinatarioNome: 'Mariana de Souza',
          unidade: 'Apt 204',
          transportadora: 'Amazon Prime',
          codigoRastreio: 'AMZ-99120412',
          dataChegada: 'Hoje',
          horaChegada: '10:30',
          codigoRetirada: 'RET-204-119',
          status: 'aguardando_retirada',
          fotoUrl: 'https://images.unsplash.com/photo-1566576912321-d58ddd7a6088?w=400&auto=format&fit=crop&q=80',
          notificadoWhatsapp: true,
          criadoEm: '2026-11-17T10:30:00.000Z'
        }
      ];
      for (const e of encomendasIniciais) this.saveEncomenda(e);
    }

    // 9. Seed Comunicados
    const comCount = (this.db.prepare('SELECT COUNT(*) as total FROM comunicados').get() as any)?.total || 0;
    if (comCount === 0) {
      const comunicadosIniciais: Comunicado[] = [
        {
          id: 'com_1',
          condominioId: 'condo_1',
          condominioNome: 'Residencial Jardins do Bosque',
          titulo: 'Manutenção Preventiva dos Elevadores (Bloco A)',
          conteudo: 'Informamos que o elevador social do Bloco A passará por manutenção preventiva nesta quinta-feira das 09h às 12h. O elevador de serviço funcionará normalmente.',
          data: '17/11/2026',
          categoria: 'manutencao',
          autor: 'Administração Predial',
          publico: 'Bloco A',
          disparadoWhatsapp: true
        },
        {
          id: 'com_2',
          condominioId: 'condo_1',
          condominioNome: 'Residencial Jardins do Bosque',
          titulo: 'Limpeza Semestral das Caixas d\'Água',
          conteudo: 'Conforme cronograma de higienização, haverá interrupção temporária no fornecimento de água na próxima terça-feira entre 08h e 14h. Pedimos a compreensão de todos.',
          data: '15/11/2026',
          categoria: 'urgente',
          autor: 'Síndico Geral',
          publico: 'Todos os Condôminos',
          disparadoWhatsapp: true
        }
      ];
      for (const c of comunicadosIniciais) this.saveComunicado(c);
    }
  }

  // ==========================================
  // OPERAÇÕES DE PORTARIA DIGITAL (VISITAS & ENCOMENDAS)
  // ==========================================

  public getVisitas(): Visita[] {
    const rows = this.db.prepare('SELECT * FROM visitas ORDER BY criadoEm DESC').all() as any[];
    return rows.map(r => ({
      id: r.id,
      visitanteNome: r.visitanteNome,
      documento: r.documento,
      unidade: r.unidade,
      tipo: r.tipo,
      dataEntrada: r.dataEntrada,
      horaEntrada: r.horaEntrada,
      estacionamento: r.estacionamento,
      qrCodeToken: r.qrCodeToken,
      status: r.status,
      criadoEm: r.criadoEm
    }));
  }

  public saveVisita(visita: Visita) {
    const stmt = this.db.prepare(`
      INSERT INTO visitas (id, visitanteNome, documento, unidade, tipo, dataEntrada, horaEntrada, estacionamento, qrCodeToken, status, criadoEm)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        visitanteNome = excluded.visitanteNome,
        documento = excluded.documento,
        unidade = excluded.unidade,
        tipo = excluded.tipo,
        dataEntrada = excluded.dataEntrada,
        horaEntrada = excluded.horaEntrada,
        estacionamento = excluded.estacionamento,
        qrCodeToken = excluded.qrCodeToken,
        status = excluded.status;
    `);
    stmt.run(
      visita.id,
      visita.visitanteNome,
      visita.documento || null,
      visita.unidade,
      visita.tipo,
      visita.dataEntrada,
      visita.horaEntrada,
      visita.estacionamento || null,
      visita.qrCodeToken,
      visita.status,
      visita.criadoEm
    );
  }

  public updateVisitaStatus(id: string, status: string): boolean {
    const stmt = this.db.prepare('UPDATE visitas SET status = ? WHERE id = ?');
    const res = stmt.run(status, id);
    return res.changes > 0;
  }

  public getEncomendas(): Encomenda[] {
    const rows = this.db.prepare('SELECT * FROM encomendas ORDER BY criadoEm DESC').all() as any[];
    return rows.map(r => ({
      id: r.id,
      destinatarioNome: r.destinatarioNome,
      unidade: r.unidade,
      transportadora: r.transportadora,
      codigoRastreio: r.codigoRastreio,
      dataChegada: r.dataChegada,
      horaChegada: r.horaChegada,
      codigoRetirada: r.codigoRetirada,
      status: r.status,
      fotoUrl: r.fotoUrl,
      notificadoWhatsapp: Boolean(r.notificadoWhatsapp),
      retiradoEm: r.retiradoEm,
      criadoEm: r.criadoEm
    }));
  }

  public saveEncomenda(encomenda: Encomenda) {
    const stmt = this.db.prepare(`
      INSERT INTO encomendas (id, destinatarioNome, unidade, transportadora, codigoRastreio, dataChegada, horaChegada, codigoRetirada, status, fotoUrl, notificadoWhatsapp, retiradoEm, criadoEm)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        destinatarioNome = excluded.destinatarioNome,
        unidade = excluded.unidade,
        transportadora = excluded.transportadora,
        codigoRastreio = excluded.codigoRastreio,
        status = excluded.status,
        notificadoWhatsapp = excluded.notificadoWhatsapp,
        retiradoEm = excluded.retiradoEm;
    `);
    stmt.run(
      encomenda.id,
      encomenda.destinatarioNome,
      encomenda.unidade,
      encomenda.transportadora,
      encomenda.codigoRastreio,
      encomenda.dataChegada,
      encomenda.horaChegada,
      encomenda.codigoRetirada,
      encomenda.status,
      encomenda.fotoUrl || null,
      encomenda.notificadoWhatsapp ? 1 : 0,
      encomenda.retiradoEm || null,
      encomenda.criadoEm
    );
  }

  public updateEncomendaStatus(id: string, status: string): boolean {
    const agora = new Date().toISOString();
    const stmt = this.db.prepare('UPDATE encomendas SET status = ?, retiradoEm = ? WHERE id = ?');
    const res = stmt.run(status, status === 'entregue' ? agora : null, id);
    return res.changes > 0;
  }

  // ==========================================
  // OPERAÇÕES DE COMUNICADOS
  // ==========================================

  public getComunicados(): Comunicado[] {
    const rows = this.db.prepare('SELECT * FROM comunicados ORDER BY data DESC').all() as any[];
    return rows.map(r => ({
      id: r.id,
      condominioId: r.condominioId,
      condominioNome: r.condominioNome,
      titulo: r.titulo,
      conteudo: r.conteudo,
      data: r.data,
      categoria: r.categoria,
      autor: r.autor,
      publico: r.publico,
      disparadoWhatsapp: Boolean(r.disparadoWhatsapp)
    }));
  }

  public saveComunicado(comunicado: Comunicado) {
    const stmt = this.db.prepare(`
      INSERT INTO comunicados (id, condominioId, condominioNome, titulo, conteudo, data, categoria, autor, publico, disparadoWhatsapp, criadoEm)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        titulo = excluded.titulo,
        conteudo = excluded.conteudo,
        data = excluded.data,
        categoria = excluded.categoria,
        publico = excluded.publico,
        disparadoWhatsapp = excluded.disparadoWhatsapp;
    `);
    stmt.run(
      comunicado.id,
      comunicado.condominioId || 'condo_1',
      comunicado.condominioNome || 'Residencial',
      comunicado.titulo,
      comunicado.conteudo,
      comunicado.data,
      comunicado.categoria || 'geral',
      comunicado.autor || 'Administração',
      comunicado.publico || 'todos',
      comunicado.disparadoWhatsapp ? 1 : 0,
      new Date().toISOString()
    );
  }

  // ==========================================
  // OPERAÇÕES DE ACORDOS
  // ==========================================

  public saveAcordo(acordo: {
    id: string;
    unidadeId: string;
    condominioNome: string;
    moradorNome: string;
    cpf: string;
    valorOriginal: number;
    valorAcordo: number;
    qtdParcelas: number;
    valorParcela: number;
    descontoJuros?: number;
    status?: string;
    termoHash?: string;
    criadoEm?: string;
  }) {
    const stmt = this.db.prepare(`
      INSERT INTO acordos (id, unidadeId, condominioNome, moradorNome, cpf, valorOriginal, valorAcordo, qtdParcelas, valorParcela, descontoJuros, status, termoHash, criadoEm)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        status = excluded.status,
        termoHash = excluded.termoHash;
    `);
    stmt.run(
      acordo.id,
      acordo.unidadeId,
      acordo.condominioNome,
      acordo.moradorNome,
      acordo.cpf,
      acordo.valorOriginal,
      acordo.valorAcordo,
      acordo.qtdParcelas,
      acordo.valorParcela,
      acordo.descontoJuros || 0,
      acordo.status || 'aguardando_assinatura',
      acordo.termoHash || `HASH-SHA256-${Date.now()}`,
      acordo.criadoEm || new Date().toISOString()
    );
  }

  public getAcordos(): any[] {
    return this.db.prepare('SELECT * FROM acordos ORDER BY criadoEm DESC').all();
  }

  // ==========================================
  // OPERAÇÕES DE AVALIAÇÃO DE SATISFAÇÃO (CSAT / NPS)
  // ==========================================

  public saveAvaliacaoCSAT(av: AvaliacaoCSAT): void {
    const stmt = this.db.prepare(`
      INSERT INTO avaliacoes_csat (id, remoteJid, moradorNome, unidadeId, carteiraId, operadorId, operadorNome, nota, comentario, criadoEm)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    stmt.run(
      av.id,
      av.remoteJid,
      av.moradorNome || null,
      av.unidadeId || null,
      av.carteiraId || null,
      av.operadorId || null,
      av.operadorNome || null,
      av.nota,
      av.comentario || null,
      av.criadoEm || Date.now()
    );
  }

  public getAvaliacoesCSAT(): AvaliacaoCSAT[] {
    const stmt = this.db.prepare('SELECT * FROM avaliacoes_csat ORDER BY criadoEm DESC LIMIT 100');
    const rows = stmt.all() as any[];
    return rows.map(r => ({
      id: r.id,
      remoteJid: r.remoteJid,
      moradorNome: r.moradorNome || undefined,
      unidadeId: r.unidadeId || undefined,
      carteiraId: r.carteiraId || undefined,
      operadorId: r.operadorId || undefined,
      operadorNome: r.operadorNome || undefined,
      nota: r.nota,
      comentario: r.comentario || undefined,
      criadoEm: r.criadoEm
    }));
  }

  public getEstatisticasCSAT() {
    const stmt = this.db.prepare(`
      SELECT 
        avg(nota) as media,
        count(*) as total,
        sum(CASE WHEN nota = 5 THEN 1 ELSE 0 END) as nota5,
        sum(CASE WHEN nota = 4 THEN 1 ELSE 0 END) as nota4,
        sum(CASE WHEN nota = 3 THEN 1 ELSE 0 END) as nota3,
        sum(CASE WHEN nota = 2 THEN 1 ELSE 0 END) as nota2,
        sum(CASE WHEN nota = 1 THEN 1 ELSE 0 END) as nota1
      FROM avaliacoes_csat
    `);
    const r = stmt.get() as any;
    const total = Number(r?.total || 0);
    const media = total > 0 ? Number(Number(r?.media || 0).toFixed(1)) : 5.0;
    return {
      mediaGeral: media,
      totalAvaliacoes: total,
      distribuicao: {
        5: Number(r?.nota5 || 0),
        4: Number(r?.nota4 || 0),
        3: Number(r?.nota3 || 0),
        2: Number(r?.nota2 || 0),
        1: Number(r?.nota1 || 0)
      }
    };
  }

  // ==========================================
  // OPERAÇÕES DA RÉGUA DE COBRANÇA PREVENTIVA
  // ==========================================

  public registrarDisparoRegua(regua: ReguaDisparo): void {
    const stmt = this.db.prepare(`
      INSERT INTO regua_disparos (id, cobrancaId, remoteJid, moradorNome, unidadeId, tipoRegua, valor, vencimento, disparadoEm, status)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    stmt.run(
      regua.id,
      regua.cobrancaId,
      regua.remoteJid,
      regua.moradorNome || null,
      regua.unidadeId || null,
      regua.tipoRegua,
      regua.valor,
      regua.vencimento,
      regua.disparadoEm,
      regua.status || 'enviado'
    );
  }

  public jaDisparouRegua(cobrancaId: string, tipoRegua: string): boolean {
    const stmt = this.db.prepare('SELECT id FROM regua_disparos WHERE cobrancaId = ? AND tipoRegua = ? LIMIT 1');
    const r = stmt.get(cobrancaId, tipoRegua);
    return Boolean(r);
  }

  public getHistoricoRegua(): ReguaDisparo[] {
    const stmt = this.db.prepare('SELECT * FROM regua_disparos ORDER BY disparadoEm DESC LIMIT 100');
    const rows = stmt.all() as any[];
    return rows.map(r => ({
      id: r.id,
      cobrancaId: r.cobrancaId,
      remoteJid: r.remoteJid,
      moradorNome: r.moradorNome || undefined,
      unidadeId: r.unidadeId || undefined,
      tipoRegua: r.tipoRegua as any,
      valor: r.valor,
      vencimento: r.vencimento,
      disparadoEm: r.disparadoEm,
      status: r.status as any
    }));
  }
}
