import { Component, OnInit, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { ProjectService, ReporterInput } from '../../../core/services/project.service';
import { CategoryService } from '../../../core/services/category.service';
import { AuthService } from '../../../core/services/auth.service';
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
    protected readonly auth: AuthService,
  ) {}

  get canDelete(): boolean {
    return this.auth.currentUser()?.role === 'admin';
  }

  ngOnInit(): void {
    this.projectId = this.route.snapshot.paramMap.get('id') ?? '';
    this.categoryService.list('ticket').subscribe((categories) => this.categories.set(categories));
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
    this.projectService.listShareLinks(this.projectId).subscribe((links) => this.shareLinks.set(links));
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
    if (!confirm('¿Eliminar este proyecto y todos sus enlaces? Esta acción no se puede deshacer.')) return;
    this.projectService.remove(this.projectId).subscribe(() => this.router.navigate(['/projects']));
  }
}
