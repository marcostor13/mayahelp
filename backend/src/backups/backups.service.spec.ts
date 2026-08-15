import { BadRequestException } from '@nestjs/common';
import { BackupsService } from './backups.service';
import { DatabaseConnectionType } from './schemas/database-connection.schema';
import { BackupFrequency } from './lima-schedule';

/**
 * Los tests que importan acá son los que no se pueden probar a mano sin una base real:
 * la validación del formulario, que el secreto nunca salga por la API y —sobre todo— que
 * la retención borre el backup más viejo en R2 y no solo la fila.
 */
describe('BackupsService', () => {
  const encryption = {
    encrypt: (value: string) => `enc(${value})`,
    decrypt: (value: string) => value.replace(/^enc\((.*)\)$/, '$1'),
  };

  const storage = {
    assertConfigured: jest.fn(),
    upload: jest.fn(),
    remove: jest.fn(),
    downloadUrl: jest.fn(),
  };

  const config = { get: () => undefined };

  /**
   * Imita un subdocumento de mongoose: los valores se leen por getters del prototipo, así
   * que un spread del objeto devuelve internos y ningún campo. Es exactamente lo que hace
   * fallar a un merge ingenuo, y por eso el servicio pasa por `toObject()`.
   */
  const subdocument = <T extends object>(values: T): T => {
    const prototype: Record<string, unknown> = {
      toObject: () => ({ ...values }),
    };
    const entries = Object.entries(values) as [string, unknown][];
    for (const [key, value] of entries) {
      Object.defineProperty(prototype, key, {
        get: () => value,
        enumerable: false,
      });
    }
    const document = Object.create(prototype) as Record<string, unknown>;
    document._doc = values;
    return document as unknown as T;
  };

  /** Documento de mongoose lo bastante real para lo que toca el servicio. */
  const connectionDoc = (over: Record<string, unknown> = {}) => {
    const secrets: Record<string, unknown> = {
      secretUri: 'enc(mongodb+srv://u:p@cluster.mongodb.net/mayahelp)',
      ...((over.secrets as Record<string, unknown>) ?? {}),
    };
    delete over.secrets;
    const base = {
      _id: { toString: () => 'conn1' },
      name: 'Producción',
      type: DatabaseConnectionType.ATLAS,
      database: 'mayahelp',
      isActive: true,
      retentionCount: 3,
      schedule: subdocument({
        frequency: BackupFrequency.DAILY,
        hour: 3,
        minute: 0,
        dayOfWeek: 1,
        dayOfMonth: 1,
      }),
      ...over,
    };
    return {
      ...base,
      get: (field: string) => secrets[field],
      toObject: () => ({ ...base, ...secrets }),
      save: jest.fn(),
      markModified: jest.fn(),
    };
  };

  /** Tipado para poder leer los argumentos con los que se llamó a `create`. */
  type CreateMock = jest.Mock<Promise<unknown>, [Record<string, unknown>]>;

  let connectionModel: Record<string, jest.Mock> & { create: CreateMock };
  let backupModel: Record<string, jest.Mock>;
  let service: BackupsService;

  beforeEach(() => {
    jest.clearAllMocks();
    connectionModel = {
      create: jest.fn((doc: Record<string, unknown>) =>
        Promise.resolve(connectionDoc(doc)),
      ) as CreateMock,
      findById: jest.fn(),
      findByIdAndUpdate: jest.fn(() => ({ exec: () => Promise.resolve() })),
      findByIdAndDelete: jest.fn(() => ({ exec: () => Promise.resolve() })),
      find: jest.fn(),
    };
    backupModel = {
      create: jest.fn(),
      find: jest.fn(),
      findByIdAndDelete: jest.fn(() => ({ exec: () => Promise.resolve() })),
      deleteMany: jest.fn(() => ({ exec: () => Promise.resolve() })),
      findById: jest.fn(),
    };
    service = new BackupsService(
      connectionModel as never,
      backupModel as never,
      encryption as never,
      storage as never,
      config as never,
    );
  });

  describe('alta', () => {
    it('cifra la URI y no la devuelve, solo avisa que está cargada', async () => {
      const result = await service.create(
        {
          name: 'Producción',
          type: DatabaseConnectionType.ATLAS,
          uri: 'mongodb+srv://u:p@cluster.mongodb.net/mayahelp',
        },
        'user1',
      );

      const saved = connectionModel.create.mock.calls[0][0];
      expect(saved.secretUri).toBe(
        'enc(mongodb+srv://u:p@cluster.mongodb.net/mayahelp)',
      );
      expect(saved.uri).toBeUndefined();
      expect(result).not.toHaveProperty('secretUri');
      expect(result.hasUri).toBe(true);
    });

    it('deduce la base del nombre que trae la URI', async () => {
      await service.create(
        {
          name: 'Producción',
          type: DatabaseConnectionType.ATLAS,
          uri: 'mongodb+srv://u:p@cluster.mongodb.net/registros?w=majority',
        },
        'user1',
      );
      expect(connectionModel.create.mock.calls[0][0].database).toBe(
        'registros',
      );
    });

    it('programa la primera corrida al crear y la deja sin agendar si está inactiva', async () => {
      await service.create(
        {
          name: 'Producción',
          type: DatabaseConnectionType.ATLAS,
          uri: 'mongodb+srv://u:p@c.mongodb.net/db',
        },
        'user1',
      );
      expect(connectionModel.create.mock.calls[0][0].nextRunAt).toBeInstanceOf(
        Date,
      );

      await service.create(
        {
          name: 'Pausada',
          type: DatabaseConnectionType.ATLAS,
          uri: 'mongodb+srv://u:p@c.mongodb.net/db',
          isActive: false,
        },
        'user1',
      );
      expect(connectionModel.create.mock.calls[1][0].nextRunAt).toBeNull();
    });

    it('rechaza una URI que no es de mongo', async () => {
      await expect(
        service.create(
          {
            name: 'Mala',
            type: DatabaseConnectionType.ATLAS,
            uri: 'postgres://u:p@host/db',
          },
          'user1',
        ),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('exige base cuando la URI de Atlas no la nombra', async () => {
      await expect(
        service.create(
          {
            name: 'Sin base',
            type: DatabaseConnectionType.ATLAS,
            uri: 'mongodb+srv://u:p@cluster.mongodb.net',
          },
          'user1',
        ),
      ).rejects.toThrow(/qué base respaldar/);
    });

    it('exige credencial en una conexión por SSH', async () => {
      await expect(
        service.create(
          {
            name: 'VPS',
            type: DatabaseConnectionType.SSH,
            sshHost: '1.2.3.4',
            sshUsername: 'ubuntu',
            database: 'mayahelp',
          },
          'user1',
        ),
      ).rejects.toThrow(/contraseña o una clave privada/);
    });

    it('enumera los datos que faltan de la conexión SSH', async () => {
      await expect(
        service.create(
          {
            name: 'VPS',
            type: DatabaseConnectionType.SSH,
            sshHost: '1.2.3.4',
            sshPassword: 'x',
          },
          'user1',
        ),
      ).rejects.toThrow(/usuario SSH, base de datos/);
    });
  });

  describe('edición', () => {
    const editing = () => {
      const document = connectionDoc();
      connectionModel.findById.mockReturnValue({
        exec: () => Promise.resolve(document),
      });
      return document;
    };

    it('un cambio parcial de programación no resetea el resto', async () => {
      const document = editing();
      await service.update('conn1', { schedule: { hour: 22 } });

      expect(document.schedule).toEqual({
        frequency: BackupFrequency.DAILY,
        hour: 22,
        minute: 0,
        dayOfWeek: 1,
        dayOfMonth: 1,
      });
    });

    it('reprograma la próxima corrida al mover la hora', async () => {
      const document = editing();
      await service.update('conn1', { schedule: { hour: 22 } });
      const scheduled = document.nextRunAt as Date;
      expect(scheduled).toBeInstanceOf(Date);
      expect(scheduled.getTime()).toBeGreaterThan(Date.now());
    });

    it('desagenda al pausar la conexión', async () => {
      const document = editing();
      await service.update('conn1', { isActive: false });
      expect(document.nextRunAt).toBeNull();
    });

    it('un secreto vacío no llega al documento como cifrado', async () => {
      const document = editing();
      await service.update('conn1', { name: 'Otro nombre' });
      expect(document.secretUri).toBeUndefined();
      expect(document.name).toBe('Otro nombre');
    });
  });

  describe('retención', () => {
    /** Deja pasar el dump y la subida para poder mirar qué se borra después. */
    const stubRun = (backups: { _id: string; storageKey?: string }[]) => {
      const backupRow = {
        _id: 'new',
        save: jest.fn(),
        toObject: () => ({ _id: 'new' }),
      } as Record<string, unknown>;
      backupModel.create.mockResolvedValue(backupRow);
      backupModel.find.mockImplementation(
        (filter: Record<string, unknown>) => ({
          sort: () => ({
            select: () => ({
              exec: () =>
                Promise.resolve(filter.status === 'success' ? backups : []),
            }),
          }),
        }),
      );
      return backupRow;
    };

    it('conserva solo los últimos 3 y borra el más viejo de R2 y de la base', async () => {
      // Cuatro corridas buenas, de la más nueva a la más vieja.
      stubRun([
        { _id: 'b4', storageKey: 'backups/conn1/d.gz' },
        { _id: 'b3', storageKey: 'backups/conn1/c.gz' },
        { _id: 'b2', storageKey: 'backups/conn1/b.gz' },
        { _id: 'b1', storageKey: 'backups/conn1/a.gz' },
      ]);

      await service['applyRetention'](connectionDoc() as never);

      expect(storage.remove).toHaveBeenCalledTimes(1);
      expect(storage.remove).toHaveBeenCalledWith('backups/conn1/a.gz');
      expect(backupModel.findByIdAndDelete).toHaveBeenCalledWith('b1');
    });

    it('no borra nada mientras no se pase del tope', async () => {
      stubRun([
        { _id: 'b3', storageKey: 'c.gz' },
        { _id: 'b2', storageKey: 'b.gz' },
        { _id: 'b1', storageKey: 'a.gz' },
      ]);

      await service['applyRetention'](connectionDoc() as never);

      expect(storage.remove).not.toHaveBeenCalled();
      expect(backupModel.findByIdAndDelete).not.toHaveBeenCalled();
    });

    it('respeta el tope configurado en la conexión', async () => {
      stubRun([
        { _id: 'b3', storageKey: 'c.gz' },
        { _id: 'b2', storageKey: 'b.gz' },
        { _id: 'b1', storageKey: 'a.gz' },
      ]);

      await service['applyRetention'](
        connectionDoc({ retentionCount: 1 }) as never,
      );

      expect(storage.remove).toHaveBeenCalledTimes(2);
      expect(backupModel.findByIdAndDelete).toHaveBeenCalledWith('b2');
      expect(backupModel.findByIdAndDelete).toHaveBeenCalledWith('b1');
    });
  });

  describe('descarga', () => {
    it('falla con un mensaje claro si la corrida no dejó archivo', async () => {
      backupModel.findById.mockReturnValue({
        lean: () => ({
          exec: () => Promise.resolve({ _id: 'b1', storageKey: '' }),
        }),
      });
      await expect(service.downloadUrl('b1')).rejects.toThrow(
        /no tiene archivo/,
      );
    });

    it('devuelve el link firmado del objeto', async () => {
      backupModel.findById.mockReturnValue({
        lean: () => ({
          exec: () =>
            Promise.resolve({ _id: 'b1', storageKey: 'backups/conn1/a.gz' }),
        }),
      });
      storage.downloadUrl.mockResolvedValue('https://r2/signed');
      await expect(service.downloadUrl('b1')).resolves.toEqual({
        url: 'https://r2/signed',
      });
    });
  });

  describe('backup fallido', () => {
    it('registra el error en el historial en vez de tirar la excepción al scheduler', async () => {
      const backupRow = {
        _id: 'new',
        save: jest.fn(),
        toObject: () => ({ _id: 'new' }),
      } as Record<string, unknown>;
      backupModel.create.mockResolvedValue(backupRow);
      storage.assertConfigured.mockImplementation(() => {
        throw new Error('R2 no está configurada');
      });

      await expect(
        service.runBackup(connectionDoc() as never, 'manual' as never, null),
      ).resolves.toBeDefined();

      expect(backupRow.status).toBe('failed');
      expect(backupRow.error).toBe('R2 no está configurada');
      // Y la conexión queda reprogramada para la ventana siguiente.
      expect(connectionModel.findByIdAndUpdate).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ lastStatus: 'failed' }),
      );
    });
  });
});
