// import { vi } from 'vitest';
// import type { ExecutionContext } from '@nestjs/common';
// import { AuthGuard } from './auth.guard.js';
// import type { AuthService } from './auth.service.js';

// it.each([undefined, '', 'Basic abc', 'Bearer', 'Bearer a b'])('rejects missing or malformed Authorization: %s', async (authorization) => {
//   const verify = vi.fn();
//   const guard = new AuthGuard({ verify } as unknown as AuthService);
//   const context = { switchToHttp: () => ({ getRequest: () => ({ headers: { authorization } }) }) } as ExecutionContext;
//   await expect(guard.canActivate(context)).rejects.toMatchObject({ status: 401 });
//   expect(verify).not.toHaveBeenCalled();
// });
// it('uses only the verified subject, not a userId supplied by the client', async () => {
//   const request = { headers: { authorization: 'Bearer signed' }, body: { userId: 'victim' }, user: undefined as unknown };
//   const guard = new AuthGuard({ verify: vi.fn().mockResolvedValue({ sub: 'owner', exp: 100 }) } as unknown as AuthService);
//   await guard.canActivate({ switchToHttp: () => ({ getRequest: () => request }) } as ExecutionContext);
//   expect(request.user).toEqual({ sub: 'owner', exp: 100 });
// });
