import { Component, OnInit, signal } from '@angular/core';
import { HttpErrorResponse } from '@angular/common/http';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute } from '@angular/router';
import { PublicObservationService } from '../../../core/services/public-observation.service';
import { PublicProjectInfo } from '../../../core/models/public-observation.model';
import { MediaCapture } from '../../../shared/media-capture/media-capture';

const MAX_FILES = 5;

@Component({
  selector: 'app-observation-form',
  imports: [FormsModule, MediaCapture],
  templateUrl: './observation-form.html',
})
export class ObservationForm implements OnInit {
  protected readonly loading = signal(true);
  protected readonly linkError = signal<string | null>(null);
  protected readonly project = signal<PublicProjectInfo | null>(null);
  protected readonly selectedFiles = signal<File[]>([]);
  protected readonly submitting = signal(false);
  protected readonly submitError = signal<string | null>(null);
  protected readonly ticketCode = signal<string | null>(null);
  protected readonly maxFiles = MAX_FILES;

  protected reporterId = '';
  protected description = '';
  protected category = '';

  private token = '';

  constructor(
    private readonly route: ActivatedRoute,
    private readonly publicObservationService: PublicObservationService,
  ) {}

  ngOnInit(): void {
    this.token = this.route.snapshot.paramMap.get('token') ?? '';
    this.publicObservationService.getProjectInfo(this.token).subscribe({
      next: (info) => {
        this.project.set(info);
        this.category = info.defaultCategoryId ?? '';
        if (info.reporters.length === 1) {
          this.reporterId = info.reporters[0].id;
        }
        this.loading.set(false);
      },
      error: (err: HttpErrorResponse) => {
        this.linkError.set(
          err.status === 410
            ? 'Este enlace ya no está disponible.'
            : 'Este enlace no es válido. Verifica la URL o solicita uno nuevo.',
        );
        this.loading.set(false);
      },
    });
  }

  onFilesAdded(files: File[]): void {
    this.selectedFiles.update((current) => [...current, ...files].slice(0, MAX_FILES));
  }

  removeFile(index: number): void {
    this.selectedFiles.update((files) => files.filter((_, i) => i !== index));
  }

  submit(): void {
    this.submitError.set(null);
    if (!this.reporterId || !this.description || !this.category) {
      this.submitError.set('Completa todos los campos requeridos.');
      return;
    }
    this.submitting.set(true);
    this.publicObservationService
      .submit(
        this.token,
        {
          reporterId: this.reporterId,
          description: this.description,
          category: this.category,
        },
        this.selectedFiles(),
      )
      .subscribe({
        next: (result) => {
          this.ticketCode.set(result.code);
          this.submitting.set(false);
        },
        error: () => {
          this.submitError.set('No se pudo enviar tu observación. Intenta de nuevo.');
          this.submitting.set(false);
        },
      });
  }
}
