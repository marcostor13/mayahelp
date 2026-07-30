export interface PublicCategoryOption {
  id: string;
  name: string;
}

export interface PublicProjectInfo {
  projectName: string;
  projectDescription?: string;
  defaultCategoryId?: string;
  categories: PublicCategoryOption[];
}

export interface CreatePublicObservationPayload {
  reporterName: string;
  reporterEmail: string;
  subject: string;
  description: string;
  category: string;
}

export interface PublicObservationResult {
  code: string;
}
