export interface SearchTicketHit {
  _id: string;
  code: string;
  subject: string;
  status: string;
}

export interface SearchArticleHit {
  _id: string;
  title: string;
}

export interface SearchClientHit {
  _id: string;
  name: string;
  email: string;
  company?: string;
}

export interface SearchProjectHit {
  _id: string;
  name: string;
  status: string;
}

export interface SearchResults {
  tickets: SearchTicketHit[];
  articles: SearchArticleHit[];
  clients: SearchClientHit[];
  projects: SearchProjectHit[];
}

export const EMPTY_SEARCH_RESULTS: SearchResults = {
  tickets: [],
  articles: [],
  clients: [],
  projects: [],
};

/** One row of the palette, whatever its origin. */
export interface PaletteItem {
  id: string;
  group: string;
  icon: string;
  label: string;
  sublabel?: string;
  route: string;
}
