export type RunStatus = 'queued' | 'running' | 'pr_open' | 'merged' | 'failed' | 'cancelled';

export interface ProjectRepo {
  project: string;
  owner: string;
  repo: string;
  baseBranch: string;
  eventType: string;
  instructions: string;
  autoMerge: boolean;
  isActive: boolean;
  /** The token is never returned; only whether one is stored. */
  hasToken: boolean;
  lastDispatchAt: string | null;
  lastError?: string;
}

export interface SaveRepoPayload {
  owner: string;
  repo: string;
  baseBranch?: string;
  eventType?: string;
  instructions?: string;
  autoMerge?: boolean;
  isActive?: boolean;
  token?: string;
}

export interface ImplementationRun {
  _id: string;
  project: string | { _id: string; name: string };
  tickets: string[];
  ticketCodes: string[];
  requestedByName?: string;
  title: string;
  runKey: string;
  status: RunStatus;
  autoMerge: boolean;
  branch?: string;
  prNumber?: number;
  prUrl?: string;
  workflowUrl?: string;
  summary?: string;
  lastError?: string;
  checksPassed?: number;
  checksTotal?: number;
  dispatchedAt?: string;
  finishedAt?: string;
  mergedAt?: string;
  createdAt: string;
}

export interface TriggerRunPayload {
  project: string;
  tickets: string[];
  notes?: string;
  autoMerge?: boolean;
}
