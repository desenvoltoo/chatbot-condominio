import { SessionManager } from './session.manager.js';
import { EvolutionService } from '../services/evolution.service.js';
import { SisconService } from '../services/siscon.service.js';
import { RagService } from '../services/rag.service.js';
import { LlmService } from '../services/llm.service.js';
import { DbService } from '../services/db.service.js';
import { validarCpf, limparCpf, mascararCpf } from '../utils/cpf.util.js';
import { formatarMensagemPix } from '../utils/pix.util.js';
import { config } from '../config.js';

export class BotOrchestrator {
  private sessionManager: SessionManager;
  private evolutionService: EvolutionService;
  private sisconService: SisconService;
  private ragService: RagService;
  private llmService: LlmService;
  private dbService: DbService;

  constructor() {
    this.sessionManager = new SessionManager();
    this.evolutionService = new EvolutionService();
    this.sisconService = new SisconService();
    this.ragService = RagService.getInstance();
    this.llmService = LlmService.getInstance();
    this.dbService = DbService.getInstance();
  }

  getSessionManager(): SessionManager {
    return this.sessionManager;
  }

  getErpService(): SisconService {
    return this.sisconService;
  }

  public detectarCarteiraRecomendada(session: any, texto: string = ''): {
    carteiraId: string;
    carteiraNome: string;
    operadorId: string;
    operadorNome: string;
    motivo: string;
  } {
    const lower = (texto || '').toLowerCase();

    // 1. Grupos de WhatsApp
    if (session.isGroup || session.remoteJid.endsWith('@g.us')) {
      return {
        carteiraId: 'carteira_grupos',
        carteiraNome: 'Grupos de WhatsApp dos Blocos',
        operadorId: 'op_zelador',
        operadorNome: 'Marcos Zelador / Portaria',
        motivo: 'Conversa originada de grupo de condomínio'
      };
    }

    // 2. Cobrança e Acordos de Dívidas
    const termosCobranca = [
      'acordo', 'negociar', 'parcelar', 'parcelamento', 'dívida', 'divida',
      'inadimplente', 'atrasado', 'juros', 'segunda via', '2ª via', 'boleto', 'cota', 'protesto'
    ];
    if (
      session.statusFinanceiro === 'inadimplente' ||
      session.state === 'SIMULANDO_ACORDO' ||
      session.state === 'CONFIRMANDO_ACORDO' ||
      termosCobranca.some((t: string) => lower.includes(t))
    ) {
      return {
        carteiraId: 'carteira_cobranca',
        carteiraNome: 'Cobrança & Acordos de Dívidas',
        operadorId: 'op_roberta',
        operadorNome: 'Roberta Dias (Financeiro)',
        motivo: 'Contexto financeiro ou negociação de débito'
      };
    }

    // 3. Síndico, Obras, Barulho e Ocorrências Estruturais
    const termosSindico = [
      'síndico', 'sindico', 'obra', 'barulho', 'som alto', 'vazamento',
      'infiltração', 'infiltracao', 'multa', 'notificação', 'notificacao',
      'assembleia', 'assemblea', 'conselho', 'administradora', 'reunião', 'reuniao',
      'advogado', 'processo', 'justiça', 'juizado', 'procon', 'danos morais', 'manuten'
    ];
    if (
      session.state === 'AGUARDANDO_DESCRICAO_OCORRENCIA' ||
      termosSindico.some((t: string) => lower.includes(t))
    ) {
      return {
        carteiraId: 'carteira_sindico',
        carteiraNome: 'Demandas do Síndico & Obras',
        operadorId: 'op_carlos',
        operadorNome: 'Carlos Síndico Profissional',
        motivo: 'Demanda de governança, síndico, ocorrência predial ou jurídico'
      };
    }

    // 4. Atendimento Geral e Reservas de Lazer
    return {
      carteiraId: 'carteira_atendimento',
      carteiraNome: 'Atendimento Geral & Reservas',
      operadorId: 'op_mariana',
      operadorNome: 'Mariana Souza (Atendimento)',
      motivo: 'Atendimento geral e reservas de lazer'
    };
  }

  public async transferirParaConsultorAutomatico(
    remoteJid: string,
    session: any,
    motivo: string,
    textoOrigem?: string
  ): Promise<void> {
    const rec = this.detectarCarteiraRecomendada(session, textoOrigem || motivo);

    session.state = 'ATENDIMENTO_HUMANO';
    session.isHumanHandoff = true;
    session.status = 'waiting_human';
    session.assignedOperator = rec.operadorNome;
    session.assignedOperatorId = rec.operadorId;
    session.carteiraId = rec.carteiraId;
    session.carteiraNome = rec.carteiraNome;
    if (!session.slaStartedAt) session.slaStartedAt = new Date().toISOString();

    this.sessionManager.atribuirCarteira(remoteJid, rec.carteiraId, rec.carteiraNome, rec.operadorId, rec.operadorNome);
    this.sessionManager.setHumanHandoff(remoteJid, true, rec.operadorNome);

    this.sessionManager.addNotaInterna(
      remoteJid,
      'CondoVolto AI (Auto-Transfer)',
      `[Transferência Automática para Consultor] Morador encaminhado para ${rec.operadorNome} na carteira "${rec.carteiraNome}". Motivo: ${motivo}`
    );

    // 1. Gera briefing executivo via IA para o consultor humano não perder tempo
    const historicoMsg = (session.messages || []).map((m: any) => ({
      sender: m.sender,
      text: m.text
    }));
    const moradorNome = session.morador?.nome || session.pushName || 'Morador';
    const unidadeDesc = session.morador?.unidades?.[0]
      ? `${session.morador.unidades[0].condominioNome} • Apt ${session.morador.unidades[0].numero}`
      : 'Unidade sob identificação';

    try {
      const briefing = await this.llmService.generateExecutiveBriefing(
        moradorNome,
        unidadeDesc,
        motivo,
        historicoMsg
      );
      this.sessionManager.addNotaInterna(
        remoteJid,
        'CondoVolto AI (Briefing)',
        `[Briefing IA para Consultor]\n${briefing}`
      );
    } catch (e: any) {
      console.warn('[Orchestrator] Falha ao gerar briefing executivo:', e?.message);
    }

    // 2. Alerta proativo no WhatsApp do consultor/plantão
    await this.notificarConsultorPlantao(remoteJid, moradorNome, unidadeDesc, rec, motivo, textoOrigem);

    this.sessionManager.updateSession(session);

    const msg = [
      `👤 *Atendimento Transferido para um Consultor*`,
      `----------------------------------------`,
      `Identifiquei sua solicitação e transferi seu atendimento diretamente para nosso(a) consultor(a) humano(a):`,
      ``,
      `💼 *Consultor(a) Responsável:* ${rec.operadorNome}`,
      `📂 *Carteira:* ${rec.carteiraNome}`,
      `⏱️ *Fila de Espera:* Prioritária (Consultor Notificado)`,
      `----------------------------------------`,
      `Nossa equipe já está com seu chamado aberto no painel e responderá por aqui em instantes.`,
      ``,
      `_Caso queira voltar ao autoatendimento automático a qualquer momento, digite *MENU* ou *SAIR*._`
    ].join('\n');

    await this.reply(remoteJid, msg);
  }

