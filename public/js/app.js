// ==========================================================================
// ZAFKIELHUB - CLIENT APPLICATION SCRIPT
// English Role-Based Management System & WhatsApp Bot Controller
// ==========================================================================

// ================================
// API & DOM HELPERS
// ================================
async function api(path, options = {}) {
  const res = await fetch(path, {
    headers: { "Content-Type": "application/json" },
    ...options,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || "An unexpected error occurred.");
  return data;
}

function show(el) { if (el) el.style.display = ""; }
function hide(el) { if (el) el.style.display = "none"; }

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str || "";
  return div.innerHTML;
}

function fadeInEl(el) {
  if (!el) return;
  el.classList.remove("zh-fade-in");
  void el.offsetWidth; // Force reflow
  el.classList.add("zh-fade-in");
}

function formatDate(isoStr) {
  if (!isoStr) return "N/A";
  try {
    const d = new Date(isoStr);
    return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  } catch {
    return isoStr;
  }
}

// ================================
// TOAST & DESKTOP NOTIFICATIONS
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
    <button class="toast-close" type="button" aria-label="Close">
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
// APPLICATION STATE
// ================================
let currentUser = {
  id: "",
  username: "",
  role: "member",
  avatar: "",
  adminRequest: null,
  createdAt: "",
};

let botPublicInfo = {
  botName: "ZafkielHub",
  ownerName: "",
  ownerNumber: "",
  tiktokUrl: "",
  telegramUrl: "",
  botVersion: "1.0.0",
};

let prevConnectionStatus = null;
let statusInterval = null;
let audioUnlocked = false;

// ================================
// DOM ELEMENTS
// ================================
const viewLogin = document.getElementById("view-login");
const viewRegister = document.getElementById("view-register");
const viewDashboard = document.getElementById("view-dashboard");
const viewIntro = document.getElementById("view-intro");
const viewProfile = document.getElementById("view-profile");
const introVideo = document.getElementById("intro-video");

const formLogin = document.getElementById("form-login");
const formRegister = document.getElementById("form-register");
const loginError = document.getElementById("login-error");
const registerError = document.getElementById("register-error");

const toRegister = document.getElementById("to-register");
const toRegisterWrap = document.getElementById("to-register-wrap");
const toLogin = document.getElementById("to-login");
const btnSkipIntro = document.getElementById("btn-skip-intro");

const btnLogout = document.getElementById("btn-logout");
const statusPill = document.getElementById("status-pill");
const statusText = document.getElementById("status-text");

// Profile elements
const btnOpenProfile = document.getElementById("btn-open-profile");
const btnProfileBack = document.getElementById("btn-profile-back");
const btnProfileClose = document.getElementById("btn-profile-close");
const btnChangeAvatar = document.getElementById("btn-change-avatar");
const avatarFileInput = document.getElementById("avatar-file-input");
const btnRequestAdminRole = document.getElementById("btn-request-admin-role");
const homeBtnRequestAdmin = document.getElementById("home-btn-request-admin");
const formChangePassword = document.getElementById("form-change-password");

const navItems = document.querySelectorAll(".nav-item");
const pages = {
  home: document.getElementById("page-home"),
  menu: document.getElementById("page-menu"),
  pairing: document.getElementById("page-pairing"),
  history: document.getElementById("page-history"),
};

// ================================
// INITIALIZATION
// ================================
async function init() {
  await loadPublicInfo();
  try {
    const status = await api("/api/status");
    enterDashboard(status);
  } catch {
    showLogin();
  }
}

function showLogin() {
  hide(viewRegister);
  hide(viewDashboard);
  hide(viewProfile);
  show(viewLogin);
  fadeInEl(viewLogin);
}

function showRegister() {
  hide(viewLogin);
  hide(viewDashboard);
  hide(viewProfile);
  show(viewRegister);
  fadeInEl(viewRegister);
}

