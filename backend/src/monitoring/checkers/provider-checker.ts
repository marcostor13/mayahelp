import { ConnectionStatus } from '../schemas/project-connection.schema';
import { CheckMetrics } from '../schemas/monitor-check.schema';
import { CheckResult } from './http-checker';

export interface ProviderCheckInput {
  token: string;
  serviceId: string;
  /** Only for self-hosted Coolify. */
  baseUrl?: string;
  timeoutMs?: number;
}

const DEFAULT_TIMEOUT_MS = 15_000;

async function getJson(
  url: string,
  token: string,
  timeoutMs: number,
): Promise<{ ok: boolean; status: number; body: unknown }> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/json',
      },
      signal: controller.signal,
    });
    const text = await response.text();
    let body: unknown = text;
    try {
      body = JSON.parse(text);
    } catch {
      // Non-JSON payloads (HTML error pages) are surfaced as-is.
    }
    return { ok: response.ok, status: response.status, body };
  } finally {
    clearTimeout(timer);
  }
}

function failed(error: string, metrics: CheckMetrics = {}): CheckResult {
  return { status: ConnectionStatus.DOWN, latencyMs: null, metrics, error };
}

/**
 * Render: service state plus the outcome of the last deploy.
 * A suspended service or a failed deploy is reported as down/degraded.
 */
export async function checkRender(
  input: ProviderCheckInput,
): Promise<CheckResult> {
  const timeoutMs = input.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const startedAt = Date.now();
  try {
    const service = await getJson(
      `https://api.render.com/v1/services/${input.serviceId}`,
      input.token,
      timeoutMs,
    );
    if (!service.ok) {
      return failed(
        `Render respondió ${service.status} al consultar el servicio`,
        { providerStatus: service.status },
      );
    }
    const data = service.body as {
      name?: string;
      suspended?: string;
      serviceDetails?: { url?: string };
      type?: string;
    };

    const deploys = await getJson(
      `https://api.render.com/v1/services/${input.serviceId}/deploys?limit=1`,
      input.token,
      timeoutMs,
    );
    const lastDeploy = Array.isArray(deploys.body)
      ? ((deploys.body[0] as { deploy?: Record<string, unknown> })?.deploy ??
        null)
      : null;

    const metrics: CheckMetrics = {
      provider: 'render',
      serviceName: data.name ?? '',
      serviceType: data.type ?? '',
      serviceUrl: data.serviceDetails?.url ?? '',
      suspended: data.suspended === 'suspended',
      deployStatus: (lastDeploy?.status as string) ?? '',
      deployFinishedAt: (lastDeploy?.finishedAt as string) ?? '',
      deployCommit: ((lastDeploy?.commit as { id?: string })?.id ?? '')
        .toString()
        .slice(0, 8),
      latencyMs: Date.now() - startedAt,
    };

    if (metrics.suspended) {
      return {
        status: ConnectionStatus.DOWN,
        latencyMs: Date.now() - startedAt,
        metrics,
        error: 'El servicio está suspendido en Render',
      };
    }
    const deployStatus = String(metrics.deployStatus);
    if (['build_failed', 'update_failed', 'canceled'].includes(deployStatus)) {
      return {
        status: ConnectionStatus.DEGRADED,
        latencyMs: Date.now() - startedAt,
        metrics,
        error: `El último deploy terminó en ${deployStatus}`,
      };
    }
    return {
      status: ConnectionStatus.UP,
      latencyMs: Date.now() - startedAt,
      metrics,
    };
  } catch (error) {
    return failed(`No se pudo consultar Render: ${(error as Error).message}`);
  }
}

/** Netlify: site state and the published deploy. */
export async function checkNetlify(
  input: ProviderCheckInput,
): Promise<CheckResult> {
  const timeoutMs = input.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const startedAt = Date.now();
  try {
    const site = await getJson(
      `https://api.netlify.com/api/v1/sites/${input.serviceId}`,
      input.token,
      timeoutMs,
    );
    if (!site.ok) {
      return failed(`Netlify respondió ${site.status} al consultar el sitio`, {
        providerStatus: site.status,
      });
    }
    const data = site.body as {
      name?: string;
      url?: string;
      ssl_url?: string;
      state?: string;
      published_deploy?: {
        state?: string;
        error_message?: string;
        published_at?: string;
        branch?: string;
      };
      capabilities?: unknown;
    };
    const deploy = data.published_deploy ?? {};
    const metrics: CheckMetrics = {
      provider: 'netlify',
      siteName: data.name ?? '',
      siteUrl: data.ssl_url ?? data.url ?? '',
      siteState: data.state ?? '',
      deployStatus: deploy.state ?? '',
      deployBranch: deploy.branch ?? '',
      deployPublishedAt: deploy.published_at ?? '',
      latencyMs: Date.now() - startedAt,
    };

    if (data.state && data.state !== 'current') {
      return {
        status: ConnectionStatus.DEGRADED,
        latencyMs: Date.now() - startedAt,
        metrics,
        error: `El sitio está en estado "${data.state}"`,
      };
    }
    if (deploy.state === 'error') {
      return {
        status: ConnectionStatus.DEGRADED,
        latencyMs: Date.now() - startedAt,
        metrics,
        error: deploy.error_message ?? 'El último deploy falló',
      };
    }
    return {
      status: ConnectionStatus.UP,
      latencyMs: Date.now() - startedAt,
      metrics,
    };
  } catch (error) {
    return failed(`No se pudo consultar Netlify: ${(error as Error).message}`);
  }
}

/** Coolify (self-hosted): application status through the instance API. */
export async function checkCoolify(
  input: ProviderCheckInput,
): Promise<CheckResult> {
  const timeoutMs = input.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const startedAt = Date.now();
  const base = (input.baseUrl ?? '').replace(/\/$/, '');
  if (!base) {
    return failed('Falta la URL de la instancia de Coolify');
  }
  try {
    const app = await getJson(
      `${base}/api/v1/applications/${input.serviceId}`,
      input.token,
      timeoutMs,
    );
    if (!app.ok) {
      return failed(
        `Coolify respondió ${app.status} al consultar la aplicación`,
        {
          providerStatus: app.status,
        },
      );
    }
    const data = app.body as {
      name?: string;
      status?: string;
      fqdn?: string;
      git_branch?: string;
      last_online_at?: string;
    };
    const status = (data.status ?? '').toLowerCase();
    const metrics: CheckMetrics = {
      provider: 'coolify',
      applicationName: data.name ?? '',
      applicationStatus: data.status ?? '',
      fqdn: data.fqdn ?? '',
      branch: data.git_branch ?? '',
      lastOnlineAt: data.last_online_at ?? '',
      latencyMs: Date.now() - startedAt,
    };

    // Coolify reports states like "running:healthy", "exited:unhealthy", "degraded".
    if (status.startsWith('running')) {
      return status.includes('unhealthy')
        ? {
            status: ConnectionStatus.DEGRADED,
            latencyMs: Date.now() - startedAt,
            metrics,
            error: 'La aplicación corre pero el healthcheck falla',
          }
        : {
            status: ConnectionStatus.UP,
            latencyMs: Date.now() - startedAt,
            metrics,
          };
    }
    return {
      status: ConnectionStatus.DOWN,
      latencyMs: Date.now() - startedAt,
      metrics,
      error: `La aplicación está en estado "${data.status ?? 'desconocido'}"`,
    };
  } catch (error) {
    return failed(`No se pudo consultar Coolify: ${(error as Error).message}`);
  }
}
