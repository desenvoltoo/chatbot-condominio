import axios from 'axios';
import { config } from '../config.js';

export class EvolutionService {
  private client = axios.create({
    baseURL: config.evolution.apiUrl,
    headers: {
      apikey: config.evolution.apiKey,
      'Content-Type': 'application/json',
    },
    timeout: 15000,
  });

  /**
   * Envia uma mensagem de texto simples
   */
  async sendText(remoteJid: string, text: string): Promise<boolean> {
    try {
      const endpoint = `/message/sendText/${config.evolution.instanceName}`;
      await this.client.post(endpoint, {
        number: remoteJid.replace('@s.whatsapp.net', ''),
        text: text,
      });
      return true;
    } catch (error: any) {
      console.error(`[EvolutionService] Erro ao enviar texto para ${remoteJid}:`, error?.response?.data || error?.message);
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
    try {
      const endpoint = `/message/sendMedia/${config.evolution.instanceName}`;
      await this.client.post(endpoint, {
        number: remoteJid.replace('@s.whatsapp.net', ''),
        mediatype: mediaType,
        mimetype: mediaType === 'document' ? 'application/pdf' : 'image/jpeg',
        caption: caption || '',
        media: mediaUrl,
        fileName: fileName,
      });
      return true;
    } catch (error: any) {
      console.error(`[EvolutionService] Erro ao enviar mídia para ${remoteJid}:`, error?.response?.data || error?.message);
      return false;
    }
  }

  /**
   * Verifica o status da conexão da instância com o WhatsApp
   */
  async checkConnectionStatus(): Promise<{ state: string; connected: boolean }> {
    try {
      const endpoint = `/instance/connectionState/${config.evolution.instanceName}`;
      const response = await this.client.get(endpoint);
      const state = response.data?.instance?.state || 'disconnected';
      return { state, connected: state === 'open' };
    } catch (error: any) {
      return { state: 'error', connected: false };
    }
  }
}
