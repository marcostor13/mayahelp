import { Component, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { BulkImportService } from '../../../core/services/bulk-import.service';
import { BulkImportResult } from '../../../core/models/bulk-import.model';

@Component({
  selector: 'app-bulk-import',
  imports: [RouterLink],
  templateUrl: './bulk-import.html',
})
export class BulkImport {
  protected readonly selectedFile = signal<File | null>(null);
  protected readonly submitting = signal(false);
  protected readonly result = signal<BulkImportResult | null>(null);
  protected readonly error = signal<string | null>(null);

  constructor(private readonly bulkImportService: BulkImportService) {}

  onFileSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    this.selectedFile.set(input.files?.[0] ?? null);
    this.result.set(null);
    this.error.set(null);
  }

  downloadTemplate(): void {
    this.bulkImportService.downloadTemplate().subscribe((blob) => {
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = 'plantilla-tickets.csv';
      link.click();
      URL.revokeObjectURL(url);
    });
  }

  submit(): void {
    const file = this.selectedFile();
    if (!file) return;

    this.submitting.set(true);
    this.error.set(null);
    this.result.set(null);

    this.bulkImportService.import(file).subscribe({
      next: (result) => {
        this.result.set(result);
        this.submitting.set(false);
      },
      error: () => {
        this.error.set('No se pudo procesar el archivo. Verifica el formato e intenta de nuevo.');
        this.submitting.set(false);
      },
    });
  }
}
