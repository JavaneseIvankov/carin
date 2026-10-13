# Carin Orchestration Plan

> **For agentic workers:** Gunakan skill `subagent-driven-development` untuk implementasi task terpilih, atau `executing-plans` untuk eksekusi berurutan. Baca panduan repo dan module sebelum setiap penugasan. Checklist di dokumen ini mengatur orkestrasi; detail implementasi dibuat per task yang siap.

**Goal:** Mengubah 36 task Carin menjadi urutan delegasi yang menjaga kontrak, pekerjaan contributor, dan bukti verifikasi.

**Architecture:** Orchestrator membaca board melalui CLI, menentukan dependency gate dan pemilik file, lalu mendelegasikan task terisolasi kepada maksimal tiga worker. Orchestrator mereview hasil dan menjalankan verifikasi integrasi sebelum membuka pekerjaan downstream. Dokumen ini adalah rencana koordinasi, bukan klaim implementasi atau laporan kelulusan acceptance criteria.

**Tech Stack:** Scaffold Expo 56/React Native/NativeWind; Hono/Node.js/TypeScript, Better Auth/Resend, PostgreSQL/Drizzle, MinIO dan AI REST internal mengikuti spec. Framework/provider AI belum dipilih.

Tanggal audit: 13 Oktober 2026. Baseline spec/kontrak: 1.0.0.

## Sumber dan keadaan awal

- Instruksi: `AGENTS.md`, `carin-app/AGENTS.md`.
- Keputusan: `specs/00-mvp-scope-and-decisions.md`; UX, domain, arsitektur, AI/data dan verifikasi pada spec 01–05.
- Payload: `specs/contracts/app-api.openapi.yaml`, `ai-service.openapi.yaml`.
- Board: `tsk list --json` dan `tsk list T1 --json` sampai `T36`. Semua 36 task berstatus `open`; tidak ada task `ready`, `started`, `blocked` atau `review` pada snapshot project ini.
- Prefix Cxx dipetakan ke nomor Txx lewat hasil CLI; pemetaan saat ini sama, tetapi harus dicek ulang saat penugasan.
- `carin-app/app/index.tsx` masih starter; `app/_layout.tsx` baru tema/Stack/PortalHost. Belum ada alur produk, API client atau persistence session.
- `carin-api/` belum ada. `ai-service/` ada sebagai direktori kosong. Belum ada catalog/rules real, runtime AI atau laporan evaluasi dalam repo.
- `carin-app/package.json` hanya punya scripts `dev`, `android`, `ios`, `web`, `clean`; belum ada script lint/typecheck/test.
- Kondisi Git sebelum pekerjaan: `?? .superpowers/`. Direktori ini adalah pekerjaan existing dan harus dipertahankan.

## Delegasi konteks yang sudah dilakukan

| Worker | Model / reasoning | Scope read-only |
| --- | --- | --- |
| mobile_context | gpt-6-luna / high | Scaffold mobile, UX, dependency layar dan batas platform |
| backend_context | gpt-6-sol / medium | Backend, domain, auth, DB, worker, deletion dan infra |
| ai_context | gpt-6-luna / high | Kontrak AI, fixture, catalog/rules dan gate real AI |

Ketiganya tidak menulis kode atau mengubah board. Temuan dirangkum di dokumen ini; klaim diverifikasi terhadap file repo. Rekomendasi model berikut adalah kebijakan penugasan berdasarkan kompleksitas, bukan perbandingan harga terukur.

## Kebijakan worker dan integrasi

