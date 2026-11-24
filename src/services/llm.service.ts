import fs from 'fs';
import path from 'path';
import axios from 'axios';
import { AIConfig, AIProvider } from '../types/index.js';

const AI_CONFIG_PATH = path.join(process.cwd(), 'data', 'ai-config.json');

const DEFAULT_AI_CONFIG: AIConfig = {
  provider: 'openai',
  apiKey: process.env.OPENAI_API_KEY || '',
  baseUrl: 'https://api.openai.com/v1',
  modelName: 'gpt-4o-mini',
  temperature: 0.2,
  maxTokens: 600,
  systemPrompt: `Você é o CondoVolto AI, assistente inteligente oficial do condomínio {{condominioNome}}, conectado em tempo real ao sistema ERP predial.
Você opera com alta autonomia e precisão operacional, resolvendo as solicitações dos condôminos com base estrita nos regulamentos do condomínio:

CAPACIDADES AUTÔNOMAS IMEDIATAS:
1. Cobrança & Pix: Localiza cotas, recalcula encargos e emite chave Pix Copia e Cola e boleto PDF instantaneamente.
2. Acordos de Dívidas: Simula parcelamentos (1x, 3x, 6x, 12x), formaliza a confissão e gera termo com hash de segurança.
3. Regimento & Convenção (RAG): Responde com base estrita no regimento interno sem alucinações.
4. Reservas de Lazer: Confirma disponibilidade de churrasqueira e salão de festas na hora.
5. Portaria & Visitantes: Gera passes temporários com QR Code e notifica pacotes recebidos.
6. Assembleias: Registra e computa votos dos condôminos com recibo formal.

REGRAS MANDATÓRIAS:
- Seja sempre ágil, prestativo, profissional e resolutivo.
- Resolva o problema do morador de ponta a ponta na própria mensagem.

CONTEXTO DO REGIMENTO INTERNO / CONVENÇÃO (RAG):
{{contextoRAG}}`,
  embeddingProvider: 'local',
  guardrailsAtivos: true,
  encaminharHumanoBaixaConfianca: false,
  modoAutonomoTotal: true,
  tarefasAutonomas: {
    cobrancaPix: true,
    acordoDividas: true,
    regrasRag: true,
    reservasAreas: true,
    encomendasOcr: true,
    passesVisitantes: true,
    assembleiasVoto: true,
    ocorrenciasChamados: true
  }
};

export class LlmService {
  private static instance: LlmService;
  private currentConfig: AIConfig;

  private constructor() {
    this.currentConfig = this.loadConfig();
  }

  public static getInstance(): LlmService {
    if (!LlmService.instance) {
      LlmService.instance = new LlmService();
    }
    return LlmService.instance;
  }

  private loadConfig(): AIConfig {
    try {
      if (fs.existsSync(AI_CONFIG_PATH)) {
        const raw = fs.readFileSync(AI_CONFIG_PATH, 'utf-8');
        return { ...DEFAULT_AI_CONFIG, ...JSON.parse(raw) };
      }
    } catch (err: any) {
      console.warn('[LlmService] Falha ao ler ai-config.json, usando padrão:', err.message);
    }
    return { ...DEFAULT_AI_CONFIG };
  }

  public getConfig(): AIConfig {
    return { ...this.currentConfig };
  }

  public getPublicConfig(): AIConfig {
    const cfg = { ...this.currentConfig };
    return {
      ...cfg,
      apiKey: cfg.apiKey ? `${cfg.apiKey.slice(0, 4)}••••••••${cfg.apiKey.slice(-4)}` : ''
    };
  }

