import axios, { AxiosInstance } from 'axios';
import { config as staticConfig } from '../config.js';
import { ConfigService } from './config.service.js';

export class EvolutionService {
  private getClientInfo(): { client: AxiosInstance; instanceName: string; apiUrl: string; apiKey: string } {
    let evo = staticConfig.evolution;
    try {
      const cfg = ConfigService.getInstance().getConfig();
      if (cfg && cfg.evolution) {
        evo = cfg.evolution;
      }
    } catch (e) {}

    const apiUrl = evo.apiUrl || 'http://localhost:8080';
    const apiKey = evo.apiKey || '4296086847242404';
    const instanceName = evo.instanceName || 'condominio_bot';

    const client = axios.create({
      baseURL: apiUrl,
      headers: {
        apikey: apiKey,
        'Content-Type': 'application/json',
      },
      timeout: 10000,
    });

    return { client, instanceName, apiUrl, apiKey };
  }

  /**
   * Envia uma mensagem de texto simples
   */
  async sendText(remoteJid: string, text: string): Promise<boolean> {
    const { client, instanceName } = this.getClientInfo();
    try {
      const endpoint = `/message/sendText/${instanceName}`;
      await client.post(endpoint, {
        number: remoteJid.replace('@s.whatsapp.net', ''),
        text: text,
      });
      return true;
    } catch (error: any) {
      console.warn(`[EvolutionService] Erro ao enviar texto para ${remoteJid}:`, error?.response?.data || error?.message);
      return false;
    }
  }

  /**
   * Envia arquivo de mídia (PDF de boleto, comprovante ou imagem)
   */
  async sendMedia(
    remoteJid: string,
    mediaUrl: string,
    fileName: string,
    caption?: string,
    mediaType: 'document' | 'image' = 'document'
  ): Promise<boolean> {
    const { client, instanceName } = this.getClientInfo();
    try {
      const endpoint = `/message/sendMedia/${instanceName}`;
      await client.post(endpoint, {
        number: remoteJid.replace('@s.whatsapp.net', ''),
        mediatype: mediaType,
        mimetype: mediaType === 'document' ? 'application/pdf' : 'image/jpeg',
        caption: caption || '',
        media: mediaUrl,
        fileName: fileName,
      });
      return true;
    } catch (error: any) {
      console.warn(`[EvolutionService] Erro ao enviar mídia para ${remoteJid}:`, error?.response?.data || error?.message);
      return false;
    }
  }

  /**
   * Dispara um comunicado oficial formatado para um grupo de condomínio (@g.us)
   */
  async sendGroupAnnouncement(
    groupJid: string,
    condominioNome: string,
    titulo: string,
    mensagem: string,
    urgente = false
  ): Promise<boolean> {
    const icone = urgente ? '🚨 *URGENTE*' : '📢 *COMUNICADO OFICIAL*';
    const textoFormatado = [
      `${icone} - ${condominioNome.toUpperCase()}`,
      `----------------------------------------`,
      `📌 *${titulo}*`,
      ``,
      mensagem,
      `----------------------------------------`,
      `🏢 _${staticConfig.company.nome} • Gestão Transparente_`,
      `_Mensagem automática enviada aos moradores do condomínio._`,
    ].join('\n');

    return this.sendText(groupJid, textoFormatado);
  }

  /**
   * Verifica o status da conexão da instância com o WhatsApp
   */
  async checkConnectionStatus(): Promise<{ state: string; connected: boolean; instanceName: string; apiUrl: string }> {
    const { client, instanceName, apiUrl } = this.getClientInfo();
    try {
      const endpoint = `/instance/connectionState/${instanceName}`;
      const response = await client.get(endpoint);
      const state = response.data?.instance?.state || 'disconnected';
      return { state, connected: state === 'open', instanceName, apiUrl };
    } catch (error: any) {
      return { state: 'disconnected', connected: false, instanceName, apiUrl };
    }
  }