async function enterDashboard(status) {
  hide(viewLogin);
  hide(viewRegister);
  hide(viewIntro);
  show(viewDashboard);
  fadeInEl(viewDashboard);

  currentUser = {
    id: status.userId || "",
    username: status.username || "",
    role: status.role || "member",
    avatar: status.avatar || "",
    adminRequest: status.adminRequest || null,
    createdAt: status.createdAt || "",
  };

  updateUserUI(currentUser);
  applyRolePermissions(currentUser.role, currentUser);
  applyStatus(status);

  loadSettingsIntoForm();
  loadBotSettingsIntoForm();
  loadCommandList();
  startStatusPolling();
  playPageAudio("home");
}

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
// USER UI & ROLE-BASED ACCESS CONTROL
// ================================
function updateUserUI(user) {
  // Topbar
  const topbarUser = document.getElementById("topbar-username-text");
  if (topbarUser) topbarUser.textContent = user.username || "User";

  // Home overview
  const homeUser = document.getElementById("home-username-value");
  if (homeUser) homeUser.textContent = user.username || "User";

  // Profile modal
  const profileUser = document.getElementById("profile-username-val");
  if (profileUser) profileUser.textContent = user.username || "User";

  const profileJoined = document.getElementById("profile-joined-val");
  if (profileJoined) {
    profileJoined.textContent = user.createdAt
      ? `Member since ${formatDate(user.createdAt)}`
      : "Active Member";
  }

  // Update avatar displays
  updateAvatarUI(user.avatar);
}

function updateAvatarUI(avatarUrl) {
  const topbarImg = document.getElementById("topbar-avatar-img");
  const topbarFallback = document.getElementById("topbar-avatar-fallback");
  const homeImg = document.getElementById("home-avatar-img");
  const homeFallback = document.getElementById("home-avatar-fallback");
  const profileImg = document.getElementById("profile-avatar-img");
  const profileFallback = document.getElementById("profile-avatar-fallback");

  if (avatarUrl) {
    if (topbarImg) { topbarImg.src = avatarUrl; show(topbarImg); }
    if (topbarFallback) hide(topbarFallback);

    if (homeImg) { homeImg.src = avatarUrl; show(homeImg); }
    if (homeFallback) hide(homeFallback);

    if (profileImg) { profileImg.src = avatarUrl; show(profileImg); }
    if (profileFallback) hide(profileFallback);
  } else {
    if (topbarImg) hide(topbarImg);
    if (topbarFallback) show(topbarFallback);

    if (homeImg) hide(homeImg);
    if (homeFallback) show(homeFallback);

    if (profileImg) hide(profileImg);
    if (profileFallback) show(profileFallback);
  }
}

function applyRolePermissions(role, user) {
  const roleKey = (role || "member").toLowerCase();

  const roleMeta = {
    owner: { title: "Owner \u{1F451}", class: "role-badge-owner" },
    admin: { title: "Admin \u{1F6E1}\u{FE0F}", class: "role-badge-admin" },
    premium: { title: "Premium \u{2B50}", class: "role-badge-premium" },
    member: { title: "Member \u{1F464}", class: "role-badge-member" },
  }[roleKey] || { title: "Member \u{1F464}", class: "role-badge-member" };

  // Update role badges
  const topbarRole = document.getElementById("topbar-role-badge");
  if (topbarRole) {
    topbarRole.textContent = roleMeta.title;
    topbarRole.className = `role-badge-mini ${roleMeta.class}`;
  }

  const homeRole = document.getElementById("home-role-badge");
  if (homeRole) {
    homeRole.textContent = roleMeta.title;
    homeRole.className = `role-badge ${roleMeta.class}`;
  }

  const profileRole = document.getElementById("profile-role-badge");
  if (profileRole) {
    profileRole.textContent = roleMeta.title;
    profileRole.className = `role-badge ${roleMeta.class}`;
  }

  // --- Home Upgrade Banner ---
  const homeUpgradeBanner = document.getElementById("home-upgrade-banner");
  if (homeUpgradeBanner) {
    if (roleKey === "member") show(homeUpgradeBanner);
    else hide(homeUpgradeBanner);
  }

  // --- Menu Bot Role Notice ---
  const menuRoleNotice = document.getElementById("menu-role-notice");
  if (menuRoleNotice) {
    if (roleKey === "member") show(menuRoleNotice);
    else hide(menuRoleNotice);
  }

  // --- Send Sticker Pack Card ---
  const stickerBody = document.getElementById("sticker-feature-body");
  const stickerLocked = document.getElementById("sticker-locked-overlay");
  if (roleKey === "owner" || roleKey === "admin") {
    show(stickerBody);
    hide(stickerLocked);
  } else {
    hide(stickerBody);
    show(stickerLocked);
  }

  // --- Send Repeated Text Card ---
  const textBody = document.getElementById("text-feature-body");
  const textLocked = document.getElementById("text-locked-overlay");
  if (roleKey === "owner" || roleKey === "admin") {
    show(textBody);
    hide(textLocked);
  } else {
    hide(textBody);
    show(textLocked);
  }

  // --- Bot Identity Card (Owner Only) ---
  const botIdentityForm = document.getElementById("form-bot-settings");
  const botIdentityLocked = document.getElementById("bot-identity-locked-overlay");
  const botIdentityActions = document.getElementById("bot-settings-actions");
  if (roleKey === "owner") {
    hide(botIdentityLocked);
    show(botIdentityActions);
    if (botIdentityForm) {
      Array.from(botIdentityForm.elements).forEach((el) => (el.disabled = false));
    }
  } else {
    show(botIdentityLocked);
    hide(botIdentityActions);
    if (botIdentityForm) {
      Array.from(botIdentityForm.elements).forEach((el) => (el.disabled = true));
    }
  }

  // --- Delays & Watermark Config (Admin & Owner) ---
  const settingsForm = document.getElementById("form-settings");
  const settingsLocked = document.getElementById("settings-locked-overlay");
  const settingsActions = document.getElementById("settings-actions");
  if (roleKey === "owner" || roleKey === "admin") {
    hide(settingsLocked);
    show(settingsActions);
    if (settingsForm) {
      Array.from(settingsForm.elements).forEach((el) => (el.disabled = false));
    }
  } else {
    show(settingsLocked);
    hide(settingsActions);
    if (settingsForm) {
      Array.from(settingsForm.elements).forEach((el) => (el.disabled = true));
    }
  }

  // --- Owner User Management Panel ---
  const cardOwnerManagement = document.getElementById("card-owner-management");
  if (cardOwnerManagement) {
    if (roleKey === "owner") {
      show(cardOwnerManagement);
      loadOwnerManagementData();
    } else {
      hide(cardOwnerManagement);
    }
  }

  // --- Admin Request Button in Profile ---
  updateAdminRequestButtonState(user);
}

