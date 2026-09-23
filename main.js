/* =========================================================
   TPA FINANCE v5.2 - ENTERPRISE CORE LOGIC (PART 1)
   Strict Mode, Z-Index Engine, Scroll Lock Fix, GPS Live
========================================================= */

"use strict";

const APP_VERSION = '5.2'; 
const LS_PREFIX = 'tpa_finance_v52_';

const SUPABASE_URL = 'https://ndsyyaxmiwskrkklseap.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5kc3l5YXhtaXdza3Jra2xzZWFwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODUxNDU4NjIsImV4cCI6MjEwMDcyMTg2Mn0.uXgAIhUjjkNpe9s6N6LGvRXZLUDQUZJrSfUFf1BDmKU';
const SECRET_KEY = "TPA_Finance_Secure_K3y_v51";

// ==========================================
// STATE MANAGEMENT & VARIABLES
// ==========================================
let sbClient = null;
let db = []; 
let pendingSync = JSON.parse(getLS('pending_sync')) || []; 
let wishlists = JSON.parse(getLS('wishlists')) || [];
let driveLinks = JSON.parse(getLS('drivelinks')) || [];
let sppData = JSON.parse(getLS('spp_data_v51')) || [];
let attendanceData = JSON.parse(getLS('attendance_data_v51')) || { lastReset: new Date().toISOString(), records: {} };
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
let scrollPos = 0; // Fix scroll jump bug

// Perbaikan: Profil Default dengan Foto valid agar tidak "Memuat..."
const defaultProfile = { 
    name: 'Pengurus Baru', pin: '', 
    photo: 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAyNCAyNCIgZmlsbD0iIzIyYzU1ZSI+PHBhdGggZD0iTTEyIDJhNSA1IDAgMSAwIDUgNSBNMTIgMTRhNyA3IDAgMCAwLTcgN3YxSDE5di0xYTcgNyAwIDAgMC03LTdaIi8+PC9zdmc+', 
    joinDate: new Date().toISOString(), birthDate: '', gender: 'Rahasia', googleLinked: false, googleEmail: ''
};
let profile = JSON.parse(getLS('profile_secure_v51'));
if (!profile) { profile = { ...defaultProfile }; setLS('profile_secure_v51', JSON.stringify(profile)); }

const categories = { 
    masuk: ['Infak Santri', 'Infak Jumat', 'Donasi Masyarakat', 'Wakaf', 'Bantuan Pemerintah', 'Bantuan Masjid', 'Hibah', 'Donatur Tetap', 'Lainnya'], 
    keluar: ['Honor Guru', 'ATK', 'Al-Qur\'an', 'Buku Iqra\'', 'Snack Kegiatan', 'Listrik', 'Air', 'Kebersihan', 'Perbaikan Bangunan', 'Kegiatan Santri', 'Transportasi', 'Lainnya'] 
};
const monthsArr = ["Januari", "Februari", "Maret", "April", "Mei", "Juni", "Juli", "Agustus", "September", "Oktober", "November", "Desember"];

// SVGs Setup
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
function formatDetailDate(iso) { if(!iso) return '-'; const d = new Date(iso); return `${String(d.getDate()).padStart(2,'0')}/${String(d.getMonth()+1).padStart(2,'0')}/${d.getFullYear()} - ${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`; }
function properTitleCase(str) { if(!str) return ""; return str.toLowerCase().replace(/\b\w/g, char => char.toUpperCase()); }

function getDynamicColor(categoryStr, type) {
    if (type === 'keluar') return '#ef4444'; 
    const inColors = { 'Wakaf': '#a855f7', 'Infak Santri': '#22c55e', 'Donasi Masyarakat': '#3b82f6', 'Bantuan Pemerintah': '#f59e0b', 'Hibah': '#22c55e' };
    if (inColors[categoryStr]) return inColors[categoryStr];
    let hash = 0; for(let i = 0; i < categoryStr.length; i++) hash = categoryStr.charCodeAt(i) + ((hash << 5) - hash);
    return `hsl(${Math.abs(hash) % 360}, 70%, 50%)`; 
}

function refreshApp() { 
    showToast("Menyegarkan sistem...", "syncing"); 
    setTimeout(() => window.location.reload(true), 1500); 
}

// Toast Notifikasi (Durasi 8 Detik)
function showToast(msg, type = 'success') { 
    const box = document.getElementById('toastBox'); if(!box) return; 
    const t = document.createElement('div'); t.className = `toast ${type}`; t.innerHTML = msg; box.appendChild(t); 
    setTimeout(() => t.classList.add('show'), 10); 
    setTimeout(() => { t.classList.remove('show'); setTimeout(() => t.remove(), 400); }, 8000); 
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

// ==========================================
// Z-INDEX MODAL ENGINE & SCROLL FIX
// ==========================================
let modalStack = [];
function openModal(id) {
    const el = document.getElementById(id);
    if (!el) return;
    
    // Simpan posisi scroll sebelum modal pertama dibuka
    if (modalStack.length === 0) {
        scrollPos = window.scrollY;
        document.body.style.top = `-${scrollPos}px`;
        document.body.classList.add('modal-open');
    }
    
    const baseZIndex = 10000;
    const currentZIndex = baseZIndex + (modalStack.length * 20); 
    
    el.style.zIndex = currentZIndex;
    el.classList.add('active');
    
    if (!modalStack.includes(id)) { modalStack.push(id); }
}

function closeModal(id) {
    document.querySelectorAll('.custom-options.open').forEach(e => e.classList.remove('open'));
    if (!id) return;

    const el = document.getElementById(id);
    if (el) { el.classList.remove('active'); }
    
    modalStack = modalStack.filter(modalId => modalId !== id);
    
    // Kembalikan posisi scroll saat modal terakhir ditutup
    if (modalStack.length === 0) {
        document.body.classList.remove('modal-open');
        document.body.style.top = '';
        window.scrollTo(0, scrollPos);
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
// PRAYER TIMES (GPS LIVE TRACKING)
// ==========================================
function initPrayerTimes(force = false) {
    const pText = document.getElementById('prayerLocationText');
    const pDate = document.getElementById('prayerDateText');
    const pGrid = document.getElementById('prayerTimesGrid');
    if(!pText || !pGrid) return;

    const todayStr = new Date().toISOString().split('T')[0];
    const cached = JSON.parse(getLS('prayer_cache') || 'null');

    // Cek cache jika tidak dipaksa sinkron ulang
    if (!force && cached && cached.date === todayStr && cached.timings) {
        renderPrayerUI(cached);
        return;
    }

    if (navigator.geolocation) {
        pText.innerText = "Mencari Lokasi...";
        navigator.geolocation.getCurrentPosition(async (pos) => {
            const lat = pos.coords.latitude;
            const lon = pos.coords.longitude;
            try {
                const res = await fetch(`https://api.aladhan.com/v1/timings?latitude=${lat}&longitude=${lon}&method=11`);
                const data = await res.json();
                
                if(data && data.data) {
                    const pt = data.data.timings;
                    const newCache = {
                        date: todayStr,
                        location: "Lokasi GPS Aktif",
                        timings: [
                            { n: 'Tahajud', t: '02:30' }, 
                            { n: 'Shubuh', t: pt.Fajr },
                            { n: 'Dhuha', t: pt.Sunrise },
                            { n: 'Dzuhur', t: pt.Dhuhr },
                            { n: 'Ashar', t: pt.Asr },
                            { n: 'Maghrib', t: pt.Maghrib },
                            { n: 'Isya', t: pt.Isha }
                        ]
                    };
                    setLS('prayer_cache', JSON.stringify(newCache));
                    renderPrayerUI(newCache);
                    if (force) showToast("Jadwal Sinkron dengan GPS", "success");
                }
            } catch(e) {
                pText.innerText = "Gagal sinkron server";
            }
        }, (err) => {
            pText.innerText = "Izin GPS Ditolak";
        });
    } else {
        pText.innerText = "GPS Tdk Didukung";
    }
}

function forceRefreshGPS() {
    initPrayerTimes(true);
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
// INITIALIZATION & BOOT
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
    
    // Deteksi Mode Publik (Wali Murid)
    const urlParams = new URLSearchParams(window.location.search);
    if (urlParams.get('view') === 'public') {
        isPublicMode = true;
        initPublicPortal();
        return;
    }

    db = loadLocalDB(); 
    initAppHeader();
    renderShortcuts();
    renderWishlist();
    renderDriveLinks();
    checkAttendanceReset();
    updateUI('');
    initPrayerTimes();

    const netStatus = document.getElementById('networkStatus');
    if (APP_MODE === 'CLOUD') {
        currentUser = { id: 'offline_user', email: profile.googleEmail || 'Cloud User' }; 
        if(netStatus) { netStatus.innerText = navigator.onLine ? "Menyambungkan..." : "Offline (Cloud)"; netStatus.className = navigator.onLine ? "status-sync sync-pending" : "status-sync sync-offline"; }
    } else {
        currentUser = null;
        if(netStatus) { netStatus.innerText = "Offline Mode (Guest)"; netStatus.className = "status-sync sync-offline"; }
    }
    
    setTimeout(initSupabaseBackground, 500);
    
    // Auto-Ping
    document.body.addEventListener('click', () => {
        if(APP_MODE === 'CLOUD' && navigator.onLine && sbClient && currentUser?.id !== 'offline_user') {
            try { sbClient.from('profiles').select('id').limit(1).then(); } catch(e){}
        }
    });
}

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
/* =========================================================
   TPA FINANCE v5.1 - ENTERPRISE CORE LOGIC (PART 2)
   Cloud Sync, Theme Engine, Health AI, & Core UI Render
========================================================= */

// ==========================================
// CLOUD SYNC & SUPABASE ENGINE
// ==========================================
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
                fetchUserTransactions(); 
                setupRealtime();
                if (pendingSync.length > 0) processPendingSync();
            } else { forceLogoutToGuest(); }
        } catch(err) { updateNetworkStatus("Server Lambat", "sync-offline"); }
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
                        if(profile.name === 'Pengurus' || profile.name === 'Pengurus Baru') profile.name = properTitleCase(currentUser.user_metadata?.full_name) || 'Member TPA'; 
                        profile.photo = currentUser.user_metadata?.avatar_url || profile.photo; 
                        await sbClient.from('profiles').upsert({ id: currentUser.id, data: profile });
                    }
                } catch(e) {}
                
                profile.googleLinked = true; profile.googleEmail = currentUser.email; 
                setLS('profile_secure_v51', JSON.stringify(profile));
                
                db = loadLocalDB(); initAppHeader(); renderShortcuts(); fetchUserTransactions(); setupRealtime(); 
                closeModal('googleAuthModal');
                if (navigator.onLine && pendingSync.length > 0) processPendingSync();
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
    profile = { ...defaultProfile }; setLS('profile_secure_v51', JSON.stringify(profile));
    removeLS('cloud_db'); removeLS('cloud_db_fallback'); db = loadLocalDB(); 
    initAppHeader(); renderShortcuts(); updateUI(''); 
    showToast("Berhasil Logout.", "success"); closeModal('profileViewModal');
    updateNetworkStatus(navigator.onLine ? "Online Mode (Guest)" : "Offline Mode (Guest)", navigator.onLine ? "sync-online" : "sync-offline");
}

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

