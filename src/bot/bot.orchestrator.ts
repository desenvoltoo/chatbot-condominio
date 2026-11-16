import { SessionManager } from './session.manager.js';
import { EvolutionService } from '../services/evolution.service.js';
import { SisconService } from '../services/siscon.service.js';
import { validarCpf, limparCpf, mascararCpf } from '../utils/cpf.util.js';
import { formatarMensagemPix } from '../utils/pix.util.js';
import { config } from '../config.js';

export class BotOrchestrator {
  private sessionManager: SessionManager;
  private evolutionService: EvolutionService;
  private sisconService: SisconService;

  constructor() {
    this.sessionManager = new SessionManager();
    this.evolutionService = new EvolutionService();
    this.sisconService = new SisconService();
  }

  getSessionManager(): SessionManager {
    return this.sessionManager;
  }

  getErpService(): SisconService {
    return this.sisconService;
  }

  async processIncomingMessage(remoteJid: string, text: string, pushName?: string): Promise<void> {
    const rawText = text.trim();
    const lowerText = rawText.toLowerCase();
    const session = this.sessionManager.getSession(remoteJid, pushName);
    const nomeUsuario = pushName || 'Condômino(a)';

    // Comandos globais de reinício
    if (['menu', 'inicio', 'voltar', 'cancelar', 'ola', 'olá', 'oi'].includes(lowerText) && session.state !== 'INICIO') {
      this.sessionManager.resetSession(remoteJid);
      await this.enviarMenuPrincipal(remoteJid, nomeUsuario);
      return;
    }

    // Interceptador Global para Atendimento Humano / Modo 100% Autônomo
    const termosAtendente = [
      'atendente',
      'humano',
      'operador',
      'pessoa',
      'falar com alguém',
      'falar com alguem',
      'falar com atendente',
      'suporte',
      'ajuda',
    ];
    if (termosAtendente.some((termo) => lowerText.includes(termo)) && session.state !== 'ATENDIMENTO_HUMANO') {
      const isAutonomo = true; // DOMUS AI opera em modo 100% autônomo
      if (isAutonomo && !lowerText.includes('operador humano') && !lowerText.includes('urgente')) {
        await this.evolutionService.sendText(
          remoteJid,
          '🤖 *Central de Inteligência DOMUS AI (Modo 100% Autônomo)*\n\nSou a IA autônoma do condomínio e posso resolver sua solicitação **imediatamente, sem filas de espera e sem intervenção humana**!\n\nPosso realizar para você agora mesmo:\n• *1* - 📄 Emitir 2ª via de boleto com Pix Copia e Cola\n• *2* - 🤝 Simular e fechar acordo de parcelamento de débito\n• *3* - 💧 Consultar medição de água/gás\n• *4* - 📅 Reservar salão de festas ou churrasqueira\n• *5* - 📖 Tirar dúvidas do Regimento Interno e Convenção\n• *6* - 🛠️ Registrar chamado de manutenção\n\n_Basta digitar o número ou o que você precisa!_'
        );
        return;
      }
      session.state = 'ATENDIMENTO_HUMANO';
      this.sessionManager.setHumanHandoff(remoteJid, true);
      this.sessionManager.updateSession(session);
      await this.evolutionService.sendText(
        remoteJid,
        '👤 *Transferindo para Atendente Humano...*\n\nEntendi! Notifiquei nossa equipe operacional no painel.\n\nUm de nossos colaboradores responderá por aqui em instantes.\n\n_Para retornar ao autoatendimento a qualquer momento, digite *MENU* ou *SAIR*._'
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
          this.sessionManager.setHumanHandoff(remoteJid, false);
          this.sessionManager.resetSession(remoteJid);
          await this.evolutionService.sendText(
            remoteJid,
            '✅ Atendimento humano encerrado. Se precisar de algo mais, basta mandar uma nova mensagem!'
          );
        }
        break;

      default:
        this.sessionManager.resetSession(remoteJid);
        await this.enviarMenuPrincipal(remoteJid, nomeUsuario);
        break;
    }
  }

  private async enviarMenuPrincipal(remoteJid: string, nome: string): Promise<void> {
    const session = this.sessionManager.getSession(remoteJid);
    session.state = 'MENU_PRINCIPAL';
    this.sessionManager.updateSession(session);

    const mensagem = [
      `👋 Olá, *${nome}*! Bem-vindo(a) ao *DOMUS AI* — Inteligência Condominial Autônoma.`,
      `⚡ *Piloto Automático 100% Ativo: Todas as tarefas são resolvidas sem espera e sem intervenção humana!*`,
      ``,
      `Como posso ajudar você agora? Digite o número ou descreva o que precisa:`,
      ``,
      `*1* - 📄 2ª Via de Boleto & Pix Copia e Cola (Recálculo Automático)`,
      `*2* - 🤝 Negociação & Acordo de Débito (Termo Jurídico SHA-256)`,
      `*3* - 💧 Telemetria & Medição (Água e Gás)`,
      `*4* - 📅 Reservas de Áreas Comuns (Churrasqueira/Salão)`,
      `*5* - 📖 Dúvidas do Regimento Interno & Convenção (RAG)`,
      `*6* - 📦 Notificação de Encomendas & Passes de Visitantes com QR Code`,
      `*7* - 🗳️ Votação em Assembleia Virtual`,
      `*8* - 🛠️ Abertura de Chamado / Manutenção Predial`,
      ``,
      `_A qualquer momento, digite *MENU* para retornar ao início._`
    ].join('\n');

    await this.evolutionService.sendText(remoteJid, mensagem);
  }

