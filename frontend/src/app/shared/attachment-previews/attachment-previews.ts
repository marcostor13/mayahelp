import {
  Component,
  HostListener,
  OnDestroy,
  effect,
  input,
  output,
  signal,
} from '@angular/core';

/** Archivo pendiente de subir junto con la URL de su miniatura (null si no es imagen). */
interface PreviewItem {
  file: File;
  url: string | null;
}

/**
 * Lista de adjuntos todavía no subidos, con miniatura de las imágenes y vista
 * ampliada al tocarlas. Las capturas pegadas del portapapeles llegan con un
 * nombre autogenerado, así que ver la imagen es la única forma de saber qué se
 * adjuntó antes de enviar.
 */
@Component({
  selector: 'app-attachment-previews',
  templateUrl: './attachment-previews.html',
})
export class AttachmentPreviews implements OnDestroy {
  readonly files = input.required<File[]>();
  readonly remove = output<number>();

  protected readonly items = signal<PreviewItem[]>([]);
  protected readonly zoomed = signal<PreviewItem | null>(null);

  /** Una object URL por archivo: recrearla en cada render haría parpadear la miniatura. */
  private readonly urls = new Map<File, string>();

  constructor() {
    effect(() => {
      const files = this.files();
      const items = files.map((file) => ({ file, url: this.urlFor(file) }));
      for (const [file, url] of this.urls) {
        if (!files.includes(file)) {
          URL.revokeObjectURL(url);
          this.urls.delete(file);
        }
      }
      if (this.zoomed() && !files.includes(this.zoomed()!.file)) {
        this.zoomed.set(null);
      }
      this.items.set(items);
    });
  }

  ngOnDestroy(): void {
    for (const url of this.urls.values()) {
      URL.revokeObjectURL(url);
    }
    this.urls.clear();
  }

  @HostListener('document:keydown.escape')
  protected closeZoom(): void {
    this.zoomed.set(null);
  }

  protected openZoom(item: PreviewItem): void {
    if (item.url) this.zoomed.set(item);
  }

  protected removeAt(index: number): void {
    this.remove.emit(index);
  }

  protected sizeLabel(file: File): string {
    const kb = file.size / 1024;
    return kb < 1024 ? `${Math.max(1, Math.round(kb))} KB` : `${(kb / 1024).toFixed(1)} MB`;
  }

  private urlFor(file: File): string | null {
    if (!file.type.startsWith('image/')) return null;
    let url = this.urls.get(file);
    if (!url) {
      url = URL.createObjectURL(file);
      this.urls.set(file, url);
    }
    return url;
  }
}
