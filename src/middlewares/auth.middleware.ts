import { Request, Response, NextFunction } from 'express';
import { AuthService } from '../services/auth.service.js';
import { UserRole } from '../types/index.js';
import { DbService } from '../services/db.service.js';

export function requireAuth(allowedRoles?: UserRole[]) {
  return (req: Request, res: Response, next: NextFunction) => {
    const authHeader = req.headers.authorization || '';
    const token = authHeader.replace(/^Bearer\s+/i, '').trim();

    if (!token) {
      return res.status(401).json({
        error: 'Acesso não autorizado: token de autenticação ausente',
        codigo: 'AUTH_TOKEN_MISSING'
      });
    }

    const user = AuthService.getInstance().verifyToken(token);
    if (!user) {
      return res.status(401).json({
        error: 'Sessão inválida ou expirada. Efetue login novamente.',
        codigo: 'AUTH_SESSION_EXPIRED'
      });
    }

    // Validação de Permissões RBAC
    if (allowedRoles && allowedRoles.length > 0 && !allowedRoles.includes(user.role)) {
      return res.status(403).json({
        error: `Acesso negado: seu perfil (${user.role}) não possui privilégios para esta operação`,
        codigo: 'FORBIDDEN_INSUFFICIENT_ROLE'
      });
    }

    // Registra auditoria para ações mutáveis (POST, PUT, DELETE, PATCH)
    if (['POST', 'PUT', 'DELETE', 'PATCH'].includes(req.method)) {
      const ip = (req.headers['x-forwarded-for'] as string) || req.socket.remoteAddress || '127.0.0.1';
      DbService.getInstance().logAudit(
        user.id,
        user.email,
        `${req.method} ${req.originalUrl || req.path}`,
        JSON.stringify(req.body ? Object.keys(req.body) : {}),
        ip
      );
    }

    (req as any).user = user;
    next();
  };
}
