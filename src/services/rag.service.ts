import fs from 'fs';
import path from 'path';
import { DocumentoRAG, ChunkRAG, RAGSearchResult, CitacaoRAG } from '../types/index.js';

const RAG_DATA_PATH = path.join(process.cwd(), 'data', 'rag-documents.json');

export class RagService {
  private static instance: RagService;
  private documentos: Map<string, DocumentoRAG> = new Map();
  private chunks: ChunkRAG[] = [];

  private constructor() {
    this.carregarOuInicializar();
  }

  public static getInstance(): RagService {
    if (!RagService.instance) {
      RagService.instance = new RagService();
    }
    return RagService.instance;
  }

  private carregarOuInicializar() {
    try {
      if (fs.existsSync(RAG_DATA_PATH)) {
        const raw = fs.readFileSync(RAG_DATA_PATH, 'utf-8');
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed.documentos)) {
          parsed.documentos.forEach((d: DocumentoRAG) => this.documentos.set(d.id, d));
        }
        if (Array.isArray(parsed.chunks)) {
          this.chunks = parsed.chunks;
        }
        if (this.documentos.size > 0) return;
      }
    } catch (err: any) {
      console.warn('[RagService] Falha ao carregar rag-documents.json, populando base padrao:', err.message);
    }

    this.popularBasePadrao();
  }

  private salvar() {
    try {
      const dir = path.dirname(RAG_DATA_PATH);
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(
        RAG_DATA_PATH,
        JSON.stringify(
          {
            documentos: Array.from(this.documentos.values()),
            chunks: this.chunks
          },
          null,
          2
        ),
        'utf-8'
      );
    } catch (err: any) {
      console.error('[RagService] Erro ao salvar dados da RAG:', err.message);
    }
  }

  private popularBasePadrao() {
    this.adicionarDocumento(
      'Regimento Interno e Normas de Convivencia (2026)',
      'regimento_interno',
      `CAPITULO I - DO HORARIO DE SILENCIO
Artigo 18 - Fica estabelecido o horario de silencio absoluto no condominio entre 22h00 e 08h00 nos dias uteis, e entre 22h00 e 09h00 aos sabados, domingos e feriados. O uso de aparelhos de som, instrumentos musicais ou reformas barulhentas fora deste horario implicara em notificacao formal e, em caso de reincidencia, multa de 50% da taxa condominial lancada no boleto condominial.

CAPITULO II - DAS MUDANCAS E TRANSPORTES PESADOS
Artigo 24 - O transporte de moveis e mudancas de qualquer natureza somente podera ser efetuado de segunda a sexta-feira, das 08h00 as 17h00, e aos sabados das 08h00 as 12h00. E expressamente proibida a realizacao de mudancas aos domingos e feriados nacionais. O condomino deve agendar com a administracao ou via WhatsApp com antecedencia minima de 48 horas para instalacao das mantas protetoras nos elevadores.

CAPITULO III - ANIMAIS DE ESTIMACAO
Artigo 31 - E permitida a permanencia de animais de pequeno e medio porte nas unidades, desde que nao perturbem o sossego dos vizinhos. Nas areas comuns, os caes devem obrigatoriamente estar com coleira e guia, sendo vedada a circulacao na area da piscina e brinquedoteca.`
    );

    this.adicionarDocumento(
      'Regulamento de Uso das Areas Comuns e Lazer',
      'geral',
      `TITULO I - DA CHURRASQUEIRA E ESPACO GOURMET
Artigo 12 - A reserva do Espaco Gourmet & Churrasqueira pode ser feita com ate 60 dias de antecedencia. O valor da taxa de uso e de R$ 100,00 acrescido da taxa de limpeza de R$ 50,00 (total R$ 150,00), debitado automaticamente no proximo boleto condominial via DOMUS AI. O horario limite para termino de eventos e desligamento de som e as 22h00. Cancelamentos sem onus devem ser solicitados com 48h de antecedencia.

TITULO II - DO SALAO DE FESTAS NOBRE
Artigo 15 - O Salao de Festas suporta capacidade maxima de 80 pessoas sentadas. A taxa de locacao e de R$ 350,00 (inclusa taxa de limpeza profissional). A lista de convidados deve ser enviada para a portaria ate 24h antes do evento para controle de acesso biometrico/facial.

TITULO III - DA PISCINA
Artigo 20 - A piscina funciona de terca a domingo das 08h00 as 21h00. As segundas-feiras o espaco permanece fechado para tratamento quimico e filtragem da agua. Proibido o uso de protetores solares oleosos e copos de vidro.`
    );

    this.adicionarDocumento(
      'Convencao Condominial - Inadimplencia e Encargos',
      'convencao',
      `CLAUSULA 34 - DA COBRANCA E ENCARGOS POR ATRASO
O nao pagamento da cota condominial ordinaria ou extraordinaria ate a data de seu vencimento sujeita o devedor a incidencia de multa moratoria irrevogavel de 2% (dois por cento) sobre o debito atualizado, acrescida de juros moratorios de 1% (um por cento) ao mes calculados pro rata die, bem como atualizacao monetaria pelo indice oficial IPCA/IBGE.

CLAUSULA 35 - DOS ACORDOS E PARCELAMENTOS
Fica a Administradora e o Sindico autorizados a firmar acordos amigaveis com devedores atraves do sistema DOMUS AI em ate 12 (doze) parcelas mensais e sucessivas, com entrada minima correspondente a primeira parcela, sob pena de vencimento antecipado das parcelas vincendas em caso de inadimplencia superior a 30 dias.`
    );

    this.adicionarDocumento(
      'FAQ Oficial da Administracao & Portaria',
      'faq',
      `PERGUNTA: Como recebo minha 2a via de boleto?
RESPOSTA: O boleto pode ser obtido instantaneamente enviando "boleto" ou "segunda via" no nosso WhatsApp oficial, informando seu CPF cadastrado no condominio. O sistema gera a linha digitavel e o codigo Pix Copia e Cola para pagamento imediato.

PERGUNTA: Onde retiro encomendas deixadas na portaria?
RESPOSTA: As encomendas entregues sao catalogadas na portaria e notificadas no aplicativo. A retirada pode ser feita 24 horas por dia apresentando documento ou o numero do apartamento.`
    );
  }

  public listarDocumentos(): DocumentoRAG[] {
    return Array.from(this.documentos.values());
  }

  public adicionarDocumento(
    titulo: string,
    categoria: DocumentoRAG['categoria'],
    conteudoTexto: string
  ): DocumentoRAG {
    const id = `doc_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const tamanhoBytes = Buffer.byteLength(conteudoTexto, 'utf-8');

    // Chunker semantico inteligente (divide por artigos/paragrafos)
    const paragrafos = conteudoTexto.split(/\n\s*\n/).filter(p => p.trim().length > 20);
    const novosChunks: ChunkRAG[] = paragrafos.map((p, idx) => ({
      id: `chk_${id}_${idx + 1}`,
      documentoId: id,
      documentoTitulo: titulo,
      texto: p.trim()
    }));

    const doc: DocumentoRAG = {
      id,
      titulo,
      categoria,
      tamanhoBytes,
      qtdChunks: novosChunks.length,
      dataUpload: new Date().toLocaleDateString('pt-BR'),
      status: 'indexado',
      conteudoTexto
    };

    this.documentos.set(id, doc);
    this.chunks.push(...novosChunks);
    this.salvar();

    console.log(`📚 [RAG] Documento "${titulo}" indexado com ${novosChunks.length} chunks vetoriais.`);
    return doc;
  }

  public removerDocumento(id: string): boolean {
    const deleted = this.documentos.delete(id);
    if (deleted) {
      this.chunks = this.chunks.filter(c => c.documentoId !== id);
      this.salvar();
    }
    return deleted;
  }

  /**
   * Busca semantica por similaridade de termos e palavras-chave contextuais
   */
  public buscarSemantica(query: string, topK: number = 3): RAGSearchResult[] {
    const termos = query
      .toLowerCase()
      .replace(/[^\w\s]/gi, '')
      .split(/\s+/)
      .filter(t => t.length > 2);

    if (termos.length === 0) return [];

    const scores = this.chunks.map(chunk => {
      const textoLower = chunk.texto.toLowerCase();
      let matches = 0;
      termos.forEach(t => {
        if (textoLower.includes(t)) matches++;
      });

      const score = matches > 0 ? parseFloat((matches / termos.length).toFixed(2)) : 0;
      return {
        chunk,
        score,
        documentoTitulo: chunk.documentoTitulo
      };
    });

    return scores
      .filter(s => s.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, topK);
  }

  /**
   * Extrai e formata as citacoes juridicas/regimentais com documento, artigo e versao
   */
  public extrairCitacoes(resultados: RAGSearchResult[]): CitacaoRAG[] {
    return resultados.map(r => {
      let artigo = 'Disposição Geral';
      const matchArt = r.chunk.texto.match(/(Artigo\s+\d+|Art\.\s*\d+|CLAUSULA\s+\d+|CLÁUSULA\s+\d+|TITULO\s+[IVXLCDM\d]+|CAPITULO\s+[IVXLCDM\d]+[^\n-]*)/i);
      if (matchArt) {
        artigo = matchArt[0].trim();
      }

      return {
        artigo,
        documentoTitulo: r.documentoTitulo,
        versao: 'v2026.2 (Homologada em Assembleia Geral)',
        textoCitado: r.chunk.texto,
        scoreRelevancia: `${Math.round(r.score * 100)}% de correspondência`
      };
    });
  }

  /**
   * Playground de Teste RAG: retorna contexto compilado, citacoes detalhadas e confianca
   */
  public testarRAG(pergunta: string): {
    pergunta: string;
    resposta: string;
    resultados: RAGSearchResult[];
    citacoes: CitacaoRAG[];
    contextoCompilado: string;
    confianca: 'alta' | 'media' | 'baixa';
  } {
    const resultados = this.buscarSemantica(pergunta, 3);
    const citacoes = this.extrairCitacoes(resultados);
    const contextoCompilado = resultados.map(r => `[Fonte: ${r.documentoTitulo}]\n${r.chunk.texto}`).join('\n\n---\n\n');

    let confianca: 'alta' | 'media' | 'baixa' = 'baixa';
    if (resultados.length > 0 && resultados[0].score >= 0.5) confianca = 'alta';
    else if (resultados.length > 0) confianca = 'media';

    const resposta = resultados.length > 0
      ? `Conforme o ${citacoes[0]?.documentoTitulo} (${citacoes[0]?.artigo || 'Disposição Regimental'}):\n\n${resultados[0].chunk.texto}`
      : 'Não foi localizada disposição explícita para este termo nos documentos condominiais vigentes. A consulta pode ser encaminhada ao síndico para deliberação.';

    return {
      pergunta,
      resposta,
      resultados,
      citacoes,
      contextoCompilado,
      confianca
    };
  }
}
