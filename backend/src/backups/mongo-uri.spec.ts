import {
  buildTunneledUri,
  databaseFromUri,
  isLikelyMongoUri,
  redactUri,
} from './mongo-uri';

describe('mongo-uri', () => {
  describe('buildTunneledUri', () => {
    it('siempre fuerza directConnection para no salir del túnel', () => {
      expect(buildTunneledUri({ localPort: 40123, database: 'mayahelp' })).toBe(
        'mongodb://127.0.0.1:40123/mayahelp?directConnection=true',
      );
    });

    it('agrega credenciales y authSource cuando hay usuario', () => {
      expect(
        buildTunneledUri({
          localPort: 40123,
          database: 'mayahelp',
          username: 'backup',
          password: 'secret',
          authDatabase: 'admin',
        }),
      ).toBe(
        'mongodb://backup:secret@127.0.0.1:40123/mayahelp?directConnection=true&authSource=admin',
      );
    });

    it('escapa los caracteres especiales de la contraseña', () => {
      const uri = buildTunneledUri({
        localPort: 1,
        database: 'db',
        username: 'us er',
        password: 'p@ss:w/rd?',
      });
      expect(uri).toContain('us%20er:p%40ss%3Aw%2Frd%3F@');
      expect(uri).toContain('authSource=admin');
    });
  });

  describe('databaseFromUri', () => {
    it('lee la base de una URI de Atlas', () => {
      expect(
        databaseFromUri(
          'mongodb+srv://u:p@cluster.mongodb.net/mayahelp?retryWrites=true',
        ),
      ).toBe('mayahelp');
    });

    it('devuelve null cuando la URI no nombra ninguna base', () => {
      expect(
        databaseFromUri('mongodb+srv://u:p@cluster.mongodb.net'),
      ).toBeNull();
      expect(
        databaseFromUri('mongodb+srv://u:p@cluster.mongodb.net/?w=majority'),
      ).toBeNull();
    });

    it('soporta varios hosts y el esquema sin srv', () => {
      expect(
        databaseFromUri('mongodb://a:1,b:2/registros?replicaSet=rs0'),
      ).toBe('registros');
    });
  });

  it('oculta las credenciales al redactar', () => {
    expect(redactUri('mongodb+srv://user:p%40ss@cluster.mongodb.net/db')).toBe(
      'mongodb+srv://***@cluster.mongodb.net/db',
    );
    expect(redactUri('mongodb://127.0.0.1:27017/db')).toBe(
      'mongodb://127.0.0.1:27017/db',
    );
  });

  it('reconoce una URI de mongo a simple vista', () => {
    expect(isLikelyMongoUri('mongodb+srv://x/y')).toBe(true);
    expect(isLikelyMongoUri('mongodb://x/y')).toBe(true);
    expect(isLikelyMongoUri('postgres://x/y')).toBe(false);
    expect(isLikelyMongoUri('  ')).toBe(false);
  });
});