- [ ] Baca detail task terbaru melalui `tsk list Txx --json` dan periksa `git status --short` sebelum dispatch.
- [ ] Pastikan seluruh dependency mempunyai artefak yang sudah direview dan diverifikasi pada checkout integrasi. Status board saja tidak membuktikan dependency selesai; task yang sudah diserahkan sebagai `review` dapat menjadi dasar teknis setelah verifikasi integrasi, tanpa otomatis mengubahnya ke `done`.
- [ ] Pilih `gpt-6-luna` untuk pekerjaan terisolasi: dokumentasi/config sederhana, test fixture yang kontraknya jelas, dan layar leaf.
- [ ] Pilih `gpt-6-sol` untuk tooling lintas modul, schema, auth/session, API client, transaction, job concurrency, snapshot, media ownership dan deletion. Naikkan kompleksitas review sebelum memakai model lebih mahal.
- [ ] Batasi tiga worker aktif selain orchestrator. Default satu task per worker; jangan menjalankan dua penulis pada file yang sama.
- [ ] Prompt worker harus self-contained: nomor task dan notes utuh, referensi spec, file yang dimiliki, dependency yang sudah tersedia, acceptance/failure cases, checks dari manifest, dan format handoff.
- [ ] Worker tidak boleh mengubah kontrak bersama, dependency/version, root config, migration atau generated output di luar scope tanpa koordinasi orchestrator.
- [ ] Gunakan checkout/worktree terisolasi saat implementasi memerlukan isolasi; baca skill `using-git-worktrees` saat eksekusi. Integrasi dilakukan berurutan.
- [ ] Satu pemilik melakukan perubahan status melalui CLI setelah membaca `tsk help status`; satu pemilik untuk notes/steps. Worker melaporkan hasil kepada orchestrator.
- [ ] Saat pekerjaan terverifikasi selesai, serahkan task sebagai `review`. `done` hanya atas keputusan pengguna.
- [ ] Tulis hasil verifikasi dan keterbatasan ke catatan handoff yang tersimpan di repo atau task notes. Jangan mengganti notes task utuh tanpa mempertahankan brief.
- [ ] Jangan menjalankan deploy, mengirim pesan ke orang lain, atau mengganti pekerjaan existing sebagai bagian pengumpulan konteks ini.

## Branch dan worktree

Konvensi pengguna: `main`, `dev`, `feat/*`, `fix/*`, `chore/*`, dan `docs/*` sesuai jenis perubahan. Tidak memakai prefix `orch/*` atau `task/*`.

| Branch | Peran / contoh |
| --- | --- |
| `main` | Hasil rilis stabil; integrasi dari `dev` setelah gate release |
| `dev` | Integrasi development yang direview dan diverifikasi orchestrator |
| `chore/t1-tooling` | Tooling, automated checks dan CI |
| `feat/t2-api-foundation` | Fondasi HTTP backend |
| `feat/t3-database-schema` | Schema dan migrations aplikasi |
| `chore/t5-contract-codegen` | Generated types dan harness kontrak |
| `feat/t31-ai-data-artifacts` | Artifact katalog/rules real sesuai gate data |
| `fix/<deskripsi>` | Perbaikan bug terisolasi |
| `docs/<deskripsi>` | Perubahan dokumentasi terisolasi |

- Setiap task mempunyai branch pendek dari commit `dev` terbaru yang sudah diverifikasi. Nomor Txx pada branch membantu penelusuran board; gunakan slug lowercase kebab-case.
- Checkout utama saat audit sudah berada di `dev` dan menjadi lokasi integrasi orchestrator. Jangan mencoba checkout `dev` yang sama pada worktree kedua.
- Maksimal tiga worktree worker aktif, satu branch task per worktree. Lokasi usulan `.worktrees/t1-tooling`, `.worktrees/t31-ai-data-artifacts`, dan seterusnya; pastikan direktori di-ignore sebelum dibuat.
- Orchestrator mereview dan mengintegrasikan commit task secara berurutan ke `dev`, kemudian menjalankan checks integrasi. Task downstream bercabang dari commit `dev` yang telah memuat dependency terverifikasi.
- Pertahankan perubahan existing pada checkout utama; dokumen rencana untracked tidak otomatis ikut ke worktree baru. Sertakan melalui commit dokumentasi terfokus atau konteks penugasan yang self-contained sebelum dispatch.
- Bersihkan worktree task hanya setelah handoff aman; jangan hapus branch/commit yang masih diperlukan untuk review. Integrasi ke `main` mengikuti gate release, bukan setiap task selesai.

## Urutan awal yang konkret

### Jalur A — tooling dan backend foundation

1. **T1/C01**, owner tooling, model gpt-6-sol. Scope `carin-app/package.json`, tooling/config/test harness, CI, dependency validator yang dipin dan bootstrap manifest backend.
   - T1 membutuhkan checks backend, sementara backend belum ada dan T2 bergantung pada T1. Batasi bootstrap T1 pada package/tooling minimum; Hono handler, server dan behavior tetap milik T2.
   - Pin tanpa upgrade massal; pertahankan Expo 56.
   - Gate: checks yang benar-benar ada pada manifest baru dapat dijalankan dan kegagalan schema/type/test terdeteksi CI.
