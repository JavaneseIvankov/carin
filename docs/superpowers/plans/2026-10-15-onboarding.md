# Onboarding Pengguna Implementation Plan

> **Untuk sesi implementasi berikutnya:** Gunakan skill `executing-plans`, kerjakan task berurutan dengan checkpoint review, dan tetap di branch `feat/onboarding`.

**Goal:** Tampilkan onboarding satu kali per akun lintas perangkat setelah sesi authenticated pertama, lalu arahkan pengguna ke pencatatan makanan tanpa mewajibkan profil kesehatan.

**Architecture:** App API menyimpan `onboarding_completed_at` pada user record, menyajikan status serta completion idempotent, dan mobile memeriksa status melalui route gate bersama auth. Flow mobile terdiri dari Welcome Carousel, form Health Profile yang dapat disimpan atau dilewati, lalu Dashboard dengan empty state harian yang menjelaskan dua jalur pencatatan.

**Tech Stack:** Expo Router, React Native, TanStack Query, Hono, Drizzle ORM, PostgreSQL, OpenAPI 3.1.1, Vitest.

**Design:** `docs/superpowers/specs/2026-10-15-onboarding-design.md`

---

### Task 1: Tambahkan kontrak status onboarding

**Files:**
- Modify: `specs/contracts/app-api.openapi.yaml`
- Generate: `carin-app/lib/api/generated/app-api.ts`
- Generate: `carin-app/lib/api/generated/operations.ts`
- Generate: `carin-api/src/contracts/generated/app-api.ts`
- Generate: `carin-api/src/contracts/generated/schemas.ts`

- [ ] **Step 1: Tambahkan schema response onboarding**

Di `components.schemas`, tambahkan schema ini:

```yaml
    OnboardingState:
      type: "object"
      additionalProperties: false
      properties:
        completedAt:
          anyOf:
            - type: "string"
              format: "date-time"
            - type: "null"
      required: ["completedAt"]
```

- [ ] **Step 2: Tambahkan operasi baca status**

Di `paths`, tambahkan operasi berikut. Sertakan response `200` dengan `OnboardingState`, `401` dengan response error bersama, dan `default` dengan response error bersama.

```yaml
  "/api/v1/onboarding":
    get:
      operationId: "getOnboarding"
      summary: "Get current account onboarding completion state"
      responses:
        "200":
          description: "Successful response"
          content:
            "application/json":
              schema:
                $ref: "#/components/schemas/OnboardingState"
        "401":
          $ref: "#/components/responses/Error"
        default:
          $ref: "#/components/responses/Error"
```

- [ ] **Step 3: Tambahkan operasi completion idempotent**

```yaml
  "/api/v1/onboarding/complete":
    post:
      operationId: "completeOnboarding"
      summary: "Mark current account onboarding complete"
      responses:
        "200":
          description: "Successful response"
          content:
            "application/json":
              schema:
                $ref: "#/components/schemas/OnboardingState"
        "401":
          $ref: "#/components/responses/Error"
        default:
          $ref: "#/components/responses/Error"
```

- [ ] **Step 4: Regenerate clients and runtime validators**

Run from `carin-app/`:

```sh
pnpm run contracts:generate
```

Expected: app operations include `getOnboarding` as GET and `completeOnboarding` as POST; TypeScript schemas and API validators are regenerated in both packages.

- [ ] **Step 5: Validate the OpenAPI bundle**

Run from repository root, following `specs/05-verification-and-deployment.md`:

```sh
.venv/bin/python specs/validate-contracts.py
```

Expected: both contract documents validate, local references resolve, and generated runtime schemas include both operations.

- [ ] **Step 6: Commit the contract**

```sh
git add specs/contracts/app-api.openapi.yaml carin-app/lib/api/generated/app-api.ts carin-app/lib/api/generated/operations.ts carin-api/src/contracts/generated/app-api.ts carin-api/src/contracts/generated/schemas.ts
git commit -m "feat: add onboarding API contract"
```

### Task 2: Tulis integration tests API yang gagal terlebih dahulu

**Files:**
- Create: `carin-api/tests/integration/onboarding.integration.test.ts`

- [ ] **Step 1: Buat fixture Postgres dan account session**

Salin struktur lifecycle Docker, `createOwner`, dan resolver test dari `carin-api/tests/integration/dashboard.integration.test.ts`. Buat app dengan dependency account:

```ts
return createApp({
  readiness: async () => true,
  account: { db: database, resolveSession },
});
```

