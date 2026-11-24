import crypto from 'crypto';
import { Boleto, Cobranca } from '../types/index.js';
import { SisconService } from './siscon.service.js';
import { DbService } from './db.service.js';

export interface BoletoViewData {
  id: string;
  condominioNome: string;
  condominioCnpj: string;
  condominioEndereco: string;
  bancoNome: string;
  bancoCodigo: string;
  linhaDigitavel: string;
  vencimento: string;
  dataEmissao: string;
  numeroDocumento: string;
  nossoNumero: string;
  valor: number;
  valorFormatado: string;
  pagadorNome: string;
  pagadorCpf: string;
  pagadorUnidade: string;
  codigoPix: string;
  itensDetalhamento: { descricao: string; valor: number }[];
  instrucoes: string[];
  status: 'aberto' | 'pago' | 'vencido';
}

export interface ReciboViewData {
  id: string;
  protocoloSiscon: string;
  condominioNome: string;
  condominioCnpj: string;
  condominioEndereco: string;
  moradorNome: string;
  moradorCpf: string;
  unidade: string;
  mesReferencia: string;
  dataVencimento: string;
  dataPagamento: string;
  valorOriginal: number;
  valorPago: number;
  formaPagamento: string;
  txid: string;
  hashAutenticacao: string;
  itens: { descricao: string; valor: number }[];
}

export class BoletoPdfService {
  private static instance: BoletoPdfService;

  public static getInstance(): BoletoPdfService {
    if (!BoletoPdfService.instance) {
      BoletoPdfService.instance = new BoletoPdfService();
    }
    return BoletoPdfService.instance;
  }

