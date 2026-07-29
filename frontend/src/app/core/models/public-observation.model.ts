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

/** Only what an outsider may see about another reporter's observation. */
export interface PossibleDuplicate {
  code: string;
  subject: string;
  status: string;
  createdAt: string;
}
