import { Component, OnDestroy, OnInit, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ImplementationService } from '../../core/services/implementation.service';
import { ProjectService } from '../../core/services/project.service';
import { ImplementationRun, RunStatus } from '../../core/models/implementation.model';
import { Project } from '../../core/models/project.model';

interface StatusMeta {
  label: string;
  icon: string;
  badge: string;
  /** Runs in a non-final state keep the list auto-refreshing. */
  live: boolean;
}

const STATUS_META: Record<RunStatus, StatusMeta> = {
  queued: {
    label: 'En cola',
    icon: 'schedule',
    badge: 'bg-surface-container-high text-on-surface-variant',
    live: true,
  },
  running: {
    label: 'Implementando',
    icon: 'autorenew',
    badge: 'bg-primary-fixed text-on-primary-fixed',
    live: true,
  },
  pr_open: {
    label: 'Pull request abierto',
    icon: 'merge_type',
    badge: 'bg-amber-100 text-amber-800',
    live: true,
  },
  merged: {
    label: 'Mergeado',
    icon: 'check_circle',
    badge: 'bg-emerald-100 text-emerald-800',
    live: false,
  },
  failed: {
    label: 'Falló',
    icon: 'error',
    badge: 'bg-error-container text-on-error-container',
    live: false,
  },
  cancelled: {
    label: 'Cancelado',
    icon: 'cancel',
    badge: 'bg-surface-container-high text-on-surface-variant',
    live: false,
  },
};

const REFRESH_MS = 20_000;

@Component({
  selector: 'app-implementations',
  imports: [RouterLink, DatePipe, FormsModule],
  templateUrl: './implementations.html',
})
export class Implementations implements OnInit, OnDestroy {
  protected readonly runs = signal<ImplementationRun[]>([]);
  protected readonly projects = signal<Project[]>([]);
  protected readonly loading = signal(true);
  protected readonly error = signal<string | null>(null);
  protected readonly busyId = signal<string | null>(null);
  protected projectFilter = '';

  private timer?: ReturnType<typeof setInterval>;

  constructor(
    private readonly implementationService: ImplementationService,
    private readonly projectService: ProjectService,
  ) {}

  ngOnInit(): void {
    this.load();
    this.projectService.list().subscribe({
      next: (projects) => this.projects.set(projects),
      error: () => this.projects.set([]),
    });
    // Only polls while something is actually in flight.
    this.timer = setInterval(() => {
      if (this.runs().some((run) => this.meta(run.status).live)) this.load(true);
    }, REFRESH_MS);
  }

  ngOnDestroy(): void {
    if (this.timer) clearInterval(this.timer);
  }

  load(quiet = false): void {
    if (!quiet) this.loading.set(true);
    this.implementationService.list(this.projectFilter || undefined).subscribe({
      next: (runs) => {
        this.runs.set(runs);
        this.loading.set(false);
      },
      error: () => {
        this.error.set('No se pudieron cargar las implementaciones.');
        this.loading.set(false);
      },
    });
  }

  sync(run: ImplementationRun): void {
    this.busyId.set(run._id);
    this.implementationService.sync(run._id).subscribe({
      next: (updated) => {
        this.patch(updated);
        this.busyId.set(null);
      },
      error: () => {
        this.error.set('No se pudo actualizar el estado contra GitHub.');
        this.busyId.set(null);
      },
    });
  }

  cancel(run: ImplementationRun): void {
    const question = run.prNumber
      ? `¿Cancelar la implementación y cerrar el pull request #${run.prNumber}?`
      : '¿Cancelar esta implementación?';
    if (!confirm(question)) return;

    this.busyId.set(run._id);
    this.implementationService.cancel(run._id).subscribe({
      next: (updated) => {
        this.patch(updated);
        this.busyId.set(null);
      },
      error: () => {
        this.error.set('No se pudo cancelar la implementación.');
        this.busyId.set(null);
      },
    });
  }

  private patch(updated: ImplementationRun): void {
    this.runs.update((list) =>
      list.map((run) => (run._id === updated._id ? { ...run, ...updated } : run)),
    );
  }

  meta(status: RunStatus): StatusMeta {
    return STATUS_META[status] ?? STATUS_META.queued;
  }

  projectName(run: ImplementationRun): string {
    return typeof run.project === 'string' ? '' : (run.project?.name ?? '');
  }

  projectId(run: ImplementationRun): string {
    return typeof run.project === 'string' ? run.project : (run.project?._id ?? '');
  }

  /** "2 de 3 chequeos" — only once GitHub reported any. */
  checksLabel(run: ImplementationRun): string | null {
    if (!run.checksTotal) return null;
    return `${run.checksPassed ?? 0} de ${run.checksTotal} chequeos`;
  }

  canCancel(run: ImplementationRun): boolean {
    return this.meta(run.status).live;
  }
}
