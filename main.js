/* =========================================================
   TPA FINANCE v4.4 - ENTERPRISE CORE LOGIC
   Strict Mode, Z-Index Engine, Custom UI, Supabase Realtime
========================================================= */

"use strict";

const APP_VERSION = '4.4'; 
const LS_PREFIX = 'tpa_finance_v4_';

const SUPABASE_URL = 'https://ndsyyaxmiwskrkklseap.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5kc3l5YXhtaXdza3Jra2xzZWFwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODUxNDU4NjIsImV4cCI6MjEwMDcyMTg2Mn0.uXgAIhUjjkNpe9s6N6LGvRXZLUDQUZJrSfUFf1BDmKU';
const SECRET_KEY = "TPA_Finance_Secure_K3y_v4";

// ==========================================
// STATE MANAGEMENT & VARIABLES
// ==========================================
let sbClient = null;
let db = []; 
let pendingSync = JSON.parse(getLS('pending_sync')) || []; 
let wishlists = JSON.parse(getLS('wishlists')) || [];
let driveLinks = JSON.parse(getLS('drivelinks')) || [];
let sppData = JSON.parse(getLS('spp_data_v4')) || [];
let attendanceData = JSON.parse(getLS('attendance_data_v4')) || { lastReset: new Date().toISOString(), records: {} };
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

const defaultProfile = { 
    name: 'Pengurus', pin: '', 
    photo: 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAyNCAyNCIgZmlsbD0iIzEwYjk4MSI+PHBhdGggZD0iTTEyIDJhNSA1IDAgMSAwIDUgNSBNMTIgMTRhNyA3IDAgMCAwLTcgN3YxSDE5di0xYTcgNyAwIDAgMC03LTdaIi8+PC9zdmc+', 
    joinDate: new Date().toISOString(), birthDate: '', gender: 'Rahasia', googleLinked: false, googleEmail: ''
};
let profile = JSON.parse(getLS('profile_secure_v4'));
if (!profile) { profile = { ...defaultProfile }; setLS('profile_secure_v4', JSON.stringify(profile)); }

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
    shield: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>`
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
    if (type === 'keluar') return '#ef4444'; // Merah keluar mutlak
    const inColors = { 'Wakaf': '#a855f7', 'Infak Santri': '#10b981', 'Donasi Masyarakat': '#3b82f6', 'Bantuan Pemerintah': '#f59e0b', 'Hibah': '#10b981' };
    if (inColors[categoryStr]) return inColors[categoryStr];
    let hash = 0; for(let i = 0; i < categoryStr.length; i++) hash = categoryStr.charCodeAt(i) + ((hash << 5) - hash);
    return `hsl(${Math.abs(hash) % 360}, 70%, 55%)`; 
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

function showToast(msg, type = 'success') { 
    const box = document.getElementById('toastBox'); if(!box) return; 
    const t = document.createElement('div'); t.className = `toast ${type}`; t.innerHTML = msg; box.appendChild(t); 
    setTimeout(() => t.classList.add('show'), 10); 
    setTimeout(() => { t.classList.remove('show'); setTimeout(() => t.remove(), 400); }, 3500); 
}

// ==========================================
// Z-INDEX MODAL ENGINE (Mencegah Overlap & Scroll Bleed)
// ==========================================
let modalStack = [];
function openModal(id) {
    const el = document.getElementById(id);
    if (!el) return;
    
    // Hitung Z-Index Dinamis
    const baseZIndex = 10000;
    const currentZIndex = baseZIndex + (modalStack.length * 10);
    
    el.style.zIndex = currentZIndex;
    el.classList.add('active');
    
    if (!modalStack.includes(id)) { modalStack.push(id); }
    
    // Kunci Scroll Body
    document.body.classList.add('modal-open');
}

function closeModal(id) {
    // Menutup modal tertentu atau semua dropdown
    document.querySelectorAll('.custom-options.open').forEach(e => e.classList.remove('open'));
    if (!id) return;

    const el = document.getElementById(id);
    if (el) { el.classList.remove('active'); }
    
    // Hapus dari Stack
    modalStack = modalStack.filter(modalId => modalId !== id);
    
    // Buka Kunci Scroll jika Stack Kosong
    if (modalStack.length === 0) {
        document.body.classList.remove('modal-open');
    }
}

// Override open functions
function openCustomConfirm(title, desc, action) { 
    document.getElementById('confirmTitle').innerText = title; 
    document.getElementById('confirmDesc').innerHTML = desc; 
    window.confirmActionExec = action; 
    openModal('confirmModal'); 
}
document.getElementById('btnConfirmYes').addEventListener('click', () => { 
    if(window.confirmActionExec) window.confirmActionExec(); 
    closeModal('confirmModal'); 
});

// ==========================================
// DATABASE ENGINE
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
// INITIALIZATION & CLOUD SYNC
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
    
    // Cek Mode Public (Wali Santri)
    const urlParams = new URLSearchParams(window.location.search);
    if (urlParams.get('view') === 'public') {
        isPublicMode = true;
        initPublicPortal();
        return;
    }

    db = loadLocalDB(); 
    renderShortcuts();
    initAppHeader();
    renderWishlist();
    renderDriveLinks();
    checkAttendanceReset();
    updateUI('');

    const netStatus = document.getElementById('networkStatus');
    if (APP_MODE === 'CLOUD') {
        currentUser = { id: 'offline_user', email: profile.googleEmail || 'Cloud User' }; 
        if(netStatus) { netStatus.innerText = navigator.onLine ? "Menyambungkan..." : "Offline (Cloud)"; netStatus.className = navigator.onLine ? "status-sync sync-pending text-outline" : "status-sync sync-offline text-outline"; }
    } else {
        currentUser = null;
        if(netStatus) { netStatus.innerText = "Offline Mode (Guest)"; netStatus.className = "status-sync sync-offline text-outline"; }
    }
    
    setTimeout(initSupabaseBackground, 500);
    setInterval(triggerDevSupportNotification, 180000); // Tiap 3 Menit
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
                fetchUserTransactions(); 
                setupRealtime();
                if (pendingSync.length > 0) processPendingSync();
            } else { forceLogoutToGuest(); }
        } catch(err) { updateNetworkStatus("Server Lambat", "sync-offline"); }
    }

    // Auto-Ping agar DB Supabase tidak tertidur
    setInterval(async () => {
        if(APP_MODE === 'CLOUD' && navigator.onLine && sbClient && currentUser?.id !== 'offline_user') {
            try { await sbClient.from('profiles').select('id').limit(1); } catch(e){}
        }
    }, 60000);

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
                        if(profile.name === 'Pengurus') profile.name = properTitleCase(currentUser.user_metadata?.full_name) || 'Member'; 
                        profile.photo = currentUser.user_metadata?.avatar_url || profile.photo; 
                        await sbClient.from('profiles').upsert({ id: currentUser.id, data: profile });
                    }
                } catch(e) {}
                
                profile.googleLinked = true; profile.googleEmail = currentUser.email; 
                setLS('profile_secure_v4', JSON.stringify(profile));
                
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
        netStatus.className = `status-sync ${statusClass} text-outline`; 
    }
}

function forceLogoutToGuest() {
    currentUser = null; APP_MODE = 'GUEST'; setLS('app_mode', 'GUEST');
    profile = { ...defaultProfile }; setLS('profile_secure_v4', JSON.stringify(profile));
    removeLS('cloud_db'); removeLS('cloud_db_fallback'); db = loadLocalDB(); 
    initAppHeader(); renderShortcuts(); updateUI(''); 
    showToast("Berhasil Logout.", "success"); closeModal('profileViewModal');
    updateNetworkStatus(navigator.onLine ? "Online Mode (Guest)" : "Offline Mode (Guest)", navigator.onLine ? "sync-online" : "sync-offline");
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
// TEMA ENGINE (SMOOTH RADIAL)
// ==========================================
const iconSun = `<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="5"/><path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42"/></svg>`;
const iconMoon = `<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>`;
const savedTheme = getLS('app_theme') || 'dark';
document.documentElement.setAttribute('data-theme', savedTheme);
window.addEventListener('DOMContentLoaded', () => { updateThemeIcon(savedTheme); });

