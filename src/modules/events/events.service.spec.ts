import { afterEach, expect, it, vi } from 'vitest';
import { EventsService } from './events.service.js';

afterEach(() => vi.useRealTimers());
it('announces connection, isolates users, and releases subscriptions and heartbeat on close', () => {
  vi.useFakeTimers();
  const events = new EventsService();
  const a = vi.fn();
  const b = vi.fn();
  const first = events.stream('a').subscribe(a);
  const second = events.stream('b').subscribe(b);
  expect(a).toHaveBeenCalledWith(
    expect.objectContaining({ type: 'connected' }),
  );
  events.fileReady('a', 'object', 'Viagens/Praia');
  expect(a).toHaveBeenLastCalledWith({
    type: 'file.ready',
    data: { type: 'file.ready', objectId: 'object', pathName: 'Viagens/Praia' },
  });
  expect(b).toHaveBeenCalledTimes(1);
  vi.advanceTimersByTime(15000);
  expect(b).toHaveBeenLastCalledWith(
    expect.objectContaining({ type: 'heartbeat' }),
  );
  first.unsubscribe();
  second.unsubscribe();
  const count = a.mock.calls.length;
  events.fileReady('a', 'other', 'Viagens');
  vi.advanceTimersByTime(30000);
  expect(a).toHaveBeenCalledTimes(count);
  expect(vi.getTimerCount()).toBe(0);
});
it('closes open streams on backend shutdown', () => {
  vi.useFakeTimers();
  const events = new EventsService();
  const complete = vi.fn();
  events.stream('userId').subscribe({ complete });
  events.onModuleDestroy();
  expect(complete).toHaveBeenCalledOnce();
  expect(vi.getTimerCount()).toBe(0);
});

it('scopes trash lifecycle events and preserves their event names',()=>{
 const events=new EventsService();const own=vi.fn(),other=vi.fn();const a=events.stream('owner').subscribe(own),b=events.stream('other').subscribe(other);
 for(const type of ['file.trashed','file.restored','file.deleting','file.deleted'] as const){events.fileLifecycle('owner','id','A/B',type);expect(own).toHaveBeenLastCalledWith({type,data:{type,objectId:'id',pathName:'A/B'}});}
 expect(other).toHaveBeenCalledTimes(1);a.unsubscribe();b.unsubscribe();
});
