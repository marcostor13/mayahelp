import { Component, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { TicketService } from '../../../core/services/ticket.service';
import { CategoryService } from '../../../core/services/category.service';
import { Category } from '../../../core/models/category.model';
import { TicketPriority } from '../../../core/models/ticket.model';

@Component({
  selector: 'app-ticket-create',
  imports: [FormsModule],
  templateUrl: './ticket-create.html',
})
export class TicketCreate implements OnInit {
  protected readonly categories = signal<Category[]>([]);
  protected readonly submitting = signal(false);
  protected readonly error = signal<string | null>(null);

  protected subject = '';
  protected description = '';
  protected category = '';
  protected priority: TicketPriority = 'media';

  constructor(
    private readonly ticketService: TicketService,
    private readonly categoryService: CategoryService,
    private readonly router: Router,
  ) {}

  ngOnInit(): void {
    this.categoryService.list('ticket').subscribe((categories) => this.categories.set(categories));
  }

  submit(): void {
    this.error.set(null);
    if (!this.subject || !this.description || !this.category) {
      this.error.set('Completa todos los campos requeridos.');
      return;
    }
    this.submitting.set(true);
    this.ticketService
      .create({
        subject: this.subject,
        description: this.description,
        category: this.category,
        priority: this.priority,
      })
      .subscribe({
        next: (ticket) => this.router.navigate(['/tickets', ticket._id]),
        error: () => {
          this.error.set('No se pudo crear el ticket. Intenta de nuevo.');
          this.submitting.set(false);
        },
      });
  }
}
