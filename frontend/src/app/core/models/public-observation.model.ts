export interface PublicProjectInfo {
  projectName: string;
  projectDescription?: string;
}

export interface CreatePublicObservationPayload {
  reporterName: string;
  reporterEmail: string;
  subject: string;
  description: string;
}

export interface PublicObservationResult {
  code: string;
}
