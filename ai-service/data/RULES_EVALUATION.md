# Evaluasi skenario aturan gizi dan kesehatan — 15 Oktober 2026

## Kesimpulan

Secara desain, aturan sudah cukup berhati-hati untuk mencegah vonis makanan
"aman/tidak aman" hanya dari satu foto. Batas natrium/serat harian tidak
diperlakukan sebagai batas satu porsi; diabetes tidak dinilai dari gula total
saja; CKD, alergi, dan pemicu GERD menahan saran bila data penting belum ada.

Ini **desk review dan walkthrough skenario**, bukan hasil inferensi API, uji
klinis, atau persetujuan dokter/ahli gizi. Rule set masih disabled dan tidak
executable. Runtime belum memuat katalog atau evaluator. Angka contoh di bawah
bersifat hipotetis untuk menguji cara jawab, bukan nilai makanan dari katalog.

## Skenario dan hasil yang diharapkan

| Kasus | Input skenario | Jawaban yang semestinya | Penilaian desain |
| --- | --- | --- | --- |
| Gizi umum — natrium | Porsi memiliki 650 mg natrium; acuan umum dewasa 2.000 mg/hari. | “Porsi ini mengandung 650 mg natrium, sekitar 33% dari acuan umum harian. Ini bukan batas per makan atau sisa jatah harian.” Jangan beri label merah/hijau. | **Lulus.** `general-sodium-context` menetapkan acuan per hari dan melarang cutoff per porsi. Aritmetika 650/2.000 = 32,5%. |
| Hipertensi | Natrium porsi 650 mg; diagnosis dilaporkan, tetapi target natrium dari tenaga kesehatan tidak tersedia. | Tampilkan jumlah natrium hanya jika sumber makanan dan porsinya sudah ditinjau. Jelaskan bahwa kecocokan dengan rencana pasien belum dapat dinilai. | **Lulus keselamatan, perlu perjelas keluaran.** Rule meminta target pasien tetapi belum menetapkan apakah atau bagaimana membandingkan porsi terhadap target itu. |
| Diabetes tipe 2 | Porsi memiliki 60 g karbohidrat; target karbohidrat personal dan waktu makan/obat tidak tersedia. | Boleh menyebut 60 g sebagai informasi komposisi jika definisi karbohidrat dan sumbernya sudah ditinjau. Jangan menyebut makanan “aman” hanya karena gula total rendah, dan jangan membuat batas karbohidrat per makan. | **Lulus dengan prasyarat data.** Rule memblokir penilaian dari gula saja. Definisi karbohidrat antarsumber katalog belum seragam, jadi untuk data sekarang hasil personal harus `insufficient_information`. |
| Penyakit ginjal kronis | Stadium/dialisis dan rencana klinisi tidak diketahui; kalium/fosfor tidak tersedia. | “Informasi belum cukup untuk menilai kecocokan dengan rencana ginjal Anda.” Jangan menyuruh menghindari semua buah/protein atau menambah/membatasi cairan secara otomatis. | **Lulus.** Guard mengakui kebutuhan natrium, protein, kalium, fosfor, dan cairan bergantung keadaan serta terapi. |
| Gout/asam urat | Pengguna mengonfirmasi makanan mengandung hati ayam; kandungan purin per porsi tidak tersedia. | “Hati ayam termasuk jeroan. Pedoman gout umum menyarankan menghindari jeroan karena cenderung tinggi purin; saya tidak dapat menghitung purin hidangan ini. Ikuti rencana tenaga kesehatan.” | **Perlu revisi teks.** Pemicu konfirmasi bahan sudah tepat, tetapi adjustment saat ini hanya menyuruh mempertimbangkan alternatif protein dan belum menyampaikan alasan/caution secara jelas. Jangan mengarang angka purin. |
| GERD | Pengguna melaporkan gejala malam; waktu makan dan waktu berbaring diketahui. | Jika relevan, jelaskan bahwa memberi jarak setidaknya 3 jam sebelum berbaring dapat membantu gejala malam. Pemicu makanan tetap berdasarkan pengalaman pengguna, bukan dugaan dari foto. | **Lulus bersyarat.** Ruang lingkup sesuai panduan; definisi format waktu, zona waktu, dan pergantian hari perlu ditetapkan sebelum evaluator dibuat. |
| Alergi makanan | Profil menyebut alergi kacang; foto hidangan tidak mengungkap resep, label, atau kontak silang. | “Foto tidak dapat memastikan bahan dan kontak silang. Periksa label atau konfirmasi ke penyedia sebelum makan.” Jangan menyatakan pasti mengandung atau bebas kacang tanpa bukti. | **Lulus.** Dua guard alergi membedakan kecocokan bahan terverifikasi dari ketidakpastian foto dan melarang jaminan bebas alergen. |
| Dislipidemia | Katalog hanya menyediakan lemak total, tidak menyediakan lemak jenuh/trans. | Boleh tampilkan lemak total sebagai angka komposisi jika sumbernya layak. Jangan menyimpulkan efek terhadap kolesterol dari lemak total saja. | **Lulus.** `lipids-saturated-fat-guard` menahan kesimpulan yang membutuhkan data yang belum ada. |
| Berat badan berlebih/obesitas | Satu porsi 550 kkal; asupan harian lengkap dan rencana energi personal tidak diketahui. | Tampilkan energi porsi. Jangan menyebut pengguna melewati target, menyuruh melewatkan makan, atau menentukan defisit dari satu foto. | **Lulus.** Rule mengharuskan rencana/asupan yang sesuai sebelum personalisasi energi. |
| Kondisi gabungan: CKD + konstipasi | Rule konstipasi mungkin mendorong cairan; rencana cairan ginjal tidak tersedia. | Tahan saran “perbanyak minum”; sebutkan bahwa kebutuhan cairan perlu mengikuti rencana klinisi. Pertahankan informasi serat yang valid secara terpisah. | **Lulus pada definisi konflik, belum dapat dibuktikan runtime.** Relasi konflik ada dua arah, tetapi executor yang menahan adjustment belum dibuat. |