  /**
   * Solicita o QR Code de conexão da instância na Evolution API.
   * Se a API responder, entrega a imagem Base64 ou pairingCode.
   * Se o container estiver offline ou em homologação, entrega payload visual para simulação assistida.
   */
  async getQrCode(): Promise<{
    success: boolean;
    state: string;
    base64?: string;
    code?: string;
    pairingCode?: string;
    message: string;
    isMock?: boolean;
  }> {
    const { client, instanceName, apiUrl } = this.getClientInfo();

    try {
      // 1. Tenta obter o estado de conexão
      const stateEndpoint = `/instance/connectionState/${instanceName}`;
      let stateRes;
      try {
        stateRes = await client.get(stateEndpoint);
      } catch (err: any) {
        // Se a instância não existe (404), tenta criar
        if (err?.response?.status === 404) {
          try {
            await client.post('/instance/create', {
              instanceName,
              token: instanceName,
              qrcode: true,
              integration: 'WHATSAPP-BAILEYS',
            });
          } catch (createErr) {}
        }
      }

      const currentState = stateRes?.data?.instance?.state;
      if (currentState === 'open') {
        return {
          success: true,
          state: 'open',
          message: `WhatsApp já está conectado com sucesso na instância "${instanceName}".`,
        };
      }

      // 2. Tenta conectar e obter o QR Code
      const connectEndpoint = `/instance/connect/${instanceName}`;
      const connRes = await client.get(connectEndpoint);
      const data = connRes.data;

      if (data?.base64) {
        return {
          success: true,
          state: 'connecting',
          base64: data.base64.startsWith('data:') ? data.base64 : `data:image/png;base64,${data.base64}`,
          code: data.code,
          pairingCode: data.pairingCode,
          message: 'QR Code oficial gerado pela Evolution API.',
        };
      }

      if (data?.code) {
        return {
          success: true,
          state: 'connecting',
          code: data.code,
          pairingCode: data.pairingCode,
          message: 'Código de pareamento disponível.',
        };
      }
    } catch (err: any) {
      console.warn(`[EvolutionService] Evolution API em ${apiUrl} indisponível ou em homologação:`, err.message);
    }

    // Fallback de alta fidelidade visual (SVG QR Code decorativo com payload da instância)
    const mockCode = `2@${Date.now()}ZelorisEvolution${instanceName}`;
    const svgQrMock = `data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200" width="200" height="200"><rect width="200" height="200" fill="%23ffffff"/><g fill="%230f172a"><rect x="20" y="20" width="45" height="45" fill="none" stroke="%230f172a" stroke-width="8"/><rect x="32" y="32" width="21" height="21"/><rect x="135" y="20" width="45" height="45" fill="none" stroke="%230f172a" stroke-width="8"/><rect x="147" y="32" width="21" height="21"/><rect x="20" y="135" width="45" height="45" fill="none" stroke="%230f172a" stroke-width="8"/><rect x="32" y="147" width="21" height="21"/><rect x="80" y="30" width="12" height="12"/><rect x="100" y="45" width="15" height="15"/><rect x="80" y="80" width="40" height="40"/><rect x="40" y="85" width="15" height="15"/><rect x="145" y="85" width="20" height="15"/><rect x="90" y="140" width="25" height="15"/><rect x="135" y="145" width="15" height="30"/><rect x="165" y="135" width="15" height="15"/><circle cx="100" cy="100" r="14" fill="%2322c55e"/></g></svg>`;

    return {
      success: true,
      state: 'connecting',
      base64: svgQrMock,
      code: mockCode,
      pairingCode: `${Math.floor(1000 + Math.random() * 9000)}-${Math.floor(1000 + Math.random() * 9000)}`,
      message: `Ambiente de demonstração / Evolution API em "${apiUrl}". Para conectar o WhatsApp real, inicie o container: docker compose up -d`,
      isMock: true,
    };
  }

  /**
   * Desconecta e faz logout da sessão WhatsApp na Evolution API
   */
  async disconnect(): Promise<boolean> {
    const { client, instanceName } = this.getClientInfo();
    try {
      const endpoint = `/instance/logout/${instanceName}`;
      await client.delete(endpoint);
      return true;
    } catch (err: any) {
      console.warn(`[EvolutionService] Erro ao desconectar:`, err.message);
      return false;
    }
  }

  /**
   * Reinicia a instância do WhatsApp
   */
  async restart(): Promise<boolean> {
    const { client, instanceName } = this.getClientInfo();
    try {
      const endpoint = `/instance/restart/${instanceName}`;
      await client.post(endpoint);
      return true;
    } catch (err: any) {
      console.warn(`[EvolutionService] Erro ao reiniciar instância:`, err.message);
      return false;
    }
  }
}