function updateAdminRequestButtonState(user) {
  const btn = document.getElementById("btn-request-admin-role");
  const btnText = document.getElementById("btn-request-admin-text");
  const hint = document.getElementById("admin-request-status-hint");
  const role = (user.role || "member").toLowerCase();

  if (role === "owner" || role === "admin") {
    if (btn) btn.style.display = "none";
    if (hint) hint.textContent = "You currently hold elevated administrative privileges.";
    return;
  }

  if (btn) btn.style.display = "";

  const reqStatus = user.adminRequest?.status;
  if (reqStatus === "pending") {
    if (btn) btn.disabled = true;
    if (btnText) btnText.textContent = "Request Pending Approval \u{23F3}";
    if (hint) hint.textContent = "Your Admin promotion request is pending Owner review.";
  } else if (reqStatus === "approved") {
    if (btn) btn.disabled = true;
    if (btnText) btnText.textContent = "Admin Approved \u{2705}";
    if (hint) hint.textContent = "Your account has been granted Admin permissions.";
  } else if (reqStatus === "rejected") {
    if (btn) btn.disabled = false;
    if (btnText) btnText.textContent = "Re-request Admin Role";
    if (hint) hint.textContent = "Previous request was declined. You may re-submit or contact the Owner.";
  } else {
    if (btn) btn.disabled = false;
    if (btnText) btnText.textContent = "Request Admin Role";
    if (hint) hint.textContent = "Submit a request to the Owner for Admin authorization.";
  }
}

// ================================
// PROFILE VIEW & AVATAR UPLOAD
// ================================
function openProfile() {
  updateUserUI(currentUser);
  updateAdminRequestButtonState(currentUser);
  show(viewProfile);
  fadeInEl(viewProfile);
}

function closeProfile() {
  hide(viewProfile);
}

btnOpenProfile.addEventListener("click", openProfile);
btnProfileBack.addEventListener("click", closeProfile);
btnProfileClose.addEventListener("click", closeProfile);

// Avatar Photo Upload Handler ("fotoprolifes")
btnChangeAvatar.addEventListener("click", () => {
  avatarFileInput.click();
});

