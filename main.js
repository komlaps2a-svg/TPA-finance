/* =========================================================
   TPA FINANCE v4.8 - MAIN.JS
   Isi: Config, State, Utils, Toast Apple, Modal + Scroll Lock,
        DB Lokal, Jadwal Sholat GPS Live, Versi/Refresh, Supabase Sync,
        Tema, Header & Profil (lihat + edit).
========================================================= */
"use strict";

const APP_VERSION = '4.8';
const LS_PREFIX = 'tpa_finance_v48_';   // JANGAN diubah: menjaga data lama tetap terbaca

const SUPABASE_URL = 'https://ndsyyaxmiwskrkklseap.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5kc3l5YXhtaXdza3Jra2xzZWFwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODUxNDU4NjIsImV4cCI6MjEwMDcyMTg2Mn0.uXgAIhUjjkNpe9s6N6LGvRXZLUDQUZJrSfUFf1BDmKU';
const SECRET_KEY = "TPA_Finance_Secure_K3y_v47";
const EMAILJS_SERVICE_ID = 'service_l08406o';
const EMAILJS_TEMPLATE_ID = 'template_osq8mgb';
const EMAILJS_PUBLIC_KEY = 'u7HQ-8xrDo99w3wmh';

const DEFAULT_PHOTO = 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAyNCAyNCIgZmlsbD0iIzIyYzU1ZSI+PHBhdGggZD0iTTEyIDJhNSA1IDAgMSAwIDUgNSBNMTIgMTRhNyA3IDAgMCAwLTcgN3YxSDE5di0xYTcgNyAwIDAgMC03LTdaIi8+PC9zdmc+';

// ---------- Utilitas penyimpanan (dipakai state di bawah) ----------
function getLS(key) { try { return localStorage.getItem(LS_PREFIX + key); } catch (e) { return null; } }
function setLS(key, val) { try { localStorage.setItem(LS_PREFIX + key, val); } catch (e) {} }
function removeLS(key) { try { localStorage.removeItem(LS_PREFIX + key); } catch (e) {} }
function safeParse(str, fallback) { try { const v = JSON.parse(str); return v === null || v === undefined ? fallback : v; } catch (e) { return fallback; } }

// ==========================================
// STATE
// ==========================================
let sbClient = null;
let db = [];
let pendingSync = safeParse(getLS('pending_sync'), []);
let wishlists = [];
let driveLinks = [];
let sppData = [];
let attendanceData = { lastReset: new Date().toISOString(), records: {} };
let currentUser = null;
let APP_MODE = getLS('app_mode') || 'GUEST';

// --- SISTEM ISOLASI DATABASE AKUN ---
function getScopedKey(key) {
    const uid = (APP_MODE === 'CLOUD' && currentUser && currentUser.id !== 'offline_user') ? currentUser.id : 'guest';
    return LS_PREFIX + key + '_' + uid;
}
function loadScopedData() {
    sppData = safeParse(localStorage.getItem(getScopedKey('spp')), []);
    wishlists = safeParse(localStorage.getItem(getScopedKey('wish')), []);
    driveLinks = safeParse(localStorage.getItem(getScopedKey('drive')), []);
    attendanceData = safeParse(localStorage.getItem(getScopedKey('att')), { lastReset: new Date().toISOString(), records: {} });
    sppData.forEach(s => { s.months = s.months || []; s.att = s.att || {}; });
}
function saveScopedData() {
    localStorage.setItem(getScopedKey('spp'), JSON.stringify(sppData));
    localStorage.setItem(getScopedKey('wish'), JSON.stringify(wishlists));
    localStorage.setItem(getScopedKey('drive'), JSON.stringify(driveLinks));
    localStorage.setItem(getScopedKey('att'), JSON.stringify(attendanceData));
}
function migrateToScopedKeys() {
    if (!getLS('migrated_to_scoped_v45')) {
        localStorage.setItem(LS_PREFIX + 'spp_guest', localStorage.getItem(LS_PREFIX + 'spp_data_v47') || '[]');
        localStorage.setItem(LS_PREFIX + 'wish_guest', localStorage.getItem(LS_PREFIX + 'wishlists') || '[]');
        localStorage.setItem(LS_PREFIX + 'drive_guest', localStorage.getItem(LS_PREFIX + 'drivelinks') || '[]');
        localStorage.setItem(LS_PREFIX + 'att_guest', localStorage.getItem(LS_PREFIX + 'attendance_data_v47') || '{"lastReset":"","records":{}}');
        setLS('migrated_to_scoped_v45', 'true');
    }
}
// ------------------------------------
let activeWallet = 'utama';
let currentTimeFilter = 365;
let rawAmount = 0, editRawAmount = 0;
let pieChart, barChart, lineChart;
let realTimeSubscription = null;
let aiMessages = [], aiCurrentMsgIdx = 0, aiCarouselInterval = null;
let generatedOTP = "", otpExpiryTime = 0;
let isPublicMode = false;

const defaultProfile = {
    name: 'Pengurus Baru', pin: '', photo: DEFAULT_PHOTO,
    joinDate: new Date().toISOString(), birthDate: '', gender: 'Rahasia', googleLinked: false, googleEmail: ''
};
let profile = { ...defaultProfile, ...safeParse(getLS('profile_secure_v47'), {}) };
if (!profile.photo) profile.photo = DEFAULT_PHOTO;
if (!profile.name || !String(profile.name).trim()) profile.name = 'Pengurus Baru';
setLS('profile_secure_v47', JSON.stringify(profile));

const categories = {
    masuk: ['Infak Santri', 'Infak Jumat', 'Donasi Masyarakat', 'Wakaf', 'Bantuan Pemerintah', 'Bantuan Masjid', 'Hibah', 'Donatur Tetap', 'Lainnya'],
    keluar: ['Honor Guru', 'ATK', 'Al-Qur\'an', 'Buku Iqra\'', 'Snack Kegiatan', 'Listrik', 'Air', 'Kebersihan', 'Perbaikan Bangunan', 'Kegiatan Santri', 'Transportasi', 'Lainnya']
};
const monthsArr = ["Januari", "Februari", "Maret", "April", "Mei", "Juni", "Juli", "Agustus", "September", "Oktober", "November", "Desember"];
const dayNames = ["Minggu", "Senin", "Selasa", "Rabu", "Kamis", "Jumat", "Sabtu"];
const walletNames = { utama: 'Kas Utama', wakaf: 'Wakaf', operasional: 'Operasional', darurat: 'Dana Darurat' };

const svgs = {
    makan: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg>`,
    uang: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="2" y="6" width="20" height="12" rx="2"/><circle cx="12" cy="12" r="2"/><path d="M6 12h.01M18 12h.01"/></svg>`,
    book: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/></svg>`,
    user: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path><circle cx="9" cy="7" r="4"></circle><path d="M23 21v-2a4 4 0 0 0-3-3.87"></path><path d="M16 3.13a4 4 0 0 1 0 7.75"></path></svg>`,
    plus_bold: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>`,
    minus_bold: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><line x1="5" y1="12" x2="19" y2="12"></line></svg>`,
    link: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"></path><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"></path></svg>`,
    shield: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>`,
    trash: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M3 6h18"></path><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"></path><line x1="10" y1="11" x2="10" y2="17"></line><line x1="14" y1="11" x2="14" y2="17"></line></svg>`,
    edit: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg>`
};

// ==========================================
// UTILITAS
// ==========================================
function $(id) { return document.getElementById(id); }
function currentSearch() { const s = $('searchTxInput'); return s ? s.value.toLowerCase() : ''; }
function escapeHtml(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }
function formatRp(num) { return new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', minimumFractionDigits: 0 }).format(num || 0); }
function formatRpPendek(num) { return formatRp(num); }
function pad2(n) { return String(n).padStart(2, '0'); }
function formatDetailDate(iso) { if (!iso) return '-'; const d = new Date(iso); if (isNaN(d)) return '-'; return `${pad2(d.getDate())}/${pad2(d.getMonth() + 1)}/${d.getFullYear()} - ${pad2(d.getHours())}:${pad2(d.getMinutes())}`; }
function formatDateOnly(iso) { return formatDetailDate(iso).split(' - ')[0]; }
function localDateKey(d) { d = d || new Date(); return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`; }
function properTitleCase(str) { if (!str) return ""; return str.toLowerCase().replace(/(^|\s)\S/g, c => c.toUpperCase()); }

function getDynamicColor(categoryStr, type) {
    if (type === 'keluar') return '#ef4444';
    const inColors = { 'Wakaf': '#a855f7', 'Infak Santri': '#22c55e', 'Donasi Masyarakat': '#3b82f6', 'Bantuan Pemerintah': '#f59e0b', 'Hibah': '#22c55e' };
    if (inColors[categoryStr]) return inColors[categoryStr];
    let hash = 0; for (let i = 0; i < categoryStr.length; i++) hash = categoryStr.charCodeAt(i) + ((hash << 5) - hash);
    return `hsl(${Math.abs(hash) % 360}, 70%, 50%)`;
}

async function hashPIN(pin) {
    if (!pin) return '';
    try {
        if (window.crypto && window.crypto.subtle && window.isSecureContext) {
            const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(pin));
            return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
        } else if (typeof CryptoJS !== 'undefined') { return CryptoJS.SHA256(pin).toString(CryptoJS.enc.Hex); }
        return btoa(pin);
    } catch (e) { return btoa(pin); }
}

// ==========================================
// NOTIFIKASI GAYA APPLE (blur transparan, besar, tampil lama)
// Durasi menyesuaikan panjang teks agar semua terbaca.
// ==========================================
function showToast(msg, type = 'success') {
    const box = $('toastBox'); if (!box) return;
    const icons = { success: '✓', error: '!', syncing: '↻', support: '♥', info: 'i' };
    const plain = String(msg).replace(/<[^>]*>/g, '');
    const duration = Math.min(11000, Math.max(5500, 3000 + plain.length * 75));
    const t = document.createElement('div');
    t.className = `toast ${type}`;
    t.innerHTML = `<span class="toast-ico">${icons[type] || icons.info}</span><span class="toast-msg">${msg}</span>`;
    t.addEventListener('click', () => dismiss());
    while (box.children.length >= 3) box.firstChild.remove();
    box.appendChild(t);
    setTimeout(() => t.classList.add('show'), 20);
    let timer = setTimeout(dismiss, duration);
    function dismiss() { clearTimeout(timer); t.classList.remove('show'); setTimeout(() => t.remove(), 500); }
}

// ==========================================
// MODAL ENGINE + KUNCI SCROLL (posisi halaman TIDAK loncat ke atas)
// ==========================================
let modalStack = [];
let scrollLockY = 0;

function lockScroll() {
    if (document.body.classList.contains('modal-open')) return;
    scrollLockY = window.pageYOffset || document.documentElement.scrollTop || 0;
    document.body.style.top = `-${scrollLockY}px`;
    document.body.classList.add('modal-open');
}
function unlockScroll() {
    if (!document.body.classList.contains('modal-open')) return;
    document.body.classList.remove('modal-open');
    document.body.style.top = '';
    window.scrollTo({ top: scrollLockY, left: 0, behavior: 'instant' });
}

function openModal(id) {
    const el = $(id); if (!el) return;
    lockScroll();
    el.style.zIndex = 10000 + (modalStack.length * 20);
    el.scrollTop = 0;
    el.classList.add('active');
    if (!modalStack.includes(id)) modalStack.push(id);
}

function closeModal(id) {
    document.querySelectorAll('.custom-options.open').forEach(e => e.classList.remove('open'));
    if (!id) return;
    const el = $(id);
    if (el) el.classList.remove('active');
    modalStack = modalStack.filter(m => m !== id);
    if (modalStack.length === 0) unlockScroll();
}

function openCustomConfirm(title, desc, action) {
    $('confirmTitle').innerText = title;
    $('confirmDesc').innerHTML = desc;
    window.confirmActionStep1 = action;
    openModal('confirmModal');
}
$('btnConfirmYes').addEventListener('click', () => { closeModal('confirmModal'); setTimeout(() => openModal('confirmModal2'), 350); });
$('btnConfirmYes2').addEventListener('click', () => { const fn = window.confirmActionStep1; closeModal('confirmModal2'); if (fn) fn(); });

// ==========================================
// DATABASE LOKAL (AES)
// ==========================================
function getDBKey() { return APP_MODE === 'CLOUD' ? LS_PREFIX + 'cloud_db' : LS_PREFIX + 'guest_db'; }

function saveLocalDB(dataToSave) {
    const dbKey = getDBKey();
    try {
        if (typeof CryptoJS !== 'undefined') localStorage.setItem(dbKey, CryptoJS.AES.encrypt(JSON.stringify(dataToSave), SECRET_KEY).toString());
        else localStorage.setItem(dbKey + '_fallback', JSON.stringify(dataToSave));
    } catch (e) {}
}
function loadLocalDB() {
    const dbKey = getDBKey(); let data = [];
    try {
        const c = localStorage.getItem(dbKey);
        if (c && typeof CryptoJS !== 'undefined') data = JSON.parse(CryptoJS.AES.decrypt(c, SECRET_KEY).toString(CryptoJS.enc.Utf8));
        else { const f = localStorage.getItem(dbKey + '_fallback'); if (f) data = JSON.parse(f); }
    } catch (e) {}
    return Array.isArray(data) ? data : [];
}

// ==========================================
// JADWAL SHOLAT - GPS LIVE
// Otomatis mencari lokasi begitu GPS/izin aktif (tanpa keluar aplikasi & tanpa tombol).
// Jadwal terakhir selalu tampil dari cache, tidak pernah hilang.
// ==========================================
let gpsState = 'searching', prayerBusy = false, gpsRetryTimer = null;

function setGpsState(s) {
    gpsState = s;
    const dot = $('gpsDot'); if (dot) dot.className = 'gps-dot ' + s;
    const txt = $('prayerLocationText');
    if (txt && !loadPrayerCache()) txt.innerText = s === 'off' ? 'GPS mati / izin belum diberikan' : 'Melacak lokasi...';
}
function loadPrayerCache() { return safeParse(getLS('prayer_cache'), null); }

function toMinutes(t) { const p = String(t).split(' ')[0].split(':'); return (parseInt(p[0], 10) || 0) * 60 + (parseInt(p[1], 10) || 0); }
function fromMinutes(m) { m = ((Math.round(m) % 1440) + 1440) % 1440; return `${pad2(Math.floor(m / 60))}:${pad2(m % 60)}`; }
function distKm(a, b, c, d) { const R = 6371, r = Math.PI / 180, dl = (c - a) * r, dn = (d - b) * r; const x = Math.sin(dl / 2) ** 2 + Math.cos(a * r) * Math.cos(c * r) * Math.sin(dn / 2) ** 2; return 2 * R * Math.asin(Math.sqrt(x)); }

async function fetchPrayerByGPS(force) {
    if (prayerBusy || !navigator.geolocation) return;
    const cached = loadPrayerCache();
    if (!force && cached && cached.date === localDateKey() && gpsState === 'on') return;
    prayerBusy = true;
    navigator.geolocation.getCurrentPosition(async (pos) => {
        const { latitude: lat, longitude: lon } = pos.coords;
        try {
            const moved = !cached || !cached.lat || distKm(cached.lat, cached.lon, lat, lon) > 5;
            if (!force && cached && cached.date === localDateKey() && !moved) { setGpsState('on'); renderPrayerUI(cached); return; }
            const res = await fetch(`https://api.aladhan.com/v1/timings?latitude=${lat}&longitude=${lon}&method=20`);
            const json = await res.json();
            const pt = json && json.data && json.data.timings; if (!pt) throw new Error('kosong');
            const maghrib = toMinutes(pt.Maghrib), fajr = toMinutes(pt.Fajr) + 1440;
            const tahajud = maghrib + ((fajr - maghrib) * 2 / 3);
            const zone = (json.data.meta && json.data.meta.timezone) || '';
            const city = zone.includes('/') ? zone.split('/').pop().replace(/_/g, ' ') : 'Lokasi GPS';
            const data = {
                date: localDateKey(), lat, lon, location: `GPS · ${city}`,
                timings: [
                    { n: 'Tahajud', t: fromMinutes(tahajud) }, { n: 'Subuh', t: pt.Fajr.split(' ')[0] },
                    { n: 'Terbit', t: pt.Sunrise.split(' ')[0] }, { n: 'Dzuhur', t: pt.Dhuhr.split(' ')[0] },
                    { n: 'Ashar', t: pt.Asr.split(' ')[0] }, { n: 'Maghrib', t: pt.Maghrib.split(' ')[0] }, { n: 'Isya', t: pt.Isha.split(' ')[0] }
                ]
            };
            setLS('prayer_cache', JSON.stringify(data));
            setGpsState('on'); renderPrayerUI(data);
        } catch (e) { if (cached) renderPrayerUI(cached); else if ($('prayerLocationText')) $('prayerLocationText').innerText = 'Gagal memuat jadwal (offline)'; setGpsState('searching'); }
        finally { prayerBusy = false; }
    }, (err) => {
        prayerBusy = false;
        setGpsState(err && err.code === 1 ? 'off' : 'searching');
        const c = loadPrayerCache(); if (c) renderPrayerUI(c);
    }, { enableHighAccuracy: false, timeout: 15000, maximumAge: 600000 });
}

