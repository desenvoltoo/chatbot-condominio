import express from 'express';
import cors from 'cors';
import path from 'path';
import { config } from './config.js';
import { webhookRouter, orchestrator } from './routes/webhook.routes.js';
import { createApiRouter } from './routes/api.routes.js';
import { SchedulerService } from './services/scheduler.service.js';

const app = express();

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Serve static frontend assets
const publicPath = path.join(__dirname, '..', 'public');
const docsPath = path.join(__dirname, '..', 'docs');

app.use('/docs', express.static(docsPath));
app.use(express.static(publicPath));

// Webhook & Management API Routes
app.use('/webhook', webhookRouter);
app.use('/api', createApiRouter(orchestrator));

// Auth & Login Route
app.get('/login', (_req, res) => {
  res.sendFile(path.join(publicPath, 'login.html'));
});

// Dashboard Route (Central do Operador)
app.get('/painel', (_req, res) => {
  res.sendFile(path.join(publicPath, 'painel.html'));
});

// Root Route: serves login page by default
app.get('/', (_req, res) => {
  res.sendFile(path.join(publicPath, 'login.html'));
});

app.listen(config.port, () => {
  console.log(`=======================================================`);
  console.log(`🏢 SISTEMA CONDOMÍNIO + SISCON (MAIS DOMÍNIO)`);
  console.log(`🤖 Backend Ativo na Porta ${config.port}`);
  console.log(`💻 Painel de Atendimento: http://localhost:${config.port}/painel`);
  console.log(`📱 Simulador WhatsApp:     http://localhost:${config.port}/docs/`);
  console.log(`🔗 Webhook Evolution API:  http://localhost:${config.port}/webhook/evolution`);
  console.log(`⚙️ Provedor ERP Conectado: ${config.erp.provider.toUpperCase()}`);
  console.log(`=======================================================`);

  // Inicia o agendador automático diário da régua de cobrança preventiva
  const scheduler = new SchedulerService();
  scheduler.iniciarAgendador();
});
