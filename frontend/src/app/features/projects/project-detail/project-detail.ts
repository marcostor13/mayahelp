import { Component, OnInit, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { ProjectService, ReporterInput } from '../../../core/services/project.service';
import { CategoryService } from '../../../core/services/category.service';
import { AuthService } from '../../../core/services/auth.service';
import { ImplementationService } from '../../../core/services/implementation.service';
import { ProjectRepo } from '../../../core/models/implementation.model';
import { Project, ProjectShareLink, ProjectStatus } from '../../../core/models/project.model';
import { Category } from '../../../core/models/category.model';

@Component({
  selector: 'app-project-detail',
  imports: [FormsModule, RouterLink, DatePipe],
  templateUrl: './project-detail.html',
})
export class ProjectDetail implements OnInit {
  protected readonly project = signal<Project | null>(null);
  protected readonly shareLinks = signal<ProjectShareLink[]>([]);
  protected readonly categories = signal<Category[]>([]);
  protected readonly loading = signal(true);
  protected readonly saving = signal(false);
  protected readonly creatingLink = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly copiedToken = signal<string | null>(null);
  protected readonly expandedLinkId = signal<string | null>(null);
  protected readonly newLinkReporters = signal<ReporterInput[]>([]);

  // --- repositorio para Claude Code ---
  protected readonly repo = signal<ProjectRepo | null>(null);
  protected readonly repoSaving = signal(false);
  protected readonly repoError = signal<string | null>(null);
  protected readonly repoSaved = signal(false);
  protected repoOwner = '';
  protected repoName = '';
  protected repoBaseBranch = 'main';
  protected repoToken = '';
  protected repoInstructions = '';
  protected repoAutoMerge = false;
  protected repoActive = true;

  protected name = '';
  protected description = '';
  protected status: ProjectStatus = 'in_progress';
  protected defaultCategory = '';
  protected newLinkLabel = '';
  protected newLinkExpiresAt = '';
  protected newReporterName = '';
  protected newReporterEmail = '';
  protected addReporterName: Record<string, string> = {};
  protected addReporterEmail: Record<string, string> = {};

  private projectId = '';

  constructor(
    private readonly route: ActivatedRoute,
    private readonly router: Router,
    private readonly projectService: ProjectService,
    private readonly categoryService: CategoryService,
    private readonly implementationService: ImplementationService,
    protected readonly auth: AuthService,
  ) {}

  get canDelete(): boolean {
    return this.auth.currentUser()?.role === 'admin';
  }

  ngOnInit(): void {
    this.projectId = this.route.snapshot.paramMap.get('id') ?? '';
    this.categoryService.list('ticket').subscribe((categories) => this.categories.set(categories));
    this.loadRepo();
    this.load();
  }

  load(): void {
    this.loading.set(true);
    this.projectService.getById(this.projectId).subscribe((project) => {
      this.project.set(project);
      this.name = project.name;
      this.description = project.description ?? '';
      this.status = project.status;
      this.defaultCategory = project.defaultCategory?._id ?? '';
      this.loading.set(false);
    });
    this.projectService
      .listShareLinks(this.projectId)
      .subscribe((links) => this.shareLinks.set(links));
  }

  saveDetails(): void {
    this.error.set(null);
    if (!this.name) {
      this.error.set('El nombre es obligatorio.');
      return;
    }
    this.saving.set(true);
    this.projectService
      .update(this.projectId, {
        name: this.name,
        description: this.description || undefined,
        status: this.status,
        defaultCategory: this.defaultCategory || undefined,
      })
      .subscribe({
        next: (project) => {
          this.project.set(project);
          this.saving.set(false);
        },
        error: () => {
          this.error.set('No se pudo actualizar el proyecto.');
          this.saving.set(false);
        },
      });
  }

  addPendingReporter(): void {
    const name = this.newReporterName.trim();
    const email = this.newReporterEmail.trim();
    if (!name || !email) return;
    this.newLinkReporters.update((reporters) => [...reporters, { name, email }]);
    this.newReporterName = '';
    this.newReporterEmail = '';
  }

  removePendingReporter(index: number): void {
    this.newLinkReporters.update((reporters) => reporters.filter((_, i) => i !== index));
  }

  createShareLink(): void {
    this.creatingLink.set(true);
    this.projectService
      .createShareLink(
        this.projectId,
        this.newLinkLabel || undefined,
        this.newLinkExpiresAt || undefined,
        this.newLinkReporters(),
      )
      .subscribe({
        next: (link) => {
          this.shareLinks.update((links) => [link, ...links]);
          this.newLinkLabel = '';
          this.newLinkExpiresAt = '';
          this.newLinkReporters.set([]);
          this.creatingLink.set(false);
        },
        error: () => this.creatingLink.set(false),
      });
  }

  publicUrl(token: string): string {
    return `${location.origin}/public/observaciones/${token}`;
  }

  copyUrl(token: string): void {
    navigator.clipboard.writeText(this.publicUrl(token)).then(() => {
      this.copiedToken.set(token);
      setTimeout(() => this.copiedToken.set(null), 2000);
    });
  }

  toggleActive(link: ProjectShareLink): void {
    this.projectService.setShareLinkActive(link._id, !link.isActive).subscribe((updated) => {
      this.shareLinks.update((links) => links.map((l) => (l._id === updated._id ? updated : l)));
    });
  }

  removeShareLink(id: string): void {
    if (!confirm('¿Revocar y eliminar este enlace? Dejará de funcionar de inmediato.')) return;
    this.projectService.removeShareLink(id).subscribe(() => {
      this.shareLinks.update((links) => links.filter((l) => l._id !== id));
    });
  }

  toggleExpanded(linkId: string): void {
    this.expandedLinkId.set(this.expandedLinkId() === linkId ? null : linkId);
  }

  addReporter(link: ProjectShareLink): void {
    const name = (this.addReporterName[link._id] ?? '').trim();
    const email = (this.addReporterEmail[link._id] ?? '').trim();
    if (!name || !email) return;
    this.projectService.addReporter(link._id, { name, email }).subscribe((updated) => {
      this.shareLinks.update((links) => links.map((l) => (l._id === updated._id ? updated : l)));
      this.addReporterName[link._id] = '';
      this.addReporterEmail[link._id] = '';
    });
  }

  removeReporter(link: ProjectShareLink, reporterId: string): void {
    this.projectService.removeReporter(link._id, reporterId).subscribe((updated) => {
      this.shareLinks.update((links) => links.map((l) => (l._id === updated._id ? updated : l)));
    });
  }

  deleteProject(): void {
    if (!confirm('¿Eliminar este proyecto y todos sus enlaces? Esta acción no se puede deshacer.'))
      return;
    this.projectService.remove(this.projectId).subscribe(() => this.router.navigate(['/projects']));
  }

  // --- repositorio para Claude Code ---------------------------------------

  private loadRepo(): void {
    this.implementationService.getRepo(this.projectId).subscribe({
      next: (repo) => {
        this.repo.set(repo);
        if (!repo) return;
        this.repoOwner = repo.owner;
        this.repoName = repo.repo;
        this.repoBaseBranch = repo.baseBranch;
        this.repoInstructions = repo.instructions;
        this.repoAutoMerge = repo.autoMerge;
        this.repoActive = repo.isActive;
      },
      error: () => this.repo.set(null),
    });
  }

  get canSaveRepo(): boolean {
    // The token is only required the first time; afterwards the stored one is kept.
    return (
      this.repoOwner.trim().length > 0 &&
      this.repoName.trim().length > 0 &&
      (!!this.repo()?.hasToken || this.repoToken.trim().length > 0)
    );
  }

  saveRepo(): void {
    if (!this.canSaveRepo || this.repoSaving()) return;
    this.repoSaving.set(true);
    this.repoError.set(null);
    this.repoSaved.set(false);
    this.implementationService
      .saveRepo(this.projectId, {
        owner: this.repoOwner.trim(),
        repo: this.repoName.trim(),
        baseBranch: this.repoBaseBranch.trim() || undefined,
        instructions: this.repoInstructions.trim(),
        autoMerge: this.repoAutoMerge,
        isActive: this.repoActive,
        token: this.repoToken.trim() || undefined,
      })
      .subscribe({
        next: (repo) => {
          this.repo.set(repo);
          this.repoToken = '';
          this.repoBaseBranch = repo.baseBranch;
          this.repoSaving.set(false);
          this.repoSaved.set(true);
        },
        error: (err: { error?: { message?: string | string[] } }) => {
          this.repoError.set(
            err.error?.message?.toString() ?? 'No se pudo guardar el repositorio.',
          );
          this.repoSaving.set(false);
        },
      });
  }

  disconnectRepo(): void {
    if (!confirm('¿Desconectar el repositorio? Se borra el token guardado.')) return;
    this.implementationService.removeRepo(this.projectId).subscribe({
      next: () => {
        this.repo.set(null);
        this.repoOwner = '';
        this.repoName = '';
        this.repoToken = '';
        this.repoInstructions = '';
        this.repoAutoMerge = false;
        this.repoActive = true;
      },
      error: () => this.repoError.set('No se pudo desconectar el repositorio.'),
    });
  }
}
