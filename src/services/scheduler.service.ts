import { DbService } from './db.service.js';
import { EvolutionService } from './evolution.service.js';
import { config } from '../config.js';

export interface ResultadoRegua {
  disparosRealizados: number;
  totalAnalisados: number;
  detalhes: Array<{
    cobrancaId: string;
    moradorNome: string;
    unidadeId: string;
    tipoRegua: 'D-3' | 'D-0' | 'D+3';
    valor: number;
    targetJid: string;
  }>;
}

export class SchedulerService {
  private dbService: DbService;
  private evolutionService: EvolutionService;
  private timer: NodeJS.Timeout | null = null;
  private ultimaDataExecucao: string = '';

  constructor(dbService?: DbService, evolutionService?: EvolutionService) {
    this.dbService = dbService || DbService.getInstance();
    this.evolutionService = evolutionService || new EvolutionService();
  }

  /**
   * Executa a análise e os disparos da régua de cobrança preventiva (D-3, D-0, D+3).
   * Pode ser chamado tanto pelo agendador automático diário quanto manualmente via API / painel.
   */
  async executarReguaPreventiva(): Promise<ResultadoRegua> {
    const hoje = new Date();
    hoje.setHours(0, 0, 0, 0);

    const cobrancas = this.dbService.getCobrancas({ status: 'aberto' });
    let disparosRealizados = 0;
    const detalhes: ResultadoRegua['detalhes'] = [];

    console.log(`[Scheduler] 📅 Iniciando análise de régua preventiva. ${cobrancas.length} cobranças em aberto encontradas.`);

    for (const cob of cobrancas) {
      if (!cob.vencimento) continue;
      const targetJid = cob.remoteJid || (cob.moradorTelefone ? `${cob.moradorTelefone.replace(/\D/g, '')}@s.whatsapp.net` : null);
      if (!targetJid) continue;

      let vencDate: Date | null = null;
      if (cob.vencimento.includes('/')) {
        const [d, m, y] = cob.vencimento.split('/').map(Number);
        vencDate = new Date(y, m - 1, d);
      } else if (cob.vencimento.includes('-')) {
        const [y, m, d] = cob.vencimento.split('-').map(Number);
        vencDate = new Date(y, m - 1, d);
      }
      if (!vencDate) continue;
      vencDate.setHours(0, 0, 0, 0);

      const diffDias = Math.round((vencDate.getTime() - hoje.getTime()) / (1000 * 60 * 60 * 24));
      let tipoRegua: 'D-3' | 'D-0' | 'D+3' | null = null;

      if (diffDias === 3) tipoRegua = 'D-3';
      else if (diffDias === 0) tipoRegua = 'D-0';
      else if (diffDias === -3) tipoRegua = 'D+3';

      if (!tipoRegua) continue;
      if (this.dbService.jaDisparouRegua(cob.id, tipoRegua)) continue;

      const valorFmt = cob.valor.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
      let textoMsg = '';

      if (tipoRegua === 'D-3') {
        textoMsg = [
          `📅 *Lembrete de Vencimento — CondoVolto AI*`,
          `----------------------------------------`,
          `Olá, *${cob.moradorNome}*! Tudo bem?`,
          `Sua cota condominial da unidade *${cob.unidadeId}* vence em *3 dias* (${cob.vencimento}).`,
          ``,
          `💰 *Valor:* ${valorFmt}`,
          `📋 *Pix Copia e Cola:*`,
          `\`${cob.pixCopiaECola}\``,
          `----------------------------------------`,
          `_Pague com rapidez e segurança pelo app do seu banco._`
        ].join('\n');
      } else if (tipoRegua === 'D-0') {
        textoMsg = [
          `⏰ *Vencimento Hoje — CondoVolto AI*`,
          `----------------------------------------`,
          `Olá, *${cob.moradorNome}*!`,
          `Hoje é o dia de vencimento da cota condominial da unidade *${cob.unidadeId}*.`,
          ``,
          `💰 *Valor:* ${valorFmt}`,
          `📋 *Pix Copia e Cola (Evite Multas e Juros):*`,
          `\`${cob.pixCopiaECola}\``,
          `----------------------------------------`,
          `_Agradecemos sua colaboração e pontualidade!_`
        ].join('\n');
      } else if (tipoRegua === 'D+3') {
        textoMsg = [
          `⚠️ *Aviso de Pendência — CondoVolto AI*`,
          `----------------------------------------`,
          `Olá, *${cob.moradorNome}*!`,
          `Notamos que a cota da unidade *${cob.unidadeId}* vencida em ${cob.vencimento} consta em aberto.`,
          ``,
          `💰 *Valor Original:* ${valorFmt}`,
          `📋 *Pix Copia e Cola Atualizado:*`,
          `\`${cob.pixCopiaECola}\``,
          `----------------------------------------`,
          `_Caso queira parcelar ou simular um acordo de dívida, responda *ACORDO* por aqui._`
        ].join('\n');
      }

      try {
        await this.evolutionService.sendText(targetJid, textoMsg);
        this.dbService.registrarDisparoRegua({
          id: `regua_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`,
          cobrancaId: cob.id,
          remoteJid: targetJid,
          moradorNome: cob.moradorNome,
          unidadeId: cob.unidadeId,
          tipoRegua,
          valor: cob.valor,
          vencimento: cob.vencimento,
          disparadoEm: new Date().toISOString(),
          status: 'enviado'
        });
        disparosRealizados++;
        detalhes.push({
          cobrancaId: cob.id,
          moradorNome: cob.moradorNome,
          unidadeId: cob.unidadeId,
          tipoRegua,
          valor: cob.valor,
          targetJid
        });
      } catch (err: any) {
        console.error(`[Scheduler] Erro ao enviar lembrete para ${targetJid}:`, err?.message);
      }
    }

    console.log(`[Scheduler] ✅ Execução concluída. ${disparosRealizados} lembretes enviados.`);
    return {
      disparosRealizados,
      totalAnalisados: cobrancas.length,
      detalhes
    };
  }

