export const WELCOME_SLIDES = [
  {
    id: 'companion',
    title: 'Kenali pola makanmu tanpa dihakimi',
    body: 'Catatan bisa membantumu melihat kembali apa yang sudah dimakan, dengan ritme yang nyaman.',
  },
  {
    id: 'food-paths',
    title: 'Foto sebelum makan, catat manual setelahnya',
    body: 'Pakai foto untuk melihat perkiraan. Catatan konsumsi tersimpan setelah kamu mengonfirmasi makanan yang sudah dimakan.',
  },
  {
    id: 'health-profile',
    title: 'Profil kesehatan tetap pilihanmu',
    body: 'Lengkapi yang kamu ketahui di langkah profil, atau pilih “Isi nanti”. Kamu bisa melengkapinya kapan saja.',
  },
] as const;

export type WelcomeSlideId = (typeof WELCOME_SLIDES)[number]['id'];
export type WelcomeAction = { type: 'slide'; index: number } | { type: 'profile' };

function clampIndex(index: number): number {
  return Math.max(0, Math.min(WELCOME_SLIDES.length - 1, Math.trunc(index)));
}

export function getPreviousWelcomeIndex(index: number): number {
  return Math.max(0, clampIndex(index) - 1);
}

export function getNextWelcomeAction(index: number): WelcomeAction {
  const current = clampIndex(index);
  if (current === WELCOME_SLIDES.length - 1) return { type: 'profile' };
  return { type: 'slide', index: current + 1 };
}