  private async notificarConsultorPlantao(
    remoteJid: string,
    moradorNome: string,
    unidadeDesc: string,
    rec: any,
    motivo: string,
    textoOrigem?: string
  ): Promise<void> {
    const plantaoJid = process.env.WHATSAPP_PLANTAO_JID;
    if (!plantaoJid) return;

    const alertaMsg = [
      `🚨 *[CondoVolto AI — Alerta de Transbordo Prioritário]*`,
      `----------------------------------------`,
      `👤 *Morador:* ${moradorNome} (${unidadeDesc})`,
      `📂 *Carteira:* ${rec.carteiraNome}`,
      `💼 *Consultor(a):* ${rec.operadorNome}`,
      `⚠️ *Motivo:* ${motivo}`,
      textoOrigem ? `💬 *Última Mensagem:* "${textoOrigem.slice(0, 150)}"` : '',
      `----------------------------------------`,
      `👉 Acesse o painel CondoVolto para responder ao morador.`
    ].filter(Boolean).join('\n');

    try {
      await this.evolutionService.sendText(plantaoJid, alertaMsg);
    } catch (e: any) {
      console.warn('[Orchestrator] Falha no envio de alerta ao plantão:', e?.message);
    }
  }

  async reply(remoteJid: string, text: string): Promise<void> {
    const now = new Date();
    const timeStr = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
    this.sessionManager.addMessage(remoteJid, {
      id: `msg_bot_${Date.now()}`,
      sender: 'bot',
      text,
      timestamp: timeStr,
    });
    try {
      await this.evolutionService.sendText(remoteJid, text);
    } catch (err: any) {
      console.warn('[BotOrchestrator] Falha no envio WhatsApp:', err.message);
    }
  }

  async processIncomingMessage(remoteJid: string, text: string, pushName?: string): Promise<void> {
    const rawText = text.trim();
    const lowerText = rawText.toLowerCase();
    const session = this.sessionManager.getSession(remoteJid, pushName);
    const nomeUsuario = pushName || 'Condômino(a)';

    // 1. Registra no histórico da sessão e emite evento SSE em tempo real
    const now = new Date();
    const timeStr = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
    this.sessionManager.addMessage(remoteJid, {
      id: `msg_user_${Date.now()}`,
      sender: 'user',
      text: rawText,
      timestamp: timeStr,
    });

    // 2. Análise proativa e transferência automática por risco jurídico
    const termosJuridicos = [
      'advogado', 'processo', 'justiça', 'juizado', 'procon', 'danos morais',
      'notificação extrajudicial', 'notificacao extrajudicial', 'policia', 'delegacia', 'b.o.'
    ];
    if (termosJuridicos.some((t) => lowerText.includes(t)) && session.state !== 'ATENDIMENTO_HUMANO') {
      session.tempData = { ...session.tempData, sentiment: 'risco_juridico' };
      await this.transferirParaConsultorAutomatico(
        remoteJid,
        session,
        'Risco jurídico ou notificação legal detectada na mensagem',
        rawText
      );
      return;
    }

    // 3. Detecção proativa de frustração / insatisfação (Auto-Transfer imediato para consultor)
    const termosFrustracao = [
      'não ajudou', 'nao ajudou', 'não resolveu', 'nao resolveu', 'péssimo', 'pessimo',
      'horrível', 'horrivel', 'inútil', 'inutil', 'robô burro', 'robo burro',
      'ninguém me atende', 'ninguem me atende', 'estou esperando', 'falha', 'absurdo',
      'palhaçada', 'palhacada', 'não consigo', 'quero falar com gente', 'quero falar com humano'
    ];
    if (termosFrustracao.some((t) => lowerText.includes(t)) && session.state !== 'ATENDIMENTO_HUMANO') {
      await this.transferirParaConsultorAutomatico(
        remoteJid,
        session,
        'Condômino expressou insatisfação ou dificuldade no autoatendimento',
        rawText
      );
      return;
    }

    // Comandos globais de reinício
    if (['menu', 'inicio', 'voltar', 'cancelar', 'ola', 'olá', 'oi'].includes(lowerText) && session.state !== 'INICIO') {
      this.sessionManager.resetSession(remoteJid);
      await this.enviarMenuPrincipal(remoteJid, nomeUsuario);
      return;
    }

    // 4. Solicitação de consultor / atendente humano (Transferência Automática Imediata)
    const termosConsultor = [
      'consultor',
      'consultora',
      'atendente',
      'humano',
      'operador',
      'pessoa',
      'falar com alguém',
      'falar com alguem',
      'falar com atendente',
      'falar com consultor',
      'transferir para consultor',
      'suporte humano',
      'especialista',
      'gerente'
    ];
    if (termosConsultor.some((termo) => lowerText.includes(termo)) && session.state !== 'ATENDIMENTO_HUMANO') {
      await this.transferirParaConsultorAutomatico(
        remoteJid,
        session,
        'Solicitação direta do morador por consultor humano',
        rawText
      );
      return;
    }

    switch (session.state) {
      case 'INICIO':
        await this.handleInicio(remoteJid, lowerText, nomeUsuario);
        break;

      case 'MENU_PRINCIPAL':
        await this.handleMenuPrincipal(remoteJid, lowerText, session);
        break;

      case 'AGUARDANDO_CPF':
        await this.handleAguardandoCpf(remoteJid, rawText, session);
        break;

      case 'SIMULANDO_ACORDO':
        await this.handleSimulandoAcordo(remoteJid, rawText, session);
        break;

      case 'RESERVANDO_AREA':
        await this.handleReservandoArea(remoteJid, rawText, session);
        break;

      case 'AGUARDANDO_DESCRICAO_OCORRENCIA':
        await this.handleRegistroOcorrencia(remoteJid, rawText, session);
        break;

      case 'ATENDIMENTO_HUMANO':
        if (lowerText === 'sair' || lowerText === 'finalizar') {
          await this.enviarPesquisaCSAT(remoteJid, session);
        }
        break;

      case 'AVALIANDO_ATENDIMENTO':
        await this.handleAvaliacaoAtendimento(remoteJid, rawText, session);
        break;

      default:
        this.sessionManager.resetSession(remoteJid);
        await this.enviarMenuPrincipal(remoteJid, nomeUsuario);
        break;
    }
  }

