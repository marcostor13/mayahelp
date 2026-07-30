import { Component, OnInit, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { DatePipe } from '@angular/common';
import { MonitoringService } from '../../core/services/monitoring.service';
import { MonitoringOverviewRow } from '../../core/models/monitoring.model';

@Component({
  selector: 'app-monitoring',
  imports: [RouterLink, DatePipe],
  templateUrl: './monitoring.html',
})
export class Monitoring implements OnInit {
  protected readonly rows = signal<MonitoringOverviewRow[]>([]);
  protected readonly loading = signal(true);

  constructor(private readonly monitoringService: MonitoringService) {}

  ngOnInit(): void {
    this.load();
  }

  load(): void {
    this.loading.set(true);
    this.monitoringService.overview().subscribe({
      next: (rows) => {
        this.rows.set(rows);
        this.loading.set(false);
      },
      error: () => this.loading.set(false),
    });
  }

  /** Worst state wins: one connection down makes the whole project down. */
  healthOf(row: MonitoringOverviewRow): 'up' | 'degraded' | 'down' | 'unknown' {
    if (row.down > 0) return 'down';
    if (row.degraded > 0) return 'degraded';
    if (row.up > 0) return 'up';
    return 'unknown';
  }

  healthLabel(row: MonitoringOverviewRow): string {
    return {
      up: 'Todo en línea',
      degraded: 'Con problemas',
      down: 'Caído',
      unknown: 'Sin datos',
    }[this.healthOf(row)];
  }

  healthClass(row: MonitoringOverviewRow): string {
    return {
      up: 'bg-emerald-100 text-emerald-800',
      degraded: 'bg-amber-100 text-amber-800',
      down: 'bg-error-container text-on-error-container',
      unknown: 'bg-surface-container-high text-on-surface-variant',
    }[this.healthOf(row)];
  }

  healthIcon(row: MonitoringOverviewRow): string {
    return {
      up: 'check_circle',
      degraded: 'warning',
      down: 'error',
      unknown: 'help',
    }[this.healthOf(row)];
  }
}
