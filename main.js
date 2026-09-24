/* =========================================================
   TPA FINANCE v5.3 - ENTERPRISE CORE LOGIC (PART 1 / 3)
   Core State, Integrasi EmailJS, Scroll-Lock Modal, Auth & Profile
========================================================= */

"use strict";

const APP_VERSION = '5.3'; 
const LS_PREFIX = 'tpa_finance_v53_';

const SUPABASE_URL = 'https://ndsyyaxmiwskrkklseap.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5kc3l5YXhtaXdza3Jra2xzZWFwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODUxNDU4NjIsImV4cCI6MjEwMDcyMTg2Mn0.uXgAIhUjjkNpe9s6N6LGvRXZLUDQUZJrSfUFf1BDmKU';
const SECRET_KEY = "TPA_Finance_Secure_K3y_v53";

// Konfigurasi Kredensial EmailJS Baru
const EMAILJS_PUBLIC_KEY = "u7HQ-8xrDo99w3wmh"; 
const EMAILJS_SERVICE = "service_l08406o";
const EMAILJS_TEMPLATE = "template_osq8mgb";

// ==========================================
// STATE MANAGEMENT & VARIABLES
// ==========================================
let sbClient = null;
let db = []; 
let pendingSync = JSON.parse(getLS('pending_sync')) || []; 
let wishlists = JSON.parse(getLS('wishlists')) || [];
let driveLinks = JSON.parse(getLS('drivelinks')) || [];
let sppData = JSON.parse(getLS('spp_data')) || [];
let attendanceData = JSON.parse(getLS('attendance_data')) || { lastReset: new Date().toISOString(), records: {} };
let currentUser = null; 

let APP_MODE = getLS('app_mode') || 'GUEST';
let activeWallet = 'utama'; 
let currentTimeFilter = 365; 
let rawAmount = 0, editRawAmount = 0;
let pieChart, barChart, lineChart; 
let realTimeSubscription = null;
let aiMessages = [], aiCurrentMsgIdx = 0, aiCarouselInterval = null;
let generatedOTP = "", otpExpiryTime = 0;
let isPublicMode = false;
let scrollPosition = 0; // Engine untuk mencegah scroll melompat saat tutup modal

// Inisialisasi Profil (Perbaikan Bug "Memuat...")
const defaultProfile = { 
    name: 'Pengurus TPA', pin: '', 
    photo: 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAyNCAyNCIgZmlsbD0iIzIyYzU1ZSI+PHBhdGggZD0iTTEyIDJhNSA1IDAgMSAwIDUgNSBNMTIgMTRhNyA3IDAgMCAwLTcgN3YxSDE5di0xYTcgNyAwIDAgMC03LTdaIi8+PC9zdmc+', 
    joinDate: new Date().toISOString(), birthDate: '', gender: 'Rahasia', googleLinked: false, googleEmail: ''
};

let profile = JSON.parse(getLS('profile_secure'));
if (!profile || typeof profile.name === 'undefined') { 
    profile = { ...defaultProfile }; 
    setLS('profile_secure', JSON.stringify(profile)); 
}

const categories = { 
    masuk: ['Infak Santri', 'Infak Jumat', 'Donasi Masyarakat', 'Wakaf', 'Bantuan Pemerintah', 'Bantuan Masjid', 'Hibah', 'Donatur Tetap', 'Lainnya'], 
    keluar: ['Honor Guru', 'ATK', 'Al-Qur\'an', 'Buku Iqra\'', 'Snack Kegiatan', 'Listrik', 'Air', 'Kebersihan', 'Perbaikan Bangunan', 'Kegiatan Santri', 'Transportasi', 'Lainnya'] 
};
const monthsArr = ["Januari", "Februari", "Maret", "April", "Mei", "Juni", "Juli", "Agustus", "September", "Oktober", "November", "Desember"];

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
// UTILITIES & HELPERS
// ==========================================
function getLS(key) { return localStorage.getItem(LS_PREFIX + key); }
function setLS(key, val) { localStorage.setItem(LS_PREFIX + key, val); }
function removeLS(key) { localStorage.removeItem(LS_PREFIX + key); }

function formatRp(num) { return new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', minimumFractionDigits: 0 }).format(num); }
function formatRpPendek(num) { return formatRp(num).replace(/\.000$/, '...'); }
function formatDetailDate(iso) { 
    if(!iso) return '-'; 
    const d = new Date(iso);
    const days = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];
    const dayName = days[d.getDay()];
    return `${dayName}, ${String(d.getDate()).padStart(2,'0')}/${String(d.getMonth()+1).padStart(2,'0')}/${d.getFullYear()} - ${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`; 
}
function properTitleCase(str) { if(!str) return ""; return str.toLowerCase().replace(/\b\w/g, char => char.toUpperCase()); }

function getDynamicColor(categoryStr, type) {
    if (type === 'keluar') return '#ef4444'; 
    const inColors = { 'Wakaf': '#a855f7', 'Infak Santri': '#22c55e', 'Donasi Masyarakat': '#3b82f6', 'Bantuan Pemerintah': '#f59e0b', 'Hibah': '#22c55e' };
    if (inColors[categoryStr]) return inColors[categoryStr];
    let hash = 0; for(let i = 0; i < categoryStr.length; i++) hash = categoryStr.charCodeAt(i) + ((hash << 5) - hash);
    return `hsl(${Math.abs(hash) % 360}, 70%, 50%)`; 
}

async function hashPIN(pin) {
    if (!pin) return '';
    try {
        if (window.crypto && window.crypto.subtle && window.isSecureContext) {
            const msgBuffer = new TextEncoder().encode(pin); const hashBuffer = await crypto.subtle.digest('SHA-256', msgBuffer);
            return Array.from(new Uint8Array(hashBuffer)).map(b => b.toString(16).padStart(2, '0')).join('');
        } else if (typeof CryptoJS !== 'undefined') { return CryptoJS.SHA256(pin).toString(CryptoJS.enc.Hex); } else { return btoa(pin); }
    } catch (e) { return btoa(pin); }
}

// Upgrade Toast: Durasi lebih lama (8s) dan Apple Style Blur terintegrasi
function showToast(msg, type = 'success') { 
    const box = document.getElementById('toastBox'); if(!box) return; 
    const t = document.createElement('div'); t.className = `toast ${type}`; 
    // Apple-style transparent blur effect di-trigger melalui CSS custom ini
    t.style.backdropFilter = "blur(20px)";
    t.style.webkitBackdropFilter = "blur(20px)";
    t.style.background = "rgba(10, 20, 15, 0.75)";
    t.innerHTML = msg; box.appendChild(t); 
    setTimeout(() => t.classList.add('show'), 10); 
    setTimeout(() => { t.classList.remove('show'); setTimeout(() => t.remove(), 400); }, 8000); // 8 Detik agar terbaca
}

function refreshApp() {
    showToast("Mempersiapkan penyegaran aplikasi...", "syncing");
    setTimeout(() => {
        window.location.reload();
    }, 800);
}

// ==========================================
// Z-INDEX MODAL ENGINE (Anti Overlap Multi-Layer & Fix Scroll Bug)
// ==========================================
let modalStack = [];
function openModal(id) {
    const el = document.getElementById(id);
    if (!el) return;
    
    // Kunci posisi scroll saat ini agar body tidak terlempar ke atas
    if (modalStack.length === 0) {
        scrollPosition = window.pageYOffset || document.documentElement.scrollTop;
        document.body.style.top = `-${scrollPosition}px`;
    }

    const baseZIndex = 10000;
    const currentZIndex = baseZIndex + (modalStack.length * 20);
    
    el.style.zIndex = currentZIndex;
    el.classList.add('active');
    
    if (!modalStack.includes(id)) { modalStack.push(id); }
    document.body.classList.add('modal-open');
}

function closeModal(id) {
    document.querySelectorAll('.custom-options.open').forEach(e => e.classList.remove('open'));
    if (!id) return;

    const el = document.getElementById(id);
    if (el) { el.classList.remove('active'); }
    
    modalStack = modalStack.filter(modalId => modalId !== id);
    if (modalStack.length === 0) {
        document.body.classList.remove('modal-open');
        // Kembalikan posisi scroll ke titik semula dengan halus
        document.body.style.top = '';
        window.scrollTo({ top: scrollPosition, behavior: 'instant' });
    }
}