  public async enviarPesquisaCSAT(remoteJid: string, session: any): Promise<void> {
    session.state = 'AVALIANDO_ATENDIMENTO';
    this.sessionManager.setHumanHandoff(remoteJid, false);
    session.status = 'closed';
    this.sessionManager.updateSession(session);

    const msg = [
      `⭐ *Pesquisa de Satisfação — CondoVolto AI*`,
      `----------------------------------------`,
      `Seu atendimento com a administração foi concluído!`,
      ``,
      `Como você avalia o atendimento recebido hoje?`,
      `Digite apenas o número de *1 a 5*:`,
      ``,
      `*5* - ⭐⭐⭐⭐⭐ Excelente`,
      `*4* - ⭐⭐⭐⭐ Muito Bom`,
      `*3* - ⭐⭐⭐ Regular`,
      `*2* - ⭐⭐ Ruim`,
      `*1* - ⭐ Insatisfeito`,
      `----------------------------------------`,
      `_Sua avaliação é sigilosa e nos ajuda a melhorar nossos serviços continuamente._`
    ].join('\n');

    await this.reply(remoteJid, msg);
  }

  private async handleAvaliacaoAtendimento(remoteJid: string, text: string, session: any): Promise<void> {
    const rawClean = text.trim();
    const match = rawClean.match(/[1-5]/);
    const nota = match ? parseInt(match[0], 10) : (rawClean.toLowerCase().includes('excelente') ? 5 : rawClean.toLowerCase().includes('bom') ? 4 : 5);

    const moradorNome = session.morador?.nome || session.pushName || 'Morador';
    const unidadeId = session.selectedUnidadeId || session.morador?.unidades?.[0]?.id || 'unidade_geral';

    this.dbService.saveAvaliacaoCSAT({
      id: `csat_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`,
      remoteJid,
      moradorNome,
      unidadeId,
      carteiraId: session.carteiraId || 'carteira_atendimento',
      operadorId: session.assignedOperatorId || 'op_mariana',
      operadorNome: session.assignedOperator || 'Mariana Souza (Atendimento)',
      nota,
      comentario: text.length > 2 ? text : undefined,
      criadoEm: Date.now()
    });

    this.sessionManager.addNotaInterna(
      remoteJid,
      'Sistema CSAT',
      `[Avaliação do Morador] Nota ${nota}/5 recebida. Comentário: "${text}"`
    );

    this.sessionManager.resetSession(remoteJid);

    const estrelas = '⭐'.repeat(nota);
    await this.reply(
      remoteJid,
      `🙏 *Muito obrigado pelo seu feedback!*\nSua nota *${nota}/5* (${estrelas}) foi registrada no painel da administração.\n\n_Sempre que precisar de 2ª via, reservas, acordos ou informações, basta enviar uma nova mensagem! Tenha um ótimo dia!_ 😊`
    );
  }

  private async enviarMenuPrincipal(remoteJid: string, nome: string): Promise<void> {
    const session = this.sessionManager.getSession(remoteJid);
    session.state = 'MENU_PRINCIPAL';
    this.sessionManager.updateSession(session);

    const mensagem = [
      `👋 Olá, *${nome}*! Bem-vindo(a) ao *CondoVolto AI* — Central de Inteligência Condominial.`,
      `⚡ *Atendimento Autônomo 24h: Respostas imediatas e sem filas.*`,
      ``,
      `Como posso ajudar você agora? Digite o número ou descreva sua solicitação:`,
      ``,
      `*1* - 📄 2ª Via de Boleto & Pix Copia e Cola (Recálculo Automático)`,
      `*2* - 🤝 Negociação & Acordo de Débito (Termo Jurídico SHA-256)`,
      `*3* - 💧 Telemetria & Medição Individual (Água e Gás)`,
      `*4* - 📅 Reservas de Áreas Comuns (Churrasqueira/Salão)`,
      `*5* - 📖 Dúvidas do Regimento Interno & Convenção (RAG Jurídico)`,
      `*6* - 📦 Notificação de Encomendas & Passes de Visitantes (QR Code)`,
      `*7* - 🗳️ Votação em Assembleia Virtual`,
      `*8* - 🛠️ Abertura de Chamado / Manutenção Predial`,
      `*9* - 📜 Certidão Negativa de Débitos (Nada Consta)`,
      `*0* - 👤 Falar com Atendente Humano`,
      ``,
      `💡 *Dica:* Você também pode digitar sua dúvida livremente (ex: _"Qual o horário do silêncio no sábado?"_).`,
      `_A qualquer momento, digite *MENU* para retornar ao início._`
    ].join('\n');

    await this.reply(remoteJid, mensagem);
  }

