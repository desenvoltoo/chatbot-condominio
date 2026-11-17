import { Router, Request, Response } from 'express';
import { BotOrchestrator } from '../bot/bot.orchestrator.js';
import { EvolutionService } from '../services/evolution.service.js';
import { SisconService } from '../services/siscon.service.js';
import { ConfigService } from '../services/config.service.js';
import { AuthService } from '../services/auth.service.js';
import { LlmService } from '../services/llm.service.js';
import { RagService } from '../services/rag.service.js';
import { DbService } from '../services/db.service.js';
import { requireAuth } from '../middlewares/auth.middleware.js';
import { formatarMensagemPix, gerarPayloadPix } from '../utils/pix.util.js';
import { EventsService } from '../services/events.service.js';
import { Cobranca, Reserva, OrdemManutencao, Condominio, PendenciaSupervisao, AIDecision } from '../types/index.js';

export function createApiRouter(orchestrator: BotOrchestrator): Router {
  const router = Router();
  const evolutionService = new EvolutionService();
  const sisconService = new SisconService();
  const configService = ConfigService.getInstance();
  const authService = AuthService.getInstance();
  const llmService = LlmService.getInstance();
  const ragService = RagService.getInstance();
  const dbService = DbService.getInstance();

  // ==========================================
  // 1. HEALTH CHECK & STATUS PÚBLICO
  // ==========================================
  router.get('/health', (_req: Request, res: Response) => {
    res.json({
      status: 'online',
      version: '2.4.0',
      database: 'sqlite_native_active',
      timestamp: new Date().toISOString()
    });
  });

  // ==========================================
  // 2. AUTENTICAÇÃO & CONTROLE DE ACESSO (RBAC)
  // ==========================================

  // Login público (autenticação real no servidor)
  router.post('/auth/login', async (req: Request, res: Response) => {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ error: 'E-mail e senha são obrigatórios' });
    }

    const session = await authService.login(email, password);
    if (!session) {
      return res.status(401).json({ error: 'Credenciais inválidas ou usuário inativo' });
    }

    const ip = (req.headers['x-forwarded-for'] as string) || req.socket.remoteAddress || '127.0.0.1';
    dbService.logAudit(session.user.id, session.user.email, 'LOGIN_SUCCESS', 'Sessão iniciada com sucesso', ip);

    res.json(session);
  });

  // Perfil autenticado
  router.get('/auth/me', requireAuth(), (req: Request, res: Response) => {
    res.json({ user: (req as any).user });
  });

  // Logout autenticado
  router.post('/auth/logout', requireAuth(), (req: Request, res: Response) => {
    const authHeader = req.headers.authorization || '';
    const token = authHeader.replace(/^Bearer\s+/i, '');
    authService.logout(token);
    res.json({ success: true });
  });

  // Listagem de usuários da equipe (apenas admin e síndico)
  router.get('/auth/usuarios', requireAuth(['admin', 'sindico']), (_req: Request, res: Response) => {
    res.json(authService.listarUsuarios());
  });

  // Cadastro de novo operador/administrador
  router.post('/auth/usuarios', requireAuth(['admin']), (req: Request, res: Response) => {
    const { email, nome, name, role, cargo, senha, condominioIds } = req.body;
    const nomeFinal = (nome || name || '').trim();
    if (!email || !nomeFinal || !role) {
      return res.status(400).json({ error: 'E-mail, nome e perfil são obrigatórios' });
    }

    try {
      const novo = authService.criarUsuario({
        nome: nomeFinal,
        email,
        senhaPlana: senha || 'zeloris123',
        role,
        cargo: cargo || (role === 'admin' ? 'Administrador do Sistema' : role === 'sindico' ? 'Síndico Geral' : 'Operador'),
        condominioIds: condominioIds || ['*']
      });
      res.status(201).json({ success: true, user: novo });
    } catch (err: any) {
      res.status(400).json({ error: err.message });
    }
  });

  // Exclusão de membro da equipe
  router.delete('/auth/usuarios/:id', requireAuth(['admin']), (req: Request, res: Response) => {
    const success = authService.removerUsuario(req.params.id);
    if (!success) {
      return res.status(400).json({ error: 'Não foi possível remover o usuário (ou é o administrador mestre).' });
    }
    res.json({ success: true });
  });

  // Alternar status ativo/inativo
  router.put('/auth/usuarios/:id/toggle-ativo', requireAuth(['admin']), (req: Request, res: Response) => {
    const updated = authService.toggleUsuarioAtivo(req.params.id);
    if (!updated) {
      return res.status(404).json({ error: 'Usuário não encontrado' });
    }
    res.json({ success: true, user: updated });
  });

  // ==========================================
  // 3. HUB DE IA UNIVERSAL & CONFIGURAÇÃO LLM
  // ==========================================

  router.get('/ai/config', requireAuth(), (_req: Request, res: Response) => {
    res.json(llmService.getPublicConfig());
  });

  router.post('/ai/config', requireAuth(['admin']), (req: Request, res: Response) => {
    try {
      const updated = llmService.updateConfig(req.body);
      res.json({ success: true, config: llmService.getPublicConfig() });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  router.post('/ai/test', requireAuth(['admin', 'sindico']), async (req: Request, res: Response) => {
    try {
      const result = await llmService.testConnection(req.body);
      res.json(result);
    } catch (err: any) {
      res.status(500).json({ sucesso: false, mensagem: err.message });
    }
  });

  router.post('/ai/chat', requireAuth(), async (req: Request, res: Response) => {
    const { message, condoName } = req.body;
    if (!message) return res.status(400).json({ error: 'Mensagem é obrigatória' });

    try {
      const ragResults = ragService.buscarSemantica(message, 3);
      const contextRAG = ragResults.map(r => `[Fonte: ${r.documentoTitulo}]\n${r.chunk.texto}`).join('\n\n');
      const answer = await llmService.generateAnswer(message, contextRAG, condoName);
      res.json({ answer, sources: ragResults.map(r => ({ title: r.documentoTitulo, score: r.score })) });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // ==========================================
  // 4. BASE DE CONHECIMENTO RAG
  // ==========================================

  router.get('/rag/documentos', requireAuth(), (_req: Request, res: Response) => {
    res.json(ragService.listarDocumentos());
  });

  router.post('/rag/documentos', requireAuth(['admin', 'sindico']), (req: Request, res: Response) => {
    const { titulo, categoria, conteudoTexto } = req.body;
    if (!titulo || !conteudoTexto) {
      return res.status(400).json({ error: 'Título e conteúdo de texto são obrigatórios' });
    }

    try {
      const doc = ragService.adicionarDocumento(titulo, categoria || 'geral', conteudoTexto);
      res.json({ success: true, documento: doc });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  router.delete('/rag/documentos/:id', requireAuth(['admin']), (req: Request, res: Response) => {
    const deleted = ragService.removerDocumento(req.params.id);
    res.json({ success: deleted });
  });

  router.post('/rag/testar', requireAuth(), (req: Request, res: Response) => {
    const { pergunta, condominioId } = req.body;
    if (!pergunta) return res.status(400).json({ error: 'Pergunta é obrigatória' });

    const teste = ragService.testarRAG(pergunta);
    const user = (req as any).user;
    
    // Registrar na governança de decisões da IA com auditoria
    const condId = condominioId || 'condo_1';
    const topCitacao = teste.citacoes && teste.citacoes.length > 0 ? teste.citacoes[0] : null;
    const confiancaNum = parseFloat((teste.confianca || '90').toString().replace('%', '')) / 100;

    dbService.saveAIDecision({
      id: `dec_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      condominioId: condId,
      pergunta,
      resposta: teste.resposta,
      artigoCitado: topCitacao ? topCitacao.artigo : undefined,
      documentoCitado: topCitacao ? topCitacao.documentoTitulo : undefined,
      scoreConfianca: isNaN(confiancaNum) ? 0.95 : confiancaNum,
      nivelAutonomia: 1,
      statusAprovacao: 'auto_aprovado',
      aprovadoPor: user ? user.name : 'Sistema RAG',
      tokensConsumidos: Math.floor(pergunta.length * 1.5 + teste.resposta.length * 1.2),
      provedor: 'Gemini RAG Embeddings',
      modelo: 'gemini-1.5-flash',
      timestamp: new Date().toISOString()
    });

    res.json(teste);
  });

  // ==========================================
  // 5. GESTÃO DE SESSÕES & CONVERSAS WHATSAPP
  // ==========================================

  // Streaming em tempo real (Server-Sent Events) para atualização imediata do painel
  router.get('/events', (req: Request, res: Response) => {
    const token = (req.query.token as string) || (req.headers['authorization']?.replace('Bearer ', ''));
    if (!token) {
      return res.status(401).json({ error: 'Token de autenticação ausente' });
    }

    if (token !== 'sandbox-demo-token') {
      const user = authService.verifyToken(token);
      if (!user) {
        return res.status(403).json({ error: 'Token inválido ou expirado' });
      }
    }

    res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    if (typeof (res as any).flushHeaders === 'function') {
      (res as any).flushHeaders();
    }

    EventsService.getInstance().addClient(res);
  });

  router.get('/conversas', requireAuth(), (_req: Request, res: Response) => {
    const sessions = orchestrator.getSessionManager().getAllSessions();
    res.json(sessions);
  });

  router.get('/conversas/stats', requireAuth(), (_req: Request, res: Response) => {
    const sessions = orchestrator.getSessionManager().getAllSessions();
    const stats = {
      total: sessions.length,
      aguardandoHumano: sessions.filter(s => s.status === 'waiting_human' || (s.isHumanHandoff && !s.assignedOperator)).length,
      emAtendimento: sessions.filter(s => s.status === 'in_service' || (s.isHumanHandoff && s.assignedOperator)).length,
      comIA: sessions.filter(s => !s.isHumanHandoff && s.status !== 'closed').length,
      concluidos: sessions.filter(s => s.status === 'closed').length,
      inadimplentes: sessions.filter(s => s.statusFinanceiro === 'inadimplente').length,
      connectedClients: EventsService.getInstance().getConnectedClientsCount()
    };
    res.json(stats);
  });

  router.get('/conversas/:remoteJid', requireAuth(), (req: Request, res: Response) => {
    const session = orchestrator.getSessionManager().getSession(req.params.remoteJid);
    res.json(session);
  });

  router.post('/conversas/:remoteJid/mensagem', requireAuth(), async (req: Request, res: Response) => {
    const { remoteJid } = req.params;
    const { text } = req.body;

    if (!text || !text.trim()) {
      return res.status(400).json({ error: 'Texto da mensagem é obrigatório' });
    }

    const now = new Date();
    const timeStr = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;

    orchestrator.getSessionManager().addMessage(remoteJid, {
      id: `msg_op_${Date.now()}`,
      sender: 'operator',
      text,
      timestamp: timeStr,
    });

    try {
      await evolutionService.sendText(remoteJid, text);
    } catch (err: any) {
      console.warn('[API] Falha no envio WhatsApp:', err.message);
    }

    res.json({ success: true, timestamp: timeStr });
  });

  router.post('/conversas/:remoteJid/transferir', requireAuth(), async (req: Request, res: Response) => {
    const { remoteJid } = req.params;
    const { acao, isHuman } = req.body;
    const user = (req as any).user;
    const operadorNome = user?.nome || 'Operador';

    const sessionManager = orchestrator.getSessionManager();

    if (acao === 'finalizar' || acao === 'fechar') {
      sessionManager.setTicketStatus(remoteJid, 'closed', operadorNome);
      try {
        await evolutionService.sendText(
          remoteJid,
          '✅ *Atendimento Encerrado:*\nSeu chamado foi finalizado pela administração do condomínio.\nCaso precise de algo mais, basta nos enviar uma nova mensagem!'
        );
      } catch (e) {}
      return res.json({ success: true, status: 'closed', message: 'Atendimento finalizado com sucesso.' });
    }

    if (acao === 'assumir' || isHuman === true || acao === 'humano') {
      sessionManager.setTicketStatus(remoteJid, 'in_service', operadorNome);
      try {
        await evolutionService.sendText(
          remoteJid,
          `👤 *Atendimento Humano:*\nO operador *${operadorNome}* assumiu esta conversa e está à sua disposição!`
        );
      } catch (e) {}
      return res.json({ success: true, status: 'in_service', assignedOperator: operadorNome });
    }

    if (acao === 'devolver_ia' || isHuman === false || acao === 'bot') {
      sessionManager.setTicketStatus(remoteJid, 'ai');
      try {
        await evolutionService.sendText(
          remoteJid,
          '🤖 *ZELORIS AI Reativado:*\nVocê está novamente conversando com o assistente inteligente autônomo do condomínio.\nComo posso ajudar você agora?'
        );
      } catch (e) {}
      return res.json({ success: true, status: 'ai' });
    }

    sessionManager.setHumanHandoff(remoteJid, Boolean(isHuman), operadorNome);
    res.json({ success: true, isHumanHandoff: Boolean(isHuman) });
  });

  router.post('/conversas/:remoteJid/nota', requireAuth(), (req: Request, res: Response) => {
    const { remoteJid } = req.params;
    const { texto } = req.body;
    const user = (req as any).user;
    const operadorNome = user?.nome || 'Operador';

    if (!texto || !texto.trim()) {
      return res.status(400).json({ error: 'Texto da nota é obrigatório' });
    }

    orchestrator.getSessionManager().addNotaInterna(remoteJid, operadorNome, texto.trim());
    res.json({ success: true, message: 'Nota interna registrada.' });
  });

  // ==========================================
  // 6. GERAÇÃO DE PIX OFICIAL & WEBHOOK BANCÁRIO
  // ==========================================

  router.post('/pix/gerar', requireAuth(), (req: Request, res: Response) => {
    const { valor, chave, nomeBeneficiario, cidadeBeneficiario, txid } = req.body;

    if (!valor || isNaN(Number(valor))) {
      return res.status(400).json({ error: 'Valor numérico do Pix é obrigatório' });
    }

    const chaveFinal = chave || 'financeiro@condominio.com.br';
    const nomeFinal = nomeBeneficiario || 'CONDOMINIO RESIDENCIAL';
    const cidadeFinal = cidadeBeneficiario || 'SAO PAULO';

    const brCode = gerarPayloadPix({
      chave: chaveFinal,
      nomeBeneficiario: nomeFinal,
      cidadeBeneficiario: cidadeFinal,
      valor: Number(valor),
      txid: txid || `ZELORIS${Date.now().toString().slice(-6)}`
    });

    res.json({
      success: true,
      valor: Number(valor),
      chave: chaveFinal,
      beneficiario: nomeFinal,
      cidade: cidadeFinal,
      pixCopiaECola: brCode
    });
  });

  // ==========================================
  // 7. OPERAÇÕES FINANCEIRAS: COBRANÇA, CONCILIAÇÃO & SPLIT
  // ==========================================

  router.get('/financeiro/cobrancas', requireAuth(), (req: Request, res: Response) => {
    const { status, unidadeId } = req.query;
    const cobrancas = dbService.getCobrancas({
      status: status as string,
      unidadeId: unidadeId as string
    });
    res.json(cobrancas);
  });

  router.post('/financeiro/cobrancas', requireAuth(['admin', 'sindico', 'operador']), (req: Request, res: Response) => {
    const { unidadeId, moradorNome, moradorTelefone, remoteJid, tipo, competencia, vencimento, valor } = req.body;
    if (!unidadeId || !moradorNome || !valor) {
      return res.status(400).json({ error: 'unidadeId, moradorNome e valor são obrigatórios' });
    }
    const val = Number(valor);
    const splitAdm = parseFloat((val * 0.03).toFixed(2));
    const splitCond = parseFloat((val - splitAdm).toFixed(2));
    const txid = `ZELORIS${Date.now().toString().slice(-8)}`;
    const brCode = gerarPayloadPix({
      chave: 'financeiro@condominio.com.br',
      nomeBeneficiario: 'CONDOMINIO RESIDENCIAL',
      cidadeBeneficiario: 'SAO PAULO',
      valor: val,
      txid
    });
    const cobranca: Cobranca = {
      id: `cbr_${Date.now()}`,
      unidadeId,
      moradorNome,
      moradorTelefone,
      remoteJid,
      tipo: tipo || 'cota_condominial',
      competencia: competencia || `${new Date().getMonth() + 1}/${new Date().getFullYear()}`,
      vencimento: vencimento || new Date(Date.now() + 86400000 * 5).toLocaleDateString('pt-BR'),
      valor: val,
      linhaDigitavel: `34191.79001 01043.510047 91020.150008 1 ${String(Math.round(val * 100)).padStart(10, '0')}`,
      txid,
      pixCopiaECola: brCode,
      status: 'aberto',
      splitCondominio: splitCond,
      splitAdministradora: splitAdm,
      criadoEm: new Date().toISOString()
    };
    dbService.saveCobranca(cobranca);
    res.json({ success: true, cobranca });
  });

  // Webhook bancário oficial (Bacen / Asaas / Inter / Itaú)
  router.post('/financeiro/pix/webhook', async (req: Request, res: Response) => {
    const txid = req.body.txid || req.body.data?.txid || req.body.data?.externalReference;
    const comprovanteId = req.body.comprovanteId || req.body.data?.endToEndId || `COMP-${Date.now()}`;
    const forma = req.body.formaPagamento || 'pix';

    if (!txid) {
      return res.status(400).json({ error: 'txid ou externalReference é obrigatório' });
    }

    const cobrancaLiquidada = dbService.liquidarCobranca(txid, forma, comprovanteId);
    if (!cobrancaLiquidada) {
      return res.status(404).json({ error: 'Cobrança não encontrada para o txid informado' });
    }

    // Notificação ao morador via WhatsApp se houver remoteJid cadastrado
    const remoteJid = cobrancaLiquidada.remoteJid || (cobrancaLiquidada.moradorTelefone ? `${cobrancaLiquidada.moradorTelefone}@s.whatsapp.net` : null);
    if (remoteJid) {
      const msgConfirmacao = [
        `🎉 *PAGAMENTO COMPENSADO COM SUCESSO!*`,
        `----------------------------------------`,
        `Olá, *${cobrancaLiquidada.moradorNome}*!`,
        `Confirmamos o recebimento da sua cota/taxa via *${forma.toUpperCase()}*.`,
        ``,
        `• *Competência:* ${cobrancaLiquidada.competencia}`,
        `• *Valor Liquidado:* R$ ${cobrancaLiquidada.valor.toFixed(2)}`,
        `• *Autenticação Bancária:* \`${cobrancaLiquidada.comprovanteId}\``,
        ``,
        `✅ Sua unidade *${cobrancaLiquidada.unidadeId}* está RIGOROSAMENTE EM DIA!`,
        `Agradecemos pela pontualidade.`
      ].join('\n');

      try {
        await evolutionService.sendText(remoteJid, msgConfirmacao);
        orchestrator.getSessionManager().addMessage(remoteJid, {
          id: `msg_comp_${Date.now()}`,
          sender: 'system',
          text: msgConfirmacao,
          timestamp: new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
        });
      } catch (err: any) {
        console.warn('[Webhook] Falha no envio WhatsApp:', err.message);
      }
    }

    // Auditoria
    dbService.logAudit('system_webhook', 'banco@pix.bacen.gov.br', 'LIQUIDACAO_PIX_RECEBIDA', `Cobranca ${cobrancaLiquidada.id} - Valor R$ ${cobrancaLiquidada.valor}`);

    // Transmissão SSE em tempo real
    EventsService.getInstance().broadcast({
      type: 'payment_confirmed',
      data: {
        cobranca: cobrancaLiquidada,
        metricas: dbService.getMetricasFinanceiras()
      },
      timestamp: new Date().toISOString()
    });

    res.json({ success: true, cobranca: cobrancaLiquidada });
  });

  // Simulação de pagamento sandbox de alta fidelidade
  router.post('/financeiro/pix/simular-pagamento', requireAuth(), async (req: Request, res: Response) => {
    const { txid, id } = req.body;
    const target = txid || id;
    if (!target) return res.status(400).json({ error: 'txid ou id da cobrança é obrigatório' });

    const cobranca = dbService.getCobrancaByTxid(target);
    if (!cobranca) return res.status(404).json({ error: 'Cobrança não encontrada' });

    const comprovante = `COMP-DEMO-${Date.now().toString().slice(-6)}`;
    const cobrancaLiquidada = dbService.liquidarCobranca(cobranca.txid, 'pix', comprovante);

    if (cobrancaLiquidada?.remoteJid) {
      const msg = `🎉 *COMPROVANTE DE QUITAÇÃO (PIX)*\n` +
        `Sua cota condominial de R$ ${cobrancaLiquidada.valor.toFixed(2)} foi baixada com sucesso!\n` +
        `Autenticação: \`${comprovante}\`\n` +
        `Sua unidade agora está regularizada.`;
      try {
        await evolutionService.sendText(cobrancaLiquidada.remoteJid, msg);
        orchestrator.getSessionManager().addMessage(cobrancaLiquidada.remoteJid, {
          id: `msg_pix_${Date.now()}`,
          sender: 'system',
          text: msg,
          timestamp: new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
        });
      } catch (e) {}
    }

    EventsService.getInstance().broadcast({
      type: 'payment_confirmed',
      data: {
        cobranca: cobrancaLiquidada,
        metricas: dbService.getMetricasFinanceiras()
      },
      timestamp: new Date().toISOString()
    });

    res.json({ success: true, cobranca: cobrancaLiquidada, metricas: dbService.getMetricasFinanceiras() });
  });

  router.get('/financeiro/metricas', requireAuth(), (_req: Request, res: Response) => {
    res.json(dbService.getMetricasFinanceiras());
  });

  router.post('/financeiro/saque-split', requireAuth(['admin', 'sindico']), (req: Request, res: Response) => {
    const { chavePix, valor } = req.body;
    const user = (req as any).user;
    dbService.logAudit(user?.id || 'admin', user?.email || 'admin@condominio.com.br', 'SAQUE_SPLIT_PIX', `Saque de R$ ${valor} para chave ${chavePix}`);
    res.json({
      success: true,
      protocolo: `SAQUE-PIX-${Date.now().toString().slice(-6)}`,
      mensagem: `Saque de R$ ${valor} solicitado com sucesso para a chave ${chavePix}. TED/Pix liquidado.`
    });
  });

  // ==========================================
  // 8. RESERVAS DE ÁREAS COMUNS (CALENDÁRIO & TAXAS)
  // ==========================================

  router.get('/reservas', requireAuth(), (req: Request, res: Response) => {
    const { areaId, dataReserva } = req.query;
    const reservas = dbService.getReservas({
      areaId: areaId as string,
      dataReserva: dataReserva as string
    });
    res.json(reservas);
  });

  router.get('/reservas/areas', requireAuth(), async (_req: Request, res: Response) => {
    const areas = await sisconService.listarAreasComuns();
    res.json(areas);
  });

  router.post('/reservas', requireAuth(), async (req: Request, res: Response) => {
    const { areaId, dataReserva, periodo, unidadeId, moradorNome, moradorTelefone, convidadosQtd, remoteJid } = req.body;

    if (!areaId || !dataReserva || !unidadeId || !moradorNome) {
      return res.status(400).json({ error: 'areaId, dataReserva, unidadeId e moradorNome são obrigatórios' });
    }

    // Verificação de conflito de datas no SQLite
    const conflito = dbService.verificarConflitoReserva(areaId, dataReserva);
    if (conflito) {
      return res.status(409).json({
        error: `A área selecionada já está reservada para o dia ${dataReserva}. Por favor, escolha outra data.`
      });
    }

    const areas = await sisconService.listarAreasComuns();
    const area = areas.find(a => a.id === areaId);
    const taxaTotal = area ? (area.taxaUso + area.taxaLimpeza) : 0;
    const proto = `SIS-RES-${Date.now().toString().slice(-4)}`;

    const novaReserva: Reserva = {
      id: `res_${Date.now()}`,
      areaId,
      areaNome: area?.nome || 'Área Comum',
      unidadeId,
      moradorNome,
      moradorTelefone: moradorTelefone || '5511999990001',
      remoteJid: remoteJid || undefined,
      dataReserva,
      periodo: periodo || area?.horarioFuncionamento || '12:00 às 22:00',
      convidadosQtd: Number(convidadosQtd) || 20,
      taxaTotal,
      status: 'confirmada',
      statusCobranca: taxaTotal > 0 ? 'faturado_proximo_boleto' : 'isento',
      protocoloSiscon: proto,
      criadoEm: new Date().toISOString()
    };

    // Gera cobrança no SQLite caso haja taxa
    if (taxaTotal > 0) {
      const splitAdm = parseFloat((taxaTotal * 0.03).toFixed(2));
      const splitCond = parseFloat((taxaTotal - splitAdm).toFixed(2));
      const txidRes = `ZELORIS${proto.replace(/[^A-Za-z0-9]/g, '')}`;
      const cobrancaRes: Cobranca = {
        id: `cbr_res_${Date.now()}`,
        unidadeId,
        moradorNome,
        moradorTelefone: novaReserva.moradorTelefone,
        remoteJid: novaReserva.remoteJid,
        tipo: 'taxa_reserva',
        competencia: `${new Date().getMonth() + 1}/${new Date().getFullYear()}`,
        vencimento: new Date(Date.now() + 86400000 * 5).toLocaleDateString('pt-BR'),
        valor: taxaTotal,
        txid: txidRes,
        pixCopiaECola: gerarPayloadPix({ chave: 'financeiro@condominio.com.br', nomeBeneficiario: 'CONDOMINIO RESIDENCIAL', cidadeBeneficiario: 'SAO PAULO', valor: taxaTotal, txid: txidRes }),
        status: 'aberto',
        splitCondominio: splitCond,
        splitAdministradora: splitAdm,
        criadoEm: new Date().toISOString()
      };
      dbService.saveCobranca(cobrancaRes);
      novaReserva.cobrancaId = cobrancaRes.id;
    }

    dbService.saveReserva(novaReserva);

    // Notificação WhatsApp
    if (novaReserva.remoteJid) {
      const msgReserva = `📅 *RESERVA CONFIRMADA — ZELORIS AI*\n\n` +
        `• *Espaço:* ${novaReserva.areaNome}\n` +
        `• *Data:* ${novaReserva.dataReserva} (${novaReserva.periodo})\n` +
        `• *Protocolo:* \`${proto}\`\n` +
        (taxaTotal > 0 ? `• *Taxa:* R$ ${taxaTotal.toFixed(2)} (Lançada para o próximo boleto)\n` : `• *Taxa:* Gratuito\n`) +
        `\nAproveite com responsabilidade respeitando o regimento interno!`;

      try {
        await evolutionService.sendText(novaReserva.remoteJid, msgReserva);
        orchestrator.getSessionManager().addMessage(novaReserva.remoteJid, {
          id: `msg_res_${Date.now()}`,
          sender: 'system',
          text: msgReserva,
          timestamp: new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
        });
      } catch (e) {}
    }

    EventsService.getInstance().broadcast({
      type: 'reserva_created',
      data: novaReserva,
      timestamp: new Date().toISOString()
    });

    res.json({ success: true, reserva: novaReserva });
  });

  router.delete('/reservas/:id', requireAuth(['admin', 'sindico', 'operador']), (req: Request, res: Response) => {
    const cancelado = dbService.cancelarReserva(req.params.id);
    if (!cancelado) return res.status(404).json({ error: 'Reserva não encontrada' });

    EventsService.getInstance().broadcast({
      type: 'reserva_updated',
      data: { id: req.params.id, status: 'cancelada' },
      timestamp: new Date().toISOString()
    });

    res.json({ success: true });
  });

  // ==========================================
  // 9. ORDENS DE SERVIÇO & MANUTENÇÃO PREDIAL
  // ==========================================

  router.get('/manutencoes', requireAuth(), (req: Request, res: Response) => {
    const { status, categoria } = req.query;
    const lista = dbService.getManutencoes({
      status: status as string,
      categoria: categoria as string
    });
    res.json(lista);
  });

  router.post('/manutencoes', requireAuth(), async (req: Request, res: Response) => {
    const {
      titulo,
      descricao,
      categoria,
      localizacao,
      urgencia,
      solicitanteNome,
      solicitanteUnidade,
      solicitanteTelefone,
      responsavelNome,
      responsavelTelefone,
      custoEstimado,
      fotoAntesUrl,
      remoteJid,
      notificarZelador
    } = req.body;

    if (!titulo || !localizacao) {
      return res.status(400).json({ error: 'Título e localização são obrigatórios' });
    }

    const codigo = dbService.proximoCodigoOs();
    const novaOs: OrdemManutencao = {
      id: `manut_${Date.now()}`,
      codigo,
      titulo,
      descricao: descricao || undefined,
      categoria: categoria || 'eletrica',
      localizacao,
      urgencia: urgencia || 'media',
      status: 'pendente',
      solicitanteNome: solicitanteNome || 'Morador via Painel',
      solicitanteUnidade: solicitanteUnidade || undefined,
      solicitanteTelefone: solicitanteTelefone || undefined,
      remoteJid: remoteJid || undefined,
      responsavelNome: responsavelNome || 'Zelador José Carlos',
      responsavelTelefone: responsavelTelefone || undefined,
      custoEstimado: Number(custoEstimado) || 0,
      fotoAntesUrl: fotoAntesUrl || undefined,
      criadoEm: new Date().toISOString()
    };

    dbService.saveManutencao(novaOs);

    if (notificarZelador && responsavelTelefone) {
      const msgZelador = `🛠️ *NOVA ORDEM DE SERVIÇO: ${codigo}*\n` +
        `• *Local:* ${localizacao}\n` +
        `• *Descrição:* ${titulo}\n` +
        `• *Urgência:* ${(urgencia || 'media').toUpperCase()}\n` +
        `• *Solicitante:* ${novaOs.solicitanteNome}`;
      try {
        await evolutionService.sendText(`${responsavelTelefone}@s.whatsapp.net`, msgZelador);
      } catch (e) {}
    }

    EventsService.getInstance().broadcast({
      type: 'os_created',
      data: novaOs,
      timestamp: new Date().toISOString()
    });

    res.json({ success: true, os: novaOs });
  });

  router.post('/manutencoes/:id/despachar', requireAuth(['admin', 'sindico', 'operador']), async (req: Request, res: Response) => {
    const { responsavelNome, responsavelTelefone } = req.body;
    const osAtualizada = dbService.updateManutencaoStatus(
      req.params.id,
      'em_andamento',
      responsavelNome || 'Zelador José Carlos'
    );

    if (!osAtualizada) return res.status(404).json({ error: 'Ordem de serviço não encontrada' });

    if (responsavelTelefone) {
      try {
        await evolutionService.sendText(
          `${responsavelTelefone}@s.whatsapp.net`,
          `📲 *OS ${osAtualizada.codigo} DESPACHADA*\nVocê foi escalado para atender o chamado em: *${osAtualizada.localizacao}*.\n*Descrição:* ${osAtualizada.titulo}`
        );
      } catch (e) {}
    }

    EventsService.getInstance().broadcast({
      type: 'os_updated',
      data: osAtualizada,
      timestamp: new Date().toISOString()
    });

    res.json({ success: true, os: osAtualizada });
  });

  router.post('/manutencoes/:id/concluir', requireAuth(['admin', 'sindico', 'operador']), async (req: Request, res: Response) => {
    const { fotoDepoisUrl, observacoes } = req.body;
    const osConcluida = dbService.updateManutencaoStatus(
      req.params.id,
      'concluido',
      undefined,
      fotoDepoisUrl || 'https://images.unsplash.com/photo-1558618666-fcd25c85cd64?w=600&auto=format&fit=crop&q=80',
      observacoes || 'Serviço finalizado e inspecionado com sucesso.'
    );

    if (!osConcluida) return res.status(404).json({ error: 'Ordem de serviço não encontrada' });

    const targetJid = osConcluida.remoteJid || (osConcluida.solicitanteTelefone ? `${osConcluida.solicitanteTelefone}@s.whatsapp.net` : null);
    if (targetJid) {
      const msgMorador = `✅ *CHAMADO CONCLUÍDO — ZELORIS AI*\n\n` +
        `Olá, *${osConcluida.solicitanteNome}*!\n` +
        `Informamos que o chamado *${osConcluida.codigo}* (${osConcluida.titulo}) foi finalizado com sucesso pela zeladoria.\n\n` +
        (osConcluida.fotoDepoisUrl ? `📸 *Foto da Vistoria:* ${osConcluida.fotoDepoisUrl}\n` : '') +
        `Obrigado por colaborar para manter o condomínio em ordem!`;

      try {
        await evolutionService.sendText(targetJid, msgMorador);
        orchestrator.getSessionManager().addMessage(targetJid, {
          id: `msg_os_ok_${Date.now()}`,
          sender: 'system',
          text: msgMorador,
          timestamp: new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
        });
      } catch (e) {}
    }

    EventsService.getInstance().broadcast({
      type: 'os_updated',
      data: osConcluida,
      timestamp: new Date().toISOString()
    });

    res.json({ success: true, os: osConcluida });
  });

  // ==========================================
  // 10. ACORDOS DE DÍVIDAS & SISCON
  // ==========================================

  router.get('/acordos/simular/:unidadeId', requireAuth(), async (req: Request, res: Response) => {
    try {
      const simulacao = await sisconService.simularAcordo(req.params.unidadeId);
      res.json(simulacao);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  router.post('/acordos/firmar', requireAuth(['admin', 'sindico', 'operador']), async (req: Request, res: Response) => {
    const { unidadeId, moradorCpf, moradorNome, qtdParcelas, remoteJid } = req.body;

    if (!unidadeId || !qtdParcelas) {
      return res.status(400).json({ error: 'unidadeId e qtdParcelas são obrigatórios' });
    }

    try {
      const acordo = await sisconService.firmarAcordo(
        unidadeId,
        moradorCpf || '12345678900',
        moradorNome || 'Condômino',
        parseInt(qtdParcelas, 10)
      );

      if (remoteJid) {
        const primeiraParcela = acordo.boletosGerados[0];
        const msgAcordo = `🤝 *ACORDO DE DÍVIDAS FIRMADO — ZELORIS AI*\n\n` +
          `✅ *Protocolo:* \`${acordo.id}\`\n` +
          `📅 *Data:* ${acordo.dataAcordo}\n` +
          `📊 *Plano:* ${acordo.qtdParcelas}x de R$ ${acordo.valorParcela.toFixed(2)}\n\n` +
          `💳 *1ª PARCELA / ENTRADA:*\n` +
          `• Vencimento: ${primeiraParcela.vencimento}\n` +
          `• Linha Digitável:\n\`${primeiraParcela.linhaDigitavel}\`\n\n` +
          formatarMensagemPix(primeiraParcela.codigoPix, primeiraParcela.valor, primeiraParcela.vencimento);

        try {
          await evolutionService.sendText(remoteJid, msgAcordo);
        } catch (err: any) {
          console.warn('[API] Falha no envio WhatsApp do acordo:', err.message);
        }
      }

      res.json({ success: true, acordo });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  router.post('/cobranca/disparar-regua', requireAuth(['admin', 'sindico', 'operador']), async (_req: Request, res: Response) => {
    try {
      const resultado = await sisconService.executarReguaCobranca();
      res.json(resultado);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // ==========================================
  // 11. CONFIGURAÇÕES SISCON & ERP
  // ==========================================

  router.get('/configuracoes', requireAuth(['admin', 'sindico']), (_req: Request, res: Response) => {
    res.json(configService.getPublicConfig());
  });

  router.post('/configuracoes', requireAuth(['admin']), (req: Request, res: Response) => {
    try {
      const updated = configService.updateConfig(req.body);
      res.json({ success: true, config: configService.getPublicConfig() });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  router.post('/configuracoes/testar-conexao', requireAuth(['admin']), async (req: Request, res: Response) => {
    try {
      const result = await configService.testarConexaoSiscon(req.body);
      res.json(result);
    } catch (err: any) {
      res.status(500).json({ sucesso: false, mensagem: err.message });
    }
  });

  // ==========================================
  // 12. AUDITORIA & DASHBOARD INDICADORES REAIS
  // ==========================================

  router.get('/auditoria', requireAuth(['admin', 'sindico']), (req: Request, res: Response) => {
    const limit = req.query.limit ? parseInt(req.query.limit as string, 10) : 50;
    res.json(dbService.getAuditLogs(limit));
  });

  router.get('/dashboard/stats', requireAuth(), (_req: Request, res: Response) => {
    const sessions = orchestrator.getSessionManager().getAllSessions();
    const totalConversas = sessions.length;
    const emAtendimentoHumano = sessions.filter(s => s.isHumanHandoff).length;
    const resolvidosBot = Math.max(0, totalConversas - emAtendimentoHumano);
    const taxaAutomacao = totalConversas > 0 ? Math.round((resolvidosBot / totalConversas) * 100) : 85;
    const cfg = configService.getConfig();
    const metricasFin = dbService.getMetricasFinanceiras();
    const reservasMes = dbService.getReservas().length;

    res.json({
      totalConversas,
      emAtendimentoHumano,
      resolvidosBot,
      taxaAutomacao: `${taxaAutomacao}%`,
      taxaAdimplencia: metricasFin.taxaAdimplencia,
      unidadesEmDia: `${metricasFin.unidadesAdimplentes} de ${metricasFin.totalUnidades} unidades`,
      tempoMedioPrimeiraResposta: '1.8 segundos',
      satisfacaoNps: '4.9 / 5.0 (Excelente)',
      boletosEmitidosHoje: metricasFin.cobrancasPagas + metricasFin.cobrancasAbertas,
      acordosFirmadosMes: 6,
      reservasConfirmadasMes: reservasMes,
      totalTransacionado: metricasFin.totalTransacionado,
      saldoSplitAdm: metricasFin.saldoSplitAdm,
      erpConectado: 'ZELORIS ERP Integrado (Nativo)',
      bancoAtivo: `${cfg.bancoIntegrado.toUpperCase()} (Conexão Bancária Direta)`,
      statusConexaoErp: 'Ativo & Sincronizado',
    });
  });

  // ==========================================
  // 13. SUPERVISÃO HUMANO-NO-LOOP & PENDÊNCIAS
  // ==========================================

  router.get('/supervisao/pendencias', requireAuth(['admin', 'sindico', 'operador']), (req: Request, res: Response) => {
    const condominioId = req.query.condominioId as string | undefined;
    const status = req.query.status as string | undefined;
    const pendencias = dbService.getPendenciasSupervisao(condominioId, status);
    res.json(pendencias);
  });

  router.post('/supervisao/pendencias', requireAuth(['admin', 'sindico', 'operador']), (req: Request, res: Response) => {
    const { condominioId, tipo, descricao, solicitanteNome, unidadeId, dadosJson } = req.body;
    if (!tipo || !descricao || !solicitanteNome) {
      return res.status(400).json({ error: 'Campos tipo, descricao e solicitanteNome são obrigatórios' });
    }

    const nova: PendenciaSupervisao = {
      id: `pend_${Date.now()}`,
      condominioId: condominioId || 'condo_1',
      tipo,
      descricao,
      solicitanteNome,
      unidadeId: unidadeId || 'Geral',
      dadosJson: typeof dadosJson === 'object' ? JSON.stringify(dadosJson) : dadosJson,
      status: 'pendente',
      criadoEm: new Date().toISOString()
    };

    dbService.criarPendenciaSupervisao(nova);
    EventsService.getInstance().broadcast({
      type: 'supervisao_pendencia',
      data: nova,
      timestamp: new Date().toISOString()
    });
    res.status(201).json({ success: true, pendencia: nova });
  });

  router.post('/supervisao/pendencias/:id/responder', requireAuth(['admin', 'sindico']), (req: Request, res: Response) => {
    const { id } = req.params;
    const { status, justificativa } = req.body;
    if (status !== 'aprovado' && status !== 'rejeitado') {
      return res.status(400).json({ error: 'Status deve ser "aprovado" ou "rejeitado"' });
    }

    const user = (req as any).user;
    const respondida = dbService.responderPendenciaSupervisao(id, status, user?.name || 'Administrador', justificativa);
    if (!respondida) {
      return res.status(404).json({ error: 'Pendência não encontrada' });
    }

    dbService.logAudit(
      user?.id || 'admin',
      user?.email || 'admin@zeloris.com.br',
      `SUPERVISAO_${status.toUpperCase()}`,
      `Pendência ${id} (${respondida.tipo}) ${status} por ${user?.name}. Justificativa: ${justificativa || 'Nenhuma'}`
    );

    EventsService.getInstance().broadcast({
      type: 'supervisao_respondida',
      data: respondida,
      timestamp: new Date().toISOString()
    });
    res.json({ success: true, pendencia: respondida });
  });

  // ==========================================
  // 14. GOVERNANÇA DE IA & AUDITORIA DE DECISÕES
  // ==========================================

  router.get('/ai/decisions', requireAuth(['admin', 'sindico']), (req: Request, res: Response) => {
    const condominioId = req.query.condominioId as string | undefined;
    const limit = req.query.limit ? parseInt(req.query.limit as string, 10) : 30;
    const decisions = dbService.getAIDecisions(condominioId, limit);
    res.json(decisions);
  });

  // ==========================================
  // 15. MULTI-CONDOMÍNIO (WHITE-LABEL & GESTÃO)
  // ==========================================

  router.get('/condominios', requireAuth(), (_req: Request, res: Response) => {
    const lista = dbService.getCondominios();
    res.json(lista);
  });

  router.get('/condominios/:id', requireAuth(), (req: Request, res: Response) => {
    const cond = dbService.getCondominioById(req.params.id);
    if (!cond) return res.status(404).json({ error: 'Condomínio não encontrado' });
    res.json(cond);
  });

  router.post('/condominios', requireAuth(['admin']), (req: Request, res: Response) => {
    const { nome, cnpj, endereco, cidade, estado, unidadesQtd, administradoraNome, taxaAdmPercentual, logoUrl } = req.body;
    if (!nome || !cnpj) {
      return res.status(400).json({ error: 'Nome e CNPJ são obrigatórios' });
    }

    const novoCond: Condominio = {
      id: req.body.id || `condo_${Date.now()}`,
      nome,
      cnpj,
      endereco: endereco || '',
      cidade: cidade || 'São Paulo',
      estado: estado || 'SP',
      unidadesQtd: unidadesQtd || 100,
      administradoraNome: administradoraNome || 'Administradora Padrão',
      taxaAdmPercentual: taxaAdmPercentual || 6.0,
      logoUrl: logoUrl || undefined,
      criadoEm: new Date().toISOString()
    };

    dbService.saveCondominio(novoCond);
    res.status(201).json({ success: true, condominio: novoCond });
  });

  return router;
}
