import { Component, OnInit, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { RouterLink } from '@angular/router';
import { ProjectService } from '../../../core/services/project.service';
import { AuthService } from '../../../core/services/auth.service';
import { Project, ProjectStatus } from '../../../core/models/project.model';

const STATUS_LABELS: Record<ProjectStatus, string> = {
  planning: 'Planificación',
  in_progress: 'En curso',
  on_hold: 'En pausa',
  completed: 'Completado',
};

@Component({
  selector: 'app-project-list',
  imports: [RouterLink, DatePipe],
  templateUrl: './project-list.html',
})
export class ProjectList implements OnInit {
  protected readonly projects = signal<Project[]>([]);
  protected readonly loading = signal(true);
  protected readonly statusLabels = STATUS_LABELS;

  constructor(
    private readonly projectService: ProjectService,
    private readonly auth: AuthService,
  ) {}

  /**
   * Un cliente solo mira: la consola del proyecto (enlaces públicos, repo, monitoreo)
   * es del equipo. La lista ya viene acotada a sus proyectos desde la API.
   */
  protected get isStaff(): boolean {
    const role = this.auth.currentUser()?.role;
    return role === 'admin' || role === 'agent';
  }

  ngOnInit(): void {
    this.projectService.list().subscribe((projects) => {
      this.projects.set(projects);
      this.loading.set(false);
    });
  }
}
