export type ReadinessRepository = {
  checkDatabase(): Promise<boolean>;
  checkSchema?(): Promise<boolean>;
};

export function createReadinessService(repository: ReadinessRepository): () => Promise<boolean> {
  return async () => {
    try {
      if (!await repository.checkDatabase()) return false;
      // The schema check is wired by the migration task. Until then, fail closed.
      return repository.checkSchema ? await repository.checkSchema() : false;
    } catch {
      return false;
    }
  };
}
