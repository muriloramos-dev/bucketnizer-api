import {
  Injectable,
  type MessageEvent,
  type OnModuleDestroy,
} from '@nestjs/common';
import { Observable, Subject } from 'rxjs';

export interface FileReadyEvent {
  type: 'file.ready' | 'file.trashed' | 'file.restored' | 'file.deleting' | 'file.deleted';
  objectId: string;
  pathName: string;
}

@Injectable()
export class EventsService implements OnModuleDestroy {
  onModuleDestroy() {
    this.notifications.complete();
  }
  private readonly notifications = new Subject<{
    userId: string;
    data: FileReadyEvent;
  }>();

  fileReady(userId: string, objectId: string, pathName: string) {
    this.notifications.next({
      userId,
      data: { type: 'file.ready', objectId, pathName },
    });
  }

  fileLifecycle(userId: string, objectId: string, pathName: string, type: FileReadyEvent['type']) {
    this.notifications.next({userId, data: {type, objectId, pathName}});
  }

  stream(userId: string): Observable<MessageEvent> {
    return new Observable((subscriber) => {
      // Subscribe before announcing readiness: the client can now reconcile MongoDB.
      const subscription = this.notifications.subscribe({
        next: (event) => {
          if (event.userId === userId)
            subscriber.next({ type: event.data.type, data: event.data });
        },
        complete: () => subscriber.complete(),
      });
      subscriber.next({
        type: 'connected',
        data: { connected: true },
        retry: 3000,
      });
      // Keep intermediaries from treating an idle connection as abandoned. No DB/S3 calls.
      const heartbeat = setInterval(
        () =>
          subscriber.next({ type: 'heartbeat', data: { time: Date.now() } }),
        15000,
      );
      return () => {
        clearInterval(heartbeat);
        subscription.unsubscribe();
      };
    });
  }
}