async function fetchUserTransactions() {
    if (APP_MODE !== 'CLOUD' || !currentUser || currentUser.id === 'offline_user' || !sbClient) return;
    try {
        if (!navigator.onLine) throw new Error("Offline");
        const { data, error } = await sbClient.from('transactions').select('*').eq('user_id', currentUser.id).order('date', { ascending: true });
        if (error) throw error;
        db = data; saveLocalDB(db); 
        updateUI(document.getElementById('searchTxInput') ? document.getElementById('searchTxInput').value : ''); 
    } catch (error) {}
}

function setupRealtime() {
    if (APP_MODE !== 'CLOUD' || !currentUser || currentUser.id === 'offline_user' || !sbClient) return;
    if (realTimeSubscription) sbClient.removeChannel(realTimeSubscription);
    realTimeSubscription = sbClient.channel('custom-tpa-channel')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'transactions', filter: `user_id=eq.${currentUser.id}` }, payload => { fetchUserTransactions(); }).subscribe();
}

async function processPendingSync() {
    if (!navigator.onLine || APP_MODE !== 'CLOUD' || !currentUser || currentUser.id === 'offline_user' || !sbClient || pendingSync.length === 0) return;
    try {
        showToast("Menyinkronkan antrean data...", "syncing");
        const payload = pendingSync.map(t => { let newData = { ...t, user_id: currentUser.id }; if(String(newData.id).length > 10) delete newData.id; return newData; });
        const { error } = await sbClient.from('transactions').insert(payload);
        if (error) throw error;
        pendingSync = []; setLS('pending_sync', JSON.stringify(pendingSync));
        showToast("Data offline tersimpan ke Cloud!", "success"); fetchUserTransactions();
    } catch (error) {}
}

window.addEventListener('online', () => { 
    if(isPublicMode) return;
    updateNetworkStatus(APP_MODE === 'CLOUD' ? "Menyambungkan..." : "Online (Guest)", APP_MODE === 'CLOUD' ? "sync-pending" : "sync-online");
    if(APP_MODE === 'CLOUD') {
        if (currentUser && currentUser.id === 'offline_user') { initSupabaseBackground(); } 
        else { if (pendingSync.length > 0) { processPendingSync(); } else { fetchUserTransactions(); } updateNetworkStatus("Online Mode (Cloud)", "sync-online"); }
    }
});
window.addEventListener('offline', () => { 
    if(isPublicMode) return;
    updateNetworkStatus(pendingSync.length > 0 ? "Offline (Menunggu Sync)" : "Offline Mode", pendingSync.length > 0 ? "sync-pending" : "sync-offline");
    showToast("Koneksi terputus. Mode Offline.", "error"); 
});

// ==========================================
// TEMA ENGINE (SMOOTH RADIAL DARI TITIK KLIK)
// ==========================================
const iconSun = `<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="5"/><path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42"/></svg>`;
const iconMoon = `<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>`;
const savedTheme = getLS('app_theme') || 'dark';
document.documentElement.setAttribute('data-theme', savedTheme);
window.addEventListener('DOMContentLoaded', () => { updateThemeIcon(savedTheme); });

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
        setLS('app_theme', newTheme); 
        updateThemeIcon(newTheme);
        
        document.getElementById('metaThemeColor').setAttribute("content", newTheme === 'light' ? "#059669" : "#05140d");
        updateUI(document.getElementById('searchTxInput') ? document.getElementById('searchTxInput').value : '');
        
        document.body.classList.add('theme-fade-out');
    }, 450); 

    setTimeout(() => { document.body.classList.remove('theme-animating', 'theme-fade-out'); }, 850);
}

function updateThemeIcon(theme) { 
    const btn = document.getElementById('theme-icon'); if (!btn) return; 
    if (theme === 'light') { btn.innerHTML = iconMoon; } else { btn.innerHTML = iconSun; } 
}

// ==========================================
// UI & NAVIGATION ENGINE
// ==========================================
function switchWallet(type) { 
    activeWallet = type; 
    document.getElementById('walletSwitchContainer').setAttribute('data-active', type); 
    document.querySelectorAll('.btn-tab').forEach(b => b.classList.remove('active')); 
    document.getElementById(`tab-${type}`).classList.add('active'); 
    renderShortcuts(); 
    updateUI(document.getElementById('searchTxInput') ? document.getElementById('searchTxInput').value : ''); 
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
    updateUI(document.getElementById('searchTxInput') ? document.getElementById('searchTxInput').value : ''); 
}

function selectCategory(val) { document.getElementById('tx-category').value = val; document.getElementById('dispTxCat').innerText = val; closeModal(''); }
function selectTitle(val) { document.getElementById('tx-title-val').value = val; document.getElementById('dispTxTitle').innerText = val; closeModal(''); }
function selectEditTitle(val) { document.getElementById('edit-tx-title-val').value = val; document.getElementById('dispEditTxTitle').innerText = val; closeModal(''); }

function toggleSection(sec, icn) { 
    document.getElementById(sec).classList.toggle('hidden'); 
    document.getElementById(icn).classList.toggle('rotated'); 
}

function toggleExpandStat(el, id) { 
    const items = document.getElementById(id).children; 
    if (el.classList.contains('expanded')) { for(let i of items) i.className = 'expand-item glass-card'; } 
    else { for(let i of items) i.className = (i === el) ? 'expand-item expanded glass-card' : 'expand-item collapsed'; } 
} 