  /**
   * Inicia o monitor agendado em segundo plano.
   * Verifica a cada 15 minutos se chegou a hora configurada (padrão: 09:00).
   */
  iniciarAgendador(): void {
    if (!config.regua.autoEnabled) {
      console.log(`[Scheduler] ℹ️ Agendador automático da régua Pix desativado por configuração (REGUA_AUTO_ENABLED=false).`);
      return;
    }

    const horaAlvo = config.regua.horaDisparo;
    console.log(`[Scheduler] 🕒 Agendador automático da Régua de Cobrança ativo (Disparo diário programado para às ${String(horaAlvo).padStart(2, '0')}:00).`);

    // Checagem imediata se já deve rodar hoje e não rodou
    this.verificarEExecutarSeNecessario();

    // Loop periódico a cada 15 minutos
    this.timer = setInterval(() => {
      this.verificarEExecutarSeNecessario();
    }, 15 * 60 * 1000);
  }

  private async verificarEExecutarSeNecessario(): Promise<void> {
    const agora = new Date();
    const dataHojeStr = agora.toISOString().split('T')[0];
    const horaAtual = agora.getHours();
    const horaAlvo = config.regua.horaDisparo;

    // Se já passou da hora de disparo e ainda não executou no dia de hoje
    if (horaAtual >= horaAlvo && this.ultimaDataExecucao !== dataHojeStr) {
      this.ultimaDataExecucao = dataHojeStr;
      console.log(`[Scheduler] ⏰ Horário atingido (${horaAtual}h >= ${horaAlvo}h). Executando régua diária de cobrança...`);
      try {
        await this.executarReguaPreventiva();
      } catch (e: any) {
        console.error('[Scheduler] Falha na execução agendada da régua:', e?.message);
      }
    }
  }

  pararAgendador(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
      console.log(`[Scheduler] Agendador parado.`);
    }
  }
}
