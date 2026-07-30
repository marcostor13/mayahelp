import { Injectable, Logger } from '@nestjs/common';

export interface RepoTarget {
  owner: string;
  repo: string;
  token: string;
}

export interface PullRequestInfo {
  number: number;
  url: string;
  branch: string;
  state: 'open' | 'closed';
  merged: boolean;
  draft: boolean;
  /** GitHub's own verdict: 'clean' means every required check passed. */
  mergeableState: string | null;
  headSha: string;
}

export interface ChecksSummary {
  total: number;
  passed: number;
  failed: number;
  pending: number;
}

const API = 'https://api.github.com';
const TIMEOUT_MS = 15_000;

/**
 * The slice of the GitHub REST API this feature needs: fire the workflow, find the
 * pull request it opened, read its checks and merge it.
 */
@Injectable()
export class GithubService {
  private readonly logger = new Logger(GithubService.name);

  /** Fires `repository_dispatch`; GitHub answers 204 with no body on success. */
  async dispatch(
    target: RepoTarget,
    eventType: string,
    payload: Record<string, unknown>,
  ): Promise<void> {
    await this.request(
      target,
      'POST',
      `/repos/${target.owner}/${target.repo}/dispatches`,
      {
        event_type: eventType,
        client_payload: payload,
      },
    );
  }

  /** Verifies the token can actually reach the repository before we store it. */
  async checkAccess(
    target: RepoTarget,
  ): Promise<{ defaultBranch: string; private: boolean }> {
    const repo = await this.request<{
      default_branch: string;
      private: boolean;
    }>(target, 'GET', `/repos/${target.owner}/${target.repo}`);
    return { defaultBranch: repo.default_branch, private: repo.private };
  }

  /**
   * The pull request Claude Code opened for this run. Claude picks the branch name
   * itself, so runs are identified by the unique `branch_prefix` we hand the action.
   */
  async findPullRequestByBranchPrefix(
    target: RepoTarget,
    prefix: string,
  ): Promise<PullRequestInfo | null> {
    const pulls = await this.request<RawPull[]>(
      target,
      'GET',
      `/repos/${target.owner}/${target.repo}/pulls?state=all&sort=created&direction=desc&per_page=50`,
    );
    const match = pulls.find((pull) => pull.head?.ref?.startsWith(prefix));
    return match ? toPullRequest(match) : null;
  }

  async getPullRequest(
    target: RepoTarget,
    number: number,
  ): Promise<PullRequestInfo> {
    const pull = await this.request<RawPull>(
      target,
      'GET',
      `/repos/${target.owner}/${target.repo}/pulls/${number}`,
    );
    return toPullRequest(pull);
  }

  /**
   * Combines check runs and commit statuses — a repo can use either, and a PR that
   * only has legacy statuses would otherwise look like it had no checks at all.
   */
  async getChecks(target: RepoTarget, sha: string): Promise<ChecksSummary> {
    const [checks, statuses] = await Promise.all([
      this.request<{ check_runs: RawCheckRun[] }>(
        target,
        'GET',
        `/repos/${target.owner}/${target.repo}/commits/${sha}/check-runs?per_page=100`,
      ),
      this.request<{ state: string; statuses: { state: string }[] }>(
        target,
        'GET',
        `/repos/${target.owner}/${target.repo}/commits/${sha}/status`,
      ),
    ]);

    const summary: ChecksSummary = {
      total: 0,
      passed: 0,
      failed: 0,
      pending: 0,
    };
    for (const run of checks.check_runs ?? []) {
      summary.total += 1;
      if (run.status !== 'completed') summary.pending += 1;
      else if (['success', 'neutral', 'skipped'].includes(run.conclusion ?? ''))
        summary.passed += 1;
      else summary.failed += 1;
    }
    for (const status of statuses.statuses ?? []) {
      summary.total += 1;
      if (status.state === 'success') summary.passed += 1;
      else if (status.state === 'pending') summary.pending += 1;
      else summary.failed += 1;
    }
    return summary;
  }

  async mergePullRequest(
    target: RepoTarget,
    number: number,
    commitTitle: string,
  ): Promise<void> {
    await this.request(
      target,
      'PUT',
      `/repos/${target.owner}/${target.repo}/pulls/${number}/merge`,
      { merge_method: 'squash', commit_title: commitTitle },
    );
  }

  async closePullRequest(target: RepoTarget, number: number): Promise<void> {
    await this.request(
      target,
      'PATCH',
      `/repos/${target.owner}/${target.repo}/pulls/${number}`,
      { state: 'closed' },
    );
  }

  private async request<T = unknown>(
    target: RepoTarget,
    method: string,
    path: string,
    body?: unknown,
  ): Promise<T> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
    try {
      const response = await fetch(`${API}${path}`, {
        method,
        signal: controller.signal,
        headers: {
          Authorization: `Bearer ${target.token}`,
          Accept: 'application/vnd.github+json',
          'X-GitHub-Api-Version': '2022-11-28',
          'User-Agent': 'MayaHelp/1.0',
          ...(body ? { 'Content-Type': 'application/json' } : {}),
        },
        body: body ? JSON.stringify(body) : undefined,
      });

      if (!response.ok) {
        const detail = await response.text();
        this.logger.warn(`GitHub ${method} ${path} → ${response.status}`);
        throw new Error(describeError(response.status, detail));
      }
      if (response.status === 204) return undefined as T;
      return (await response.json()) as T;
    } catch (error) {
      if ((error as Error).name === 'AbortError') {
        throw new Error('GitHub no respondió a tiempo');
      }
      throw error;
    } finally {
      clearTimeout(timer);
    }
  }
}

interface RawPull {
  number: number;
  html_url: string;
  state: 'open' | 'closed';
  draft?: boolean;
  merged_at?: string | null;
  mergeable_state?: string;
  head?: { ref?: string; sha?: string };
}

interface RawCheckRun {
  status: string;
  conclusion: string | null;
}

function toPullRequest(pull: RawPull): PullRequestInfo {
  return {
    number: pull.number,
    url: pull.html_url,
    branch: pull.head?.ref ?? '',
    state: pull.state,
    merged: !!pull.merged_at,
    draft: !!pull.draft,
    mergeableState: pull.mergeable_state ?? null,
    headSha: pull.head?.sha ?? '',
  };
}

/** GitHub's raw errors are cryptic; these are the ones a user can actually act on. */
function describeError(status: number, detail: string): string {
  if (status === 401) return 'El token de GitHub no es válido o expiró';
  if (status === 403) {
    return detail.includes('rate limit')
      ? 'Se alcanzó el límite de la API de GitHub, probá en un rato'
      : 'El token no tiene permisos suficientes sobre el repositorio';
  }
  if (status === 404) {
    return 'No se encontró el repositorio (o el token no puede verlo)';
  }
  if (status === 405 || status === 409) {
    return 'GitHub rechazó el merge: el pull request no está en estado mergeable';
  }
  if (status === 422) {
    return `GitHub rechazó la petición: ${detail.slice(0, 200)}`;
  }
  return `GitHub respondió ${status}`;
}
