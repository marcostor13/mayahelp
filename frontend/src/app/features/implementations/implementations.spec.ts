import { Implementations } from './implementations';
import { ImplementationService } from '../../core/services/implementation.service';
import { ProjectService } from '../../core/services/project.service';
import { ImplementationRun, RunStatus } from '../../core/models/implementation.model';

function component(): Implementations {
  return new Implementations(
    {} as ImplementationService,
    {} as ProjectService,
  ) as unknown as Implementations;
}

type Page = Implementations & {
  meta(status: RunStatus): { label: string; live: boolean };
  checksLabel(run: ImplementationRun): string | null;
  canCancel(run: ImplementationRun): boolean;
  projectName(run: ImplementationRun): string;
  projectId(run: ImplementationRun): string;
};

function run(overrides: Partial<ImplementationRun> = {}): ImplementationRun {
  return {
    _id: 'r1',
    project: 'p1',
    tickets: ['t1'],
    ticketCodes: ['TCK-1'],
    title: 'TCK-1: algo',
    runKey: 'abc123',
    status: 'pr_open',
    autoMerge: false,
    createdAt: '2026-07-30T10:00:00.000Z',
    ...overrides,
  };
}

describe('Implementations', () => {
  const page = () => component() as Page;

  it('treats only the unfinished states as live', () => {
    const live = (status: RunStatus) => page().meta(status).live;

    expect(live('queued')).toBe(true);
    expect(live('running')).toBe(true);
    expect(live('pr_open')).toBe(true);
    expect(live('merged')).toBe(false);
    expect(live('failed')).toBe(false);
    expect(live('cancelled')).toBe(false);
  });

  it('offers to cancel only while the run can still be stopped', () => {
    expect(page().canCancel(run({ status: 'running' }))).toBe(true);
    expect(page().canCancel(run({ status: 'merged' }))).toBe(false);
  });

  it('hides the checks counter until GitHub reported any', () => {
    expect(page().checksLabel(run())).toBeNull();
    expect(page().checksLabel(run({ checksTotal: 0, checksPassed: 0 }))).toBeNull();
    expect(page().checksLabel(run({ checksTotal: 3, checksPassed: 2 }))).toBe('2 de 3 chequeos');
  });

  it('reads the project whether the API populated it or not', () => {
    const populated = run({ project: { _id: 'p9', name: 'Portal Acme' } });

    expect(page().projectId(populated)).toBe('p9');
    expect(page().projectName(populated)).toBe('Portal Acme');
    // Not populated: the id is still usable for the "ver tickets" link.
    expect(page().projectId(run())).toBe('p1');
    expect(page().projectName(run())).toBe('');
  });

  it('falls back to a known state for a status the backend adds later', () => {
    expect(page().meta('algo-nuevo' as RunStatus).label).toBe('En cola');
  });
});