function toggleTheme() {
    document.body.classList.add('theme-animating');
    setTimeout(() => {
        const htmlEl = document.documentElement; const currentTheme = htmlEl.getAttribute('data-theme') || 'dark';
        const newTheme = currentTheme === 'dark' ? 'light' : 'dark'; 
        htmlEl.setAttribute('data-theme', newTheme); 
        setLS('app_theme', newTheme); 
        updateThemeIcon(newTheme);
        
        // Perbarui Meta Theme Color
        document.getElementById('metaThemeColor').setAttribute("content", newTheme === 'light' ? "#059669" : "#031a0f");
        
        updateUI(document.getElementById('searchTxInput') ? document.getElementById('searchTxInput').value : '');
    }, 350); // Eksekusi saat animasi ripple menutup layar

    setTimeout(() => {
        document.body.classList.remove('theme-animating');
    }, 700);
}

function updateThemeIcon(theme) { 
    const btn = document.getElementById('theme-icon'); if (!btn) return; 
    if (theme === 'light') { btn.innerHTML = iconMoon; } else { btn.innerHTML = iconSun; } 
}

// ==========================================
// UI & NAVIGATION ENGINE
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
// SHORTCUT RENDERING (Including Dana Darurat)
// ==========================================
function renderShortcuts() { 
    const c = document.getElementById('quickActionsContainer'); 
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
    let balance = tIn - tOut; const badge = document.getElementById('healthBadge'); const text = document.getElementById('healthText'); badge.className = 'health-badge glass-card'; 
    if (tIn === 0 && tOut === 0) { badge.classList.add('health-netral'); text.innerText = 'NETRAL'; } 
    else if (balance < 0) { badge.classList.add('health-defisit'); text.innerText = 'DEFISIT'; } 
    else if (balance >= 0 && balance <= 50000) { badge.classList.add('health-kritis'); text.innerText = 'KRITIS'; } 
    else { if (tOut > (tIn * 0.8)) { badge.classList.add('health-waspada'); text.innerText = 'WASPADA'; } else { badge.classList.add('health-sehat'); text.innerText = 'SEHAT'; } } 
    generateAIForecast(filteredDb); 
}

