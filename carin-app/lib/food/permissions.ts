export type PhotoSource = 'camera' | 'gallery';

export function getPhotoPermissionFallback(source: PhotoSource, canAskAgain: boolean) {
  const label = source === 'camera' ? 'kamera' : 'galeri';
  return {
    showSettings: !canAskAgain,
    message: canAskAgain
      ? `Izin ${label} belum diberikan. Anda dapat mencoba lagi, memakai sumber foto lain, atau mencatat makanan yang sudah dimakan.`
      : `Izin ${label} diblokir. Buka Settings untuk mengubah izin, atau gunakan sumber foto lain/catatan manual.`,
  };
}