function openCustomConfirm(title, desc, action) { 
    document.getElementById('confirmTitle').innerText = title; 
    document.getElementById('confirmDesc').innerHTML = desc; 
    window.confirmActionStep1 = action; 
    openModal('confirmModal'); 
}
document.getElementById('btnConfirmYes').addEventListener('click', () => { 
    closeModal('confirmModal');
    setTimeout(() => { openModal('confirmModal2'); }, 350); 
});
document.getElementById('btnConfirmYes2').addEventListener('click', () => { 
    if(window.confirmActionStep1) window.confirmActionStep1(); 
    closeModal('confirmModal2'); 
});

// ==========================================
// DATABASE ENGINE & ENCRYPTION
// ==========================================
function getDBKey() { return APP_MODE === 'CLOUD' ? LS_PREFIX + 'cloud_db' : LS_PREFIX + 'guest_db'; }

function saveLocalDB(dataToSave) {
    const dbKey = getDBKey();
    try {
        if (typeof CryptoJS !== 'undefined') {
            const ciphertext = CryptoJS.AES.encrypt(JSON.stringify(dataToSave), SECRET_KEY).toString();
            localStorage.setItem(dbKey, ciphertext);
        } else { localStorage.setItem(dbKey + '_fallback', JSON.stringify(dataToSave)); }
    } catch(e) {}
}

function loadLocalDB() {
    const dbKey = getDBKey(); let data = [];
    try {
        const ciphertext = localStorage.getItem(dbKey);
        if (ciphertext) { data = JSON.parse(CryptoJS.AES.decrypt(ciphertext, SECRET_KEY).toString(CryptoJS.enc.Utf8)); } 
        else { const fallback = localStorage.getItem(dbKey + '_fallback'); if (fallback) data = JSON.parse(fallback); }
    } catch (e) { }
    return Array.isArray(data) ? data : [];
}

// ==========================================
// TEMA ENGINE (SMOOTH RADIAL & RETENTION)
// ==========================================
const iconSun = `<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="5"/><path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42"/></svg>`;
const iconMoon = `<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>`;
const savedTheme = localStorage.getItem('global_tpa_theme') || 'dark'; // Menggunakan global item agar tidak kena imbas LS_PREFIX versi
document.documentElement.setAttribute('data-theme', savedTheme);
window.addEventListener('DOMContentLoaded', () => { updateThemeIcon(savedTheme); document.getElementById('metaThemeColor').setAttribute("content", savedTheme === 'light' ? "#059669" : "#05140d"); });

function toggleTheme(e) {
    const layer = document.getElementById('themeTransitionLayer');
    if (e && e.currentTarget) {
        const rect = e.currentTarget.getBoundingClientRect();
        const x = rect.left + rect.width / 2;
        const y = rect.top + rect.height / 2;
        layer.style.setProperty('--ripple-x', `${x}px`);
        layer.style.setProperty('--ripple-y', `${y}px`);
    } else {
        layer.style.setProperty('--ripple-x', `50%`);
        layer.style.setProperty('--ripple-y', `50%`);
    }

    document.body.classList.remove('theme-fade-out');
    document.body.classList.add('theme-animating');
    
    setTimeout(() => {
        const htmlEl = document.documentElement; const currentTheme = htmlEl.getAttribute('data-theme') || 'dark';
        const newTheme = currentTheme === 'dark' ? 'light' : 'dark'; 
        htmlEl.setAttribute('data-theme', newTheme); 
        localStorage.setItem('global_tpa_theme', newTheme); 
        updateThemeIcon(newTheme);
        
        document.getElementById('metaThemeColor').setAttribute("content", newTheme === 'light' ? "#059669" : "#05140d");
        if(typeof updateUI === "function") updateUI(document.getElementById('searchTxInput') ? document.getElementById('searchTxInput').value : '');
        
        document.body.classList.add('theme-fade-out');
    }, 450); 

    setTimeout(() => { document.body.classList.remove('theme-animating', 'theme-fade-out'); }, 850);
}

function updateThemeIcon(theme) { 
    const btn = document.getElementById('theme-icon'); if (!btn) return; 
    if (theme === 'light') { btn.innerHTML = iconMoon; } else { btn.innerHTML = iconSun; } 
}
// ==========================================
// PRAYER TIMES (LIVE GPS ENGINE)
// ==========================================
let prayerRetryInterval = null;

async function initPrayerTimesLive() {
    const pText = document.getElementById('prayerLocationText');
    const pGrid = document.getElementById('prayerTimesGrid');
    if(!pText || !pGrid) return;

    const todayStr = new Date().toISOString().split('T')[0];
    const cached = JSON.parse(getLS('prayer_cache') || 'null');

    // Tampilkan cache agar jadwal tidak kosong mendadak saat refresh
    if (cached && cached.date === todayStr && cached.timings) {
        renderPrayerUI(cached);
    }

    const fetchLocation = () => {
        if (navigator.geolocation) {
            navigator.geolocation.getCurrentPosition(async (pos) => {
                if (prayerRetryInterval) clearInterval(prayerRetryInterval); // Stop auto-retry jika sukses terkunci
                const lat = pos.coords.latitude;
                const lon = pos.coords.longitude;
                try {
                    const res = await fetch(`https://api.aladhan.com/v1/timings?latitude=${lat}&longitude=${lon}&method=11`);
                    const data = await res.json();
                    
                    if(data && data.data) {
                        const pt = data.data.timings;
                        const newCache = {
                            date: todayStr,
                            location: "Lokasi GPS Terkunci",
                            timings: [
                                { n: 'Subuh', t: pt.Fajr },
                                { n: 'Dzuhur', t: pt.Dhuhr },
                                { n: 'Ashar', t: pt.Asr },
                                { n: 'Maghrib', t: pt.Maghrib },
                                { n: 'Isya', t: pt.Isha }
                            ]
                        };
                        setLS('prayer_cache', JSON.stringify(newCache));
                        renderPrayerUI(newCache);
                    }
                } catch(e) {
                    pText.innerText = "Gagal memuat API...";
                }
            }, (err) => {
                pText.innerText = "Akses GPS Ditolak / Mati";
                // Auto-Retry setiap 8 detik jika GPS mati lalu dihidupkan (Tanpa perlu refresh page)
                if(!prayerRetryInterval) {
                    prayerRetryInterval = setInterval(fetchLocation, 8000);
                }
            }, { enableHighAccuracy: true, timeout: 5000 });
        } else {
            pText.innerText = "Perangkat Tidak Mendukung GPS";
        }
    };

    fetchLocation();
}

function renderPrayerUI(data) {
    const pText = document.getElementById('prayerLocationText');
    const pDate = document.getElementById('prayerDateText');
    const pGrid = document.getElementById('prayerTimesGrid');
    
    if(pText) pText.innerText = data.location || "Lokasi Anda";
    if(pDate) pDate.innerText = data.date;
    
    if(pGrid && data.timings) {
        pGrid.innerHTML = data.timings.map(p => `
            <div class="prayer-item">
                <span class="p-name">${p.n}</span>
                <span class="p-time">${p.t}</span>
            </div>
        `).join('');
    }
}

// ==========================================
// INITIALIZATION & CLOUD SYNC ENGINE
// ==========================================
function checkAppVersion() {
    const savedVersion = getLS('app_version');
    if (savedVersion !== APP_VERSION) {
        setLS('app_version', APP_VERSION);
        if (navigator.onLine) {
            const updateScreen = document.getElementById('updateScreen');
            if (updateScreen) { updateScreen.style.display = 'flex'; setTimeout(() => { window.location.reload(true); }, 2000); }
        }
    }
}