function renderPrayerUI(data) {
    if (!data || !data.timings) return;
    const now = new Date(), nowMin = now.getHours() * 60 + now.getMinutes();
    let nextIdx = data.timings.findIndex(p => p.n !== 'Terbit' && toMinutes(p.t) > nowMin);
    if (nextIdx === -1) nextIdx = data.timings.findIndex(p => p.n === 'Subuh');
    
    const html = data.timings.map((p, i) => `<div class="prayer-item ${i === nextIdx ? 'next' : ''}"><span class="p-name">${p.n}</span><span class="p-time">${p.t}</span></div>`).join('');
    
    // Inject ke Admin
    const pText = $('prayerLocationText'), pDate = $('prayerDateText'), pGrid =$('prayerTimesGrid');
    if (pText) pText.innerText = data.location || 'Lokasi Anda';
    if (pDate) pDate.innerText = `${dayNames[now.getDay()].substring(0, 3)}, ${now.getDate()} ${monthsArr[now.getMonth()].substring(0, 3)} ${now.getFullYear()}`;
    if (pGrid) {
        pGrid.innerHTML = html;
        if (!pGrid.dataset.scrolled) { const nEl = pGrid.querySelector('.next'); if (nEl) { pGrid.dataset.scrolled = '1'; pGrid.scrollLeft = Math.max(0, nEl.offsetLeft - 20); } }
    }
    
    // Inject ke Publik
    const pubLoc = $('pubPrayerLoc'), pubGrid =$('pubPrayerGrid');
    if (pubLoc) pubLoc.innerText = data.location || '';
    if (pubGrid) {
        pubGrid.innerHTML = html;
        if (!pubGrid.dataset.scrolled) { const nElPub = pubGrid.querySelector('.next'); if (nElPub) { pubGrid.dataset.scrolled = '1'; pubGrid.scrollLeft = Math.max(0, nElPub.offsetLeft - 20); } }
    }
}

async function initPrayerTimes() {
    const cached = loadPrayerCache(); if (cached) renderPrayerUI(cached);
    if (!navigator.geolocation) { setGpsState('off'); return; }
    try {
        if (navigator.permissions && navigator.permissions.query) {
            const st = await navigator.permissions.query({ name: 'geolocation' });
            if (st.state === 'denied') setGpsState('off');
            st.onchange = () => { if (st.state === 'granted') fetchPrayerByGPS(true); else if (st.state === 'denied') setGpsState('off'); };
        }
    } catch (e) {}
    fetchPrayerByGPS(false);
    document.addEventListener('visibilitychange', () => { if (!document.hidden) { fetchPrayerByGPS(false); renderPrayerUI(loadPrayerCache()); } });
    window.addEventListener('focus', () => fetchPrayerByGPS(false));
    if (gpsRetryTimer) clearInterval(gpsRetryTimer);
    gpsRetryTimer = setInterval(() => { if (gpsState !== 'on') fetchPrayerByGPS(true); else renderPrayerUI(loadPrayerCache()); }, 30000);
}

// ==========================================
// VERSI, SERVICE WORKER & REFRESH APLIKASI
// Tema & jadwal sholat tersimpan di localStorage -> tidak berubah saat refresh.
// ==========================================
function registerServiceWorker() {
    if ('serviceWorker' in navigator && location.protocol.startsWith('http')) navigator.serviceWorker.register('sw.js').catch(() => {});
}
async function clearAppCaches() {
    try { if (window.caches) { const keys = await caches.keys(); await Promise.all(keys.map(k => caches.delete(k))); } } catch (e) {}
    try { if ('serviceWorker' in navigator) { const regs = await navigator.serviceWorker.getRegistrations(); await Promise.all(regs.map(r => r.update().catch(() => {}))); } } catch (e) {}
}
async function refreshApp() {
    showToast('Menyegarkan aplikasi... tema & jadwal sholat tetap aman.', 'syncing');
    const btn = $('btnRefreshApp'); if (btn) btn.disabled = true;
    await clearAppCaches();
    setTimeout(() => window.location.reload(), 700);
}
function checkAppVersion() {
    if (getLS('app_version') === APP_VERSION) return;
    setLS('app_version', APP_VERSION);
    if (navigator.onLine) {
        const u = $('updateScreen'); if (u) u.style.display = 'flex';
        clearAppCaches().then(() => setTimeout(() => window.location.reload(), 1500));
    }
}

// ==========================================
// SUPABASE SYNC
// ==========================================
function isCloudReady() { return APP_MODE === 'CLOUD' && navigator.onLine && sbClient && currentUser && currentUser.id !== 'offline_user'; }

function updateNetworkStatus(text, cls) { const n = $('networkStatus'); if (n) { n.innerText = text; n.className = `status-sync ${cls}`; } }

async function initSupabaseBackground() {
    if (typeof window.supabase === 'undefined') return;
    if (!sbClient) sbClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

    if (APP_MODE === 'CLOUD' && navigator.onLine) {
        try {
            const { data: { session }, error } = await sbClient.auth.getSession();
            if (error) throw error;
            if (session && session.user) {
                currentUser = session.user;
                updateNetworkStatus("Online Mode (Cloud)", "sync-online");
                
                loadScopedData(); /* <--- INJEKSI MEMORI AKUN */
                
                loadCloudProfile(); fetchUserTransactions(); setupRealtime();
                
                renderWishlist(); renderDriveLinks(); renderAdminStudentTable(); /* <--- RENDER ULANG UI */
                
                if (pendingSync.length > 0) processPendingSync();
            } else { forceLogoutToGuest(); }
        } catch (err) { updateNetworkStatus("Server Lambat", "sync-offline"); }
    }

    if (!window.supabaseListenerAdded) {
        window.supabaseListenerAdded = true;
        sbClient.auth.onAuthStateChange(async (event, session) => {
            if (event === 'SIGNED_OUT') { forceLogoutToGuest(); }
            else if (event === 'SIGNED_IN' && session) {
                currentUser = session.user; APP_MODE = 'CLOUD'; setLS('app_mode', 'CLOUD');
                updateNetworkStatus("Online Mode (Cloud)", "sync-online");
                await loadCloudProfile(true);
                db = loadLocalDB(); loadScopedData(); 
                initAppHeader(); renderShortcuts(); fetchUserTransactions(); setupRealtime();
                renderWishlist(); renderDriveLinks(); renderAdminStudentTable(); 
                closeModal('googleAuthModal');
                if (navigator.onLine && pendingSync.length > 0) processPendingSync();
            }
        });
    }
}

// Profil cloud digabung dengan lokal; nama/foto buatan pengurus TIDAK ditimpa data Google.
async function loadCloudProfile(isLogin) {
    if (!currentUser || currentUser.id === 'offline_user' || !sbClient) return;
    try {
        const { data: row } = await sbClient.from('profiles').select('data').eq('id', currentUser.id).maybeSingle();
        if (row && row.data) { profile = { ...profile, ...row.data }; }
        else {
            const meta = currentUser.user_metadata || {};
            if (profile.name === 'Pengurus Baru' && meta.full_name) profile.name = properTitleCase(meta.full_name);
            if ((!profile.photo || profile.photo === DEFAULT_PHOTO) && meta.avatar_url) profile.photo = meta.avatar_url;
            await sbClient.from('profiles').upsert({ id: currentUser.id, data: profile });
        }
    } catch (e) {}
    profile.googleLinked = true; profile.googleEmail = currentUser.email || profile.googleEmail;
    if (!profile.photo) profile.photo = DEFAULT_PHOTO;
    setLS('profile_secure_v47', JSON.stringify(profile));
    initAppHeader();
}

function forceLogoutToGuest() {
    currentUser = null; APP_MODE = 'GUEST'; setLS('app_mode', 'GUEST');
    profile = { ...defaultProfile }; setLS('profile_secure_v47', JSON.stringify(profile));
    removeLS('cloud_db'); removeLS('cloud_db_fallback'); db = loadLocalDB();
    initAppHeader(); renderShortcuts(); updateUI('');
    showToast("Berhasil logout. Anda kembali ke mode Guest.", "success"); closeModal('profileViewModal');
    updateNetworkStatus(navigator.onLine ? "Online Mode (Guest)" : "Offline Mode (Guest)", navigator.onLine ? "sync-online" : "sync-offline");
}

async function fetchUserTransactions() {
    if (!isCloudReady()) return;
    try {
        const { data, error } = await sbClient.from('transactions').select('*').eq('user_id', currentUser.id).order('date', { ascending: true });
        if (error) throw error;
        db = data || []; saveLocalDB(db); updateUI(currentSearch());
        if (typeof publishPublicSnapshot === 'function') publishPublicSnapshot();
    } catch (e) {}
}

function setupRealtime() {
    if (!isCloudReady()) return;
    if (realTimeSubscription) sbClient.removeChannel(realTimeSubscription);
    realTimeSubscription = sbClient.channel('custom-tpa-channel')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'transactions', filter: `user_id=eq.${currentUser.id}` }, () => fetchUserTransactions())
        .subscribe();
}

