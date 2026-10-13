# Carin — verifikasi dan deployment MVP

Versi 1.0.0. Ini rencana pengujian implementasi, bukan laporan bahwa aplikasi
telah mengimplementasikan atau meluluskan acceptance criteria.

## Contract verification

OpenAPI 3.1.1 memakai JSON Schema 2020-12. App API mereferensikan schema hasil/
katalog AI secara relatif; validasi kedua file bersama. Nama/versi kontrak harus
sama pada backend, generated mobile types, real AI, dan fixture adapter.
[OpenAPI 3.1.1](https://spec.openapis.org/oas/v3.1.1.html).

Jalankan validator paket dari root repo (dependencies dapat dipasang di venv):

```sh
python -m pip install PyYAML jsonschema openapi-spec-validator
python specs/validate-contracts.py
```

Validator mengecek dokumen OpenAPI, resolve semua local refs tanpa network,
JSON Schema formats, fixture output, coverage/count, source refs, serta scaling
koreksi. Fixture mapping:

| Fixture | Schema/arti |
| --- | --- |
| `fixtures/ai/analysis-complete.json` | AI AnalysisResult, synthetic matched single food |
| `fixtures/ai/analysis-partial.json` | AI AnalysisResult, matched + unmatched component |
| `fixtures/ai/analysis-unrecognized.json` | AI AnalysisResult, no known nutrition |
| `fixtures/ai/correction-complete.json` | AI AnalysisResult, half quantity terhadap complete |
| `fixtures/ai/job-failed.json` | App AnalysisJob, terminal service error tanpa result |

Implementasi menambah consumer/provider contract tests untuk setiap endpoint.
Validator fixture saja tidak membuktikan endpoint, database transaction, auth,
atau kualitas AI. Auth vendor routes diuji melalui pinned SDK/schema yang
dihasilkan library; resource OpenAPI tidak menggantikan kontrak upstream.

## Traceability AC PRD

U = pure domain unit, I = backend/DB integration, C = API/provider contract,
E = end-to-end mobile. Setiap baris membutuhkan hasil uji tercatat.

| AC | Coverage implementasi |
| --- | --- |
| AC-PROF-01 | I/E: lewati pemeriksaan, profile save, general analysis tersedia |
| AC-PROF-02 | I/E: multi-condition + other bertahan setelah reopen |
| AC-PROF-03 | U/I/E: profile version baru untuk analisis baru; snapshot lama tetap |
| AC-PROF-04 | U/C/E: null/unit invalid tidak menjadi nol/normal |
| AC-SCAN-01 | C/E: real supported photo, hasil otomatis tanpa konfirmasi awal |
| AC-SCAN-02 | U/C/E: nutrient null tetap unavailable |
| AC-SCAN-03 | U/C/E: partial components dan nutrient coverage |
| AC-SCAN-04 | I/E: scan-only tidak menambah dashboard |
| AC-ATTN-01 | C/E: attention mempunyai reason, condition, source |
| AC-ATTN-02 | C/E: unsupported condition preserved, no invented rule |
| AC-ATTN-03 | C/E: conflict menahan conflicting adjustments |
| AC-ATTN-04 | C/E: allergy unverifiable, tidak ada jaminan aman |
| AC-CORR-01 | U/C/E: half portion, same source, perhitungan konsisten |
| AC-CORR-02 | U/C/E: food replacement memakai source baru/null |
| AC-CORR-03 | I/E: confirmation memakai result revision terbaru |
| AC-CORR-04 | I/C/E: failed correction tidak publish new-name/old-values |
| AC-CONS-01 | I/E: consumption explicit only |
| AC-CONS-02 | U/I/E: actual per-component half portion |
| AC-CONS-03 | I/E: timeout after commit + retry, one row/no false success |
| AC-CONS-04 | I/E: edit/delete recompute, other rows intact |
| AC-CONS-05 | I/E: manual tanpa izin kamera/foto/scan |
| AC-CONS-06 | U/I/E: unmatched/unknown portion save, incomplete coverage |
| AC-CONS-07 | I/E: prior scan confirmation without new photo/duplicate |
| AC-DASH-01 | U/E: no records → empty, no complete-intake assertion |
| AC-DASH-02 | U/I/E: one record shows limited coverage |
| AC-DASH-03 | U/I/E: recurring rule counts link to underlying consumption IDs |
| AC-DASH-04 | U/E: historical latest exam date visible |
| AC-EXAM-01 | I/E: two persisted exams with dates/units/context |
| AC-EXAM-02 | U/I/E: backdated insert does not replace latest measurement |
| AC-EXAM-03 | U/E: fasting/random/unknown separate series |
| AC-EXAM-04 | U/E: one point without trend claim |
| AC-EXAM-05 | I/E: delete updates latest/chart, other rows intact |

Gunakan T-01 sampai T-19 dari Feature PRD sebagai E2E/demo matrix; AC dan requirement
IDs tetap sama agar tim bisa menelusuri perubahan. Failure injection tambahan
meliputi double submit, concurrent revision edit, worker crash/lease expiry,
AI return setelah deletion, AI consent withdrawal, catalog drift, DB save failure,
MinIO cleanup failure, account A mencoba ID account B, serta pergantian timezone
di batas hari. Missing optional data bukan error layanan.

## Acceptance tambahan dari keputusan kita

| ID | Hasil wajib |
| --- | --- |
| NEW-AUTH-01 | DOB di bawah 18/lebih dari 50 ditolak server; boundary birthday dan leap day diuji; raw auth signup tidak bypass |
| NEW-AUTH-02 | Unverified email tidak mendapat application access; verification/resend/expired link bekerja |
| NEW-AUTH-03 | Session bertahan restart; logout/reset mencabut akses, cached user tidak menjadi proof |
| NEW-AUTH-04 | Reset response generik, valid/expired/reused token dan mobile deep link diuji memakai Resend |
| NEW-CONSENT-01 | Legal versions recorded, AI consent optional, withdraw menahan new/pending publication |
| NEW-JOB-01 | App leave/reopen mengambil job server; retry tidak membuat result/consumption ganda |
| NEW-DATA-01 | Account isolation untuk profile/media/job/consumption/exams/dashboard |
| NEW-DELETE-01 | Account deletion revoke+deny access langsung, purge DB/photos durable termasuk worker in-flight |
| NEW-CACHE-01 | Offline read berlabel stale; write tidak queued; logout/user switch membersihkan cache/draft |
| NEW-MEDIA-01 | Invalid type/oversize/decode ditolak; private URL expires; EXIF/raw upload cleanup |

## Deployment target

Implementasi menyediakan Compose untuk setiap environment: reverse proxy HTTPS
di staging/prod, backend API, backend worker, PostgreSQL dengan persistent volume,
MinIO dengan persistent volume, dan real AI service. AI fixture adapter di backend
hanya di dev/test. Tiap environment punya DB/volume/bucket/secrets terpisah;
fixture seed tidak masuk data real. Hanya API HTTPS dipublikasikan untuk mobile.
Database, MinIO console, worker, dan AI internal endpoint private.

Migration menjadi one-shot deployment step sebelum API/worker baru menerima
traffic. Catalog import versioned dilakukan sebelum scenario real supported-food
diuji. API readiness bergantung pada DB dan schema; AI unhealthy dilaporkan
terpisah sehingga manual/profile/exams tidak otomatis mati. Liveness hanya proses.
Worker restart policy aktif; job state/purge tidak disimpan di memory saja.

| Variable | Pemakaian |
| --- | --- |
| APP_ENV | dev/staging/prod, fixture guard |
| DATABASE_URL | Backend/worker PostgreSQL, secret |
| BETTER_AUTH_SECRET, BETTER_AUTH_URL | Server auth secret dan external base URL |
| AUTH_TRUSTED_ORIGINS, APP_LINK_SCHEME | Explicit environment callback/origin allowlist |
| RESEND_API_KEY, EMAIL_FROM | Server email key dan verified sender |
| MINIO_ENDPOINT, MINIO_BUCKET, MINIO_ACCESS_KEY, MINIO_SECRET_KEY | Internal storage config/credentials |
| MEDIA_SIGNING_SECRET | Backend opaque photo grant signing key, secret per environment |
| MEDIA_SIGNED_URL_BASE | Public API origin untuk mobile media grant URLs; internal AI URL memakai MINIO_ENDPOINT |
| AI_SERVICE_URL, AI_SERVICE_KEY | Worker internal connection/auth |
| AI_MODE | real atau fixture; fixture startup ditolak di staging/prod |
| AI_TIMEOUT_MS, WORKER_CONCURRENCY | Default budgets pada architecture spec |
| EXPO_PUBLIC_API_URL | Satu-satunya backend URL publik di mobile |

App scheme/environment berasal dari build config; secrets tidak memakai Expo
public prefix. Pin dependency dan container versions saat implementasi, jangan
menebak versi package baru dari spec. Existing Expo 56 scaffold menjadi baseline.
No secret/default credential dalam repo. Local physical device memakai LAN URL
yang reachable. HTTPS email callbacks mesti dapat diakses dari email client.

## Gate demo dan handoff

- Pilih dan catat device/platform demo; uji camera, gallery, permissions, safe
  area, keyboard, app restart dan email deep link pada perangkat itu. Kompatibilitas
  Android/iOS tidak dilaporkan sebagai verified bila hanya satu yang diuji.
- Seluruh mandatory AC dan acceptance baru mempunyai status/pass evidence;
  temuan tidak ditutup hanya karena happy path demo berhasil.
- Real auth/Resend dan real AI dipakai pada alur final; fixture yang ditampilkan
  untuk failure demo diberi label simulasi. Tidak menyebut fixture sebagai model output.
- Tim AI menyerahkan manifest/source/evaluation; values atau supported rules
  synthetic tidak dipromosikan ke mode real.
- Demo seed menggunakan user/data sintetis, tetap menjalankan auth dan ownership.
  Reset seed hanya scoped ke environment/data sintetis yang dikenal.
- Basic operational logs memuat request/job/error IDs; tokens/body kesehatan
  tidak dicatat. Deep-link token access logs dinonaktifkan.
- Tunjukkan kedua jalur konsumsi, koreksi, dashboard, pemeriksaan, restart
  persistence, dan satu keterbatasan. Ikuti urutan Feature PRD bagian 13.1.

Output handoff implementasi adalah migrations, generated API types, contract tests,
consumer/provider adapters, environment examples tanpa secret, dan catatan hasil
uji. Paket spec tidak mengklaim artefak implementasi tersebut sudah tersedia.
