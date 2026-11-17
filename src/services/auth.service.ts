import crypto from 'crypto';
import { User, UserRole, AuthSession } from '../types/index.js';

export class AuthService {
  private static instance: AuthService;
  private users: Map<string, User> = new Map();
  private tokenStore: Map<string, { userId: string; expiresAt: number }> = new Map();

  private constructor() {
    this.seedDefaultUsers();
  }

  public static getInstance(): AuthService {
    if (!AuthService.instance) {
      AuthService.instance = new AuthService();
    }
    return AuthService.instance;
  }

  private hashPassword(password: string): string {
    return crypto.createHash('sha256').update(password + '_siscon_salt').digest('hex');
  }

  private seedDefaultUsers() {
    const defaultUsers: (Omit<User, 'senhaHash'> & { senhaPlana: string })[] = [
      {
        id: 'usr_admin',
        nome: 'Administrador Master',
        email: 'admin@condominio.com.br',
        senhaPlana: 'admin123',
        role: 'admin',
        cargo: 'Diretor / Administradora',
        avatarUrl: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150&auto=format&fit=crop&q=80',
        ativo: true,
        ultimoAcesso: new Date().toLocaleString('pt-BR')
      },
      {
        id: 'usr_sindico',
        nome: 'Síndico Geral (Conselho)',
        email: 'sindico@condominio.com.br',
        senhaPlana: 'sindico123',
        role: 'sindico',
        cargo: 'Síndico Eleito',
        avatarUrl: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=150&auto=format&fit=crop&q=80',
        ativo: true,
        ultimoAcesso: new Date().toLocaleString('pt-BR')
      },
      {
        id: 'usr_operador',
        nome: 'Operador Financeiro',
        email: 'financeiro@condominio.com.br',
        senhaPlana: 'operador123',
        role: 'operador',
        cargo: 'Atendente de Cobrança',
        avatarUrl: 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=150&auto=format&fit=crop&q=80',
        ativo: true,
        ultimoAcesso: new Date().toLocaleString('pt-BR')
      },
      {
        id: 'usr_portaria',
        nome: 'Equipe de Portaria',
        email: 'portaria@condominio.com.br',
        senhaPlana: 'portaria123',
        role: 'portaria',
        cargo: 'Controlador de Acesso',
        avatarUrl: 'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=150&auto=format&fit=crop&q=80',
        ativo: true,
        ultimoAcesso: new Date().toLocaleString('pt-BR')
      }
    ];

    defaultUsers.forEach(u => {
      this.users.set(u.email.toLowerCase(), {
        id: u.id,
        nome: u.nome,
        email: u.email.toLowerCase(),
        senhaHash: this.hashPassword(u.senhaPlana),
        role: u.role,
        cargo: u.cargo,
        avatarUrl: u.avatarUrl,
        ativo: u.ativo,
        ultimoAcesso: u.ultimoAcesso
      });
    });
  }

  public async login(email: string, senhaPlana: string): Promise<AuthSession | null> {
    const user = this.users.get(email.toLowerCase().trim());
    if (!user || !user.ativo) return null;

    const hashCalculado = this.hashPassword(senhaPlana);
    if (hashCalculado !== user.senhaHash) {
      return null;
    }

    user.ultimoAcesso = new Date().toLocaleString('pt-BR');

    // Generate secure opaque token
    const token = `sk_auth_${crypto.randomBytes(32).toString('hex')}`;
    const expiresAt = Date.now() + 1000 * 60 * 60 * 24 * 7; // 7 dias

    this.tokenStore.set(token, {
      userId: user.id,
      expiresAt
    });

    const { senhaHash, ...publicUser } = user;
    return {
      token,
      user: publicUser,
      expiresIn: '7d'
    };
  }

  public verifyToken(token: string): Omit<User, 'senhaHash'> | null {
    if (!token) return null;
    const session = this.tokenStore.get(token);
    if (!session || Date.now() > session.expiresAt) {
      if (session) this.tokenStore.delete(token);
      return null;
    }

    const user = Array.from(this.users.values()).find(u => u.id === session.userId);
    if (!user || !user.ativo) return null;

    const { senhaHash, ...publicUser } = user;
    return publicUser;
  }

  public logout(token: string): boolean {
    return this.tokenStore.delete(token);
  }

  public listarUsuarios(): Omit<User, 'senhaHash'>[] {
    return Array.from(this.users.values()).map(u => {
      const { senhaHash, ...publicUser } = u;
      return publicUser;
    });
  }

  public criarUsuario(dados: {
    nome: string;
    email: string;
    senhaPlana: string;
    role: UserRole;
    cargo: string;
    avatarUrl?: string;
    condominioIds?: string[];
  }): Omit<User, 'senhaHash'> {
    const emailNorm = dados.email.toLowerCase().trim();
    if (this.users.has(emailNorm)) {
      throw new Error('Já existe um usuário cadastrado com este e-mail');
    }

    const id = `usr_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
    const novoUsuario: User = {
      id,
      nome: dados.nome.trim(),
      email: emailNorm,
      senhaHash: this.hashPassword(dados.senhaPlana),
      role: dados.role,
      cargo: dados.cargo.trim(),
      avatarUrl: dados.avatarUrl || 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150&auto=format&fit=crop&q=80',
      ativo: true,
      ultimoAcesso: 'Nunca acessou',
      condominioIds: dados.condominioIds || ['cond_bosque']
    };

    this.users.set(emailNorm, novoUsuario);
    const { senhaHash, ...publicUser } = novoUsuario;
    return publicUser;
  }

  public removerUsuario(id: string): boolean {
    const user = Array.from(this.users.values()).find(u => u.id === id);
    if (!user) return false;
    if (user.role === 'admin' && user.email === 'admin@condominio.com.br') {
      throw new Error('Não é permitido excluir o Administrador Master do sistema');
    }
    return this.users.delete(user.email);
  }

  public toggleUsuarioAtivo(id: string): Omit<User, 'senhaHash'> | null {
    const user = Array.from(this.users.values()).find(u => u.id === id);
    if (!user) return null;
    if (user.role === 'admin' && user.email === 'admin@condominio.com.br') {
      throw new Error('Não é permitido desativar o Administrador Master');
    }
    user.ativo = !user.ativo;
    const { senhaHash, ...publicUser } = user;
    return publicUser;
  }
}