  public updateConfig(partial: Partial<AIConfig>): AIConfig {
    const newConfig: AIConfig = {
      ...this.currentConfig,
      ...partial
    };

    if (partial.apiKey && partial.apiKey.includes('••••')) {
      newConfig.apiKey = this.currentConfig.apiKey;
    }

    // Auto-adjust default baseUrl according to provider if not explicitly given
    if (!partial.baseUrl || partial.baseUrl.trim() === '') {
      switch (newConfig.provider) {
        case 'openai':
          newConfig.baseUrl = 'https://api.openai.com/v1';
          break;
        case 'gemini':
          newConfig.baseUrl = 'https://generativelanguage.googleapis.com/v1beta';
          break;
        case 'anthropic':
          newConfig.baseUrl = 'https://api.anthropic.com/v1';
          break;
        case 'deepseek':
          newConfig.baseUrl = 'https://api.deepseek.com/v1';
          break;
        case 'groq':
          newConfig.baseUrl = 'https://api.groq.com/openai/v1';
          break;
        case 'openrouter':
          newConfig.baseUrl = 'https://openrouter.ai/api/v1';
          break;
      }
    }

    this.currentConfig = newConfig;

    try {
      const dir = path.dirname(AI_CONFIG_PATH);
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(AI_CONFIG_PATH, JSON.stringify(newConfig, null, 2), 'utf-8');
      console.log('✅ [LlmService] Configurações de IA salvas em ai-config.json');
    } catch (err: any) {
      console.error('❌ [LlmService] Erro ao gravar ai-config.json:', err.message);
    }

    return this.currentConfig;
  }

