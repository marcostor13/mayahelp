import { Component, OnInit, signal } from '@angular/core';
import { HttpErrorResponse } from '@angular/common/http';
import { FormsModule } from '@angular/forms';
import { CategoryService } from '../../core/services/category.service';
import {
  AutoReplyMode,
  Category,
  CategoryType,
  CreateCategoryPayload,
} from '../../core/models/category.model';

const AUTO_REPLY_LABELS: Record<AutoReplyMode, string> = {
  off: 'Desactivada',
  draft: 'Sugerir (revisión de un agente)',
  auto: 'Automática (responde sola)',
};

@Component({
  selector: 'app-categories',
  imports: [FormsModule],
  templateUrl: './categories.html',
})
export class Categories implements OnInit {
  protected readonly autoReplyLabels = AUTO_REPLY_LABELS;
  protected readonly categories = signal<Category[]>([]);
  protected readonly loading = signal(true);
  protected readonly submitting = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly editingId = signal<string | null>(null);
  protected activeType: CategoryType = 'ticket';

  protected name = '';
  protected type: CategoryType = 'ticket';
  protected icon = 'label';
  protected description = '';
  protected autoReplyMode: AutoReplyMode = 'draft';

  constructor(private readonly categoryService: CategoryService) {}

  ngOnInit(): void {
    this.load();
  }

  get visibleCategories(): Category[] {
    return this.categories().filter((category) => category.type === this.activeType);
  }

  setActiveType(type: CategoryType): void {
    this.activeType = type;
    if (!this.editingId()) {
      this.type = type;
    }
  }

  load(): void {
    this.loading.set(true);
    this.categoryService.list().subscribe((categories) => {
      this.categories.set(categories);
      this.loading.set(false);
    });
  }

  startEdit(category: Category): void {
    this.editingId.set(category._id);
    this.name = category.name;
    this.type = category.type;
    this.icon = category.icon;
    this.description = category.description ?? '';
    this.autoReplyMode = category.autoReplyMode;
    this.error.set(null);
  }

  cancelEdit(): void {
    this.editingId.set(null);
    this.resetForm();
  }

  submit(): void {
    this.error.set(null);
    if (!this.name) {
      this.error.set('El nombre es obligatorio.');
      return;
    }

    const payload: CreateCategoryPayload = {
      name: this.name,
      type: this.type,
      icon: this.icon || undefined,
      description: this.description || undefined,
      autoReplyMode: this.type === 'ticket' ? this.autoReplyMode : undefined,
    };

    this.submitting.set(true);
    const editingId = this.editingId();
    const request = editingId
      ? this.categoryService.update(editingId, payload)
      : this.categoryService.create(payload);

    request.subscribe({
      next: (category) => {
        this.categories.update((categories) => {
          if (editingId) {
            return categories.map((c) => (c._id === category._id ? category : c));
          }
          return [...categories, category];
        });
        this.editingId.set(null);
        this.resetForm();
        this.submitting.set(false);
      },
      error: (err: HttpErrorResponse) => {
        this.error.set(err.error?.message ?? 'No se pudo guardar la categoría.');
        this.submitting.set(false);
      },
    });
  }

  removeCategory(category: Category): void {
    if (
      !confirm(
        `¿Eliminar la categoría "${category.name}"? Los tickets o artículos que ya la usan no se moverán automáticamente.`,
      )
    ) {
      return;
    }
    this.categoryService.remove(category._id).subscribe(() => {
      this.categories.update((categories) => categories.filter((c) => c._id !== category._id));
      if (this.editingId() === category._id) {
        this.cancelEdit();
      }
    });
  }

  private resetForm(): void {
    this.name = '';
    this.type = this.activeType;
    this.icon = 'label';
    this.description = '';
    this.autoReplyMode = 'draft';
  }
}
