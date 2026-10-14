import { Model } from 'mongoose';
import { vi } from 'vitest';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { PutObjectCommand } from '@aws-sdk/client-s3';
import { FilesService } from './files.service.js';
import { Folders } from './schemas/folders.schema.js';
import { Files } from './schemas/files.schema.js';

// Isolate the service from schema decorators in the unit-test transformer.
vi.mock('./schemas/files.schema.js', () => ({
  Files: class Files {},
  FileStatus: { PENDING_UPLOAD: 'PENDING_UPLOAD', PROCESSING:'PROCESSING', FAILED:'FAILED', READY: 'READY', DELETING: 'DELETING' },
}));

vi.mock('./schemas/folders.schema.js', () => ({ Folders: class Folders {} }));

vi.mock('@aws-sdk/s3-request-presigner', () => ({
  getSignedUrl: vi.fn().mockResolvedValue('https://example.com/signed'),
}));

describe('FilesService upload keys', () => {
  beforeEach(() => vi.clearAllMocks());

  it.each([
    [undefined, 'originals/userId/Recentes/'],
    [null, 'originals/userId/Recentes/'],
    ['', 'originals/userId/Recentes/'],
    ['   ', 'originals/userId/Recentes/'],
    ['/', 'originals/userId/Recentes/'],
    ['viagens', 'originals/userId/viagens/'],
    ['/viagens/', 'originals/userId/viagens/'],
    ['viagens//praia', 'originals/userId/viagens/praia/'],
  ])('avoids empty key segments for path %j', async (path, prefix) => {
    const create = vi.fn().mockResolvedValue({});
    const service = new FilesService(
      { create } as unknown as Model<Files>,
      {
        updateOne: vi
          .fn()
          .mockReturnValue({ exec: vi.fn().mockResolvedValue({}) }),
      } as unknown as Model<Folders>,
    );

    const result = await service.sendObject(
      'userId',
      { path, file: { originalName: 'foto.jpg', contentType: 'image/jpeg', size: 100 } },
    );

    const command = vi.mocked(getSignedUrl).mock
      .calls[0][1] as PutObjectCommand;
    expect(command.input.Key).toBe(`${prefix}${result.objectId}`);
    expect(command.input.Key).not.toContain('//');
    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({
        originalKey: command.input.Key,
        pathName: prefix.replace('originals/userId/', '').replace(/\/$/, ''),
        objectId: result.objectId,
      }),
    );
  });
});

describe('Persistent folders', () => {
  it('rejects invalid paths before creating metadata or signing', async () => {
    vi.clearAllMocks();
    const create = vi.fn();
    const service = new FilesService(
      { create } as unknown as Model<Files>,
      {} as Model<Folders>,
    );
    await expect(
      service.sendObject('userId', { path: '../', file: { originalName: 'foto.jpg', contentType: 'image/jpeg', size: 100 } }),
    ).rejects.toThrow('Nome de pasta inválido');
    expect(create).not.toHaveBeenCalled();
    expect(getSignedUrl).not.toHaveBeenCalled();
  });

  it('persists a normalized empty folder independently of files', async () => {
    const updateOne = vi
      .fn()
      .mockReturnValue({ exec: vi.fn().mockResolvedValue({}) });
    const service = new FilesService(
      {} as Model<Files>,
      { updateOne } as unknown as Model<Folders>,
    );
    expect(await service.createFolder('userId', ' /Viagens//Praia/ ')).toEqual({
      path: 'Viagens/Praia',
    });
    expect(updateOne).toHaveBeenCalledWith(
      { userId: 'userId', pathName: 'Viagens/Praia' },
      { $setOnInsert: { userId: 'userId', pathName: 'Viagens/Praia' } },
      { upsert: true },
    );
  });

  it('lists saved empty folders and existing file folders without duplicates', async () => {
    const distinct = vi.fn().mockReturnValue({
      exec: vi.fn().mockResolvedValue(['', 'Viagens', 'Antigas']),
    });
    const find = vi.fn().mockReturnValue({
      select: () => ({
        lean: () => ({
          exec: vi
            .fn()
            .mockResolvedValue([
              { pathName: 'Viagens' },
              { pathName: 'Família' },
            ]),
        }),
      }),
    });
    const service = new FilesService(
      { distinct } as unknown as Model<Files>,
      { find } as unknown as Model<Folders>,
    );
    expect(await service.listFolders('userId')).toEqual([
      'Antigas',
      'Família',
      'Viagens',
    ]);
    expect(find).toHaveBeenCalledWith({ userId: 'userId' });
    expect(distinct).toHaveBeenCalledWith('pathName', { userId: 'userId' });
  });

  it('accepts concurrent creation without masking database failures', async () => {
    const exec = vi
      .fn()
      .mockRejectedValueOnce({ code: 11000 })
      .mockRejectedValueOnce(new Error('Database unavailable'));
    const service = new FilesService(
      {} as Model<Files>,
      { updateOne: () => ({ exec }) } as unknown as Model<Folders>,
    );
    await expect(service.createFolder('userId', 'Viagens')).resolves.toEqual({
      path: 'Viagens',
    });
    await expect(service.createFolder('userId', 'Viagens')).rejects.toThrow(
      'Database unavailable',
    );
  });
});