function generateAIForecast(data) { 
    const box = document.getElementById('aiInsightBox'); const textEl = document.getElementById('aiInsightText'); aiMessages = []; 
    if (data.length === 0) { 
        aiMessages.push(`Belum ada riwayat transaksi di dompet ${activeWallet.toUpperCase()}.`);
        if(APP_MODE === 'GUEST') aiMessages.push("Saran: Hubungkan Akun Google agar data TPA aman di Cloud.");
        box.style.borderLeftColor = 'var(--text-muted)'; box.querySelector('svg').style.color = 'var(--text-muted)'; startAICarousel(textEl); return; 
    } 

    const today = new Date(); const currentMonthData = data.filter(t => { const d = new Date(t.date); return d.getMonth() === today.getMonth() && d.getFullYear() === today.getFullYear(); }); 
    const masukData = currentMonthData.filter(t => t.type === 'masuk'); const keluarData = currentMonthData.filter(t => t.type === 'keluar'); 
    let mIn = masukData.reduce((sum, t) => sum + t.amount, 0); let mOut = keluarData.reduce((sum, t) => sum + t.amount, 0); 

    let biggestExpenseMsg = "Pengeluaran bulan ini masih terkendali.";
    if (keluarData.length > 0) { let catTotals = {}; keluarData.forEach(t => { catTotals[t.category] = (catTotals[t.category] || 0) + t.amount; }); let biggestCat = Object.keys(catTotals).reduce((a, b) => catTotals[a] > catTotals[b] ? a : b); biggestExpenseMsg = `Pengeluaran operasional terbesar bulan ini: ${properTitleCase(biggestCat)} (${formatRp(catTotals[biggestCat])}).`; }

    let statusMsg = "", projectionMsg = "";
    if (mOut > mIn && mIn > 0) { statusMsg = `⚠️ Peringatan: Pengeluaran dompet ${activeWallet} bulan ini melampaui pemasukan.`; projectionMsg = "Saran AI: Tinjau ulang anggaran operasional TPA atau tarik dari Dana Darurat."; box.style.borderLeftColor = 'var(--merah)'; box.querySelector('svg').style.color = 'var(--merah)'; } 
    else if (mOut > 0) { statusMsg = `Arus kas dompet ${activeWallet} berjalan normal.`; projectionMsg = "Tetap pantau alokasi dana agar sejalan dengan program kegiatan santri."; box.style.borderLeftColor = 'var(--kuning)'; box.querySelector('svg').style.color = 'var(--kuning)'; } 
    else if (mIn > 0 && mOut === 0) { statusMsg = "Luar biasa! Seluruh dana pemasukan bulan ini masih utuh."; projectionMsg = "Tips: Dana bisa dialokasikan untuk Dana Darurat atau perbaikan fasilitas."; box.style.borderLeftColor = 'var(--hijau)'; box.querySelector('svg').style.color = 'var(--hijau)'; } 
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

    renderTable(fd); renderCharts(fd);
}

function renderTable(data) {
    const t = document.getElementById('table-body');
    if(data.length === 0) { t.innerHTML = `<tr><td colspan="5" style="text-align:center; padding: 30px; color:var(--text-muted);">Data transaksi kosong.</td></tr>`; return; }

    let htmlStr = '';
    [...data].sort((a,b) => new Date(b.date) - new Date(a.date)).forEach(tx => {
        const iM = tx.type === 'masuk';
        let linkHtml = tx.link_bukti ? `<a href="${tx.link_bukti}" target="_blank" style="color:var(--biru); font-size:11px; font-weight:800; text-decoration:underline; display:block; margin-top:4px;" onclick="event.stopPropagation()">↗ Buka Dokumen Drive</a>` : '';
        let pihakHtml = tx.pihak_terkait ? `<br><span style="font-size:11px; color:var(--text-muted);">Pihak: <b class="text-neutral">${tx.pihak_terkait}</b></span>` : '';

        htmlStr += `<tr class="clickable-row" onclick="openReceipt('${tx.id || tx.date}')">
            <td style="color:var(--text-muted); font-size:11px; vertical-align:middle;">${formatDetailDate(tx.date).split(' - ')[0]}<br>${formatDetailDate(tx.date).split(' - ')[1]}</td>
            <td style="width:1%; white-space:nowrap; padding:15px 10px; vertical-align:middle;"><div class="badge-cat">${tx.category}</div></td>
            <td style="vertical-align:middle; width:100%;"><span class="text-neutral" style="font-weight:700;">${tx.desc}</span>${pihakHtml}${linkHtml}</td>
            <td style="vertical-align:middle; text-align:center; padding-right:15px; width:1%;">
                <div style="display:flex; gap:6px; justify-content:center;">
                    <button type="button" style="background:var(--hitam-btn); color:var(--teks-netral); border:1px solid var(--border); width:32px; height:32px; border-radius:8px; cursor:pointer;" onclick="promptActionPinFromTable(event, 'edit', '${tx.id || tx.date}')">✎</button>
                    <button type="button" style="background:var(--hitam-btn); color:var(--merah); border:1px solid var(--border); width:32px; height:32px; border-radius:8px; cursor:pointer;" onclick="promptActionPinFromTable(event, 'delete', '${tx.id || tx.date}')">✕</button>
                </div>
            </td>
            <td class="amt-cell" style="vertical-align:middle; text-align:right; color:var(--teks-netral); padding-left:0;">${iM?'+':'-'}${formatRp(tx.amount)}</td>
        </tr>`;
    });
    t.innerHTML = htmlStr;
}

