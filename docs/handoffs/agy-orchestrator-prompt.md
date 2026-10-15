# Prompt handoff untuk orchestrator AGY

Salin isi blok berikut ke AGY. Prompt ini mengasumsikan AGY mulai tanpa riwayat
percakapan sebelumnya.

```text
Kamu mengambil alih sebagai orchestrator engineering untuk project Carin. Anggap
context percakapan sebelumnya tidak tersedia. Tugas utama kamu adalah membaca dan
mengelola task melalui `tsk` CLI, mendelegasikan implementasi ke beberapa subagent
yang paling hemat/cepat tetapi tetap akurat untuk kompleksitas tugasnya, melakukan
review dan integrasi, lalu menjaga handoff yang dapat dilanjutkan tanpa menebak.
Gunakan Herdr jika berguna dan tersedia. Teruskan implementasi yang sudah
diotorisasi; jangan berhenti pada acknowledgment atau rencana saja.

Repo: /home/arundaya/Documents/Workspace/Code_Stuff/igs-joints-hackathon/carin
Branch integrasi: dev
Snapshot terakhir yang diketahui: dev @ 49b6a67 (docs: prepare orchestration handoff),
belum dipush, kira-kira 7 commit di depan origin/dev.
Handoff detail: docs/handoffs/orchestration-2026-10-13.md
Rencana orkestrasi: docs/superpowers/plans/2026-10-13-carin-orchestration.md

Mulai dengan memeriksa state yang benar-benar ada sekarang; snapshot di atas bisa
berubah setelah prompt ini dibuat:
1. Jalankan `git status --short --branch`, `git log -5 --oneline`, dan
   `git worktree list --porcelain`. Jangan menghapus, reset, checkout ulang, atau
   menimpa pekerjaan yang ada.
2. Baca root `AGENTS.md`, `specs/00-mvp-scope-and-decisions.md`, handoff dan plan
   di atas, serta `carin-app/AGENTS.md` untuk task mobile. Baca spesifikasi domain,
   arsitektur, AI/data, OpenAPI, atau verifikasi yang relevan dengan task pilihan.
3. Gunakan `tsk list --json`, lalu baca notes lengkap task yang akan dikerjakan,
   dependency-nya, dan tetangga yang relevan. `tsk` adalah sumber status task;
   jangan mengedit board selain dengan CLI.
4. Pertahankan `.superpowers/` di root jika masih ada sebagai untracked work
   pengguna. Jangan push, deploy, atau mengirim pesan eksternal.

Keadaan pada handoff terakhir:
- Total 36 task. T1/C01 dan T2/C02 berstatus `review`; T31/C31 berstatus
  `blocked`; task lainnya `open`. Status `review` berarti diserahkan untuk
  pemeriksaan manusia; jangan ubah menjadi `done` tanpa persetujuan pengguna.
- T1 tooling/checks terintegrasi di `dev` melalui `b963333`.
- T2 Hono HTTP foundation terintegrasi di `dev` melalui `1d97d3a`; branch
  `feat/t2-api-foundation` dan worktree `.worktrees/t2-api-foundation` dipertahankan
  bersih pada `17bee15`. Spec review PASS dan quality review APPROVE. Readiness
  mencakup deadline 3 detik untuk checkout + query, tetapi tetap 503 sampai T3
  memasang pemeriksaan schema/migration yang benar.
- T31 preparatory subset terintegrasi: validator, schemas/templates unpublished,
  19 tests dan CI. Pengguna sudah menyatakan belum ada sumber katalog gizi/aturan
  kesehatan yang disetujui. Jangan mengisi data makanan/nutrisi atau clinical
  rules dengan tebakan. Biarkan T31 blocked sampai data owners memberi sumber,
  izin, scope foods/servings/nutrients, rules yang ditinjau, dan approvals.
  Jangan mulai T32 dengan menganggap template sebagai data real.
- Worktrees lama: `.worktrees/t1-tooling` (`chore/t1-tooling`),
  `.worktrees/t2-api-foundation` (`feat/t2-api-foundation`),
  `.worktrees/t31-ai-data-artifacts` (`feat/t31-ai-data-artifacts`). Verifikasi
  statusnya sebelum dipakai atau dibersihkan.
- T3/C03 “Buat schema Drizzle dan migration PostgreSQL” dan T5/C05 “Generate
  types dan harness kontrak API” adalah kandidat berikutnya; keduanya bergantung
  pada T1 dan T2 yang sudah terintegrasi. Cabang yang disepakati:
  `feat/t3-database-schema` dan `chore/t5-contract-codegen`.

Cara kerja:
- Ikuti root `AGENTS.md`, terutama kewajiban mempertahankan perubahan orang lain,
  memakai package scripts yang benar-benar ada, menguji perubahan perilaku, dan
  meninggalkan handoff permanen berisi Task/scope, files, verifikasi, blocker,
  next step, dan keadaan worktree.
- Sebelum mulai implementation, baca skill relevan yang tersedia: `tsk-cli`,
  `using-git-worktrees`, `dispatching-parallel-agents`,
  `subagent-driven-development`, `test-driven-development`,
  `verification-before-completion`, `requesting-code-review`, dan
  `receiving-code-review`. User mengizinkan delegasi/parallel work; batasi maksimal
  tiga worker aktif dan jangan biarkan dua worker menulis file bersama.
- Gunakan satu worktree dan conventional branch per task, dibuat dari `dev`
  terbaru yang sudah diverifikasi. Root checkout `dev` adalah lokasi integrasi.
  Jangan memakai branch `task/*` atau `orch/*`. Pertahankan worktree branch
  setelah handoff untuk review; jangan menghapusnya otomatis.
- Pilih model murah/cepat untuk pekerjaan sempit dengan acceptance jelas; pilih
  reasoning/model lebih kuat untuk schema, auth, database ownership, transaksi,
  privacy, job concurrency, dan deletion. Pisahkan implementer, spec reviewer,
  dan quality reviewer; review spec dulu, kualitas setelah spec PASS. Minta
  implementer memperbaiki temuan lalu ulangi review sebelum merge. Jangan pakai
  laporan implementer sebagai pengganti review independen.
- Beri setiap worker prompt mandiri yang memuat seluruh task notes Cxx/Txx,
  dependency artifact yang sudah ada, specs yang dibaca, files yang boleh dimiliki,
  acceptance/failure/boundary cases, scripts aktual, dan format handoff. Jangan
  mengandalkan worker membaca percakapan ini.
- Package manifests, lockfiles, CI, dan generated files adalah shared interfaces.
  Orchestrator mengelola manifest/lockfile: minta package dan versi yang diperlukan
  dari T3/T5, verifikasi keduanya, lalu ubah lockfile secara terkoordinasi. Jangan
  biarkan worker T3 dan T5 mengedit lock API bersamaan.
- Integrasikan satu branch yang sudah direview ke `dev` dengan merge commit,
  jalankan verifikasi integrasi dari working directory yang didokumentasikan,
  lalu tulis catatan handoff dan set task ke `review` dengan `tsk`. Jangan
  mengganti notes asli: append hasil di akhir.
- Beri pengguna update singkat selama pekerjaan berlangsung. Jangan minta
  konfirmasi untuk keputusan implementasi rutin yang sudah tercakup dalam spec;
  tanyakan hanya bila jawaban eksternal benar-benar memblokir langkah berikutnya.

Panduan khusus task berikut:
- T3: generate Better Auth tables dari konfigurasi dan versi package yang dipin,
  dengan UUID (`advanced.database.generateId: "uuid"`). Jangan menulis manual
  tabel password/session. Ikuti domain model untuk ownership FK, consent,
  immutable profile/nutrition snapshots, revisions, jobs/results, consumption,
  examination date precision, idempotency dan outbox. Uji migration DB kosong dan
  repeat; uji ownership/uniqueness, immutability, dan delete scan yang tetap
  mempertahankan snapshot consumption. Hubungkan T2 `checkSchema` ke versi
  migration/schema yang nyata dan buktikan readiness 200 hanya sesudah migration
  valid. Jangan menganggap sekadar `SELECT 1` sebagai readiness.
- T5: hasilkan types dari kedua file OpenAPI ke `carin-app/lib/api/generated/`
  (`app-api.ts` dan `ai-service.ts`); tempatkan validator/harness API di
  `carin-api/src/contracts/`. Jangan menyalin interface secara manual. Sediakan
  generation script dan drift check.
  Runtime validator harus memakai schemas yang diturunkan dari OpenAPI dan JSON
  Schema 2020-12; jangan validasi seluruh dokumen OpenAPI seolah itu satu schema.
  Validasi params, JSON dan multipart sesuai boundary/transport. Uji valid,
  missing-vs-null, unknown fields (kecuali extension point `Error.details`),
  enum/type/version errors, local refs, media types, dan error responses. Binary
  upload/download perlu tes transport tersendiri. Types AI tidak berarti mobile
  boleh memanggil AI service langsung.

Invariants Carin yang perlu disertakan ke worker briefs/reviews:
- Usia 18–50 inklusif saat registrasi dihitung server dari tanggal kalender
  Asia/Jakarta; DOB date-only. Terms/privacy consent wajib; AI consent terpisah.
- Mobile → Carin API → internal AI service; mobile tidak menghubungi AI langsung.
- Scan foto tidak membuat intake sampai pengguna mengonfirmasi konsumsi. `null`
  berbeda dari nol. Snapshot lama immutable; perubahan profile/catalog tidak
  boleh diam-diam mengubah hasil historis.
- Semua resource/media/job dimiliki user dan dites terhadap akses silang akun.
  Deletion/revocation mencegah job terlambat menerbitkan hasil. Fixture hanya
  sintetis untuk dev/test dan tidak boleh disebut data real.

Verifikasi pada integration checkpoint `1d97d3a` yang terakhir dijalankan:
- `carin-api/`: frozen offline install, typecheck, lint, 17 unit, 9 integration,
  build — pass.
- `carin-app/`: typecheck/lint pass; test commands pass dengan nol test file
  (belum ada test fitur app).
- Root: `.venv/bin/python specs/validate-contracts.py` pass (2 OpenAPI docs,
  38 operations, 408 local refs, 5 fixtures, 32 mapped criteria, 3 negative
  probes); `.venv/bin/python -B -m unittest discover -s ai-service/tests`
  (19 pass); `.venv/bin/python -B ai-service/validate_data_artifacts.py` pass.
- Remote GitHub Actions, real PostgreSQL migrations, native Android/iOS, provider
  credentials, dan akurasi AI real belum diverifikasi. Jangan laporkan validator
  spec sebagai bukti app atau AI nyata bekerja.

Lanjutkan task yang dependency artifact-nya sudah diverifikasi pada `dev`.
Mulai dengan T3/T5 setelah inspeksi ulang status terbaru. Jangan berhenti setelah
memberi rekomendasi; implementasikan dan integrasikan pekerjaan yang diotorisasi.
Jika sumber real T31 masih belum ada, tinggalkan gate itu dengan blocker dan next
step yang eksplisit sambil teruskan jalur independen.
```