function expandChart(el, id) { 
    if(!el.classList.contains('expanded')) { 
        for(let i of document.getElementById(id).children) i.className = (i === el) ? 'expand-item expanded glass-card' : 'expand-item collapsed'; 
        setTimeout(() => { if(pieChart) pieChart.resize(); if(barChart) barChart.resize(); if(lineChart) lineChart.resize(); }, 100); 
        setTimeout(() => { if(pieChart) pieChart.resize(); if(barChart) barChart.resize(); if(lineChart) lineChart.resize(); }, 550); 
    } 
} 
function closeChart(e, btn) { 
    e.stopPropagation(); 
    for(let i of btn.closest('.expand-container').children) i.className = 'expand-item glass-card'; 
    setTimeout(() => { if(pieChart) pieChart.resize(); if(barChart) barChart.resize(); if(lineChart) lineChart.resize(); }, 100); 
    setTimeout(() => { if(pieChart) pieChart.resize(); if(barChart) barChart.resize(); if(lineChart) lineChart.resize(); }, 550); 
}

// ==========================================
// SHORTCUT RENDERING
// ==========================================
function renderShortcuts() { 
    const c = document.getElementById('quickActionsContainer'); 
    if(!c) return;
    c.className = 'quick-actions-wrap grid-mode grid-split-4'; 
    if(activeWallet === 'utama') {
        c.innerHTML = ` 
            <button class="btn-quick svg-hijau glass-card" onclick="quickInput('masuk', 'Infak Santri', 'Penerimaan Infak SPP Santri')">${svgs.uang} <span>Infak Santri</span></button> 
            <button class="btn-quick svg-biru glass-card" onclick="quickInput('masuk', 'Donasi Masyarakat', 'Donasi Umum')">${svgs.user} <span>Donasi Umum</span></button> 
            <button class="btn-quick svg-merah glass-card" onclick="quickInput('keluar', 'Honor Guru', 'Pembayaran Honor Guru')">${svgs.makan} <span>Honor Guru</span></button> 
            <button class="btn-quick svg-kuning glass-card" onclick="quickInput('masuk', 'Bantuan Pemerintah', 'Dana Bantuan')">${svgs.plus_bold} <span>Pemasukan Lain</span></button> 
        `;
    } else if(activeWallet === 'wakaf') {
        c.innerHTML = `
            <button class="btn-quick svg-hijau glass-card" onclick="quickInput('masuk', 'Wakaf', 'Penerimaan Dana Wakaf')">${svgs.uang} <span>Terima Wakaf</span></button> 
            <button class="btn-quick svg-merah glass-card" onclick="quickInput('keluar', 'Perbaikan Bangunan', 'Penggunaan Dana Wakaf')">${svgs.plus_bold} <span>Gunakan Wakaf</span></button>
            <button class="btn-quick svg-kuning glass-card" onclick="quickInput('keluar', 'Kebersihan', 'Biaya Kebersihan Wakaf')">${svgs.minus_bold} <span>Pemeliharaan</span></button>
            <button class="btn-quick svg-biru glass-card" onclick="quickInput('masuk', 'Lainnya', 'Penerimaan Wakaf Lainnya')">${svgs.plus_bold} <span>Lainnya (+)</span></button> 
        `;
    } else if(activeWallet === 'operasional') {
        c.innerHTML = `
            <button class="btn-quick svg-merah glass-card" onclick="quickInput('keluar', 'Listrik', 'Bayar Tagihan Listrik')">${svgs.minus_bold} <span>Bayar Listrik</span></button>
            <button class="btn-quick svg-biru glass-card" onclick="quickInput('keluar', 'Air', 'Bayar Tagihan Air')">${svgs.minus_bold} <span>Bayar Air</span></button>
            <button class="btn-quick svg-kuning glass-card" onclick="quickInput('keluar', 'ATK', 'Beli ATK & Kebutuhan')">${svgs.book} <span>Beli ATK</span></button>
            <button class="btn-quick svg-hijau glass-card" onclick="quickInput('masuk', 'Hibah', 'Suntikan Dana Operasional')">${svgs.plus_bold} <span>Tambah Dana</span></button>
        `;
    } else if(activeWallet === 'darurat') {
        c.innerHTML = `
            <button class="btn-quick svg-hijau glass-card" onclick="quickInput('masuk', 'Dana Cadangan', 'Injeksi Dana Darurat')">${svgs.shield} <span>Simpan Dana</span></button>
            <button class="btn-quick svg-merah glass-card" onclick="quickInput('keluar', 'Kebutuhan Mendadak', 'Penggunaan Dana Darurat')">${svgs.minus_bold} <span>Tarik Dana</span></button>
        `;
    }
}

// ==========================================
// HEALTH ENGINE & AI INSIGHT
// ==========================================
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

