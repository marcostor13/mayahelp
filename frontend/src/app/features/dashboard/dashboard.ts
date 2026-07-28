import { Component, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { DashboardService } from '../../core/services/dashboard.service';
import { TaskService } from '../../core/services/task.service';
import { AuthService } from '../../core/services/auth.service';
import { DashboardStats } from '../../core/models/dashboard.model';
import { AgentTask } from '../../core/models/task.model';

@Component({
  selector: 'app-dashboard',
  imports: [FormsModule, RouterLink],
  templateUrl: './dashboard.html',
})
export class Dashboard implements OnInit {
  protected readonly stats = signal<DashboardStats | null>(null);
  protected readonly tasks = signal<AgentTask[]>([]);
  protected readonly loading = signal(true);
  protected newTaskTitle = '';

  protected readonly maxWeeklyCount = () =>
    Math.max(1, ...(this.stats()?.weeklyActivity.map((d) => d.count) ?? [1]));

  constructor(
    private readonly dashboardService: DashboardService,
    private readonly taskService: TaskService,
    protected readonly auth: AuthService,
  ) {}

  ngOnInit(): void {
    this.dashboardService.getStats().subscribe((stats) => {
      this.stats.set(stats);
      this.loading.set(false);
    });

    if (this.auth.currentUser()?.role !== 'client') {
      this.taskService.list().subscribe((tasks) => this.tasks.set(tasks));
    }
  }

  formatMinutes(minutes: number | null): string {
    if (minutes === null) return 'Sin datos';
    const hours = Math.floor(minutes / 60);
    const rest = Math.round(minutes % 60);
    return hours > 0 ? `${hours}h ${rest}m` : `${rest}m`;
  }

  toggleTask(task: AgentTask): void {
    this.taskService.setDone(task._id, !task.done).subscribe((updated) => {
      this.tasks.update((list) => list.map((t) => (t._id === updated._id ? updated : t)));
    });
  }

  addTask(): void {
    const title = this.newTaskTitle.trim();
    if (!title) return;
    this.taskService.create(title).subscribe((task) => {
      this.tasks.update((list) => [...list, task]);
      this.newTaskTitle = '';
    });
  }
}
