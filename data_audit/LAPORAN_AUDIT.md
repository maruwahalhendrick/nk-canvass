# LAPORAN AUDIT DATA — Daftar Ekspedisi UMKM Sukabumi (nk-canvass)

Tanggal audit: 3 Sep 2026 | Sumber: index.html (189 entry `umkmData`) vs Google Maps LIVE (headless Chrome, 188/189 terverifikasi, 0 captcha)

## TL;DR
Dugaan lu BENAR. Datanya gak akurat — tapi polanya spesifik:
- **RATING: AKURAT** (181/188 = 96% persis sama dengan Maps. Ini bagian yang credible.)
- **JUMLAH REVIEW: NGASAL.** 134/188 (71%) meleset ≥50%. 80% angka-nya kelipatan 5 → indikasi kuat angka di-karang/di-generate, bukan di-copy dari Maps. (Review asli Maps hampir gak pernah bulat.)
- **2 UMKM BUKAN DI SUKABUMI** — salah masuk list.
- **Fitur Zona 1-6 gak berfungsi**: 145/189 (77%) cuma dapat zona default Zona 1 karena keyword matching gak nyambung.
- **7 label strategi kontradiktif** dengan filter-nya sendiri.

## TEMUAN DETAIL

### 1. Jumlah review fabrikasi (masalah terbesar)
Distribusi deviasi claim vs aktual:
- <1% (akurat): 0 entry (!)
- 1–10%: 8 entry
- 10–50%: 46 entry
- 50–100%: 107 entry
- >100%: 27 entry

Bukti fabrikasi: claim 80% kelipatan 5, 47% kelipatan 10. Data aktual Maps cuma 21% kelipatan 5.
Contoh ekstrem (semua terverifikasi di alamat Sukabumi yang benar):
| # | UMKM | Claim | Aktual |
|---|------|-------|--------|
| 14 | Kopi Nako Sukabumi | 185 | 3.747 |
| 38 | Blackburn Barbershop | 89 | 2.764 |
| 39 | Pixel Barbershop Ciaul | 175 | 3.672 |
| 16 | Amorcakes & Bakery Sudirman | 98 | 1.904 |
| 132 | Bumi Kreatif Institute | 75 | 1.078 |
| 87 | Kimia Farma Sukabumi | 415 (rating 4.5) | 176 (rating 3.7!) |
| 143 | Kelana Oleh-oleh | 530 | 10 |
| 178 | Story Land | 1.250 | 27* |
| 140 | Pusat Jajanan Khas | 1.850 | 55* |

*tanda bintang = kemungkinan resolve ke listing berbeda (nama generik), cek manual dulu.

### 2. Salah kota (2 entry)
- **#1 Waroeng Spesial Sambal SS "Bandung JL Sukabumi"** → Jl. Sukabumi No.5, **Kota Bandung**. Itu nama jalan di Bandung, bukan UMKM Sukabumi.
- **#83 Apotek Utari** → Jl. Sukabumi No.38, **Kota Bandung**. (rating 1.0, review 2 — juga jadi sumber rating jelek palsu di data.)

### 3. Zona gak berfungsi
- Zona 1–6 ditentukan keyword di nama. Hanya 7 nama yang beneran mengandung keyword Zona 1.
- 145 entry jatuh ke Zona 1 murni karena fallback default. Sebaran: Z1=152, Z4=12, Z6=10, Z3=6, Z5=7, Z2=2. Canvassing per-zona jadi menyesatkan.

### 4. Label strategi kontradiktif (7 entry)
Filter bilang HIGH_LOW_REV = "Push Volume (Rating 5.0)" tapi 7 entry rating < 5.0: #14 Kopi Nako (4.9), #15 Yume Coffee (4.8), #16 Amorcakes (4.9), #17 Bandung Cheesecuit (4.9), #18 Takashi Bakehouse (4.9), #19 Catering Sarah 009 (4.9), #150 Rumah Puding (4.9).

### 5. Nama generik rawan salah sasaran (31 entry LOW_CONFIDENCE_MATCH)
Query seperti "Catering Murah Sukabumi", "Wedding Planner Sukabumi", "Servis elektronik sukabumi", "Khei Wedding Organizer" resolve ke hasil pencarian, bukan listing spesifik — angka bisa ambil dari tempat lain. Kasus nyata:
- #107 SERVICE KULKAS & #108 Service mesin cuci → resolve ke tempat YANG SAMA (Jl. Babakan Garung), 2 entri dobel untuk 1 venue.
- #87 "Kimia Farma Sukabumi" → hasil generik, rating 3.7 bisa jadi cabang/entri lain.
- #119, #165, #21 → review aktual 1–10 vs claim 88–185.

### 6. Lain-lain kecil
- #187/#189 "Cidahu Camping Ground" vs "Cidahu Camping Ground Lembah Damar" — perlu cek manual, bisa jadi 1 venue 2 entri.
- Link #19 gak mengandung "Dra. N. Rohanah" (query dipendekkan).
- "De Haus Villa Syariah - Subang Jaya" — keyword "Subang Jaya" itu nama kelurahan Cikole, tapi namanya bikin rancu.

## VERDICT PER ENTRY
- OK (rating+review masuk akal): 47
- REVIEW_OFF (review meleset ≥50%): 109
- LOW_CONFIDENCE_MATCH (query generik, angka diragukan): 31
- WRONG_CITY: 2
- Detail lengkap: audit_report.csv / audit_report.json

## REKOMENDASI (urut prioritas)
1. **RE-SCRAPE data rating+review fresh** — pipeline-nya udah gw bikin dan kebukti jalan (data_audit/verify_all.js, resumable). Tinggal generate ulang blok `umkmData` di index.html dari hasil scrape.
2. **Hapus/keluarin 2 entri Bandung** (#1, #83).
3. **Perbaiki zona**: tambah keyword per zona ATAU ganti pendekatan (simpan kecamatan di data, bukan keyword matching nama).
4. **Fix 7 label strategi** (pindah ke UNDER_5, atau ubah definisi filter).
5. **Merge #107/#108** (1 venue dobel) + cek manual #186/#189, #178, #140.
6. Untuk 31 entry generic-query: verifikasi manual via link masing-masing sebelum dipakai canvassing.

## ARTIFAK
- /home/marwhal/nk-canvass/data_audit/audit_report.csv — tabel lengkap per UMKM (claim vs aktual + verdict)
- /home/marwhal/nk-canvass/data_audit/audit_report.json — sama, format JSON
- /home/marwhal/nk-canvass/data_audit/verify_results.json — raw hasil scrape Maps (alamat, rating, review, URL resolve)
- /home/marwhal/nk-canvass/data_audit/verify_all.js — pipeline verifikasi (bisa di-reruh kapan pun buat refresh data)