`createOwner` harus mengisi seluruh kolom user wajib yang dipakai `dashboard.integration.test.ts`, serta session valid untuk user tersebut.

- [ ] **Step 2: Tambahkan test status awal null**

```ts
it('returns an incomplete state for an account that has not completed onboarding', async () => {
  const owner = await createOwner();
  const response = await appFor(owner).request('/api/v1/onboarding', {
    headers: { 'x-test-user': owner.userId },
  });

  expect(response.status).toBe(200);
  expect(await response.json()).toEqual({ completedAt: null });
});
```

- [ ] **Step 3: Tambahkan test completion dan retry**

Panggil `POST /api/v1/onboarding/complete` dua kali untuk user yang sama. Kedua response harus `200`, berisi timestamp ISO yang sama. Query langsung kolom `user.onboarding_completed_at` setelah kedua panggilan dan pastikan nilainya sama dengan response pertama serta tidak berubah pada retry.

- [ ] **Step 4: Tambahkan batas autentikasi dan isolasi akun**

Verifikasi GET dan POST tanpa header test mengembalikan `401`. Buat dua owner, selesaikan onboarding owner pertama, lalu pastikan GET owner kedua tetap mengembalikan `{ completedAt: null }`.

- [ ] **Step 5: Jalankan test untuk memastikan test baru merah**

Run from `carin-api/`:

```sh
pnpm exec vitest run tests/integration/onboarding.integration.test.ts
```

Expected before route implementation: test lifecycle fails karena route onboarding belum terdaftar. Pastikan kegagalan bukan karena Docker startup atau fixture.

### Task 3: Tambahkan kolom account completion dan migrasi

**Files:**
- Modify: `carin-api/src/auth/options.ts`
- Generate: `carin-api/src/db/schema/auth.ts`
- Generate: `carin-api/drizzle/0012_onboarding_completion.sql`
- Generate: `carin-api/drizzle/meta/0012_snapshot.json`
- Generate: `carin-api/drizzle/meta/_journal.json`

- [ ] **Step 1: Daftarkan field server-only Better Auth**

Tambahkan ke `authOptions.user.additionalFields`:

```ts
onboardingCompletedAt: {
  type: 'date',
  required: false,
  input: false,
  returned: false,
},
```

- [ ] **Step 2: Regenerate schema auth**

Run from `carin-api/`:

```sh
pnpm run auth:generate
```

Expected: `src/db/schema/auth.ts` berisi `onboardingCompletedAt: timestamp('onboarding_completed_at')` yang nullable tanpa default.

- [ ] **Step 3: Generate migration bernama onboarding completion**

Run from `carin-api/`:

```sh
pnpm run db:generate -- --name=onboarding_completion
```

Expected: migration `drizzle/0012_onboarding_completion.sql` menambahkan kolom nullable tanpa backfill atau default; snapshot dan journal Drizzle maju satu nomor.

- [ ] **Step 4: Periksa SQL dan metadata hasil generator**

SQL harus setara dengan:

```sql
ALTER TABLE "user" ADD COLUMN "onboarding_completed_at" timestamp;
```

Jangan ubah migration sebelumnya. Jalankan `git diff --check` dan pastikan semua akun lama mendapat `NULL` setelah migrasi.

### Task 4: Implementasikan repository, service, dan route API

**Files:**
- Create: `carin-api/src/modules/onboarding/repository.ts`
- Create: `carin-api/src/modules/onboarding/service.ts`
- Create: `carin-api/src/modules/onboarding/routes.ts`
- Modify: `carin-api/src/app.ts`
- Test: `carin-api/tests/integration/onboarding.integration.test.ts`

- [ ] **Step 1: Implementasikan pembacaan status account**

Gunakan user ID dari session dan Drizzle schema. Kembalikan timestamp ISO atau null:

```ts
export type OnboardingState = { completedAt: string | null };

export async function readOnboardingState(db: Database, userId: string): Promise<OnboardingState> {
  const [row] = await db
    .select({ completedAt: user.onboardingCompletedAt })
    .from(user)
    .where(eq(user.id, userId));
  if (!row) throw new OnboardingAccountNotFoundError();
  return { completedAt: row.completedAt?.toISOString() ?? null };
}
```

Gunakan `timestamp('onboarding_completed_at')` tanpa timezone agar konsisten dengan kolom timestamp auth lain. Pastikan handler serialize nilai yang sama dengan schema response OpenAPI.

- [ ] **Step 2: Implementasikan completion atomik**

