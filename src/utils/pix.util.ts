/**
 * Utilitários para geração e formatação de Pix Padrão Banco Central do Brasil (EMVCo BR Code)
 */

function formatEMV(id: string, value: string): string {
  const len = value.length.toString().padStart(2, '0');
  return `${id}${len}${value}`;
}

/**
 * Calcula o CRC16-CCITT (Polinômio 0x1021, valor inicial 0xFFFF) exigido pelo Banco Central
 */
export function calcularCRC16(payload: string): string {
  let crc = 0xFFFF;
  for (let i = 0; i < payload.length; i++) {
    crc ^= payload.charCodeAt(i) << 8;
    for (let j = 0; j < 8; j++) {
      if ((crc & 0x8000) !== 0) {
        crc = ((crc << 1) ^ 0x1021) & 0xFFFF;
      } else {
        crc = (crc << 1) & 0xFFFF;
      }
    }
  }
  return crc.toString(16).toUpperCase().padStart(4, '0');
}

export interface PixPayloadOptions {
  chave: string;
  nomeBeneficiario: string;
  cidadeBeneficiario: string;
  valor: number;
  txid?: string;
  descricao?: string;
}

/**
 * Gera a string Pix Copia e Cola Oficial (BR Code EMVCo) escaneável por qualquer app de banco
 */
export function gerarPayloadPix({
  chave,
  nomeBeneficiario,
  cidadeBeneficiario,
  valor,
  txid = '***'
}: PixPayloadOptions): string {
  // Normalização de caracteres para padrão EMVCo (sem acentos, tamanho limitado)
  const nomeLimpo = nomeBeneficiario
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .slice(0, 25);

  const cidadeLimpa = cidadeBeneficiario
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .slice(0, 15);

  const txidLimpo = txid.replace(/[^A-Za-z0-9]/g, '').slice(0, 25) || '***';
  const valorStr = valor.toFixed(2);

  // 1. Merchant Account Information (ID 26)
  const part26 = formatEMV('00', 'BR.GOV.BCB.PIX') + formatEMV('01', chave);

  // 2. Additional Data Field Template (ID 62)
  const part62 = formatEMV('05', txidLimpo);

  // 3. Montagem do Payload base
  let payloadSemCRC =
    formatEMV('00', '01') + // Payload Format Indicator
    formatEMV('26', part26) + // Merchant Account Information
    formatEMV('52', '0000') + // Merchant Category Code
    formatEMV('53', '986') + // Transaction Currency (986 = BRL)
    formatEMV('54', valorStr) + // Transaction Amount
    formatEMV('58', 'BR') + // Country Code
    formatEMV('59', nomeLimpo) + // Merchant Name
    formatEMV('60', cidadeLimpa) + // Merchant City
    formatEMV('62', part62) + // Additional Data Field
    '6304'; // CRC16 Identifier

  // 4. Cálculo e concatenação do CRC16
  const crc = calcularCRC16(payloadSemCRC);
  return `${payloadSemCRC}${crc}`;
}

export function formatarMensagemPix(codigoPix: string, valor: number, vencimento: string): string {
  const valorFormatado = valor.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

  return [
    `💰 *PAGAMENTO VIA PIX OFICIAL*`,
    `----------------------------------------`,
    `*Valor:* ${valorFormatado}`,
    `*Vencimento:* ${vencimento}`,
    ``,
    `*Pix Copia e Cola (Homologado Banco Central):*`,
    `\`\`\`${codigoPix}\`\`\``,
    `----------------------------------------`,
    `_A compensação via Pix é instantânea e concilia automaticamente com o condomínio._`
  ].join('\n');
}
