// ================================
// HELPER
// ================================
async function api(path, options = {}) {
  const res = await fetch(path, {
    headers: { "Content-Type": "application/json" },
    ...options,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || "Terjadi kesalahan.");
  return data;
}

function show(el) { el.style.display = ""; }
function hide(el) { el.style.display = "none"; }

// ================================
// TOAST & DESKTOP NOTIFIKASI
// ================================
const toastContainer = document.getElementById("toast-container");

function showToast({ type = "info", title = "", message = "", duration = 5000 }) {
  if (!toastContainer) return;
  const card = document.createElement("div");
  card.className = `toast-card toast-${type}`;

  const icons = {
    success: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg>',
    info: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>',
    warning: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>',
    error: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>',
  };

  card.innerHTML = `
    <div class="toast-icon">${icons[type] || icons.info}</div>
    <div class="toast-body">
      ${title ? `<div class="toast-title">${escapeHtml(title)}</div>` : ""}
      ${message ? `<div class="toast-desc">${escapeHtml(message)}</div>` : ""}
    </div>
    <button class="toast-close" type="button" aria-label="Tutup">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
    </button>
  `;

  const closeBtn = card.querySelector(".toast-close");
  const dismiss = () => {
    card.classList.add("toast-out");
    setTimeout(() => {
      if (card.parentElement) card.remove();
    }, 250);
  };

  closeBtn.addEventListener("click", dismiss);
  toastContainer.appendChild(card);

  if (duration > 0) {
    setTimeout(dismiss, duration);
  }
}

async function requestNotificationPermission() {
  if ("Notification" in window && Notification.permission === "default") {
    try {
      await Notification.requestPermission();
    } catch {}
  }
}

function sendDesktopNotification(title, options = {}) {
  if ("Notification" in window && Notification.permission === "granted") {
    try {
      return new Notification(title, options);
    } catch {}
  }
}

// ================================
// ELEMEN
// ================================
const viewLogin = document.getElementById("view-login");
const viewRegister = document.getElementById("view-register");
const viewDashboard = document.getElementById("view-dashboard");
const viewIntro = document.getElementById("view-intro");
const introVideo = document.getElementById("intro-video");
const btnSkipIntro = document.getElementById("btn-skip-intro");

const formLogin = document.getElementById("form-login");
const formRegister = document.getElementById("form-register");
const loginError = document.getElementById("login-error");
const registerError = document.getElementById("register-error");

const toRegister = document.getElementById("to-register");
const toRegisterWrap = document.getElementById("to-register-wrap");
const toLogin = document.getElementById("to-login");

const btnLogout = document.getElementById("btn-logout");
const statusPill = document.getElementById("status-pill");
const statusText = document.getElementById("status-text");

const navItems = document.querySelectorAll(".nav-item");
const pages = {
  home: document.getElementById("page-home"),
  menu: document.getElementById("page-menu"),
  pairing: document.getElementById("page-pairing"),
};

// ================================
// INIT: cek apakah sudah ada akun & sudah login
// ================================
async function init() {
  try {
    const status = await api("/api/status");
    // Kalau berhasil ambil status, berarti sudah login
    enterDashboard(status);
  } catch {
    // Belum login -> cek apakah sudah ada akun terdaftar
    const { exists } = await api("/api/auth/exists");
    if (exists) {
      showLogin();
    } else {
      showRegister();
      hide(toRegisterWrap);
    }
  }
}

function showLogin() {
  hide(viewRegister);
  hide(viewDashboard);
  show(viewLogin);
  show(toRegisterWrap);
  fadeInEl(viewLogin);
}

function showRegister() {
  hide(viewLogin);
  hide(viewDashboard);
  show(viewRegister);
  fadeInEl(viewRegister);
}

function enterDashboard(status) {
  hide(viewLogin);
  hide(viewRegister);
  show(viewDashboard);
  fadeInEl(viewDashboard);
  document.getElementById("home-username-value").textContent = status.username || "-";
  document.getElementById("home-botname-value").textContent = status.botName || "-";
  document.getElementById("home-botversion-value").textContent = status.botVersion ? `v${status.botVersion}` : "-";
  document.getElementById("brand-version").textContent = status.botVersion ? `v${status.botVersion}` : "";
  applyStatus(status);
  loadSettingsIntoForm();
  loadBotSettingsIntoForm();
  loadCommandList();
  startStatusPolling();
  playPageAudio("home");
}

// ================================
// TRANSISI: video transisi 9:16 tampil dulu sebelum dashboard
// ================================
function playIntroThenDashboard(status) {
  hide(viewLogin);
  hide(viewRegister);
  hide(viewDashboard);
  show(viewIntro);
  fadeInEl(viewIntro);

  if (introVideo) {
    introVideo.currentTime = 0;
    introVideo.play().catch(() => {});
  }

  let done = false;
  const goDashboard = () => {
    if (done) return;
    done = true;
    if (introVideo) {
      introVideo.pause();
      introVideo.removeEventListener("ended", goDashboard);
      introVideo.removeEventListener("error", goDashboard);
    }
    if (btnSkipIntro) {
      btnSkipIntro.removeEventListener("click", goDashboard);
    }
    clearTimeout(fallbackTimer);
    hide(viewIntro);
    enterDashboard(status);
  };

  // Jaga-jaga kalau video gagal diputar atau selesai
  const fallbackTimer = setTimeout(goDashboard, 15000);

  if (introVideo) {
    introVideo.addEventListener("ended", goDashboard);
    introVideo.addEventListener("error", goDashboard);
  }

  if (btnSkipIntro) {
    btnSkipIntro.addEventListener("click", goDashboard);
  }
}

// ================================
// INFO PUBLIK: tombol TikTok & Telegram developer
// ================================
async function loadPublicInfo() {
  try {
    const info = await api("/api/public-info");
    document.querySelectorAll("#link-tiktok, #link-tiktok-2").forEach((el) => (el.href = info.tiktokUrl || "#"));
    document.querySelectorAll("#link-telegram, #link-telegram-2").forEach((el) => (el.href = info.telegramUrl || "#"));
  } catch {
    // biarin default kalau gagal
  }
}
loadPublicInfo();

// ================================
// IDENTITAS BOT (nama, owner, tombol dev, rules)
// ================================
async function loadBotSettingsIntoForm() {
  try {
    const settings = await api("/api/bot-settings");
    const form = document.getElementById("form-bot-settings");
    Object.entries(settings).forEach(([key, value]) => {
      if (form.elements[key] && typeof value !== "object") form.elements[key].value = value;
    });
  } catch {
    // abaikan
  }
}

document.getElementById("form-bot-settings").addEventListener("submit", async (e) => {
  e.preventDefault();
  const feedback = document.getElementById("bot-settings-feedback");
  const fd = new FormData(e.target);
  const payload = Object.fromEntries(fd.entries());
  feedback.className = "feedback";
  feedback.textContent = "Menyimpan...";
  try {
    await api("/api/bot-settings", { method: "POST", body: JSON.stringify(payload) });
    feedback.className = "feedback success";
    feedback.textContent = "Identitas bot tersimpan.";
    loadPublicInfo();
  } catch (err) {
    feedback.className = "feedback error";
    feedback.textContent = err.message;
  }
});

// ================================
// DAFTAR COMMAND (halaman Menu Bot)
// ================================
async function loadCommandList() {
  const container = document.getElementById("command-list");
  try {
    const categories = await api("/api/menu");
    container.innerHTML = categories
      .map((cat) => {
        const items = cat.items
          .map(
            (i) =>
              `<span class="cmd-chip ${i.status === "key" ? "cmd-chip--locked" : ""}" title="${i.desc}">${
                i.status === "key" ? "⚿ " : ""
              }.${i.cmd}</span>`
          )
          .join("");
        return `<div class="cmd-category"><h4>${cat.title}</h4><div class="cmd-chips">${items}</div></div>`;
      })
      .join("");
  } catch {
    container.innerHTML = '<p class="empty-state">Gagal memuat daftar command.</p>';
  }
}

// ================================
// BACKSOUND (terpisah per halaman: login, home, menu bot)
// - Login: TIDAK autoplay sama sekali.
// - Home & Menu Bot: OTOMATIS nyala begitu halaman itu tampil. Tanpa tombol.
// ================================
const AUTOPLAY_PAGES = { home: "audio-home", menu: "audio-menu" };
let audioUnlocked = false;

// Nyalain backsound halaman tertentu (dipanggil pas masuk dashboard / pindah tab).
function playPageAudio(page) {
  const audioHome = document.getElementById("audio-home");
  const audioMenu = document.getElementById("audio-menu");
  audioHome.volume = 0.35;
  audioMenu.volume = 0.35;
  if (audioHome && page !== "home" && !audioHome.paused) audioHome.pause();
  if (audioMenu && page !== "menu" && !audioMenu.paused) audioMenu.pause();

  const audioId = AUTOPLAY_PAGES[page];
  if (!audioId) return;
  const audio = document.getElementById(audioId);
  if (audio) audio.play().catch(() => {}); // ditahan browser sampai ada interaksi -> lihat unlock di bawah
}

// Sebagian browser tetap blokir audio otomatis sebelum ada interaksi user SAMA SEKALI
// di halaman itu (walau sudah login). Begini disiasati: begitu user klik/ketuk apapun
// di dashboard buat pertama kali, coba nyalain lagi backsound halaman yang lagi aktif.
function unlockAudioOnFirstInteraction() {
  if (audioUnlocked) return;
  audioUnlocked = true;
  const activeBtn = document.querySelector(".nav-item.active");
  playPageAudio(activeBtn ? activeBtn.dataset.page : "home");
}
["click", "touchstart", "keydown"].forEach((evt) => {
  viewDashboard.addEventListener(evt, unlockAudioOnFirstInteraction, { once: true });
});

// ================================
// LOGIN
// ================================
formLogin.addEventListener("submit", async (e) => {
  e.preventDefault();
  loginError.textContent = "";
  const fd = new FormData(formLogin);
  try {
    await api("/api/auth/login", {
      method: "POST",
      body: JSON.stringify({
        username: fd.get("username"),
        password: fd.get("password"),
      }),
    });
    const status = await api("/api/status");
    playIntroThenDashboard(status);
  } catch (err) {
    loginError.textContent = err.message;
  }
});

// ================================
// REGISTER
// ================================
formRegister.addEventListener("submit", async (e) => {
  e.preventDefault();
  registerError.textContent = "";
  const fd = new FormData(formRegister);
  try {
    await api("/api/auth/register", {
      method: "POST",
      body: JSON.stringify({
        username: fd.get("username"),
        password: fd.get("password"),
      }),
    });
    const status = await api("/api/status");
    playIntroThenDashboard(status);
  } catch (err) {
    registerError.textContent = err.message;
  }
});

toRegister.addEventListener("click", (e) => {
  e.preventDefault();
  showRegister();
});
toLogin.addEventListener("click", (e) => {
  e.preventDefault();
  showLogin();
});

// ================================
// LOGOUT
// ================================
btnLogout.addEventListener("click", async () => {
  await api("/api/auth/logout", { method: "POST" });
  stopStatusPolling();
  showLogin();
});

// ================================
// FADE-IN helper - dipakai tiap ganti page/view
// ================================
function fadeInEl(el) {
  if (!el) return;
  el.classList.remove("zh-fade-in");
  void el.offsetWidth; // force reflow biar animasinya restart tiap dipanggil
  el.classList.add("zh-fade-in");
}

// ================================
// BOTTOM NAV
// ================================
function goToPage(pageKey) {
  navItems.forEach((b) => b.classList.toggle("active", b.dataset.page === pageKey));
  Object.entries(pages).forEach(([key, el]) => {
    el.style.display = key === pageKey ? "" : "none";
  });
  fadeInEl(pages[pageKey]);
  playPageAudio(pageKey);
}
navItems.forEach((btn) => {
  btn.addEventListener("click", () => goToPage(btn.dataset.page));
});

// ================================
// STATUS (polling tiap beberapa detik)
// ================================
let statusInterval = null;
let prevConnectionStatus = null;

function applyStatus(status) {
  if (prevConnectionStatus !== null && prevConnectionStatus !== status.connectionStatus) {
    if (status.connectionStatus === "connected") {
      showToast({
        type: "success",
        title: "WhatsApp Terhubung!",
        message: "Bot WhatsApp sekarang aktif dan siap menerima perintah.",
        duration: 6000,
      });
      sendDesktopNotification("WhatsApp Terhubung!", {
        body: "Bot WhatsApp sekarang aktif dan siap menerima perintah.",
        icon: "/assets/logo.png",
      });
    } else if (status.connectionStatus === "disconnected" && prevConnectionStatus === "connected") {
      showToast({
        type: "warning",
        title: "WhatsApp Terputus",
        message: "Koneksi WhatsApp bot terputus. Silakan hubungkan ulang.",
        duration: 6000,
      });
      sendDesktopNotification("WhatsApp Terputus", {
        body: "Koneksi WhatsApp bot terputus. Silakan hubungkan ulang.",
        icon: "/assets/logo.png",
      });
    }
  }
  prevConnectionStatus = status.connectionStatus;

  statusPill.classList.remove("connected", "connecting", "disconnected");
  statusPill.classList.add(status.connectionStatus);

  const labelMap = {
    connected: "Terhubung",
    connecting: "Menghubungkan...",
    disconnected: "Terputus",
  };
  statusText.textContent = labelMap[status.connectionStatus] || "Tidak diketahui";

  document.getElementById("home-status-value").textContent =
    labelMap[status.connectionStatus] || "-";

  renderLog(status.log || []);

  // Update tampilan pairing kode kalau lagi ada kode aktif & belum connected
  const codeWrap = document.getElementById("pairing-code-wrap");
  const idleWrap = document.getElementById("pairing-idle");
  if (status.lastPairingCode && status.connectionStatus !== "connected") {
    document.getElementById("pairing-code").textContent = status.lastPairingCode;
    hide(idleWrap);
    show(codeWrap);
  } else if (status.connectionStatus === "connected") {
    hide(codeWrap);
    show(idleWrap);
  }

  // Update tampilan QR
  const qrImage = document.getElementById("qr-image");
  const qrLoading = document.getElementById("qr-loading");
  if (status.lastQRDataUrl && status.connectionStatus !== "connected") {
    qrImage.src = status.lastQRDataUrl;
    show(qrImage);
    hide(qrLoading);
  } else {
    hide(qrImage);
    show(qrLoading);
    qrLoading.textContent =
      status.connectionStatus === "connected"
        ? "Sudah terhubung."
        : "Menunggu QR code...";
  }

  updateSenderEmptyState(status);
}

// Tampilan Pairing Sender: empty-state kalau belum ada aktivitas pairing sama
// sekali, otomatis pindah ke panel setup kalau lagi connecting/ada kode/QR/connected.
function updateSenderEmptyState(status) {
  const emptyState = document.getElementById("sender-empty-state");
  const setupPanel = document.getElementById("sender-setup-panel");
  const fab = document.getElementById("sender-fab");
  if (!emptyState || !setupPanel) return;

  const hasActivity =
    status.connectionStatus === "connected" ||
    status.connectionStatus === "connecting" ||
    !!status.lastPairingCode ||
    !!status.lastQRDataUrl ||
    setupPanel.dataset.opened === "1";

  if (hasActivity) {
    hide(emptyState);
    show(setupPanel);
    hide(fab);
  } else {
    show(emptyState);
    hide(setupPanel);
    show(fab);
  }
}

function openSenderSetupPanel() {
  const setupPanel = document.getElementById("sender-setup-panel");
  setupPanel.dataset.opened = "1";
  hide(document.getElementById("sender-empty-state"));
  show(setupPanel);
  hide(document.getElementById("sender-fab"));
  fadeInEl(setupPanel);
}
document.getElementById("btn-add-first-sender").addEventListener("click", openSenderSetupPanel);
document.getElementById("sender-fab").addEventListener("click", openSenderSetupPanel);
document.getElementById("btn-pairing-back").addEventListener("click", () => goToPage("home"));
document.getElementById("btn-pairing-refresh").addEventListener("click", async () => {
  try {
    const status = await api("/api/status");
    applyStatus(status);
  } catch {
    // diemin aja kalau gagal, polling status tetap jalan di background
  }
});

function renderLog(log) {
  const container = document.getElementById("activity-log");
  if (!log.length) {
    container.innerHTML = '<p class="empty-state">Belum ada aktivitas.</p>';
    return;
  }
  container.innerHTML = log
    .map((entry) => {
      const time = new Date(entry.time).toLocaleTimeString("id-ID");
      return `<div class="log-entry"><span>${escapeHtml(entry.text)}</span><span class="log-time">${time}</span></div>`;
    })
    .join("");
}

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str;
  return div.innerHTML;
}

