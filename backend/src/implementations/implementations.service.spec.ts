import { ConfigService } from '@nestjs/config';
import { UnauthorizedException } from '@nestjs/common';
import { Types } from 'mongoose';
import { ImplementationsService } from './implementations.service';
import {
  ChecksSummary,
  GithubService,
  PullRequestInfo,
} from './github.service';
import { EncryptionService } from '../common/encryption/encryption.service';
import {
  ImplementationRunDocument,
  RunStatus,
} from './schemas/implementation-run.schema';
import { ProjectRepoDocument } from './schemas/project-repo.schema';
import { ExportService } from '../export/export.service';

const encryption = new EncryptionService({
  get: (key: string) =>
    key === 'encryptionKey' ? 'test-key-for-specs' : undefined,
} as unknown as ConfigService);

function repoDoc(
  overrides: Partial<ProjectRepoDocument> = {},
): ProjectRepoDocument {
  return {
    project: new Types.ObjectId(),
    owner: 'acme',
    repo: 'portal',
    baseBranch: 'main',
    eventType: 'mayahelp-implement',
    autoMerge: false,
    isActive: true,
    secretToken: encryption.encrypt('ghp_token'),
    secretCallback: encryption.encrypt('callback-secret'),
    save: () => Promise.resolve(),
    ...overrides,
  } as unknown as ProjectRepoDocument;
}

function runDoc(
  overrides: Partial<ImplementationRunDocument> = {},
): ImplementationRunDocument {
  return {
    project: new Types.ObjectId(),
    runKey: 'abc123',
    title: 'TCK-1: algo',
    ticketCodes: ['TCK-1'],
    status: RunStatus.PR_OPEN,
    autoMerge: false,
    dispatchedAt: new Date(),
    save: () => Promise.resolve(),
    ...overrides,
  } as unknown as ImplementationRunDocument;
}

function pull(overrides: Partial<PullRequestInfo> = {}): PullRequestInfo {
  return {
    number: 7,
    url: 'https://github.com/acme/portal/pull/7',
    branch: 'mayahelp/abc123-fix',
    state: 'open',
    merged: false,
    draft: false,
    mergeableState: 'clean',
    headSha: 'deadbeef',
    ...overrides,
  };
}

function checks(overrides: Partial<ChecksSummary> = {}): ChecksSummary {
  return { total: 3, passed: 3, failed: 0, pending: 0, ...overrides };
}

interface Harness {
  service: ImplementationsService;
  merged: number[];
}

function harness(options: {
  repo?: ProjectRepoDocument;
  pull?: PullRequestInfo | null;
  checks?: ChecksSummary;
}): Harness {
  const merged: number[] = [];
  const github = {
    getPullRequest: () => Promise.resolve(options.pull!),
    findPullRequestByBranchPrefix: () => Promise.resolve(options.pull ?? null),
    getChecks: () => Promise.resolve(options.checks ?? checks()),
    mergePullRequest: (_t: unknown, number: number) => {
      merged.push(number);
      return Promise.resolve();
    },
    closePullRequest: () => Promise.resolve(),
  } as unknown as GithubService;

  const repoModel = {
    findOne: () => ({
      select: () => ({
        exec: () => Promise.resolve(options.repo ?? repoDoc()),
      }),
    }),
  };

  const service = new ImplementationsService(
    repoModel as never,
    {} as never,
    {} as never,
    {} as never,
    github,
    encryption,
    {} as unknown as ExportService,
    { get: () => undefined } as unknown as ConfigService,
  );
  return { service, merged };
}