  private async handleInicio(remoteJid: string, text: string, nome: string): Promise<void> {
    if (text.includes('boleto') || text.includes('segunda via') || text.includes('pix') || text.includes('pagar')) {
      const session = this.sessionManager.getSession(remoteJid);
      session.state = 'AGUARDANDO_CPF';
      session.tempData = { destinoAposCpf: 'boleto' };
      this.sessionManager.updateSession(session);

      await this.evolutionService.sendText(
        remoteJid,
        `📄 Perfeito! Para localizar sua cota condominial no SISCON, por favor *digite o seu CPF* (apenas números ou com pontos):`
      );
      return;
    }

    if (text.includes('acordo') || text.includes('parcelar') || text.includes('divida') || text.includes('dívida')) {
      const session = this.sessionManager.getSession(remoteJid);
      session.state = 'AGUARDANDO_CPF';
      session.tempData = { destinoAposCpf: 'acordo' };
      this.sessionManager.updateSession(session);

      await this.evolutionService.sendText(
        remoteJid,
        `🤝 Vamos simular um acordo de débito! Para verificar as pendências no SISCON, por favor *digite o seu CPF*:`
      );
      return;
    }

    await this.enviarMenuPrincipal(remoteJid, nome);
  }

  private async handleMenuPrincipal(remoteJid: string, text: string, session: any): Promise<void> {
    // 1 - Boleto
    if (text === '1' || text.includes('boleto') || text.includes('pix')) {
      session.state = 'AGUARDANDO_CPF';
      session.tempData = { destinoAposCpf: 'boleto' };
      this.sessionManager.updateSession(session);

      await this.evolutionService.sendText(
        remoteJid,
        `📄 Por favor, informe o seu *CPF* (apenas números ou com pontuação) para consultarmos seus débitos no SISCON:`
      );
    }
    // 2 - Acordo / Parcelamento
    else if (text === '2' || text.includes('acordo') || text.includes('parcel')) {
      session.state = 'AGUARDANDO_CPF';
      session.tempData = { destinoAposCpf: 'acordo' };
      this.sessionManager.updateSession(session);

      await this.evolutionService.sendText(
        remoteJid,
        `🤝 *Simulador de Acordo SISCON*\n\nPor favor, informe o seu *CPF* para localizarmos as cotas em aberto e montar as opções de parcelamento:`
      );
    }
    // 3 - SISCON Medição (Água e Gás)
    else if (text === '3' || text.includes('medicao') || text.includes('agua') || text.includes('gás')) {
      await this.handleConsultaMedicao(remoteJid, session);
    }
    // 4 - Reservas de Áreas Comuns
    else if (text === '4' || text.includes('reserva') || text.includes('salao') || text.includes('churrasqueira')) {
      await this.handleInicioReserva(remoteJid, session);
    }
    // 5 - Certidões / Nada Consta
    else if (text === '5' || text.includes('certidao') || text.includes('nada consta') || text.includes('quitacao')) {
      await this.handleCertidaoNadaConsta(remoteJid, session);
    }
    // 6 - Ocorrência
    else if (text === '6' || text.includes('ocorrencia') || text.includes('manuten')) {
      session.state = 'AGUARDANDO_DESCRICAO_OCORRENCIA';
      this.sessionManager.updateSession(session);

      await this.evolutionService.sendText(
        remoteJid,
        `🛠️ *Registro de Ocorrência / Chamado*\n\nPor favor, digite uma descrição detalhada do problema (ex: vazamento no hall, lâmpada queimada na garagem, portão travado, etc.):`
      );
    }
    // 7 - Atendente Humano
    else if (text === '7' || text.includes('atendente') || text.includes('humano')) {
      session.state = 'ATENDIMENTO_HUMANO';
      this.sessionManager.setHumanHandoff(remoteJid, true);
      this.sessionManager.updateSession(session);

      await this.evolutionService.sendText(
        remoteJid,
        `👤 Você foi transferido para a fila de atendimento operacional humano.\n\nUm de nossos atendentes entrará em contato em instantes.\n\n_Para encerrar a fila a qualquer momento, digite *SAIR*._`
      );
    }
    // 8 - Comunicados
    else if (text === '8' || text.includes('aviso') || text.includes('comunicado')) {
      const comunicados = await this.sisconService.listarComunicados();
      const texto = [
        `📢 *Mural de Comunicados Oficiais — SISCON*`,
        `🏢 Residencial Jardins do Bosque`,
        `----------------------------------------`,
        ...comunicados.map(c => `📌 *${c.titulo}*\n${c.conteudo}\n_Publicado por: ${c.autor}_`),
        `----------------------------------------`,
        `Digite *MENU* para retornar ao início.`
      ].join('\n\n');
      await this.evolutionService.sendText(remoteJid, texto);
    } else {
      await this.evolutionService.sendText(
        remoteJid,
        `Opção não reconhecida. Por favor, digite um número de *1 a 8* ou envie *MENU* para ver as opções.`
      );
    }
  }