// ==========================================
// CORE UI RENDER (TABLE & CHARTS)
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
        let pihakHtml = tx.pihak_terkait ? `<br><span style="font-size:11px; color:var(--text-muted);">Pihak: <b class="text-neutral">${tx.pihak_terkait}</b></span>` : '';

        let aksiHtml = isPublic ? '' : `
            <td style="vertical-align:middle; text-align:center; padding-right:15px; width:1%;" class="aksi-col">
                <div style="display:flex; gap:8px; justify-content:center;">
                    <button type="button" class="btn-icon-neutral" onclick="event.stopPropagation(); promptActionPin('edit', '${tx.id || tx.date}')">${svgs.edit}</button>
                    <button type="button" class="btn-icon-danger" onclick="event.stopPropagation(); promptActionPin('delete', '${tx.id || tx.date}')">${svgs.trash}</button>
                </div>
            </td>
        `;

        htmlStr += `<tr class="clickable-row" onclick="openReceipt('${tx.id || tx.date}')">
            <td style="color:var(--text-muted); font-size:11px; vertical-align:middle;">${formatDetailDate(tx.date).split(' - ')[0]}<br>${formatDetailDate(tx.date).split(' - ')[1]}</td>
            <td style="width:1%; white-space:nowrap; padding:15px 10px; vertical-align:middle;"><div class="badge-cat">${tx.category}</div></td>
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
    
    document.getElementById('receiptContent').innerHTML = ` 
        <div class="receipt-head"><h3 style="margin:0 0 5px 0;" class="text-neutral">BUKTI MUTASI KAS TPA</h3><span style="font-size:11px; color:var(--text-muted); letter-spacing: 1px;">ID: ${rId}</span></div> 
        <div class="receipt-row"><span class="receipt-label">Waktu</span><span class="receipt-val text-neutral">${rDate}</span></div> 
        <div class="receipt-row"><span class="receipt-label">Dompet Kas</span><span class="receipt-val text-neutral" style="text-transform:capitalize;">${tx.wallet}</span></div> 
        <div class="receipt-row"><span class="receipt-label">Kategori</span><span class="receipt-val text-neutral">${tx.category}</span></div> 
        <div class="receipt-row"><span class="receipt-label">Sifat Mutasi</span><span class="receipt-val text-neutral">${rType}</span></div> 
        <div class="receipt-row"><span class="receipt-label">Keterangan</span><span class="receipt-val text-neutral">${tx.desc}</span></div> 
        ${tx.pihak_terkait ? `<div class="receipt-row"><span class="receipt-label">Pihak Terkait</span><span class="receipt-val text-neutral">${tx.pihak_terkait}</span></div>` : ''} 
        ${tx.link_bukti ? `<div class="receipt-row" style="margin-top:10px;"><span class="receipt-label" style="color:var(--text-muted);">Lampiran Drive</span><span class="receipt-val"><a href="${tx.link_bukti}" target="_blank" rel="noopener" style="color:var(--biru); text-decoration:underline;">Buka Dokumen ↗</a></span></div>` : ''} 
        <div class="receipt-row" style="margin-top:25px; border-top:2px dashed var(--border); padding-top:20px; align-items: flex-end; flex-wrap: nowrap !important;"> 
            <span class="receipt-label" style="font-size:14px; color:var(--text-muted); flex-shrink: 0;">TOTAL</span> 
            <span class="receipt-val ${tx.type==='masuk'?'amt-in':'amt-out'}" style="font-size: clamp(18px, 5.5vw, 24px); letter-spacing:-1px; white-space: nowrap !important; word-break: keep-all !important; flex-grow: 1; text-align: right;">${formatRp(tx.amount)}</span> 
        </div> 
    `; 
    openModal('receiptModal'); 
}
/* =========================================================
   TPA FINANCE v5.1 - ENTERPRISE CORE LOGIC (PART 3)
   Transactions, Transfers, Admin SPP, Public Portal, & OTP
========================================================= */

// ==========================================
// CUSTOM CALENDAR UI
// ==========================================
let currentCalTargetHidden = '';
let currentCalTargetDisp = '';
let calDate = new Date(); 

function openCustomDatePicker(hiddenId, dispId) {
    currentCalTargetHidden = hiddenId;
    currentCalTargetDisp = dispId;
    
    const existVal = document.getElementById(hiddenId).value;
    if (existVal) { calDate = new Date(existVal); } 
    else { calDate = new Date(); }
    
    const monthBox = document.getElementById('custCalMonthOptions');
    monthBox.innerHTML = monthsArr.map((m,i) => `<div class="custom-option text-neutral" onclick="selectCustCalMonth(${i}, '${m}')">${m}</div>`).join('');
    
    const yearBox = document.getElementById('custCalYearOptions');
    let yHtml = ''; const currYear = new Date().getFullYear();
    for(let y = currYear - 5; y <= currYear + 5; y++) { yHtml += `<div class="custom-option text-neutral" onclick="selectCustCalYear(${y})">${y}</div>`; }
    yearBox.innerHTML = yHtml;

    const hourBox = document.getElementById('custCalHourOptions');
    let hHtml = '';
    for(let h=0; h<24; h++){ const hh = String(h).padStart(2,'0'); hHtml += `<div class="custom-option text-neutral" style="text-align:center;" onclick="selectCustCalHour('${hh}')">${hh}</div>`; }
    hourBox.innerHTML = hHtml;

    const minBox = document.getElementById('custCalMinuteOptions');
    let minHtml = '';
    for(let m=0; m<60; m+=5){ const mm = String(m).padStart(2,'0'); minHtml += `<div class="custom-option text-neutral" style="text-align:center;" onclick="selectCustCalMinute('${mm}')">${mm}</div>`; }
    minBox.innerHTML = minHtml;

    selectCustCalMonth(calDate.getMonth(), monthsArr[calDate.getMonth()]);
    selectCustCalYear(calDate.getFullYear());
    selectCustCalHour(String(calDate.getHours()).padStart(2,'0'));
    
    let mNear = Math.round(calDate.getMinutes() / 5) * 5;
    if(mNear === 60) mNear = 55;
    selectCustCalMinute(String(mNear).padStart(2,'0'));
    
    openModal('customCalendarModal');
}

function selectCustCalMonth(i, m) { document.getElementById('custCalMonthVal').value = i; document.getElementById('dispCalMonth').innerText = m; closeModal(''); renderCustomCalendar(); }
function selectCustCalYear(y) { document.getElementById('custCalYearVal').value = y; document.getElementById('dispCalYear').innerText = y; closeModal(''); renderCustomCalendar(); }
function selectCustCalHour(h) { document.getElementById('custCalHourVal').value = h; document.getElementById('dispCalHour').innerText = h; closeModal(''); }
function selectCustCalMinute(m) { document.getElementById('custCalMinuteVal').value = m; document.getElementById('dispCalMinute').innerText = m; closeModal(''); }

function renderCustomCalendar() {
    const month = parseInt(document.getElementById('custCalMonthVal').value);
    const year = parseInt(document.getElementById('custCalYearVal').value);
    
    const firstDay = new Date(year, month, 1).getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    
    const grid = document.getElementById('calendarDaysGrid');
    let html = '';
    
    for(let i = 0; i < firstDay; i++) { html += `<div class="cal-day-btn disabled"></div>`; }
    
    const today = new Date();
    for(let i = 1; i <= daysInMonth; i++) {
        let classes = 'cal-day-btn';
        if (calDate.getDate() === i && calDate.getMonth() === month && calDate.getFullYear() === year) classes += ' selected';
        if (today.getDate() === i && today.getMonth() === month && today.getFullYear() === year) classes += ' today';
        html += `<div class="${classes}" onclick="selectCustomDay(${i}, ${month}, ${year})">${i}</div>`;
    }
    grid.innerHTML = html;
}

function selectCustomDay(d, m, y) {
    calDate.setFullYear(y); calDate.setMonth(m); calDate.setDate(d);
    renderCustomCalendar(); 
}

function applyCustomDate() {
    const h = document.getElementById('custCalHourVal').value;
    const min = document.getElementById('custCalMinuteVal').value;
    calDate.setHours(h); calDate.setMinutes(min);
    
    const tzOffset = calDate.getTimezoneOffset() * 60000; 
    const localISOTime = (new Date(calDate - tzOffset)).toISOString().slice(0, -1);
    
    document.getElementById(currentCalTargetHidden).value = localISOTime;
    document.getElementById(currentCalTargetDisp).innerText = formatDetailDate(localISOTime);
    
    closeModal('customCalendarModal');
}

// ==========================================
// TRANSACTION CRUD LOGIC
// ==========================================
function quickInput(type, cat, desc) { 
    document.getElementById('tx-type').value = type; 
    document.getElementById('modal-title').innerText = type === 'masuk' ? 'Catat Pemasukan TPA' : 'Catat Pengeluaran TPA'; 
    document.getElementById('tx-desc').value = desc; 
    document.getElementById('tx-pihak-terkait').value = ''; 
    document.getElementById('tx-category-manual').value = '';
    document.getElementById('tx-date-hidden').value = ''; 
    document.getElementById('disp-tx-date').innerText = 'Gunakan Waktu Saat Ini';
    document.getElementById('tx-is-saving').value = 'false'; 

    if(cat === 'MANUAL') { 
        document.getElementById('catSelectWrapper').style.display = 'none'; document.getElementById('tx-category-manual').style.display = 'block'; document.getElementById('label-kategori').innerText = 'Ketik Nama Kategori'; 
    } else { 
        document.getElementById('catSelectWrapper').style.display = 'block'; document.getElementById('tx-category-manual').style.display = 'none'; document.getElementById('label-kategori').innerText = 'Kategori'; 
        const box = document.getElementById('catOptionsBox'); const arr = type === 'masuk' ? categories.masuk : categories.keluar; 
        box.innerHTML = arr.map(c => `<div class="custom-option text-neutral" onclick="selectCategory('${c}')">${c}</div>`).join(''); 
        if(!arr.includes(cat)) box.innerHTML += `<div class="custom-option text-neutral" onclick="selectCategory('${cat}')">${cat}</div>`; 
        selectCategory(cat); 
    } 
    document.getElementById('tx-amount').value = ''; rawAmount = 0; 
    openModal('txModal'); 
}

const txAmtInput = document.getElementById('tx-amount');
if(txAmtInput) txAmtInput.addEventListener('input', function() { let v = this.value.replace(/[^0-9]/g, ''); if(v === '') { rawAmount = 0; this.value = ''; return; } rawAmount = parseInt(v, 10); this.value = rawAmount.toLocaleString('id-ID'); });

document.getElementById('btnExecuteTx').addEventListener('click', async () => { 
    if(rawAmount <= 0) { showToast("Nominal 0", "error"); return; } 
    if (document.getElementById('tx-is-saving').value === 'true') return; document.getElementById('tx-is-saving').value = 'true'; 

    try {
        const type = document.getElementById('tx-type').value; 
        let cF = document.getElementById('tx-category-manual').style.display === 'block' ? document.getElementById('tx-category-manual').value.trim() : document.getElementById('tx-category').value; 
        let dF = document.getElementById('tx-desc').value.trim(); 
        let titleVal = document.getElementById('tx-title-val').value;
        let pihakRaw = document.getElementById('tx-pihak-terkait').value.trim();
        let pihakFinal = pihakRaw ? `${titleVal} ${properTitleCase(pihakRaw)}` : '';
        let txDateInput = document.getElementById('tx-date-hidden').value;
        let finalDate = txDateInput ? new Date(txDateInput).toISOString() : new Date().toISOString();

        if(!cF || !dF) { showToast("Kategori & Deskripsi wajib diisi", "error"); return; } 
        cF = properTitleCase(cF); dF = properTitleCase(dF);

        let tx = { wallet: activeWallet, type: type, category: cF, desc: dF, pihak_terkait: pihakFinal, link_bukti: '', amount: rawAmount, status: 'normal', date: finalDate };

        if(APP_MODE === 'CLOUD' && navigator.onLine && sbClient && (!currentUser || currentUser.id !== 'offline_user')) { 
            try { 
                let data = { ...tx, user_id: currentUser.id };
                const { error } = await sbClient.from('transactions').insert([data]); 
                if(error) throw error;
                await fetchUserTransactions(); closeModal('txModal'); showToast("Tersimpan di Cloud"); 
            } catch(e) { 
                tx.id = Date.now() + Math.random(); db.push(tx); pendingSync.push(tx); setLS('pending_sync', JSON.stringify(pendingSync)); saveLocalDB(db); closeModal('txModal'); updateUI(document.getElementById('searchTxInput') ? document.getElementById('searchTxInput').value : '');
                showToast("Antrean Offline Aktif.", "syncing"); 
            }
        } else { 
            tx.id = Date.now() + Math.floor(Math.random() * 1000); db.push(tx); 
            if (APP_MODE === 'CLOUD') { pendingSync.push(tx); setLS('pending_sync', JSON.stringify(pendingSync)); }
            saveLocalDB(db); closeModal('txModal'); updateUI(document.getElementById('searchTxInput') ? document.getElementById('searchTxInput').value : ''); 
            showToast("Disimpan di Lokal"); 
        }
    } finally { document.getElementById('tx-is-saving').value = 'false'; }
});

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

async function verifyActionPinFinal() { 
    const inputVal = document.getElementById('inputActionPin').value; const hashedInput = await hashPIN(inputVal); 
    if (hashedInput === profile.pin) { 
        closeModal('actionPinModal'); 
        const action = document.getElementById('actionPinType').value; const payload = document.getElementById('actionPinPayload').value; 
        if (action === 'delete') executeTxDeleteFinal(payload); 
        else if (action === 'edit') openEditTxModal(payload);
        else if (action === 'reset') executeFactoryReset();
        else if (action === 'edit_profile') openProfileEdit();
    } else { showToast("PIN Salah! Akses Ditolak.", "error"); } 
}

function executeTxDeleteFinal(txId) {
    openCustomConfirm("Hapus Transaksi", "Data yang dihapus akan menghilang dari sistem laporan.", async () => {
        const idx = db.findIndex(t => String(t.id) === txId || String(t.date) === txId); if (idx === -1) return; const delTx = db[idx]; db.splice(idx, 1);
        if (APP_MODE === 'CLOUD' && currentUser && currentUser.id !== 'offline_user' && navigator.onLine && sbClient && delTx.id) { try { await sbClient.from('transactions').delete().eq('id', delTx.id); } catch(e) {} } else { pendingSync = pendingSync.filter(t => String(t.id) !== txId && String(t.date) !== txId); setLS('pending_sync', JSON.stringify(pendingSync)); }
        saveLocalDB(db); updateUI(document.getElementById('searchTxInput') ? document.getElementById('searchTxInput').value : ''); showToast("Data Dihapus.", "success");
    });
}

function selectEditCategory(val) { document.getElementById('edit-tx-category').value = val; document.getElementById('dispEditTxCat').innerText = val; closeModal(''); }
function openEditTxModal(txId) {
    const tx = db.find(t => String(t.id) === txId || String(t.date) === txId); if(!tx) return;
    document.getElementById('edit-tx-id').value = txId;
    
    const box = document.getElementById('editCatOptionsBox'); const arr = tx.type === 'masuk' ? categories.masuk : categories.keluar; 
    box.innerHTML = arr.map(c => `<div class="custom-option text-neutral" onclick="selectEditCategory('${c}')">${c}</div>`).join(''); 
    if(!arr.includes(tx.category)) box.innerHTML += `<div class="custom-option text-neutral" onclick="selectEditCategory('${tx.category}')">${tx.category}</div>`; 
    selectEditCategory(tx.category);

    document.getElementById('edit-tx-date-hidden').value = tx.date;
    document.getElementById('disp-edit-tx-date').innerText = formatDetailDate(tx.date);
    document.getElementById('edit-tx-desc').value = tx.desc;
    
    if(tx.pihak_terkait) {
        let parts = tx.pihak_terkait.split(' '); let potentialTitle = parts[0]; let recognizedTitles = ['Murid', 'Ustadz/ah', 'Pengurus', 'Tokoh', 'Bapak/Ibu'];
        if(recognizedTitles.some(t => potentialTitle.includes(t))) {
            let titleFull = parts.shift();
            if(titleFull === 'Pengurus' && parts[0] === 'Masjid') { titleFull = 'Pengurus Masjid'; parts.shift(); }
            if(titleFull === 'Tokoh' && parts[0] === 'Masyarakat') { titleFull = 'Tokoh Masyarakat'; parts.shift(); }
            selectEditTitle(titleFull); document.getElementById('edit-tx-pihak').value = parts.join(' ');
        } else {
            selectEditTitle('Bapak/Ibu'); document.getElementById('edit-tx-pihak').value = tx.pihak_terkait;
        }
    } else { selectEditTitle('Bapak/Ibu'); document.getElementById('edit-tx-pihak').value = ''; }

    editRawAmount = tx.amount;
    document.getElementById('edit-tx-amount').value = tx.amount.toLocaleString('id-ID');
    openModal('editTxModal');
}
const editTxAmtInput = document.getElementById('edit-tx-amount');
if(editTxAmtInput) editTxAmtInput.addEventListener('input', function() { let v = this.value.replace(/[^0-9]/g, ''); if(v === '') { editRawAmount = 0; this.value = ''; return; } editRawAmount = parseInt(v, 10); this.value = editRawAmount.toLocaleString('id-ID'); });

async function saveEditedTransaction() {
    const txId = document.getElementById('edit-tx-id').value;
    const idx = db.findIndex(t => String(t.id) === txId || String(t.date) === txId); if(idx === -1) return;
    
    const cat = document.getElementById('edit-tx-category').value;
    const desc = document.getElementById('edit-tx-desc').value.trim();
    const date = document.getElementById('edit-tx-date-hidden').value;
    const tTitle = document.getElementById('edit-tx-title-val').value;
    const tPihak = document.getElementById('edit-tx-pihak').value.trim();
    
    if(!desc || editRawAmount <= 0) { showToast("Data tidak valid", "error"); return; }

    db[idx].category = cat; db[idx].desc = desc; db[idx].date = date; db[idx].pihak_terkait = tPihak ? `${tTitle} ${properTitleCase(tPihak)}` : ''; db[idx].amount = editRawAmount;

    if(APP_MODE === 'CLOUD' && navigator.onLine && sbClient && db[idx].id) {
        try { await sbClient.from('transactions').update({ category: cat, desc: desc, date: date, pihak_terkait: db[idx].pihak_terkait, amount: editRawAmount }).eq('id', db[idx].id); } catch(e) {}
    }
    saveLocalDB(db); closeModal('editTxModal'); updateUI(); showToast("Berhasil Diubah");
}

// ==========================================
// TRANSFER ANTAR DOMPET
// ==========================================
function openTransferDaruratModal() { document.getElementById('transfer-amount').value = ''; document.getElementById('transfer-desc').value = ''; openModal('transferDaruratModal'); }
function selectTransferSource(val, label) { document.getElementById('transfer-source-val').value = val; document.getElementById('dispTransferSource').innerText = label; closeModal(''); }

async function executeTransferDarurat() {
    const source = document.getElementById('transfer-source-val').value;
    const amountVal = document.getElementById('transfer-amount').value.replace(/[^0-9]/g, ''); const amount = amountVal ? parseInt(amountVal, 10) : 0;
    const desc = document.getElementById('transfer-desc').value.trim() || 'Alokasi Dana Darurat';
    if(amount <= 0) { showToast("Nominal tidak valid", "error"); return; }
    
    const nowISO = new Date().toISOString();
    const txOut = { wallet: source, type: 'keluar', category: 'Lainnya', desc: desc, pihak_terkait: 'Pengurus Transfer Internal', link_bukti: '', amount: amount, status: 'normal', date: nowISO };
    const txIn = { wallet: 'darurat', type: 'masuk', category: 'Dana Cadangan', desc: desc, pihak_terkait: 'Pengurus Transfer Internal', link_bukti: '', amount: amount, status: 'normal', date: nowISO };
    processDualTransaction(txOut, txIn, 'transferDaruratModal');
}

function openTransferAntarDompetModal() { document.getElementById('transfer2-amount').value = ''; document.getElementById('transfer2-desc').value = ''; openModal('transferAntarDompetModal'); }
function selectTransferFrom(val, label) { document.getElementById('transfer-from-val').value = val; document.getElementById('dispTransferFrom').innerText = label; closeModal(''); }
function selectTransferTo(val, label) { document.getElementById('transfer-to-val').value = val; document.getElementById('dispTransferTo').innerText = label; closeModal(''); }

async function executeTransferAntarDompet() {
    const source = document.getElementById('transfer-from-val').value; const target = document.getElementById('transfer-to-val').value;
    const amountVal = document.getElementById('transfer2-amount').value.replace(/[^0-9]/g, ''); const amount = amountVal ? parseInt(amountVal, 10) : 0;
    const desc = document.getElementById('transfer2-desc').value.trim() || `Transfer dari ${source} ke ${target}`;
    
    if(source === target) { showToast("Dompet asal & tujuan sama!", "error"); return; }
    if(amount <= 0) { showToast("Nominal tidak valid", "error"); return; }

    const nowISO = new Date().toISOString();
    const txOut = { wallet: source, type: 'keluar', category: 'Lainnya', desc: desc, pihak_terkait: 'Pengurus Transfer Internal', link_bukti: '', amount: amount, status: 'normal', date: nowISO };
    const txIn = { wallet: target, type: 'masuk', category: 'Lainnya', desc: desc, pihak_terkait: 'Pengurus Transfer Internal', link_bukti: '', amount: amount, status: 'normal', date: nowISO };
    processDualTransaction(txOut, txIn, 'transferAntarDompetModal');
}

async function processDualTransaction(txOut, txIn, modalId) {
    if(APP_MODE === 'CLOUD' && navigator.onLine && sbClient && (!currentUser || currentUser.id !== 'offline_user')) { 
        try { 
            let dOut = { ...txOut, user_id: currentUser.id }; let dIn = { ...txIn, user_id: currentUser.id };
            const { error } = await sbClient.from('transactions').insert([dOut, dIn]); 
            if(error) throw error;
            await fetchUserTransactions(); closeModal(modalId); showToast("Transfer Berhasil (Cloud)"); 
        } catch(e) { 
            txOut.id = Date.now() + Math.random(); txIn.id = Date.now() + Math.random() + 1;
            db.push(txOut, txIn); pendingSync.push(txOut, txIn); setLS('pending_sync', JSON.stringify(pendingSync)); saveLocalDB(db); closeModal(modalId); updateUI();
            showToast("Transfer Offline Masuk Antrean.", "syncing"); 
        }
    } else { 
        txOut.id = Date.now() + Math.random(); txIn.id = Date.now() + Math.random() + 1;
        db.push(txOut, txIn); if (APP_MODE === 'CLOUD') { pendingSync.push(txOut, txIn); setLS('pending_sync', JSON.stringify(pendingSync)); }
        saveLocalDB(db); closeModal(modalId); updateUI(); showToast("Transfer Berhasil (Lokal)"); 
    }
}
document.getElementById('transfer-amount')?.addEventListener('input', function() { let v = this.value.replace(/[^0-9]/g, ''); this.value = v ? parseInt(v, 10).toLocaleString('id-ID') : ''; });
document.getElementById('transfer2-amount')?.addEventListener('input', function() { let v = this.value.replace(/[^0-9]/g, ''); this.value = v ? parseInt(v, 10).toLocaleString('id-ID') : ''; });

// ==========================================
// WISHLIST, DRIVE, & CSV EXPORT
// ==========================================
function renderWishlist() {
    const container = document.getElementById('wishlistContainer'); if(!container) return;
    if(wishlists.length === 0) { container.innerHTML = `<div class="glass-card text-neutral" style="text-align:center; padding: 20px; font-size:12px;">Belum ada target.</div>`; return; }
    container.innerHTML = wishlists.map(w => `
        <div class="glass-card" style="padding:15px; display:flex; justify-content:space-between; align-items:center;">
            <div><div style="font-size:15px; font-weight:900;" class="text-neutral">${w.name}</div><div style="font-size:13px; font-weight:700; color:var(--text-muted); margin-top:4px;">Butuh: <span class="text-neutral">${formatRp(w.amount)}</span></div></div>
            <button onclick="deleteWishlist('${w.id}')" class="btn-icon-danger">${svgs.trash}</button>
        </div>
    `).join('');
}
function openAddWishlistModal() { document.getElementById('wishlist-name').value = ''; document.getElementById('wishlist-amount').value = ''; openModal('addWishlistModal'); }
function saveWishlist() {
    const name = properTitleCase(document.getElementById('wishlist-name').value.trim()); const amountVal = document.getElementById('wishlist-amount').value.replace(/[^0-9]/g, ''); const amount = amountVal ? parseInt(amountVal, 10) : 0;
    if(!name || amount <= 0) { showToast("Data tidak valid", "error"); return; }
    wishlists.push({ id: Date.now().toString(), name, amount }); setLS('wishlists', JSON.stringify(wishlists)); renderWishlist(); closeModal('addWishlistModal'); showToast("Tersimpan");
}
function deleteWishlist(id) { wishlists = wishlists.filter(w => w.id !== id); setLS('wishlists', JSON.stringify(wishlists)); renderWishlist(); }
document.getElementById('wishlist-amount')?.addEventListener('input', function() { let v = this.value.replace(/[^0-9]/g, ''); this.value = v ? parseInt(v, 10).toLocaleString('id-ID') : ''; });

function renderDriveLinks() {
    const container = document.getElementById('driveContainer'); if(!container) return;
    if(driveLinks.length === 0) { container.innerHTML = `<div class="glass-card text-neutral" style="text-align:center; padding: 20px; width:100%; font-size:12px;">Kosong.</div>`; return; }
    container.innerHTML = driveLinks.map(d => `
        <div class="glass-card" style="padding:12px 15px; display:flex; align-items:center; gap:10px; min-width:200px; flex-shrink:0;">
            ${svgs.link} <a href="${d.url}" target="_blank" rel="noopener" class="text-neutral" style="text-decoration:none; font-size:13px; font-weight:800; flex:1; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${d.name}</a>
            <button onclick="deleteDriveLink('${d.id}')" class="btn-icon-danger" style="width:28px; height:28px; padding:4px;">${svgs.trash}</button>
        </div>
    `).join('');
}
function openAddDriveModal() { document.getElementById('drive-name').value = ''; document.getElementById('drive-url').value = ''; openModal('addDriveModal'); }
function saveDriveLink() {
    const name = properTitleCase(document.getElementById('drive-name').value.trim()); const url = document.getElementById('drive-url').value.trim();
    if(!name || !url.startsWith('http')) { showToast("URL tidak valid", "error"); return; }
    driveLinks.push({ id: Date.now().toString(), name, url }); setLS('drivelinks', JSON.stringify(driveLinks)); renderDriveLinks(); closeModal('addDriveModal'); showToast("Tersimpan");
}
function deleteDriveLink(id) { driveLinks = driveLinks.filter(d => d.id !== id); setLS('drivelinks', JSON.stringify(driveLinks)); renderDriveLinks(); }

function openCSVModal() { 
    if(db.length === 0) { showToast("Data kosong.", "error"); return; } 
    document.getElementById('csv-start-hidden').value = ''; document.getElementById('disp-csv-start').innerText = 'Pilih...'; document.getElementById('csv-end-hidden').value = ''; document.getElementById('disp-csv-end').innerText = 'Pilih...';
    openModal('csvExportModal'); 
}
function executeCSVExport() { 
    closeModal('csvExportModal'); let csv = "Tanggal,Dompet,Tipe,Kategori,Keterangan,Pihak_Terkait,Link_Drive,Nominal\n"; 
    const startDateVal = document.getElementById('csv-start-hidden').value; const endDateVal = document.getElementById('csv-end-hidden').value;
    const filteredData = db.filter(tx => { 
        if(tx.wallet !== activeWallet) return false; 
        let txDate = new Date(tx.date); txDate.setHours(0,0,0,0);
        if (startDateVal) { let sDate = new Date(startDateVal); sDate.setHours(0,0,0,0); if (txDate < sDate) return false; }
        if (endDateVal) { let eDate = new Date(endDateVal); eDate.setHours(23,59,59,999); if (txDate > eDate) return false; }
        return true; 
    });
    if(filteredData.length === 0) { showToast("Data filter kosong.", "error"); return; }
    [...filteredData].sort((a,b) => new Date(a.date) - new Date(b.date)).forEach(row => { let r = [formatDetailDate(row.date), row.wallet, row.type, row.category, row.desc, row.pihak_terkait||'-', row.link_bukti||'-', row.amount]; csv += r.map(v => `"${v}"`).join(",") + "\n"; }); 
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' }); const link = document.createElement("a"); link.href = URL.createObjectURL(blob); link.download = `Laporan_TPA_${activeWallet.toUpperCase()}_${new Date().toISOString().split('T')[0]}.csv`; 
    document.body.appendChild(link); link.click(); document.body.removeChild(link); showToast("Berhasil Diunduh", "success"); 
}

function clearSearch() { document.getElementById('searchTxInput').value = ''; document.getElementById('searchClearBtn').style.display = 'none'; updateUI(''); }

// ==========================================
// ADMIN: SPP & ABSENSI ENGINE (Backward Logging)
// ==========================================
function registerStudent() {
    const input = document.getElementById('newStudentName'); const name = properTitleCase(input.value.trim());
    if (!name) { showToast("Nama murid wajib diisi", "error"); return; }
    sppData.push({ id: Date.now().toString(), name: name, months: [], presentToday: false, attendLogs: [] });
    setLS('spp_data_v51', JSON.stringify(sppData)); input.value = ''; renderAdminStudentTable(); showToast("Murid terdaftar", "success");
}

function deleteStudentAdmin(id) { 
    openCustomConfirm("Hapus Murid", "Riwayat SPP dan Absen murid ini akan hilang permanen.", () => {
        sppData = sppData.filter(s => s.id !== id); setLS('spp_data_v51', JSON.stringify(sppData)); renderAdminStudentTable(); showToast("Dihapus", "success");
    });
}

function openEditStudentModal(id) {
    const s = sppData.find(x => x.id === id); if(!s) return;
    document.getElementById('editStudentTargetId').value = id; document.getElementById('editStudentNameInput').value = s.name;
    openModal('editStudentModal');
}
function saveEditStudentName() {
    const id = document.getElementById('editStudentTargetId').value; const newName = properTitleCase(document.getElementById('editStudentNameInput').value.trim());
    if(!newName) return; const sIdx = sppData.findIndex(x => x.id === id);
    if(sIdx > -1) { sppData[sIdx].name = newName; setLS('spp_data_v51', JSON.stringify(sppData)); closeModal('editStudentModal'); renderAdminStudentTable(); showToast("Nama Diubah"); }
}

function filterAdminStudentTable() {
    const query = document.getElementById('searchStudentAdmin').value.toLowerCase();
    const rows = document.querySelectorAll('.admin-spp-row');
    rows.forEach(row => { const name = row.querySelector('td').innerText.toLowerCase(); row.style.display = name.includes(query) ? '' : 'none'; });
}

function openMultiMonthSelect(id) {
    const s = sppData.find(x => x.id === id); if(!s) return;
    document.getElementById('multiMonthTargetId').value = id; document.getElementById('multiMonthStudentName').innerText = `SPP: ${s.name}`;
    const grid = document.getElementById('multiMonthGrid');
    grid.innerHTML = monthsArr.map(m => `
        <div><input type="checkbox" id="cb_${m}" value="${m}" class="spp-month-cb" ${s.months.includes(m) ? 'checked' : ''}><label for="cb_${m}" class="spp-month-label">${m.substring(0,3)}</label></div>
    `).join('');
    openModal('multiMonthSelectModal');
}

function saveMultiMonthSpp() {
    const id = document.getElementById('multiMonthTargetId').value; const sIdx = sppData.findIndex(x => x.id === id); if(sIdx === -1) return;
    const selected = []; document.querySelectorAll('.spp-month-cb:checked').forEach(cb => selected.push(cb.value));
    sppData[sIdx].months = selected; setLS('spp_data_v51', JSON.stringify(sppData)); closeModal('multiMonthSelectModal'); renderAdminStudentTable(); showToast("Status SPP Diperbarui");
}

function openAbsenDetailModal(id) {
    const s = sppData.find(x => x.id === id); if(!s) return;
    document.getElementById('absenTargetId').value = id; document.getElementById('absenStudentName').innerText = `Absensi: ${s.name}`;
    const grid = document.getElementById('absenDaysGrid'); const today = new Date(); let html = '';
    
    for(let i=0; i<7; i++) {
        let loopDate = new Date(); loopDate.setDate(today.getDate() - i);
        let dateStr = loopDate.toISOString().split('T')[0]; let displayStr = formatDetailDate(loopDate.toISOString()).split(' - ')[0];
        let isPresent = s.attendLogs ? s.attendLogs.some(l => l.time.startsWith(dateStr) && l.status === 'Hadir') : false;

        html += `
        <div class="border-box" style="display:flex; justify-content:space-between; align-items:center; background:var(--hitam-btn); border-radius:10px;">
            <span style="font-size:12px; font-weight:800; color:var(--teks-netral);">${i===0?'HARI INI':displayStr}</span>
            <div style="display:flex; gap:10px;">
                <label style="font-size:11px; display:flex; align-items:center; gap:4px; color:var(--hijau);"><input type="radio" name="abs_${i}" value="Hadir" onchange="saveAbsenMundur('${id}', '${dateStr}', 'Hadir')" ${isPresent?'checked':''}> Hadir</label>
                <label style="font-size:11px; display:flex; align-items:center; gap:4px; color:var(--merah-solid);"><input type="radio" name="abs_${i}" value="Absen" onchange="saveAbsenMundur('${id}', '${dateStr}', 'Absen')" ${!isPresent?'checked':''}> Absen</label>
            </div>
        </div>`;
    }
    grid.innerHTML = html; openModal('absenDetailModal');
}

function saveAbsenMundur(id, dateStr, statusVal) {
    const sIdx = sppData.findIndex(x => x.id === id);
    if(sIdx > -1) {
        if(!sppData[sIdx].attendLogs) sppData[sIdx].attendLogs = [];
        sppData[sIdx].attendLogs = sppData[sIdx].attendLogs.filter(l => !l.time.startsWith(dateStr));
        const fakeTime = `${dateStr}T16:00:00.000Z`; sppData[sIdx].attendLogs.unshift({ status: statusVal, time: fakeTime });
        sppData[sIdx].attendLogs.sort((a,b) => new Date(b.time) - new Date(a.time)); if(sppData[sIdx].attendLogs.length > 20) sppData[sIdx].attendLogs.length = 20;

        const todayStr = new Date().toISOString().split('T')[0];
        if(dateStr === todayStr) { sppData[sIdx].presentToday = (statusVal === 'Hadir'); renderAdminStudentTable(); }
        setLS('spp_data_v51', JSON.stringify(sppData));
    }
}

function toggleAttendance(id, isPresent) {
    const sIdx = sppData.findIndex(x => x.id === id);
    if(sIdx > -1) {
        sppData[sIdx].presentToday = isPresent; if(!sppData[sIdx].attendLogs) sppData[sIdx].attendLogs = [];
        const nowISO = new Date().toISOString(); const todayStr = nowISO.split('T')[0];
        sppData[sIdx].attendLogs = sppData[sIdx].attendLogs.filter(l => !l.time.startsWith(todayStr));
        sppData[sIdx].attendLogs.unshift({ status: isPresent ? 'Hadir' : 'Batal / Absen', time: nowISO });
        sppData[sIdx].attendLogs.sort((a,b) => new Date(b.time) - new Date(a.time)); if(sppData[sIdx].attendLogs.length > 20) sppData[sIdx].attendLogs.length = 20;
        setLS('spp_data_v51', JSON.stringify(sppData));
    }
}

function downloadAbsensiCSV() {
    if(sppData.length === 0) { showToast("Data murid kosong.", "error"); return; }
    let csv = "Nama_Murid,Bulan_Lunas,Status_Hadir_Hari_Ini,Log_Absensi_Mingguan\n";
    sppData.forEach(s => {
        const bln = s.months.join(" & ") || "Belum Ada"; const hdr = s.presentToday ? "HADIR" : "TIDAK HADIR";
        const logs = (s.attendLogs || []).map(l => `[${formatDetailDate(l.time)}: ${l.status}]`).join(" | "); csv += `"${s.name}","${bln}","${hdr}","${logs}"\n`;
    });
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' }); const link = document.createElement("a"); link.href = URL.createObjectURL(blob); link.download = `Rekap_Absen_TPA_${new Date().toISOString().split('T')[0]}.csv`; 
    document.body.appendChild(link); link.click(); document.body.removeChild(link); showToast("Rekap Absen Diunduh", "success");
}

// ==========================================
// PUBLIC PORTAL ENGINE & SHARE LINK
// ==========================================
function openShareLinkModal() { 
    const loc = window.location; const url = `${loc.protocol}//${loc.host}${loc.pathname}?view=public`;
    document.getElementById('publicLinkInput').value = url; openModal('shareLinkModal'); 
}
function copyPublicLink() {
    const input = document.getElementById('publicLinkInput'); input.select(); input.setSelectionRange(0, 99999); 
    try { navigator.clipboard.writeText(input.value); showToast("Tautan Disalin!", "success"); } catch(e) { document.execCommand("copy"); showToast("Disalin!", "success"); }
}