function bootApp() {
    checkAppVersion();
    
    // Router - Deteksi parameter link transparansi publik
    const urlParams = new URLSearchParams(window.location.search);
    if (urlParams.get('view') === 'public') {
        isPublicMode = true;
        if (typeof initPublicPortal === 'function') initPublicPortal(); // Terhubung di Part 3
        return;
    }

    // Router Admin
    db = loadLocalDB(); 
    initAppHeader();
    if (typeof renderShortcuts === 'function') renderShortcuts();
    if (typeof renderWishlist === 'function') renderWishlist();
    if (typeof renderDriveLinks === 'function') renderDriveLinks();
    if (typeof checkAttendanceReset === 'function') checkAttendanceReset();
    if (typeof updateUI === 'function') updateUI('');
    initPrayerTimesLive(); // Inisiasi GPS Engine

    const netStatus = document.getElementById('networkStatus');
    if (APP_MODE === 'CLOUD') {
        currentUser = { id: 'offline_user', email: profile.googleEmail || 'Cloud User' }; 
        if(netStatus) { netStatus.innerText = navigator.onLine ? "Menyambungkan..." : "Offline (Cloud)"; netStatus.className = navigator.onLine ? "status-sync sync-pending" : "status-sync sync-offline"; }
    } else {
        currentUser = null;
        if(netStatus) { netStatus.innerText = "Offline Mode (Guest)"; netStatus.className = "status-sync sync-offline"; }
    }
    
    setTimeout(initSupabaseBackground, 500);
}

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
                if(typeof fetchUserTransactions === 'function') fetchUserTransactions(); 
                if(typeof setupRealtime === 'function') setupRealtime();
                if (pendingSync.length > 0 && typeof processPendingSync === 'function') processPendingSync();
            } else { forceLogoutToGuest(); }
        } catch(err) { updateNetworkStatus("Server Lambat / Gangguan", "sync-offline"); }
    }

    if (!window.supabaseListenerAdded) {
        window.supabaseListenerAdded = true;
        sbClient.auth.onAuthStateChange(async (event, currentSession) => {
            if (event === 'SIGNED_OUT') { forceLogoutToGuest(); } 
            else if (event === 'SIGNED_IN' && currentSession) {
                currentUser = currentSession.user; APP_MODE = 'CLOUD'; setLS('app_mode', 'CLOUD');
                updateNetworkStatus("Online Mode (Cloud)", "sync-online");
                
                try {
                    const { data: profileData } = await sbClient.from('profiles').select('data').eq('id', currentUser.id).single();
                    if (profileData && profileData.data) { profile = { ...profile, ...profileData.data }; } 
                    else { 
                        if(profile.name === 'Pengurus' || profile.name === 'Pengurus TPA') profile.name = properTitleCase(currentUser.user_metadata?.full_name) || 'Member TPA'; 
                        profile.photo = currentUser.user_metadata?.avatar_url || profile.photo; 
                        await sbClient.from('profiles').upsert({ id: currentUser.id, data: profile });
                    }
                } catch(e) {}
                
                profile.googleLinked = true; profile.googleEmail = currentUser.email; 
                setLS('profile_secure', JSON.stringify(profile));
                
                db = loadLocalDB(); initAppHeader(); 
                if(typeof renderShortcuts === 'function') renderShortcuts(); 
                if(typeof fetchUserTransactions === 'function') fetchUserTransactions(); 
                if(typeof setupRealtime === 'function') setupRealtime(); 
                
                closeModal('googleAuthModal');
                if (navigator.onLine && pendingSync.length > 0 && typeof processPendingSync === 'function') processPendingSync();
            }
        });
    }
}

function updateNetworkStatus(text, statusClass) {
    const netStatus = document.getElementById('networkStatus');
    if(netStatus) { 
        netStatus.innerText = text; 
        netStatus.className = `status-sync ${statusClass}`; 
    }
}

function forceLogoutToGuest() {
    currentUser = null; APP_MODE = 'GUEST'; setLS('app_mode', 'GUEST');
    profile = { ...defaultProfile }; setLS('profile_secure', JSON.stringify(profile));
    removeLS('cloud_db'); removeLS('cloud_db_fallback'); db = loadLocalDB(); 
    initAppHeader(); 
    if(typeof renderShortcuts === 'function') renderShortcuts(); 
    if(typeof updateUI === 'function') updateUI(''); 
    showToast("Berhasil Logout / Sesi Berakhir.", "success"); closeModal('profileViewModal');
    updateNetworkStatus(navigator.onLine ? "Online Mode (Guest)" : "Offline Mode (Guest)", navigator.onLine ? "sync-online" : "sync-offline");
}

// ==========================================
// EMAILJS OTP SYSTEM (Integrasi Modul)
// ==========================================
function startOTPResetProcess() { 
    closeModal('actionPinModal'); 
    if(!profile.googleLinked || !profile.googleEmail) { showToast("Gagal: Akun belum terhubung ke Google Cloud!", "error"); return; } 
    if(!navigator.onLine) { showToast("Gagal: Membutuhkan koneksi internet!", "error"); return; } 
    document.getElementById('displayUserEmail').innerText = profile.googleEmail; 
    openModal('otpRequestModal'); 
}

function sendOTPEmail() { 
    const btn = document.getElementById('btnSendOTP'); 
    btn.innerText = "Transmisi Berjalan..."; btn.disabled = true; 
    generatedOTP = Math.floor(100000 + Math.random() * 900000).toString(); 
    otpExpiryTime = Date.now() + 300000; // Kadaluarsa 5 Menit
    
    if (typeof emailjs !== 'undefined') {
        emailjs.send(EMAILJS_SERVICE, EMAILJS_TEMPLATE, { 
            to_email: profile.googleEmail, 
            to_name: profile.name, 
            otp_code: generatedOTP 
        }).then(() => { 
            showToast("Kode Autentikasi Terkirim ke Email!"); 
            closeModal('otpRequestModal'); 
            openModal('otpVerifyModal'); 
            btn.innerText="Sematkan Transmisi Data"; btn.disabled=false; 
        }).catch(() => { 
            showToast("Gagal. Verifikasi ID Public / Template EmailJS Anda.", "error"); 
            btn.innerText="Sematkan Transmisi Data"; btn.disabled=false; 
        }); 
    } else {
        showToast("Modul Layanan Email Terputus.", "error"); 
        btn.innerText="Sematkan Transmisi Data"; btn.disabled=false;
    }
}

async function verifyOTPAndSavePin() { 
    const c = document.getElementById('inputOTP').value; const np = document.getElementById('inputNewPinOTP').value; 
    if(Date.now() > otpExpiryTime) { showToast("Sesi OTP telah kadaluarsa!", "error"); return; } 
    if(c !== generatedOTP) { showToast("Kode OTP tidak valid!", "error"); return; } 
    if(np.length < 4) { showToast("Keamanan PIN minimal 4 angka!", "error"); return; } 
    
    profile.pin = await hashPIN(np); 
    setLS('profile_secure', JSON.stringify(profile)); 
    if(APP_MODE === 'CLOUD' && sbClient && currentUser && currentUser.id !== 'offline_user') {
        sbClient.from('profiles').upsert({ id: currentUser.id, data: profile });
    }
    
    generatedOTP = ""; 
    closeModal('otpVerifyModal'); 
    showToast("Kredensial PIN Berhasil Direset!"); 
}

// ==========================================
// UI & NAVIGATION ENGINE (Visual Core)
// ==========================================
function initAppHeader() { 
    document.getElementById('headName').innerText = formatSmartName(profile.name); 
    document.getElementById('headGender').innerText = profile.gender || 'Rahasia'; 
    document.getElementById('headProfileImg').src = profile.photo; 
}

function formatSmartName(name) { 
    if (!name) return name; 
    if (window.innerWidth > 400) return name; 
    if (name.length > 12) { let words = name.trim().split(/\s+/); if (words.length > 1) { let lastWord = words.pop(); return words.join(' ') + ' ' + lastWord.charAt(0).toUpperCase() + '.'; } } 
    return name; 
}

function switchWallet(type) { 
    activeWallet = type; 
    document.getElementById('walletSwitchContainer').setAttribute('data-active', type); 
    document.querySelectorAll('.btn-tab').forEach(b => b.classList.remove('active')); 
    document.getElementById(`tab-${type}`).classList.add('active'); 
    if (typeof renderShortcuts === 'function') renderShortcuts(); 
    if (typeof updateUI === 'function') updateUI(document.getElementById('searchTxInput') ? document.getElementById('searchTxInput').value : ''); 
}

function updateHealthEngine(filteredDb) { 
    let tIn = 0, tOut = 0; filteredDb.forEach(t => { if(t.type === 'masuk') tIn += t.amount; else tOut += t.amount; }); 
    let balance = tIn - tOut; const badge = document.getElementById('healthBadge'); const text = document.getElementById('healthText'); 
    if(!badge || !text) return;
    badge.className = 'health-badge glass-card'; 
    if (tIn === 0 && tOut === 0) { badge.classList.add('health-netral'); text.innerText = 'NETRAL'; } 
    else if (balance < 0) { badge.classList.add('health-defisit'); text.innerText = 'DEFISIT'; } 
    else if (balance >= 0 && balance <= 50000) { badge.classList.add('health-kritis'); text.innerText = 'KRITIS'; } 
    else { if (tOut > (tIn * 0.8)) { badge.classList.add('health-waspada'); text.innerText = 'WASPADA'; } else { badge.classList.add('health-sehat'); text.innerText = 'SEHAT'; } } 
    generateAIForecast(filteredDb); 
}

