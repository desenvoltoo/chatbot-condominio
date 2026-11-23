import fs from 'fs';
import path from 'path';
import { DocumentoRAG, ChunkRAG, RAGSearchResult, CitacaoRAG } from '../types/index.js';

const RAG_DATA_PATH = path.join(process.cwd(), 'data', 'rag-documents.json');
const EMBEDDING_DIMENSIONS = 128;

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
          // Assegura que todos os chunks existentes possuam embedding vetorial
          let revetorizou = false;
          for (const c of this.chunks) {
            if (!c.embedding || c.embedding.length !== EMBEDDING_DIMENSIONS) {
              c.embedding = this.gerarEmbedding(c.texto);
              revetorizou = true;
            }
          }
          if (revetorizou) {
            this.salvar();
          }
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

  /**
   * Motor de Vetorização Semântica Densa (Dense Embedding Generator)
   * Gera um vetor de 128 dimensões com normalização L2 (norma Euclidiana = 1.0)
   * Baseado em n-grams semânticos, raízes morfológicas e hash assinado.
   */
  public gerarEmbedding(texto: string): number[] {
    const vec = new Float64Array(EMBEDDING_DIMENSIONS);
    if (!texto || !texto.trim()) return Array.from(vec);

    // Normalização semântica de texto (remove acentos, pontuação e converte para minúsculas)
    const limpo = texto
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^\w\s]/g, ' ');

    const palavras = limpo.split(/\s+/).filter(p => p.length > 1);

    // 1. Processamento de Palavras e Tokens (Pesos com decaimento de frequência)
    for (let i = 0; i < palavras.length; i++) {
      const p = palavras[i];
      const h = this.hashString(p);
      const idx = Math.abs(h) % EMBEDDING_DIMENSIONS;
      const sign = h >= 0 ? 1 : -1;
      const weight = 1.0 / Math.sqrt(p.length + 1);
      vec[idx] += sign * weight;

      // 2. N-grams de caracteres (3-grams para semântica morfológica e variações de gênero/plural)
      if (p.length >= 3) {
        for (let j = 0; j <= p.length - 3; j++) {
          const tri = p.substring(j, j + 3);
          const hTri = this.hashString(tri);
          const idxTri = Math.abs(hTri) % EMBEDDING_DIMENSIONS;
          const signTri = hTri >= 0 ? 1 : -1;
          vec[idxTri] += signTri * 0.45;
        }
      }

      // 3. Bi-grams de palavras vizinhas (contexto sintático local)
      if (i < palavras.length - 1) {
        const bigram = `${p}_${palavras[i + 1]}`;
        const hBi = this.hashString(bigram);
        const idxBi = Math.abs(hBi) % EMBEDDING_DIMENSIONS;
        const signBi = hBi >= 0 ? 1 : -1;
        vec[idxBi] += signBi * 0.75;
      }
    }

    // Normalização Euclidiana L2 (|v| = 1.0) para cálculo imediato de Cosseno
    let sumSq = 0;
    for (let i = 0; i < EMBEDDING_DIMENSIONS; i++) {
      sumSq += vec[i] * vec[i];
    }

    const norm = Math.sqrt(sumSq);
    if (norm > 0) {
      for (let i = 0; i < EMBEDDING_DIMENSIONS; i++) {
        vec[i] = parseFloat((vec[i] / norm).toFixed(6));
      }
    }

    return Array.from(vec);
  }

  /**
   * Cálculo de Similaridade por Cosseno entre dois vetores normalizados
   */
  public similaridadeCosseno(vecA: number[], vecB: number[]): number {
    if (!vecA || !vecB || vecA.length !== vecB.length) return 0;
    let dot = 0;
    for (let i = 0; i < vecA.length; i++) {
      dot += vecA[i] * vecB[i];
    }
    // Mapeia faixa [-1, 1] para [0, 1] com threshold para ruído
    const score = (dot + 1) / 2;
    return parseFloat(Math.max(0, Math.min(1, score)).toFixed(4));
  }

  private hashString(str: string): number {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = (hash << 5) - hash + char;
      hash |= 0;
    }
    return hash;
  }

  private popularBasePadrao() {
    this.adicionarDocumento(
      'Regimento Interno e Normas de Convivência (2026)',
      'regimento_interno',
      `CAPÍTULO I - DO HORÁRIO DE SILÊNCIO
Artigo 18 - Fica estabelecido o horário de silêncio absoluto no condomínio entre 22h00 e 08h00 nos dias úteis, e entre 22h00 e 09h00 aos sábados, domingos e feriados. O uso de aparelhos de som, instrumentos musicais ou reformas barulhentas fora deste horário implicará em notificação formal e, em caso de reincidência, multa de 50% da taxa condominial lançada no boleto condominial.

CAPÍTULO II - DAS MUDANÇAS E TRANSPORTES PESADOS
Artigo 24 - O transporte de móveis e mudanças de qualquer natureza somente poderá ser efetuado de segunda a sexta-feira, das 08h00 às 17h00, e aos sábados das 08h00 às 12h00. É expressamente proibida a realização de mudanças aos domingos e feriados nacionais. O condômino deve agendar com a administração ou via WhatsApp com antecedência mínima de 48 horas para instalação das mantas protetoras nos elevadores.

CAPÍTULO III - ANIMAIS DE ESTIMAÇÃO
Artigo 31 - É permitida a permanência de animais de pequeno e médio porte nas unidades, desde que não perturbem o sossego dos vizinhos. Nas áreas comuns, os cães devem obrigatoriamente estar com coleira e guia, sendo vedada a circulação na área da piscina e brinquedoteca.`
    );

    this.adicionarDocumento(
      'Regulamento de Uso das Áreas Comuns e Lazer',
      'geral',
      `TÍTULO I - DA CHURRASQUEIRA E ESPAÇO GOURMET
Artigo 12 - A reserva do Espaço Gourmet & Churrasqueira pode ser feita com até 60 dias de antecedência. O valor da taxa de uso é de R$ 100,00 acrescido da taxa de limpeza de R$ 50,00 (total R$ 150,00), debitado automaticamente no próximo boleto condominial via CondoVolto AI. O horário limite para término de eventos e desligamento de som é às 22h00. Cancelamentos sem ônus devem ser solicitados com 48h de antecedência.

TÍTULO II - DO SALÃO DE FESTAS NOBRE
Artigo 15 - O Salão de Festas suporta capacidade máxima de 80 pessoas sentadas. A taxa de locação é de R$ 350,00 (inclusa taxa de limpeza profissional). A lista de convidados deve ser enviada para a portaria até 24h antes do evento para controle de acesso biométrico/facial.

TÍTULO III - DA PISCINA
Artigo 20 - A piscina funciona de terça a domingo das 08h00 às 21h00. Às segundas-feiras o espaço permanece fechado para tratamento químico e filtragem da água. Proibido o uso de protetores solares oleosos e copos de vidro.`
    );

    this.adicionarDocumento(
      'Convenção Condominial - Inadimplência e Encargos',
      'convencao',
      `CLÁUSULA 34 - DA COBRANÇA E ENCARGOS POR ATRASO
O não pagamento da cota condominial ordinária ou extraordinária até a data de seu vencimento sujeita o devedor à incidência de multa moratória irrevogável de 2% (dois por cento) sobre o débito atualizado, acrescida de juros moratórios de 1% (um por cento) ao mês calculados pro rata die, bem como atualização monetária pelo índice oficial IPCA/IBGE.

CLÁUSULA 35 - DOS ACORDOS E PARCELAMENTOS
Fica a Administradora e o Síndico autorizados a firmar acordos amigáveis com devedores através do sistema CondoVolto AI em até 12 (doze) parcelas mensais e sucessivas, com entrada mínima correspondente à primeira parcela, sob pena de vencimento antecipado das parcelas vincendas em caso de inadimplência superior a 30 dias.`
    );

    this.adicionarDocumento(
      'FAQ Oficial da Administração & Portaria',
      'faq',
      `PERGUNTA: Como recebo minha 2ª via de boleto?
RESPOSTA: O boleto pode ser obtido instantaneamente enviando "boleto" ou "segunda via" no nosso WhatsApp oficial, informando seu CPF cadastrado no condomínio. O sistema gera a linha digitável e o código Pix Copia e Cola para pagamento imediato.

PERGUNTA: Onde retiro encomendas deixadas na portaria?
RESPOSTA: As encomendas entregues são catalogadas na portaria e notificadas no aplicativo. A retirada pode ser feita 24 horas por dia apresentando documento ou o número do apartamento.`
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

    // Chunker semântico inteligente (divide por artigos/parágrafos)
    const paragrafos = conteudoTexto.split(/\n\s*\n/).filter(p => p.trim().length > 20);
    const novosChunks: ChunkRAG[] = paragrafos.map((p, idx) => ({
      id: `chk_${id}_${idx + 1}`,
      documentoId: id,
      documentoTitulo: titulo,
      texto: p.trim(),
      embedding: this.gerarEmbedding(p.trim())
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

    console.log(`📚 [RAG] Documento "${titulo}" indexado com ${novosChunks.length} chunks vetorizados (${EMBEDDING_DIMENSIONS} dimensões).`);
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
   * Re-vetorização completa de todos os chunks da base de conhecimento
   */
  public revetorizarBase(): {
    sucesso: boolean;
    qtdDocumentos: number;
    qtdChunks: number;
    dimensoes: number;
    tempoMs: number;
  } {
    const inicio = Date.now();
    for (const chunk of this.chunks) {
      chunk.embedding = this.gerarEmbedding(chunk.texto);
    }
    this.salvar();
    const tempoMs = Date.now() - inicio;

    return {
      sucesso: true,
      qtdDocumentos: this.documentos.size,
      qtdChunks: this.chunks.length,
      dimensoes: EMBEDDING_DIMENSIONS,
      tempoMs
    };
  }

  public getStatusVetorizacao(): {
    vetorizado: boolean;
    totalDocumentos: number;
    totalChunks: number;
    dimensoes: number;
    algoritmo: string;
    amostraVetor: number[];
  } {
    const sample = this.chunks[0]?.embedding?.slice(0, 8) || [];
    return {
      vetorizado: true,
      totalDocumentos: this.documentos.size,
      totalChunks: this.chunks.length,
      dimensoes: EMBEDDING_DIMENSIONS,
      algoritmo: 'Dense Semantic Vectorization (Cosine Similarity 128-dim L2 Normalized)',
      amostraVetor: sample
    };
  }

  /**
   * Busca semântica vetorial por Similaridade de Cosseno + Reranker Léxico Híbrido
   */
  public buscarSemantica(query: string, topK: number = 3): RAGSearchResult[] {
    if (!query || !query.trim()) return [];

    const queryVec = this.gerarEmbedding(query);
    const termos = query
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^\w\s]/gi, '')
      .split(/\s+/)
      .filter(t => t.length > 2);

    const scores = this.chunks.map(chunk => {
      // 1. Similaridade Vetorial Densa por Cosseno
      const chunkVec = chunk.embedding || this.gerarEmbedding(chunk.texto);
      const vectorScore = this.similaridadeCosseno(queryVec, chunkVec);

      // 2. Score Léxico de Palavras-Chave (Exact & Keyword overlap)
      let matches = 0;
      if (termos.length > 0) {
        const textoNorm = chunk.texto
          .toLowerCase()
          .normalize('NFD')
          .replace(/[\u0300-\u036f]/g, '');
        termos.forEach(t => {
          if (textoNorm.includes(t)) matches++;
        });
      }
      const lexicalScore = termos.length > 0 ? matches / termos.length : 0;

      // 3. Reranker Híbrido: 70% peso vetorial + 30% correspondência léxica
      const finalScore = parseFloat((0.7 * vectorScore + 0.3 * lexicalScore).toFixed(4));

      return {
        chunk,
        score: finalScore,
        documentoTitulo: chunk.documentoTitulo
      };
    });

    return scores
      .filter(s => s.score > 0.15)
      .sort((a, b) => b.score - a.score)
      .slice(0, topK);
  }

  /**
   * Extrai e formata as citações jurídicas/regimentais com documento, artigo e versão
   */
  public extrairCitacoes(resultados: RAGSearchResult[]): CitacaoRAG[] {
    return resultados.map(r => {
      let artigo = 'Disposição Geral';
      const matchArt = r.chunk.texto.match(/(Artigo\s+\d+|Art\.\s*\d+|CLAUSULA\s+\d+|CLÁUSULA\s+\d+|TITULO\s+[IVXLCDM\d]+|TÍTULO\s+[IVXLCDM\d]+|CAPITULO\s+[IVXLCDM\d]+|CAPÍTULO\s+[IVXLCDM\d]+[^\n-]*)/i);
      if (matchArt) {
        artigo = matchArt[0].trim();
      }

      return {
        artigo,
        documentoTitulo: r.documentoTitulo,
        versao: 'v2026.2 (Homologada em Assembleia Geral)',
        textoCitado: r.chunk.texto,
        scoreRelevancia: `${Math.round(r.score * 100)}% de correspondência vetorial`
      };
    });
  }

  /**
   * Playground de Teste RAG: retorna contexto compilado, citações detalhadas e confiança
   */
  public testarRAG(pergunta: string): {
    pergunta: string;
    resposta: string;
    resultados: RAGSearchResult[];
    citacoes: CitacaoRAG[];
    contextoCompilado: string;
    confianca: 'alta' | 'media' | 'baixa';
    metricaVetorial: {
      algoritmo: string;
      dimensoes: number;
      scoreCossenoPrincipal: number;
    };
  } {
    const resultados = this.buscarSemantica(pergunta, 3);
    const citacoes = this.extrairCitacoes(resultados);
    const contextoCompilado = resultados.map(r => `[Fonte: ${r.documentoTitulo}]\n${r.chunk.texto}`).join('\n\n---\n\n');

    let confianca: 'alta' | 'media' | 'baixa' = 'baixa';
    const topScore = resultados[0]?.score || 0;
    if (topScore >= 0.55) confianca = 'alta';
    else if (topScore >= 0.3) confianca = 'media';

    const resposta = resultados.length > 0
      ? `Conforme o ${citacoes[0]?.documentoTitulo} (${citacoes[0]?.artigo || 'Disposição Regimental'}):\n\n${resultados[0].chunk.texto}`
      : 'Não foi localizada disposição explícita para este termo nos documentos condominiais vigentes. A consulta pode ser encaminhada ao síndico para deliberação.';

    return {
      pergunta,
      resposta,
      resultados,
      citacoes,
      contextoCompilado,
      confianca,
      metricaVetorial: {
        algoritmo: 'Cosine Similarity (128-dim)',
        dimensoes: EMBEDDING_DIMENSIONS,
        scoreCossenoPrincipal: topScore
      }
    };
  }
}
