# ZafkielHub — Bot WhatsApp + Dashboard Web (Baileys)

Dashboard web tema **Zafkiel** (ungu-merah, terinspirasi motif jam/gerbang waktu —
artwork orisinal, bukan aset berlisensi anime manapun) buat kontrol bot WhatsApp:

- **Login / Register** — akun admin lokal, video medium di tengah kartu login, backsound sendiri
- **Home** — status koneksi, info bot, log aktivitas, backsound sendiri, tombol lapor error
- **Menu Bot** — video landscape medium, daftar command lengkap, kirim stiker/teks, atur identitas bot
- **Pairing Sender** — hubungkan nomor bot pakai **kode** atau **scan QR**
- **Sistem command WA** — member bisa ketik `.menu` dkk langsung di WhatsApp, lengkap dengan
  sistem level/exp/coin/limit/premium/voucher

> ⚠️ **Catatan penting soal desain**: dashboard ini dibuat dengan gaya/struktur UI yang mirip
> banyak "bot panel" WhatsApp pada umumnya (login → dashboard → pairing), tapi **branding, logo,
> dan aset visualnya orisinal** — bukan hasil copy dari produk/brand pihak ketiga manapun.
> Ganti nama, logo, video, dan warna sesuka kamu lewat folder `public/assets/`.

## Cara Pakai

1. **Install Node.js** (minimal v18, disarankan v20+) & **Git** kalau belum ada.

2. **Install dependency:**
   ```bash
   npm install
   ```
   > Butuh koneksi internet pas `npm install` dan pas bot jalan (banyak command yang fetch API publik).

3. **(Opsional) Isi API key fitur premium:**
   ```bash
   cp .env.example .env
   ```
   Lihat bagian **"Fitur yang butuh API key"** di bawah.

4. **Siapkan gambar stiker (opsional):**
   Taruh file gambar (`.jpg`, `.png`, `.webp`) di folder `stickers/`. Semua gambar di situ jadi 1 paket
   buat fitur "Kirim Paket Stiker" di dashboard.

5. **Jalankan server:**
   ```bash
   npm start
   ```

6. **Buka dashboard:** `http://localhost:3000`, daftar akun admin (cuma sekali), lalu masuk.

7. Buka tab **Pairing Sender** → pilih **Kode** atau **QR Code** → hubungkan nomor bot.
   Setelah status jadi **Terhubung**, member sudah bisa chat bot pakai command (`.menu`, `.ping`, dst).

## Sistem Command WhatsApp

- Prefix default: `.` `!` `/` (bisa diganti di `bot/store.js` → `DEFAULT_BOT_SETTINGS.prefixes`)
- Ketik **`.menu`** ke bot → bot balas **gambar banner + caption** berisi:
  - Profil singkat pengirim (nama, limit, level, premium, grup, club)
  - Nama bot + versi bot
  - Semua kategori command (AI Editing, Anime & Manga, Game Guide, Informasi, Search,
    Menu Bot, AI Assistant, AI Tools, Sticker Maker, AI Processing, Utilitas/Tools)
- Command yang butuh API key ditandai 🔒 di menu — tetap "berfungsi" (bot tetap membalas),
  tapi baru kasih hasil beneran setelah API key-nya di-set admin.
- Data member (level, exp, coin, limit, premium, voucher) tersimpan di `data/members.json`
  dan `data/vouchers.json` — bikin voucher manual dengan format:
  ```json
  { "KODEVIP": { "coin": 100, "limit": 20, "premium": true, "maxUse": 5 } }
  ```

### Status kejujuran fitur (biar nggak salah ekspektasi)

| Status | Artinya |
|---|---|
| 🟢 **live** | Beneran jalan pakai API publik gratis (tanpa key) — Jikan, waifu.pics, BMKG, MyQuran, Open-Meteo, CoinGecko, dll. |
| 🟡 **basic** | Jalan, tapi isinya konten statis/informasi manual (bukan data realtime) — contoh: panduan game, info berita. |
| 🔒 **key** | Butuh API key berbayar/gratis-terbatas dari pihak ketiga (Remini, Gemini, OpenAI, dll) yang **harus kamu daftarkan sendiri**. Tanpa key, bot kasih tahu fitur ini belum aktif — bukan pura-pura sukses. |

Cek status tiap command di `bot/menu.js` (field `status`).

## Fitur yang Butuh API Key

Isi di file `.env` (contoh: `.env.example`), lalu sambungkan di `bot/commands.js` pada fungsi
yang sekarang masih `premiumStub(...)`:

- **AI Chat** (`.ai .ask .assistant .rpstyle`) → `OPENAI_API_KEY` (atau provider kompatibel lain)
- **Gemini** (`.gemini`) → `GEMINI_API_KEY` (Google AI Studio)
- **Qwen / DeepSeek** → `QWEN_API_KEY` / `DEEPSEEK_API_KEY`
- **Remini / Waifu2X / Recolor / ImgFilter / ToReal / JadiKartun** → butuh API image-AI berbayar
  (mis. Replicate, Segmind, dsb) → `AI_IMAGE_API_KEY`