function generateAIForecast(data) { 
    const box = document.getElementById('aiInsightBox'); const textEl = document.getElementById('aiInsightText'); aiMessages = []; 
    if(!box || !textEl) return;
    if (data.length === 0) { 
        aiMessages.push(`Belum ada riwayat transaksi di dompet ${activeWallet.toUpperCase()}.`);
        if(APP_MODE === 'GUEST') aiMessages.push("Saran: Hubungkan Akun Google agar data TPA aman di Cloud.");
        box.style.borderLeftColor = 'var(--text-muted)'; box.querySelector('svg').style.color = 'var(--text-muted)'; startAICarousel(textEl); return; 
    } 

    const today = new Date(); const currentMonthData = data.filter(t => { const d = new Date(t.date); return d.getMonth() === today.getMonth() && d.getFullYear() === today.getFullYear(); }); 
    const masukData = currentMonthData.filter(t => t.type === 'masuk'); const keluarData = currentMonthData.filter(t => t.type === 'keluar'); 
    let mIn = masukData.reduce((sum, t) => sum + t.amount, 0); let mOut = keluarData.reduce((sum, t) => sum + t.amount, 0); 

    let biggestExpenseMsg = "Pengeluaran bulan ini masih terkendali.";
    if (keluarData.length > 0) { let catTotals = {}; keluarData.forEach(t => { catTotals[t.category] = (catTotals[t.category] || 0) + t.amount; }); let biggestCat = Object.keys(catTotals).reduce((a, b) => catTotals[a] > catTotals[b] ? a : b); biggestExpenseMsg = `Pengeluaran terbesar bulan ini: ${properTitleCase(biggestCat)} (${formatRp(catTotals[biggestCat])}).`; }

    let statusMsg = "", projectionMsg = "";
    if (mOut > mIn && mIn > 0) { statusMsg = `⚠️ Peringatan: Pengeluaran dompet ${activeWallet} bulan ini melampaui pemasukan.`; projectionMsg = "Saran AI: Tinjau ulang anggaran operasional TPA atau tarik dari Dana Darurat."; box.style.borderLeftColor = 'var(--merah-solid)'; box.querySelector('svg').style.color = 'var(--merah-solid)'; } 
    else if (mOut > 0) { statusMsg = `Arus kas dompet ${activeWallet} berjalan normal.`; projectionMsg = "Tetap pantau alokasi dana agar sejalan dengan program kegiatan santri."; box.style.borderLeftColor = 'var(--kuning)'; box.querySelector('svg').style.color = 'var(--kuning)'; } 
    else if (mIn > 0 && mOut === 0) { statusMsg = "Luar biasa! Seluruh dana pemasukan bulan ini masih utuh."; projectionMsg = "Tips: Dana bisa dialokasikan untuk Dana Darurat atau perbaikan fasilitas."; box.style.borderLeftColor = 'var(--hijau-terang)'; box.querySelector('svg').style.color = 'var(--hijau-terang)'; } 
    else { statusMsg = "Belum ada pergerakan kas bulan ini."; projectionMsg = "Selalu rutin mencatat donasi/infak yang masuk setiap harinya."; box.style.borderLeftColor = 'var(--biru)'; box.querySelector('svg').style.color = 'var(--biru)';}

    aiMessages.push(statusMsg); aiMessages.push(projectionMsg); aiMessages.push(biggestExpenseMsg);
    if(activeWallet === 'wakaf') aiMessages.push("Catatan Kritis: Pastikan dana Wakaf tidak disalahgunakan untuk operasional harian.");
    aiMessages = [...new Set(aiMessages)].filter(m => m !== ""); startAICarousel(textEl); 
}

function startAICarousel(textEl) { 
    if (aiCarouselInterval) clearInterval(aiCarouselInterval); aiCurrentMsgIdx = 0; textEl.innerText = aiMessages[0]; textEl.classList.remove('fade-out'); 
    if (aiMessages.length > 1) { 
        aiCarouselInterval = setInterval(() => { 
            textEl.classList.add('fade-out'); 
            setTimeout(() => { 
                aiCurrentMsgIdx = (aiCurrentMsgIdx + 1) % aiMessages.length; 
                textEl.innerText = aiMessages[aiCurrentMsgIdx]; 
                textEl.classList.remove('fade-out'); 
            }, 400); 
        }, 8000); 
    } 
}

function toggleCustomSelect(id) { 
    const box = document.getElementById(id); 
    const isOpen = box.classList.contains('open'); 
    document.querySelectorAll('.custom-options.open').forEach(el => el.classList.remove('open')); 
    if(!isOpen) box.classList.add('open'); 
}

function applyTimeFilter(days, labelText) { 
    currentTimeFilter = days; 
    document.getElementById('dispTimeFilter').innerText = labelText; 
    closeModal(''); 
    if (typeof updateUI === 'function') updateUI(document.getElementById('searchTxInput') ? document.getElementById('searchTxInput').value : ''); 
}

function toggleSection(sec, icn) { 
    document.getElementById(sec).classList.toggle('hidden'); 
    document.getElementById(icn).classList.toggle('rotated'); 
}

// ==========================================
// CORE UI RENDER (TABLE, CHARTS, RECEIPT)
// ==========================================
function updateUI(searchTerm = '') {
    const today = new Date(); today.setHours(0,0,0,0);
    const fd = db.filter(tx => { 
        if(tx.wallet !== activeWallet) return false; 
        let txDate = new Date(tx.date); txDate.setHours(0,0,0,0);
        if(currentTimeFilter !== 0) { 
            const diffTime = Math.abs(today - txDate);
            const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)); 
            if(currentTimeFilter === 1 && diffDays > 1) return false; 
            if(currentTimeFilter > 1 && diffDays > currentTimeFilter) return false; 
        } 
        if(searchTerm) { return tx.desc.toLowerCase().includes(searchTerm) || tx.category.toLowerCase().includes(searchTerm) || (tx.pihak_terkait && tx.pihak_terkait.toLowerCase().includes(searchTerm)); } 
        return true; 
    });

    updateHealthEngine(fd);
    let m = 0, k = 0; fd.forEach(t => { if(t.type === 'masuk') m += t.amount; else k += t.amount; });
    const dispSaldo = document.getElementById('disp-saldo'); if(dispSaldo) { dispSaldo.setAttribute('data-short', formatRpPendek(m - k)); dispSaldo.setAttribute('data-full', formatRp(m - k)); }
    const dispMasuk = document.getElementById('disp-masuk'); if(dispMasuk) { dispMasuk.setAttribute('data-short', formatRpPendek(m)); dispMasuk.setAttribute('data-full', formatRp(m)); }
    const dispKeluar = document.getElementById('disp-keluar'); if(dispKeluar) { dispKeluar.setAttribute('data-short', formatRpPendek(k)); dispKeluar.setAttribute('data-full', formatRp(k)); }

    renderTable(fd, false); renderCharts(fd);
}

