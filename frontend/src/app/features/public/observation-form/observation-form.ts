import { Component, OnInit, signal } from '@angular/core';
import { HttpErrorResponse } from '@angular/common/http';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute } from '@angular/router';
import { PublicObservationService } from '../../../core/services/public-observation.service';
import { PublicProjectInfo } from '../../../core/models/public-observation.model';

const MAX_FILES = 5;

@Component({
  selector: 'app-observation-form',
  imports: [FormsModule],
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

  protected reporterName = '';
  protected reporterEmail = '';
  protected subject = '';
  protected description = '';

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

  onFilesSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    if (!input.files?.length) return;
    this.selectedFiles.update((files) => [...files, ...Array.from(input.files!)].slice(0, MAX_FILES));
    input.value = '';
  }

  removeFile(index: number): void {
    this.selectedFiles.update((files) => files.filter((_, i) => i !== index));
  }

  submit(): void {
    this.submitError.set(null);
    if (!this.reporterName || !this.reporterEmail || !this.subject || !this.description) {
      this.submitError.set('Completa todos los campos requeridos.');
      return;
    }
    this.submitting.set(true);
    this.publicObservationService
      .submit(
        this.token,
        {
          reporterName: this.reporterName,
          reporterEmail: this.reporterEmail,
          subject: this.subject,
          description: this.description,
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