avatarFileInput.addEventListener("change", async (e) => {
  const file = e.target.files?.[0];
  if (!file) return;

  if (!file.type.startsWith("image/")) {
    showToast({
      type: "warning",
      title: "Invalid File Type",
      message: "Please select a valid image file (PNG, JPG, WebP, GIF).",
    });
    return;
  }

  if (file.size > 8 * 1024 * 1024) {
    showToast({
      type: "warning",
      title: "File Too Large",
      message: "Profile photo size must not exceed 8MB.",
    });
    return;
  }

  showToast({
    type: "info",
    title: "Uploading Profile Photo",
    message: "Processing and saving your avatar...",
    duration: 3000,
  });

  const reader = new FileReader();
  reader.onload = async (evt) => {
    const avatarData = evt.target.result;
    try {
      const res = await api("/api/profile/avatar", {
        method: "POST",
        body: JSON.stringify({ avatarData }),
      });

      currentUser.avatar = res.avatar;
      updateAvatarUI(res.avatar);

      showToast({
        type: "success",
        title: "Avatar Updated",
        message: "Your profile photo has been successfully updated!",
      });
    } catch (err) {
      showToast({
        type: "error",
        title: "Upload Failed",
        message: err.message,
      });
    }
  };
  reader.readAsDataURL(file);
});

// Admin Request action
async function handleAdminRequest() {
  try {
    const res = await api("/api/role/request-admin", { method: "POST" });
    currentUser.adminRequest = { status: "pending", requestedAt: new Date().toISOString() };
    updateAdminRequestButtonState(currentUser);

    showToast({
      type: "success",
      title: "Admin Request Submitted",
      message: "Your request has been forwarded to the Owner for confirmation.",
      duration: 7000,
    });
  } catch (err) {
    showToast({
      type: "error",
      title: "Request Error",
      message: err.message,
    });
  }
}

if (btnRequestAdminRole) btnRequestAdminRole.addEventListener("click", handleAdminRequest);
if (homeBtnRequestAdmin) homeBtnRequestAdmin.addEventListener("click", () => {
  openProfile();
  handleAdminRequest();
});

// Change Password Handler
formChangePassword.addEventListener("submit", async (e) => {
  e.preventDefault();
  const feedback = document.getElementById("change-pwd-feedback");
  const currentPassword = document.getElementById("pwd-current").value;
  const newPassword = document.getElementById("pwd-new").value;

  feedback.className = "feedback";
  feedback.textContent = "Updating password...";

  try {
    await api("/api/auth/change-password", {
      method: "POST",
      body: JSON.stringify({ currentPassword, newPassword }),
    });

    feedback.className = "feedback success";
    feedback.textContent = "Password successfully changed.";
    document.getElementById("pwd-current").value = "";
    document.getElementById("pwd-new").value = "";

    showToast({
      type: "success",
      title: "Security Update",
      message: "Your password was updated successfully.",
    });
  } catch (err) {
    feedback.className = "feedback error";
    feedback.textContent = err.message;
  }
});