async function processPendingSync() {
    if (!isCloudReady() || pendingSync.length === 0) return;
    try {
        showToast("Menyinkronkan antrean data offline ke Cloud...", "syncing");
        const payload = pendingSync.map(t => { const n = { ...t, user_id: currentUser.id }; if (String(n.id).length > 10) delete n.id; return n; });
        const { error } = await sbClient.from('transactions').insert(payload);
        if (error) throw error;
        pendingSync = []; setLS('pending_sync', '[]');
        showToast("Data offline berhasil tersimpan ke Cloud!", "success"); fetchUserTransactions();
    } catch (e) {}
}

window.addEventListener('online', () => {
    if (isPublicMode) return;
    updateNetworkStatus(APP_MODE === 'CLOUD' ? "Menyambungkan..." : "Online (Guest)", APP_MODE === 'CLOUD' ? "sync-pending" : "sync-online");
    if (APP_MODE === 'CLOUD') {
        if (currentUser && currentUser.id === 'offline_user') initSupabaseBackground();
        else { pendingSync.length > 0 ? processPendingSync() : fetchUserTransactions(); updateNetworkStatus("Online Mode (Cloud)", "sync-online"); }
    }
    fetchPrayerByGPS(false);
});
window.addEventListener('offline', () => {
    if (isPublicMode) return;
    updateNetworkStatus(pendingSync.length > 0 ? "Offline (Menunggu Sync)" : "Offline Mode", pendingSync.length > 0 ? "sync-pending" : "sync-offline");
    showToast("Koneksi terputus. Aplikasi berjalan dalam mode offline.", "error");
});

// ==========================================
// TEMA (ripple dari titik klik) - tema tersimpan permanen
// ==========================================
const iconSun = `<circle cx="12" cy="12" r="5"/><path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42"/>`;
const iconMoon = `<path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>`;

function applyTheme(theme) {
    document.documentElement.setAttribute('data-theme', theme);
    const m = $('metaThemeColor'); if (m) m.setAttribute('content', theme === 'light' ? '#059669' : '#05140d');
    updateThemeIcon(theme);
}
function updateThemeIcon(theme) {
    ['theme-icon', 'pub-theme-icon'].forEach(id => { const el = $(id); if (el) el.innerHTML = theme === 'light' ? iconMoon : iconSun; });
}
function toggleTheme(e) {
    const layer = $('themeTransitionLayer');
    const src = e && (e.currentTarget || e.target);
    if (src && src.getBoundingClientRect) {
        const r = src.getBoundingClientRect();
        layer.style.setProperty('--ripple-x', `${r.left + r.width / 2}px`);
        layer.style.setProperty('--ripple-y', `${r.top + r.height / 2}px`);
    } else { layer.style.setProperty('--ripple-x', '50%'); layer.style.setProperty('--ripple-y', '50%'); }
    document.body.classList.remove('theme-fade-out');
    document.body.classList.add('theme-animating');
    setTimeout(() => {
        const next = (document.documentElement.getAttribute('data-theme') || 'dark') === 'dark' ? 'light' : 'dark';
        setLS('app_theme', next); applyTheme(next);
        if (isPublicMode) { if (typeof renderPublicAll === 'function') renderPublicAll(); } else updateUI(currentSearch());
        document.body.classList.add('theme-fade-out');
    }, 450);
    setTimeout(() => document.body.classList.remove('theme-animating', 'theme-fade-out'), 850);
}
applyTheme(getLS('app_theme') || 'dark');

// ==========================================
// HEADER & PROFIL (perbaikan: nama & foto kini terisi di popup)
// ==========================================
function formatSmartName(name) {
    if (!name) return name;
    if (window.innerWidth > 400 || name.length <= 12) return name;
    const w = name.trim().split(/\s+/);
    if (w.length > 1) { const last = w.pop(); return w.join(' ') + ' ' + last.charAt(0).toUpperCase() + '.'; }
    return name;
}
function safePhoto(src) { return src && String(src).length > 10 ? src : DEFAULT_PHOTO; }

function bindPhotoFallback(img) { if (img && !img.dataset.fb) { img.dataset.fb = '1'; img.addEventListener('error', () => { if (img.src !== DEFAULT_PHOTO) img.src = DEFAULT_PHOTO; }); } }

function initAppHeader() {
    const name = profile.name || 'Pengurus Baru';
    const set = (id, fn) => { const el = $(id); if (el) fn(el); };
    set('headName', el => el.innerText = formatSmartName(name));
    set('headGender', el => el.innerText = (profile.gender && profile.gender !== 'Rahasia') ? profile.gender : 'PENGURUS TPA');
    set('headProfileImg', el => { bindPhotoFallback(el); el.src = safePhoto(profile.photo); });
    fillProfileView();
}

function fillProfileView() {
    const set = (id, fn) => { const el = $(id); if (el) fn(el); };
    const cloud = APP_MODE === 'CLOUD';
    set('viewProfileName', el => el.innerText = profile.name || 'Pengurus Baru');
    set('viewProfileImg', el => { bindPhotoFallback(el); el.src = safePhoto(profile.photo); });
    set('viewGender', el => el.innerText = profile.gender || '-');
    set('viewBirth', el => el.innerText = profile.birthDate ? formatDateOnly(profile.birthDate) : '-');
    set('viewJoinDate', el => el.innerText = 'Bergabung: ' + formatDateOnly(profile.joinDate));
    set('viewGoogleStatus', el => { el.innerText = cloud ? (profile.googleEmail || (currentUser && currentUser.email) || 'Terhubung') : 'Tidak Terhubung'; el.style.color = cloud ? 'var(--hijau-terang)' : ''; });
    set('textGoogleLink', el => el.innerText = cloud ? 'Logout' : 'Hubungkan');
}

function openGoogleAuthModal() { const m = $('googleAuthStatusMsg'); if (m) m.innerText = ''; openModal('googleAuthModal'); }

function openProfileView() {
    fillProfileView();
    $('btnGoogleLink').onclick = () => {
        if (APP_MODE === 'CLOUD') openCustomConfirm("Logout Cloud", "Keluar ke mode Guest? Data di Cloud tetap aman.", async () => { if (sbClient && navigator.onLine) await sbClient.auth.signOut(); else forceLogoutToGuest(); });
        else openGoogleAuthModal();
    };
    openModal('profileViewModal');
}

function requestProfileEdit() {
    closeModal('profileViewModal');
    if (profile.pin && profile.pin !== '') {
        $('actionPinType').value = 'edit_profile'; $('actionPinPayload').value = '';
        $('inputActionPin').value = '';
        setTimeout(() => openModal('actionPinModal'), 250);
    } else { setTimeout(openProfileEdit, 250); }
}

function selectGender(val) { $('editGender').value = val; $('dispGenderVal').innerText = val; closeModal(''); }

function openProfileEdit() {
    $('editProfileImg').src = safePhoto(profile.photo);
    $('editName').value = profile.name !== 'Pengurus Baru' ? profile.name : '';
    selectGender(profile.gender || 'Rahasia');
    $('edit-birth-hidden').value = profile.birthDate || '';
    $('disp-edit-birth').innerText = profile.birthDate ? formatDateOnly(profile.birthDate) : 'Pilih tanggal lahir';
    $('editPin').value = '';
    openModal('profileEditModal');
}

$('profileUploader').addEventListener('change', function (e) {
    const f = e.target.files[0]; if (!f) return;
    showToast("Memproses foto profil...", "syncing");
    const reader = new FileReader();
    reader.onload = evt => {
        const img = new Image();
        img.onload = () => {
            const c = document.createElement('canvas'); const MAX = 300; let w = img.width, h = img.height;
            if (w > h) { if (w > MAX) { h *= MAX / w; w = MAX; } } else { if (h > MAX) { w *= MAX / h; h = MAX; } }
            c.width = w; c.height = h; c.getContext('2d').drawImage(img, 0, 0, w, h);
            profile.photo = c.toDataURL('image/jpeg', 0.7);
            $('editProfileImg').src = profile.photo;
        };
        img.onerror = () => showToast("Foto tidak dapat dibaca. Coba gambar lain.", "error");
        img.src = evt.target.result;
    };
    reader.readAsDataURL(f); e.target.value = '';
});

async function saveProfileData() {
    const name = properTitleCase($('editName').value.trim());
    if (!name) { showToast("Nama tidak boleh kosong.", "error"); return; }
    const rawPin = $('editPin').value.trim();
    if (rawPin && (rawPin.length < 4 || !/^\d+$/.test(rawPin))) { showToast("PIN harus angka minimal 4 digit.", "error"); return; }
    profile.name = name;
    profile.gender = $('editGender').value || 'Rahasia';
    profile.birthDate = $('edit-birth-hidden').value || '';
    if (rawPin) profile.pin = await hashPIN(rawPin);
    setLS('profile_secure_v47', JSON.stringify(profile));
    initAppHeader(); closeModal('profileEditModal');
    showToast("Profil berhasil disimpan. Nama & foto sudah diperbarui.", "success");
    if (isCloudReady()) { try { await sbClient.from('profiles').upsert({ id: currentUser.id, data: profile }); } catch (e) {} }
    setTimeout(openProfileView, 300);
}

/* ===== AKHIR BAGIAN 1/3 - lanjutkan BAGIAN 2/3 di bawah baris ini ===== */

/* =========================================================
   TPA FINANCE v4.4 - MAIN.JS  (BAGIAN 2 dari 3)
   Isi: Navigasi UI, Shortcut, Health & AI, Tabel/Chart, Struk,
        Kalender custom, Transaksi CRUD, PIN, Transfer, Target Dana,
        Drive, Export CSV, Pencarian.
========================================================= */

function afterDataChange() {
    saveLocalDB(db); updateUI(currentSearch());
    if (typeof publishPublicSnapshot === 'function') publishPublicSnapshot();
}
function newId() { return Date.now() * 1000 + Math.floor(Math.random() * 1000); }
function walletBalance(w) { return db.reduce((s, t) => t.wallet === w ? s + (t.type === 'masuk' ? t.amount : -t.amount) : s, 0); }
function bindMoneyInput(id, cb) {
    const el = $(id); if (!el) return;
    el.addEventListener('input', function () {
        const v = this.value.replace(/[^0-9]/g, ''); const n = v ? parseInt(v, 10) : 0;
        this.value = n ? n.toLocaleString('id-ID') : ''; if (cb) cb(n);
    });
}

// ==========================================
// NAVIGASI UI
// ==========================================
function switchWallet(type) {
    activeWallet = type;
    $('walletSwitchContainer').setAttribute('data-active', type);
    document.querySelectorAll('.btn-tab').forEach(b => b.classList.remove('active'));
    $('tab-' + type).classList.add('active');
    renderShortcuts(); updateUI(currentSearch());
}
function toggleCustomSelect(id) {
    const box = $(id); const open = box.classList.contains('open');
    document.querySelectorAll('.custom-options.open').forEach(el => el.classList.remove('open'));
    if (!open) box.classList.add('open');
}
function applyTimeFilter(days, label) { currentTimeFilter = days; $('dispTimeFilter').innerText = label; closeModal(''); updateUI(currentSearch()); }
function selectCategory(val) { $('tx-category').value = val; $('dispTxCat').innerText = val; closeModal(''); }
function selectTitle(val) { $('tx-title-val').value = val; $('dispTxTitle').innerText = val; closeModal(''); }
function selectEditTitle(val) { $('edit-tx-title-val').value = val; $('dispEditTxTitle').innerText = val; closeModal(''); }
function selectEditCategory(val) { $('edit-tx-category').value = val; $('dispEditTxCat').innerText = val; closeModal(''); }
function toggleSection(sec, icn) { $(sec).classList.toggle('hidden'); $(icn).classList.toggle('rotated'); }
function toggleExpandStat(el, id) {
    const items = $(id).children;
    if (el.classList.contains('expanded')) for (const i of items) i.className = 'expand-item glass-card';
    else for (const i of items) i.className = (i === el) ? 'expand-item expanded glass-card' : 'expand-item collapsed';
}
function resizeCharts() { [100, 550].forEach(ms => setTimeout(() => { [pieChart, barChart, lineChart].forEach(c => c && c.resize()); }, ms)); }
function expandChart(el, id) {
    if (el.classList.contains('expanded')) return;
    for (const i of $(id).children) i.className = (i === el) ? 'expand-item expanded glass-card' : 'expand-item collapsed';
    resizeCharts();
}
function closeChart(e, btn) { e.stopPropagation(); for (const i of btn.closest('.expand-container').children) i.className = 'expand-item glass-card'; resizeCharts(); }