Gunakan satu `UPDATE ... RETURNING` agar dua perangkat yang menyelesaikan bersamaan mempertahankan timestamp pertama:

```ts
const [row] = await db
  .update(user)
  .set({ onboardingCompletedAt: sql`coalesce(${user.onboardingCompletedAt}, clock_timestamp())` })
  .where(eq(user.id, userId))
  .returning({ completedAt: user.onboardingCompletedAt });
if (!row || !row.completedAt) throw new OnboardingAccountNotFoundError();
return { completedAt: row.completedAt.toISOString() };
```

- [ ] **Step 3: Pasang GET dengan validasi response contract**

Di `registerOnboardingRoutes`, lindungi route dengan `requireSession(dependencies.resolveSession)`, panggil service memakai `session.userId`, dan validasi response melalui `validateResponse('app.getOnboarding', 200, state, { contentType: 'application/json' })` sebelum `c.json(state)`. Petakan account tidak ditemukan ke `404 RESOURCE_NOT_FOUND`.

- [ ] **Step 4: Pasang POST completion tanpa body**

Lindungi endpoint dengan session yang sama, panggil service completion untuk `session.userId`, validasi dengan operation ID `app.completeOnboarding`, dan kembalikan state yang sama bentuknya dengan GET. POST harus aman dipanggil ulang.

- [ ] **Step 5: Daftarkan routes di app**

Di blok `if (account)` pada `carin-api/src/app.ts`, setelah account/profile routes, tambahkan:

```ts
registerOnboardingRoutes(app, {
  db: account.db,
  resolveSession: account.resolveSession,
});
```

- [ ] **Step 6: Jalankan API integration tests**

Run from `carin-api/`:

```sh
pnpm exec vitest run tests/integration/onboarding.integration.test.ts
```

Expected: GET awal null, POST pertama menyimpan timestamp, retry menghasilkan timestamp yang sama, dan request unauthenticated/account lain ditolak atau tetap terisolasi.

- [ ] **Step 7: Commit backend API**

```sh
git add carin-api/src/auth/options.ts carin-api/src/db/schema/auth.ts carin-api/drizzle/0012_onboarding_completion.sql carin-api/drizzle/meta/0012_snapshot.json carin-api/drizzle/meta/_journal.json carin-api/src/modules/onboarding carin-api/src/app.ts carin-api/tests/integration/onboarding.integration.test.ts
git commit -m "feat: persist onboarding completion"
```

### Task 5: Tulis test keputusan route onboarding

**Files:**
- Create: `carin-app/lib/onboarding/routes.ts`
- Create: `carin-app/lib/onboarding/routes.unit.test.ts`

- [ ] **Step 1: Tulis test untuk seluruh state gate**

Test kondisi berikut sebelum implementasi helper:

Definisikan input helper sebelum menulis cases:

```ts
type OnboardingRouteInput = {
  authStatus: AuthStatus;
  authDecision: AuthRouteDecision;
  state: 'loading' | 'incomplete' | 'complete' | 'unavailable';
  segments: readonly string[];
  pathname: string;
  requestedDestination?: string | string[];
  bypassedUserId?: string | null;
  userId?: string | null;
};
type OnboardingRouteDecision =
  | { type: 'render' }
  | { type: 'loading' }
  | { type: 'redirect'; href: string };
```

Case inti: incomplete pada `/(tabs)` redirect ke `/(onboarding)/welcome`; complete pada `/(tabs)` render; unavailable pada route Dashboard render, dan unavailable pada route terlindungi lain redirect ke `/(tabs)`. Tambahkan case: route welcome/profil onboarding diizinkan saat incomplete; route onboarding dialihkan ke `returnTo` atau tab setelah complete; pathname terlindungi dan `next` dipertahankan; URL eksternal, auth route, traversal, dan query yang tidak valid ditolak; bypass berlaku hanya untuk user ID sesi saat ini.

- [ ] **Step 2: Jalankan test untuk memastikan helper belum tersedia**

Run from `carin-app/`:

```sh
pnpm exec vitest run lib/onboarding/routes.unit.test.ts
```

Expected: FAIL karena helper belum dibuat.

- [ ] **Step 3: Implementasikan fungsi route murni**