// ================================
// OWNER MANAGEMENT PANEL
// ================================
async function loadOwnerManagementData() {
  if (currentUser.role !== "owner") return;

  const reqListContainer = document.getElementById("owner-pending-requests-list");
  const usersTableBody = document.getElementById("owner-users-table-body");

  try {
    const users = await api("/api/admin/users");

    // 1. Pending Admin Requests
    const pending = users.filter((u) => u.adminRequest?.status === "pending" && u.role !== "owner" && u.role !== "admin");
    if (!pending.length) {
      reqListContainer.innerHTML = '<p class="empty-state">No pending Admin requests at this time.</p>';
    } else {
      reqListContainer.innerHTML = pending
        .map(
          (u) => `
        <div class="owner-request-item">
          <div class="owner-request-user">
            <strong>@${escapeHtml(u.username)}</strong>
            <span class="role-badge role-badge-member">${escapeHtml(u.role)}</span>
            <span class="owner-request-time">Requested ${u.adminRequest.requestedAt ? formatDate(u.adminRequest.requestedAt) : "recently"}</span>
          </div>
          <div class="owner-request-btns">
            <button class="btn btn-primary btn-xs" onclick="approveAdminRequest('${u.id}', '${escapeHtml(u.username)}')">Approve Admin</button>
            <button class="btn btn-ghost btn-xs" onclick="rejectAdminRequest('${u.id}', '${escapeHtml(u.username)}')">Decline</button>
          </div>
        </div>
      `
        )
        .join("");
    }

    // 2. All Registered Users Table
    if (!users.length) {
      usersTableBody.innerHTML = '<tr><td colspan="4" class="empty-state">No registered accounts found.</td></tr>';
    } else {
      usersTableBody.innerHTML = users
        .map((u) => {
          const isMe = u.id === currentUser.id;
          return `
          <tr>
            <td>
              <div style="display:flex;align-items:center;gap:8px;">
                <strong>${escapeHtml(u.username)}</strong>
                ${isMe ? '<span style="font-size:0.7rem;color:var(--accent);font-weight:700;">(You)</span>' : ""}
              </div>
            </td>
            <td>
              <span class="role-badge role-badge-${u.role}">${escapeHtml(u.role)}</span>
            </td>
            <td style="color:var(--text-dim);font-size:0.8rem;">
              ${formatDate(u.createdAt)}
            </td>
            <td>
              ${
                isMe
                  ? '<span style="color:var(--text-dim);font-size:0.8rem;">Owner Account</span>'
                  : `
                <select class="owner-role-select" onchange="changeUserRole('${u.id}', this.value, '${escapeHtml(u.username)}')">
                  <option value="member" ${u.role === "member" ? "selected" : ""}>Member</option>
                  <option value="premium" ${u.role === "premium" ? "selected" : ""}>Premium</option>
                  <option value="admin" ${u.role === "admin" ? "selected" : ""}>Admin</option>
                  <option value="owner" ${u.role === "owner" ? "selected" : ""}>Owner</option>
                </select>
              `
              }
            </td>
          </tr>
        `;
        })
        .join("");
    }
  } catch (err) {
    if (reqListContainer) reqListContainer.innerHTML = `<p class="empty-state">Failed to load requests: ${escapeHtml(err.message)}</p>`;
  }
}

// Window actions for Owner
window.approveAdminRequest = async function (userId, username) {
  try {
    await api(`/api/admin/requests/${userId}/approve`, { method: "POST" });
    showToast({
      type: "success",
      title: "Admin Approved",
      message: `@${username} has been promoted to Admin.`,
    });
    loadOwnerManagementData();
  } catch (err) {
    showToast({ type: "error", title: "Action Failed", message: err.message });
  }
};

window.rejectAdminRequest = async function (userId, username) {
  try {
    await api(`/api/admin/requests/${userId}/reject`, { method: "POST" });
    showToast({
      type: "info",
      title: "Request Declined",
      message: `Admin request for @${username} was declined.`,
    });
    loadOwnerManagementData();
  } catch (err) {
    showToast({ type: "error", title: "Action Failed", message: err.message });
  }
};

window.changeUserRole = async function (userId, newRole, username) {
  try {
    await api(`/api/admin/users/${userId}/role`, {
      method: "POST",
      body: JSON.stringify({ role: newRole }),
    });
    showToast({
      type: "success",
      title: "Role Updated",
      message: `Role for @${username} changed to ${newRole.toUpperCase()}.`,
    });
    loadOwnerManagementData();
  } catch (err) {
    showToast({ type: "error", title: "Role Update Failed", message: err.message });
  }
};

// ================================
// PUBLIC INFO & CONTACT LINKS
// ================================
async function loadPublicInfo() {
  try {
    const info = await api("/api/public-info");
    botPublicInfo = { ...botPublicInfo, ...info };

    const ownerWaLink = info.ownerNumber
      ? `https://wa.me/${info.ownerNumber.replace(/[^0-9]/g, "")}?text=${encodeURIComponent("Hello Owner, I want to purchase Admin / Premium access for ZafkielHub bot.")}`
      : "#";

    const ownerTgLink = info.telegramUrl || "#";

    // Social Links
    document.querySelectorAll("#link-tiktok, #link-tiktok-2").forEach((el) => (el.href = info.tiktokUrl || "#"));
    document.querySelectorAll("#link-telegram, #link-telegram-2").forEach((el) => (el.href = info.telegramUrl || "#"));

    // Upgrade Purchase Links
    document.querySelectorAll("#link-buy-wa, #home-link-wa").forEach((el) => (el.href = ownerWaLink));
    document.querySelectorAll("#link-buy-tg").forEach((el) => (el.href = ownerTgLink));
  } catch {}
}