2. **T2/C02**, owner backend foundation, model gpt-6-sol; setelah T1 diverifikasi.
   - Scope yang dinyatakan board: `carin-api/src/app.ts`, entry server, config, error envelope, request ID, health dan middleware hooks.
   - Gate: smoke tests health/error/invalid env; readiness DB dan AI health berbeda; log tidak memuat token/body kesehatan.
3. **T3/C03 dan T5/C05**, dua worker setelah T2.
   - T3 memiliki `carin-api/src/db/schema/` dan migrations; schema auth dihasilkan dari konfigurasi Better Auth yang dipin.
   - T5 memiliki `carin-api/src/contracts/`, `carin-app/lib/api/generated/`, type generation/runtime validation/drift harness.
   - Konfigurasi generator/package/CI tetap satu pemilik integrasi. Selaraskan versi dan konfigurasi schema auth minimum di T3 dengan T8 sebelum menghasilkan migrations.
4. Setelah T3/T5, isi slot sesuai kebutuhan: T6 domain helpers dan T15 AI adapter membuka backend food; T10 membuka mobile. T4 infra menunggu T3, T7 legal menunggu T3/T5.
   - Maksimal tiga worker; pilih task siap yang membuka paling banyak downstream dan tidak berebut file.
   - T32 hanya siap bila T31 benar-benar memenuhi gate data/rules, bukan setelah folder/template dibuat.

### Jalur B — persiapan sumber AI/data

1. **T31/C31** dapat mulai paralel dengan T1. Worker awal gpt-6-luna untuk inventaris/template; gpt-6-sol untuk schema/provenance validator.
2. Output awal aman: rancangan artifacts di `ai-service/data/`, template sumber/izin/item/preparation/per100g/serving, metadata review, rule schema internal dan draft capability manifest.
3. Rule artifact lengkap tidak dimodelkan langsung oleh OpenAPI; schema internal boleh terpisah tetapi rule IDs/version/citations harus konsisten dengan result/manifest. Metadata izin dataset dapat berada di sidecar internal; jangan diam-diam menambah wire field.
4. Kandidat nasi/ayam/diabetes/hipertensi bukan supported scope. Angka gizi, takaran atau threshold tidak boleh dibuat untuk melengkapi template.
5. Data/rules sumber yang dapat ditelusuri dan scope approval tim merupakan gate T31. Manifest personal support kosong tidak membuktikan personalisasi selesai.
6. Provider/framework/model AI dipilih di T32 berdasarkan kebutuhan dan evaluasi; tidak dikunci oleh rencana orkestrasi ini.

## Peta seluruh board

Dependency berikut berasal dari notes board. Nomor task perlu dicek ulang sebelum eksekusi.

| Task | Hasil | Dependency |
| --- | --- | --- |
| T1 | C01: Siapkan tooling dan automated checks | — |
| T2 | C02: Bangun fondasi HTTP Hono di carin-api | T1 |
| T3 | C03: Buat schema Drizzle dan migration PostgreSQL | T1, T2 |
| T4 | C04: Siapkan container dan environment development | T2, T3 |
| T5 | C05: Generate types dan harness kontrak API | T1, T2 |
| T6 | C06: Implementasikan helper domain deterministik | T1, T5 |
| T7 | C07: Sediakan dokumen legal dan consent versioned | T2, T3, T5 |
| T8 | C08: Implementasikan auth Better Auth di carin-api | T2, T3, T5, T6, T7 |
| T9 | C09: Integrasikan Resend dan email deep links | T4, T8 |
| T10 | C10: Bangun shell mobile dan client data | T1, T5 |
| T11 | C11: Bangun auth mobile dan persistent session | T8, T9, T10 |
| T12 | C12: Implementasikan profil dan pengaturan carin-api | T3, T5, T6, T8 |
| T13 | C13: Bangun onboarding dan profil kesehatan mobile | T7, T11, T12, T14 |
| T14 | C14: Implementasikan import dan search katalog versi | T3, T5, T6, T15 |
| T15 | C15: Bangun adapter AI real dan fixture kontraktual | T2, T5 |
| T16 | C16: Bangun durable job worker dan publikasi aman | T3, T4, T5, T7, T15 |
| T17 | C17: Implementasikan foto privat dan signed media | T3, T4, T5, T8 |
| T18 | C18: Implementasikan scan dan koreksi carin-api | T6, T8, T12, T14, T16, T17 |
| T19 | C19: Bangun capture dan hasil analisis mobile | T10, T11, T13, T18 |
| T20 | C20: Bangun koreksi komponen dan porsi mobile | T14, T19 |
| T21 | C21: Implementasikan konsumsi dan snapshot carin-api | T6, T8, T12, T14, T16, T18 |
| T22 | C22: Bangun catatan konsumsi manual dan edit mobile | T10, T11, T14, T21 |
| T23 | C23: Bangun konfirmasi konsumsi dari scan mobile | T19, T20, T21, T22 |
| T24 | C24: Implementasikan pemeriksaan dan series carin-api | T3, T5, T6, T8 |
| T25 | C25: Bangun pemeriksaan dan grafik mobile | T10, T11, T24 |
| T26 | C26: Implementasikan ringkasan dashboard carin-api | T6, T12, T21, T24 |
| T27 | C27: Bangun Beranda dan kartu dashboard mobile | T13, T22, T25, T26 |
| T28 | C28: Bangun riwayat analisis dan konsumsi mobile | T19, T22, T23 |
| T29 | C29: Implementasikan scan dan account deletion durable | T3, T8, T16, T17, T18, T21, T24 |
| T30 | C30: Bangun hapus akun dan scan di mobile | T11, T13, T19, T28, T29 |
| T31 | C31: Siapkan katalog dan aturan kesehatan real | — |
| T32 | C32: Implementasikan REST AI service nyata | T5, T31 |
| T33 | C33: Evaluasi AI dan integrasikan mode real | T14, T15, T16, T18, T21, T32 |
| T34 | C34: Uji integrasi lintas akun dan failure modes | T9, T18, T21, T24, T26, T29, T33 |
| T35 | C35: Uji mobile E2E dan polish aksesibilitas | T11, T13, T19, T20, T22, T23, T25, T27, T28, T30, T33 |
| T36 | C36: Deploy staging/prod dan siapkan demo handoff | T4, T9, T29, T33, T34, T35 |