it('returns readiness from Mongo without creating a signed original URL', async () => {
  vi.clearAllMocks();
  const findOne = vi.fn().mockReturnValue({
    select: () => ({
      lean: () => ({
        exec: async () => ({
          objectId: 'id',
          status: 'READY',
          pathName: 'Viagens',
          thumbnailKey: 'thumb.webp',
        }),
      }),
    }),
  });
  const service = new FilesService(
    { findOne } as unknown as Model<Files>,
    {} as Model<Folders>,
  );
  expect(await service.getStatus('userId', 'id')).toEqual({
    objectId: 'id',
    pathName: 'Viagens',
    status: 'READY',
    ready: true,
    processingError: undefined,
  });
  expect(findOne).toHaveBeenCalledWith({ userId: 'userId', objectId: 'id' });
  expect(getSignedUrl).not.toHaveBeenCalled();
});

it('persists all ancestors before creating the leaf folder', async () => {
  const updateOne = vi
    .fn()
    .mockReturnValue({ exec: vi.fn().mockResolvedValue({}) });
  const service = new FilesService(
    {} as Model<Files>,
    { updateOne } as unknown as Model<Folders>,
  );
  await service.createFolder('userId', 'Viagens/Praia/2026');
  expect(updateOne.mock.calls.map((call) => call[0])).toEqual([
    { userId: 'userId', pathName: 'Viagens' },
    { userId: 'userId', pathName: 'Viagens/Praia' },
    { userId: 'userId', pathName: 'Viagens/Praia/2026' },
  ]);
});
it('exposes ancestors for existing nested files without rewriting records', async () => {
  const distinct = vi
    .fn()
    .mockReturnValue({ exec: async () => ['Viagens/Praia/2026'] });
  const find = vi
    .fn()
    .mockReturnValue({
      select: () => ({ lean: () => ({ exec: async () => [] }) }),
    });
  const updateOne = vi.fn();
  const service = new FilesService(
    { distinct } as unknown as Model<Files>,
    { find, updateOne } as unknown as Model<Folders>,
  );
  expect(await service.listFolders('userId')).toEqual([
    'Viagens',
    'Viagens/Praia',
    'Viagens/Praia/2026',
  ]);
  expect(updateOne).not.toHaveBeenCalled();
});

describe('File renaming', () => {
  it.each([undefined, null, 42, {}, [], '', '   ', '.', '..', 'a/b.jpg', 'a\\b.jpg', 'a\nb.jpg', 'a\u0000.jpg', 'a\u007f.jpg', 'x'.repeat(256)])('rejects invalid name %j before accessing the database', async (name) => {
    const findOne = vi.fn();
    const service = new FilesService({ findOne } as unknown as Model<Files>, {} as Model<Folders>);
    await expect(service.changeObjectFileName('userId', 'id', name)).rejects.toMatchObject({ status: 400 });
    expect(findOne).not.toHaveBeenCalled();
  });

  it.each(['Férias em família.mp4', 'x'.repeat(255)])('saves a trimmed name without changing storage keys: %s', async (name) => {
    const file = { objectId: 'id', originalName: 'old.mp4', status: 'READY', originalKey: 'originals/userId/Recentes/id', thumbnailKey: 'thumbnails/userId/Recentes/id.webp', save: vi.fn().mockResolvedValue(undefined) };
    const findOne = vi.fn().mockReturnValue({ exec: vi.fn().mockResolvedValue(file) });
    const service = new FilesService({ findOne } as unknown as Model<Files>, {} as Model<Folders>);
    await expect(service.changeObjectFileName('userId', 'id', ` ${name} `)).resolves.toEqual({ objectId: 'id', name });
    expect(findOne).toHaveBeenCalledWith({ userId: 'userId', objectId: 'id' });
    expect(file.originalName).toBe(name);
    expect(file.originalKey).toBe('originals/userId/Recentes/id');
    expect(file.thumbnailKey).toBe('thumbnails/userId/Recentes/id.webp');
    expect(file.save).toHaveBeenCalledOnce();
  });
});

