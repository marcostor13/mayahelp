import { Component, OnInit, signal } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { ArticleService } from '../../../core/services/article.service';
import { Article } from '../../../core/models/article.model';

@Component({
  selector: 'app-article-detail',
  imports: [RouterLink],
  templateUrl: './article-detail.html',
})
export class ArticleDetail implements OnInit {
  protected readonly article = signal<Article | null>(null);
  protected readonly loading = signal(true);

  constructor(
    private readonly route: ActivatedRoute,
    private readonly articleService: ArticleService,
  ) {}

  ngOnInit(): void {
    const id = this.route.snapshot.paramMap.get('id')!;
    this.articleService.getById(id).subscribe((article) => {
      this.article.set(article);
      this.loading.set(false);
    });
  }
}