Ekspor tipe input/decision di atas dan `decideOnboardingRoute`. Jalankan `decideAuthRoute` terlebih dahulu: guest mengikuti redirect auth; route reset password tetap dirender; onboarding gate hanya berlaku untuk sesi authenticated yang sudah terverifikasi. Untuk sesi authenticated yang tiba dari sign-in, gunakan `requestedDestination` tervalidasi sebagai `returnTo`; jika pengguna sudah berada pada route protected, gunakan pathname saat ini. Validasi tujuan memakai `resolvePostSignInDestination` dari `lib/auth/routes.ts`; fallback selalu `/(tabs)`. Jika cached status incomplete memiliki `stale: true`, perlakukan sebagai `unavailable`; cached completion boleh dianggap complete karena state completion tidak dapat dibatalkan.

- [ ] **Step 4: Jalankan unit tests helper**

Run kembali:

```sh
pnpm exec vitest run lib/onboarding/routes.unit.test.ts
```

Expected: semua state dan return-route tests PASS.

### Task 6: Integrasikan API status dan gate ke auth flow

**Files:**
- Create: `carin-app/components/onboarding/onboarding-session.tsx`
- Modify: `carin-app/components/auth/auth-gate.tsx`
- Modify: `carin-app/app/_layout.tsx`
- Modify: `carin-app/lib/auth/routes.unit.test.ts`
- Test: `carin-app/lib/onboarding/routes.unit.test.ts`

- [ ] **Step 1: Tambahkan session-only bypass context**

`OnboardingSessionProvider` menyimpan user ID yang memilih melanjutkan ke Dashboard setelah status server gagal disimpan. Bypass hanya berlaku untuk user tersebut dalam sesi aktif dan dihapus saat sign-out atau pergantian user. Ekspor `useOnboardingSession()` dengan `allowDashboardForSession(userId)` dan `isBypassed(userId)`.

- [ ] **Step 2: Pasang provider di root layout**

Di `app/_layout.tsx`, render `Stack`, `PortalHost`, dan `AuthGate` sebagai anak `OnboardingSessionProvider` di dalam `AuthProvider`, sehingga route profil dan `AuthGate` memakai state sesi yang sama.

- [ ] **Step 3: Tambahkan query status ke AuthGate**

Panggil hook tanpa syarat agar aturan hook tetap dipenuhi: `useAppRead('getOnboarding', {}, { enabled: status === 'authenticated' })`. Payload ada di `query.data?.data.completedAt`, sedangkan `query.data?.stale` menandai cached response offline. Map fresh timestamp/null ke `complete`/`incomplete`; `isPending` tanpa data ke `loading`; error atau cache incomplete stale ke `unavailable`. Hitung auth decision lebih dulu, lalu onboarding decision agar guest tetap diarahkan ke sign-in dan reset-password tetap tersedia.

- [ ] **Step 4: Terapkan hasil gate tanpa redirect bersaing**

Jika auth belum diputuskan atau onboarding status sedang dimuat, tampilkan state loading. Jika state incomplete, redirect ke welcome dan sertakan `returnTo` tervalidasi melalui parameter route; jika route saat ini welcome/profil onboarding, biarkan route tersebut dirender. Jika complete dan route saat ini bagian dari flow welcome/profil, redirect ke `returnTo` atau `/(tabs)`. Jika state unavailable, fail-open ke Dashboard: render bila sudah di tab, selain itu redirect ke `/(tabs)`. Jika session bypass aktif untuk user ID yang sama, render protected route dan jangan memaksa onboarding lagi sampai sesi berakhir.

- [ ] **Step 5: Tambahkan route decision tests untuk auth kombinasi**

Verifikasi sign-in default, sign-in dengan deep link, restore session, guest route, reset route, incomplete route, complete route, status unavailable, dan bypass user mismatch. Jalankan:

```sh
pnpm exec vitest run lib/auth/routes.unit.test.ts lib/onboarding/routes.unit.test.ts
```

Expected: semua test auth lama tetap PASS bersama test onboarding baru.

### Task 7: Buat Welcome Carousel

**Files:**
- Create: `carin-app/app/(onboarding)/welcome.tsx`
- Create: `carin-app/components/onboarding/welcome-carousel.tsx`
- Create: `carin-app/lib/onboarding/welcome-slides.ts`
- Create: `carin-app/lib/onboarding/welcome-slides.unit.test.ts`

- [ ] **Step 1: Tulis unit tests data dan navigasi carousel**

Pastikan ada tiga slide berurutan untuk: pendekatan suportif, dua jalur pencatatan dengan waktu yang berbeda, dan profil opsional. Uji indeks awal `0`, tombol sebelumnya tidak turun di bawah `0`, tombol lanjut tidak melewati slide terakhir, dan CTA terakhir membuka profil.

