import { Response } from 'express';

export interface DashboardEvent {
  type:
    | 'new_message'
    | 'handoff_changed'
    | 'session_updated'
    | 'ticket_status'
    | 'sla_warning'
    | 'stats_updated'
    | 'connected'
    | 'payment_confirmed'
    | 'reserva_created'
    | 'reserva_updated'
    | 'os_created'
    | 'os_updated'
    | 'supervisao_pendencia'
    | 'supervisao_respondida';
  remoteJid?: string;
  data?: any;
  timestamp: string;
}

/**
 * Serviço de Eventos em Tempo Real (Server-Sent Events - SSE)
 * Notifica os painéis administrativos de novos eventos no WhatsApp sem necessidade de polling.
 */
export class EventsService {
  private static instance: EventsService;
  private clients: Set<Response> = new Set();
  private keepAliveTimer: NodeJS.Timeout | null = null;

  private constructor() {
    this.iniciarKeepAlive();
  }

  public static getInstance(): EventsService {
    if (!EventsService.instance) {
      EventsService.instance = new EventsService();
    }
    return EventsService.instance;
  }

  private iniciarKeepAlive() {
    // Ping regular para evitar timeout de conexões em proxies e navegadores
    this.keepAliveTimer = setInterval(() => {
      this.enviarPing();
    }, 25000);
  }

  public addClient(res: Response): void {
    this.clients.add(res);

    // Envia evento inicial de confirmação de conexão
    const initialEvent: DashboardEvent = {
      type: 'connected',
      data: {
        message: 'Conectado ao fluxo em tempo real do CondoVolto AI',
        connectedClients: this.clients.size
      },
      timestamp: new Date().toISOString()
    };
    res.write(`data: ${JSON.stringify(initialEvent)}\n\n`);

    res.on('close', () => {
      this.clients.delete(res);
    });

    res.on('error', () => {
      this.clients.delete(res);
    });
  }

  public broadcast(event: DashboardEvent): void {
    const payload = `data: ${JSON.stringify(event)}\n\n`;
    for (const client of this.clients) {
      try {
        client.write(payload);
      } catch (err) {
        this.clients.delete(client);
      }
    }
  }

  private enviarPing(): void {
    for (const client of this.clients) {
      try {
        client.write(`: ping\n\n`);
      } catch (err) {
        this.clients.delete(client);
      }
    }
  }

  public getConnectedClientsCount(): number {
    return this.clients.size;
  }
}