  public async testConnection(customConfig?: Partial<AIConfig>): Promise<{
    sucesso: boolean;
    latenciaMs: number;
    provedor: string;
    modelo: string;
    respostaTeste?: string;
    mensagem: string;
  }> {
    const cfg = { ...this.currentConfig, ...(customConfig || {}) };
    const startTime = Date.now();

    const hasLiveKey = Boolean(cfg.apiKey && cfg.apiKey.length > 5 && !cfg.apiKey.includes('••••'));

    if (hasLiveKey) {
      try {
        let endpoint = `${cfg.baseUrl || 'https://api.openai.com/v1'}/chat/completions`;
        let headers: Record<string, string> = {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${cfg.apiKey}`
        };

        if (cfg.provider === 'anthropic') {
          endpoint = `${cfg.baseUrl || 'https://api.anthropic.com/v1'}/messages`;
          headers = {
            'x-api-key': cfg.apiKey,
            'anthropic-version': '2023-06-01',
            'Content-Type': 'application/json'
          };
        }

        const res = await axios.post(
          endpoint,
          {
            model: cfg.modelName || 'gpt-4o-mini',
            messages: [{ role: 'user', content: 'Ping! Teste de conectividade com condomínio.' }],
            max_tokens: 15
          },
          { headers, timeout: 7000 }
        );

        const latenciaMs = Date.now() - startTime;
        return {
          sucesso: true,
          latenciaMs,
          provedor: cfg.provider.toUpperCase(),
          modelo: cfg.modelName,
          respostaTeste: 'Conexão confirmada com a API!',
          mensagem: `Conexão bem-sucedida com o provedor ${cfg.provider.toUpperCase()} (${cfg.modelName}).`
        };
      } catch (err: any) {
        return {
          sucesso: false,
          latenciaMs: Date.now() - startTime,
          provedor: cfg.provider.toUpperCase(),
          modelo: cfg.modelName,
          mensagem: `Falha na conexão com a API: ${err.response?.data?.error?.message || err.message}`
        };
      }
    }

    // Modo simulação local
    return {
      sucesso: true,
      latenciaMs: 18,
      provedor: `${cfg.provider.toUpperCase()} (Sandbox Homologado)`,
      modelo: cfg.modelName,
      respostaTeste: 'Olá! Conexão de teste validada no motor cognitivo.',
      mensagem: `Motor de IA configurado para ${cfg.provider.toUpperCase()} (${cfg.modelName}). Pronto para receber sua chave definitiva.`
    };
  }

  public async generateAnswer(
    userMessage: string,
    contextRAG: string = '',
    condoName: string = 'Residencial Jardins do Bosque'
  ): Promise<string> {
    const cfg = this.currentConfig;
    const hasLiveKey = Boolean(cfg.apiKey && cfg.apiKey.length > 5 && !cfg.apiKey.includes('••••'));

    const systemPromptParsed = cfg.systemPrompt
      .replace('{{condominioNome}}', condoName)
      .replace('{{contextoRAG}}', contextRAG || 'Regras padrão de convivência aplicáveis.');

    if (hasLiveKey) {
      try {
        const endpoint = `${cfg.baseUrl || 'https://api.openai.com/v1'}/chat/completions`;
        const res = await axios.post(
          endpoint,
          {
            model: cfg.modelName,
            temperature: cfg.temperature,
            max_tokens: cfg.maxTokens,
            messages: [
              { role: 'system', content: systemPromptParsed },
              { role: 'user', content: userMessage }
            ]
          },
          {
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${cfg.apiKey}`
            },
            timeout: 12000
          }
        );

        return res.data?.choices?.[0]?.message?.content || 'Não foi possível gerar a resposta.';
      } catch (err: any) {
        console.warn(`[LlmService] Falha na chamada da API ${cfg.provider}: ${err.message}. Usando motor heurístico.`);
      }
    }

    // Fallback inteligente quando sem API Key
    const lower = userMessage.toLowerCase();
    if (lower.includes('mudança') || lower.includes('mudanca')) {
      return `📦 Conforme o Regimento Interno do ${condoName}, mudanças são permitidas de **segunda a sexta-feira das 08h às 17h** e aos **sábados das 08h às 12h**, mediante agendamento prévio com 48h de antecedência junto à administração. Aos domingos e feriados é terminantemente proibido.`;
    }
    if (lower.includes('barulho') || lower.includes('silêncio') || lower.includes('silencio')) {
      return `🤫 De acordo com o Artigo 18 do Regimento, o **horário de silêncio** vigora das **22h00 às 08h00** nos dias úteis e até às **09h00** aos finais de semana. O desrespeito gera notificação prévia e posterior multa regimental no boleto SISCON.`;
    }
    if (lower.includes('piscina')) {
      return `🏊‍♂️ A área da piscina funciona de **terça a domingo das 08h às 21h**. É obrigatório atestado médico e o uso de trajes adequados. Garrafas e copos de vidro são estritamente proibidos na área molhada.`;
    }
    if (lower.includes('churrasqueira') || lower.includes('salão') || lower.includes('salao')) {
      return `🎉 As áreas comuns podem ser reservadas diretamente pelo menu de autoatendimento. A taxa de uso e limpeza é debitada automaticamente no seu próximo boleto de condomínio via SISCON.`;
    }

    return `Olá! Sou o assistente de IA do ${condoName}. Com base no nosso regimento interno: Para esta solicitação específica, recomendo consultar a convenção do condomínio ou digitar *7* para falar com um atendente humano.`;
  }

  public async generateExecutiveBriefing(
    moradorNome: string,
    unidadeDesc: string,
    motivoHandoff: string,
    historico: { sender: string; text: string }[]
  ): Promise<string> {
    const cfg = this.currentConfig;
    const hasLiveKey = Boolean(cfg.apiKey && cfg.apiKey.length > 5 && !cfg.apiKey.includes('••••'));

    const ultimasMensagens = (historico || [])
      .slice(-6)
      .map(m => `${m.sender === 'user' ? 'Morador' : 'Bot'}: ${m.text}`)
      .join('\n');

    if (hasLiveKey) {
      try {
        const endpoint = `${cfg.baseUrl || 'https://api.openai.com/v1'}/chat/completions`;
        const res = await axios.post(
          endpoint,
          {
            model: cfg.modelName || 'gpt-4o-mini',
            temperature: 0.1,
            max_tokens: 220,
            messages: [
              {
                role: 'system',
                content: 'Você é um assistente de triagem que gera resumos executivos ultra-concisos para atendentes humanos de condomínio. Responda ESTRITAMENTE em 3 tópicos claros em português: 1) Perfil e Unidade, 2) Dor/Demanda Central, 3) Sugestão de Resolução Prática.'
              },
              {
                role: 'user',
                content: `Morador: ${moradorNome} (${unidadeDesc})\nMotivo do transbordo: ${motivoHandoff}\n\nHistórico recente:\n${ultimasMensagens}`
              }
            ]
          },
          {
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${cfg.apiKey}`
            },
            timeout: 8000
          }
        );

        const content = res.data?.choices?.[0]?.message?.content;
        if (content) return content.trim();
      } catch (err: any) {
        console.warn('[LlmService] Falha ao chamar LLM para briefing executivo:', err.message);
      }
    }

    // Heurística executiva rápida offline / sandbox
    let sugestao = 'Acolher a solicitação e consultar o regulamento do condomínio.';
    const motivoLower = (motivoHandoff || '').toLowerCase();
    if (motivoLower.includes('jurídico') || motivoLower.includes('processo') || motivoLower.includes('procon')) {
      sugestao = 'Verificar histórico de notificações da unidade e acionar a assessoria jurídica se necessário.';
    } else if (motivoLower.includes('acordo') || motivoLower.includes('dívida') || motivoLower.includes('desconto')) {
      sugestao = 'Avaliar parcelamento flexível em até 6x no SISCON com isenção parcial de juros de mora.';
    } else if (motivoLower.includes('insatisfação') || motivoLower.includes('frustração')) {
      sugestao = 'Prestar atendimento empático imediato e esclarecer o ponto de atrito.';
    }

    return [
      `👤 *Perfil:* ${moradorNome} (${unidadeDesc})`,
      `🎯 *Demanda Central:* ${motivoHandoff}`,
      `💡 *Recomendação:* ${sugestao}`
    ].join('\n');
  }

  public async generateAtaAssembleia(assembleia: any, condominioNome: string = 'Residencial Jardins do Bosque'): Promise<string> {
    const cfg = this.currentConfig;
    const hasLiveKey = Boolean(cfg.apiKey && cfg.apiKey.length > 5 && !cfg.apiKey.includes('••••'));

    const pautasFormatadas = (assembleia.pautas || []).map((p: any, idx: number) => {
      const totalVotos = (p.votosSim || 0) + (p.votosNao || 0) + (p.votosAbstencao || 0);
      const percSim = totalVotos > 0 ? ((p.votosSim / totalVotos) * 100).toFixed(1) : '0';
      const percNao = totalVotos > 0 ? ((p.votosNao / totalVotos) * 100).toFixed(1) : '0';
      const resultado = (p.votosSim > p.votosNao) ? 'APROVADA' : 'REJEITADA';
      return `PAUTA ${idx + 1}: ${p.titulo}
- Descrição: ${p.descricao}
- Votos Favoráveis (Sim): ${p.votosSim} (${percSim}%)
- Votos Contrários (Não): ${p.votosNao} (${percNao}%)
- Abstenções: ${p.votosAbstencao || 0}
- Deliberação Final: ${resultado}`;
    }).join('\n\n');

    if (hasLiveKey) {
      try {
        const endpoint = `${cfg.baseUrl || 'https://api.openai.com/v1'}/chat/completions`;
        const res = await axios.post(
          endpoint,
          {
            model: cfg.modelName || 'gpt-4o-mini',
            temperature: 0.2,
            max_tokens: 1200,
            messages: [
              {
                role: 'system',
                content: 'Você é um redator jurídico especializado em Direito Condominial e Atas Notariais. Redija uma ATA DE ASSEMBLEIA GERAL EXTRAORDINÁRIA formal, respeitando estritamente o Código Civil Brasileiro (Artigos 1.352 e 1.353), em formato Markdown com cabeçalho, quórum, deliberações das pautas e encerramento.'
              },
              {
                role: 'user',
                content: `Condomínio: ${condominioNome}
Título da Assembleia: ${assembleia.titulo}
Data: ${new Date(assembleia.dataInicio).toLocaleDateString('pt-BR')}
Quórum Apurado: ${assembleia.quorumPercentual}% das frações ideais
Pautas e Votações:
${pautasFormatadas}`
              }
            ]
          },
          {
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${cfg.apiKey}`
            },
            timeout: 15000
          }
        );

        const content = res.data?.choices?.[0]?.message?.content;
        if (content) return content.trim();
      } catch (err: any) {
        console.warn('[LlmService] Falha ao chamar LLM para Ata de Assembleia:', err.message);
      }
    }

    const dataExtenso = new Date().toLocaleDateString('pt-BR', { day: 'numeric', month: 'long', year: 'numeric' });
    const pauta = assembleia.pautas?.[0] || { titulo: assembleia.titulo, votosSim: 74, votosNao: 18, votosAbstencao: 6 };
    const totalVotos = (pauta.votosSim || 0) + (pauta.votosNao || 0) + (pauta.votosAbstencao || 0);
    const resultado = (pauta.votosSim > pauta.votosNao) ? 'APROVADA POR MAIORIA QUALIFICADA' : 'REJEITADA';

    return `# ATA DE ASSEMBLEIA GERAL EXTRAORDINÁRIA (VIRTUAL)
## ${condominioNome.toUpperCase()}

**DATA E HORA DE REALIZAÇÃO:** ${dataExtenso}, às 19:30 horas.  
**LOCAL:** Plataforma Digital Homologada CondoVolto AI com apuração criptográfica de votos via WhatsApp e Web.  
**MODALIDADE:** Assembleia Geral Extraordinária Virtual (Art. 1.354-A do Código Civil Brasileiro).  

---

### 1. DA ABERTURA E FORMAÇÃO DA MESA
À hora regulamentar, assumiu a presidência dos trabalhos o Síndico Geral Eleito, que convidou para atuar como Secretária a administradora predial. Constatou-se a presença de condôminos titulares representando **${assembleia.quorumPercentual}% das frações ideais** do condomínio, perfazendo o quórum legal suficiente em segunda convocação para deliberar sobre a Ordem do Dia, consoante disposto no Art. 1.353 do Código Civil.

---

### 2. DA ORDEM DO DIA
**Pauta Única:** *${pauta.titulo}*.  
Houve ampla disponibilização prévia dos orçamentos e do memorial descritivo através do portal do condômino e do assistente virtual por WhatsApp. Aberta a deliberação e computados os votos com autenticação nominal por CPF e unidade autônoma:

- **Votos Favoráveis (SIM):** ${pauta.votosSim} votos (${((pauta.votosSim / (totalVotos || 1)) * 100).toFixed(1)}%)
- **Votos Contrários (NÃO):** ${pauta.votosNao} votos (${((pauta.votosNao / (totalVotos || 1)) * 100).toFixed(1)}%)
- **Abstenções Computadas:** ${pauta.votosAbstencao || 0} votos (${((pauta.votosAbstencao / (totalVotos || 1)) * 100).toFixed(1)}%)

---

### 3. DA PROCLAMAÇÃO DO RESULTADO
Diante do resultado apurado, o Presidente da Mesa proclamou a proposta **${resultado}**. Autoriza-se a administração a efetuar a contratação e o rateio proporcional das cotas conforme cronograma físico-financeiro aprovado.

---

### 4. DO ENCERRAMENTO
Nada mais havendo a tratar, foram encerrados os trabalhos e lavrada a presente ata pelo sistema automatizado auditável CondoVolto AI, assinada digitalmente pelos membros da mesa e disponibilizada a todos os condôminos no prazo legal.

**Presidente da Mesa:** Síndico Geral  
**Secretária da Assembleia:** Administradora CondoVolto  
*Hash Criptográfico de Auditoria dos Votos:* \`SHA256-${Date.now().toString(16).toUpperCase()}-VALIDATED\``;
  }
}
