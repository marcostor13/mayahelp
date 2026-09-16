import {
  AfterViewInit,
  Component,
  Directive,
  ElementRef,
  HostListener,
  OnDestroy,
  computed,
  contentChild,
  input,
  output,
  viewChild,
} from '@angular/core';

/** Marca el bloque de acciones del diálogo: queda fijo abajo, fuera del scroll. */
@Directive({ selector: '[modalFooter]' })
export class ModalFooter {}

export type ModalSize = 'sm' | 'md' | 'lg';

const SIZE_CLASSES: Record<ModalSize, string> = {
  sm: 'sm:max-w-md',
  md: 'sm:max-w-xl',
  lg: 'sm:max-w-3xl',
};

/**
 * Diálogo de la plataforma: hoja que sube desde abajo en móvil y ventana centrada en
 * escritorio. Existe para que editar algo no empuje la lista de la que saliste — con el
 * formulario en línea perdías de vista la fila que estabas tocando y, en una lista
 * larga, ni siquiera veías que se había abierto.
 *
 * Trae lo que los overlays sueltos de la app no tenían: se cierra con Escape y con clic
 * afuera, bloquea el scroll del fondo, devuelve el foco al botón que lo abrió y atrapa
 * el tabulador adentro mientras está abierto.
 *
 * El encabezado y el pie quedan fijos, así que el botón de guardar se alcanza siempre,
 * incluso en los formularios largos que scrollean.
 */
@Component({
  selector: 'app-modal',
  templateUrl: './modal.html',
})
export class Modal implements AfterViewInit, OnDestroy {
  readonly heading = input.required<string>();
  readonly description = input<string>('');
  /** Ícono de Material Symbols; vacío para no mostrar ninguno. */
  readonly icon = input<string>('');
  readonly size = input<ModalSize>('md');
  /**
   * Mientras hay algo guardándose no se puede cerrar: perder lo escrito por un Escape
   * de más en medio de un guardado es justo lo que no queremos.
   */
  readonly busy = input(false);

  readonly closed = output<void>();

  protected readonly footer = contentChild(ModalFooter);
  protected readonly sizeClass = computed(() => SIZE_CLASSES[this.size()]);
  /** Único por instancia: puede haber más de un diálogo montado en la misma pantalla. */
  protected readonly headingId = `modal-heading-${crypto.randomUUID().slice(0, 8)}`;

  private readonly card = viewChild.required<ElementRef<HTMLElement>>('card');
  private previouslyFocused: HTMLElement | null = null;
  private previousBodyOverflow = '';

  ngAfterViewInit(): void {
    this.previouslyFocused = document.activeElement as HTMLElement | null;
    this.previousBodyOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    this.initialFocus().focus();
  }

  ngOnDestroy(): void {
    document.body.style.overflow = this.previousBodyOverflow;
    this.previouslyFocused?.focus();
  }

  @HostListener('document:keydown', ['$event'])
  protected onKeydown(event: KeyboardEvent): void {
    if (event.key === 'Escape') {
      event.preventDefault();
      this.requestClose();
      return;
    }
    if (event.key === 'Tab') {
      this.trapTab(event);
    }
  }

  /** Solo el clic que empieza y termina en el fondo cierra: arrastrar desde adentro no. */
  protected onBackdropClick(event: MouseEvent): void {
    if (event.target === event.currentTarget) {
      this.requestClose();
    }
  }

  protected requestClose(): void {
    if (!this.busy()) {
      this.closed.emit();
    }
  }

  /**
   * Al primer control del cuerpo, no al botón de cerrar: quien abre "Editar cuenta"
   * quiere escribir, no cerrar. Si el cuerpo no tiene controles queda el contenedor,
   * para que Escape y el lector de pantalla tengan dónde pararse.
   */
  private initialFocus(): HTMLElement {
    const body = this.card().nativeElement.querySelector<HTMLElement>('.modal-body');
    return (body && this.focusableIn(body)[0]) ?? this.focusable()[0] ?? this.card().nativeElement;
  }

  private trapTab(event: KeyboardEvent): void {
    const items = this.focusable();
    if (items.length === 0) return;

    const first = items[0];
    const last = items[items.length - 1];
    const active = document.activeElement;

    // Sin esto el tabulador se escapa al fondo, que para quien mira está tapado.
    if (event.shiftKey && (active === first || !this.card().nativeElement.contains(active))) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && active === last) {
      event.preventDefault();
      first.focus();
    }
  }

  /**
   * No filtra por visibilidad a propósito: las pantallas arman el contenido con `@if`,
   * así que lo que no se ve tampoco está en el DOM. Filtrar por `offsetParent` habría
   * dejado la lista vacía en cualquier entorno sin layout, y con ella el foco.
   */
  private focusable(): HTMLElement[] {
    return this.focusableIn(this.card().nativeElement);
  }

  private focusableIn(root: HTMLElement): HTMLElement[] {
    const selector =
      'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';
    return Array.from(root.querySelectorAll<HTMLElement>(selector));
  }
}