function handlePublicAutocomplete() {
    const val = document.getElementById('publicStudentInput').value.toLowerCase(); const list = document.getElementById('publicAutocompleteList');
    if (!val) { list.classList.add('hidden'); return; }
    const matches = sppData.filter(s => s.name.toLowerCase().includes(val));
    if (matches.length === 0) { list.classList.add('hidden'); return; }
    list.innerHTML = matches.map(m => `<div class="custom-option text-neutral" onclick="selectPublicStudent('${m.name}')">${m.name}</div>`).join('');
    list.classList.remove('hidden');
}

function selectPublicStudent(name) { document.getElementById('publicStudentInput').value = name; document.getElementById('publicAutocompleteList').classList.add('hidden'); }

// ==========================================
// PROFILE VIEW & REQUESTS
// ==========================================
function openProfileView() { 
    document.getElementById('viewGoogleStatus').innerText = (APP_MODE === 'CLOUD') ? (profile.googleEmail || currentUser?.email || "Terhubung") : "Tidak Terhubung";
    document.getElementById('viewGoogleStatus').style.color = (APP_MODE === 'CLOUD') ? 'var(--hijau-terang)' : 'var(--text-muted)';
    document.getElementById('textGoogleLink').innerText = (APP_MODE === 'CLOUD') ? "Logout" : "Hubungkan";
    document.getElementById('viewJoinDate').innerText = "Bergabung: " + formatDetailDate(profile.joinDate).split(' - ')[0];
    
    document.getElementById('btnGoogleLink').onclick = () => {
        if(APP_MODE === 'CLOUD') { openCustomConfirm("Logout Cloud", "Keluar ke Mode Guest? Data aman tersimpan.", async () => { if(sbClient && navigator.onLine) await sbClient.auth.signOut(); else forceLogoutToGuest(); }); } else { openModal('googleAuthModal'); }
    };
    openModal('profileViewModal'); 
}

