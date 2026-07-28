import { Component, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { ArticleService } from '../../core/services/article.service';
import { CategoryService } from '../../core/services/category.service';
import { Article } from '../../core/models/article.model';
import { Category } from '../../core/models/category.model';

@Component({
  selector: 'app-help-center',
  imports: [FormsModule, RouterLink],
  templateUrl: './help-center.html',
})
export class HelpCenter implements OnInit {
  protected readonly categories = signal<Category[]>([]);
  protected readonly articles = signal<Article[]>([]);
  protected readonly loading = signal(true);
  protected search = '';
  protected activeCategory: string | null = null;

  constructor(
    private readonly articleService: ArticleService,
    private readonly categoryService: CategoryService,
  ) {}

  ngOnInit(): void {
    this.categoryService.list('article').subscribe((categories) => this.categories.set(categories));
    this.loadArticles();
  }

  loadArticles(): void {
    this.loading.set(true);
    this.articleService
      .list({ category: this.activeCategory ?? undefined, search: this.search || undefined })
      .subscribe((articles) => {
        this.articles.set(articles);
        this.loading.set(false);
      });
  }

  selectCategory(categoryId: string): void {
    this.activeCategory = this.activeCategory === categoryId ? null : categoryId;
    this.loadArticles();
  }
}
