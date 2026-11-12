import { IErpService } from './erp.service.js';
import { Morador, Boleto, Ocorrencia } from '../types/index.js';
import { limparCpf } from '../utils/cpf.util.js';

export class MockErpService implements IErpService {
  private moradoresDb: Morador[] = [
    {
      id: 'morador_1',
      nome: 'Carlos Eduardo Silva',
      cpf: '12345678909',
      telefone: '5511999999999',
      unidades: [
        {
          id: 'unid_101',
          condominioNome: 'Residencial Jardins do Bosque',
          bloco: 'Bloco A',
          numero: 'Apt 101',
        },
      ],
    },
    {
      id: 'morador_2',
      nome: 'Mariana de Souza',
      cpf: '98765432100',
      telefone: '5511988888888',
      unidades: [
        {
          id: 'unid_204',
          condominioNome: 'Condomínio Solar das Palmeiras',
          bloco: 'Torre 2',
          numero: 'Apt 204',
        },
      ],
    },
  ];

  private boletosDb: Boleto[] = [
    {
      id: 'bol_101_nov',
      unidadeId: 'unid_101',
      mesReferencia: '11/2026',
      vencimento: '15/11/2026',
      valor: 650.0,
      linhaDigitavel: '23793.38128 60000.123456 01000.650004 1 95420000065000',
      codigoPix: '00020126580014br.gov.bcb.pix0136123e4567-e89b-12d3-a456-4266141740005204000053039865406650.005802BR5925ADMINISTRADORA MODELO6009SAO PAULO62070503***6304E2CA',
      pdfUrl: 'https://www.w3.org/WAI/ER/tests/xhtml/testfiles/resources/pdf/dummy.pdf',
      status: 'aberto',
    },
  ];

  async buscarMoradorPorCpf(cpf: string): Promise<Morador | null> {
    const limpo = limparCpf(cpf);
    const encontrado = this.moradoresDb.find((m) => m.cpf === limpo);

    if (encontrado) return encontrado;

    // Para fins de teste/demonstração, se o CPF for válido mas não estiver na lista fixa,
    // criamos dinamicamente para o testador poder validar a experiência completa
    const moradorTeste: Morador = {
      id: `morador_${limpo.slice(0, 5)}`,
      nome: 'Condômino Teste (Demonstração)',
      cpf: limpo,
      telefone: '5511999999999',
      unidades: [
        {
          id: `unid_${limpo.slice(0, 4)}`,
          condominioNome: 'Residencial Florescer',
          bloco: 'Bloco Único',
          numero: 'Apt 42',
        },
      ],
    };

    return moradorTeste;
  }

  async listarBoletosEmAberto(unidadeId: string): Promise<Boleto[]> {
    const boletos = this.boletosDb.filter((b) => b.unidadeId === unidadeId && b.status !== 'pago');
    if (boletos.length > 0) return boletos;

    // Retorna boleto demonstrativo para a unidade
    return [
      {
        id: `bol_${unidadeId}_atual`,
        unidadeId: unidadeId,
        mesReferencia: '11/2026',
        vencimento: '15/11/2026',
        valor: 580.0,
        linhaDigitavel: '34191.79001 01043.510047 91020.150008 8 95420000058000',
        codigoPix: '00020126580014br.gov.bcb.pix0136condominio@administradora.com.br5204000053039865406580.005802BR5925ADMINISTRADORA MODELO6009SAO PAULO62070503***6304A1B2',
        pdfUrl: 'https://www.w3.org/WAI/ER/tests/xhtml/testfiles/resources/pdf/dummy.pdf',
        status: 'aberto',
      },
    ];
  }

  async gerarSegundaVia(boletoId: string): Promise<Boleto | null> {
    const boleto = this.boletosDb.find((b) => b.id === boletoId);
    if (boleto) return boleto;

    return {
      id: boletoId,
      unidadeId: 'unid_mock',
      mesReferencia: '11/2026',
      vencimento: 'Hoje',
      valor: 580.0,
      linhaDigitavel: '34191.79001 01043.510047 91020.150008 8 95420000058000',
      codigoPix: '00020126580014br.gov.bcb.pix0136condominio@administradora.com.br5204000053039865406580.005802BR5925ADMINISTRADORA MODELO6009SAO PAULO62070503***6304A1B2',
      pdfUrl: 'https://www.w3.org/WAI/ER/tests/xhtml/testfiles/resources/pdf/dummy.pdf',
      status: 'aberto',
    };
  }

  async registrarOcorrencia(moradorId: string, categoria: string, descricao: string): Promise<Ocorrencia> {
    const nova: Ocorrencia = {
      id: `oco_${Date.now()}`,
      moradorId,
      categoria,
      descricao,
      dataCriacao: new Date().toISOString(),
      status: 'aberta',
    };
    return nova;
  }
}
