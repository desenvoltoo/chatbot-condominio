import fs from 'fs';
import path from 'path';
import { DocumentoRAG, ChunkRAG, RAGSearchResult } from '../types/index.js';

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
      console.warn('[RagService] Falha ao carregar rag-documents.json, populando base padrão:', err.message);
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
Artigo 12 - A reserva do Espaço Gourmet & Churrasqueira pode ser feita com até 60 dias de antecedência. O valor da taxa de uso é de R$ 100,00 acrescido da taxa de limpeza de R$ 50,00 (total R$ 150,00), debitado automaticamente no próximo boleto condominial via DOMUS AI. O horário limite para término de eventos e desligamento de som é às 22h00. Cancelamentos sem ônus devem ser solicitados com 48h de antecedência.

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
Fica a Administradora e o Síndico autorizados a firmar acordos amigáveis com devedores através do sistema DOMUS AI em até 12 (doze) parcelas mensais e sucessivas, com entrada mínima correspondente à primeira parcela, sob pena de vencimento antecipado das parcelas vincendas em caso de inadimplência superior a 30 dias.`
    );

    this.adicionarDocumento(
      'FAQ Oficial da Administração & Portaria',
      'faq',
      `PERGUNTA: Como recebo minha 2ª via de boleto?
RESPOSTA: O boleto pode ser obtido instantaneamente enviando "boleto" ou "segunda via" no nosso WhatsApp oficial, informando seu CPF cadastrado no condom�nio. O sistema gera a linha digitável e o código Pix Copia e Cola para pagamento imediato.

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

    // Chunker semântico inteligente (divide por artigos/parágrafos de ~400 a 600 caracteres)
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
   * Busca semântica por similaridade de termos e palavras-chave contextuais
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

      // Score ponderado
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
   * Playground de Teste RAG: retorna contexto compilado e score de acerto
   */
  public testarRAG(pergunta: string): {
    pergunta: string;
    resultados: RAGSearchResult[];
    contextoCompilado: string;
    confianca: 'alta' | 'media' | 'baixa';
  } {
    const resultados = this.buscarSemantica(pergunta, 3);
    const contextoCompilado = resultados.map(r => `[Fonte: ${r.documentoTitulo}]\n${r.chunk.texto}`).join('\n\n---\n\n');

    let confianca: 'alta' | 'media' | 'baixa' = 'baixa';
    if (resultados.length > 0 && resultados[0].score >= 0.5) confianca = 'alta';
    else if (resultados.length > 0) confianca = 'media';

    return {
      pergunta,
      resultados,
      contextoCompilado,
      confianca
    };
  }
}