  private async handleInicio(remoteJid: string, text: string, nome: string): Promise<void> {
    const lower = text.toLowerCase();
    if (lower.includes('boleto') || lower.includes('segunda via') || lower.includes('pix') || lower.includes('pagar')) {
      const session = this.sessionManager.getSession(remoteJid);
      session.state = 'AGUARDANDO_CPF';
      session.tempData = { destinoAposCpf: 'boleto' };
      this.sessionManager.updateSession(session);

      await this.reply(
        remoteJid,
        `📄 Perfeito! Para localizar sua cota condominial no SISCON, por favor *digite o seu CPF* (apenas números ou com pontos):`
      );
      return;
    }

    if (lower.includes('acordo') || lower.includes('parcelar') || lower.includes('divida') || lower.includes('dívida')) {
      const session = this.sessionManager.getSession(remoteJid);
      session.state = 'AGUARDANDO_CPF';
      session.tempData = { destinoAposCpf: 'acordo' };
      this.sessionManager.updateSession(session);

      await this.reply(
        remoteJid,
        `🤝 Vamos simular um acordo de débito! Para verificar as pendências no SISCON, por favor *digite o seu CPF*:`
      );
      return;
    }

    // Tenta responder pergunta livre via RAG/IA
    const session = this.sessionManager.getSession(remoteJid);
    const respondeuPorIa = await this.handleConsultaRAGIA(remoteJid, text, session);
    if (!respondeuPorIa) {
      await this.enviarMenuPrincipal(remoteJid, nome);
    }
  }

  private async handleMenuPrincipal(remoteJid: string, text: string, session: any): Promise<void> {
    const lower = text.toLowerCase().trim();

    // 1 - Boleto
    if (lower === '1' || (lower.includes('boleto') && !lower.includes('duvida')) || lower === 'pix') {
      session.state = 'AGUARDANDO_CPF';
      session.tempData = { destinoAposCpf: 'boleto' };
      this.sessionManager.updateSession(session);

      await this.reply(
        remoteJid,
        `📄 Por favor, informe o seu *CPF* (apenas números ou com pontuação) para consultarmos seus débitos no SISCON:`
      );
    }
    // 2 - Acordo / Parcelamento
    else if (lower === '2' || lower.includes('acordo') || lower.includes('parcel')) {
      session.state = 'AGUARDANDO_CPF';
      session.tempData = { destinoAposCpf: 'acordo' };
      this.sessionManager.updateSession(session);

      await this.reply(
        remoteJid,
        `🤝 *Simulador de Acordo SISCON*\n\nPor favor, informe o seu *CPF* para localizarmos as cotas em aberto e montar as opções de parcelamento:`
      );
    }
    // 3 - SISCON Medição (Água e Gás)
    else if (lower === '3' || lower.includes('medicao') || lower.includes('medição') || lower.includes('agua') || lower.includes('água') || lower.includes('gás')) {
      await this.handleConsultaMedicao(remoteJid, session);
    }
    // 4 - Reservas de Áreas Comuns
    else if (lower === '4' || lower.includes('reserva') || lower.includes('salao') || lower.includes('salão') || lower.includes('churrasqueira')) {
      await this.handleInicioReserva(remoteJid, session);
    }
    // 5 - Dúvidas do Regimento Interno & Convenção (RAG)
    else if (lower === '5' || lower.includes('regimento') || lower.includes('convenção') || lower.includes('convencao') || lower.includes('regras') || lower.includes('normas')) {
      await this.handleDuvidasRegimento(remoteJid, session);
    }
    // 6 - Encomendas & Passes de Visitantes (QR Code)
    else if (lower === '6' || lower.includes('encomenda') || lower.includes('visitante') || lower.includes('pacote') || lower.includes('passe') || lower.includes('portaria')) {
      await this.handleEncomendasEVisitas(remoteJid, session);
    }
    // 7 - Assembleia Virtual
    else if (lower === '7' || lower.includes('assembleia') || lower.includes('voto') || lower.includes('votar')) {
      await this.handleAssembleiaVirtual(remoteJid, session);
    }
    // 8 - Manutenção / Chamado
    else if (lower === '8' || lower.includes('chamado') || lower.includes('manuten') || lower.includes('ocorrencia') || lower.includes('conserto')) {
      session.state = 'AGUARDANDO_DESCRICAO_OCORRENCIA';
      this.sessionManager.updateSession(session);

      await this.reply(
        remoteJid,
        `🛠️ *Registro de Chamado / Manutenção Predial*\n\nPor favor, digite uma descrição detalhada do problema (ex: lâmpada queimada na garagem, portão travando, vazamento no hall, etc.):`
      );
    }
    // 9 - Certidão Nada Consta
    else if (lower === '9' || lower.includes('certidao') || lower.includes('certidão') || lower.includes('nada consta') || lower.includes('quitacao') || lower.includes('quitação')) {
      await this.handleCertidaoNadaConsta(remoteJid, session);
    }
    // 0 - Consultor Humano (Transferência Automática)
    else if (lower === '0' || lower.includes('atendente') || lower.includes('humano') || lower.includes('operador') || lower.includes('consultor')) {
      await this.transferirParaConsultorAutomatico(
        remoteJid,
        session,
        'Opção 0 (Consultor) selecionada no menu principal',
        'consultor'
      );
      return;
    }
    // Comunicados
    else if (lower.includes('aviso') || lower.includes('comunicado')) {
      const comunicados = await this.sisconService.listarComunicados();
      const texto = [
        `📢 *Mural de Comunicados Oficiais — SISCON*`,
        `🏢 Residencial Jardins do Bosque`,
        `----------------------------------------`,
        ...comunicados.map(c => `📌 *${c.titulo}*\n${c.conteudo}\n_Publicado por: ${c.autor}_`),
        `----------------------------------------`,
        `Digite *MENU* para retornar ao início.`
      ].join('\n\n');
      await this.reply(remoteJid, texto);
    }
    // Pergunta em Linguagem Natural: Fallback para IA / RAG ou Transferência Automática por Incompreensão
    else {
      const respondeuPorIa = await this.handleConsultaRAGIA(remoteJid, text, session);
      if (!respondeuPorIa) {
        session.tempData = session.tempData || {};
        session.tempData.tentativasSemSucesso = (session.tempData.tentativasSemSucesso || 0) + 1;
        this.sessionManager.updateSession(session);

        if (session.tempData.tentativasSemSucesso >= 2) {
          session.tempData.tentativasSemSucesso = 0;
          await this.transferirParaConsultorAutomatico(
            remoteJid,
            session,
            'Dúvida não encontrada na base após tentativas consecutivas',
            text
          );
          return;
        }

        await this.reply(
          remoteJid,
          `Não compreendi sua solicitação com precisão. Por favor, digite um número de *1 a 9* ou faça sua pergunta (ex: _"Qual horário de silêncio no sábado?"_).\n\n_Se preferir falar com um consultor humano, digite *0* ou *CONSULTOR*._`
        );
      } else {
        if (session.tempData?.tentativasSemSucesso) {
          session.tempData.tentativasSemSucesso = 0;
          this.sessionManager.updateSession(session);
        }
      }
    }
  }