function renderTable(data, isPublic = false) {
    const t = isPublic ? document.getElementById('public-table-body') : document.getElementById('table-body');
    if(!t) return;
    if(data.length === 0) { t.innerHTML = `<tr><td colspan="5" style="text-align:center; padding: 30px; color:var(--text-muted);">Data transaksi kosong.</td></tr>`; return; }

    let htmlStr = '';
    [...data].sort((a,b) => new Date(b.date) - new Date(a.date)).forEach(tx => {
        const iM = tx.type === 'masuk';
        let linkHtml = tx.link_bukti ? `<a href="${tx.link_bukti}" target="_blank" rel="noopener" style="color:var(--biru); font-size:11px; font-weight:800; text-decoration:underline; display:block; margin-top:4px;" onclick="event.stopPropagation()">↗ Buka Dokumen Drive</a>` : '';
        let pihakHtml = tx.pihak_terkait ? `<br><span style="font-size:11px; color:var(--text-muted); border: 1px solid var(--border); padding: 2px 6px; border-radius: 6px; display: inline-block; margin-top: 4px;">Pihak: <b class="text-neutral">${tx.pihak_terkait}</b></span>` : '';

        let aksiHtml = isPublic ? '' : `
            <td style="vertical-align:middle; text-align:center; padding-right:15px; width:1%;" class="aksi-col">
                <div style="display:flex; gap:8px; justify-content:center;">
                    <button type="button" class="btn-icon-neutral" onclick="promptActionPinFromTable(event, 'edit', '${tx.id || tx.date}')">${svgs.edit}</button>
                    <button type="button" class="btn-icon-danger" onclick="promptActionPinFromTable(event, 'delete', '${tx.id || tx.date}')">${svgs.trash}</button>
                </div>
            </td>
        `;

        htmlStr += `<tr class="clickable-row" onclick="openReceipt('${tx.id || tx.date}')">
            <td style="color:var(--text-muted); font-size:11px; vertical-align:middle; line-height: 1.6;">${formatDetailDate(tx.date).split(' - ')[0]}<br><b style="color:var(--teks-netral);">${formatDetailDate(tx.date).split(' - ')[1]}</b></td>
            <td style="width:1%; white-space:nowrap; padding:15px 10px; vertical-align:middle;"><div class="badge-cat" style="border-color:${getDynamicColor(tx.category, tx.type)}; color:${getDynamicColor(tx.category, tx.type)};">${tx.category}</div></td>
            <td style="vertical-align:middle; width:100%;"><span class="text-neutral" style="font-weight:700;">${tx.desc}</span>${pihakHtml}${linkHtml}</td>
            ${aksiHtml}
            <td class="amt-cell ${iM?'amt-in':'amt-out'}" style="vertical-align:middle; text-align:right; padding-left:0;">${iM?'+':'-'}${formatRp(tx.amount)}</td>
        </tr>`;
    });
    t.innerHTML = htmlStr;
}

function renderCharts(data) {
    if (typeof Chart === 'undefined') return;
    if (!document.getElementById('pieChart')) return; 
    Chart.defaults.color = '#8ba898'; Chart.defaults.font.family = 'Inter';
    if(data.length === 0) { if(pieChart) pieChart.destroy(); if(barChart) barChart.destroy(); if(lineChart) lineChart.destroy(); return; }

    const gridLineColor = 'rgba(139, 168, 152, 0.1)';
    const cA = {}; data.forEach(t => { const k = `${t.category}`; if(cA[k]) cA[k].a += t.amount; else cA[k] = { a: t.amount, color: getDynamicColor(t.category, t.type) }; }); 
    const pL = Object.keys(cA);

    if(pieChart) pieChart.destroy(); 
    pieChart = new Chart(document.getElementById('pieChart'), { type: 'doughnut', data: { labels: pL, datasets: [{ data: pL.map(l => cA[l].a), backgroundColor: pL.map(l => cA[l].color), borderWidth: 0 }] }, options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } } } });

    const rT = [...data].sort((a,b) => new Date(a.date) - new Date(b.date)).slice(-15);
    if(barChart) barChart.destroy(); 
    barChart = new Chart(document.getElementById('barChart'), { type: 'bar', data: { labels: rT.map(t => t.desc.substring(0,8)), datasets: [{ data: rT.map(t => t.type === 'masuk' ? t.amount : -t.amount), backgroundColor: rT.map(t => getDynamicColor(t.category, t.type)), borderRadius: 4 }] }, options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: { x: { display: false }, y: { grid: { color: gridLineColor } } } } });

    let cI = 0, cO = 0, hI = [], hO = []; 
    [...data].sort((a,b)=> new Date(a.date)-new Date(b.date)).forEach(t => { if(t.type === 'masuk') cI += t.amount; else cO += t.amount; hI.push(cI); hO.push(cO); });
    if(lineChart) lineChart.destroy(); 
    lineChart = new Chart(document.getElementById('lineChart'), { type: 'line', data: { labels: hI.map((_,i)=> `T${i+1}`), datasets: [{ label: 'Pemasukan Total', data: hI, borderColor: '#34d399', backgroundColor: 'rgba(52, 211, 153, 0.1)', fill: true, pointRadius: 2, tension: 0.4 }, { label: 'Pengeluaran Total', data: hO, borderColor: '#ef4444', backgroundColor: 'rgba(239, 68, 68, 0.1)', fill: true, pointRadius: 2, tension: 0.4 }] }, options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: { x: { display: false }, y: { grid: { color: gridLineColor } } } } });
}

function openReceipt(txId) { 
    const strTxId = String(txId); const tx = db.find(t => String(t.id) === strTxId || String(t.date) === strTxId); if(!tx) return; 
    const rDate = formatDetailDate(tx.date); const rId = "TRX-" + new Date(tx.date).getTime().toString().slice(-8); 
    const rType = tx.type === 'masuk' ? 'Pemasukan' : 'Pengeluaran';
    const cColor = getDynamicColor(tx.category, tx.type);
    
    document.getElementById('receiptContent').innerHTML = ` 
        <div class="receipt-head"><h3 style="margin:0 0 5px 0;" class="text-neutral">BUKTI MUTASI KAS TPA</h3><span style="font-size:11px; color:var(--text-muted); letter-spacing: 1px;">ID: ${rId}</span></div> 
        <div class="receipt-row"><span class="receipt-label">Waktu</span><span class="receipt-val text-neutral">${rDate}</span></div> 
        <div class="receipt-row"><span class="receipt-label">Dompet Kas</span><span class="receipt-val text-neutral" style="text-transform:capitalize;">${tx.wallet}</span></div> 
        <div class="receipt-row"><span class="receipt-label">Kategori</span><span class="receipt-val" style="color:${cColor}; font-weight:900;">${tx.category}</span></div> 
        <div class="receipt-row"><span class="receipt-label">Sifat Mutasi</span><span class="receipt-val text-neutral">${rType}</span></div> 
        <div class="receipt-row"><span class="receipt-label">Keterangan</span><span class="receipt-val text-neutral" style="white-space:normal!important; text-align:right;">${tx.desc}</span></div> 
        ${tx.pihak_terkait ? `<div class="receipt-row"><span class="receipt-label">Pihak Terkait</span><span class="receipt-val text-neutral">${tx.pihak_terkait}</span></div>` : ''} 
        ${tx.link_bukti ? `<div class="receipt-row" style="margin-top:10px;"><span class="receipt-label" style="color:var(--text-muted);">Lampiran Drive</span><span class="receipt-val"><a href="${tx.link_bukti}" target="_blank" rel="noopener" style="color:var(--biru); text-decoration:underline;">Buka Dokumen ↗</a></span></div>` : ''} 
        <div class="receipt-row" style="margin-top:25px; border-top:2px dashed var(--border); padding-top:20px; align-items: flex-end; flex-wrap: nowrap !important;"> 
            <span class="receipt-label" style="font-size:14px; color:var(--text-muted); flex-shrink: 0;">TOTAL MUTASI</span> 
            <span class="receipt-val ${tx.type==='masuk'?'amt-in':'amt-out'}" style="font-size: clamp(18px, 5.5vw, 24px); letter-spacing:-1px; white-space: nowrap !important; word-break: keep-all !important; flex-grow: 1; text-align: right;">${formatRp(tx.amount)}</span> 
        </div> 
    `; 
    openModal('receiptModal'); 
}

// ==========================================
// ADMIN: SPP & ABSENSI ENGINE (Daily Builder & Tick)
// ==========================================
function openSppAbsenModal() { openModal('sppAbsenModal'); renderAdminStudentTable(); }

function registerStudent() {
    const input = document.getElementById('newStudentName'); const name = properTitleCase(input.value.trim());
    if (!name) { showToast("Nama murid wajib diisi", "error"); return; }
    sppData.push({ id: Date.now().toString(), name: name, months: [], presentToday: false, attendLogs: [] });
    setLS('spp_data', JSON.stringify(sppData)); input.value = ''; renderAdminStudentTable(); showToast("Murid terdaftar", "success");
}

function deleteStudentAdmin(id) { 
    openCustomConfirm("Hapus Murid Permanen", "Seluruh rekam jejak SPP & Absensi murid ini akan ditiadakan.", () => {
        sppData = sppData.filter(s => s.id !== id); setLS('spp_data', JSON.stringify(sppData)); renderAdminStudentTable(); showToast("Murid Dihapus", "success");
    });
}