function startStatusPolling() {
  stopStatusPolling();
  statusInterval = setInterval(async () => {
    try {
      const status = await api("/api/status");
      applyStatus(status);
    } catch {
      // sesi habis / logout dari tempat lain
      stopStatusPolling();
      showLogin();
    }
  }, 3000);
}

function stopStatusPolling() {
  if (statusInterval) clearInterval(statusInterval);
  statusInterval = null;
}

// ================================
// MENU BOT: kirim stiker
// ================================
document.getElementById("btn-send-sticker").addEventListener("click", async () => {
  const targetNumber = document.getElementById("sticker-target").value.trim();
  const feedback = document.getElementById("sticker-feedback");
  feedback.className = "feedback";
  feedback.textContent = "";

  if (!targetNumber) {
    feedback.className = "feedback error";
    feedback.textContent = "Isi nomor tujuan dulu.";
    return;
  }

  feedback.textContent = "Mengirim...";
  try {
    const res = await api("/api/send/sticker", {
      method: "POST",
      body: JSON.stringify({ targetNumber }),
    });
    feedback.className = "feedback success";
    feedback.textContent = `Berhasil kirim ${res.count} stiker.`;
  } catch (err) {
    feedback.className = "feedback error";
    feedback.textContent = err.message;
  }
});