function requestProfileEdit() { 
    if(profile.pin && profile.pin !== '') { 
        closeModal('profileViewModal'); document.getElementById('actionPinType').value = 'edit_profile'; document.getElementById('inputActionPin').value = ''; openModal('actionPinModal'); 
    } else { openProfileEdit(); } 
}

function openProfileEdit() { 
    document.getElementById('editProfileImg').src = profile.photo; 
    document.getElementById('editName').value = profile.name !== 'Pengurus Baru' ? profile.name : ''; 
    selectGender(profile.gender); document.getElementById('editPin').value = ''; openModal('profileEditModal'); 
}
function selectGender(val) { document.getElementById('editGender').value = val; document.getElementById('dispGenderVal').innerText = val; closeModal(''); }

const profileUploader = document.getElementById('profileUploader');
if(profileUploader) profileUploader.addEventListener('change', function(e) { 
    const f = e.target.files[0]; if(!f) return; showToast("Memproses Foto...", "syncing"); const reader = new FileReader(); 
    reader.onload = function(evt) { const img = new Image(); img.onload = function() { 
        const canvas = document.createElement('canvas'); const MAX = 300; let w = img.width, h = img.height; 
        if(w > h) { if(w > MAX) { h *= MAX/w; w = MAX; } } else { if(h > MAX) { w *= MAX/h; h = MAX; } } 
        canvas.width = w; canvas.height = h; canvas.getContext('2d').drawImage(img, 0, 0, w, h); 
        profile.photo = canvas.toDataURL('image/jpeg', 0.6); document.getElementById('editProfileImg').src = profile.photo; 
    }; img.src = evt.target.result; }; reader.readAsDataURL(f); 
});

