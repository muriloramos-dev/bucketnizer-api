import { Controller, Header, Req, Sse } from '@nestjs/common';
import { takeUntil, timer } from 'rxjs';
import { EventsService } from './events.service.js';
// import type { AuthenticatedRequest } from '../auth/auth.guard.js';

@Controller('events')
export class EventsController {
  constructor(private readonly events: EventsService) {}
  @Sse()
  @Header('X-Accel-Buffering', 'no')
  stream() {
  // stream(@Req() req: AuthenticatedRequest) {

    // Expiry closes the stream; reconnect uses a refreshed access token.
    // return this.events.stream(req.user.sub).pipe(
      // takeUntil(timer(Math.max(0, req.user.exp * 1000 - Date.now()))),
    // );
  }
}
