export interface BulkImportRowError {
  row: number;
  reason: string;
}

export interface BulkImportResult {
  created: number;
  failed: number;
  errors: BulkImportRowError[];
}
