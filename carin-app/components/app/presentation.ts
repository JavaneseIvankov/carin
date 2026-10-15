import { ApiError } from '@/lib/api/repository';
import { OfflineError } from '@/lib/data/network';

export function fieldLabel(label: string, unit?: string) {
  return unit ? `${label} (${unit})` : label;
}

export function fieldAccessibilityHint(hint?: string, error?: string) {
  return error ?? hint;
}

export function serviceErrorMessage(error: unknown) {
  if (error instanceof ApiError || error instanceof OfflineError) return error.message;
  if (typeof error === 'string' && error.trim()) return error;
  return 'Layanan belum tersedia. Periksa koneksi dan coba lagi.';
}