// ================================
// BOT SETTINGS (OWNER ONLY)
// ================================
async function loadBotSettingsIntoForm() {
  try {
    const settings = await api("/api/bot-settings");
    const form = document.getElementById("form-bot-settings");
    if (!form) return;
    Object.entries(settings).forEach(([key, value]) => {
      if (form.elements[key] && typeof value !== "object") {
        form.elements[key].value = value;
      }
    });
  } catch {}
}

document.getElementById("form-bot-settings").addEventListener("submit", async (e) => {
  e.preventDefault();
  const feedback = document.getElementById("bot-settings-feedback");
  const fd = new FormData(e.target);
  const payload = Object.fromEntries(fd.entries());

  feedback.className = "feedback";
  feedback.textContent = "Saving bot identity...";

  try {
    await api("/api/bot-settings", { method: "POST", body: JSON.stringify(payload) });
    feedback.className = "feedback success";
    feedback.textContent = "Bot identity settings successfully saved.";
    loadPublicInfo();
    showToast({
      type: "success",
      title: "Bot Settings Saved",
      message: "Bot profile configuration was updated.",
    });
  } catch (err) {
    feedback.className = "feedback error";
    feedback.textContent = err.message;
    showToast({ type: "error", title: "Save Failed", message: err.message });
  }
});

// ================================
// COMMAND CATALOG (MEMBER / ADMIN)
// ================================
async function loadCommandList() {
  const container = document.getElementById("command-list");
  if (!container) return;

  try {
    const categories = await api("/api/menu");
    const isMember = currentUser.role === "member";

    if (isMember) {
      // Member mode: categories overview with descriptions
      container.innerHTML = categories
        .map((cat) => {
          const chipItems = cat.items
            .map((i) => `<span class="cmd-chip" title="${escapeHtml(i.desc)}">.${escapeHtml(i.cmd)}</span>`)
            .join("");

          return `
          <div class="cmd-category-card">
            <div class="cmd-category-card-head">
              <h4>${escapeHtml(cat.title)}</h4>
              <span class="cmd-count-badge">${cat.items.length} commands</span>
            </div>
            ${cat.desc ? `<p class="cmd-category-card-desc">${escapeHtml(cat.desc)}</p>` : ""}
            <div class="cmd-chips">${chipItems}</div>
          </div>
        `;
        })
        .join("");
    } else {
      // Admin/Owner mode: full chips
      container.innerHTML = categories
        .map((cat) => {
          const items = cat.items
            .map(
              (i) =>
                `<span class="cmd-chip ${i.status === "key" ? "cmd-chip--locked" : ""}" title="${escapeHtml(i.desc)}">${
                  i.status === "key" ? "\u{26BF} " : ""
                }.${escapeHtml(i.cmd)}</span>`
            )
            .join("");
          return `<div class="cmd-category"><h4>${escapeHtml(cat.title)}</h4><div class="cmd-chips">${items}</div></div>`;
        })
        .join("");
    }
  } catch {
    container.innerHTML = '<p class="empty-state">Failed to load command catalog.</p>';
  }
}

// ================================
// BROADCAST TOOLS (ADMIN / OWNER)
// ================================
document.getElementById("btn-send-sticker").addEventListener("click", async () => {
  const targetNumber = document.getElementById("sticker-target").value.trim();
  const feedback = document.getElementById("sticker-feedback");
  feedback.className = "feedback";
  feedback.textContent = "";

  if (!targetNumber) {
    feedback.className = "feedback error";
    feedback.textContent = "Please enter a destination phone number.";
    return;
  }

  feedback.textContent = "Sending sticker pack...";
  try {
    const res = await api("/api/send/sticker", {
      method: "POST",
      body: JSON.stringify({ targetNumber }),
    });
    feedback.className = "feedback success";
    feedback.textContent = `Successfully sent ${res.count} stickers.`;
    showToast({
      type: "success",
      title: "Sticker Pack Sent",
      message: `Successfully delivered ${res.count} stickers to ${targetNumber}.`,
    });
  } catch (err) {
    feedback.className = "feedback error";
    feedback.textContent = err.message;
    showToast({ type: "error", title: "Send Failed", message: err.message });
  }
});

