import configuration from './configuration';

describe('configuration', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  it('acepta un solo origen', () => {
    process.env.CORS_ORIGIN = 'https://app.mayahelp.com';
    expect(configuration().corsOrigins).toEqual(['https://app.mayahelp.com']);
  });

  it('acepta varios orígenes separados por coma, con espacios y barra final', () => {
    process.env.CORS_ORIGIN =
      'https://app.mayahelp.com, https://www.mayahelp.com/ ,';
    expect(configuration().corsOrigins).toEqual([
      'https://app.mayahelp.com',
      'https://www.mayahelp.com',
    ]);
  });

  it('usa el default cuando CORS_ORIGIN no está definido', () => {
    delete process.env.CORS_ORIGIN;
    expect(configuration().corsOrigins).toEqual(['http://localhost:4200']);
  });

  it('deriva appUrl del primer origen', () => {
    delete process.env.APP_URL;
    process.env.CORS_ORIGIN =
      'https://app.mayahelp.com,https://www.mayahelp.com';
    expect(configuration().appUrl).toBe('https://app.mayahelp.com');
  });

  it('APP_URL tiene prioridad sobre CORS_ORIGIN', () => {
    process.env.APP_URL = 'https://app.mayahelp.com/';
    process.env.CORS_ORIGIN = 'https://www.mayahelp.com';
    expect(configuration().appUrl).toBe('https://app.mayahelp.com');
  });
});
