export type AuthEmailInput = {
  kind: 'verification' | 'password-reset';
  to: string;
  url: string;
};

type AuthEmail = {
  subject: string;
  html: string;
  text: string;
};

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => {
    switch (character) {
      case '&': return '&amp;';
      case '<': return '&lt;';
      case '>': return '&gt;';
      case '"': return '&quot;';
      case "'": return '&#39;';
      default: return character;
    }
  });
}

export function renderAuthEmail(input: AuthEmailInput): AuthEmail {
  const safeTo = escapeHtml(input.to);
  const safeUrl = escapeHtml(input.url);
  const title = input.kind === 'verification'
    ? 'Verifikasi alamat email'
    : 'Atur ulang kata sandi';
  const subject = input.kind === 'verification'
    ? 'Verifikasi email Carin'
    : 'Atur ulang kata sandi Carin';
  const instruction = input.kind === 'verification'
    ? 'Gunakan tautan berikut untuk memverifikasi alamat email akun Carin Anda.'
    : 'Gunakan tautan berikut untuk mengatur ulang kata sandi akun Carin Anda.';
  const action = input.kind === 'verification' ? 'Verifikasi email' : 'Atur ulang kata sandi';

  return {
    subject,
    html: `<!doctype html>
<html lang="id">
  <body>
    <main>
      <h1>${title}</h1>
      <p>${instruction}</p>
      <p>Alamat email: ${safeTo}</p>
      <p><a href="${safeUrl}">${action}</a></p>
      <p>Jika Anda tidak meminta ini, abaikan email ini.</p>
    </main>
  </body>
</html>`,
    text: `${title}\n\n${instruction}\n\nAlamat email: ${input.to}\n\n${action}: ${input.url}\n\nJika Anda tidak meminta ini, abaikan email ini.`,
  };
}