// ================================
// MENU BOT: kirim teks berulang
// ================================
document.getElementById("btn-send-text").addEventListener("click", async () => {
  const targetNumber = document.getElementById("text-target").value.trim();
  const count = document.getElementById("text-count").value;
  const feedback = document.getElementById("text-feedback");
  feedback.className = "feedback";
  feedback.textContent = "";

  if (!targetNumber) {
    feedback.className = "feedback error";
    feedback.textContent = "Isi nomor tujuan dulu.";
    return;
  }

  feedback.textContent = "Mengirim...";
  try {
    const res = await api("/api/send/text", {
      method: "POST",
      body: JSON.stringify({ targetNumber, count }),
    });
    feedback.className = "feedback success";
    feedback.textContent = `Berhasil kirim ${res.sent} pesan.`;
  } catch (err) {
    feedback.className = "feedback error";
    feedback.textContent = err.message;
  }
});

// ================================
// MENU BOT: simpan pengaturan
// ================================
async function loadSettingsIntoForm() {
  try {
    const settings = await api("/api/settings");
    const form = document.getElementById("form-settings");
    Object.entries(settings).forEach(([key, value]) => {
      if (form.elements[key]) form.elements[key].value = value;
    });
  } catch {
    // abaikan, form tetap kosong
  }
}