function renderCharts(data) {
    if (typeof Chart === 'undefined') return;
    if (!document.getElementById('pieChart')) return; 
    Chart.defaults.color = '#8ba396'; Chart.defaults.font.family = 'Inter';
    if(data.length === 0) { if(pieChart) pieChart.destroy(); if(barChart) barChart.destroy(); if(lineChart) lineChart.destroy(); return; }

    const gridLineColor = 'rgba(255,255,255,0.05)';
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
    lineChart = new Chart(document.getElementById('lineChart'), { type: 'line', data: { labels: hI.map((_,i)=> `T${i+1}`), datasets: [{ label: 'Pemasukan Total', data: hI, borderColor: '#10b981', backgroundColor: 'rgba(16, 185, 129, 0.1)', fill: true, pointRadius: 2, tension: 0.4 }, { label: 'Pengeluaran Total', data: hO, borderColor: '#ef4444', backgroundColor: 'rgba(239, 68, 68, 0.1)', fill: true, pointRadius: 2, tension: 0.4 }] }, options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: { x: { display: false }, y: { grid: { color: gridLineColor } } } } });
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
        ${tx.link_bukti ? `<div class="receipt-row" style="margin-top:10px;"><span class="receipt-label" style="color:var(--text-muted);">Lampiran Drive</span><span class="receipt-val"><a href="${tx.link_bukti}" target="_blank" style="color:var(--biru); text-decoration:underline;">Buka Dokumen ↗</a></span></div>` : ''} 
        <div class="receipt-row" style="margin-top:25px; border-top:2px dashed var(--border); padding-top:20px; align-items: flex-end; flex-wrap: nowrap !important;"> 
            <span class="receipt-label" style="font-size:14px; color:var(--text-muted); flex-shrink: 0;">TOTAL</span> 
            <span class="receipt-val text-neutral" style="font-size: clamp(18px, 5.5vw, 24px); letter-spacing:-1px; white-space: nowrap !important; word-break: keep-all !important; flex-grow: 1; text-align: right;">${formatRp(tx.amount)}</span> 
        </div> 
    `; 
    openModal('receiptModal'); 
}


// ==========================================
// CUSTOM CALENDAR UI (No Native Picker)
// ==========================================
let currentCalTargetHidden = '';
let currentCalTargetDisp = '';
let calDate = new Date(); // Date currently viewed in calendar

function openCustomDatePicker(hiddenId, dispId) {
    currentCalTargetHidden = hiddenId;
    currentCalTargetDisp = dispId;
    
    const existVal = document.getElementById(hiddenId).value;
    if (existVal) { calDate = new Date(existVal); } 
    else { calDate = new Date(); }
    
    // Populate dropdowns
    const mSel = document.getElementById('custCalMonth');
    const ySel = document.getElementById('custCalYear');
    mSel.innerHTML = monthsArr.map((m,i) => `<option value="${i}">${m}</option>`).join('');
    
    let yHtml = ''; const currYear = new Date().getFullYear();
    for(let y = currYear - 5; y <= currYear + 5; y++) { yHtml += `<option value="${y}">${y}</option>`; }
    ySel.innerHTML = yHtml;

    mSel.value = calDate.getMonth();
    ySel.value = calDate.getFullYear();
    
    document.getElementById('custCalTime').value = `${String(calDate.getHours()).padStart(2,'0')}:${String(calDate.getMinutes()).padStart(2,'0')}`;
    
    renderCustomCalendar();
    openModal('customCalendarModal');
}

function renderCustomCalendar() {
    const month = parseInt(document.getElementById('custCalMonth').value);
    const year = parseInt(document.getElementById('custCalYear').value);
    
    const firstDay = new Date(year, month, 1).getDay(); // 0 = Minggu
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    
    const grid = document.getElementById('calendarDaysGrid');
    let html = '';
    
    // Empty blocks
    for(let i = 0; i < firstDay; i++) { html += `<div class="cal-day-btn disabled"></div>`; }
    
    // Days
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
    renderCustomCalendar(); // Re-render to show selection
}

function applyCustomDate() {
    const timeStr = document.getElementById('custCalTime').value || "00:00";
    const [h, min] = timeStr.split(':');
    calDate.setHours(h); calDate.setMinutes(min);
    
    // Adjust Timezone offset so ISO string matches local time exactly when parsed simply
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

document.getElementById('tx-amount').addEventListener('input', function() { let v = this.value.replace(/[^0-9]/g, ''); if(v === '') { rawAmount = 0; this.value = ''; return; } rawAmount = parseInt(v, 10); this.value = rawAmount.toLocaleString('id-ID'); });

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
        if (action === 'edit') showToast("Menu edit dimatikan pada v4. Silakan hapus & buat baru.", "error"); 
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
        else if (action === 'reset') executeFactoryReset();
    } else { showToast("PIN Salah! Akses Ditolak.", "error"); } 
}

function executeTxDeleteFinal(txId) {
    openCustomConfirm("Penghapusan Transaksi", "Data yang dihapus akan menghilang dari sistem laporan.", async () => {
        const idx = db.findIndex(t => String(t.id) === txId || String(t.date) === txId); if (idx === -1) return; const delTx = db[idx]; db.splice(idx, 1);
        if (APP_MODE === 'CLOUD' && currentUser && currentUser.id !== 'offline_user' && navigator.onLine && sbClient && delTx.id) { try { await sbClient.from('transactions').delete().eq('id', delTx.id); } catch(e) {} } else { pendingSync = pendingSync.filter(t => String(t.id) !== txId && String(t.date) !== txId); setLS('pending_sync', JSON.stringify(pendingSync)); }
        saveLocalDB(db); updateUI(document.getElementById('searchTxInput') ? document.getElementById('searchTxInput').value : ''); showToast("Data Dihapus.", "success");
    });
}


// ==========================================
// WISHLIST, DRIVE, & EXPORT
// ==========================================
function renderWishlist() {
    const container = document.getElementById('wishlistContainer');
    if(wishlists.length === 0) { container.innerHTML = `<div class="glass-card text-neutral" style="text-align:center; padding: 20px; font-size:12px;">Belum ada target.</div>`; return; }
    container.innerHTML = wishlists.map(w => `
        <div class="glass-card" style="padding:15px; display:flex; justify-content:space-between; align-items:center;">
            <div>
                <div style="font-size:15px; font-weight:900;" class="text-neutral">${w.name}</div>
                <div style="font-size:13px; font-weight:700; color:var(--text-muted); margin-top:4px;">Butuh: <span class="text-neutral">${formatRp(w.amount)}</span></div>
            </div>
            <button onclick="deleteWishlist('${w.id}')" style="background:transparent; border:none; color:var(--merah); cursor:pointer; font-size:16px;">✕</button>
        </div>
    `).join('');
}
function openAddWishlistModal() { document.getElementById('wishlist-name').value = ''; document.getElementById('wishlist-amount').value = ''; openModal('addWishlistModal'); }
function saveWishlist() {
    const name = properTitleCase(document.getElementById('wishlist-name').value.trim());
    const amountVal = document.getElementById('wishlist-amount').value.replace(/[^0-9]/g, '');
    const amount = amountVal ? parseInt(amountVal, 10) : 0;
    if(!name || amount <= 0) { showToast("Data tidak valid", "error"); return; }
    wishlists.push({ id: Date.now().toString(), name, amount });
    setLS('wishlists', JSON.stringify(wishlists)); renderWishlist(); closeModal('addWishlistModal'); showToast("Tersimpan");
}
function deleteWishlist(id) { wishlists = wishlists.filter(w => w.id !== id); setLS('wishlists', JSON.stringify(wishlists)); renderWishlist(); }

document.getElementById('wishlist-amount').addEventListener('input', function() { let v = this.value.replace(/[^0-9]/g, ''); this.value = v ? parseInt(v, 10).toLocaleString('id-ID') : ''; });

function renderDriveLinks() {
    const container = document.getElementById('driveContainer');
    if(driveLinks.length === 0) { container.innerHTML = `<div class="glass-card text-neutral" style="text-align:center; padding: 20px; width:100%; font-size:12px;">Kosong.</div>`; return; }
    container.innerHTML = driveLinks.map(d => `
        <div class="glass-card" style="padding:12px 15px; display:flex; align-items:center; gap:10px; min-width:200px; flex-shrink:0;">
            ${svgs.link}
            <a href="${d.url}" target="_blank" class="text-neutral" style="text-decoration:none; font-size:13px; font-weight:800; flex:1; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${d.name}</a>
            <button onclick="deleteDriveLink('${d.id}')" style="background:transparent; border:none; color:var(--merah); cursor:pointer;">✕</button>
        </div>
    `).join('');
}
function openAddDriveModal() { document.getElementById('drive-name').value = ''; document.getElementById('drive-url').value = ''; openModal('addDriveModal'); }
function saveDriveLink() {
    const name = properTitleCase(document.getElementById('drive-name').value.trim());
    const url = document.getElementById('drive-url').value.trim();
    if(!name || !url.startsWith('http')) { showToast("URL tidak valid", "error"); return; }
    driveLinks.push({ id: Date.now().toString(), name, url });
    setLS('drivelinks', JSON.stringify(driveLinks)); renderDriveLinks(); closeModal('addDriveModal'); showToast("Tersimpan");
}
function deleteDriveLink(id) { driveLinks = driveLinks.filter(d => d.id !== id); setLS('drivelinks', JSON.stringify(driveLinks)); renderDriveLinks(); }

function openCSVModal() { 
    if(db.length === 0) { showToast("Data kosong.", "error"); return; } 
    document.getElementById('csv-start-hidden').value = ''; document.getElementById('disp-csv-start').innerText = 'Pilih...';
    document.getElementById('csv-end-hidden').value = ''; document.getElementById('disp-csv-end').innerText = 'Pilih...';
    openModal('csvExportModal'); 
}
function executeCSVExport() { 
    closeModal('csvExportModal'); let csv = "Tanggal,Dompet,Tipe,Kategori,Keterangan,Pihak_Terkait,Link_Drive,Nominal\n"; 
    const startDateVal = document.getElementById('csv-start-hidden').value;
    const endDateVal = document.getElementById('csv-end-hidden').value;

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

// Search
const searchInput = document.getElementById('searchTxInput'); const searchClear = document.getElementById('searchClearBtn'); 
if(searchInput) { searchInput.addEventListener('input', function(e) { let val = e.target.value.toLowerCase(); searchClear.style.display = val.length > 0 ? 'block' : 'none'; updateUI(val); }); }
function clearSearch() { searchInput.value = ''; searchClear.style.display = 'none'; updateUI(''); }

// ==========================================
// ADMIN: SPP & ABSENSI ENGINE (v4.2)
// ==========================================
function openSppAbsenModal() { openModal('sppAbsenModal'); renderAdminStudentTable(); }

function registerStudent() {
    const input = document.getElementById('newStudentName'); const name = properTitleCase(input.value.trim());
    if (!name) { showToast("Nama santri wajib diisi", "error"); return; }
    // Schema v4: months: [], presentToday: false
    sppData.push({ id: Date.now().toString(), name: name, months: [], presentToday: false });
    setLS('spp_data_v4', JSON.stringify(sppData)); input.value = ''; renderAdminStudentTable(); showToast("Santri terdaftar", "success");
}

function deleteStudentAdmin(id) { 
    sppData = sppData.filter(s => s.id !== id); setLS('spp_data_v4', JSON.stringify(sppData)); renderAdminStudentTable(); 
}

function renderAdminStudentTable() {
    const tbody = document.getElementById('adminStudentTableBody');
    if (sppData.length === 0) { tbody.innerHTML = `<tr><td colspan="4" style="text-align:center; padding:20px; color:var(--text-muted);">Belum ada data.</td></tr>`; return; }
    
    tbody.innerHTML = sppData.map(s => {
        const monthBadge = s.months.length > 0 ? s.months.map(m => `<span style="background:var(--hijau); color:#000; padding:2px 6px; border-radius:4px; font-size:9px; margin:2px; display:inline-block; font-weight:800;">${m.substring(0,3)}</span>`).join('') : `<span style="color:var(--merah); font-size:10px; font-weight:800;">Belum Ada</span>`;
        
        return `
        <tr style="border-bottom:1px solid var(--border);" class="admin-spp-row">
            <td style="padding:10px; font-size:13px; font-weight:800;" class="text-neutral">${s.name}</td>
            <td style="padding:10px; text-align:center; cursor:pointer;" onclick="openMultiMonthSelect('${s.id}')">
                <div style="background:rgba(255,255,255,0.05); border:1px solid var(--border); padding:6px; border-radius:8px; min-height:30px; display:flex; flex-wrap:wrap; justify-content:center; align-items:center;">
                    ${monthBadge}
                </div>
            </td>
            <td style="padding:10px; text-align:center;">
                <input type="checkbox" style="width:18px; height:18px;" ${s.presentToday ? 'checked' : ''} onchange="toggleAttendance('${s.id}', this.checked)">
            </td>
            <td style="padding:10px; text-align:center;">
                <button class="btn-spp-del" onclick="deleteStudentAdmin('${s.id}')">✕</button>
            </td>
        </tr>`;
    }).join('');
}

function filterAdminStudentTable() {
    const query = document.getElementById('searchStudentAdmin').value.toLowerCase();
    const rows = document.querySelectorAll('.admin-spp-row');
    rows.forEach(row => {
        const name = row.querySelector('td').innerText.toLowerCase();
        row.style.display = name.includes(query) ? '' : 'none';
    });
}

function openMultiMonthSelect(id) {
    const s = sppData.find(x => x.id === id); if(!s) return;
    document.getElementById('multiMonthTargetId').value = id;
    document.getElementById('multiMonthStudentName').innerText = `SPP: ${s.name}`;
    
    const grid = document.getElementById('multiMonthGrid');
    grid.innerHTML = monthsArr.map(m => `
        <div>
            <input type="checkbox" id="cb_${m}" value="${m}" class="spp-month-cb" ${s.months.includes(m) ? 'checked' : ''}>
            <label for="cb_${m}" class="spp-month-label">${m.substring(0,3)}</label>
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
    setLS('spp_data_v4', JSON.stringify(sppData));
    
    closeModal('multiMonthSelectModal');
    renderAdminStudentTable();
}