// ==========================================
// SHORTCUT AKSI CEPAT
// ==========================================
function renderShortcuts() {
    const c = $('quickActionsContainer'); if (!c) return;
    c.className = 'quick-actions-wrap grid-mode grid-split-4';
    const map = {
        utama: [['hijau', 'uang', 'masuk', 'Infak Santri', 'Penerimaan Infak SPP Santri', 'Infak Santri'], ['biru', 'user', 'masuk', 'Donasi Masyarakat', 'Donasi Umum', 'Donasi Umum'], ['merah', 'makan', 'keluar', 'Honor Guru', 'Pembayaran Honor Guru', 'Honor Guru'], ['kuning', 'plus_bold', 'masuk', 'Bantuan Pemerintah', 'Dana Bantuan', 'Pemasukan Lain']],
        wakaf: [['hijau', 'uang', 'masuk', 'Wakaf', 'Penerimaan Dana Wakaf', 'Terima Wakaf'], ['merah', 'plus_bold', 'keluar', 'Perbaikan Bangunan', 'Penggunaan Dana Wakaf', 'Gunakan Wakaf'], ['kuning', 'minus_bold', 'keluar', 'Kebersihan', 'Biaya Kebersihan Wakaf', 'Pemeliharaan'], ['biru', 'plus_bold', 'masuk', 'Lainnya', 'Penerimaan Wakaf Lainnya', 'Lainnya (+)']],
        operasional: [['merah', 'minus_bold', 'keluar', 'Listrik', 'Bayar Tagihan Listrik', 'Bayar Listrik'], ['biru', 'minus_bold', 'keluar', 'Air', 'Bayar Tagihan Air', 'Bayar Air'], ['kuning', 'book', 'keluar', 'ATK', 'Beli ATK & Kebutuhan', 'Beli ATK'], ['hijau', 'plus_bold', 'masuk', 'Hibah', 'Suntikan Dana Operasional', 'Tambah Dana']],
        darurat: [['hijau', 'shield', 'masuk', 'Dana Cadangan', 'Injeksi Dana Darurat', 'Simpan Dana'], ['merah', 'minus_bold', 'keluar', 'Kebutuhan Mendadak', 'Penggunaan Dana Darurat', 'Tarik Dana']]
    };
    c.innerHTML = map[activeWallet].map(([cl, ic, t, cat, d, lb]) => `<button class="btn-quick svg-${cl} glass-card" onclick="quickInput('${t}','${cat}','${d}')">${svgs[ic]}<span>${lb}</span></button>`).join('');
}

// ==========================================
// HEALTH ENGINE & AI INSIGHT
// ==========================================
function updateHealthEngine(fd) {
    let tIn = 0, tOut = 0; fd.forEach(t => t.type === 'masuk' ? tIn += t.amount : tOut += t.amount);
    const bal = tIn - tOut, badge = $('healthBadge'), text = $('healthText'); if (!badge || !text) return;
    let cls = 'health-sehat', lbl = 'SEHAT';
    if (!tIn && !tOut) { cls = 'health-netral'; lbl = 'NETRAL'; }
    else if (bal < 0) { cls = 'health-defisit'; lbl = 'DEFISIT'; }
    else if (bal <= 50000) { cls = 'health-kritis'; lbl = 'KRITIS'; }
    else if (tOut > tIn * 0.8) { cls = 'health-waspada'; lbl = 'WASPADA'; }
    badge.className = 'health-badge glass-card ' + cls; text.innerText = lbl;
    generateAIForecast(fd);
}
function generateAIForecast(data) {
    const box = $('aiInsightBox'), textEl = $('aiInsightText'); if (!box || !textEl) return;
    const paint = (c) => { box.style.borderLeftColor = `var(${c})`; box.querySelector('svg').style.color = `var(${c})`; };
    aiMessages = [];
    if (!data.length) {
        aiMessages.push(`Belum ada riwayat transaksi di dompet ${walletNames[activeWallet]}.`);
        if (APP_MODE === 'GUEST') aiMessages.push("Saran: hubungkan akun Google agar data TPA aman di Cloud.");
        paint('--text-muted'); startAICarousel(textEl); return;
    }
    const now = new Date();
    const cm = data.filter(t => { const d = new Date(t.date); return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear(); });
    const keluar = cm.filter(t => t.type === 'keluar');
    const mIn = cm.filter(t => t.type === 'masuk').reduce((s, t) => s + t.amount, 0), mOut = keluar.reduce((s, t) => s + t.amount, 0);
    let big = "Pengeluaran bulan ini masih terkendali.";
    if (keluar.length) { const ct = {}; keluar.forEach(t => ct[t.category] = (ct[t.category] || 0) + t.amount); const k = Object.keys(ct).reduce((a, b) => ct[a] > ct[b] ? a : b); big = `Pengeluaran terbesar bulan ini: ${properTitleCase(k)} (${formatRp(ct[k])}).`; }
    const w = walletNames[activeWallet];
    if (mOut > mIn && mIn > 0) { aiMessages.push(`⚠️ Pengeluaran ${w} bulan ini melampaui pemasukan.`, "Saran: tinjau anggaran atau ambil dari Dana Darurat."); paint('--merah-solid'); }
    else if (mOut > 0) { aiMessages.push(`Arus kas ${w} berjalan normal.`, "Pantau alokasi dana agar sejalan dengan program santri."); paint('--kuning'); }
    else if (mIn > 0) { aiMessages.push("Seluruh dana pemasukan bulan ini masih utuh.", "Tips: alokasikan ke Dana Darurat atau perbaikan fasilitas."); paint('--hijau-terang'); }
    else { aiMessages.push("Belum ada pergerakan kas bulan ini.", "Rutin catat donasi/infak yang masuk setiap hari."); paint('--biru'); }
    aiMessages.push(big);
    if (activeWallet === 'wakaf') aiMessages.push("Catatan: dana Wakaf tidak boleh dipakai untuk operasional harian.");
    startAICarousel(textEl);
}
function startAICarousel(el) {
    if (aiCarouselInterval) clearInterval(aiCarouselInterval);
    aiCurrentMsgIdx = 0; el.innerText = aiMessages[0] || ''; el.classList.remove('fade-out');
    if (aiMessages.length > 1) aiCarouselInterval = setInterval(() => {
        el.classList.add('fade-out');
        setTimeout(() => { aiCurrentMsgIdx = (aiCurrentMsgIdx + 1) % aiMessages.length; el.innerText = aiMessages[aiCurrentMsgIdx]; el.classList.remove('fade-out'); }, 400);
    }, 8000);
}

// ==========================================
// RENDER UTAMA (tabel & chart)
// ==========================================
function updateUI(searchTerm) {
    searchTerm = (searchTerm || '').toLowerCase();
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const fd = db.filter(tx => {
        if (tx.wallet !== activeWallet) return false;
        if (currentTimeFilter !== 365) {
            const d = new Date(tx.date); d.setHours(0, 0, 0, 0);
            const diff = Math.round((today - d) / 86400000);
            if (currentTimeFilter === 1 ? diff !== 0 : diff >= currentTimeFilter) return false;
        }
        if (searchTerm) return (tx.desc || '').toLowerCase().includes(searchTerm) || (tx.category || '').toLowerCase().includes(searchTerm) || (tx.pihak_terkait || '').toLowerCase().includes(searchTerm);
        return true;
    });
    updateHealthEngine(fd);
    let m = 0, k = 0; fd.forEach(t => t.type === 'masuk' ? m += t.amount : k += t.amount);
    [['disp-saldo', m - k], ['disp-masuk', m], ['disp-keluar', k]].forEach(([id, v]) => { const el = $(id); if (el) { el.setAttribute('data-short', formatRpPendek(v)); el.setAttribute('data-full', formatRp(v)); } });
    renderTable(fd, false); renderCharts(fd);
}

function renderTable(data, isPublic) {
    const t = $(isPublic ? 'public-table-body' : 'table-body'); if (!t) return;
    if (!data.length) { t.innerHTML = `<tr><td colspan="5" class="empty-cell">Data transaksi kosong.</td></tr>`; return; }
    t.innerHTML = [...data].sort((a, b) => new Date(b.date) - new Date(a.date)).map(tx => {
        const iM = tx.type === 'masuk', key = tx.id || tx.date, d = formatDetailDate(tx.date).split(' - ');
        const link = tx.link_bukti ? `<a href="${escapeHtml(tx.link_bukti)}" target="_blank" rel="noopener" class="tx-link" onclick="event.stopPropagation()">↗ Buka Dokumen Drive</a>` : '';
        const pihak = tx.pihak_terkait ? `<br><span class="tx-pihak">Pihak: <b class="text-neutral">${escapeHtml(tx.pihak_terkait)}</b></span>` : '';
        const chip = isPublic ? `<div class="wallet-chip w-${tx.wallet}">${walletNames[tx.wallet] || tx.wallet}</div>` : '';
        const aksi = isPublic ? `<td class="aksi-col"></td>` : `<td class="aksi-col"><div class="aksi-wrap"><button type="button" class="btn-icon-neutral" onclick="promptActionPinFromTable(event,'edit','${key}')">${svgs.edit}</button><button type="button" class="btn-icon-danger" onclick="promptActionPinFromTable(event,'delete','${key}')">${svgs.trash}</button></div></td>`;
        return `<tr class="clickable-row" onclick="openReceipt('${key}')"><td class="tx-time">${d[0]}<br>${d[1]}</td><td class="tx-cat"><div class="tx-cat-wrap"><div class="badge-cat">${escapeHtml(tx.category)}</div>${chip}</div></td><td class="tx-desc"><span class="text-neutral">${escapeHtml(tx.desc)}</span>${pihak}${link}</td>${aksi}<td class="amt-cell ${iM ? 'amt-in' : 'amt-out'}">${iM ? '+' : '-'}${formatRp(tx.amount)}</td></tr>`;
    }).join('');
}

function renderCharts(data) {
    if (typeof Chart === 'undefined' || !$('pieChart')) return;
    Chart.defaults.color = '#8ba898'; Chart.defaults.font.family = 'Inter';
    [pieChart, barChart, lineChart].forEach(c => c && c.destroy()); pieChart = barChart = lineChart = null;
    if (!data.length) return;
    const grid = 'rgba(139,168,152,0.1)', cA = {};
    data.forEach(t => { const k = t.category; if (cA[k]) cA[k].a += t.amount; else cA[k] = { a: t.amount, color: getDynamicColor(t.category, t.type) }; });
    const pL = Object.keys(cA);
    pieChart = new Chart($('pieChart'), { type: 'doughnut', data: { labels: pL, datasets: [{ data: pL.map(l => cA[l].a), backgroundColor: pL.map(l => cA[l].color), borderWidth: 0 }] }, options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } } } });
    const sorted = [...data].sort((a, b) => new Date(a.date) - new Date(b.date)), rT = sorted.slice(-15);
    barChart = new Chart($('barChart'), { type: 'bar', data: { labels: rT.map(t => (t.desc || '').substring(0, 8)), datasets: [{ data: rT.map(t => t.type === 'masuk' ? t.amount : -t.amount), backgroundColor: rT.map(t => getDynamicColor(t.category, t.type)), borderRadius: 4 }] }, options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: { x: { display: false }, y: { grid: { color: grid } } } } });
    let cI = 0, cO = 0; const hI = [], hO = [];
    sorted.forEach(t => { t.type === 'masuk' ? cI += t.amount : cO += t.amount; hI.push(cI); hO.push(cO); });
    lineChart = new Chart($('lineChart'), { type: 'line', data: { labels: hI.map((_, i) => `T${i + 1}`), datasets: [{ label: 'Pemasukan', data: hI, borderColor: '#34d399', backgroundColor: 'rgba(52,211,153,0.1)', fill: true, pointRadius: 2, tension: 0.4 }, { label: 'Pengeluaran', data: hO, borderColor: '#ef4444', backgroundColor: 'rgba(239,68,68,0.1)', fill: true, pointRadius: 2, tension: 0.4 }] }, options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: { x: { display: false }, y: { grid: { color: grid } } } } });
}

// Struk / rincian (dipakai admin & portal publik)
function openReceipt(txId) {
    const list = (isPublicMode && window.publicTx) ? window.publicTx : db;
    const tx = list.find(t => String(t.id) === String(txId) || String(t.date) === String(txId)); if (!tx) return;
    const row = (l, v, extra) => `<div class="receipt-row"><span class="receipt-label">${l}</span><span class="receipt-val text-neutral" ${extra || ''}>${v}</span></div>`;
    $('receiptContent').innerHTML = `
        <div class="receipt-head"><h3 class="text-neutral">BUKTI MUTASI KAS TPA</h3><span class="muted-xs">ID: TRX-${new Date(tx.date).getTime().toString().slice(-8)}</span></div>
        ${row('Waktu', formatDetailDate(tx.date))}${row('Dompet Kas', walletNames[tx.wallet] || tx.wallet)}${row('Kategori', escapeHtml(tx.category))}
        ${row('Sifat Mutasi', tx.type === 'masuk' ? 'Pemasukan' : 'Pengeluaran')}${row('Keterangan', escapeHtml(tx.desc))}
        ${tx.pihak_terkait ? row('Pihak Terkait', escapeHtml(tx.pihak_terkait)) : ''}
        ${tx.link_bukti ? `<div class="receipt-row"><span class="receipt-label">Lampiran Drive</span><span class="receipt-val"><a href="${escapeHtml(tx.link_bukti)}" target="_blank" rel="noopener" class="tx-link">Buka Dokumen ↗</a></span></div>` : ''}
        <div class="receipt-total"><span class="receipt-label">TOTAL</span><span class="receipt-val ${tx.type === 'masuk' ? 'amt-in' : 'amt-out'} receipt-amount">${formatRp(tx.amount)}</span></div>`;
    openModal('receiptModal');
}