## Lapisan dependency

Tabel ini menunjukkan kedalaman DAG, bukan instruksi menjalankan seluruh baris sekaligus. Gunakan antrean dinamis maksimal tiga worker: task boleh mulai segera setelah dependency spesifiknya lolos gate, tanpa menunggu semua task pada lapisan sebelumnya. T31 dapat tertahan pada sumber/review manusia; jalur fixture mobile/backend tetap bisa maju.

| Lapisan | Task yang memenuhi dependency jika lapisan pendahulunya selesai |
| --- | --- |
| 1 | T1, T31 |
| 2 | T2 |
| 3 | T3, T5 |
| 4 | T4, T6, T7, T10, T15, T32 |
| 5 | T8, T14, T16 |
| 6 | T9, T12, T17, T24 |
| 7 | T11, T18 |
| 8 | T13, T21, T25 |
| 9 | T19, T22, T26, T29, T33 |
| 10 | T20, T27, T34 |
| 11 | T23 |
| 12 | T28 |
| 13 | T30 |
| 14 | T35 |
| 15 | T36 |

## Kepemilikan file yang perlu dikunci

| Area | Pemilik integrasi | Pembagian |
| --- | --- | --- |
| Package, lockfile, tsconfig, test config, CI | Owner tooling T1, lalu orchestrator | Request dependency dikumpulkan; satu penulis per manifest/lockfile |
| App root layout, tabs dan shared client | T10 | T11 mengintegrasikan session setelah shell stabil; feature task memiliki layar leaf |
| Generated contract types/runtime schema | T5 | Worker konsumen tidak mengedit generated files atau menyalin interface manual |
| DB schema/migrations | T3, kemudian owner DB terpilih | Modul menyampaikan kebutuhan schema; generate dan integrate migrations berurutan |
| Legal/consent ↔ jobs | T7 dan owner worker T16 | Withdrawal/publication transaction mempunyai test lintas modul |
| Profile screen dan account deletion UI | T13 lalu T30 | Delete flow sebagai komponen/fitur terpisah sampai integrasi route profil |
| Editor komponen/porsi | Owner bersama sebelum T20/T22/T23 | Sepakati props/domain contract; hindari tiga implementasi berbeda |
| Katalog, manifest, versions | T31/T32 untuk artifact; T14 untuk import | Backend dan AI menggunakan versi immutable yang sama |
| API app registry/config/infra | Owner backend/infra | Feature worker menambah modul terisolasi; wiring disatukan berurutan |

## Invariant yang harus masuk brief dan review

