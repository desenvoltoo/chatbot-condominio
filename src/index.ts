import express from 'express';
import { config } from './config.js';
import { webhookRouter } from './routes/webhook.routes.js';

const app = express();

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Rotas da aplicação
app.use('/webhook', webhookRouter);

app.get('/', (_req, res) => {
  res.json({
    app: 'Chatbot Condomínio WhatsApp API',
    version: '1.0.0',
    endpoints: {
      health: '/webhook/health',
      webhook: '/webhook/evolution',
    },
  });
});

app.listen(config.port, () => {
  console.log(`=======================================================`);
  console.log(`🤖 Chatbot Condomínio rodando na porta ${config.port}`);
  console.log(`🔗 Webhook da Evolution API: http://localhost:${config.port}/webhook/evolution`);
  console.log(`🏢 Administradora: ${config.company.nome}`);
  console.log(`⚙️ Modo ERP: ${config.erp.provider}`);
  console.log(`=======================================================`);
});
