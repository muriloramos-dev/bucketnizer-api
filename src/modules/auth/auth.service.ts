// import { Injectable, UnauthorizedException } from '@nestjs/common';
// import { ConfigService } from '@nestjs/config';
// import { CognitoJwtVerifier } from 'aws-jwt-verify';

// @Injectable()
// export class AuthService {
//   private readonly verifier;
//   constructor(config: ConfigService) {
//     this.verifier = CognitoJwtVerifier.create({
//       userPoolId: config.getOrThrow<string>('COGNITO_USER_POOL_ID'),
//       clientId: config.getOrThrow<string>('COGNITO_CLIENT_ID'),
//       tokenUse: 'access',
//     });
//   }
  
//   async verify(token: string) {
//     try {
//       const claims = await this.verifier.verify(token);
//       return { sub: claims.sub, exp: claims.exp };
//     } catch {
//       throw new UnauthorizedException('Sessão inválida ou expirada. Entre novamente.');
//     }
//   }
// }
