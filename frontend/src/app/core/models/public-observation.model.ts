export interface PublicCategoryOption {
  id: string;
  name: string;
}

export interface PublicReporterOption {
  id: string;
  name: string;
}

export interface PublicProjectInfo {
  projectName: string;
  projectDescription?: string;
  defaultCategoryId?: string;
  categories: PublicCategoryOption[];
  reporters: PublicReporterOption[];
}

export interface CreatePublicObservationPayload {
  reporterId: string;
  description: string;
  category: string;
}

export interface PublicObservationResult {
  code: string;
}