document.getElementById("form-settings").addEventListener("submit", async (e) => {
  e.preventDefault();
  const feedback = document.getElementById("settings-feedback");
  const fd = new FormData(e.target);
  const payload = Object.fromEntries(fd.entries());

  feedback.className = "feedback";
  feedback.textContent = "Menyimpan...";
  try {
    await api("/api/settings", { method: "POST", body: JSON.stringify(payload) });
    feedback.className = "feedback success";
    feedback.textContent = "Pengaturan tersimpan.";
  } catch (err) {
    feedback.className = "feedback error";
    feedback.textContent = err.message;
  }
});

// ================================
// PAIRING SENDER
// ================================
let pairingMethod = "code";

const methodCodeBtn = document.getElementById("method-code-btn");
const methodQrBtn = document.getElementById("method-qr-btn");
const pairingMethodCode = document.getElementById("pairing-method-code");
const pairingMethodQr = document.getElementById("pairing-method-qr");

methodCodeBtn.addEventListener("click", () => {
  pairingMethod = "code";
  methodCodeBtn.classList.add("active");
  methodQrBtn.classList.remove("active");
  show(pairingMethodCode);
  hide(pairingMethodQr);
});

methodQrBtn.addEventListener("click", () => {
  pairingMethod = "qr";
  methodQrBtn.classList.add("active");
  methodCodeBtn.classList.remove("active");
  show(pairingMethodQr);
  hide(pairingMethodCode);
});

