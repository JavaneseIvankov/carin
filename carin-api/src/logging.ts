export type LogLevel = 'info' | 'warn' | 'error';

export type LogEntry = {
  timestamp: string;
  service: 'carin-api';
  event: string;
  [key: string]: string | number | boolean | null | undefined;
};

export function logEvent(
  level: LogLevel,
  event: string,
  details: Record<string, string | number | boolean | null | undefined> = {}
) {
  const line = JSON.stringify({
    timestamp: new Date().toISOString(),
    service: 'carin-api',
    event,
    ...details,
  } satisfies LogEntry);
  if (level === 'error') process.stderr.write(`${line}\n`);
  else process.stdout.write(`${line}\n`);
}

export function errorLogDetails(error: unknown) {
  if (error && typeof error === 'object') {
    const candidate = error as { name?: unknown; code?: unknown; status?: unknown };
    return {
      errorType: typeof candidate.name === 'string' ? candidate.name : 'Error',
      ...(typeof candidate.code === 'string' ? { errorCode: candidate.code } : {}),
      ...(typeof candidate.status === 'number' ? { upstreamStatus: candidate.status } : {}),
    };
  }
  return { errorType: typeof error === 'string' ? 'ThrownString' : 'UnknownError' };
}
