import { Router, Request, Response } from 'express';
import { BotOrchestrator } from '../bot/bot.orchestrator.js';

export const webhookRouter = Router();
const orchestrator = new BotOrchestrator();

webhookRouter.post('/evolution', async (req: Request, res: Response) => {
  try {
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

      const pushName = messageData?.pushName;

      // Extrai o texto da mensagem de diferentes tipos (conversa simples, estendida ou botão)
      const messageContent =
        messageData?.message?.conversation ||
        messageData?.message?.extendedTextMessage?.text ||
        messageData?.message?.buttonsResponseMessage?.selectedButtonId ||
        messageData?.message?.listResponseMessage?.singleSelectReply?.selectedRowId ||
        '';

      if (messageContent) {
        console.log(`[Webhook] Mensagem recebida de ${remoteJid} (${pushName}): "${messageContent}"`);
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
    service: 'Chatbot Condomínio API',
  });
});
