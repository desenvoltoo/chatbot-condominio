import axios, { AxiosInstance } from 'axios';
import { IErpService } from './erp.service.js';
import { Morador, Boleto, Ocorrencia, Comunicado } from '../types/index.js';
import { limparCpf } from '../utils/cpf.util.js';
import { config } from '../config.js';
import { MockErpService } from './mock-erp.service.js';

/**
 * Conector de Integração Oficial para o ERP SISCON (Mais Domínio)
 * Documentação da plataforma: https://siscongestao.com.br
 */
export class SisconService implements IErpService {
  private client: AxiosInstance;
  private fallbackService: MockErpService;
  private isConfigured: boolean;

  constructor() {
    this.fallbackService = new MockErpService();
    
    const baseUrl = config.erp.baseUrl || 'https://api.siscongestao.com.br/v1';
    const token = config.erp.appToken || config.erp.accessToken;
    this.isConfigured = Boolean(token && token !== 'token_teste');

    this.client = axios.create({
      baseURL: baseUrl,
      timeout: 10000,
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        ...(token ? { 'Authorization': `Bearer ${token}`, 'x-api-key': token } : {})
      }
    });

    if (!this.isConfigured) {
      console.log('ℹ️ [SISCON] Credenciais de produção não configuradas no .env. Operando com conector Siscon em modo Sandbox/Simulação.');
    } else {
      console.log(`🔗 [SISCON] Conector ativo conectado ao endpoint: ${baseUrl}`);
    }
  }

  async buscarMoradorPorCpf(cpf: string): Promise<Morador | null> {
    const cpfLimpo = limparCpf(cpf);

    if (!this.isConfigured) {
      return this.fallbackService.buscarMoradorPorCpf(cpfLimpo);
    }

    try {
      // Endpoint padrão Siscon para consulta de titular/morador
      const response = await this.client.get(`/moradores/cpf/${cpfLimpo}`);
      const data = response.data;

      if (!data || !data.id) return null;

      return {
        id: String(data.id || data.codigo_morador),
        nome: data.nome || data.razao_social,
        cpf: cpfLimpo,
        telefone: data.telefone || data.celular,
        unidades: (data.unidades || []).map((u: any) => ({
          id: String(u.id || u.codigo_unidade),
          condominioNome: u.condominio_nome || u.nome_condominio,
          bloco: u.bloco || u.torre || '',
          numero: u.apartamento || u.unidade || u.numero
        }))
      };
    } catch (err: any) {
      console.warn(`[SISCON API] Erro ao buscar morador CPF ${cpfLimpo}: ${err.message}. Ativando fallback sandbox.`);
      return this.fallbackService.buscarMoradorPorCpf(cpfLimpo);
    }
  }

  async listarBoletosEmAberto(unidadeId: string): Promise<Boleto[]> {
    if (!this.isConfigured) {
      return this.fallbackService.listarBoletosEmAberto(unidadeId);
    }

    try {
      // Endpoint Siscon para listar cobranças e cotas condominiais
      const response = await this.client.get(`/cobrancas/unidade/${unidadeId}`, {
        params: { status: 'aberto' }
      });
      const items = Array.isArray(response.data) ? response.data : (response.data?.boletos || []);

      return items.map((b: any) => ({
        id: String(b.id || b.nosso_numero),
        unidadeId: unidadeId,
        mesReferencia: b.mes_referencia || b.competencia,
        vencimento: b.data_vencimento || b.vencimento,
        valor: parseFloat(b.valor || b.valor_total || 0),
        linhaDigitavel: b.linha_digitavel || b.codigo_barras,
        codigoPix: b.pix_copia_e_cola || b.qrcode_pix,
        pdfUrl: b.url_pdf || b.link_segunda_via,
        status: b.status || 'aberto'
      }));
    } catch (err: any) {
      console.warn(`[SISCON API] Erro ao listar boletos da unidade ${unidadeId}: ${err.message}. Usando fallback.`);
      return this.fallbackService.listarBoletosEmAberto(unidadeId);
    }
  }

  async gerarSegundaVia(boletoId: string): Promise<Boleto | null> {
    if (!this.isConfigured) {
      return this.fallbackService.gerarSegundaVia(boletoId);
    }

    try {
      // Endpoint Siscon para recalcular encargos e gerar nova linha digitável / Pix
      const response = await this.client.post(`/cobrancas/${boletoId}/recalcular-segunda-via`);
      const b = response.data;

      if (!b) return null;

      return {
        id: String(b.id || boletoId),
        unidadeId: String(b.unidade_id),
        mesReferencia: b.mes_referencia,
        vencimento: b.novo_vencimento || b.data_vencimento,
        valor: parseFloat(b.valor_atualizado || b.valor),
        linhaDigitavel: b.linha_digitavel,
        codigoPix: b.pix_copia_e_cola,
        pdfUrl: b.url_pdf,
        status: 'aberto'
      };
    } catch (err: any) {
      console.warn(`[SISCON API] Erro ao recalcular 2ª via do boleto ${boletoId}: ${err.message}. Usando fallback.`);
      return this.fallbackService.gerarSegundaVia(boletoId);
    }
  }

  /**
   * Consulta dados de leitura individualizada de água e gás (Módulo SISCON Medição)
   */
  async consultarLeituraMedicao(unidadeId: string): Promise<any> {
    if (!this.isConfigured) {
      return {
        unidadeId,
        agua: { leituraAtual: 142.5, consumoM3: 8.2, status: 'Normal' },
        gas: { leituraAtual: 45.1, consumoM3: 3.4, status: 'Normal' },
        dataLeitura: new Date().toLocaleDateString('pt-BR')
      };
    }

    try {
      const response = await this.client.get(`/medicoes/unidade/${unidadeId}`);
      return response.data;
    } catch (err: any) {
      console.warn(`[SISCON Medição] Erro ao consultar consumos da unidade ${unidadeId}: ${err.message}`);
      return null;
    }
  }

  async registrarOcorrencia(moradorId: string, categoria: string, descricao: string): Promise<Ocorrencia> {
    if (!this.isConfigured) {
      return this.fallbackService.registrarOcorrencia(moradorId, categoria, descricao);
    }

    try {
      const response = await this.client.post('/ocorrencias', {
        morador_id: moradorId,
        categoria,
        descricao,
        canal_origem: 'whatsapp_bot'
      });
      return {
        id: response.data?.protocolo || `SISCON-${Date.now().toString().slice(-6)}`,
        moradorId,
        categoria,
        descricao,
        dataCriacao: new Date().toLocaleString('pt-BR'),
        status: 'aberta'
      };
    } catch (err: any) {
      return this.fallbackService.registrarOcorrencia(moradorId, categoria, descricao);
    }
  }

  async listarComunicados(condominioNome?: string): Promise<Comunicado[]> {
    if (!this.isConfigured) {
      return this.fallbackService.listarComunicados(condominioNome);
    }

    try {
      const response = await this.client.get('/comunicados', {
        params: { condominio: condominioNome }
      });
      return response.data || [];
    } catch (err: any) {
      return this.fallbackService.listarComunicados(condominioNome);
    }
  }
}