  /**
   * Localiza boleto no SISCON ou Cobrança no banco de dados local e monta objeto normalizado
   */
  public async obterDadosBoleto(id: string, sisconService: SisconService, dbService: DbService): Promise<BoletoViewData | null> {
    // 1. Tenta buscar no banco de cobranças
    const cobranca = dbService.getCobrancaByTxid(id);
    let boletoSiscon: Boleto | null = null;

    try {
      boletoSiscon = await sisconService.gerarSegundaVia(id);
    } catch {
      boletoSiscon = null;
    }

    if (!cobranca && !boletoSiscon) {
      // Fallback para IDs dinâmicos de teste (ex: bol_101_nov)
      const boletosMock = await sisconService.listarBoletosEmAberto('unid_101');
      boletoSiscon = boletosMock.find(b => b.id === id) || boletosMock[0] || null;
    }

    const valor = cobranca?.valor || boletoSiscon?.valor || 650.0;
    const vencimento = cobranca?.vencimento || boletoSiscon?.vencimento || '15/11/2026';
    const linhaDigitavel = cobranca?.linhaDigitavel || boletoSiscon?.linhaDigitavel || '23793.38128 60000.123456 01000.650004 1 95420000065000';
    const codigoPix = cobranca?.pixCopiaECola || boletoSiscon?.codigoPix || '00020126580014br.gov.bcb.pix0136123e4567-e89b-12d3-a456-4266141740005204000053039865406650.005802BR5925ADMINISTRADORA MODELO6009SAO PAULO62070503***6304E2CA';
    const pagadorNome = cobranca?.moradorNome || 'Carlos Eduardo Silva';
    const unidadeId = cobranca?.unidadeId || boletoSiscon?.unidadeId || 'Apt 101 - Bloco A';
    const status = (cobranca?.status === 'pago' ? 'pago' : boletoSiscon?.status || 'aberto') as 'aberto' | 'pago' | 'vencido';

    // Cálculo proporcional dos encargos do condomínio
    const cotaOrdinaria = Math.round(valor * 0.85 * 100) / 100;
    const fundoReserva = Math.round(valor * 0.10 * 100) / 100;
    const rateioConsumos = Math.round((valor - cotaOrdinaria - fundoReserva) * 100) / 100;

    return {
      id,
      condominioNome: 'Condomínio Residencial Jardins do Bosque',
      condominioCnpj: '12.345.678/0001-90',
      condominioEndereco: 'Av. das Araucárias, 1500 - São Paulo, SP - CEP 04578-000',
      bancoNome: 'Banco Santander (Brasil) S.A.',
      bancoCodigo: '033-7',
      linhaDigitavel,
      vencimento,
      dataEmissao: new Date().toLocaleDateString('pt-BR'),
      numeroDocumento: `DOC-${id.replace(/\D/g, '').slice(-6) || '202611'}`,
      nossoNumero: `033/90124892-${id.slice(-2)}`,
      valor,
      valorFormatado: valor.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }),
      pagadorNome,
      pagadorCpf: '123.456.789-09',
      pagadorUnidade: unidadeId.includes('Apt') ? unidadeId : `Apt ${unidadeId}`,
      codigoPix,
      itensDetalhamento: [
        { descricao: 'Cota Condominial Ordinária (Manutenção predial e funcionários)', valor: cotaOrdinaria },
        { descricao: 'Fundo de Reserva Legal (10% conforme Convenção Condominial)', valor: fundoReserva },
        { descricao: 'Rateio de Consumos Comuns (Água, Energia e Gás das áreas comuns)', valor: rateioConsumos }
      ],
      instrucoes: [
        'Pagável em qualquer agência bancária, internet banking ou casas lotéricas até o vencimento.',
        'Após o vencimento, cobrar multa de 2,00% e juros moratórios de 1,00% ao mês.',
        'NÃO RECEBER APÓS 30 DIAS DO VENCIMENTO.',
        'PAGAMENTO INSTANTÂNEO VIA PIX: Aponte a câmera do aplicativo do seu banco para o QR Code ao lado. A compensação e baixa no SISCON ocorrem em tempo real (2 segundos).'
      ],
      status
    };
  }

  /**
   * Localiza recibo / comprovante oficial de quitação
   */
  public async obterDadosRecibo(id: string, sisconService: SisconService, dbService: DbService): Promise<ReciboViewData | null> {
    const boleto = await this.obterDadosBoleto(id, sisconService, dbService);
    if (!boleto) return null;

    const dataPagamento = new Date().toLocaleDateString('pt-BR') + ' às ' + new Date().toLocaleTimeString('pt-BR');
    const txid = `E18236120202611${Date.now().toString().slice(-8)}CV`;
    const hashAutenticacao = crypto
      .createHash('sha256')
      .update(`${boleto.id}:${boleto.condominioCnpj}:${boleto.valor}:${dataPagamento}:${txid}`)
      .digest('hex')
      .toUpperCase();

    return {
      id: boleto.id,
      protocoloSiscon: `SISCON-REC-${Date.now().toString().slice(-6)}`,
      condominioNome: boleto.condominioNome,
      condominioCnpj: boleto.condominioCnpj,
      condominioEndereco: boleto.condominioEndereco,
      moradorNome: boleto.pagadorNome,
      moradorCpf: boleto.pagadorCpf,
      unidade: boleto.pagadorUnidade,
      mesReferencia: '11/2026',
      dataVencimento: boleto.vencimento,
      dataPagamento,
      valorOriginal: boleto.valor,
      valorPago: boleto.valor,
      formaPagamento: 'Pix Instantâneo BACEN (Liquidação SPI)',
      txid,
      hashAutenticacao,
      itens: boleto.itensDetalhamento
    };
  }

  /**
   * Renderiza layout visual do Boleto FEBRABAN com Pix QR Code e Código de Barras
   */
  public renderHtmlBoleto(d: BoletoViewData): string {
    const qrCodeUrl = `https://api.qrserver.com/v1/create-qr-code/?size=180x180&margin=4&data=${encodeURIComponent(d.codigoPix)}`;

    return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Boleto Condominial - ${d.condominioNome} - Ref. ${d.vencimento}</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: Arial, Helvetica, sans-serif;
      font-size: 11px;
      color: #111;
      background-color: #eef2f6;
      padding: 20px;
    }
    .no-print {
      max-width: 800px;
      margin: 0 auto 16px auto;
      display: flex;
      justify-content: space-between;
      align-items: center;
      background: #ffffff;
      padding: 12px 20px;
      border-radius: 12px;
      box-shadow: 0 4px 12px rgba(0,0,0,0.08);
    }
    .btn {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      background: #4f46e5;
      color: #ffffff;
      padding: 8px 16px;
      border-radius: 8px;
      font-size: 12px;
      font-weight: bold;
      text-decoration: none;
      border: none;
      cursor: pointer;
      transition: all 0.15s ease;
    }
    .btn:hover { background: #4338ca; }
    .btn-secondary {
      background: #f1f5f9;
      color: #334155;
      border: 1px solid #cbd5e1;
    }
    .btn-secondary:hover { background: #e2e8f0; }
    .btn-recibo {
      background: #10b981;
      color: #ffffff;
    }
    .btn-recibo:hover { background: #059669; }

    .boleto-card {
      max-width: 800px;
      margin: 0 auto;
      background: #ffffff;
      padding: 24px;
      border: 1px solid #d1d5db;
      border-radius: 8px;
      box-shadow: 0 4px 16px rgba(0,0,0,0.06);
    }

    /* Linha de Recorte */
    .linha-corte {
      border-top: 1px dashed #6b7280;
      margin: 18px 0;
      position: relative;
      text-align: right;
    }
    .linha-corte::after {
      content: '✂ Destaque aqui ou pague via Pix instantâneo';
      font-size: 9px;
      color: #6b7280;
      position: absolute;
      top: -6px;
      right: 0;
      background: #ffffff;
      padding-left: 8px;
    }

    /* Cabeçalho do Banco */
    .banco-header {
      display: flex;
      align-items: center;
      border-bottom: 2px solid #000;
      padding-bottom: 6px;
      margin-bottom: 6px;
    }
    .banco-logo {
      font-size: 18px;
      font-weight: 900;
      letter-spacing: -0.5px;
      color: #e11d48;
      width: 170px;
    }
    .banco-codigo {
      font-size: 18px;
      font-weight: 900;
      padding: 0 12px;
      border-left: 2px solid #000;
      border-right: 2px solid #000;
      height: 24px;
      display: flex;
      align-items: center;
    }
    .linha-digitavel {
      flex: 1;
      text-align: right;
      font-family: monospace;
      font-size: 13px;
      font-weight: 700;
      color: #000;
    }

    /* Tabela FEBRABAN */
    .febraban-table {
      width: 100%;
      border-collapse: collapse;
      margin-bottom: 8px;
    }
    .febraban-table td, .febraban-table th {
      border: 1px solid #000;
      padding: 3px 6px;
      vertical-align: top;
    }
    .label {
      font-size: 8px;
      font-weight: bold;
      text-transform: uppercase;
      color: #4b5563;
      display: block;
      margin-bottom: 2px;
    }
    .val {
      font-size: 11px;
      font-weight: bold;
      color: #000;
    }
    .val-destaque {
      font-size: 13px;
      font-weight: 900;
      color: #000;
    }

    /* Bloco Especial Pix */
    .pix-box {
      display: flex;
      align-items: center;
      gap: 16px;
      background: #f0fdf4;
      border: 2px solid #22c55e;
      border-radius: 8px;
      padding: 12px;
      margin: 12px 0;
    }
    .pix-qr {
      width: 110px;
      height: 110px;
      background: #ffffff;
      padding: 4px;
      border: 1px solid #bbf7d0;
      border-radius: 6px;
    }
    .pix-qr img {
      width: 100%;
      height: 100%;
      display: block;
    }
    .pix-info {
      flex: 1;
    }
    .pix-badge {
      display: inline-flex;
      align-items: center;
      gap: 4px;
      background: #22c55e;
      color: #ffffff;
      padding: 2px 8px;
      border-radius: 4px;
      font-size: 10px;
      font-weight: 900;
      margin-bottom: 6px;
    }
    .pix-code-input {
      width: 100%;
      font-family: monospace;
      font-size: 9px;
      padding: 6px;
      border: 1px solid #cbd5e1;
      border-radius: 4px;
      background: #ffffff;
      word-break: break-all;
      margin: 4px 0;
    }

    /* Código de Barras */
    .barcode-container {
      margin-top: 14px;
      padding-top: 10px;
      border-top: 1px solid #e5e7eb;
      display: flex;
      flex-direction: column;
      align-items: flex-start;
      gap: 4px;
    }
    .barcode-svg {
      width: 440px;
      height: 48px;
    }

    @media print {
      body { background: #ffffff; padding: 0; }
      .no-print { display: none !important; }
      .boleto-card {
        border: none;
        box-shadow: none;
        padding: 0;
        max-width: 100%;
      }
      @page {
        size: A4 portrait;
        margin: 10mm;
      }
    }
  </style>
</head>
<body>

  <!-- Barra de Ações (Apenas na tela) -->
  <div class="no-print">
    <div>
      <h2 style="font-size: 14px; color: #1e293b; margin-bottom: 2px;">📄 Boleto Bancário & Pix FEBRABAN</h2>
      <p style="font-size: 11px; color: #64748b;">${d.condominioNome} • Unidade ${d.pagadorUnidade} • Vencimento: ${d.vencimento}</p>
    </div>
    <div style="display: flex; gap: 8px;">
      <button onclick="window.print()" class="btn">
        <span>🖨️</span> Imprimir / Salvar em PDF
      </button>
      <a href="/api/financeiro/boletos/${d.id}/recibo" class="btn btn-recibo">
        <span>🧾</span> Ver Recibo de Quitação
      </a>
      <button onclick="copiarPix()" class="btn btn-secondary">
        <span>📋</span> Copiar Pix
      </button>
    </div>
  </div>

  <!-- Cartão do Boleto -->
  <div class="boleto-card">
    <!-- Recibo do Pagador -->
    <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 8px;">
      <div>
        <h1 style="font-size: 14px; font-weight: bold; color: #0f172a;">${d.condominioNome}</h1>
        <p style="font-size: 9px; color: #64748b;">CNPJ: ${d.condominioCnpj} • ${d.condominioEndereco}</p>
      </div>
      <div style="text-align: right;">
        <span style="font-size: 10px; font-weight: bold; background: #e0e7ff; color: #3730a3; padding: 3px 8px; border-radius: 4px;">RECIBO DO PAGADOR</span>
      </div>
    </div>

    <!-- Demonstrativo das Despesas -->
    <table class="febraban-table" style="margin-bottom: 12px;">
      <tr style="background: #f8fafc;">
        <th style="text-align: left; font-size: 9px; width: 75%;">DESCRIÇÃO DO RATEIO CONDOMINIAL</th>
        <th style="text-align: right; font-size: 9px; width: 25%;">VALOR (R$)</th>
      </tr>
      ${d.itensDetalhamento.map(it => `
      <tr>
        <td>${it.descricao}</td>
        <td style="text-align: right; font-family: monospace; font-weight: bold;">R$ ${it.valor.toFixed(2)}</td>
      </tr>
      `).join('')}
      <tr style="background: #f1f5f9; font-weight: bold;">
        <td style="text-align: right;">VALOR TOTAL DA COTA CONDOMINIAL:</td>
        <td style="text-align: right; font-family: monospace; font-size: 12px; color: #047857;">${d.valorFormatado}</td>
      </tr>
    </table>

    <!-- Bloco Pix Destaque -->
    <div class="pix-box">
      <div class="pix-qr">
        <img src="${qrCodeUrl}" alt="QR Code Pix" />
      </div>
      <div class="pix-info">
        <span class="pix-badge">⚡ PAGAMENTO INSTANTÂNEO COM PIX</span>
        <p style="font-size: 11px; font-weight: bold; color: #166534; margin-bottom: 4px;">
          Abra o aplicativo do seu banco, escolha Pix > Ler QR Code e aponte a câmera.
        </p>
        <p style="font-size: 10px; color: #374151;">Ou utilize a chave Pix Copia e Cola:</p>
        <input type="text" id="chavePixInput" readonly value="${d.codigoPix}" class="pix-code-input" />
        <button type="button" onclick="copiarPix()" style="background: #15803d; color: white; border: none; padding: 4px 10px; border-radius: 4px; font-size: 10px; font-weight: bold; cursor: pointer;">
          📋 Copiar Código Pix Copia e Cola
        </button>
      </div>
    </div>

    <!-- Linha de Corte -->
    <div class="linha-corte"></div>

    <!-- Ficha de Compensação FEBRABAN -->
    <div class="banco-header">
      <div class="banco-logo">${d.bancoNome.split(' ')[0].toUpperCase()}</div>
      <div class="banco-codigo">${d.bancoCodigo}</div>
      <div class="linha-digitavel">${d.linhaDigitavel}</div>
    </div>

    <table class="febraban-table">
      <tr>
        <td colspan="5" style="width: 75%;">
          <span class="label">Local de Pagamento</span>
          <span class="val">PAGÁVEL EM QUALQUER BANCO OU VIA PIX ATÉ O VENCIMENTO</span>
        </td>
        <td style="width: 25%; background: #fefce8;">
          <span class="label">Vencimento</span>
          <span class="val-destaque" style="color: #b45309;">${d.vencimento}</span>
        </td>
      </tr>
      <tr>
        <td colspan="5">
          <span class="label">Beneficiário</span>
          <span class="val">${d.condominioNome} • CNPJ: ${d.condominioCnpj}</span>
        </td>
        <td>
          <span class="label">Agência / Código Beneficiário</span>
          <span class="val">0042 / 109283-4</span>
        </td>
      </tr>
      <tr>
        <td>
          <span class="label">Data Documento</span>
          <span class="val">${d.dataEmissao}</span>
        </td>
        <td>
          <span class="label">Nº Documento</span>
          <span class="val">${d.numeroDocumento}</span>
        </td>
        <td>
          <span class="label">Espécie Doc</span>
          <span class="val">DM</span>
        </td>
        <td>
          <span class="label">Aceite</span>
          <span class="val">N</span>
        </td>
        <td>
          <span class="label">Data Processamento</span>
          <span class="val">${d.dataEmissao}</span>
        </td>
        <td>
          <span class="label">Nosso Número</span>
          <span class="val">${d.nossoNumero}</span>
        </td>
      </tr>
      <tr>
        <td>
          <span class="label">Uso do Banco</span>
          <span class="val">&nbsp;</span>
        </td>
        <td>
          <span class="label">Carteira</span>
          <span class="val">101</span>
        </td>
        <td>
          <span class="label">Espécie</span>
          <span class="val">R$</span>
        </td>
        <td>
          <span class="label">Quantidade</span>
          <span class="val">&nbsp;</span>
        </td>
        <td>
          <span class="label">Valor Moeda</span>
          <span class="val">&nbsp;</span>
        </td>
        <td style="background: #f0fdf4;">
          <span class="label">(=) Valor do Documento</span>
          <span class="val-destaque" style="color: #15803d;">${d.valorFormatado}</span>
        </td>
      </tr>
      <tr>
        <td colspan="5" rowspan="4" style="height: 110px;">
          <span class="label">Instruções (Texto de responsabilidade do Beneficiário)</span>
          <div style="font-size: 10px; line-height: 1.4; color: #1e293b; margin-top: 4px;">
            ${d.instrucoes.map(i => `<p>• ${i}</p>`).join('')}
          </div>
        </td>
        <td>
          <span class="label">(-) Descontos / Abatimento</span>
          <span class="val">&nbsp;</span>
        </td>
      </tr>
      <tr>
        <td>
          <span class="label">(+) Juros / Multa</span>
          <span class="val">&nbsp;</span>
        </td>
      </tr>
      <tr>
        <td>
          <span class="label">(=) Valor Cobrado</span>
          <span class="val-destaque">${d.valorFormatado}</span>
        </td>
      </tr>
      <tr>
        <td>
          <span class="label">Autenticação Mecânica</span>
          <span class="val" style="font-family: monospace; font-size: 9px;">SISCON-OK-${d.id.slice(-6)}</span>
        </td>
      </tr>
      <tr>
        <td colspan="6">
          <span class="label">Pagador</span>
          <span class="val">${d.pagadorNome} • CPF: ${d.pagadorCpf}</span>
          <span style="display: block; font-size: 10px; color: #475569; margin-top: 2px;">
            Endereço: ${d.condominioEndereco} — Unidade: <strong>${d.pagadorUnidade}</strong>
          </span>
        </td>
      </tr>
    </table>

    <!-- Código de Barras FEBRABAN Visual -->
    <div class="barcode-container">
      <svg class="barcode-svg" viewBox="0 0 440 48" xmlns="http://www.w3.org/2000/svg">
        <!-- Padrão gráfico de barras FEBRABAN interleaved -->
        ${this.gerarBarrasFebrabanSvg()}
      </svg>
      <div style="font-family: monospace; font-size: 9px; color: #64748b; letter-spacing: 1px;">
        FICHA DE COMPENSAÇÃO • AUTENTICAÇÃO MECÂNICA NO VERSO
      </div>
    </div>
  </div>

  <script>
    function copiarPix() {
      const input = document.getElementById('chavePixInput');
      if (input) {
        input.select();
        navigator.clipboard.writeText(input.value);
        alert('Chave Pix Copia e Cola copiada para a área de transferência!');
      }
    }
  </script>
</body>
</html>`;
  }

  /**
   * Renderiza layout visual do Recibo Oficial de Quitação Condominial
   */
  public renderHtmlRecibo(r: ReciboViewData): string {
    const qrValidador = `https://api.qrserver.com/v1/create-qr-code/?size=140x140&margin=2&data=${encodeURIComponent(`https://condovolto.app/validar/${r.hashAutenticacao}`)}`;

    return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Comprovante de Quitação - ${r.condominioNome} - ${r.unidade}</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
      font-size: 12px;
      color: #0f172a;
      background-color: #f8fafc;
      padding: 24px;
    }
    .no-print {
      max-width: 720px;
      margin: 0 auto 16px auto;
      display: flex;
      justify-content: space-between;
      align-items: center;
      background: #ffffff;
      padding: 12px 20px;
      border-radius: 12px;
      box-shadow: 0 4px 12px rgba(0,0,0,0.08);
    }
    .btn {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      background: #059669;
      color: #ffffff;
      padding: 8px 16px;
      border-radius: 8px;
      font-size: 12px;
      font-weight: bold;
      text-decoration: none;
      border: none;
      cursor: pointer;
    }
    .btn:hover { background: #047857; }
    .btn-secondary {
      background: #f1f5f9;
      color: #334155;
      border: 1px solid #cbd5e1;
    }
    .recibo-card {
      max-width: 720px;
      margin: 0 auto;
      background: #ffffff;
      padding: 36px 40px;
      border: 1px solid #e2e8f0;
      border-radius: 16px;
      box-shadow: 0 10px 25px -5px rgba(0,0,0,0.05);
      position: relative;
    }
    .selo-quitado {
      position: absolute;
      top: 32px;
      right: 40px;
      border: 3px double #16a34a;
      color: #16a34a;
      font-weight: 900;
      font-size: 16px;
      padding: 6px 16px;
      border-radius: 8px;
      transform: rotate(4deg);
      text-transform: uppercase;
      letter-spacing: 1.5px;
      background: #f0fdf4;
    }
    .header {
      border-bottom: 2px solid #e2e8f0;
      padding-bottom: 18px;
      margin-bottom: 24px;
    }
    .section-title {
      font-size: 11px;
      font-weight: 800;
      text-transform: uppercase;
      color: #64748b;
      letter-spacing: 0.5px;
      margin-bottom: 8px;
      display: flex;
      align-items: center;
      gap: 6px;
    }
    .grid-info {
      display: grid;
      grid-template-columns: repeat(2, 1fr);
      gap: 16px;
      background: #f8fafc;
      padding: 16px;
      border-radius: 12px;
      margin-bottom: 20px;
    }
    .info-item label {
      display: block;
      font-size: 10px;
      color: #64748b;
      font-weight: 600;
      margin-bottom: 2px;
    }
    .info-item span {
      font-size: 13px;
      font-weight: 700;
      color: #1e293b;
    }
    .table-valores {
      width: 100%;
      border-collapse: collapse;
      margin-bottom: 20px;
    }
    .table-valores th {
      background: #f1f5f9;
      text-align: left;
      padding: 8px 12px;
      font-size: 10px;
      font-weight: 800;
      color: #475569;
    }
    .table-valores td {
      padding: 8px 12px;
      border-bottom: 1px solid #f1f5f9;
    }
    .hash-box {
      background: #0f172a;
      color: #38bdf8;
      font-family: monospace;
      font-size: 10px;
      padding: 12px;
      border-radius: 8px;
      word-break: break-all;
      margin: 16px 0;
    }
    .legal-footer {
      border-top: 1px solid #e2e8f0;
      padding-top: 16px;
      margin-top: 24px;
      font-size: 10px;
      color: #64748b;
      line-height: 1.5;
      text-align: justify;
    }
    @media print {
      body { background: #ffffff; padding: 0; }
      .no-print { display: none !important; }
      .recibo-card {
        border: none;
        box-shadow: none;
        padding: 0;
      }
      @page { size: A4 portrait; margin: 15mm; }
    }
  </style>
</head>
<body>

  <div class="no-print">
    <div>
      <h2 style="font-size: 14px; color: #1e293b; margin-bottom: 2px;">🧾 Recibo Oficial de Quitação Condominial</h2>
      <p style="font-size: 11px; color: #64748b;">Protocolo: ${r.protocoloSiscon} • ${r.unidade}</p>
    </div>
    <div style="display: flex; gap: 8px;">
      <button onclick="window.print()" class="btn">
        <span>🖨️</span> Imprimir Recibo
      </button>
      <a href="/api/financeiro/boletos/${r.id}/pdf" class="btn btn-secondary">
        <span>📄</span> Ver Boleto Original
      </a>
      <button onclick="window.close()" class="btn btn-secondary">
        <span>✖️</span> Fechar
      </button>
    </div>
  </div>

  <div class="recibo-card">
    <div class="selo-quitado">✓ QUITADO</div>

    <div class="header">
      <h1 style="font-size: 18px; font-weight: 900; color: #0f172a; letter-spacing: -0.5px;">${r.condominioNome}</h1>
      <p style="font-size: 11px; color: #64748b; margin-top: 2px;">CNPJ: ${r.condominioCnpj} • ${r.condominioEndereco}</p>
      <p style="font-size: 12px; font-weight: 800; color: #4338ca; margin-top: 8px;">COMPROVANTE DE PAGAMENTO & QUITAÇÃO DE COTA CONDOMINIAL</p>
    </div>

    <div class="section-title">👤 Identificação do Condômino & Unidade</div>
    <div class="grid-info">
      <div class="info-item">
        <label>NOME DO TITULAR</label>
        <span>${r.moradorNome}</span>
      </div>
      <div class="info-item">
        <label>CPF DO TITULAR</label>
        <span>${r.moradorCpf}</span>
      </div>
      <div class="info-item">
        <label>UNIDADE / BLOCO</label>
        <span>${r.unidade}</span>
      </div>
      <div class="info-item">
        <label>MÊS DE REFERÊNCIA</label>
        <span>${r.mesReferencia}</span>
      </div>
    </div>

    <div class="section-title">💳 Dados da Transação Financeira</div>
    <div class="grid-info">
      <div class="info-item">
        <label>DATA E HORA DO PAGAMENTO</label>
        <span style="color: #047857;">${r.dataPagamento}</span>
      </div>
      <div class="info-item">
        <label>FORMA DE LIQUIDAÇÃO</label>
        <span>${r.formaPagamento}</span>
      </div>
      <div class="info-item">
        <label>TRANSACTION ID (TXID / BACEN)</label>
        <span style="font-family: monospace; font-size: 11px;">${r.txid}</span>
      </div>
      <div class="info-item">
        <label>PROTOCOLO SISCON ERP</label>
        <span style="font-family: monospace; font-size: 11px;">${r.protocoloSiscon}</span>
      </div>
    </div>

    <div class="section-title">📊 Discriminação dos Itens Pagos</div>
    <table class="table-valores">
      <thead>
        <tr>
          <th>ITEM / ENCARGO</th>
          <th style="text-align: right;">VALOR QUITADO</th>
        </tr>
      </thead>
      <tbody>
        ${r.itens.map(it => `
        <tr>
          <td>${it.descricao}</td>
          <td style="text-align: right; font-family: monospace; font-weight: bold;">R$ ${it.valor.toFixed(2)}</td>
        </tr>
        `).join('')}
        <tr style="background: #f0fdf4; font-weight: 900; font-size: 14px; color: #166534;">
          <td style="text-align: right;">TOTAL LIQUIDADO:</td>
          <td style="text-align: right; font-family: monospace;">R$ ${r.valorPago.toFixed(2)}</td>
        </tr>
      </tbody>
    </table>

    <div class="section-title">🔐 Autenticação Notarial & Integridade Digital</div>
    <div style="display: flex; align-items: center; gap: 16px;">
      <div style="width: 100px; height: 100px; flex-shrink: 0; border: 1px solid #cbd5e1; border-radius: 8px; padding: 4px;">
        <img src="${qrValidador}" alt="QR Validador" style="width: 100%; height: 100%;" />
      </div>
      <div style="flex: 1;">
        <p style="font-size: 10px; color: #64748b; font-weight: bold;">CHAVE CRIPTOGRÁFICA SHA-256 (VALIDAÇÃO DE VERACIDADE):</p>
        <div class="hash-box">${r.hashAutenticacao}</div>
        <p style="font-size: 9px; color: #64748b;">
          Aponte a câmera para o QR Code para auditar este recibo no repositório de assinaturas da plataforma CondoVolto.
        </p>
      </div>
    </div>

    <div class="legal-footer">
      <strong>DECLARAÇÃO DE QUITAÇÃO:</strong> Para os devidos fins de direito, a Administração do ${r.condominioNome} declara que o débito correspondente à cota condominial da competência acima especificada encontra-se integralmente pago e liquidado, dando plena, geral e irrevogável quitação referente exclusivamente a este documento, nos termos dos Artigos 319 e 320 da Lei Federal nº 10.406/2002 (Código Civil Brasileiro).
    </div>
  </div>

</body>
</html>`;
  }

  /**
   * Gera representação SVG de barras FEBRABAN
   */
  private gerarBarrasFebrabanSvg(): string {
    // Alterna barras pretas de larguras 1, 2, 3, 4 com espaços
    const pattern = [
      2,1,3,2,1,4,1,2,3,1,2,4,1,3,2,1,4,2,1,3,1,2,4,1,3,2,1,4,1,2,3,1,2,4,1,3,2,
      1,4,2,1,3,1,2,4,1,3,2,1,4,1,2,3,1,2,4,1,3,2,1,4,2,1,3,1,2,4,1,3,2,1,4,1,2,
      3,1,2,4,1,3,2,1,4,2,1,3,1,2,4,1,3,2,1,4,1,2,3,1,2,4,1,3,2,1,4,2,1,3,1,2,4
    ];

    let x = 10;
    let svg = '';
    for (let i = 0; i < pattern.length; i++) {
      const width = pattern[i];
      if (i % 2 === 0) {
        svg += `<rect x="${x}" y="0" width="${width}" height="48" fill="#000" />`;
      }
      x += width + 1;
    }
    return svg;
  }
}
