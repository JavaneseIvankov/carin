export type AppLogLevel = 'info' | 'warn' | 'error';

export type AppLogEntry = {
  event: string;
  timestamp: string;
  app: 'carin-app';
  [key: string]: string | number | boolean | null | undefined;
};

export function logAppEvent(
  level: AppLogLevel,
  event: string,
  details: Record<string, string | number | boolean | null | undefined> = {}
) {
  const entry: AppLogEntry = {
    timestamp: new Date().toISOString(),
    app: 'carin-app',
    event,
    ...details,
  };
  const serialized = JSON.stringify(entry);
  if (level === 'error') console.error(serialized);
  else if (level === 'warn') console.warn(serialized);
  else console.info(serialized);
}

export function errorLogDetails(error: unknown) {
  if (error && typeof error === 'object') {
    const candidate = error as { name?: unknown; status?: unknown; code?: unknown };
    return {
      errorType: typeof candidate.name === 'string' ? candidate.name : 'Error',
      ...(typeof candidate.status === 'number' ? { status: candidate.status } : {}),
      ...(typeof candidate.code === 'string' ? { errorCode: candidate.code } : {}),
    };
  }
  return { errorType: typeof error === 'string' ? 'ThrownString' : 'UnknownError' };
}