  private async handleAguardandoCpf(remoteJid: string, text: string, session: any): Promise<void> {
    const cpfLimpo = limparCpf(text);

    if (!validarCpf(cpfLimpo)) {
      await this.evolutionService.sendText(
        remoteJid,
        `⚠️ *CPF inválido.* O número digitado não confere.\n\nPor favor, digite o CPF novamente com 11 números:`
      );
      return;
    }

    await this.evolutionService.sendText(
      remoteJid,
      `🔎 Localizando cadastro com o CPF *${mascararCpf(cpfLimpo)}* no SISCON... Aguarde um instante.`
    );

    const morador = await this.sisconService.buscarMoradorPorCpf(cpfLimpo);
    if (!morador || morador.unidades.length === 0) {
      await this.evolutionService.sendText(
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
      await this.evolutionService.sendText(
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

    await this.evolutionService.sendText(remoteJid, textoBoleto);

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

    await this.evolutionService.sendText(
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

    await this.evolutionService.sendText(remoteJid, msg);
  }

  private async handleSimulandoAcordo(remoteJid: string, text: string, session: any): Promise<void> {
    const optIndex = parseInt(text.trim(), 10) - 1;
    const simulacao = session.tempData?.simulacao;

    if (!simulacao || isNaN(optIndex) || optIndex < 0 || optIndex >= simulacao.opcoes.length) {
      await this.evolutionService.sendText(
        remoteJid,
        `Opção inválida. Digite o número de uma das opções acima (ex: *1*, *2*, *3*...) ou digite *MENU* para voltar.`
      );
      return;
    }

    const opcaoEscolhida = simulacao.opcoes[optIndex];
    const morador = session.morador;
    const unidadeId = session.selectedUnidadeId || 'unid_101';

    await this.evolutionService.sendText(
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

    await this.evolutionService.sendText(remoteJid, msgAcordo);

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

    await this.evolutionService.sendText(remoteJid, msg);
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

    await this.evolutionService.sendText(remoteJid, msg);
  }

  private async handleReservandoArea(remoteJid: string, text: string, session: any): Promise<void> {
    const etapa = session.tempData?.etapaReserva;
    const areas = session.tempData?.areas || (await this.sisconService.listarAreasComuns());

    if (etapa === 'escolher_area') {
      const idx = parseInt(text.trim(), 10) - 1;
      if (isNaN(idx) || idx < 0 || idx >= areas.length) {
        await this.evolutionService.sendText(remoteJid, 'Espaço inválido. Digite um número de *1 a 3* ou *MENU*.');
        return;
      }

      const areaEscolhida = areas[idx];
      session.tempData = { ...session.tempData, areaEscolhida, etapaReserva: 'informar_data' };
      this.sessionManager.updateSession(session);

      await this.evolutionService.sendText(
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
        await this.evolutionService.sendText(
          remoteJid,
          `⚠️ ${resultado.mensagem}\n\nPor favor, digite outra data (DD/MM/AAAA) ou digite *MENU* para cancelar.`
        );
        return;
      }

      await this.evolutionService.sendText(
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
      await this.evolutionService.sendText(
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

    await this.evolutionService.sendText(remoteJid, msg);
  }

  private async handleRegistroOcorrencia(remoteJid: string, text: string, session: any): Promise<void> {
    const moradorId = session.morador?.id || 'morador_anonimo';
    const ocorrencia = await this.sisconService.registrarOcorrencia(moradorId, 'Manutenção/Geral', text);

    session.state = 'MENU_PRINCIPAL';
    this.sessionManager.updateSession(session);

    await this.evolutionService.sendText(
      remoteJid,
      `✅ *Ocorrência registrada no SISCON com sucesso!*\n\nProtocolo: *#${ocorrencia.id.slice(-6)}*\nData: ${new Date().toLocaleDateString('pt-BR')}\n\nO chamado foi gravado no painel da administração e direcionado para a equipe responsável.\n\nDigite *MENU* para retornar ao início.`
    );
  }
}
