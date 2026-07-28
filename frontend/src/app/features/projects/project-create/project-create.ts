import { Component, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { ProjectService } from '../../../core/services/project.service';
import { CategoryService } from '../../../core/services/category.service';
import { Category } from '../../../core/models/category.model';
import { ProjectStatus } from '../../../core/models/project.model';

@Component({
  selector: 'app-project-create',
  imports: [FormsModule, RouterLink],
  templateUrl: './project-create.html',
})
export class ProjectCreate implements OnInit {
  protected readonly categories = signal<Category[]>([]);
  protected readonly submitting = signal(false);
  protected readonly error = signal<string | null>(null);

  protected name = '';
  protected description = '';
  protected status: ProjectStatus = 'in_progress';
  protected defaultCategory = '';

  constructor(
    private readonly projectService: ProjectService,
    private readonly categoryService: CategoryService,
    private readonly router: Router,
  ) {}

  ngOnInit(): void {
    this.categoryService.list('ticket').subscribe((categories) => this.categories.set(categories));
  }

  submit(): void {
    this.error.set(null);
    if (!this.name || !this.defaultCategory) {
      this.error.set('Completa todos los campos requeridos.');
      return;
    }
    this.submitting.set(true);
    this.projectService
      .create({
        name: this.name,
        description: this.description || undefined,
        status: this.status,
        defaultCategory: this.defaultCategory,
      })
      .subscribe({
        next: (project) => this.router.navigate(['/projects', project._id]),
        error: () => {
          this.error.set('No se pudo crear el proyecto. Intenta de nuevo.');
          this.submitting.set(false);
        },
      });
  }
}