function openEditStudentModal(id) {
    const s = sppData.find(x => x.id === id); if(!s) return;
    document.getElementById('editStudentTargetId').value = id;
    document.getElementById('editStudentNameInput').value = s.name;
    openModal('editStudentModal');
}
function saveEditStudentName() {
    const id = document.getElementById('editStudentTargetId').value;
    const newName = properTitleCase(document.getElementById('editStudentNameInput').value.trim());
    if(!newName) return;
    const sIdx = sppData.findIndex(x => x.id === id);
    if(sIdx > -1) {
        sppData[sIdx].name = newName; setLS('spp_data', JSON.stringify(sppData)); closeModal('editStudentModal'); renderAdminStudentTable(); showToast("Identitas Diperbarui");
    }
}

function renderAdminStudentTable() {
    const tbody = document.getElementById('adminStudentTableBody');
    if (!tbody) return;
    if (sppData.length === 0) { tbody.innerHTML = `<tr><td colspan="5" style="text-align:center; padding:20px; color:var(--text-muted);">Belum ada data murid terdaftar.</td></tr>`; return; }
    
    tbody.innerHTML = sppData.map(s => {
        const lunasBadge = s.months.length > 0 ? s.months.map(m => `<span style="background:var(--hijau); color:#052e16; padding:4px 8px; border-radius:6px; font-size:9px; margin:2px; display:inline-block; font-weight:900;">${m.substring(0,3)}</span>`).join('') : `<span style="color:var(--merah-solid); font-size:10px; font-weight:800;">Belum Ada Pembayaran</span>`;
        return `
        <tr style="border-bottom:1px solid var(--border);" class="admin-spp-row">
            <td style="padding:15px 10px; font-size:13px; font-weight:800;" class="text-neutral">
                ${s.name}
                <div style="font-size:10px; color:var(--biru); cursor:pointer; margin-top:6px; border:1px solid var(--border); display:inline-block; padding:3px 8px; border-radius:6px;" onclick="openEditStudentModal('${s.id}')">✎ Edit Nama</div>
            </td>
            <td style="padding:15px 10px; text-align:center; cursor:pointer;" onclick="openMultiMonthSelect('${s.id}')">
                <div style="background:var(--hitam-btn); border:1px solid var(--border); padding:8px; border-radius:8px; min-height:35px; display:flex; flex-wrap:wrap; justify-content:center; align-items:center;">
                    ${lunasBadge}
                </div>
                <div style="font-size:9px; color:var(--text-muted); margin-top:5px;">Klik untuk atur SPP</div>
            </td>
            <td style="padding:15px 10px; text-align:center;">
                <div style="display:flex; flex-direction:column; align-items:center; gap:8px;">
                    <button class="btn-outline-small" style="font-size:10px; padding:6px 12px; border-radius:8px; border-color:var(--hijau); color:var(--hijau-terang);" onclick="openAbsenDetailModal('${s.id}')">Catat Absen</button>
                </div>
            </td>
            <td style="padding:15px 10px; text-align:center;">
                <button class="btn-icon-danger" style="width:32px; height:32px; padding:6px;" onclick="deleteStudentAdmin('${s.id}')">${svgs.trash}</button>
            </td>
        </tr>`;
    }).join('');
}

function filterAdminStudentTable() {
    const query = document.getElementById('searchStudentAdmin').value.toLowerCase();
    const rows = document.querySelectorAll('.admin-spp-row');
    rows.forEach(row => { const name = row.querySelector('td').innerText.toLowerCase(); row.style.display = name.includes(query) ? '' : 'none'; });
}

function openMultiMonthSelect(id) {
    const s = sppData.find(x => x.id === id); if(!s) return;
    document.getElementById('multiMonthTargetId').value = id;
    document.getElementById('multiMonthStudentName').innerText = `Otorisasi SPP: ${s.name}`;
    
    const grid = document.getElementById('multiMonthGrid');
    grid.innerHTML = monthsArr.map(m => `
        <div>
            <input type="checkbox" id="cb_${m}" value="${m}" class="spp-month-cb" ${s.months.includes(m) ? 'checked' : ''}>
            <label for="cb_${m}" class="spp-month-label">${m}</label>
        </div>
    `).join('');
    openModal('multiMonthSelectModal');
}

function saveMultiMonthSpp() {
    const id = document.getElementById('multiMonthTargetId').value;
    const sIdx = sppData.findIndex(x => x.id === id);
    if(sIdx === -1) return;
    
    const selected = [];
    document.querySelectorAll('.spp-month-cb:checked').forEach(cb => selected.push(cb.value));
    
    sppData[sIdx].months = selected;
    setLS('spp_data', JSON.stringify(sppData));
    closeModal('multiMonthSelectModal'); renderAdminStudentTable(); showToast("Status SPP Murid Diperbarui");
}

// Logika Absen Harian (Bertambah setiap jam 12 malam)
function openAbsenDetailModal(id) {
    const s = sppData.find(x => x.id === id); if(!s) return;
    document.getElementById('absenTargetId').value = id;
    document.getElementById('absenStudentName').innerText = `Rekam Jejak: ${s.name}`;

    const grid = document.getElementById('absenDaysGrid');
    const today = new Date();
    today.setHours(0,0,0,0);
    
    // Cari hari Senin terakhir (atau limit 7 hari jika lompat minggu)
    let lastReset = new Date(attendanceData.lastReset);
    lastReset.setHours(0,0,0,0);
    
    let daysToGenerate = Math.floor((today - lastReset) / (1000 * 60 * 60 * 24)) + 1;
    if (daysToGenerate > 7) daysToGenerate = 7; // Safety cap 1 minggu
    if (daysToGenerate < 1) daysToGenerate = 1;

    let html = '';
    for(let i = 0; i < daysToGenerate; i++) {
        let loopDate = new Date(today);
        loopDate.setDate(today.getDate() - i);
        
        let dateStr = loopDate.toISOString().split('T')[0];
        let displayStr = formatDetailDate(loopDate.toISOString()).split(' - ')[0];

        let isPresent = false;
        if(s.attendLogs) { isPresent = s.attendLogs.some(l => l.time.startsWith(dateStr) && l.status === 'Hadir'); }

        html += `
        <div style="display:flex; justify-content:space-between; align-items:center; background:var(--hitam-btn); padding:12px; border-radius:12px; border:1px solid var(--border);">
            <span style="font-size:12px; font-weight:900; color:var(--teks-netral);">${i===0?'HARI INI':displayStr}</span>
            <div style="display:flex; gap:12px; background:var(--hitam-card); padding:5px; border-radius:8px; border: 1px solid var(--border);">
                <label style="font-size:11px; display:flex; align-items:center; gap:6px; color:var(--hijau-terang); cursor:pointer;"><input type="radio" name="abs_${i}" value="Hadir" onchange="saveAbsenMundur('${id}', '${dateStr}', 'Hadir')" ${isPresent?'checked':''}> Hadir</label>
                <label style="font-size:11px; display:flex; align-items:center; gap:6px; color:var(--merah-solid); cursor:pointer;"><input type="radio" name="abs_${i}" value="Absen" onchange="saveAbsenMundur('${id}', '${dateStr}', 'Absen')" ${!isPresent?'checked':''}> Absen</label>
            </div>
        </div>`;
    }
    grid.innerHTML = html;
    openModal('absenDetailModal');
}

function saveAbsenMundur(id, dateStr, statusVal) {
    const sIdx = sppData.findIndex(x => x.id === id);
    if(sIdx > -1) {
        if(!sppData[sIdx].attendLogs) sppData[sIdx].attendLogs = [];
        sppData[sIdx].attendLogs = sppData[sIdx].attendLogs.filter(l => !l.time.startsWith(dateStr));
        
        const fakeTime = `${dateStr}T16:00:00.000Z`;
        sppData[sIdx].attendLogs.unshift({ status: statusVal, time: fakeTime });
        
        sppData[sIdx].attendLogs.sort((a,b) => new Date(b.time) - new Date(a.time));
        if(sppData[sIdx].attendLogs.length > 20) sppData[sIdx].attendLogs.length = 20;

        const todayStr = new Date().toISOString().split('T')[0];
        if(dateStr === todayStr) { sppData[sIdx].presentToday = (statusVal === 'Hadir'); renderAdminStudentTable(); }
        setLS('spp_data', JSON.stringify(sppData));
    }
}

