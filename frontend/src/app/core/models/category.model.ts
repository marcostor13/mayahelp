export type CategoryType = 'ticket' | 'article';
export type AutoReplyMode = 'off' | 'draft' | 'auto';

export interface Category {
  _id: string;
  name: string;
  type: CategoryType;
  icon: string;
  description?: string;
  autoReplyMode: AutoReplyMode;
}

export interface CreateCategoryPayload {
  name: string;
  type: CategoryType;
  icon?: string;
  description?: string;
  autoReplyMode?: AutoReplyMode;
}
