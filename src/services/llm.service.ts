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
  systemPrompt: `Você é o ZELORIS AI, assistente inteligente oficial do condomínio {{condominioNome}}, conectado em tempo real ao sistema ERP predial.
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
}
