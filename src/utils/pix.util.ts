/**
 * Utilitários para manipulação e formatação de chaves e Pix Copia e Cola
 */
export function formatarMensagemPix(codigoPix: string, valor: number, vencimento: string): string {
  const valorFormatado = valor.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

  return [
    `💰 *PAGAMENTO VIA PIX*`,
    `----------------------------------------`,
    `*Valor:* ${valorFormatado}`,
    `*Vencimento:* ${vencimento}`,
    ``,
    `*Copie o código abaixo e cole no app do seu banco:*`,
    `\`\`\`${codigoPix}\`\`\``,
    `----------------------------------------`,
    `_A compensação via Pix é imediata e dá baixa automática em nosso sistema._`
  ].join('\n');
}