document.getElementById("btn-send-text").addEventListener("click", async () => {
  const targetNumber = document.getElementById("text-target").value.trim();
  const count = document.getElementById("text-count").value;
  const feedback = document.getElementById("text-feedback");
  feedback.className = "feedback";
  feedback.textContent = "";

  if (!targetNumber) {
    feedback.className = "feedback error";
    feedback.textContent = "Please enter a destination phone number.";
    return;
  }

  feedback.textContent = "Sending repeated broadcast...";
  try {
    const res = await api("/api/send/text", {
      method: "POST",
      body: JSON.stringify({ targetNumber, count }),
    });
    feedback.className = "feedback success";
    feedback.textContent = `Successfully sent ${res.sent} message(s).`;
    showToast({
      type: "success",
      title: "Broadcast Complete",
      message: `Sent ${res.sent} repeated messages to ${targetNumber}.`,
    });
  } catch (err) {
    feedback.className = "feedback error";
    feedback.textContent = err.message;
    showToast({ type: "error", title: "Broadcast Failed", message: err.message });
  }
});

// ================================
// WATERMARK & DELAY SETTINGS
// ================================
async function loadSettingsIntoForm() {
  try {
    const settings = await api("/api/settings");
    const form = document.getElementById("form-settings");
    if (!form) return;
    Object.entries(settings).forEach(([key, value]) => {
      if (form.elements[key]) form.elements[key].value = value;
    });
  } catch {}
}

document.getElementById("form-settings").addEventListener("submit", async (e) => {
  e.preventDefault();
  const feedback = document.getElementById("settings-feedback");
  const fd = new FormData(e.target);
  const payload = Object.fromEntries(fd.entries());

  feedback.className = "feedback";
  feedback.textContent = "Saving delay configuration...";
  try {
    await api("/api/settings", { method: "POST", body: JSON.stringify(payload) });
    feedback.className = "feedback success";
    feedback.textContent = "Configuration saved successfully.";
    showToast({
      type: "success",
      title: "Configuration Saved",
      message: "Watermark and delay settings have been applied.",
    });
  } catch (err) {
    feedback.className = "feedback error";
    feedback.textContent = err.message;
    showToast({ type: "error", title: "Save Failed", message: err.message });
  }
});

// ================================
// DEVICE PAIRING
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
    feedback.textContent = "Please provide the bot WhatsApp phone number.";
    showToast({
      type: "warning",
      title: "Phone Number Required",
      message: "Enter the WhatsApp number including country code (e.g. 6281234567890).",
    });
    return;
  }

  requestNotificationPermission();

  feedback.textContent = "Requesting pairing code...";
  try {
    const res = await api("/api/pairing/request", {
      method: "POST",
      body: JSON.stringify({ phoneNumber }),
    });

    document.getElementById("pairing-code").textContent = res.code;
    hide(document.getElementById("pairing-idle"));
    show(document.getElementById("pairing-code-wrap"));

    feedback.className = "feedback success";
    feedback.textContent = "Pairing code generated successfully!";

    showToast({
      type: "info",
      title: "Pairing Code Generated",
      message: `Your code: ${res.code}. Enter this code in WhatsApp > Linked Devices.`,
      duration: 12000,
    });

    sendDesktopNotification("WhatsApp Pairing Code", {
      body: `Your code is ${res.code}. Enter this in WhatsApp on Linked Devices.`,
      icon: "/assets/logo.png",
    });
  } catch (err) {
    feedback.className = "feedback error";
    feedback.textContent = err.message;
    showToast({
      type: "error",
      title: "Pairing Request Failed",
      message: err.message,
    });
  }
});

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
    showToast({ type: "info", title: "Status Refreshed", message: "Updated connection state.", duration: 2000 });
  } catch {}
});

// ================================
// AUDIO MANAGEMENT
// ================================
const AUTOPLAY_PAGES = { home: "audio-home", menu: "audio-menu" };