function toggleAttendance(id, isPresent) {
    const sIdx = sppData.findIndex(x => x.id === id);
    if(sIdx > -1) {
        sppData[sIdx].presentToday = isPresent;
        setLS('spp_data_v4', JSON.stringify(sppData));
    }
}

// Fitur Auto Reset Absensi (Minggu) & Reminder (Sabtu)
function checkAttendanceReset() {
    const today = new Date();
    const dayOfWeek = today.getDay(); // 0 = Minggu, 6 = Sabtu
    
    // Cek Reminder Sabtu
    if (dayOfWeek === 6 && !getLS('sat_reminder_done')) {
        showToast("⚠️ Besok absensi di-reset. Jangan lupa Download Laporan CSV hari ini!", "error");
        setLS('sat_reminder_done', 'true'); // Cegah spam
    }
    if (dayOfWeek !== 6) { removeLS('sat_reminder_done'); }
    
    // Cek Reset Minggu
    if (dayOfWeek === 0) {
        const lastReset = new Date(attendanceData.lastReset);
        const diffDays = Math.floor((today - lastReset) / (1000 * 60 * 60 * 24));
        if (diffDays >= 6) { // Pastikan setidaknya sudah selang 1 minggu
            // Lakukan Reset Semua Status Absen
            sppData = sppData.map(s => ({ ...s, presentToday: false }));
            setLS('spp_data_v4', JSON.stringify(sppData));
            
            attendanceData.lastReset = today.toISOString();
            setLS('attendance_data_v4', JSON.stringify(attendanceData));
            
            setTimeout(() => { showToast("Sistem: Data Absensi Mingguan telah di-reset otomatis.", "syncing"); }, 3000);
        }
    }
}