// ==========================================
// KALENDER CUSTOM (tahun lahir didukung)
// ==========================================
let currentCalTargetHidden = '', currentCalTargetDisp = '', calDate = new Date();

function openCustomDatePicker(hiddenId, dispId) {
    currentCalTargetHidden = hiddenId; currentCalTargetDisp = dispId;
    const exist = $(hiddenId).value, isBirth = hiddenId === 'edit-birth-hidden';
    calDate = exist ? new Date(exist) : (isBirth ? new Date(2000, 0, 1) : new Date());
    if (isNaN(calDate)) calDate = new Date();
    $('custCalMonthOptions').innerHTML = monthsArr.map((m, i) => `<div class="custom-option text-neutral" onclick="selectCustCalMonth(${i},'${m}')">${m}</div>`).join('');
    const cy = new Date().getFullYear(); let y = '';
    for (let i = isBirth ? cy : cy + 5; i >= (isBirth ? cy - 90 : cy - 5); i--) y += `<div class="custom-option text-neutral" onclick="selectCustCalYear(${i})">${i}</div>`;
    $('custCalYearOptions').innerHTML = y;
    let h = ''; for (let i = 0; i < 24; i++) h += `<div class="custom-option text-neutral ta-center" onclick="selectCustCalHour('${pad2(i)}')">${pad2(i)}</div>`;
    $('custCalHourOptions').innerHTML = h;
    let mi = ''; for (let i = 0; i < 60; i += 5) mi += `<div class="custom-option text-neutral ta-center" onclick="selectCustCalMinute('${pad2(i)}')">${pad2(i)}</div>`;
    $('custCalMinuteOptions').innerHTML = mi;
    selectCustCalMonth(calDate.getMonth(), monthsArr[calDate.getMonth()]); selectCustCalYear(calDate.getFullYear());
    selectCustCalHour(pad2(calDate.getHours())); selectCustCalMinute(pad2(Math.min(55, Math.round(calDate.getMinutes() / 5) * 5)));
    openModal('customCalendarModal');
}
function selectCustCalMonth(i, m) { $('custCalMonthVal').value = i; $('dispCalMonth').innerText = m; closeModal(''); renderCustomCalendar(); }
function selectCustCalYear(y) { $('custCalYearVal').value = y; $('dispCalYear').innerText = y; closeModal(''); renderCustomCalendar(); }
function selectCustCalHour(h) { $('custCalHourVal').value = h; $('dispCalHour').innerText = h; closeModal(''); }
function selectCustCalMinute(m) { $('custCalMinuteVal').value = m; $('dispCalMinute').innerText = m; closeModal(''); }
function renderCustomCalendar() {
    const month = parseInt($('custCalMonthVal').value), year = parseInt($('custCalYearVal').value);
    if (isNaN(month) || isNaN(year)) return;
    const first = new Date(year, month, 1).getDay(), days = new Date(year, month + 1, 0).getDate(), now = new Date();
    let html = ''; for (let i = 0; i < first; i++) html += `<div class="cal-day-btn disabled"></div>`;
    for (let i = 1; i <= days; i++) {
        let c = 'cal-day-btn';
        if (calDate.getDate() === i && calDate.getMonth() === month && calDate.getFullYear() === year) c += ' selected';
        if (now.getDate() === i && now.getMonth() === month && now.getFullYear() === year) c += ' today';
        html += `<div class="${c}" onclick="selectCustomDay(${i},${month},${year})">${i}</div>`;
    }
    $('calendarDaysGrid').innerHTML = html;
}
function selectCustomDay(d, m, y) { calDate = new Date(y, m, d, calDate.getHours(), calDate.getMinutes()); renderCustomCalendar(); }
function applyCustomDate() {
    const month = parseInt($('custCalMonthVal').value), year = parseInt($('custCalYearVal').value);
    const day = Math.min(calDate.getDate(), new Date(year, month + 1, 0).getDate());
    const d = new Date(year, month, day, parseInt($('custCalHourVal').value), parseInt($('custCalMinuteVal').value));
    const iso = new Date(d - d.getTimezoneOffset() * 60000).toISOString().slice(0, -1);
    $(currentCalTargetHidden).value = iso;
    $(currentCalTargetDisp).innerText = currentCalTargetHidden === 'edit-birth-hidden' ? formatDateOnly(iso) : formatDetailDate(iso);
    closeModal('customCalendarModal');
}

// ==========================================
// TRANSAKSI CRUD
// ==========================================
function fillCategoryBox(boxId, arr, cat, fn) {
    const list = arr.includes(cat) ? arr : [...arr, cat];
    $(boxId).innerHTML = list.map(c => `<div class="custom-option text-neutral" data-val="${escapeHtml(c)}" onclick="${fn}(this.dataset.val)">${escapeHtml(c)}</div>`).join('');
}
function quickInput(type, cat, desc) {
    $('tx-type').value = type;
    $('modal-title').innerText = type === 'masuk' ? 'Catat Pemasukan TPA' : 'Catat Pengeluaran TPA';
    $('tx-desc').value = desc; $('tx-pihak-terkait').value = ''; $('tx-category-manual').value = '';
    $('tx-date-hidden').value = ''; $('disp-tx-date').innerText = 'Gunakan Waktu Saat Ini'; $('tx-is-saving').value = 'false';
    selectTitle('Bapak/Ibu');
    if (cat === 'MANUAL') { $('catSelectWrapper').style.display = 'none'; $('tx-category-manual').style.display = 'block'; $('label-kategori').innerText = 'Ketik Nama Kategori'; }
    else {
        $('catSelectWrapper').style.display = 'block'; $('tx-category-manual').style.display = 'none'; $('label-kategori').innerText = 'Kategori';
        fillCategoryBox('catOptionsBox', type === 'masuk' ? categories.masuk : categories.keluar, cat, 'selectCategory'); selectCategory(cat);
    }
    $('tx-amount').value = ''; rawAmount = 0; openModal('txModal');
}
bindMoneyInput('tx-amount', n => rawAmount = n);
bindMoneyInput('edit-tx-amount', n => editRawAmount = n);
bindMoneyInput('transfer-amount'); bindMoneyInput('transfer2-amount'); bindMoneyInput('wishlist-amount');

async function persistTransactions(list, modalId, label) {
    if (isCloudReady()) {
        try {
            const { error } = await sbClient.from('transactions').insert(list.map(t => ({ ...t, user_id: currentUser.id })));
            if (error) throw error;
            await fetchUserTransactions(); closeModal(modalId);
            showToast(`${label} tersimpan di Cloud dan langsung tampil di portal wali murid.`); return;
        } catch (e) {
            list.forEach(t => t.id = newId()); db.push(...list); pendingSync.push(...list); setLS('pending_sync', JSON.stringify(pendingSync));
            afterDataChange(); closeModal(modalId); showToast("Koneksi bermasalah. Data masuk antrean offline dan dikirim otomatis saat online.", "syncing"); return;
        }
    }
    list.forEach(t => t.id = newId()); db.push(...list);
    if (APP_MODE === 'CLOUD') { pendingSync.push(...list); setLS('pending_sync', JSON.stringify(pendingSync)); }
    afterDataChange(); closeModal(modalId); showToast(`${label} tersimpan di perangkat ini.`);
}

$('btnExecuteTx').addEventListener('click', async () => {
    if (rawAmount <= 0) { showToast("Nominal harus lebih dari 0.", "error"); return; }
    if ($('tx-is-saving').value === 'true') return; $('tx-is-saving').value = 'true';
    try {
        const manual = $('tx-category-manual').style.display === 'block';
        let cat = manual ? $('tx-category-manual').value.trim() : $('tx-category').value, desc = $('tx-desc').value.trim();
        if (!cat || !desc) { showToast("Kategori & keterangan wajib diisi.", "error"); return; }
        const pihakRaw = $('tx-pihak-terkait').value.trim(), dIn = $('tx-date-hidden').value;
        const tx = { wallet: activeWallet, type: $('tx-type').value, category: properTitleCase(cat), desc: properTitleCase(desc), pihak_terkait: pihakRaw ? `${$('tx-title-val').value} ${properTitleCase(pihakRaw)}` : '', link_bukti: '', amount: rawAmount, status: 'normal', date: dIn ? new Date(dIn).toISOString() : new Date().toISOString() };
        if (tx.type === 'keluar' && walletBalance(activeWallet) < tx.amount) showToast("Perhatian: pengeluaran melebihi saldo dompet ini (saldo akan minus).", "error");
        await persistTransactions([tx], 'txModal', 'Transaksi');
    } finally { $('tx-is-saving').value = 'false'; }
});

// ---------- PIN & aksi kritis ----------
function promptActionPin(action, txId) {
    closeModal('receiptModal');
    if (!profile.pin) { if (action === 'edit') openEditTxModal(txId); else executeTxDeleteFinal(txId); return; }
    $('actionPinType').value = action; $('actionPinPayload').value = txId; $('inputActionPin').value = '';
    setTimeout(() => openModal('actionPinModal'), 150);
}
function promptActionPinFromTable(e, action, txId) { e.stopPropagation(); promptActionPin(action, txId); }

async function verifyActionPinFinal() {
    const hashed = await hashPIN($('inputActionPin').value);
    if (hashed !== profile.pin) { showToast("PIN salah! Akses ditolak.", "error"); return; }
    const action = $('actionPinType').value, payload = $('actionPinPayload').value;
    $('inputActionPin').value = ''; closeModal('actionPinModal');
    setTimeout(() => {
        if (action === 'delete') executeTxDeleteFinal(payload);
        else if (action === 'edit') openEditTxModal(payload);
        else if (action === 'delete_wishlist') executeWishlistDelete(payload);
        else if (action === 'reset') executeFactoryReset();
    }, 250);
}

function executeTxDeleteFinal(txId) {
    openCustomConfirm("Penghapusan Transaksi", "Data yang dihapus akan hilang dari sistem laporan dan portal wali murid.", async () => {
        const idx = db.findIndex(t => String(t.id) === String(txId) || String(t.date) === String(txId)); if (idx === -1) return;
        const del = db[idx]; db.splice(idx, 1);
        const wasPending = pendingSync.some(t => String(t.id) === String(del.id));
        pendingSync = pendingSync.filter(t => String(t.id) !== String(del.id)); setLS('pending_sync', JSON.stringify(pendingSync));
        if (!wasPending && isCloudReady() && del.id) { try { await sbClient.from('transactions').delete().eq('id', del.id); } catch (e) {} }
        afterDataChange(); showToast("Transaksi berhasil dihapus.");
    });
}

function openEditTxModal(txId) {
    const tx = db.find(t => String(t.id) === String(txId) || String(t.date) === String(txId)); if (!tx) return;
    $('edit-tx-id').value = txId;
    fillCategoryBox('editCatOptionsBox', tx.type === 'masuk' ? categories.masuk : categories.keluar, tx.category, 'selectEditCategory'); selectEditCategory(tx.category);
    $('edit-tx-date-hidden').value = tx.date; $('disp-edit-tx-date').innerText = formatDetailDate(tx.date); $('edit-tx-desc').value = tx.desc;
    let title = 'Bapak/Ibu', name = tx.pihak_terkait || '';
    ['Pengurus Masjid', 'Tokoh Masyarakat', 'Ustadz/ah', 'Murid', 'Bapak/Ibu'].some(t => { if (name.startsWith(t + ' ')) { title = t; name = name.slice(t.length + 1); return true; } });
    selectEditTitle(title); $('edit-tx-pihak').value = name;
    editRawAmount = tx.amount; $('edit-tx-amount').value = tx.amount.toLocaleString('id-ID'); openModal('editTxModal');
}

async function saveEditedTransaction() {
    const txId = $('edit-tx-id').value, idx = db.findIndex(t => String(t.id) === txId || String(t.date) === txId); if (idx === -1) return;
    const desc = $('edit-tx-desc').value.trim(), pihak = $('edit-tx-pihak').value.trim();
    if (!desc || editRawAmount <= 0) { showToast("Keterangan dan nominal harus valid.", "error"); return; }
    const upd = { category: $('edit-tx-category').value, desc: properTitleCase(desc), date: new Date($('edit-tx-date-hidden').value).toISOString(), pihak_terkait: pihak ? `${$('edit-tx-title-val').value} ${properTitleCase(pihak)}` : '', amount: editRawAmount };
    const pend = pendingSync.findIndex(t => String(t.id) === String(db[idx].id));
    Object.assign(db[idx], upd);
    if (pend > -1) { Object.assign(pendingSync[pend], upd); setLS('pending_sync', JSON.stringify(pendingSync)); }
    else if (isCloudReady() && db[idx].id) { try { await sbClient.from('transactions').update(upd).eq('id', db[idx].id); } catch (e) {} }
    afterDataChange(); closeModal('editTxModal'); showToast("Transaksi berhasil diubah.");
}

// ==========================================
// TRANSFER ANTAR DOMPET
// ==========================================
function openTransferDaruratModal() { $('transfer-amount').value = ''; $('transfer-desc').value = ''; openModal('transferDaruratModal'); }
function selectTransferSource(v, l) { $('transfer-source-val').value = v; $('dispTransferSource').innerText = l; closeModal(''); }
function openTransferAntarDompetModal() { $('transfer2-amount').value = ''; $('transfer2-desc').value = ''; openModal('transferAntarDompetModal'); }
function selectTransferFrom(v, l) { $('transfer-from-val').value = v; $('dispTransferFrom').innerText = l; closeModal(''); }
function selectTransferTo(v, l) { $('transfer-to-val').value = v; $('dispTransferTo').innerText = l; closeModal(''); }
function readAmount(id) { const v = $(id).value.replace(/[^0-9]/g, ''); return v ? parseInt(v, 10) : 0; }

