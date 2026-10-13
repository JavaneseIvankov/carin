export type Connectivity = 'online' | 'offline' | 'unknown';

export class OfflineError extends Error {
  constructor() {
    super('Perlu koneksi internet untuk menyimpan. Draft Anda tetap tersedia.');
    this.name = 'OfflineError';
  }
}

export function requireOnline(connectivity: Connectivity) {
  if (connectivity === 'offline') throw new OfflineError();
}

export function staleReadLabel(updatedAt: number, connectivity: Connectivity, locale = 'id-ID') {
  const date = new Date(updatedAt).toLocaleString(locale);
  return `${connectivity === 'offline' ? 'Offline · ' : ''}Data terakhir diperbarui ${date}`;
}