// ==========================================
// PUBLIC PORTAL ENGINE (Wali Santri)
// ==========================================
function openShareLinkModal() { openModal('shareLinkModal'); }
function copyPublicLink() {
    const input = document.getElementById('publicLinkInput'); input.select(); input.setSelectionRange(0, 99999); 
    try { navigator.clipboard.writeText(input.value); showToast("Tautan Disalin!", "success"); } catch(e) { document.execCommand("copy"); showToast("Disalin!", "success"); }
}

function initPublicPortal() {
    document.getElementById('mainHeader').style.display = 'none';
    document.getElementById('mainContentWrapper').style.display = 'none';
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
        
        // Render Dashboard Custom untuk Orang Tua
        document.body.innerHTML = `
        <div style="padding: 20px; background:var(--bg-color); min-height: 100vh;">
            <h2 class="text-neutral" style="text-align:center; margin-bottom: 25px;">Portal Informasi Santri</h2>
            
            <div class="public-status-card">
                <h3 class="text-neutral" style="margin-top:0; border-bottom:1px solid var(--border); padding-bottom:10px;">${s.name}</h3>
                
                <div class="public-status-row">
                    <span style="color:var(--text-muted); font-weight:800; font-size:12px;">STATUS ABSEN HARI INI</span>
                    ${s.presentToday ? `<span style="background:var(--hijau); color:#000; padding:6px 12px; border-radius:8px; font-weight:900; font-size:12px;">HADIR</span>` : `<span style="background:var(--merah); color:#fff; padding:6px 12px; border-radius:8px; font-weight:900; font-size:12px;">TIDAK HADIR / BELUM DIABSEN</span>`}
                </div>
                
                <div class="public-status-row" style="flex-direction:column; align-items:flex-start;">
                    <span style="color:var(--text-muted); font-weight:800; font-size:12px; margin-bottom:10px;">RIWAYAT SPP LUNAS</span>
                    <div style="display:flex; flex-wrap:wrap; gap:8px;">
                        ${s.months.length > 0 ? s.months.map(m => `<span style="background:rgba(16, 185, 129, 0.2); border:1px solid var(--hijau); color:var(--teks-netral); padding:6px 12px; border-radius:8px; font-weight:900; font-size:12px;">${m}</span>`).join('') : `<span style="color:var(--merah); font-weight:800; font-size:12px;">Belum Ada Pembayaran Tercatat</span>`}
                    </div>
                </div>
            </div>
            
            <button class="btn-modal btn-cancel" onclick="window.location.reload()" style="margin-top:30px;">Kembali / Cek Nama Lain</button>
            <div style="text-align:center; margin-top:30px; font-size:10px; color:var(--text-muted);">TPA Finance System v4.2 - Read Only</div>
        </div>
        `;
    } else {
        showToast("Nama tidak ditemukan di database TPA.", "error");
    }
}


