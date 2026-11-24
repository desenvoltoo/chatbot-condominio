import { Router, Request, Response } from 'express';
import { BotOrchestrator } from '../bot/bot.orchestrator.js';
import { ConfigService } from '../services/config.service.js';
import { DbService } from '../services/db.service.js';

export const orchestrator = new BotOrchestrator();
export const webhookRouter = Router();

webhookRouter.post('/evolution', async (req: Request, res: Response) => {
  try {
    const config = ConfigService.getInstance().getConfig();
    const incomingKey = (req.headers['apikey'] as string) || (req.headers['x-api-key'] as string) || (req.query.token as string);

    // Validação de segurança de chave de API se configurada
    if (config.evolution.apiKey && config.evolution.apiKey !== 'seu_token_aqui') {
      if (!incomingKey || incomingKey !== config.evolution.apiKey) {
        console.warn('[Webhook] Acesso rejeitado: Chave da Evolution API ausente ou inválida.');
        return res.status(401).json({ error: 'Acesso não autorizado: chave do webhook inválida' });
      }
    }

    const payload = req.body;

    // A Evolution API envia eventos como 'messages.upsert'
    if (payload?.event === 'messages.upsert' || payload?.data?.key) {
      const messageData = payload.data;
      const key = messageData?.key;

      // Ignora mensagens enviadas pelo próprio bot
      if (key?.fromMe) {
        return res.status(200).json({ status: 'ignored_from_me' });
      }

      const remoteJid = key?.remoteJid;
      // Ignora mensagens de grupos (terminadas em @g.us) se o bot for apenas privado
      if (!remoteJid || remoteJid.includes('@g.us')) {
        return res.status(200).json({ status: 'ignored_group_or_no_jid' });
      }

      const pushName = messageData?.pushName || 'Condômino';

      // 1. Extração de texto de múltiplos formatos (conversa simples, estendida ou botão)
      let messageContent =
        messageData?.message?.conversation ||
        messageData?.message?.extendedTextMessage?.text ||
        messageData?.message?.buttonsResponseMessage?.selectedButtonId ||
        messageData?.message?.listResponseMessage?.singleSelectReply?.selectedRowId ||
        '';

      // 2. Detecção de Áudio (Nota de Voz WhatsApp)
      const isAudio = Boolean(messageData?.message?.audioMessage);
      const isImage = Boolean(messageData?.message?.imageMessage);

      if (isAudio && !messageContent) {
        const seconds = messageData?.message?.audioMessage?.seconds || 15;
        messageContent = `[Nota de voz recebida - ${seconds}s]: Morador enviou áudio no WhatsApp.`;
        console.log(`[Webhook] Nota de voz recebida de ${remoteJid} (${pushName}) [${seconds}s]`);
      } else if (isImage && !messageContent) {
        messageContent = `[Imagem/Comprovante recebido]: Morador enviou imagem no WhatsApp.`;
        console.log(`[Webhook] Imagem/Comprovante recebido de ${remoteJid} (${pushName})`);
      }

      if (messageContent) {
        console.log(`[Webhook] Processando mensagem de ${remoteJid} (${pushName}): "${messageContent}"`);
        
        // Registra na trilha de auditoria
        DbService.getInstance().logAudit(
          'system_evolution',
          'whatsapp@evolution.api',
          'WHATSAPP_INCOMING_MSG',
          `Morador: ${pushName} (${remoteJid})`
        );

        await orchestrator.processIncomingMessage(remoteJid, messageContent, pushName);
      }
    }

    return res.status(200).json({ status: 'success' });
  } catch (error: any) {
    console.error('[Webhook] Erro ao processar mensagem:', error?.message);
    return res.status(500).json({ error: 'Internal Server Error' });
  }
});

webhookRouter.get('/health', (_req: Request, res: Response) => {
  res.json({
    status: 'online',
    timestamp: new Date().toISOString(),
    service: 'CondoVolto AI - Evolution Webhook Gateway',
  });
});
