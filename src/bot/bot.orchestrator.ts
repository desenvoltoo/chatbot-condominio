import { SessionManager } from './session.manager.js';
import { EvolutionService } from '../services/evolution.service.js';
import { IErpService } from '../services/erp.service.js';
import { MockErpService } from '../services/mock-erp.service.js';
import { validarCpf, limparCpf, mascararCpf } from '../utils/cpf.util.js';
import { formatarMensagemPix } from '../utils/pix.util.js';
import { config } from '../config.js';

export class BotOrchestrator {
  private sessionManager: SessionManager;
  private evolutionService: EvolutionService;
  private erpService: IErpService;

  constructor() {
    this.sessionManager = new SessionManager();
    this.evolutionService = new EvolutionService();
    this.erpService = new MockErpService(); // Inicializado com Mock; conectável a qualquer ERP via IErpService
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

      case 'ESCOLHENDO_BOLETO':
        await this.handleEscolhendoBoleto(remoteJid, rawText, session);
        break;

      case 'AGUARDANDO_DESCRICAO_OCORRENCIA':
        await this.handleRegistroOcorrencia(remoteJid, rawText, session);
        break;

      case 'ATENDIMENTO_HUMANO':
        // No atendimento humano, o bot permanece em silêncio para os atendentes responderem
        if (lowerText === 'sair' || lowerText === 'finalizar') {
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
      `👋 Olá, *${nome}*! Seja bem-vindo(a) ao autoatendimento da *${config.company.nome}*.`,
      ``,
      `Como posso ajudar você hoje? Digite o número da opção desejada:`,
      ``,
      `*1* - 📄 2ª Via de Boleto / Código Pix`,
      `*2* - 🛠️ Abertura de Ocorrência / Manutenção`,
      `*3* - 📅 Reservas de Áreas Comuns`,
      `*4* - 👤 Falar com Atendente Humano`,
      `*5* - ℹ️ Horário de Atendimento e Telefones`,
      ``,
      `_A qualquer momento, digite *MENU* para retornar._`
    ].join('\n');

    await this.evolutionService.sendText(remoteJid, mensagem);
  }

  private async handleInicio(remoteJid: string, text: string, nome: string): Promise<void> {
    // Se o morador já mandou "boleto" ou "pix" logo na primeira mensagem
    if (text.includes('boleto') || text.includes('segunda via') || text.includes('pix') || text.includes('pagar')) {
      const session = this.sessionManager.getSession(remoteJid);
      session.state = 'AGUARDANDO_CPF';
      this.sessionManager.updateSession(session);

      await this.evolutionService.sendText(
        remoteJid,
        `📄 Perfeito! Para localizar sua cota condominial, por favor *digite o seu CPF* (apenas números ou com pontos):`
      );
      return;
    }

    await this.enviarMenuPrincipal(remoteJid, nome);
  }

  private async handleMenuPrincipal(remoteJid: string, text: string, session: any): Promise<void> {
    if (text === '1' || text.includes('boleto') || text.includes('pix')) {
      session.state = 'AGUARDANDO_CPF';
      this.sessionManager.updateSession(session);

      await this.evolutionService.sendText(
        remoteJid,
        `📄 Por favor, informe o seu *CPF* (apenas números ou com pontuação) para consultarmos seus débitos:`
      );
    } else if (text === '2' || text.includes('ocorrencia') || text.includes('manuten')) {
      session.state = 'AGUARDANDO_DESCRICAO_OCORRENCIA';
      this.sessionManager.updateSession(session);

      await this.evolutionService.sendText(
        remoteJid,
        `🛠️ *Registro de Ocorrência / Chamado*\n\nPor favor, digite uma descrição detalhada do problema (ex: vazamento na garagem, lâmpada queimada no bloco, etc.):`
      );
    } else if (text === '3' || text.includes('reserva')) {
      await this.evolutionService.sendText(
        remoteJid,
        `📅 *Reservas de Áreas Comuns*\n\nPara consultar o regulamento ou reservar o Salão de Festas / Churrasqueira, você também pode acessar nosso portal web do condomínio ou aguardar a confirmação de disponibilidade.\n\nDigite *MENU* para voltar ou *4* para falar com o síndico/atendente.`
      );
    } else if (text === '4' || text.includes('atendente') || text.includes('humano')) {
      session.state = 'ATENDIMENTO_HUMANO';
      this.sessionManager.updateSession(session);

      await this.evolutionService.sendText(
        remoteJid,
        `👤 Você foi transferido para a nossa fila de atendimento humano.\n\nUm de nossos atendentes entrará em contato em instantes.\n\n_Para encerrar a fila a qualquer momento, digite *SAIR*._`
      );
    } else if (text === '5' || text.includes('horario') || text.includes('telefone')) {
      await this.evolutionService.sendText(
        remoteJid,
        `ℹ️ *Informações de Contato*\n\n🏢 *${config.company.nome}*\n🕒 Horário: ${config.company.horarioAtendimento}\n📞 Telefone/Plantão: ${config.company.telefoneSuporte}\n\nDigite *MENU* para voltar às opções.`
      );
    } else {
      await this.evolutionService.sendText(
        remoteJid,
        `Opção não reconhecida. Por favor, digite um número de *1 a 5* ou digite *MENU*.`
      );
    }
  }

