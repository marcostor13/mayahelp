import { ConfigService } from '@nestjs/config';
import { Model } from 'mongoose';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { AttachmentsService } from './attachments.service';
import { Attachment, AttachmentDocument } from './schemas/attachment.schema';

jest.mock('@aws-sdk/s3-request-presigner', () => ({
  getSignedUrl: jest
    .fn()
    .mockResolvedValue('https://cuenta.r2.cloudflarestorage.com/firmado?sig=x'),
}));

const R2_CONFIG: Record<string, string> = {
  'r2.accountId': 'cuenta',
  'r2.accessKeyId': 'key',
  'r2.secretAccessKey': 'secret',
  'r2.bucket': 'mayahelp-attachments',
  'r2.publicUrl': 'https://cdn.mayahelp.dev/',
};

interface Harness {
  service: AttachmentsService;
  created: Record<string, unknown>[];
  puts: Record<string, unknown>[];
}

function harness(overrides: Record<string, string | undefined> = {}): Harness {
  const created: Record<string, unknown>[] = [];
  const puts: Record<string, unknown>[] = [];

  const model = {
    create: (doc: Record<string, unknown>) => {
      created.push(doc);
      return Promise.resolve(doc as unknown as AttachmentDocument);
    },
  } as unknown as Model<AttachmentDocument>;

  const config = {
    get: (key: string) => (key in overrides ? overrides[key] : R2_CONFIG[key]),
  } as unknown as ConfigService;

  const service = new AttachmentsService(model, config);
  // El cliente S3 real no se usa en los tests: solo interesa qué se le pide subir.
  (
    service as unknown as { s3: { send: (input: unknown) => Promise<void> } }
  ).s3 = {
    send: (input: { input: Record<string, unknown> }) => {
      puts.push(input.input);
      return Promise.resolve();
    },
  };

  return { service, created, puts };
}

function file(originalname: string): Express.Multer.File {
  return {
    originalname,
    mimetype: 'image/png',
    size: 1024,
    buffer: Buffer.from('png'),
  } as Express.Multer.File;
}

describe('AttachmentsService.upload', () => {
  it('sanitises the storage key so the public link is usable in Markdown', async () => {
    const { service, created, puts } = harness();

    await service.upload('ticket1', file('Captura de pantalla ñ.png'), 'user1');

    const key = puts[0].Key as string;
    expect(key).toMatch(
      /^tickets\/ticket1\/[0-9a-f-]{36}-Captura-de-pantalla-n\.png$/,
    );
    // El nombre original se conserva para mostrarlo y para quien baje el archivo.
    expect(created[0].filename).toBe('Captura de pantalla ñ.png');
    expect(puts[0].ContentDisposition).toContain(
      "filename*=UTF-8''Captura%20de%20pantalla%20%C3%B1.png",
    );
    expect(created[0].url).toBe(`https://cdn.mayahelp.dev/${key}`);
  });

  it('stores the bucket url when there is no public domain configured', async () => {
    const { service, created } = harness({ 'r2.publicUrl': undefined });

    await service.upload('ticket1', file('captura.png'), 'user1');

    expect(created[0].url).toMatch(
      /^https:\/\/cuenta\.r2\.cloudflarestorage\.com\/mayahelp-attachments\/tickets\/ticket1\//,
    );
  });
});

describe('AttachmentsService.withDownloadUrls', () => {
  beforeEach(() => jest.clearAllMocks());

  function stored(overrides: Partial<Attachment> = {}): Attachment {
    return {
      filename: 'captura.png',
      kind: 'image',
      size: 2048,
      storageKey: 'tickets/ticket1/uuid-captura.png',
      url: 'https://cdn.mayahelp.dev/tickets/ticket1/uuid-captura.png',
      ...overrides,
    } as Attachment;
  }

  it('uses the public domain when the bucket has one', async () => {
    const { service } = harness();

    const [linked] = await service.withDownloadUrls([stored()]);

    expect(linked.downloadUrl).toBe(
      'https://cdn.mayahelp.dev/tickets/ticket1/uuid-captura.png',
    );
    expect(getSignedUrl).not.toHaveBeenCalled();
  });

  it('signs a temporary link when the bucket is not public', async () => {
    const { service } = harness({ 'r2.publicUrl': undefined });

    const [linked] = await service.withDownloadUrls([stored()]);

    expect(linked.downloadUrl).toContain('firmado?sig=x');
  });

  it('rebuilds the link from the storage key, fixing attachments saved with a broken url', async () => {
    const { service } = harness();

    const [linked] = await service.withDownloadUrls([
      stored({ url: '/tickets/ticket1/uuid-captura.png' }),
    ]);

    expect(linked.downloadUrl).toBe(
      'https://cdn.mayahelp.dev/tickets/ticket1/uuid-captura.png',
    );
  });
});
