export function resolveExaminationTimezoneRead({
  timezone,
  isPending,
  error,
}: {
  timezone?: string;
  isPending: boolean;
  error: unknown;
}) {
  if (error !== null && error !== undefined) {
    return { status: 'error' as const, timezone, submissionDisabled: true };
  }
  if (timezone) {
    return { status: 'ready' as const, timezone, submissionDisabled: false };
  }
  return {
    status: isPending ? ('loading' as const) : ('missing' as const),
    timezone: undefined,
    submissionDisabled: true,
  };
}
