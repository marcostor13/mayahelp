import { Category } from './category.model';

export interface Article {
  _id: string;
  title: string;
  content: string;
  category: Category;
  icon: string;
  views: number;
  popular: boolean;
  createdAt: string;
}