function checkAttendanceReset() {
    const today = new Date();
    const dayOfWeek = today.getDay(); 
    
    if (dayOfWeek === 6 && !getLS('sat_reminder_done')) {
        showToast("⚠️ Peringatan: Hari Minggu sistem absensi akan otomatis di-reset. Ekspor rekapan CSV hari ini!", "support");
        setLS('sat_reminder_done', 'true'); 
    }
    if (dayOfWeek !== 6) { removeLS('sat_reminder_done'); }
    
    if (dayOfWeek === 0) {
        const lastReset = new Date(attendanceData.lastReset);
        const diffDays = Math.floor((today - lastReset) / (1000 * 60 * 60 * 24));
        if (diffDays >= 6) { 
            sppData = sppData.map(s => ({ ...s, presentToday: false }));
            setLS('spp_data', JSON.stringify(sppData));
            attendanceData.lastReset = today.toISOString();
            setLS('attendance_data', JSON.stringify(attendanceData));
            setTimeout(() => { showToast("Rotasi Sistem: Database Absensi Mingguan telah di-reset untuk pekan baru.", "syncing"); }, 3000);
        }
    }
}

// ==========================================
// PUBLIC PORTAL ENGINE (Advanced Real-Time Viewer)
// ==========================================
function openShareLinkModal() { 
    const loc = window.location;
    const url = `${loc.protocol}//${loc.host}${loc.pathname}?view=public`;
    document.getElementById('publicLinkInput').value = url;
    openModal('shareLinkModal'); 
}
function copyPublicLink() {
    const input = document.getElementById('publicLinkInput'); input.select(); input.setSelectionRange(0, 99999); 
    try { navigator.clipboard.writeText(input.value); showToast("URL Transparansi Disalin!", "success"); } catch(e) { document.execCommand("copy"); showToast("Disalin!", "success"); }
}

function initPublicPortal() {
    document.getElementById('adminDashboard').style.display = 'none';
    const pDash = document.getElementById('publicDashboard');
    pDash.style.display = 'none';
    document.getElementById('publicLoginOverlay').style.display = 'flex';
}

function handlePublicAutocomplete() {
    const val = document.getElementById('publicStudentInput').value.toLowerCase();
    const list = document.getElementById('publicAutocompleteList');
    if (!val) { list.classList.add('hidden'); return; }
    
    const matches = sppData.filter(s => s.name.toLowerCase().includes(val));
    if (matches.length === 0) { list.classList.add('hidden'); return; }
    
    list.innerHTML = matches.map(m => `<div class="custom-option text-neutral" onclick="selectPublicStudent('${m.name}')">${m.name}</div>`).join('');
    list.classList.remove('hidden');
}

function selectPublicStudent(name) {
    document.getElementById('publicStudentInput').value = name;
    document.getElementById('publicAutocompleteList').classList.add('hidden');
}

function validatePublicLogin() {
    const name = document.getElementById('publicStudentInput').value.trim();
    if (!name) return;
    const s = sppData.find(x => x.name.toLowerCase() === name.toLowerCase());
    
    if (s) {
        document.getElementById('publicLoginOverlay').style.display = 'none';
        
        // Perhitungan Komprehensif Seluruh Dompet
        let bUtama = 0, bWakaf = 0, bOps = 0, bDarurat = 0;
        db.forEach(t => { 
            let multiplier = t.type === 'masuk' ? 1 : -1;
            if(t.wallet === 'utama') bUtama += (t.amount * multiplier);
            if(t.wallet === 'wakaf') bWakaf += (t.amount * multiplier);
            if(t.wallet === 'operasional') bOps += (t.amount * multiplier);
            if(t.wallet === 'darurat') bDarurat += (t.amount * multiplier);
        });
        
        let logHtml = '';
        if(s.attendLogs && s.attendLogs.length > 0) {
            logHtml = s.attendLogs.slice(0,7).map(lg => {
                const isH = lg.status === 'Hadir';
                return `<div class="public-attend-item">
                    <span class="text-neutral" style="font-weight:800; font-size:11px;">${formatDetailDate(lg.time)}</span>
                    <span class="${isH ? 'public-badge-hadir' : 'public-badge-absen'}">${lg.status}</span>
                </div>`;
            }).join('');
        } else { logHtml = `<div class="public-attend-item" style="justify-content:center; color:var(--text-muted);">Belum ada riwayat tercatat</div>`; }

        // Render Semua Tabel Transaksi (Gabungan)
        let publicTxHtml = '';
        if(db.length > 0) {
            publicTxHtml = `
            <div class="table-container glass-card" style="margin-top:15px; border-radius:16px;">
                <table class="public-tx-table">
                    <thead><tr><th>Tanggal Mutasi</th><th>Kategori</th><th>Rincian Keterangan</th><th style="text-align: right;">Nominal Mutasi</th></tr></thead>
                    <tbody id="public-table-body"></tbody>
                </table>
            </div>`;
        } else { publicTxHtml = `<div class="glass-card" style="padding:20px; text-align:center; color:var(--text-muted); font-size:12px;">Database histori bersih/kosong.</div>`; }

        const unpd = monthsArr.filter(m => !s.months.includes(m));
        const unpdHtml = unpd.length === 12 ? `<span style="color:var(--merah-solid); font-weight:900; font-size:12px; border:1px solid var(--merah-solid); padding:6px 12px; border-radius:8px; background:rgba(239,68,68,0.1);">Belum Melakukan Pembayaran Sama Sekali</span>` : unpd.slice(0,3).map(m => `<span style="background:rgba(239, 68, 68, 0.15); border:1px solid var(--merah-solid); color:var(--merah-solid); padding:6px 12px; border-radius:8px; font-weight:900; font-size:12px;">${m}</span>`).join('') + (unpd.length>3?` <span style="font-size:11px; font-weight:800; color:var(--text-muted); margin-left:5px; border:1px solid var(--border); padding:6px; border-radius:8px;">+ ${unpd.length - 3} Bulan Lainnya</span>`:'');

        const todayStr = new Date().toISOString().split('T')[0];
        const isPresentToday = s.attendLogs && s.attendLogs.some(l => l.time.startsWith(todayStr) && l.status === 'Hadir');

        const pDash = document.getElementById('publicDashboard');
        pDash.innerHTML = `
            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom: 25px; padding-bottom:15px; border-bottom:1px solid var(--border);">
                <div>
                    <h2 class="text-neutral" style="margin:0; font-size:18px;">Pusat Data TPA</h2>
                    <span style="font-size:10px; color:var(--text-muted); font-weight:800; text-transform:uppercase; letter-spacing:1px;">Transparansi Eksekutif</span>
                </div>
                <button class="btn-outline-small" onclick="window.location.reload()" style="margin:0; border-color:var(--merah-solid); color:var(--merah-solid);">Tutup Sesi</button>
            </div>
            
            <div class="public-status-card glass-card">
                <h3 class="text-neutral" style="margin-top:0; border-bottom:1px dashed var(--border); padding-bottom:15px; display:flex; align-items:center; gap:12px;">
                    <div style="width:36px; height:36px; background:var(--hijau); border-radius:50%; display:flex; align-items:center; justify-content:center; color:#022c22; box-shadow:0 4px 10px rgba(16,185,129,0.3);">${svgs.user}</div>
                    Identitas: ${s.name}
                </h3>
                
                <div class="public-status-row">
                    <span style="color:var(--text-muted); font-weight:800; font-size:11px; text-transform:uppercase; letter-spacing:0.5px;">Status Absen Hari Ini</span>
                    ${isPresentToday ? `<span class="public-badge-hadir" style="font-size:12px;">HADIR</span>` : `<span class="public-badge-absen" style="font-size:12px;">TIDAK HADIR / BELUM TERCATAT</span>`}
                </div>
                
                <div class="public-status-row" style="flex-direction:column; align-items:flex-start;">
                    <span style="color:var(--text-muted); font-weight:800; font-size:11px; margin-bottom:12px; text-transform:uppercase; letter-spacing:0.5px;">Histori Pembayaran SPP (Lunas)</span>
                    <div style="display:flex; flex-wrap:wrap; gap:8px;">
                        ${s.months.length > 0 ? s.months.map(m => `<span style="background:rgba(34, 197, 94, 0.15); border:1px solid var(--hijau); color:var(--hijau-terang); padding:6px 12px; border-radius:8px; font-weight:900; font-size:12px;">${m}</span>`).join('') : `<span style="color:var(--text-muted); font-weight:800; font-size:11px; font-style:italic;">Data kosong.</span>`}
                    </div>
                </div>

                <div class="public-status-row" style="flex-direction:column; align-items:flex-start;">
                    <span style="color:var(--text-muted); font-weight:800; font-size:11px; margin-bottom:12px; text-transform:uppercase; letter-spacing:0.5px;">Bulan Tertunggak / Belum Bayar</span>
                    <div style="display:flex; flex-wrap:wrap; gap:8px; align-items:center;">
                        ${unpdHtml}
                    </div>
                </div>

                <div class="public-status-row" style="flex-direction:column; align-items:flex-start; border-bottom:none;">
                    <span style="color:var(--text-muted); font-weight:800; font-size:11px; margin-bottom:10px; text-transform:uppercase; letter-spacing:0.5px;">Log Kehadiran (7 Hari Terakhir)</span>
                    <div class="public-attend-log" style="background:var(--hitam-btn); padding:10px; border-radius:12px; border:1px solid var(--border);">${logHtml}</div>
                </div>
            </div>

            <h3 class="text-neutral" style="margin-top:35px; font-size:14px; border-bottom:1px solid var(--border); padding-bottom:10px; text-transform:uppercase; letter-spacing:1px; color:var(--text-muted)!important;">Laporan Agregat Kas TPA</h3>
            
            <div style="display:grid; grid-template-columns:1fr 1fr; gap:12px; margin-bottom:20px;">
                <div class="glass-card" style="padding:15px; border-radius:14px; border-left:4px solid var(--hijau);">
                    <span style="font-size:10px; font-weight:800; color:var(--text-muted); text-transform:uppercase;">Kas Utama</span>
                    <p class="text-neutral" style="font-size:18px; font-weight:900; margin:5px 0 0 0;">${formatRp(bUtama)}</p>
                </div>
                <div class="glass-card" style="padding:15px; border-radius:14px; border-left:4px solid var(--ungu);">
                    <span style="font-size:10px; font-weight:800; color:var(--text-muted); text-transform:uppercase;">Dana Wakaf</span>
                    <p class="text-neutral" style="font-size:18px; font-weight:900; margin:5px 0 0 0;">${formatRp(bWakaf)}</p>
                </div>
                <div class="glass-card" style="padding:15px; border-radius:14px; border-left:4px solid var(--biru);">
                    <span style="font-size:10px; font-weight:800; color:var(--text-muted); text-transform:uppercase;">Operasional</span>
                    <p class="text-neutral" style="font-size:18px; font-weight:900; margin:5px 0 0 0;">${formatRp(bOps)}</p>
                </div>
                <div class="glass-card" style="padding:15px; border-radius:14px; border-left:4px solid var(--merah-solid);">
                    <span style="font-size:10px; font-weight:800; color:var(--text-muted); text-transform:uppercase;">Dana Darurat</span>
                    <p class="text-neutral" style="font-size:18px; font-weight:900; margin:5px 0 0 0;">${formatRp(bDarurat)}</p>
                </div>
            </div>

            ${publicTxHtml}
            <p style="font-size:10px; color:var(--text-muted); text-align:center; margin-top:-10px; margin-bottom:30px;">* Klik pada baris tabel untuk melihat rincian struk transaksi.</p>
            
            <div style="margin-top: 40px; border-top: 1px dashed var(--border); padding-top: 25px; text-align:center;">
                <p style="font-size:11px; font-weight:900; color:var(--teks-netral); margin-bottom:15px; text-transform:uppercase; letter-spacing:0.5px;">Dukung Infrastruktur Server TPA Finance</p>
                <div class="sosmed-container" style="justify-content:center;">
                    <a href="https://sociabuzz.com/engyourbae/tribe" target="_blank" rel="noopener" class="btn-sosmed sw" style="flex:1;">
                        <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 8h1a4 4 0 0 1 0 8h-1"></path><path d="M2 8h16v9a4 4 0 0 1-4 4H6a4 4 0 0 1-4-4V8z"></path><line x1="6" y1="1" x2="6" y2="4"></line><line x1="10" y1="1" x2="10" y2="4"></line><line x1="14" y1="1" x2="14" y2="4"></line></svg> Traktir Kopi Developer
                    </a>
                </div>
            </div>
            
            <div style="text-align:center; margin-top:20px; font-size:10px; font-weight:800; color:var(--text-muted); text-transform:uppercase; letter-spacing:1px;">TPA Finance System v5.3<br>Read Only Portal</div>
        `;
        
        pDash.style.display = 'block';

        if(db.length > 0) {
            // Render transaksi gabungan untuk public (semua wallet, descending date)
            renderTable(db, true);
        }
        showToast("Kredensial Publik Berhasil Disinkronisasi", "success");

    } else { showToast("Gagal: Nama murid tidak terdaftar dalam database institusi.", "error"); }
}