describe('Recoverable deletion', () => {
  function setup(file: unknown = { originalKey: 'original', thumbnailKey: 'thumb' }) {
    const remove = vi.fn().mockResolvedValue({ deletedCount: 1 });
    const claim = vi.fn().mockResolvedValue(file);
    const findOne = vi.fn().mockReturnValue({ exec: vi.fn().mockResolvedValue({ status: 'PROCESSING' }) });
    const findOneAndUpdate = vi.fn().mockReturnValue({ exec: claim });
    const service = new FilesService({ findOneAndUpdate, findOne, deleteOne: vi.fn().mockReturnValue({ exec: remove }) } as unknown as Model<Files>, {} as Model<Folders>);
    const send = vi.spyOn(service['client'], 'send').mockResolvedValue({} as never);
    return { service, send, remove, claim, findOne, findOneAndUpdate };
  }
  it('requires a deleting file with the worker lease before deleting both keys', async () => {
    const { service, send, remove, findOneAndUpdate } = setup();
    await service.deleteObject('userId', 'id', 'lease');
    expect(findOneAndUpdate).toHaveBeenCalledWith({ userId: 'userId', objectId: 'id', status: 'DELETING', purgeLeaseId: 'lease' }, { $set: { status: 'DELETING' } }, { returnDocument: 'after' });
    expect(send.mock.calls.map(([command]) => (command as PutObjectCommand).input.Key)).toEqual(['original', 'thumb']);
    expect(remove).toHaveBeenCalledOnce();
    expect(remove.mock.invocationCallOrder[0]).toBeGreaterThan(send.mock.invocationCallOrder[1]);
  });
  it('rejects processing files without touching S3', async () => {
    const { service, send, remove } = setup(null);
    await expect(service.deleteObject('userId', 'id', 'lease')).rejects.toMatchObject({ status: 409 });
    expect(send).not.toHaveBeenCalled();
    expect(remove).not.toHaveBeenCalled();
  });
  it('returns 404 for missing or other-user files', async () => {
    const { service, findOne, send } = setup(null);
    findOne.mockReturnValue({ exec: vi.fn().mockResolvedValue(null) });
    await expect(service.deleteObject('userId', 'id', 'lease')).rejects.toMatchObject({ status: 404 });
    expect(send).not.toHaveBeenCalled();
  });
  it.each([1, 2])('keeps metadata if S3 deletion %s fails and permits a retry', async (failure) => {
    const { service, send, remove } = setup();
    if (failure === 2) send.mockResolvedValueOnce({} as never);
    send.mockRejectedValueOnce(new Error('S3 unavailable'));
    await expect(service.deleteObject('userId', 'id', 'lease')).rejects.toMatchObject({ status: 503 });
    expect(remove).not.toHaveBeenCalled();
    await service.deleteObject('userId', 'id', 'lease');
    expect(remove).toHaveBeenCalledOnce();
  });
  it('permits retry when Mongo deletion fails after S3 succeeds', async () => {
    const { service, remove } = setup();
    remove.mockRejectedValueOnce(new Error('Mongo unavailable'));
    await expect(service.deleteObject('userId', 'id', 'lease')).rejects.toMatchObject({ status: 503 });
    await service.deleteObject('userId', 'id', 'lease');
    expect(remove).toHaveBeenCalledTimes(2);
  });
  it('does not report completion after losing the cleanup lease', async () => {
    const { service, remove } = setup();
    remove.mockResolvedValueOnce({ deletedCount: 0 });
    await expect(service.deleteObject('userId', 'id', 'old-lease')).rejects.toMatchObject({ status: 503 });
  });
  it('reports S3 access denial and records the failed stage', async () => {
    const { service, send, remove } = setup();
    const log = vi.spyOn(service['logger'], 'error');
    send.mockRejectedValueOnce(Object.assign(new Error('Access denied'), { name: 'AccessDenied', $metadata: { httpStatusCode: 403, requestId: 'request-id' } }));
    await expect(service.deleteObject('userId', 'id', 'lease')).rejects.toThrow('s3:DeleteObject');
    expect(log).toHaveBeenCalledWith(expect.objectContaining({ stage: 'original no S3', errorName: 'AccessDenied', httpStatusCode: 403, requestId: 'request-id' }));
    expect(remove).not.toHaveBeenCalled();
  });
  it('does not touch S3 if marking DELETING fails', async () => {
    const { service, claim, send } = setup();
    claim.mockRejectedValueOnce(new Error('Mongo unavailable'));
    await expect(service.deleteObject('userId', 'id', 'lease')).rejects.toThrow('Mongo unavailable');
    expect(send).not.toHaveBeenCalled();
  });
});