function buildTransfer(src, dst, amount, desc, catIn, modalId) {
    if (amount <= 0) { showToast("Nominal transfer tidak valid.", "error"); return; }
    if (walletBalance(src) < amount) { showToast(`Saldo ${walletNames[src]} tidak cukup (${formatRp(walletBalance(src))}).`, "error"); return; }
    const now = new Date().toISOString(), base = { link_bukti: '', pihak_terkait: 'Pengurus Transfer Internal', amount, status: 'normal', date: now, desc };
    persistTransactions([{ ...base, wallet: src, type: 'keluar', category: 'Lainnya' }, { ...base, wallet: dst, type: 'masuk', category: catIn }], modalId, 'Transfer');
}
function executeTransferDarurat() { buildTransfer($('transfer-source-val').value, 'darurat', readAmount('transfer-amount'), $('transfer-desc').value.trim() || 'Alokasi Dana Darurat', 'Dana Cadangan', 'transferDaruratModal'); }
function executeTransferAntarDompet() {
    const s = $('transfer-from-val').value, t = $('transfer-to-val').value;
    if (s === t) { showToast("Dompet asal dan tujuan tidak boleh sama.", "error"); return; }
    buildTransfer(s, t, readAmount('transfer2-amount'), $('transfer2-desc').value.trim() || `Transfer dari ${walletNames[s]} ke ${walletNames[t]}`, 'Lainnya', 'transferAntarDompetModal');
}

// ==========================================
// TARGET DANA, DRIVE, EXPORT CSV, PENCARIAN
// ==========================================
bindMoneyInput('wishlist-collected');

function renderWishlist() {
    const c = $('wishlistContainer'); if (!c) return;
    if (!wishlists.length) { c.innerHTML = `<div class="glass-card empty-box text-neutral">Belum ada target.</div>`; return; }
    c.innerHTML = wishlists.map(w => {
        const pct = Math.min(100, Math.round((w.collected / w.amount) * 100)) || 0;
        return `<div class="glass-card list-row">
            <div style="flex:1; min-width:0; padding-right:15px;">
                <div class="list-title text-neutral">${escapeHtml(w.name)}</div>
                <div class="progress-wrap">
                    <div class="progress-stats"><span>Terkumpul: ${formatRp(w.collected || 0)}</span><span>Butuh: ${formatRp(w.amount)}</span></div>
                    <div class="progress-bar-bg"><div class="progress-bar-fill" style="width: ${pct}%"></div></div>
                </div>
            </div>
            <button onclick="promptActionPin('delete_wishlist', '${w.id}')" class="btn-icon-danger">${svgs.trash}</button>
        </div>`;
    }).join('');
}
function openAddWishlistModal() { $('wishlist-name').value = ''; $('wishlist-amount').value = '';$('wishlist-collected').value = ''; openModal('addWishlistModal'); }
function saveWishlist() {
    const name = properTitleCase($('wishlist-name').value.trim()), amount = readAmount('wishlist-amount'), collected = readAmount('wishlist-collected');
    if (!name || amount <= 0) { showToast("Nama dan nominal target harus valid.", "error"); return; }
    wishlists.push({ id: Date.now().toString(), name, amount, collected }); 
    saveScopedData(); renderWishlist(); publishPublicSnapshot(); closeModal('addWishlistModal'); showToast("Target dana tersimpan.");
}
function executeWishlistDelete(id) {
    openCustomConfirm("Hapus Target Dana", "Data target dana ini akan dihapus permanen.", () => {
        wishlists = wishlists.filter(w => w.id !== id);
        saveScopedData(); renderWishlist(); publishPublicSnapshot(); showToast("Target dana dihapus.");
    });
}