// ==========================================
// PROFILE, AUTH, & EXTRAS
// ==========================================
function openProfileView() { 
    document.getElementById('viewGoogleStatus').innerText = (APP_MODE === 'CLOUD') ? (profile.googleEmail || currentUser?.email || "Terhubung") : "Tidak Terhubung";
    document.getElementById('viewGoogleStatus').style.color = (APP_MODE === 'CLOUD') ? 'var(--hijau)' : 'var(--text-muted)';
    document.getElementById('textGoogleLink').innerText = (APP_MODE === 'CLOUD') ? "Logout" : "Hubungkan";
    document.getElementById('viewJoinDate').innerText = "Bergabung: " + formatDetailDate(profile.joinDate);
    
    document.getElementById('btnGoogleLink').onclick = () => {
        if(APP_MODE === 'CLOUD') {
            openCustomConfirm("Logout Cloud", "Keluar ke Mode Guest? Data aman.", async () => { if(sbClient && navigator.onLine) await sbClient.auth.signOut(); else forceLogoutToGuest(); });
        } else { openModal('googleAuthModal'); }
    };
    
    openModal('profileViewModal'); 
}

function requestProfileEdit() { 
    if(profile.pin && profile.pin !== '') { 
        closeModal('profileViewModal'); 
        document.getElementById('actionPinType').value = 'edit_profile'; 
        document.getElementById('inputActionPin').value = ''; 
        openModal('actionPinModal'); 
    } else { openProfileEdit(); } 
}

function openProfileEdit() { 
    document.getElementById('editProfileImg').src = profile.photo; 
    document.getElementById('editName').value = profile.name !== 'Pengurus' ? profile.name : ''; 
    selectGender(profile.gender); 
    document.getElementById('editPin').value = ''; 
    openModal('profileEditModal'); 
}

function selectGender(val) { document.getElementById('editGender').value = val; document.getElementById('dispGenderVal').innerText = val; closeModal(''); }