// ==========================================
// EXTRAS: GOOGLE AUTH, OTP EMAILJS, & RESET
// ==========================================
document.getElementById('btnRealGoogleLogin')?.addEventListener('click', async () => { 
    const msg = document.getElementById('googleAuthStatusMsg');
    msg.innerText = "Memproses login ke Google..."; msg.style.color = 'var(--biru)';
    if(typeof window.supabase === 'undefined' || !sbClient || !navigator.onLine) { msg.innerText = "Gagal menyambung. Cek koneksi internet."; msg.style.color = 'var(--merah-solid)'; return; }
    try { await sbClient.auth.signInWithOAuth({ provider: 'google', options: { redirectTo: window.location.origin + window.location.pathname } }); } catch (e) { msg.innerText = "Terjadi kesalahan sistem OAuth."; msg.style.color = 'var(--merah-solid)'; }
});

function initResetSequence() { 
    if(!profile.pin) { showToast("Buat PIN Keamanan dahulu di menu Edit Profil.", "error"); return; } 
    closeModal('profileViewModal'); document.getElementById('actionPinType').value = 'reset'; document.getElementById('inputActionPin').value = ''; openModal('actionPinModal'); 
}
async function executeFactoryReset() { 
    showToast("Membersihkan Database...", "syncing"); 
    try { if(APP_MODE === 'CLOUD' && navigator.onLine && sbClient) { await sbClient.from('transactions').delete().eq('user_id', currentUser.id); } } catch(e) {}
    db = []; sppData = []; attendanceData = { lastReset: new Date().toISOString(), records: {} }; pendingSync = []; wishlists = []; driveLinks = [];
    removeLS('cloud_db'); removeLS('guest_db'); removeLS('spp_data_v51'); removeLS('attendance_data_v51'); removeLS('pending_sync'); removeLS('wishlists'); removeLS('drivelinks');
    updateUI(''); renderWishlist(); renderDriveLinks(); showToast("Reset Selesai.", "success"); 
}