- Auth: usia 18–50 saat registrasi dihitung server kalender Asia/Jakarta, termasuk birthday/leap day; signup/update vendor tidak bisa bypass aturan. Email verified dan session server menentukan akses; reset/logout mencabutnya.
- Consent: terms/privacy versioned wajib registrasi, AI consent terpisah. Withdrawal/deletion menahan new/pending publication.
- Job: durable PostgreSQL lease/fencing/generation, restart/retry dan late AI tidak menggandakan result atau mempublikasikan data setelah revoke/delete.
- Food: scan-only tidak menambah intake. Consumption eksplisit, idempotent dan memakai revision terbaru; failed correction mempertahankan result sebelumnya.
- Math: null berbeda dari zero, coverage per nutrient, half portion konsisten, source/catalog/profile snapshot immutable.
- Manual consumption tetap dapat dipakai tanpa kamera, foto atau scan.
- Ownership: account A tidak dapat memakai ID/media/job/data account B.
- Deletion: revoke/deny akses segera, cleanup DB/media durable meskipun AI masih in-flight; consumption snapshot yang bertahan setelah scan deletion mengikuti domain.
- Exam/dashboard: measured date/context menentukan latest/series, bukan urutan insert; satu titik tidak diklaim tren, empty data tidak dianggap normal atau intake lengkap.
- AI: source-backed deterministic math/rules; unsupported condition, critical missing data, allergy limitation dan conflicts terlihat. Fixture dev/test tetap berlabel synthetic.

## Verifikasi dan blocker yang sudah diketahui

**Dijalankan dari root repo:** `python specs/validate-contracts.py`.

**Hasil aktual:** exit 1, `ModuleNotFoundError: No module named 'openapi_spec_validator'`. Validator berhenti sebelum memvalidasi kontrak/fixture; belum ada klaim lulus. T1 perlu menyiapkan dependency validator secara reproducible lalu mengulang command ini.

Instruksi spec saat ini: `python -m pip install PyYAML jsonschema openapi-spec-validator`, kemudian validator. Rencana T1 memin versi dalam environment terisolasi; pengumpulan konteks ini tidak memasang dependency.

Belum tersedia script automated app/API pada manifest saat audit. Worker harus menemukan/menambahkan script yang sesuai task, lalu melaporkan command/cwd/output aktual. Validator spec bukan bukti endpoint, auth, transaction, MinIO atau kualitas AI.

Blocker untuk real/demo:
- Catalog/serving/source/izin dan rule-condition yang ditinjau tim; supported scope serta manifest versioned.
- Foto held-out berlabel dan reference portion, sample count/per-food outcomes/limitations, golden math/attention dan consumer/provider tests.
- Resend verified sender dan akses email/deep-link nyata; PostgreSQL/MinIO/HTTPS serta secrets per environment.
- Pemilihan dan pengujian perangkat demo. iOS simulator memerlukan macOS; web tidak membuktikan native camera/session/deep-link.
- Build config/deep-link per environment; scaffold sekarang memakai scheme `carin`, sehingga T9/T11 harus menyepakati mapping callback.
- T34/T35 boleh mulai menyiapkan case lebih awal, tetapi acceptance final menunggu real integration T33.

## Herdr

Skill `herdr` dibaca dan `HERDR_ENV=1` diverifikasi. CLI `herdr status` menunjukkan client/server 0.9.3 compatible; `herdr agent list` dan `herdr pane current --current` dibaca.

Delegasi konteks menggunakan native subagent agar model dapat dipilih per scope. Tidak ada pane dibuat, ditutup atau dikontrol; agent existing di Herdr tidak diberi instruksi. Jika Herdr dipakai pada eksekusi, discover pane/agent ID ulang, pertahankan cwd dan fokus pengguna, gunakan `--no-focus`; jangan menjawab approval agent lain tanpa izin.

## Handoff pengumpulan konteks

Task / scope: audit board dan rencana orkestrasi 36 task; belum menjalankan implementasi.
Changes and affected files: hanya dokumen rencana ini; tiga laporan subagent sudah disatukan.
Verification: board detail dan file repo diperiksa; validator root gagal pada dependency import seperti tercatat.
Unverified work / blockers: semua behavior aplikasi/backend/real AI; sumber/rules/evaluasi dan native device.
Next step: dispatch T1 dan persiapan T31 dengan kepemilikan file di atas; jangan menandai T31 selesai hanya karena template tersedia.
Worktree state: dokumen rencana uncommitted; `.superpowers/` untracked existing dipertahankan; tidak ada status task berubah.