document.getElementById("btn-request-pairing").addEventListener("click", async () => {
  const phoneNumber = document.getElementById("pairing-phone").value.trim();
  const feedback = document.getElementById("pairing-feedback");
  feedback.className = "feedback";
  feedback.textContent = "";

  if (!phoneNumber) {
    feedback.className = "feedback error";
    feedback.textContent = "Isi nomor bot dulu.";
    showToast({
      type: "warning",
      title: "Nomor WhatsApp Diperlukan",
      message: "Silakan masukkan nomor WhatsApp dengan kode negara (contoh: 6281234567890).",
    });
    return;
  }

  // Minta izin notifikasi browser agar user dapat popup desktop
  requestNotificationPermission();

  feedback.textContent = "Meminta kode...";
  try {
    const res = await api("/api/pairing/request", {
      method: "POST",
      body: JSON.stringify({ phoneNumber }),
    });
    document.getElementById("pairing-code").textContent = res.code;
    hide(document.getElementById("pairing-idle"));
    show(document.getElementById("pairing-code-wrap"));

    feedback.className = "feedback success";
    feedback.textContent = "Kode pairing berhasil didapatkan!";

    showToast({
      type: "info",
      title: "Kode Pairing WhatsApp",
      message: `Kode kamu: ${res.code}. Buka WhatsApp > Perangkat Tertaut > Tautkan dengan nomor telepon.`,
      duration: 12000,
    });

    sendDesktopNotification("Kode Pairing WhatsApp", {
      body: `Kode kamu: ${res.code}. Masukkan kode ini di WhatsApp pada menu Perangkat Tertaut.`,
      icon: "/assets/logo.png",
    });
  } catch (err) {
    feedback.className = "feedback error";
    feedback.textContent = err.message;
    showToast({
      type: "error",
      title: "Gagal Mengambil Kode",
      message: err.message || "Terjadi kesalahan saat meminta kode pairing.",
    });
  }
});

// ================================
// START
// ================================
init();
