export type CatalogImportFailure =
  | 'INVALID_CATALOG'
  | 'CATALOG_VERSION_CONFLICT'
  | 'CATALOG_VERSION_UNAVAILABLE';

export class CatalogImportError extends Error {
  constructor(
    readonly code: CatalogImportFailure,
    message: string,
  ) {
    super(message);
    this.name = 'CatalogImportError';
  }
}