  // ==========================================
  // CONSULTA RAG & IA EM TEMPO REAL NO WHATSAPP
  // ==========================================
  private async handleConsultaRAGIA(remoteJid: string, text: string, session: any): Promise<boolean> {
    if (!text || text.trim().length < 4) return false;

    const buscadoc = this.ragService.buscarSemantica(text, 3);
    if (!buscadoc || buscadoc.length === 0 || buscadoc[0].score < 0.15) {
      return false;
    }

    const condoNome = session.morador?.unidades?.[0]?.condominioNome || 'Residencial Jardins do Bosque';
    const contextRAG = buscadoc.map(r => `[Fonte: ${r.documentoTitulo}]\n${r.chunk.texto}`).join('\n\n');

    try {
      const respostaIA = await this.llmService.generateAnswer(text, contextRAG, condoNome);
      const topDoc = buscadoc[0];

      // Grava histórico de auditoria e governança de IA no SQLite
      this.dbService.saveAIDecision({
        id: `dec_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
        condominioId: 'condo_1',
        pergunta: text,
        resposta: respostaIA,
        artigoCitado: topDoc.chunk.texto.includes('Artigo') ? topDoc.chunk.texto.split('\n')[0] : 'Regulamento Geral',
        documentoCitado: topDoc.documentoTitulo,
        scoreConfianca: topDoc.score,
        nivelAutonomia: 1,
        statusAprovacao: 'auto_aprovado',
        aprovadoPor: 'CondoVolto RAG Engine',
        tokensConsumidos: Math.floor(text.length * 1.5 + respostaIA.length * 1.2),
        provedor: this.llmService.getConfig().provider,
        modelo: this.llmService.getConfig().modelName,
        timestamp: new Date().toISOString()
      });

      const msgFinal = [
        `🤖 *CondoVolto AI — Inteligência Condominial*`,
        `----------------------------------------`,
        respostaIA,
        ``,
        `📚 *Base Consultada:* ${topDoc.documentoTitulo}`,
        `----------------------------------------`,
        `_Digite *MENU* para ver as opções ou faça outra pergunta sobre o condomínio._`
      ].join('\n');

      await this.reply(remoteJid, msgFinal);
      return true;
    } catch (err: any) {
      console.warn('[BotOrchestrator] Falha ao gerar resposta via LLM/RAG:', err.message);
      return false;
    }
  }

  // ==========================================
  // DÚVIDAS DO REGIMENTO INTERNO (MENU OPÇÃO 5)
  // ==========================================
  private async handleDuvidasRegimento(remoteJid: string, session: any): Promise<void> {
    const docs = this.ragService.listarDocumentos();
    const titulos = docs.map((d, i) => `• *${i + 1}* - ${d.titulo}`).join('\n');

    const msg = [
      `📖 *CONSULTA AO REGIMENTO INTERNO & CONVENÇÃO (RAG)*`,
      `----------------------------------------`,
      `Nossa inteligência artificial tem acesso direto aos regulamentos oficiais do condomínio:`,
      titulos,
      `----------------------------------------`,
      `💬 *Basta digitar sua pergunta diretamente por aqui!* Exemplos:`,
      `• _"Até que horas posso fazer barulho no sábado?"_`,
      `• _"Posso ter cachorro de grande porte no apartamento?"_`,
      `• _"Como funciona a reserva da churrasqueira e qual o valor?"_`,
      `• _"Quais são os dias permitidos para mudança?"_`,
      ``,
      `Digite sua dúvida agora ou envie *MENU* para retornar.`
    ].join('\n');

    await this.reply(remoteJid, msg);
  }

  // ==========================================
  // ENCOMENDAS & PASSES DE VISITANTES (MENU OPÇÃO 6)
  // ==========================================
  private async handleEncomendasEVisitas(remoteJid: string, session: any): Promise<void> {
    const encomendas = this.dbService.getEncomendas().filter(e => e.status === 'aguardando_retirada');
    const visitas = this.dbService.getVisitas().slice(0, 3);

    const listaEnc = encomendas.length > 0
      ? encomendas.map(e => `📦 *${e.transportadora}* (${e.destinatarioNome} - ${e.unidade})\n• Código de Retirada na Portaria: \`${e.codigoRetirada}\`\n• Chegada: ${e.horaChegada}`).join('\n\n')
      : '✅ Não há encomendas pendentes de retirada no momento.';

    const msg = [
      `📦 *PORTARIA DIGITAL — ENCOMENDAS & CONVITES QR CODE*`,
      `----------------------------------------`,
      `📦 *SUAS ENCOMENDAS NA PORTARIA:*`,
      listaEnc,
      `----------------------------------------`,
      `🎟️ *GERAÇÃO DE PASSE QR CODE PARA VISITANTES:*`,
      `Para autorizar a entrada de convidados, prestadores ou delivery sem interfonar:`,
      `• Acesse o app ou solicite à portaria informando o nome e RG do visitante.`,
      `• O QR Code temporário é enviado instantaneamente aqui no seu WhatsApp.`,
      `----------------------------------------`,
      `Digite *MENU* para voltar ao início.`
    ].join('\n');

    await this.reply(remoteJid, msg);
  }

  // ==========================================
  // ASSEMBLEIA VIRTUAL (MENU OPÇÃO 7)
  // ==========================================
  private async handleAssembleiaVirtual(remoteJid: string, session: any): Promise<void> {
    const msg = [
      `🗳️ *ASSEMBLEIA GERAL ORDINÁRIA (AGO 2026/2027) — DIGITAL*`,
      `🏢 Residencial Jardins do Bosque`,
      `📅 Período de Votação: 15/11/2026 a 25/11/2026`,
      `----------------------------------------`,
      `📌 *PAUTA 1:* Aprovação da Previsão Orçamentária 2027`,
      `Status: Aberta para votação`,
      `Quórum Atual: 58% das frações ideais computadas`,
      ``,
      `📌 *PAUTA 2:* Reforma e Pintura da Fachada Externa`,
      `Status: Em debate no fórum digital`,
      `----------------------------------------`,
      `Para registrar o voto da sua unidade pelo WhatsApp:`,
      `Envie *VOTO 1 SIM* ou *VOTO 1 NAO*`,
      ``,
      `_O comprovante criptográfico do voto será emitido na hora com hash de segurança._`,
      `Digite *MENU* para retornar.`
    ].join('\n');

    await this.reply(remoteJid, msg);
  }

  private async handleAguardandoCpf(remoteJid: string, text: string, session: any): Promise<void> {
    const cpfLimpo = limparCpf(text);

    if (!validarCpf(cpfLimpo)) {
      await this.reply(
        remoteJid,
        `⚠️ *CPF inválido.* O número digitado não confere.\n\nPor favor, digite o CPF novamente com 11 números:`
      );
      return;
    }

    await this.reply(
      remoteJid,
      `🔎 Localizando cadastro com o CPF *${mascararCpf(cpfLimpo)}* no SISCON... Aguarde um instante.`
    );

    const morador = await this.sisconService.buscarMoradorPorCpf(cpfLimpo);
    if (!morador || morador.unidades.length === 0) {
      await this.reply(
        remoteJid,
        `❌ Não encontramos nenhuma unidade cadastrada para este CPF no SISCON.\n\nCaso tenha adquirido o imóvel recentemente ou seja inquilino, digite *7* para falar com um atendente.`
      );
      session.state = 'MENU_PRINCIPAL';
      this.sessionManager.updateSession(session);
      return;
    }

    session.morador = morador;
    const unidadePrincipal = morador.unidades[0];
    session.selectedUnidadeId = unidadePrincipal.id;

    const destino = session.tempData?.destinoAposCpf || 'boleto';

    if (destino === 'acordo') {
      await this.iniciarFluxoAcordo(remoteJid, session, unidadePrincipal);
      return;
    }

    // Fluxo normal de 2ª via de boleto
    const boletos = await this.sisconService.listarBoletosEmAberto(unidadePrincipal.id);
    session.boletosDisponiveis = boletos;
    this.sessionManager.updateSession(session);

    if (boletos.length === 0) {
      await this.reply(
        remoteJid,
        `🎉 Parabéns, *${morador.nome}*!\nNão consta nenhum débito em aberto no SISCON para a unidade *${unidadePrincipal.condominioNome} - ${unidadePrincipal.numero}*.\n\nDigite *MENU* para retornar ao início ou *5* para emitir sua Certidão de Nada Consta.`
      );
      session.state = 'MENU_PRINCIPAL';
      this.sessionManager.updateSession(session);
      return;
    }

    const boleto = boletos[0];
    const valorFmt = boleto.valor.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

    const textoBoleto = [
      `✅ *Boleto SISCON Localizado com Sucesso!*`,
      `----------------------------------------`,
      `👤 *Titular:* ${morador.nome}`,
      `🏢 *Condomínio:* ${unidadePrincipal.condominioNome}`,
      `🚪 *Unidade:* ${unidadePrincipal.bloco ? unidadePrincipal.bloco + ' - ' : ''}${unidadePrincipal.numero}`,
      `📅 *Referência:* ${boleto.mesReferencia}`,
      `⏰ *Vencimento:* ${boleto.vencimento}`,
      `💵 *Valor Atualizado:* ${valorFmt}`,
      `----------------------------------------`,
      `📋 *Linha Digitável (Código de Barras):*`,
      `\`\`\`${boleto.linhaDigitavel}\`\`\``,
      ``,
      formatarMensagemPix(boleto.codigoPix, boleto.valor, boleto.vencimento),
      ``,
      `📎 _Estou enviando o arquivo PDF do boleto logo abaixo..._`
    ].join('\n');

    await this.reply(remoteJid, textoBoleto);

    if (boleto.pdfUrl) {
      await this.evolutionService.sendMedia(
        remoteJid,
        boleto.pdfUrl,
        `Boleto_${unidadePrincipal.numero}_${boleto.mesReferencia.replace('/', '-')}.pdf`,
        `Boleto cota condominial ref. ${boleto.mesReferencia}`
      );
    }

    session.state = 'MENU_PRINCIPAL';
    this.sessionManager.updateSession(session);

    await this.reply(
      remoteJid,
      `Precisa de mais alguma coisa? Digite *MENU* para ver as opções ou *SAIR* para finalizar.`
    );
  }

  // ==========================================
  // FLUXO DE ACORDOS & PARCELAMENTO DE DÍVIDAS
  // ==========================================
  private async iniciarFluxoAcordo(remoteJid: string, session: any, unidade: any): Promise<void> {
    const simulacao = await this.sisconService.simularAcordo(unidade.id);
    session.tempData = { ...session.tempData, simulacao };
    session.state = 'SIMULANDO_ACORDO';
    this.sessionManager.updateSession(session);

    const linhasOpcoes = simulacao.opcoes.map((op, idx) => {
      const entrada = op.valorEntrada.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
      const parc = op.valorParcela.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
      return `*Opção ${idx + 1}:* ${op.parcelas}x de ${parc} (Entrada de ${entrada}) ${op.descontoAplicado > 0 ? '🔥 *Desconto nos juros*' : ''}`;
    }).join('\n');

    const totalFmt = simulacao.totalConsolidado.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

    const msg = [
      `🤝 *SIMULADOR DE ACORDO DE DÍVIDAS — SISCON*`,
      `🏢 Unidade: ${unidade.condominioNome} - ${unidade.numero}`,
      `💰 *Valor Total Consolidado:* ${totalFmt}`,
      `_(Inclui principal, multa regimental de 2% e juros de 1% a.m.)_`,
      ``,
      `Escolha o plano de parcelamento desejado:`,
      linhasOpcoes,
      ``,
      `Digite o número da opção desejada (ex: *1*, *2*, *3*, *4*...) ou digite *MENU* para cancelar:`
    ].join('\n');

    await this.reply(remoteJid, msg);
  }

  private async handleSimulandoAcordo(remoteJid: string, text: string, session: any): Promise<void> {
    const lower = text.toLowerCase();
    const termosConsultorAcordo = [
      'desconto', 'proposta', 'falar', 'consultor', 'humano', 'operador',
      'não consigo', 'nao consigo', 'caro', 'parcelar mais', 'negociar', 'financeiro', 'outra proposta'
    ];
    if (termosConsultorAcordo.some((t) => lower.includes(t))) {
      await this.transferirParaConsultorAutomatico(
        remoteJid,
        session,
        `Proposta de acordo personalizada / negociação de dívida fora das opções padrão ("${text.trim()}")`,
        text
      );
      return;
    }

    const optIndex = parseInt(text.trim(), 10) - 1;
    const simulacao = session.tempData?.simulacao;

    if (!simulacao || isNaN(optIndex) || optIndex < 0 || optIndex >= simulacao.opcoes.length) {
      await this.reply(
        remoteJid,
        `Opção inválida. Digite o número de uma das opções acima (ex: *1*, *2*, *3*...) ou digite *MENU* para voltar.\n\n_Se preferir falar com um consultor financeiro, digite *CONSULTOR*._`
      );
      return;
    }

    const opcaoEscolhida = simulacao.opcoes[optIndex];
    const morador = session.morador;
    const unidadeId = session.selectedUnidadeId || 'unid_101';

    await this.reply(
      remoteJid,
      `⏳ Processando seu acordo de ${opcaoEscolhida.parcelas}x no SISCON... Aguarde um momento.`
    );

    const acordo = await this.sisconService.firmarAcordo(
      unidadeId,
      morador?.cpf || '12345678900',
      morador?.nome || 'Condômino',
      opcaoEscolhida.parcelas
    );

    const primeiraParcela = acordo.boletosGerados[0];
    const valorEntradaFmt = primeiraParcela.valor.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

    const msgAcordo = [
      `✅ *PARABÉNS! ACORDO FIRMADO NO SISCON*`,
      `----------------------------------------`,
      `📄 *Protocolo:* \`${acordo.id}\``,
      `👤 *Titular:* ${morador?.nome || 'Condômino'}`,
      `📊 *Plano:* ${acordo.qtdParcelas}x mensais`,
      `💰 *1ª Parcela (Entrada):* ${valorEntradaFmt}`,
      `📅 *Vencimento da Entrada:* ${primeiraParcela.vencimento}`,
      `----------------------------------------`,
      `📋 *Linha Digitável da Entrada:*`,
      `\`\`\`${primeiraParcela.linhaDigitavel}\`\`\``,
      ``,
      formatarMensagemPix(primeiraParcela.codigoPix, primeiraParcela.valor, primeiraParcela.vencimento),
      ``,
      `_As parcelas subsequentes serão enviadas mensalmente via WhatsApp e disponibilizadas no app SISCON Condômino._`,
      ``,
      `Digite *MENU* para retornar ao início.`
    ].join('\n');

    await this.reply(remoteJid, msgAcordo);

    session.state = 'MENU_PRINCIPAL';
    this.sessionManager.updateSession(session);
  }

  // ==========================================
  // SISCON MEDIÇÃO (ÁGUA E GÁS)
  // ==========================================
  private async handleConsultaMedicao(remoteJid: string, session: any): Promise<void> {
    const unidadeId = session.selectedUnidadeId || 'unid_101';
    const med = await this.sisconService.consultarLeituraMedicao(unidadeId);

    const msg = [
      `💧 *SISCON MEDIÇÃO — CONSUMO INDIVIDUALIZADO*`,
      `🏢 ${med.condominioNome || 'Residencial Jardins do Bosque'}`,
      `📅 *Última Leitura:* ${med.dataLeitura}`,
      `👷 *Leiturista:* ${med.leiturista}`,
      `----------------------------------------`,
      `🚰 *ÁGUA:*`,
      `• Leitura Atual: *${med.agua.leituraAtual} m³*`,
      `• Consumo do Mês: *${med.agua.consumoM3} m³*`,
      `• Média Histórica: ${med.agua.mediaHistoricaM3} m³`,
      `• Status: ${med.agua.alertaVazamento ? '⚠️ ALERTA DE POSSÍVEL VAZAMENTO' : '✅ Consumo Normal'}`,
      ``,
      `🔥 *GÁS:*`,
      `• Leitura Atual: *${med.gas.leituraAtual} m³*`,
      `• Consumo do Mês: *${med.gas.consumoM3} m³*`,
      `• Status: ✅ Consumo Normal`,
      `----------------------------------------`,
      `_A foto do hidrômetro coletada pelo app offline está arquivada no SISCON para auditoria._`,
      ``,
      `Digite *MENU* para voltar às opções.`
    ].join('\n');

    await this.reply(remoteJid, msg);
  }

  // ==========================================
  // RESERVAS DE ÁREAS COMUNS
  // ==========================================
  private async handleInicioReserva(remoteJid: string, session: any): Promise<void> {
    const areas = await this.sisconService.listarAreasComuns();
    session.state = 'RESERVANDO_AREA';
    session.tempData = { areas, etapaReserva: 'escolher_area' };
    this.sessionManager.updateSession(session);

    const linhas = areas.map((a, i) =>
      `*${i + 1}* - 📍 *${a.nome}* (Capacidade: ${a.capacidade} pessoas | Taxa: R$ ${(a.taxaUso + a.taxaLimpeza).toFixed(2)})`
    ).join('\n');

    const msg = [
      `📅 *RESERVA DE ÁREAS COMUNS — SISCON*`,
      ``,
      `Selecione o espaço que deseja reservar:`,
      linhas,
      ``,
      `Digite o número do espaço (ex: *1*, *2*, *3*) ou *MENU* para cancelar:`
    ].join('\n');

    await this.reply(remoteJid, msg);
  }

  private async handleReservandoArea(remoteJid: string, text: string, session: any): Promise<void> {
    const etapa = session.tempData?.etapaReserva;
    const areas = session.tempData?.areas || (await this.sisconService.listarAreasComuns());

    if (etapa === 'escolher_area') {
      const idx = parseInt(text.trim(), 10) - 1;
      if (isNaN(idx) || idx < 0 || idx >= areas.length) {
        await this.reply(remoteJid, 'Espaço inválido. Digite um número de *1 a 3* ou *MENU*.');
        return;
      }

      const areaEscolhida = areas[idx];
      session.tempData = { ...session.tempData, areaEscolhida, etapaReserva: 'informar_data' };
      this.sessionManager.updateSession(session);

      await this.reply(
        remoteJid,
        `📍 Você selecionou: *${areaEscolhida.nome}*\n\nPor favor, digite a *data desejada* no formato *DD/MM/AAAA* (ex: 25/11/2026):`
      );
      return;
    }

    if (etapa === 'informar_data') {
      const dataDigitada = text.trim();
      const partes = dataDigitada.split('/');
      let dataIso = dataDigitada;
      if (partes.length === 3) {
        dataIso = `${partes[2]}-${partes[1]}-${partes[0]}`;
      }

      const area = session.tempData?.areaEscolhida;
      const moradorNome = session.morador?.nome || 'Condômino';
      const unidadeId = session.selectedUnidadeId || 'unid_101';

      const resultado = await this.sisconService.solicitarReserva(
        unidadeId,
        moradorNome,
        remoteJid.replace('@s.whatsapp.net', ''),
        area.id,
        dataIso,
        20
      );

      if (!resultado.sucesso) {
        await this.reply(
          remoteJid,
          `⚠️ ${resultado.mensagem}\n\nPor favor, digite outra data (DD/MM/AAAA) ou digite *MENU* para cancelar.`
        );
        return;
      }

      await this.reply(
        remoteJid,
        `🎉 *Reserva confirmada no SISCON!*\n\n${resultado.mensagem}\n\nDigite *MENU* para retornar ao início.`
      );

      session.state = 'MENU_PRINCIPAL';
      this.sessionManager.updateSession(session);
    }
  }

  // ==========================================
  // CERTIDÃO DE NADA CONSTA (Art. 1.336 CC)
  // ==========================================
  private async handleCertidaoNadaConsta(remoteJid: string, session: any): Promise<void> {
    const unidadeId = session.selectedUnidadeId || 'unid_101';
    const morador = session.morador;

    const cert = await this.sisconService.gerarCertidaoNadaConsta(
      unidadeId,
      morador?.nome || 'Condômino',
      morador?.cpf || '123.456.789-00'
    );

    if (!cert.aprovado) {
      await this.reply(
        remoteJid,
        `⚠️ *Emissão Indisponível*\n\n${cert.mensagem}\n\nDigite *1* para emitir a 2ª via ou *2* para simular um acordo de parcelamento.`
      );
      return;
    }

    const msg = [
      `📜 *CERTIDÃO NEGATIVA DE DÉBITOS — SISCON*`,
      `----------------------------------------`,
      `Protocolo: \`${cert.protocolo}\``,
      `Data de Emissão: ${cert.dataEmissao}`,
      `Validade: ${cert.validade}`,
      `Autenticação: \`${cert.hashAutenticidade}\``,
      `----------------------------------------`,
      `_${cert.textoOficial}_`,
      ``,
      `📄 Documento oficial digital amparado pelo Artigo 1.336 da Lei Federal 10.406/2002.`,
      ``,
      `Digite *MENU* para voltar ao menu principal.`
    ].join('\n');

    await this.reply(remoteJid, msg);
  }

  private async handleRegistroOcorrencia(remoteJid: string, text: string, session: any): Promise<void> {
    const moradorId = session.morador?.id || 'morador_anonimo';
    const ocorrencia = await this.sisconService.registrarOcorrencia(moradorId, 'Manutenção/Geral', text);

    session.state = 'MENU_PRINCIPAL';
    this.sessionManager.updateSession(session);

    await this.reply(
      remoteJid,
      `✅ *Ocorrência registrada no SISCON com sucesso!*\n\nProtocolo: *#${ocorrencia.id.slice(-6)}*\nData: ${new Date().toLocaleDateString('pt-BR')}\n\nO chamado foi gravado no painel da administração e direcionado para a equipe responsável.\n\nDigite *MENU* para retornar ao início.`
    );
  }
}