describe('Persistent desktop upload tickets', () => {
  const file = { originalName: 'photo.jpg', contentType: 'image/jpeg', size: 10 };
  function folders() { return { updateOne: vi.fn().mockReturnValue({exec:vi.fn().mockResolvedValue({})}) } as unknown as Model<Folders>; }
  beforeEach(()=>vi.clearAllMocks());
  it('rejects 21 tickets and malformed batches before work',async()=>{
    const service=new FilesService({} as Model<Files>,folders());
    const send=vi.spyOn(service,'sendObject');
    await expect(service.sendObjects('owner',{files:Array.from({length:21},()=>file)})).rejects.toMatchObject({status:400});
    await expect(service.sendObjects('owner',{files:null as never})).rejects.toMatchObject({status:400});
    expect(send).not.toHaveBeenCalled();
  });
  it('accepts exactly twenty and preserves independent ticket failures',async()=>{
    const service=new FilesService({create:vi.fn().mockResolvedValue({})} as unknown as Model<Files>,folders());
    const result=await service.sendObjects('owner',{files:[...Array.from({length:19},()=>file),{...file,size:-1}]});
    expect(result).toHaveLength(20);
    expect(result.filter(r=>'error' in r)).toHaveLength(1);
    expect(result[19]).toMatchObject({error:{status:400}});
  });
  it('reuses an intent and never reuploads an existing or READY original',async()=>{
    let record:Record<string,unknown>|null=null;
    const create=vi.fn().mockImplementation(async value=>{record=value;return value;});
    const findOne=vi.fn().mockImplementation(()=>({lean:()=>({exec:async()=>record})}));
    const service=new FilesService({create,findOne} as unknown as Model<Files>,folders());
    const head=vi.spyOn(service['client'],'send').mockResolvedValue({ContentLength:10} as never);
    const dto={path:'Recentes',file:{...file,importId:'stable-intent'}};
    const first=await service.sendObject('owner',dto);
    const resumed=await service.sendObject('owner',dto);
    expect(resumed).toMatchObject({objectId:first.objectId,status:'PROCESSING',url:''});
    expect(create).toHaveBeenCalledOnce();expect(head).toHaveBeenCalledOnce();
    record={...record!,status:'READY'};
    expect(await service.sendObject('owner',dto)).toMatchObject({status:'READY',url:''});
    expect(head).toHaveBeenCalledOnce();
    await expect(service.sendObject('owner',{...dto,file:{...dto.file,size:11}})).rejects.toMatchObject({status:409});
    expect(findOne).toHaveBeenCalledWith({userId:'owner',objectId:first.objectId});
  });
  it('scopes a stable import id to its authenticated owner',async()=>{
    const service=new FilesService({create:vi.fn().mockResolvedValue({}),findOne:vi.fn().mockReturnValue({lean:()=>({exec:async()=>null})})} as unknown as Model<Files>,folders());
    const dto={file:{...file,importId:'same-intent'}};
    expect((await service.sendObject('owner-a',dto)).objectId).not.toBe((await service.sendObject('owner-b',dto)).objectId);
  });
});