function renderDriveLinks() {
    const c = $('driveContainer'); if (!c) return;
    if (!driveLinks.length) { c.innerHTML = `<div class="glass-card empty-box text-neutral">Kosong.</div>`; return; }
    c.innerHTML = driveLinks.map(d => `<div class="glass-card drive-item">${svgs.link}<a href="${escapeHtml(d.url)}" target="_blank" rel="noopener" class="text-neutral">${escapeHtml(d.name)}</a><button onclick="deleteDriveLink('${d.id}')" class="btn-icon-danger sm">${svgs.trash}</button></div>`).join('');
}
function openAddDriveModal() { $('drive-name').value = '';$('drive-url').value = ''; openModal('addDriveModal'); }
function saveDriveLink() {
    const name = properTitleCase($('drive-name').value.trim()), url =$('drive-url').value.trim();
    if (!name || !/^https?:\/\//i.test(url)) { showToast("Nama dan URL (https://...) harus valid.", "error"); return; }
    driveLinks.push({ id: Date.now().toString(), name, url }); 
    saveScopedData();
    renderDriveLinks(); closeModal('addDriveModal'); showToast("Pintasan Drive tersimpan.");
}
function deleteDriveLink(id) { 
    driveLinks = driveLinks.filter(d => d.id !== id); 
    saveScopedData(); /*
    renderDriveLinks(); 
}

function downloadCSV(csv, filename) {
    const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8;' }), a = document.createElement('a');
    a.href = URL.createObjectURL(blob); a.download = filename; document.body.appendChild(a); a.click(); document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}
function openCSVModal() {
    if (!db.length) { showToast("Belum ada data untuk diekspor.", "error"); return; }
    ['csv-start', 'csv-end'].forEach(p => { $(p + '-hidden').value = ''; $('disp-' + p).innerText = 'Pilih...'; });
    openModal('csvExportModal');
}
function executeCSVExport() {
    const s = $('csv-start-hidden').value, e = $('csv-end-hidden').value;
    const rows = db.filter(tx => {
        if (tx.wallet !== activeWallet) return false;
        const d = new Date(tx.date); d.setHours(0, 0, 0, 0);
        if (s) { const a = new Date(s); a.setHours(0, 0, 0, 0); if (d < a) return false; }
        if (e) { const b = new Date(e); b.setHours(23, 59, 59, 999); if (d > b) return false; }
        return true;
    });
    if (!rows.length) { showToast("Tidak ada data pada rentang tanggal tersebut.", "error"); return; }
    closeModal('csvExportModal');
    let csv = "Tanggal,Dompet,Tipe,Kategori,Keterangan,Pihak_Terkait,Link_Drive,Nominal\n";
    rows.sort((a, b) => new Date(a.date) - new Date(b.date)).forEach(r => { csv += [formatDetailDate(r.date), r.wallet, r.type, r.category, r.desc, r.pihak_terkait || '-', r.link_bukti || '-', r.amount].map(v => `"${String(v).replace(/"/g, '""')}"`).join(",") + "\n"; });
    downloadCSV(csv, `Laporan_TPA_${activeWallet.toUpperCase()}_${localDateKey()}.csv`); showToast("Laporan CSV berhasil diunduh.");
}

const searchInput = $('searchTxInput'), searchClear = $('searchClearBtn');
if (searchInput) searchInput.addEventListener('input', e => { const v = e.target.value.toLowerCase(); searchClear.style.display = v ? 'block' : 'none'; updateUI(v); });
function clearSearch() { searchInput.value = ''; searchClear.style.display = 'none'; updateUI(''); }

/* ===== AKHIR BAGIAN 2/3 - lanjutkan BAGIAN 3/3 di bawah baris ini ===== */

/* =========================================================
   TPA FINANCE v4.4 - MAIN.JS  (BAGIAN 3 dari 3)
   Isi: SPP & Absensi admin, Snapshot publik (Supabase), Portal wali
        murid real-time, Google Login, OTP EmailJS, Reset, bootApp.

   ---- JALANKAN SEKALI di Supabase > SQL Editor (agar portal live) ----
   create table if not exists public.public_snapshot (
     owner_id uuid primary key references auth.users(id) on delete cascade,
     data jsonb not null default '{}'::jsonb,
     updated_at timestamptz not null default now());
   alter table public.public_snapshot enable row level security;
   create policy "snapshot_read"   on public.public_snapshot for select using (true);
   create policy "snapshot_insert" on public.public_snapshot for insert with check (auth.uid() = owner_id);
   create policy "snapshot_update" on public.public_snapshot for update using (auth.uid() = owner_id);
   alter publication supabase_realtime add table public.public_snapshot;
========================================================= */

// ==========================================
// SPP & ABSENSI (ADMIN)
// ==========================================
function saveSpp() { saveScopedData(); publishPublicSnapshot(); }
function studentById(id) { return sppData.find(s => s.id === id); }
function migrateSppData() {
    sppData.forEach(s => {
        s.months = s.months || []; s.att = s.att || {};
        (s.attendLogs || []).forEach(l => { if (l.status === 'Hadir') s.att[localDateKey(new Date(l.time))] = true; });
        delete s.attendLogs; delete s.presentToday;
    });
    setLS('spp_data_v47', JSON.stringify(sppData));
}
// Belum bayar: otomatis = bulan yang belum lunas s/d bulan ini; admin bisa mengubah manual (s.unpaid)
function getUnpaid(s) {
    if (Array.isArray(s.unpaid)) return monthsArr.filter(m => s.unpaid.includes(m) && !s.months.includes(m));
    const cur = new Date().getMonth(); return monthsArr.filter((m, i) => i <= cur && !s.months.includes(m));
}
function weekDates() {
    const t = new Date(); t.setHours(0, 0, 0, 0); const mon = new Date(t); mon.setDate(t.getDate() - ((t.getDay() + 6) % 7));
    return Array.from({ length: 7 }, (_, i) => { const d = new Date(mon); d.setDate(mon.getDate() + i); return d; });
}
function attStatus(s, d) {
    const k = localDateKey(d), tk = localDateKey();
    if (s.att && s.att[k]) return 'hadir'; if (k > tk) return 'next'; return k === tk ? 'belum' : 'absen';
}

function openSppAbsenModal() { openModal('sppAbsenModal'); renderAdminStudentTable(); }
function registerStudent() {
    const input = $('newStudentName'), name = properTitleCase(input.value.trim());
    if (!name) { showToast("Nama murid wajib diisi.", "error"); return; }
    if (sppData.some(s => s.name.toLowerCase() === name.toLowerCase())) { showToast("Nama murid sudah terdaftar.", "error"); return; }
    sppData.push({ id: Date.now().toString(), name, months: [], att: {} });
    saveSpp(); input.value = ''; renderAdminStudentTable(); showToast(`${name} berhasil didaftarkan.`);
}
function deleteStudentAdmin(id) {
    openCustomConfirm("Hapus Murid", "Semua riwayat SPP dan absensi murid ini akan hilang permanen.", () => { sppData = sppData.filter(s => s.id !== id); saveSpp(); renderAdminStudentTable(); showToast("Murid dihapus."); });
}
function openEditStudentModal(id) { const s = studentById(id); if (!s) return; $('editStudentTargetId').value = id; $('editStudentNameInput').value = s.name; openModal('editStudentModal'); }
function saveEditStudentName() {
    const s = studentById($('editStudentTargetId').value), n = properTitleCase($('editStudentNameInput').value.trim());
    if (!s || !n) return; s.name = n; saveSpp(); closeModal('editStudentModal'); renderAdminStudentTable(); showToast("Nama murid diubah.");
}

function monthBadges(list, cls) { 
    if (!list.length) return '<span class="muted-xs">-</span>'; 
    return list.map(m => `<span class="mb ${cls}">${m.substring(0, 3)}</span>`).join(''); 
}
function renderAdminStudentTable() {
    const tb = $('adminStudentTableBody'); if (!tb) return;
    if (!sppData.length) { tb.innerHTML = `<tr><td colspan="5" class="empty-cell">Belum ada data murid.</td></tr>`; return; }
    const tk = localDateKey();
    tb.innerHTML = sppData.map(s => `<tr class="admin-spp-row" data-name="${escapeHtml(s.name.toLowerCase())}">
        <td class="sp-name text-neutral">${escapeHtml(s.name)}<div class="sp-edit" onclick="openEditStudentModal('${s.id}')">✎ Ubah Nama</div></td>
        <td class="ta-center" onclick="openMultiMonthSelect('${s.id}')"><div class="sp-box ok">${monthBadges(s.months, 'ok')}</div></td>
        <td class="ta-center" onclick="openMultiMonthSelect('${s.id}')"><div class="sp-box bad">${monthBadges(getUnpaid(s), 'bad')}</div></td>
        <td class="ta-center"><div class="sp-att"><input type="checkbox" ${s.att[tk] ? 'checked' : ''} onchange="toggleAttendance('${s.id}', this.checked)"><button class="btn-outline-small" onclick="openAbsenDetailModal('${s.id}')">Pekan Ini</button></div></td>
        <td class="ta-center"><button class="btn-icon-danger sm" onclick="deleteStudentAdmin('${s.id}')">${svgs.trash}</button></td></tr>`).join('');
    filterAdminStudentTable();
}
function filterAdminStudentTable() {
    const q = ($('searchStudentAdmin').value || '').toLowerCase();
    document.querySelectorAll('.admin-spp-row').forEach(r => r.style.display = r.dataset.name.includes(q) ? '' : 'none');
}

// ----- Atur SPP: Lunas & Belum Bayar (saling meniadakan) -----
function openMultiMonthSelect(id) {
    const s = studentById(id); if (!s) return;
    $('multiMonthTargetId').value = id; $('multiMonthStudentName').innerText = s.name;
    const unp = getUnpaid(s);
    $('multiMonthGrid').innerHTML = monthsArr.map(m => `<div><input type="checkbox" id="cbp_${m}" value="${m}" class="spp-month-cb paid" ${s.months.includes(m) ? 'checked' : ''}><label for="cbp_${m}" class="spp-month-label">${m.substring(0, 3)}</label></div>`).join('');
    $('multiMonthUnpaidGrid').innerHTML = monthsArr.map(m => `<div><input type="checkbox" id="cbu_${m}" value="${m}" class="spp-month-cb unpaid" ${unp.includes(m) ? 'checked' : ''}><label for="cbu_${m}" class="spp-month-label unpaid">${m.substring(0, 3)}</label></div>`).join('');
    openModal('multiMonthSelectModal');
}
document.addEventListener('change', e => {
    const cb = e.target; if (!cb.classList || !cb.classList.contains('spp-month-cb')) return;
    const other = document.getElementById((cb.classList.contains('paid') ? 'cbu_' : 'cbp_') + cb.value);
    if (cb.checked && other) other.checked = false;
    if (!cb.checked && cb.classList.contains('paid') && other) other.checked = true; // batal lunas -> otomatis belum bayar
});
function saveMultiMonthSpp() {
    const s = studentById($('multiMonthTargetId').value); if (!s) return;
    s.months = [...document.querySelectorAll('.spp-month-cb.paid:checked')].map(c => c.value);
    s.unpaid = [...document.querySelectorAll('.spp-month-cb.unpaid:checked')].map(c => c.value);
    saveSpp(); closeModal('multiMonthSelectModal'); renderAdminStudentTable(); showToast("Status SPP diperbarui dan tampil di portal wali murid.");
}

// ----- Absensi pekanan (hari baru terbuka otomatis 00:00, reset Minggu 00:00) -----
function setAttend(id, key, val) { const s = studentById(id); if (!s) return; if (val) s.att[key] = true; else delete s.att[key]; saveSpp(); }
function toggleAttendance(id, val) { setAttend(id, localDateKey(), val); showToast(val ? "Hadir dicatat untuk hari ini." : "Kehadiran hari ini dibatalkan.", "success"); }
function openAbsenDetailModal(id) {
    const s = studentById(id); if (!s) return;
    $('absenTargetId').value = id; $('absenStudentName').innerText = s.name;
    const wk = weekDates(), tk = localDateKey();
    $('absenWeekRange').innerText = `${formatDateOnly(wk[0].toISOString())} s/d ${formatDateOnly(wk[6].toISOString())}`;
    $('absenDaysGrid').innerHTML = wk.map(d => {
        const k = localDateKey(d), locked = k > tk;
        return `<label class="absen-row ${locked ? 'locked' : ''} ${k === tk ? 'today' : ''}"><span><b>${dayNames[d.getDay()]}</b> · ${formatDateOnly(d.toISOString())}${k === tk ? ' (Hari ini)' : ''}</span><input type="checkbox" ${s.att[k] ? 'checked' : ''} ${locked ? 'disabled' : ''} onchange="setAttend('${id}','${k}',this.checked); renderAdminStudentTable()"></label>`;
    }).join('');
    openModal('absenDetailModal');
}
function checkAttendanceReset() {
    const now = new Date(), tk = localDateKey(now);
    if (now.getDay() === 6 && getLS('sat_reminder_done') !== tk) { showToast("⚠️ Besok pukul 00:00 absensi pekan ini di-reset otomatis. Unduh Rekap CSV hari ini di menu Absensi & SPP.", "support"); setLS('sat_reminder_done', tk); }
    const sun = new Date(now); sun.setDate(now.getDate() - now.getDay()); const sunKey = localDateKey(sun);
    const last = localDateKey(new Date(attendanceData.lastReset || 0));
    if (last < sunKey) {
        sppData.forEach(s => Object.keys(s.att || {}).forEach(k => { if (k < sunKey) delete s.att[k]; }));
        attendanceData.lastReset = now.toISOString(); setLS('attendance_data_v47', JSON.stringify(attendanceData)); saveSpp();
        showToast("Sistem: absensi pekan lalu telah di-reset otomatis (Minggu 00:00).", "syncing");
    }
    if ($('sppAbsenModal') && $('sppAbsenModal').classList.contains('active')) renderAdminStudentTable();
}
function downloadAbsensiCSV() {
    if (!sppData.length) { showToast("Data murid masih kosong.", "error"); return; }
    const wk = weekDates(); let csv = "Nama_Murid,Bulan_Lunas,Bulan_Belum_Bayar," + wk.map(d => dayNames[d.getDay()] + ' ' + localDateKey(d)).join(',') + "\n";
    sppData.forEach(s => { csv += [s.name, s.months.join(' & ') || '-', getUnpaid(s).join(' & ') || '-', ...wk.map(d => attStatus(s, d) === 'hadir' ? 'HADIR' : (attStatus(s, d) === 'next' ? '-' : 'TIDAK HADIR'))].map(v => `"${v}"`).join(',') + "\n"; });
    downloadCSV(csv, `Rekap_Absen_SPP_TPA_${localDateKey()}.csv`); showToast("Rekap absensi & SPP diunduh.");
}

// ==========================================
// SNAPSHOT PUBLIK (admin -> Supabase) & LINK
// ==========================================
let pubPublishTimer = null;
function buildSnapshot() {
    return {
        v: APP_VERSION, updatedAt: new Date().toISOString(),
        wishlists: wishlists,
        students: sppData.map(s => ({ id: s.id, name: s.name, months: s.months, unpaid: getUnpaid(s), att: s.att || {} })),
        tx: db.map(t => ({ id: t.id, wallet: t.wallet, type: t.type, category: t.category, desc: t.desc, pihak_terkait: t.pihak_terkait || '', link_bukti: t.link_bukti || '', amount: t.amount, date: t.date }))
    };
}
function publishPublicSnapshot() {
    if (isPublicMode) return;
    clearTimeout(pubPublishTimer);
    pubPublishTimer = setTimeout(async () => {
        if (!isCloudReady()) return;
        try { await sbClient.from('public_snapshot').upsert({ owner_id: currentUser.id, data: buildSnapshot(), updated_at: new Date().toISOString() }); } catch (e) {}
    }, 1500);
}
function openShareLinkModal() {
    const l = window.location; let url = `${l.protocol}//${l.host}${l.pathname}?view=public`;
    if (currentUser && currentUser.id !== 'offline_user') { url += `&o=${currentUser.id}`; publishPublicSnapshot(); }
    else showToast("Login Cloud (Google) dulu agar tautan ini live dan bisa dibuka di HP wali murid.", "error");
    $('publicLinkInput').value = url; openModal('shareLinkModal');
}
function copyPublicLink() {
    const i = $('publicLinkInput'); i.select(); i.setSelectionRange(0, 99999);
    (navigator.clipboard ? navigator.clipboard.writeText(i.value) : Promise.reject()).then(() => showToast("Tautan berhasil disalin.")).catch(() => { document.execCommand('copy'); showToast("Tautan disalin."); });
}

// ==========================================
// PORTAL WALI MURID (READ-ONLY, REAL-TIME)
// ==========================================
let publicOwner = null, publicStudents = [], publicUpdated = null, publicStudentName = '', publicWalletFilter = 'semua', publicTimer = null, publicLoaded = false, publicSource = 'lokal';
window.publicTx = [];

async function loadPublicData() {
    let ok = false;
    if (publicOwner) {
        if (navigator.onLine && window.supabase) {
            try {
                if (!sbClient) sbClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
                const { data, error } = await sbClient.from('public_snapshot').select('data,updated_at').eq('owner_id', publicOwner).maybeSingle();
                if (error) throw error;
                if (data && data.data) { 
                    notifyPublicChanges(data.data); 
                    publicStudents = data.data.students || []; window.publicTx = data.data.tx || []; 
                    window.publicWishlists = data.data.wishlists || []; 
                    publicUpdated = data.updated_at || data.data.updatedAt; 
                    publicSource = 'cloud'; ok = true; 
                }
            } catch (e) {}
        }
        if (!ok) { publicStudents = []; window.publicTx = []; window.publicWishlists = []; publicSource = 'cloud_failed'; }
    } else {
        db = loadLocalDB(); loadScopedData();
        publicStudents = sppData.map(s => ({ id: s.id, name: s.name, months: s.months, unpaid: getUnpaid(s), att: s.att })); 
        window.publicTx = db; window.publicWishlists = wishlists; 
        publicUpdated = new Date().toISOString(); publicSource = 'lokal'; ok = true;
    }
    publicLoaded = true; return ok;
}
function notifyPublicChanges(next) {
    if (!publicLoaded || !publicStudentName) return;
    const oldIds = new Set((window.publicTx || []).map(t => String(t.id)));
    const fresh = (next.tx || []).filter(t => !oldIds.has(String(t.id)));
    if (fresh.length) { const t = fresh[fresh.length - 1]; showToast(`Transaksi baru: ${t.type === 'masuk' ? 'Pemasukan' : 'Pengeluaran'} ${formatRp(t.amount)} · ${walletNames[t.wallet] || t.wallet} · ${escapeHtml(t.desc)}`, 'info'); }
    const o = publicStudents.find(x => x.name === publicStudentName), n = (next.students || []).find(x => x.name === publicStudentName);
    if (o && n && JSON.stringify([o.att, o.months, o.unpaid]) !== JSON.stringify([n.att, n.months, n.unpaid])) showToast(`Data absensi/SPP ${publicStudentName} diperbarui oleh admin.`, 'info');
}
async function initPublicPortal() {
    $('adminDashboard').style.display = 'none'; 
    $('publicDashboard').style.display = 'none'; 
    $('publicLoginOverlay').style.display = 'flex';
    await loadPublicData();
    initPrayerTimes(); // <--- Eksekusi pelacakan lokasi & jadwal sholat di mode publik
}
function handlePublicAutocomplete() {
    const v = $('publicStudentInput').value.toLowerCase(), list = $('publicAutocompleteList');
    const m = v ? publicStudents.filter(s => s.name.toLowerCase().includes(v)) : [];
    if (!m.length) { list.classList.add('hidden'); return; }
    list.innerHTML = m.map(s => `<div class="custom-option text-neutral" data-name="${escapeHtml(s.name)}" onclick="selectPublicStudent(this.dataset.name)">${escapeHtml(s.name)}</div>`).join(''); list.classList.remove('hidden');
}
function selectPublicStudent(name) { $('publicStudentInput').value = name; $('publicAutocompleteList').classList.add('hidden'); }
async function validatePublicLogin() {
    const name = $('publicStudentInput').value.trim(); if (!name) return;
    await loadPublicData();
    const s = publicStudents.find(x => x.name.toLowerCase() === name.toLowerCase());
    if (!s) { showToast(publicStudents.length ? "Nama tidak ditemukan. Pilih dari daftar yang muncul." : "Data TPA belum tersedia. Admin perlu login Cloud dan membagikan ulang tautan.", "error"); return; }
    publicStudentName = s.name; $('publicLoginOverlay').style.display = 'none'; $('publicDashboard').style.display = 'block';
    window.scrollTo(0, 0); renderPublicAll(); startPublicLive();
}
function startPublicLive() {
    clearInterval(publicTimer); publicTimer = setInterval(refreshPublic, 20000);
    document.addEventListener('visibilitychange', () => { if (!document.hidden) refreshPublic(); });
    window.addEventListener('online', refreshPublic);
    if (sbClient && publicOwner) { try { sbClient.channel('public-live').on('postgres_changes', { event: '*', schema: 'public', table: 'public_snapshot', filter: `owner_id=eq.${publicOwner}` }, () => refreshPublic()).subscribe(); } catch (e) {} }
}
async function refreshPublic() { await loadPublicData(); renderPublicAll(); }
function setPublicWallet(w) { publicWalletFilter = w; document.querySelectorAll('.pub-tab').forEach(b => b.classList.toggle('active', b.dataset.wallet === w)); renderPublicHistory(); }

function renderPublicHistory() {
    const q = ($('pubSearchTx') ? $('pubSearchTx').value : '').toLowerCase();
    const list = window.publicTx.filter(t => (publicWalletFilter === 'semua' || t.wallet === publicWalletFilter) && (!q || `${t.desc} ${t.category} ${t.pihak_terkait}`.toLowerCase().includes(q)));
    renderTable(list, true);
}
// Fungsi baru untuk merender Target Dana di Publik
function renderPublicWishlist() {
    const c = $('pubWishlistGrid'); if (!c) return;
    if (!window.publicWishlists || !window.publicWishlists.length) { c.innerHTML = `<div class="glass-card empty-box text-neutral">Belum ada target dana TPA saat ini.</div>`; return; }
    c.innerHTML = window.publicWishlists.map(w => {
        const pct = Math.min(100, Math.round((w.collected / w.amount) * 100)) || 0;
        return `<div class="glass-card list-row">
            <div style="flex:1; min-width:0;">
                <div class="list-title text-neutral">${escapeHtml(w.name)}</div>
                <div class="progress-wrap">
                    <div class="progress-stats"><span>Terkumpul: ${formatRp(w.collected || 0)}</span><span>Butuh: ${formatRp(w.amount)}</span></div>
                    <div class="progress-bar-bg"><div class="progress-bar-fill" style="width: ${pct}%"></div></div>
                </div>
            </div>
        </div>`;
    }).join('');
}

// Timpa keseluruhan fungsi renderPublicAll ini
function renderPublicAll() {
    const s = publicStudents.find(x => x.name === publicStudentName); if (!s) return;
    updateThemeIcon(document.documentElement.getAttribute('data-theme'));
    const tot = { utama: [0, 0], wakaf: [0, 0], operasional: [0, 0], darurat: [0, 0] };
    window.publicTx.forEach(t => { if (tot[t.wallet]) tot[t.wallet][t.type === 'masuk' ? 0 : 1] += t.amount; });
    let all = 0; Object.keys(tot).forEach(w => { const b = tot[w][0] - tot[w][1]; all += b; $('pubBal-' + w).innerText = formatRp(b);$('pubFlow-' + w).innerText = `Masuk ${formatRpPendek(tot[w][0])} · Keluar ${formatRpPendek(tot[w][1])}`; });
    $('pubStudentName').innerText = s.name; $('pubTotalAll').innerText = formatRp(all);$('pubLastUpdate').innerText = 'Diperbarui: ' + formatDetailDate(publicUpdated);
    const st = $('pubSyncStatus'); st.innerText = publicSource === 'cloud' ? (navigator.onLine ? 'Live (Cloud)' : 'Offline') : 'Data Perangkat'; st.className = 'status-sync ' + (publicSource === 'cloud' && navigator.onLine ? 'sync-online' : 'sync-pending');

    // Absensi
    const wk = weekDates(), today = new Date(), stats = wk.map(d => attStatus(s, d)), badge = $('pubTodayBadge'), ts = attStatus(s, today);$('pubTodayDate').innerText = `${dayNames[today.getDay()]}, ${today.getDate()} ${monthsArr[today.getMonth()]} ${today.getFullYear()}`;
    badge.className = ts === 'hadir' ? 'public-badge-hadir' : (ts === 'belum' ? 'public-badge-wait' : 'public-badge-absen'); badge.innerText = ts === 'hadir' ? 'HADIR HARI INI' : 'BELUM DIABSEN';
    const ic = { hadir: '✓', absen: '✕', belum: '•', next: '–' };
    $('pubWeekTrack').innerHTML = wk.map((d, i) => `<div class="pub-day ${stats[i]}"><b>${dayNames[d.getDay()].substring(0, 3)}</b><span>${d.getDate()}</span><i>${ic[stats[i]]}</i></div>`).join('');
    const h = stats.filter(x => x === 'hadir').length, a = stats.filter(x => x === 'absen').length;
    $('pubAttendSummary').innerHTML = `<span class="sum-pill ok">Hadir ${h} hari</span><span class="sum-pill bad">Tidak Hadir ${a} hari</span>`;
    const lbl = { hadir: ['public-badge-hadir', 'HADIR'], absen: ['public-badge-absen', 'TIDAK HADIR'], belum: ['public-badge-wait', 'BELUM DIABSEN'] };
    $('pubAttendLog').innerHTML = wk.map((d, i) => stats[i] === 'next' ? '' : `<div class="public-attend-item"><span class="text-neutral"><b>${dayNames[d.getDay()]}</b>, ${formatDateOnly(d.toISOString())}</span><span class="${lbl[stats[i]][0]}">${lbl[stats[i]][1]}</span></div>`).reverse().join('') || `<div class="public-attend-item">Belum ada riwayat pekan ini.</div>`;

    // SPP
    const cur = today.getMonth(), unp = s.unpaid || [];
    $('pubSppYear').innerText = today.getFullYear();$('pubSppSummary').innerHTML = `<span class="sum-pill ok">Lunas ${s.months.length} bulan</span><span class="sum-pill bad">Belum Bayar ${unp.length} bulan</span>`;
    $('pubSppGrid').innerHTML = monthsArr.map((m, i) => { const c = s.months.includes(m) ? 'lunas' : (unp.includes(m) ? 'belum' : 'none'); return `<div class="pub-spp ${c} ${i === cur ? 'now' : ''}"><b>${m.substring(0, 3)}</b><span>${c === 'lunas' ? 'LUNAS' : (c === 'belum' ? 'BELUM' : '-')}</span></div>`; }).join('');

    // Notifikasi (Teks bulan SPP kini transparan 100% tanpa limitasi)
    const n = [];
    n.push(ts === 'hadir' ? { t: 'ok', a: `${s.name} hadir hari ini`, b: dayNames[today.getDay()] + ', ' + formatDateOnly(today.toISOString()) } : { t: 'warn', a: `Absensi hari ini belum tercatat`, b: 'Admin belum mencentang kehadiran hari ini.' });
    
    if (unp.length) n.push({ t: 'warn', a: `SPP belum dibayar: ${unp.join(', ')}`, b: 'Mohon hubungi pengurus TPA untuk pembayaran.' });
    else n.push({ t: 'ok', a: 'SPP tidak ada tunggakan', b: 'Terima kasih atas ketertiban pembayaran.' });

    [...window.publicTx].sort((x, y) => new Date(y.date) - new Date(x.date)).slice(0, 4).forEach(t => n.push({ t: 'info', a: `${t.type === 'masuk' ? 'Pemasukan' : 'Pengeluaran'} ${formatRp(t.amount)} · ${walletNames[t.wallet] || t.wallet}`, b: `${escapeHtml(t.desc)} — ${formatDetailDate(t.date)}` }));
    $('pubNotifList').innerHTML = n.map(x => `<div class="pub-notif ${x.t}"><b>${x.a}</b><span>${x.b}</span></div>`).join('');
    
    renderPublicHistory();
    
    // Injeksi render Target Dana di akhir proses sinkronisasi publik
    renderPublicWishlist();
}

// ==========================================
// GOOGLE LOGIN, OTP EMAILJS, RESET, NOTIF DEV
// ==========================================
$('btnRealGoogleLogin').addEventListener('click', async () => {
    const msg = $('googleAuthStatusMsg'); msg.innerText = "Memproses login ke Google..."; msg.style.color = 'var(--biru)';
    if (typeof window.supabase === 'undefined' || !sbClient || !navigator.onLine) { msg.innerText = "Gagal menyambung. Periksa koneksi internet."; msg.style.color = 'var(--merah-solid)'; return; }
    try { await sbClient.auth.signInWithOAuth({ provider: 'google', options: { redirectTo: window.location.origin + window.location.pathname } }); }
    catch (e) { msg.innerText = "Terjadi kesalahan sistem OAuth."; msg.style.color = 'var(--merah-solid)'; }
});

function startOTPResetProcess() {
    closeModal('actionPinModal');
    if (!profile.googleLinked || !profile.googleEmail) { showToast("Akun belum terhubung ke Cloud. Login Google dulu untuk memakai OTP.", "error"); return; }
    if (!navigator.onLine) { showToast("Butuh koneksi internet untuk mengirim OTP.", "error"); return; }
    $('displayUserEmail').innerText = profile.googleEmail; setTimeout(() => openModal('otpRequestModal'), 250);
}
function sendOTPEmail() {
    const btn = $('btnSendOTP'), reset = () => { btn.innerText = "Kirim Kode OTP"; btn.disabled = false; };
    if (typeof emailjs === 'undefined') { showToast("Layanan email belum termuat. Segarkan aplikasi lalu coba lagi.", "error"); return; }
    btn.innerText = "Mengirim..."; btn.disabled = true;
    generatedOTP = Math.floor(100000 + Math.random() * 900000).toString(); otpExpiryTime = Date.now() + 300000;
    emailjs.send(EMAILJS_SERVICE_ID, EMAILJS_TEMPLATE_ID, { to_email: profile.googleEmail, to_name: profile.name, otp_code: generatedOTP, email: profile.googleEmail, passcode: generatedOTP, time: new Date(otpExpiryTime).toLocaleTimeString('id-ID') }, EMAILJS_PUBLIC_KEY)
        .then(() => { showToast("Kode OTP terkirim ke email Anda. Berlaku 5 menit — cek juga folder Spam.", "success"); closeModal('otpRequestModal'); $('inputOTP').value = ''; $('inputNewPinOTP').value = ''; setTimeout(() => openModal('otpVerifyModal'), 250); reset(); })
        .catch(err => { showToast(`Gagal mengirim email${err && err.text ? ': ' + err.text : ''}. Periksa Service/Template ID EmailJS.`, "error"); reset(); });
}
async function verifyOTPAndSavePin() {
    const c = $('inputOTP').value.trim(), np = $('inputNewPinOTP').value.trim();
    if (Date.now() > otpExpiryTime) { showToast("OTP kedaluwarsa. Kirim ulang kode baru.", "error"); return; }
    if (!generatedOTP || c !== generatedOTP) { showToast("Kode OTP salah.", "error"); return; }
    if (!/^\d{4,6}$/.test(np)) { showToast("PIN baru harus 4-6 digit angka.", "error"); return; }
    profile.pin = await hashPIN(np); setLS('profile_secure_v47', JSON.stringify(profile));
    if (isCloudReady()) { try { await sbClient.from('profiles').upsert({ id: currentUser.id, data: profile }); } catch (e) {} }
    generatedOTP = ""; closeModal('otpVerifyModal'); showToast("PIN berhasil direset. Gunakan PIN baru Anda.");
}

function initResetSequence() {
    if (!profile.pin) { showToast("Buat PIN keamanan dulu di menu Edit Profil.", "error"); return; }
    closeModal('profileViewModal'); $('actionPinType').value = 'reset'; $('actionPinPayload').value = ''; $('inputActionPin').value = '';
    setTimeout(() => openModal('actionPinModal'), 250);
}
function executeFactoryReset() {
    openCustomConfirm("Reset Seluruh Database", "Semua transaksi, data murid, target dana, dan arsip akan dihapus permanen. Profil & tema tetap.", async () => {
        showToast("Membersihkan database...", "syncing");
        try { if (isCloudReady()) await sbClient.from('transactions').delete().eq('user_id', currentUser.id); } catch (e) {}
        db = []; sppData = []; pendingSync = []; wishlists = []; driveLinks = []; attendanceData = { lastReset: new Date().toISOString(), records: {} };
        ['cloud_db', 'cloud_db_fallback', 'guest_db', 'guest_db_fallback', 'spp_data_v47', 'attendance_data_v47', 'pending_sync', 'wishlists', 'drivelinks'].forEach(removeLS);
        updateUI(''); renderWishlist(); renderDriveLinks(); publishPublicSnapshot(); showToast("Reset selesai. Database kosong.");
    });
}

function triggerDevSupportNotification() {
    if (isPublicMode || document.hidden) return;
    const m = ["Aplikasi bermanfaat? Dukung developer lewat tombol 'Traktir Kopi' di menu profil ☕", "TPA Finance gratis tanpa iklan. Bantu biaya server & pengembangan lewat menu profil ❤️", "Terima kasih telah memakai TPA Finance. Dukungan Anda membuat aplikasi ini terus diperbarui 🙏"];
    showToast(m[Math.floor(Math.random() * m.length)], "support");
}

// ==========================================
// BOOT APLIKASI
// ==========================================
function bootApp() {
    checkAppVersion(); registerServiceWorker();
    const p = new URLSearchParams(window.location.search);
    if (p.get('view') === 'public') { isPublicMode = true; publicOwner = p.get('o'); initPublicPortal(); return; }

    migrateToScopedKeys(); loadScopedData(); db = loadLocalDB();
    initAppHeader(); renderShortcuts(); renderWishlist(); renderDriveLinks(); checkAttendanceReset(); updateUI(''); initPrayerTimes();

    if (APP_MODE === 'CLOUD') { currentUser = { id: 'offline_user', email: profile.googleEmail || 'Cloud User' }; updateNetworkStatus(navigator.onLine ? "Menyambungkan..." : "Offline (Cloud)", navigator.onLine ? "sync-pending" : "sync-offline"); }
    else { currentUser = null; updateNetworkStatus("Offline Mode (Guest)", "sync-offline"); }
    setTimeout(initSupabaseBackground, 500);

    setInterval(checkAttendanceReset, 60000);        // pantau pergantian hari 00:00 & reset Minggu
    setInterval(triggerDevSupportNotification, 180000);
    let lastPing = 0;                                // ping ringan agar Supabase tidak idle (maks 1x / 4 menit)
    document.body.addEventListener('click', () => {
        if (isCloudReady() && Date.now() - lastPing > 240000) { lastPing = Date.now(); try { sbClient.from('profiles').select('id').limit(1).then(() => {}); } catch (e) {} }
    });
}
bootApp();
