// import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
// import { AuthService } from './auth.service.js';

// export interface AuthenticatedRequest {
//   headers: { authorization?: string };
//   user: { sub: string; exp: number };
// }

// @Injectable()
// export class AuthGuard implements CanActivate {
//   constructor(private readonly auth: AuthService) {}
//   async canActivate(context: ExecutionContext): Promise<boolean> {
//     const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
//     const match = /^Bearer ([^\s]+)$/i.exec(request.headers.authorization || '');
//     if (!match) throw new UnauthorizedException('Faça login para acessar seus arquivos.');
//     request.user = await this.auth.verify(match[1]);
//     return true;
//   }
// }