- [ ] **Step 2: Definisikan konten carousel dalam data murni**

```ts
export const WELCOME_SLIDES = [
  { id: 'companion', title: 'Kenali pola makanmu tanpa menghakimi', body: 'Catatan membantu kamu melihat kembali apa yang sudah dimakan.' },
  { id: 'food-paths', title: 'Foto sebelum makan, catat manual setelahnya', body: 'Hasil foto baru masuk ke asupan setelah kamu mengonfirmasi konsumsi.' },
  { id: 'health-profile', title: 'Profil kesehatan tetap pilihanmu', body: 'Isi yang kamu ketahui untuk pertimbangan yang lebih sesuai, atau lewati dan lengkapi nanti.' },
] as const;
```

- [ ] **Step 3: Bangun komponen carousel dengan navigasi aksesibel**

Gunakan `Text`, `Button`, dan mascot asset yang sudah ada; tambahkan indikator posisi, tombol `Kembali`, `Lanjut`, `Lewati pengantar`, dan `Lanjut ke Profil`. Beri label aksesibilitas “Halaman N dari 3” serta target sentuh minimal 44 dp. `Lewati pengantar` tetap membuka route profil dengan `mode=onboarding` dan parameter `returnTo`.

- [ ] **Step 4: Hubungkan route welcome ke flow**

`app/(onboarding)/welcome.tsx` membaca `returnTo` tervalidasi, menampilkan komponen carousel, lalu melakukan `router.push` ke `/(onboarding)/health-profile` dengan `mode=onboarding` dan `returnTo` tersebut.

- [ ] **Step 5: Jalankan unit tests carousel**

```sh
pnpm exec vitest run lib/onboarding/welcome-slides.unit.test.ts
```

Expected: slide order dan batas navigasi PASS.

### Task 8: Hubungkan save/skip profil ke completion

**Files:**
- Modify: `carin-app/app/(onboarding)/health-profile.tsx`
- Create: `carin-app/lib/onboarding/profile-actions.ts`
- Create: `carin-app/lib/onboarding/profile-actions.unit.test.ts`
- Modify: `carin-app/components/onboarding/onboarding-session.tsx`

- [ ] **Step 1: Tulis tests untuk perubahan profil yang belum disimpan**

Uji helper pembanding current profile dan seluruh input draft untuk: tidak ada perubahan, perubahan tinggi/berat (termasuk teks sementara yang belum valid), perubahan choice field, entri alergi/diagnosis, serta teks kondisi/riwayat/alergi yang belum ditambahkan. Uji skip tanpa perubahan tidak meminta konfirmasi; skip dengan perubahan meminta konfirmasi sebelum membuang draft. Batalkan konfirmasi harus mempertahankan isi form.

- [ ] **Step 2: Tambahkan mode onboarding dan return route**

Parse `mode` dan `returnTo` melalui `useLocalSearchParams`. Hanya `mode=onboarding` yang menjalankan completion; akses Health Profile dari Dashboard/Profil tetap memakai navigasi yang sekarang.

- [ ] **Step 3: Implementasikan finish setelah save**

Pertahankan validasi dan `updateProfile.mutateAsync`. Setelah update profil berhasil pada mode onboarding, jalankan `useAppWrite('completeOnboarding').mutateAsync({})`, lalu `router.replace(returnTo ?? '/(tabs)')`. Jika completion gagal, jelaskan bahwa profil tersimpan tetapi status onboarding belum tersimpan; tampilkan `Coba lagi` (hanya mengulang endpoint completion) dan `Lanjut ke Dashboard` (memanggil `allowDashboardForSession(user.id)` sebelum navigasi). Jangan mengirim ulang profile update saat retry completion.

- [ ] **Step 4: Implementasikan skip yang tidak mengubah profil**

Pada `Isi nanti` mode onboarding, jangan memanggil `updateProfile`. Panggil completion endpoint lalu ke `returnTo` atau `/(tabs)`. Jika endpoint gagal, tombol retry mengulang POST; tombol lanjut memanggil `allowDashboardForSession(user.id)` sebelum navigasi. Pada mode profil biasa, pertahankan route behavior yang ada.

- [ ] **Step 5: Jalankan tests action helper dan onboarding routing**

```sh
pnpm exec vitest run lib/onboarding/profile-actions.unit.test.ts lib/onboarding/routes.unit.test.ts
```

Expected: save/skip transition, draft confirmation, and return-route cases PASS.

