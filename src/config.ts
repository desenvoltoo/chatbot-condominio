import dotenv from 'dotenv';
dotenv.config();

export const config = {
  port: parseInt(process.env.PORT || '3000', 10),
  nodeEnv: process.env.NODE_ENV || 'development',
  
  evolution: {
    apiUrl: process.env.EVOLUTION_API_URL || 'http://localhost:8080',
    apiKey: process.env.EVOLUTION_API_KEY || '4296086847242404',
    instanceName: process.env.EVOLUTION_INSTANCE_NAME || 'condominio_bot',
  },

  erp: {
    provider: process.env.ERP_PROVIDER || 'mock',
    baseUrl: process.env.ERP_BASE_URL || 'https://api.erpcondominio.com.br/v1',
    appToken: process.env.ERP_APP_TOKEN || '',
    accessToken: process.env.ERP_ACCESS_TOKEN || '',
  },

  company: {
    nome: process.env.NOME_ADMINISTRADORA || 'Administradora de Condomínios',
    telefoneSuporte: process.env.TELEFONE_SUPORTE || '5511999999999',
    horarioAtendimento: process.env.HORARIO_ATENDIMENTO || 'Segunda a Sexta, das 08h às 18h',
  },

  plantao: {
    whatsappJid: process.env.WHATSAPP_PLANTAO_JID || (process.env.TELEFONE_SUPORTE ? `${process.env.TELEFONE_SUPORTE.replace(/\D/g, '')}@s.whatsapp.net` : ''),
  },

  regua: {
    autoEnabled: process.env.REGUA_AUTO_ENABLED !== 'false',
    horaDisparo: parseInt(process.env.REGUA_HORA_DISPARO || '9', 10),
  },
};
