export type CategoryType = 'ticket' | 'article';

export interface Category {
  _id: string;
  name: string;
  type: CategoryType;
  icon: string;
  description?: string;
}