### Task 9: Sempurnakan first-meal activation di Dashboard

**Files:**
- Modify: `carin-app/components/dashboard/dashboard-screen.tsx`
- Review: `carin-app/lib/dashboard/presentation.ts`
- Test: `carin-app/lib/dashboard/presentation.unit.test.ts` (only if empty-state selection logic changes)

- [ ] **Step 1: Ganti copy empty state yang mengklaim makanan pertama seumur akun**

Ganti heading `Catatan pertamamu dimulai di sini.` dengan copy harian `Belum ada catatan konsumsi hari ini.` dan pertahankan penjelasan bahwa foto baru menambah asupan setelah pengguna mengonfirmasi konsumsi.

- [ ] **Step 2: Pastikan kedua tindakan tetap menjelaskan waktunya**

Pertahankan tombol yang sudah ada menuju `/consumptions/new` dengan subtitle `Sudah dikonsumsi` dan `/food/capture` dengan subtitle `Sebelum makan`. Jangan menambahkan target harian atau membuat analisis foto otomatis menjadi konsumsi.

- [ ] **Step 3: Jalankan test dashboard presentation yang terdampak**

Jika perubahan hanya copy JSX, tidak perlu menambah unit test baru; verifikasi empty-state logic yang sudah ada tetap PASS:

```sh
pnpm exec vitest run lib/dashboard/presentation.unit.test.ts lib/dashboard/dashboard-query.integration.test.ts
```

### Task 10: Verifikasi lintas kontrak, API, dan mobile

**Files:**
- Review all files listed above
- Modify tests only when they expose a requirement gap from the approved design

- [ ] **Step 1: Validasi OpenAPI dan generated contracts**

Run from repository root:

```sh
.venv/bin/python specs/validate-contracts.py
```

Run from `carin-app/`:

```sh
pnpm run contracts:check
```

Expected: validator and generated contract check pass.

- [ ] **Step 2: Jalankan pemeriksaan API**

Run from `carin-api/`:

```sh
pnpm run typecheck
pnpm run lint
pnpm run test:unit
pnpm run test:integration
pnpm run build
```

Expected: all commands exit 0. Integration tests require Docker per `carin-api/AGENTS.md`.

- [ ] **Step 3: Jalankan pemeriksaan mobile**

Run from `carin-app/`:

```sh
pnpm run typecheck
pnpm run lint
pnpm run test:unit
pnpm run test:integration
pnpm run contracts:check
```

Expected: all commands exit 0. Package manifests do not define an E2E script; do not invent one.

- [ ] **Step 4: Smoke test di web dan Android**

From `carin-app/`, run `pnpm run web` and `pnpm run android` in separate sessions. Verify an incomplete account follows login → carousel → profile save/skip → Dashboard; a completed account opens Dashboard on a second device/session; a protected deep link resumes after onboarding; status read/write failures do not lock Dashboard; and layout remains readable at 320 dp and 390 dp.

- [ ] **Step 5: Final review and handoff**

Run `git diff --check` and `git status --short --branch`. Handoff must report migration, API operations, affected app routes, exact verification results, platform/device checked, any unavailable checks, and remaining uncommitted work. Keep the branch in review until the user approves the handoff.

## Implementation acceptance checklist

- Existing and new accounts with no server completion status see onboarding once, and the status is shared across devices.
- Authenticated users can move through the carousel or skip its introduction, then save or skip the optional profile step.
- Skipping profile never writes blank/default profile fields; existing health data remains intact.
- Profile save failures retain the current error/draft behavior; completion failures remain retryable and fail open for Dashboard.
- A failed completion only bypasses the gate for the current user and current session; the next session checks server status again.
- Safe deep links survive auth and onboarding; unsafe destinations are rejected.
- Daily meal entry distinguishes photo analysis before eating from manual entry after eating; scan results enter consumption only after explicit confirmation.
- AI consent remains a separate action before first AI processing.

## Plan review notes

- Account completion is persisted on the existing user record, so old accounts start incomplete and account deletion cascades naturally with the user record.
- Health Profile skip is available on the profile step and never writes a default/empty profile payload.
- The completion endpoint is idempotent across repeated taps and devices; concurrent updates retain the first timestamp.
- Routing honors verified auth state before onboarding and carries only destinations accepted by `resolvePostSignInDestination`.
- A status-read outage opens Dashboard; a completion-write outage offers retry and a per-session, per-user Dashboard bypass.
- Tests are listed as implementation steps only; no implementation tests have been run while preparing this plan.