  private async handleAguardandoCpf(remoteJid: string, text: string, session: any): Promise<void> {
    const cpfLimpo = limparCpf(text);

    if (!validarCpf(cpfLimpo)) {
      await this.evolutionService.sendText(
        remoteJid,
        `⚠️ *CPF inválido.* O número digitado não confere com os dígitos verificadores da Receita Federal.\n\nPor favor, digite o CPF novamente com 11 números:`
      );
      return;
    }

    await this.evolutionService.sendText(remoteJid, `🔎 Localizando cadastro com o CPF *${mascararCpf(cpfLimpo)}*... Aguarde um instante.`);

    const morador = await this.erpService.buscarMoradorPorCpf(cpfLimpo);
    if (!morador || morador.unidades.length === 0) {
      await this.evolutionService.sendText(
        remoteJid,
        `❌ Não encontramos nenhuma unidade cadastrada para este CPF.\n\nCaso tenha adquirido o imóvel recentemente ou seja inquilino, digite *4* para falar com um atendente e atualizar seu cadastro.`
      );
      session.state = 'MENU_PRINCIPAL';
      this.sessionManager.updateSession(session);
      return;
    }

    session.morador = morador;
    const unidadePrincipal = morador.unidades[0];
    session.selectedUnidadeId = unidadePrincipal.id;

    // Busca boletos em aberto
    const boletos = await this.erpService.listarBoletosEmAberto(unidadePrincipal.id);
    session.boletosDisponiveis = boletos;
    this.sessionManager.updateSession(session);

    if (boletos.length === 0) {
      await this.evolutionService.sendText(
        remoteJid,
        `🎉 Parabéns, *${morador.nome}*!\nNão consta nenhum débito em aberto para a unidade *${unidadePrincipal.condominioNome} - ${unidadePrincipal.numero}*.\n\nDigite *MENU* para retornar ao início.`
      );
      session.state = 'MENU_PRINCIPAL';
      this.sessionManager.updateSession(session);
      return;
    }

    const boleto = boletos[0];
    const valorFmt = boleto.valor.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

    // Envia os dados do boleto
    const textoBoleto = [
      `✅ *Boleto Localizado com Sucesso!*`,
      `----------------------------------------`,
      `👤 *Titular:* ${morador.nome}`,
      `🏢 *Condomínio:* ${unidadePrincipal.condominioNome}`,
      `🚪 *Unidade:* ${unidadePrincipal.bloco ? unidadePrincipal.bloco + ' - ' : ''}${unidadePrincipal.numero}`,
      `📅 *Referência:* ${boleto.mesReferencia}`,
      `⏰ *Vencimento:* ${boleto.vencimento}`,
      `💵 *Valor:* ${valorFmt}`,
      `----------------------------------------`,
      `📋 *Linha Digitável (Código de Barras):*`,
      `\`\`\`${boleto.linhaDigitavel}\`\`\``,
      ``,
      formatarMensagemPix(boleto.codigoPix, boleto.valor, boleto.vencimento),
      ``,
      `📎 _Estou enviando o arquivo PDF do boleto logo abaixo..._`
    ].join('\n');

    await this.evolutionService.sendText(remoteJid, textoBoleto);

    // Envia o arquivo PDF do boleto
    await this.evolutionService.sendMedia(
      remoteJid,
      boleto.pdfUrl,
      `Boleto_${unidadePrincipal.numero}_${boleto.mesReferencia.replace('/', '-')}.pdf`,
      `Boleto cota condominial ref. ${boleto.mesReferencia}`
    );

    session.state = 'MENU_PRINCIPAL';
    this.sessionManager.updateSession(session);

    await this.evolutionService.sendText(
      remoteJid,
      `Precisa de mais alguma coisa? Digite *MENU* para ver as opções ou *SAIR* para finalizar.`
    );
  }

  private async handleEscolhendoBoleto(remoteJid: string, text: string, session: any): Promise<void> {
    session.state = 'MENU_PRINCIPAL';
    this.sessionManager.updateSession(session);
    await this.enviarMenuPrincipal(remoteJid, session.pushName || 'Condômino');
  }

  private async handleRegistroOcorrencia(remoteJid: string, text: string, session: any): Promise<void> {
    const moradorId = session.morador?.id || 'morador_anonimo';
    const ocorrencia = await this.erpService.registrarOcorrencia(moradorId, 'Geral', text);

    session.state = 'MENU_PRINCIPAL';
    this.sessionManager.updateSession(session);

    await this.evolutionService.sendText(
      remoteJid,
      `✅ *Ocorrência registrada com sucesso!*\n\nProtocolo: *#${ocorrencia.id.slice(-6)}*\nData: ${new Date().toLocaleDateString('pt-BR')}\n\nO síndico e a equipe de manutenção foram notificados. Acompanharemos o andamento do seu chamado.\n\nDigite *MENU* para retornar.`
    );
  }
}