document.getElementById('profileUploader').addEventListener('change', function(e) { 
    const f = e.target.files[0]; if(!f) return; showToast("Memproses...", "syncing"); const reader = new FileReader(); 
    reader.onload = function(evt) { const img = new Image(); img.onload = function() { 
        const canvas = document.createElement('canvas'); const MAX = 300; let w = img.width, h = img.height; 
        if(w > h) { if(w > MAX) { h *= MAX/w; w = MAX; } } else { if(h > MAX) { w *= MAX/h; h = MAX; } } 
        canvas.width = w; canvas.height = h; canvas.getContext('2d').drawImage(img, 0, 0, w, h); 
        profile.photo = canvas.toDataURL('image/jpeg', 0.6); document.getElementById('editProfileImg').src = profile.photo; 
    }; img.src = evt.target.result; }; reader.readAsDataURL(f); 
});

async function saveProfileData() { 
    profile.name = properTitleCase(document.getElementById('editName').value.trim()) || 'Pengurus'; 
    profile.gender = document.getElementById('editGender').value; 
    const rawPin = document.getElementById('editPin').value; if(rawPin && rawPin.length >= 4) { profile.pin = await hashPIN(rawPin); } 
    setLS('profile_secure_v4', JSON.stringify(profile)); initAppHeader(); closeModal('profileEditModal'); showToast("Profil Disimpan"); 
    if(APP_MODE === 'CLOUD' && navigator.onLine && sbClient) sbClient.from('profiles').upsert({ id: currentUser.id, data: profile });
}

function initResetSequence() { 
    if(!profile.pin) { showToast("Buat PIN Keamanan dahulu.", "error"); return; } 
    closeModal('profileViewModal'); 
    document.getElementById('actionPinType').value = 'reset'; 
    document.getElementById('inputActionPin').value = ''; 
    openModal('actionPinModal'); 
}

async function executeFactoryReset() { 
    showToast("Membersihkan Database...", "syncing"); 
    try { 
        if(APP_MODE === 'CLOUD' && navigator.onLine && sbClient) await sbClient.from('transactions').delete().eq('user_id', currentUser.id); 
    } catch(e) {}
    db = []; sppData = []; attendanceData = { lastReset: new Date().toISOString(), records: {} }; pendingSync = [];
    removeLS('cloud_db'); removeLS('guest_db'); removeLS('spp_data_v4'); removeLS('attendance_data_v4'); removeLS('pending_sync');
    updateUI(''); showToast("Reset Berhasil.", "success"); 
}

// Dev Support Notification
function triggerDevSupportNotification() {
    if(isPublicMode) return;
    const msgs = [
        "Bantu Dev beli kopi melalui tombol 'Traktir' di Profil 🙏",
        "Aplikasi bermanfaat? Dukung Developer di menu Profil ☕",
        "TPA Finance 100% Gratis. Dukung Dev via SociaBuzz di Profil ❤️"
    ];
    showToast(msgs[Math.floor(Math.random() * msgs.length)], "syncing");
}

// Google Auth
document.getElementById('btnRealGoogleLogin').addEventListener('click', async () => { 
    if(typeof window.supabase === 'undefined' || !sbClient || !navigator.onLine) { showToast("Gagal menyambung. Cek internet.", "error"); return; }
    await sbClient.auth.signInWithOAuth({ provider: 'google', options: { redirectTo: window.location.origin + window.location.pathname } }); 
});

// OTP Pin Reset
function startOTPResetProcess() { 
    closeModal('actionPinModal'); 
    if(!profile.googleLinked || !profile.googleEmail) { showToast("Akun belum terhubung Google!", "error"); return; } 
    if(!navigator.onLine) { showToast("Butuh koneksi internet!", "error"); return; } 
    document.getElementById('displayUserEmail').innerText = profile.googleEmail; 
    openModal('otpRequestModal'); 
}
function sendOTPEmail() { 
    const btn = document.getElementById('btnSendOTP'); btn.innerText = "Mengirim..."; btn.disabled = true; 
    generatedOTP = Math.floor(100000 + Math.random() * 900000).toString(); otpExpiryTime = Date.now() + 300000; 
    emailjs.send('service_4v89q7h', 'template_w9fgvcf', { to_email: profile.googleEmail, to_name: profile.name, otp_code: generatedOTP })
        .then(() => { showToast("OTP Terkirim!"); closeModal('otpRequestModal'); openModal('otpVerifyModal'); btn.innerText="Kirim"; btn.disabled=false; })
        .catch(() => { showToast("Gagal kirim email.", "error"); btn.innerText="Kirim"; btn.disabled=false; }); 
}
async function verifyOTPAndSavePin() { 
    const c = document.getElementById('inputOTP').value; const np = document.getElementById('inputNewPinOTP').value; 
    if(Date.now() > otpExpiryTime) { showToast("OTP Kadaluarsa!", "error"); return; } 
    if(c !== generatedOTP) { showToast("OTP Salah!", "error"); return; } 
    if(np.length < 4) { showToast("PIN minimal 4 digit!", "error"); return; } 
    profile.pin = await hashPIN(np); setLS('profile_secure_v4', JSON.stringify(profile)); 
    if(APP_MODE === 'CLOUD' && sbClient) sbClient.from('profiles').upsert({ id: currentUser.id, data: profile });
    generatedOTP = ""; closeModal('otpVerifyModal'); showToast("PIN Berhasil Direset!"); 
}

// Kickstart
bootApp();