// TRANSACTION EXTRAS
function executeTxDeleteFinal(txId) {
    openCustomConfirm("Penghapusan Transaksi", "Data yang dihapus akan menghilang dari sistem laporan.", async () => {
        const idx = db.findIndex(t => String(t.id) === txId || String(t.date) === txId); if (idx === -1) return; const delTx = db[idx]; db.splice(idx, 1);
        if (APP_MODE === 'CLOUD' && currentUser && currentUser.id !== 'offline_user' && navigator.onLine && sbClient && delTx.id) { try { await sbClient.from('transactions').delete().eq('id', delTx.id); } catch(e) {} } else { pendingSync = pendingSync.filter(t => String(t.id) !== txId && String(t.date) !== txId); setLS('pending_sync', JSON.stringify(pendingSync)); }
        saveLocalDB(db); updateUI(document.getElementById('searchTxInput') ? document.getElementById('searchTxInput').value : ''); showToast("Arsip Berhasil Dimusnahkan.", "success");
    });
}
function promptActionPin(action, txId) { 
    closeModal('receiptModal'); 
    if (!profile.pin || profile.pin.trim() === '') { 
        if (action === 'edit') openEditTxModal(txId);
        else executeTxDeleteFinal(txId); 
        return; 
    } 
    document.getElementById('actionPinType').value = action; 
    document.getElementById('actionPinPayload').value = txId; 
    document.getElementById('inputActionPin').value = ''; 
    openModal('actionPinModal'); 
}
function promptActionPinFromTable(e, action, txId) { e.stopPropagation(); promptActionPin(action, txId); }

async function verifyActionPinFinal() { 
    const inputVal = document.getElementById('inputActionPin').value; const hashedInput = await hashPIN(inputVal); 
    if (hashedInput === profile.pin) { 
        closeModal('actionPinModal'); 
        const action = document.getElementById('actionPinType').value; const payload = document.getElementById('actionPinPayload').value; 
        if (action === 'delete') executeTxDeleteFinal(payload); 
        else if (action === 'edit') openEditTxModal(payload);
        else if (action === 'reset') executeFactoryReset();
        else if (action === 'edit_profile') openProfileEdit();
    } else { showToast("Kredensial PIN Tidak Cocok! Akses Ditolak.", "error"); } 
}

function initResetSequence() { 
    if(!profile.pin) { showToast("Tetapkan PIN Keamanan terlebih dahulu di menu Edit Profil.", "error"); return; } 
    closeModal('profileViewModal'); 
    document.getElementById('actionPinType').value = 'reset'; 
    document.getElementById('inputActionPin').value = ''; 
    openModal('actionPinModal'); 
}

async function executeFactoryReset() { 
    showToast("Mengosongkan Entri Database...", "syncing"); 
    try { 
        if(APP_MODE === 'CLOUD' && navigator.onLine && sbClient) await sbClient.from('transactions').delete().eq('user_id', currentUser.id); 
    } catch(e) {}
    db = []; sppData = []; attendanceData = { lastReset: new Date().toISOString(), records: {} }; pendingSync = []; wishlists = []; driveLinks = [];
    removeLS('cloud_db'); removeLS('guest_db'); removeLS('spp_data'); removeLS('attendance_data'); removeLS('pending_sync'); removeLS('wishlists'); removeLS('drivelinks');
    updateUI(''); if(typeof renderWishlist==='function')renderWishlist(); if(typeof renderDriveLinks==='function')renderDriveLinks(); showToast("Format Basis Data Berhasil.", "success"); 
}

// Execution Kickstart (Memastikan seluruh DOM selesai diload)
document.addEventListener('DOMContentLoaded', () => {
    // Memulai sistem TPA v5.3
    if (typeof bootApp === 'function') bootApp();
});