## Temuan yang perlu ditangani sebelum aturan diaktifkan

1. **Perjelas hipertensi.** Pisahkan tampilan angka natrium porsi dari penilaian
   personal. Bila target harian klinisi ada, tetapkan rumus dan bahasa yang
   hanya membandingkan kontribusi porsi terhadap target—bukan menyimpulkan
   tekanan darah atau memberi jatah sisa. Bila tidak ada target, keluaran
   personal harus menyebut “belum dapat dinilai”.
2. **Perjelas pesan gout.** Sebutkan bahwa jeroan adalah kelompok yang perlu
   dihindari/dibatasi menurut rujukan yang dipakai, sambil tetap menampilkan
   batasan bahwa sistem tidak memiliki nilai purin hidangan. Rule sekarang
   terlalu samar untuk menghasilkan jawaban yang informatif.
3. **Samakan definisi karbohidrat.** Sebelum diabetes/prediabetes memakai nilai
   katalog, tandai setiap sumber sebagai karbohidrat tersedia atau total dan
   jangan gabungkan keduanya tanpa transformasi yang terdokumentasi.
4. **Tentukan executor dan uji gabungan.** Implementasikan predicate, status
   `insufficient_information`, prioritas aturan, konflik pada tingkat
   adjustment, sitasi, serta batas bahwa semua makanan/aturan saat ini belum
   didukung. Jangan meminta LLM memutuskan angka atau menimpa hasil evaluator.
5. **Tahan cakupan penyakit di manifest.** Kebutuhan MVP saat ini berfokus pada
   diabetes dan hipertensi. Sebelas kategori lainnya tetap definisi draft untuk
   ditinjau; tidak boleh muncul sebagai dukungan produk sebelum ada review dan
   approval nyata.

Semua 155 estimasi nutrien tetap menahan aturan personal yang bergantung pada
nilai tersebut sampai provenance dan nilainya lolos review. Karena belum ada
serving terverifikasi, skenario berbasis foto juga belum dapat menguji ukuran
porsi atau status nutrisi nyata.

## Dasar penilaian

- [WHO — Healthy diet](https://www.who.int/news-room/fact-sheets/detail/healthy-diet):
  natrium 2.000 mg/hari dan serat 25 g/hari adalah acuan populasi harian;
  definisi gula bebas tidak sama dengan gula total.
- [NIDDK — Healthy Living with Diabetes](https://www.niddk.nih.gov/health-information/diabetes/overview/healthy-living-with-diabetes):
  pilihan, jumlah, dan waktu makan adalah bagian dari rencana; penghitungan
  karbohidrat tidak diperlukan oleh semua orang dan rencana disesuaikan dengan
  tim kesehatan.
- [NIDDK — Healthy Eating for Adults with CKD](https://www.niddk.nih.gov/health-information/kidney-disease/chronic-kidney-disease-ckd/healthy-eating-adults-chronic-kidney-disease):
  protein, kalium, fosfor, natrium, dan cairan memerlukan pertimbangan kondisi
  serta saran klinisi/dietisien; kebutuhan protein dapat berbeda pada dialisis.
- [NIAMS — Gout](https://www.niams.nih.gov/health-topics/gout/diagnosis-treatment-and-steps-to-take):
  menyarankan menghindari daging merah dan jeroan yang tinggi purin; perubahan
  diet tidak menggantikan obat gout yang diresepkan.
- [NIDDK — GERD eating and nutrition](https://www.niddk.nih.gov/health-information/digestive-diseases/acid-reflux-ger-gerd-adults/eating-diet-nutrition):
  untuk gejala malam/ketika berbaring, makan setidaknya tiga jam sebelumnya
  dapat membantu; pemicu makanan berbeda pada tiap orang.
- [FDA — Food Allergies](https://www.fda.gov/food/nutrition-food-labeling-and-critical-foods/food-allergies):
  kontak silang merupakan risiko terpisah dari bahan yang tertera pada label;
  pemeriksaan foto tidak membuktikan ketiadaan alergen.
