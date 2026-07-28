import { Component, OnInit, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { RouterLink } from '@angular/router';
import { ProjectService } from '../../../core/services/project.service';
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

  constructor(private readonly projectService: ProjectService) {}

  ngOnInit(): void {
    this.projectService.list().subscribe((projects) => {
      this.projects.set(projects);
      this.loading.set(false);
    });
  }
}
