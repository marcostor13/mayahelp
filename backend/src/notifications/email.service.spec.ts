import { ConfigService } from '@nestjs/config';
import { EmailService, senderDomain } from './email.service';

function buildService(emailFrom: string, apiKey: string | undefined = 're_x') {
  const config = {
    get: (key: string) => (key === 'resend.apiKey' ? apiKey : emailFrom),
  } as unknown as ConfigService;
  return new EmailService(config);
}

function mockFetch(status: number, body: unknown) {
  global.fetch = jest.fn().mockResolvedValue({
    ok: status < 400,
    status,
    text: () => Promise.resolve(JSON.stringify(body)),
  });
}

describe('senderDomain', () => {
  it('reads the domain with or without a display name', () => {
    expect(senderDomain('MayaHelp <avisos@Mail.Ejemplo.com>')).toBe(
      'mail.ejemplo.com',
    );
    expect(senderDomain('avisos@ejemplo.com')).toBe('ejemplo.com');
    expect(senderDomain('MayaHelp')).toBeUndefined();
  });
});

describe('EmailService.checkSender', () => {
  const originalFetch = global.fetch;
  afterEach(() => {
    global.fetch = originalFetch;
  });

  it('fails without an API key, without calling Resend', async () => {
    global.fetch = jest.fn();
    const result = await buildService('a@ejemplo.com', '').checkSender();
    expect(result.ok).toBe(false);
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('accepts a verified domain and its subdomains', async () => {
    mockFetch(200, { data: [{ name: 'ejemplo.com', status: 'verified' }] });
    expect(await buildService('a@ejemplo.com').checkSender()).toEqual({
      ok: true,
    });
    expect(await buildService('a@mail.ejemplo.com').checkSender()).toEqual({
      ok: true,
    });
  });

  it('names the domains available when the sender one is missing', async () => {
    mockFetch(200, { data: [{ name: 'otro.com', status: 'verified' }] });
    const result = await buildService('a@ejemplo.com').checkSender();
    expect(result.ok).toBe(false);
    expect(result.error).toContain('ejemplo.com');
    expect(result.error).toContain('otro.com');
  });

  it('rejects a domain that is still pending', async () => {
    mockFetch(200, { data: [{ name: 'ejemplo.com', status: 'pending' }] });
    const result = await buildService('a@ejemplo.com').checkSender();
    expect(result.ok).toBe(false);
    expect(result.error).toContain('pending');
  });

  it('does not flag a send-only key, which cannot list domains', async () => {
    mockFetch(401, { name: 'restricted_api_key', message: 'Send only.' });
    expect(await buildService('a@ejemplo.com').checkSender()).toEqual({
      ok: true,
    });
  });

  it('surfaces the message Resend gives for a bad key', async () => {
    mockFetch(400, { name: 'validation_error', message: 'API key is invalid' });
    const result = await buildService('a@ejemplo.com').checkSender();
    expect(result).toEqual({
      ok: false,
      error: 'Resend (400): API key is invalid',
    });
  });
});
