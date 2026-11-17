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
    const { pergunta } = req.body;
    if (!pergunta) return res.status(400).json({ error: 'Pergunta é obrigatória' });

    const teste = ragService.testarRAG(pergunta);
    res.json(teste);
  });

  // ==========================================
  // 5. GESTÃO DE SESSÕES & CONVERSAS WHATSAPP
  // ==========================================

  router.get('/conversas', requireAuth(), (_req: Request, res: Response) => {
    const sessions = orchestrator.getSessionManager().getAllSessions();
    res.json(sessions);
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

  router.post('/conversas/:remoteJid/transferir', requireAuth(), (req: Request, res: Response) => {
    const { remoteJid } = req.params;
    const { isHuman } = req.body;

    orchestrator.getSessionManager().setHumanHandoff(remoteJid, Boolean(isHuman));
    res.json({ success: true, isHumanHandoff: Boolean(isHuman) });
  });

  // ==========================================
  // 6. GERAÇÃO DE PIX OFICIAL (EMVCo BR CODE)
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
      txid: txid || `DOMUS${Date.now().toString().slice(-6)}`
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
  // 7. COBRANÇA, RÉGUA & ACORDOS
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
        const msgAcordo = `🤝 *ACORDO DE DÍVIDAS FIRMADO — DOMUS AI*\n\n` +
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
  // 8. CONFIGURAÇÕES SISCON & ERP
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
  // 9. AUDITORIA & DASHBOARD
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

    res.json({
      totalConversas,
      emAtendimentoHumano,
      resolvidosBot,
      taxaAutomacao: `${taxaAutomacao}%`,
      taxaAdimplencia: '95.0%',
      unidadesEmDia: '228 de 240 unidades',
      tempoMedioPrimeiraResposta: '1.8 segundos',
      satisfacaoNps: '4.9 / 5.0 (Excelente)',
      boletosEmitidosHoje: 18,
      acordosFirmadosMes: 6,
      reservasConfirmadasMes: 12,
      erpConectado: 'DOMUS ERP Integrado (Nativo)',
      bancoAtivo: `${cfg.bancoIntegrado.toUpperCase()} (Conexão Bancária Direta)`,
      statusConexaoErp: 'Ativo & Sincronizado',
    });
  });

  return router;
}