- **RemoveBG / StickerNoBG** → `REMOVEBG_API_KEY` (remove.bg)
- **Reverse image search (`.lens`)** → `SERPAPI_KEY` / Google Lens API
- **Deteksi lagu dari audio (`.shazam`)** → `ACRCLOUD_API_KEY`
- **Audio-to-text / OCR (`.audiototext .imagetotext`)** → `SPEECH_API_KEY` / `OCR_API_KEY`

Tanpa key-key ini, bot **tetap merespons** command tersebut dengan pesan yang jelas
(bukan diam/error), jadi tetap enak dipakai member sambil admin nyusul pasang key.

## Ganti Aset (Logo, Video, Backsound)

Semua aset di `public/assets/` sekarang diisi **placeholder abstrak buatan sendiri**
(motif lingkaran/jam ungu-merah, dibuat prosedural pakai ffmpeg — bukan artwork
berhak cipta siapa pun), supaya kamu bisa langsung ganti tanpa masalah lisensi:

| File | Dipakai di | Rekomendasi |
|---|---|---|
| `logo.png` | Header dashboard | persegi, transparan, min. 128×128px |
| `background.mp4` | Background semua halaman | landscape, muted, di-loop, <10MB |
| `login-hero.mp4` | Video tengah kartu Login/Register | **persegi/1:1**, medium, <5MB |
| `menu-hero.mp4` | Video landscape halaman Menu Bot | 16:9, medium (sudah dibatasi CSS max 420px), <8MB |
| `home-hero.jpg` | Gambar landscape halaman Home | 16:9, ~1280×480px |
| `backsound-login.mp3` | Backsound halaman Login | loop pendek, ≤1MB |
| `backsound-home.mp3` | Backsound halaman Home | loop pendek, ≤1MB |
| `backsound-menu.mp3` | Backsound halaman Menu Bot | loop pendek, ≤1MB |

Backsound **tidak autoplay dengan suara** (browser modern blokir itu) — ada tombol 🔇/🔊
di tiap halaman, dan preferensi on/off tersimpan per-halaman di browser masing-masing user.

> Kalau kamu punya video/gambar bertema Tokisaki Kurumi sendiri (fan art buatan sendiri atau
> yang kamu punya lisensinya), tinggal timpa file-file di atas dengan nama yang sama.
> Jangan pakai gambar/video hasil scrape dari sumber yang kamu nggak punya hak pakainya ya.

## Tombol Lapor Error (TikTok & Telegram Developer)

Atur link TikTok & Telegram kamu di dashboard → tab **Menu Bot** → card **"Identitas Bot"**,
atau langsung edit `data/bot-settings.json` (dibuat otomatis setelah pertama kali disimpan):

```json
{
  "tiktokUrl": "https://www.tiktok.com/@usernamekamu",
  "telegramUrl": "https://t.me/usernamekamu"
}
```

Tombolnya otomatis muncul di halaman Login dan Home.

## Catatan Penting

- **Kirim broadcast/teks berulang** tetap tanggung jawab kamu — makin kecil jeda, makin
  berisiko nomor bot kena banned WhatsApp. Jangan spam ke orang yang tidak minta.
- Password admin disimpan ter-hash (bcrypt), tapi ini tool lokal sederhana — jangan expose
  ke internet publik tanpa HTTPS & secret session yang lebih kuat.
- Sesi login WhatsApp disimpan di folder `auth/`. Hapus buat logout total & pairing ulang.
- Baileys adalah library tidak resmi (unofficial) — pakai dengan risiko sendiri.
- Command yang fetch API publik (Jikan, BMKG, dll) butuh sandbox/servernya bisa akses internet
  keluar. Kalau di-hosting di tempat yang firewall-nya ketat, sebagian command bisa gagal —
  ada fallback pesan error yang sopan, bukan crash.

## Struktur Folder

```
wa-bot/
├── server.js              # Backend: Express + Baileys + API dashboard
├── package.json
├── .env.example            # Contoh API key opsional
├── bot/
│   ├── store.js            # Data member (level/coin/premium) + pengaturan bot
│   ├── utils.js             # Helper parsing pesan WA
│   ├── menu.js              # Sumber data menu + generator banner .menu
│   ├── commands.js          # Semua handler command (~90 command)
│   └── handler.js           # Router: messages.upsert -> jalankan command
├── public/                  # Frontend dashboard
│   ├── index.html
│   ├── css/style.css
│   ├── js/app.js
│   └── assets/               # logo, video, backsound (placeholder orisinal)
├── stickers/                 # Taruh gambar buat paket stiker manual
├── data/                     # users.json, members.json, vouchers.json, dll (otomatis)
└── auth/                     # Sesi login WhatsApp (otomatis)
```