describe('ImplementationsService.sync', () => {
  it('leaves the pull request open when auto-merge is off, even with everything green', async () => {
    const { service, merged } = harness({ pull: pull(), checks: checks() });
    const run = runDoc({ autoMerge: false, prNumber: 7 });

    await service.sync(run);

    expect(run.status).toBe(RunStatus.PR_OPEN);
    expect(run.checksPassed).toBe(3);
    expect(merged).toEqual([]);
  });

  it('merges once every check passed and the run asked for it', async () => {
    const { service, merged } = harness({ pull: pull(), checks: checks() });
    const run = runDoc({ autoMerge: true, prNumber: 7 });

    await service.sync(run);

    expect(merged).toEqual([7]);
    expect(run.status).toBe(RunStatus.MERGED);
    expect(run.mergedAt).toBeInstanceOf(Date);
  });

  it('does not merge while a check is still running', async () => {
    const { service, merged } = harness({
      pull: pull(),
      checks: checks({ total: 3, passed: 2, pending: 1 }),
    });
    const run = runDoc({ autoMerge: true, prNumber: 7 });

    await service.sync(run);

    expect(merged).toEqual([]);
    expect(run.status).toBe(RunStatus.PR_OPEN);
  });

  it('does not merge a pull request whose CI failed, and says so', async () => {
    const { service, merged } = harness({
      pull: pull(),
      checks: checks({ total: 3, passed: 2, failed: 1 }),
    });
    const run = runDoc({ autoMerge: true, prNumber: 7 });

    await service.sync(run);

    expect(merged).toEqual([]);
    expect(run.lastError).toContain('1 chequeo(s)');
  });

  /**
   * A pull request opened with the default Actions token does not trigger
   * `on: pull_request` workflows, so it reports zero checks. Merging that would ship
   * code nothing ever built.
   */
  it('refuses to merge when there are no checks at all', async () => {
    const { service, merged } = harness({
      pull: pull(),
      checks: checks({ total: 0, passed: 0 }),
    });
    const run = runDoc({ autoMerge: true, prNumber: 7 });

    await service.sync(run);

    expect(merged).toEqual([]);
    expect(run.status).toBe(RunStatus.PR_OPEN);
  });

  it('never merges a draft pull request', async () => {
    const { service, merged } = harness({ pull: pull({ draft: true }) });
    const run = runDoc({ autoMerge: true, prNumber: 7 });

    await service.sync(run);

    expect(merged).toEqual([]);
  });

  it('picks up a merge done by hand on GitHub', async () => {
    const { service } = harness({
      pull: pull({ merged: true, state: 'closed' }),
    });
    const run = runDoc({ prNumber: 7 });

    await service.sync(run);

    expect(run.status).toBe(RunStatus.MERGED);
  });

  it('treats a closed-without-merging pull request as cancelled', async () => {
    const { service } = harness({ pull: pull({ state: 'closed' }) });
    const run = runDoc({ prNumber: 7 });

    await service.sync(run);

    expect(run.status).toBe(RunStatus.CANCELLED);
  });

  it('keeps waiting while the workflow has not opened the pull request yet', async () => {
    const { service } = harness({ pull: null });
    const run = runDoc({ status: RunStatus.RUNNING, prNumber: undefined });

    await service.sync(run);

    expect(run.status).toBe(RunStatus.RUNNING);
  });

  it('gives up on a run that never produced a pull request', async () => {
    const { service } = harness({ pull: null });
    const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000);
    const run = runDoc({ status: RunStatus.QUEUED, dispatchedAt: twoHoursAgo });

    await service.sync(run);

    expect(run.status).toBe(RunStatus.FAILED);
    expect(run.lastError).toContain('no abrió un pull request');
  });

  it('does not touch a run that already finished', async () => {
    const { service, merged } = harness({ pull: pull(), checks: checks() });
    const run = runDoc({
      status: RunStatus.MERGED,
      autoMerge: true,
      prNumber: 7,
    });

    await service.sync(run);

    expect(merged).toEqual([]);
  });
});

describe('ImplementationsService.handleCallback', () => {
  function callbackHarness(run: ImplementationRunDocument, repo = repoDoc()) {
    const repoModel = {
      findOne: () => ({
        select: () => ({ exec: () => Promise.resolve(repo) }),
      }),
    };
    const runModel = { findOne: () => ({ exec: () => Promise.resolve(run) }) };
    const service = new ImplementationsService(
      repoModel as never,
      runModel as never,
      {} as never,
      {} as never,
      {} as unknown as GithubService,
      encryption,
      {} as unknown as ExportService,
      { get: () => undefined } as unknown as ConfigService,
    );
    // The token the workflow receives is derived the same way at dispatch time.
    const validToken = (
      service as unknown as {
        callbackToken(repo: ProjectRepoDocument, runKey: string): string;
      }
    ).callbackToken(repo, run.runKey);
    return { service, validToken };
  }

  it('rejects a callback with the wrong token', async () => {
    const run = runDoc({ status: RunStatus.QUEUED });
    const { service } = callbackHarness(run);

    await expect(
      service.handleCallback('abc123', 'no-es-el-token', { status: 'running' }),
    ).rejects.toBeInstanceOf(UnauthorizedException);
    expect(run.status).toBe(RunStatus.QUEUED);
  });

  it('rejects a callback with no token at all', async () => {
    const run = runDoc({ status: RunStatus.QUEUED });
    const { service } = callbackHarness(run);

    await expect(
      service.handleCallback('abc123', '', { status: 'running' }),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('records the pull request the workflow reports', async () => {
    const run = runDoc({ status: RunStatus.QUEUED });
    const { service, validToken } = callbackHarness(run);

    await service.handleCallback('abc123', validToken, {
      status: 'pr_open',
      prNumber: 12,
      prUrl: 'https://github.com/acme/portal/pull/12',
      branch: 'mayahelp/abc123-fix',
    });

    expect(run.status).toBe(RunStatus.PR_OPEN);
    expect(run.prNumber).toBe(12);
  });

  it('marks the run as failed when the workflow reports a failure', async () => {
    const run = runDoc({ status: RunStatus.RUNNING });
    const { service, validToken } = callbackHarness(run);

    await service.handleCallback('abc123', validToken, {
      status: 'failed',
      error: 'el paso de Claude Code falló',
    });

    expect(run.status).toBe(RunStatus.FAILED);
    expect(run.finishedAt).toBeInstanceOf(Date);
  });

  it('ignores a late callback on a run that already merged', async () => {
    const run = runDoc({ status: RunStatus.MERGED });
    const { service, validToken } = callbackHarness(run);

    await service.handleCallback('abc123', validToken, { status: 'failed' });

    expect(run.status).toBe(RunStatus.MERGED);
  });
});