function playPageAudio(page) {
  const audioHome = document.getElementById("audio-home");
  const audioMenu = document.getElementById("audio-menu");
  if (audioHome) audioHome.volume = 0.35;
  if (audioMenu) audioMenu.volume = 0.35;

  if (audioHome && page !== "home" && !audioHome.paused) audioHome.pause();
  if (audioMenu && page !== "menu" && !audioMenu.paused) audioMenu.pause();

  const audioId = AUTOPLAY_PAGES[page];
  if (!audioId) return;
  const audio = document.getElementById(audioId);
  if (audio) audio.play().catch(() => {});
}

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
// STATUS POLLING & LOGS
// ================================
function applyStatus(status) {
  if (prevConnectionStatus !== null && prevConnectionStatus !== status.connectionStatus) {
    if (status.connectionStatus === "connected") {
      showToast({
        type: "success",
        title: "WhatsApp Connected!",
        message: "Bot WhatsApp is online and actively listening for commands.",
        duration: 6000,
      });
      sendDesktopNotification("WhatsApp Connected!", {
        body: "Bot WhatsApp is online and ready.",
        icon: "/assets/logo.png",
      });
    } else if (status.connectionStatus === "disconnected" && prevConnectionStatus === "connected") {
      showToast({
        type: "warning",
        title: "WhatsApp Disconnected",
        message: "WhatsApp session was disconnected. Please re-pair the bot.",
        duration: 6000,
      });
      sendDesktopNotification("WhatsApp Disconnected", {
        body: "Bot WhatsApp session was closed.",
        icon: "/assets/logo.png",
      });
    }
  }
  prevConnectionStatus = status.connectionStatus;

  statusPill.classList.remove("connected", "connecting", "disconnected");
  statusPill.classList.add(status.connectionStatus);

  const labelMap = {
    connected: "Connected",
    connecting: "Connecting...",
    disconnected: "Disconnected",
  };
  statusText.textContent = labelMap[status.connectionStatus] || "Unknown";

  const homeStatus = document.getElementById("home-status-value");
  if (homeStatus) homeStatus.textContent = labelMap[status.connectionStatus] || "-";

  const homeBotName = document.getElementById("home-botname-value");
  if (homeBotName) homeBotName.textContent = status.botName || "-";

  const homeBotVer = document.getElementById("home-botversion-value");
  if (homeBotVer) homeBotVer.textContent = status.botVersion ? `v${status.botVersion}` : "-";

  const brandVer = document.getElementById("brand-version");
  if (brandVer) brandVer.textContent = status.botVersion ? `v${status.botVersion}` : "";

  renderLog(status.log || []);

  // Update role if changed dynamically
  if (status.role && status.role !== currentUser.role) {
    currentUser.role = status.role;
    applyRolePermissions(currentUser.role, currentUser);
  }

  // Update pairing code
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

  // Update QR
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
      status.connectionStatus === "connected" ? "Already connected." : "Waiting for QR code...";
  }

  updateSenderEmptyState(status);
}

function renderLog(log) {
  const container = document.getElementById("activity-log");
  if (!container) return;
  if (!log.length) {
    container.innerHTML = '<p class="empty-state">No recent activity recorded.</p>';
    return;
  }
  container.innerHTML = log
    .map((entry) => {
      const time = new Date(entry.time).toLocaleTimeString("en-US", { hour12: false });
      return `<div class="log-entry"><span>${escapeHtml(entry.text)}</span><span class="log-time">${time}</span></div>`;
    })
    .join("");
}

function startStatusPolling() {
  stopStatusPolling();
  statusInterval = setInterval(async () => {
    try {
      const status = await api("/api/status");
      applyStatus(status);
    } catch {
      stopStatusPolling();
      showLogin();
    }
  }, 3500);
}

function stopStatusPolling() {
  if (statusInterval) clearInterval(statusInterval);
  statusInterval = null;
}

// ================================
// NAVIGATION & PAGE SWITCHING
// ================================
function goToPage(pageKey) {
  navItems.forEach((b) => b.classList.toggle("active", b.dataset.page === pageKey));
  Object.entries(pages).forEach(([key, el]) => {
    if (el) el.style.display = key === pageKey ? "" : "none";
  });
  fadeInEl(pages[pageKey]);
  playPageAudio(pageKey);
}

navItems.forEach((btn) => {
  btn.addEventListener("click", () => goToPage(btn.dataset.page));
});

// ================================
// AUTHENTICATION FORMS
// ================================
formLogin.addEventListener("submit", async (e) => {
  e.preventDefault();
  loginError.textContent = "";
  const fd = new FormData(formLogin);
  try {
    const res = await api("/api/auth/login", {
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

formRegister.addEventListener("submit", async (e) => {
  e.preventDefault();
  registerError.textContent = "";
  const fd = new FormData(formRegister);
  try {
    const res = await api("/api/auth/register", {
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

btnLogout.addEventListener("click", async () => {
  await api("/api/auth/logout", { method: "POST" });
  stopStatusPolling();
  showLogin();
});

// ================================
// BOOTSTRAP
// ================================
init();