function startOTPResetProcess() { 
    closeModal('actionPinModal'); 
    if(!profile.googleLinked || !profile.googleEmail) { showToast("Akun belum terhubung Cloud!", "error"); return; } 
    if(!navigator.onLine) { showToast("Butuh koneksi internet!", "error"); return; } 
    document.getElementById('displayUserEmail').innerText = profile.googleEmail; openModal('otpRequestModal'); 
}
function sendOTPEmail() { 
    const btn = document.getElementById('btnSendOTP'); btn.innerText = "Mengirim..."; btn.disabled = true; 
    generatedOTP = Math.floor(100000 + Math.random() * 900000).toString(); otpExpiryTime = Date.now() + 300000; 
    if (typeof emailjs !== 'undefined') {
        emailjs.send('service_l08406o', 'template_osq8mgb', { to_email: profile.googleEmail, to_name: profile.name, otp_code: generatedOTP })
        .then(() => { showToast("OTP Terkirim ke Email!"); closeModal('otpRequestModal'); openModal('otpVerifyModal'); btn.innerText="Kirim Kode OTP"; btn.disabled=false; })
        .catch(() => { showToast("Gagal kirim email. Cek limitasi API.", "error"); btn.innerText="Kirim Kode OTP"; btn.disabled=false; }); 
    } else { showToast("Sistem Email Offline.", "error"); btn.innerText="Kirim Kode OTP"; btn.disabled=false; }
}
async function verifyOTPAndSavePin() { 
    const c = document.getElementById('inputOTP').value; const np = document.getElementById('inputNewPinOTP').value; 
    if(Date.now() > otpExpiryTime) { showToast("OTP Kadaluarsa!", "error"); return; } 
    if(c !== generatedOTP) { showToast("OTP Salah!", "error"); return; } 
    if(np.length < 4) { showToast("PIN minimal 4 digit!", "error"); return; } 
    profile.pin = await hashPIN(np); setLS('profile_secure_v51', JSON.stringify(profile)); 
    if(APP_MODE === 'CLOUD' && sbClient) sbClient.from('profiles').upsert({ id: currentUser.id, data: profile });
    generatedOTP = ""; closeModal('otpVerifyModal'); showToast("PIN Berhasil Direset!"); 
}

function triggerDevSupportNotification() {
    if(isPublicMode) return;
    const msgs = ["Bantu Developer terus update aplikasi dengan klik tombol 'Traktir Kopi' di menu Profil 🙏", "Aplikasi bermanfaat? Dukung Developer via SociaBuzz di menu Profil ☕", "TPA Finance 100% Gratis. Dukung pemeliharaan server di menu Profil ❤️"];
    showToast(msgs[Math.floor(Math.random() * msgs.length)], "support");
}
setInterval(triggerDevSupportNotification, 180000); 

// KICKSTART APP
bootApp();
