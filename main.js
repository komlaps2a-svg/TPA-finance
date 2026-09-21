/* ==========================================
   TPA FINANCE 4.2 - MAIN LOGIC ENGINE
   ========================================== */

const APP_VERSION = '4.3'; 
const LS_PREFIX = 'tpa_finance_v4_';

function getLS(key) { return localStorage.getItem(LS_PREFIX + key); }
function setLS(key, val) { localStorage.setItem(LS_PREFIX + key, val); }
function removeLS(key) { localStorage.removeItem(LS_PREFIX + key); }

function checkAppVersion() {
    const savedVersion = getLS('app_version');
    if (savedVersion !== APP_VERSION) {
        setLS('app_version', APP_VERSION);
        if (navigator.onLine) {
            const updateScreen = document.getElementById('updateScreen');
            if (updateScreen) updateScreen.style.display = 'flex';
            setTimeout(() => { window.location.reload(true); }, 2000);
        }
    }
}
checkAppVersion();

// ==========================================
// KONFIGURASI SUPABASE (WAKE-UP ENGINE)
// ==========================================
const SUPABASE_URL = 'https://ndsyyaxmiwskrkklseap.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5kc3l5YXhtaXdza3Jra2xzZWFwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODUxNDU4NjIsImV4cCI6MjEwMDcyMTg2Mn0.uXgAIhUjjkNpe9s6N6LGvRXZLUDQUZJrSfUFf1BDmKU';

let sbClient = null;
let db = []; 
let pendingSync = JSON.parse(getLS('pending_sync')) || []; 
let wishlists = JSON.parse(getLS('wishlists')) || [];
let driveLinks = JSON.parse(getLS('drivelinks')) || [];
let sppData = JSON.parse(getLS('spp_data_v4')) || [];
let absensiData = JSON.parse(getLS('absensi_data_v4')) || [];
let currentUser = null; 

let APP_MODE = getLS('app_mode') || 'GUEST';
let activeWallet = 'utama'; 
let currentTimeFilter = 365; 
let rawAmount = 0;
let editRawAmount = 0;
let pieChart, barChart, lineChart; 
let isInitialTableRender = true; 
let realTimeSubscription = null;
let aiMessages = [];
let generatedOTP = "";
let otpExpiryTime = 0;
let publicStudentName = ""; 

const defaultProfile = { 
    name: 'Pengurus', pin: '', role: 'Pengurus TPA',
    photo: 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAyNCAyNCIgZmlsbD0iIzEwYjk4MSI+PHBhdGggZD0iTTEyIDJhNSA1IDAgMSAwIDUgNSBNMTIgMTRhNyA3IDAgMCAwLTcgN3YxSDE5di0xYTcgNyAwIDAgMC03LTdaIi8+PC9zdmc+', 
    joinDate: new Date().toISOString(), birthDate: '', gender: 'Rahasia', googleLinked: false, googleEmail: ''
};

let profile = JSON.parse(getLS('profile_secure_v4'));
if (!profile) { profile = { ...defaultProfile }; setLS('profile_secure_v4', JSON.stringify(profile)); }

// ==========================================
// SYSTEM ICONS & CATEGORIES
// ==========================================
const svgs = {
    makan: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg>`,
    uang: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="2" y="6" width="20" height="12" rx="2"/><circle cx="12" cy="12" r="2"/><path d="M6 12h.01M18 12h.01"/></svg>`,
    book: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/></svg>`,
    user: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path><circle cx="9" cy="7" r="4"></circle><path d="M23 21v-2a4 4 0 0 0-3-3.87"></path><path d="M16 3.13a4 4 0 0 1 0 7.75"></path></svg>`,
    plus_bold: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>`,
    minus_bold: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><line x1="5" y1="12" x2="19" y2="12"></line></svg>`,
    link: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"></path><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"></path></svg>`
};

const categories = { 
    masuk: ['Infak Santri', 'SPP Santri', 'Infak Jumat', 'Donasi Masyarakat', 'Wakaf', 'Bantuan Pemerintah', 'Dana Darurat', 'Hibah', 'Donatur Tetap', 'Lainnya'], 
    keluar: ['Honor Guru', 'ATK', 'Al-Qur\'an', 'Snack Kegiatan', 'Listrik', 'Air', 'Kebersihan', 'Perbaikan Bangunan', 'Kegiatan Santri', 'Transfer Darurat', 'Lainnya'] 
};

function getDynamicColor(categoryStr, type) {
    if (categoryStr === 'Transfer Darurat' || categoryStr === 'Dana Darurat') return '#ef4444';
    if (type === 'keluar') return '#ef4444';
    const inColors = { 'Wakaf': '#a855f7', 'Infak Santri': '#10b981', 'SPP Santri': '#10b981', 'Donasi Masyarakat': '#3b82f6' };
    if (inColors[categoryStr]) return inColors[categoryStr];
    let hash = 0; for(let i = 0; i < categoryStr.length; i++) hash = categoryStr.charCodeAt(i) + ((hash << 5) - hash);
    return `hsl(${Math.abs(hash) % 360}, 70%, 55%)`; 
}

const SECRET_KEY = "TPA_Finance_Secure_K42";
function getDBKey() { return APP_MODE === 'CLOUD' ? LS_PREFIX + 'cloud_db' : LS_PREFIX + 'guest_db'; }

function saveLocalDB(dataToSave) {
    try {
        if (typeof CryptoJS !== 'undefined') {
            const ciphertext = CryptoJS.AES.encrypt(JSON.stringify(dataToSave), SECRET_KEY).toString();
            localStorage.setItem(getDBKey(), ciphertext);
        } else { localStorage.setItem(getDBKey() + '_fallback', JSON.stringify(dataToSave)); }
    } catch(e) {}
}

function loadLocalDB() {
    let data = [];
    try {
        const ciphertext = localStorage.getItem(getDBKey());
        if (ciphertext) { data = JSON.parse(CryptoJS.AES.decrypt(ciphertext, SECRET_KEY).toString(CryptoJS.enc.Utf8)); } 
        else { const fallback = localStorage.getItem(getDBKey() + '_fallback'); if (fallback) data = JSON.parse(fallback); }
    } catch (e) { }
    return Array.isArray(data) ? data : [];
}

async function hashPIN(pin) {
    if (!pin) return '';
    try {
        if (window.crypto && window.crypto.subtle && window.isSecureContext) {
            const msgBuffer = new TextEncoder().encode(pin); const hashBuffer = await crypto.subtle.digest('SHA-256', msgBuffer);
            const hashArray = Array.from(new Uint8Array(hashBuffer)); return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
        } else if (typeof CryptoJS !== 'undefined') { return CryptoJS.SHA256(pin).toString(CryptoJS.enc.Hex); } else { return btoa(pin); }
    } catch (error) { return btoa(pin); }
}

function saveProfileLocal() { setLS('profile_secure_v4', JSON.stringify(profile)); }

// ==========================================
// SCROLL LISTENER (FLEXIBLE HEADER)
// ==========================================
let lastScrollY = window.scrollY;
window.addEventListener('scroll', () => {
    const header = document.getElementById('mainHeader');
    // Jangan sembunyikan header jika modal sedang terbuka (body terkunci)
    if (!header || document.body.classList.contains('body-lock')) return;
    
    if (window.scrollY > lastScrollY && window.scrollY > 120) {
        header.classList.add('header-hidden');
    } else {
        header.classList.remove('header-hidden');
    }
    lastScrollY = window.scrollY;
});

// ==========================================
// INITIALIZE APP & RBAC (WALI SANTRI)
// ==========================================
function bootApp() {
    enforcePublicMode(); // Cek URL Parameter pertama kali
    
    renderShortcuts();
    db = loadLocalDB(); 
    initAppHeader();
    renderWishlist();
    renderDriveLinks();
    updateUI('');

    const netStatus = document.getElementById('networkStatus');
    if (APP_MODE === 'CLOUD') {
        currentUser = { id: 'offline_user', email: profile.googleEmail || 'Cloud User' }; 
        if(netStatus) { netStatus.innerText = navigator.onLine ? "Menyambung..." : "Offline Mode (Cloud)"; netStatus.className = navigator.onLine ? "status-sync sync-pending" : "status-sync sync-offline"; }
    } else if (APP_MODE === 'PUBLIC') {
        if(netStatus) { netStatus.innerText = "Online (Live Sync)"; netStatus.className = "status-sync sync-online"; }
    } else {
        currentUser = null;
        if(netStatus) { netStatus.innerText = "Offline Mode (Guest)"; netStatus.className = "status-sync sync-offline"; }
    }
    
    setTimeout(() => {
        initSupabaseBackground();
        startCoffeeToastEngine();
    }, 500);
}

function enforcePublicMode() {
    const params = new URLSearchParams(window.location.search);
    if (params.get('view') === 'public') {
        APP_MODE = 'PUBLIC';
        
        // Sembunyikan tombol eksekusi untuk Publik
        document.querySelectorAll('.admin-only-btn, .th-admin-only').forEach(el => {
            if(el) el.style.display = 'none';
        });
        
        // Populate Datalist Rekomendasi Nama Anak
        const dl = document.getElementById('studentNameDatalist');
        if (dl) {
            dl.innerHTML = sppData.map(s => `<option value="${s.name}">`).join('');
        }
        
        // Kunci layar langsung dengan Modal Login
        openModal('parentAuthModal', true); 
    }
}

function verifyParentLogin() {
    const val = document.getElementById('parentLoginName').value.trim();
    if(!val) { showToast("Masukkan nama santri", "error"); return; }
    
    const student = sppData.find(s => s.name.toLowerCase() === val.toLowerCase());
    if(!student) { 
        showToast("Nama tidak terdaftar. Hubungi Admin.", "error"); 
        return; 
    }
    
    publicStudentName = student.name;
    closeModal('parentAuthModal', true); // Bypass force lock khusus ini
    
    // Sesuaikan Header
    document.getElementById('headName').innerText = "Wali dari " + student.name;
    document.getElementById('headRole').innerText = "PORTAL WALI SANTRI";
    
    // Matikan indikator kesehatan sistem TPA umum
    const healthBadge = document.getElementById('healthBadge');
    if(healthBadge) healthBadge.style.display = 'none';

    showToast(`Selamat datang, Wali dari ${student.name}`, "success");
    updateUI('');
}

// ==========================================
// SUPABASE SYNC ENGINE (AUTO-WAKE)
// ==========================================
async function initSupabaseBackground() {
    if (typeof window.supabase === 'undefined') return;
    if (!sbClient) sbClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

    // Auto Ping Supabase to wake up Edge Functions / DB supaya tidak offline
    if (navigator.onLine) {
        sbClient.from('transactions').select('id').limit(1).then(() => console.log('Supabase Woke Up'));
    }

    const netStatus = document.getElementById('networkStatus');
    if (APP_MODE === 'CLOUD' && navigator.onLine) {
        try {
            const { data: { session }, error } = await sbClient.auth.getSession();
            if (error) throw error;
            if (session && session.user) {
                currentUser = session.user;
                if(netStatus) { netStatus.innerText = "Online Mode (Cloud)"; netStatus.className = "status-sync sync-online"; }
                fetchUserTransactions(); setupRealtime();
                if (pendingSync.length > 0) processPendingSync();
            } else { forceLogoutToGuest(); }
        } catch(err) { if(netStatus) { netStatus.innerText = "Server Lambat (Mode Lokal)"; netStatus.className = "status-sync sync-offline"; } }
    }

    if (!window.supabaseListenerAdded) {
        window.supabaseListenerAdded = true;
        sbClient.auth.onAuthStateChange(async (event, currentSession) => {
            if (event === 'SIGNED_OUT') { forceLogoutToGuest(); } 
            else if (event === 'SIGNED_IN' && currentSession) {
                currentUser = currentSession.user; APP_MODE = 'CLOUD'; setLS('app_mode', 'CLOUD');
                if(netStatus) { netStatus.innerText = navigator.onLine ? "Online Mode (Cloud)" : "Offline Mode (Cloud)"; netStatus.className = navigator.onLine ? "status-sync sync-online" : "status-sync sync-offline"; }
                try {
                    const { data: profileData } = await sbClient.from('profiles').select('data').eq('id', currentUser.id).single();
                    if (profileData && profileData.data) { profile = { ...profile, ...profileData.data }; } 
                    else { if(profile.name === 'Pengurus') profile.name = properTitleCase(currentUser.user_metadata?.full_name); profile.photo = currentUser.user_metadata?.avatar_url || profile.photo; await saveProfileToSupabase(); }
                } catch(e) {}
                profile.googleLinked = true; profile.googleEmail = currentUser.email; saveProfileLocal();
                db = loadLocalDB(); initAppHeader(); renderShortcuts(); fetchUserTransactions(); setupRealtime(); closeModal('googleAuthModal');
                if (navigator.onLine && pendingSync.length > 0) processPendingSync();
            }
        });
    }
}

async function fetchUserTransactions() {
    if (APP_MODE !== 'CLOUD' || !currentUser || currentUser.id === 'offline_user' || !sbClient) return;
    try {
        if (!navigator.onLine) throw new Error("Offline");
        const { data, error } = await sbClient.from('transactions').select('*').eq('user_id', currentUser.id).order('date', { ascending: true });
        if (error) throw error;
        db = data; saveLocalDB(db); 
        updateUI(document.getElementById('searchTxInput') ? document.getElementById('searchTxInput').value : ''); 
    } catch (error) { db = loadLocalDB(); updateUI(''); }
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
        showToast("Menyinkronkan data offline...", "syncing");
        const payload = pendingSync.map(t => { let newData = { ...t, user_id: currentUser.id }; if(String(newData.id).length > 10) delete newData.id; return newData; });
        const { error } = await sbClient.from('transactions').insert(payload);
        if (error) throw error;
        pendingSync = []; setLS('pending_sync', JSON.stringify(pendingSync));
        showToast("Data offline tersimpan ke Cloud!", "success"); fetchUserTransactions();
    } catch (error) {}
}

function forceLogoutToGuest() {
    if(APP_MODE === 'PUBLIC') return; // Do not touch public mode
    currentUser = null; APP_MODE = 'GUEST'; setLS('app_mode', 'GUEST');
    profile = { ...defaultProfile }; saveProfileLocal();
    removeLS('cloud_db'); removeLS('cloud_db_fallback'); db = loadLocalDB(); 
    initAppHeader(); renderShortcuts(); updateUI(''); 
    showToast("Berhasil Logout.", "success"); closeModal('profileViewModal');
}

// ==========================================
// UTILITIES & TOASTS
// ==========================================
function formatRp(num) { return new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', minimumFractionDigits: 0 }).format(num); }
function formatRpPendek(num) { let str = formatRp(num); return str.replace(/\.000$/, '...'); }
function formatDetailDate(iso) { if(!iso) return '-'; const d = new Date(iso); return `${String(d.getDate()).padStart(2,'0')}/${String(d.getMonth()+1).padStart(2,'0')}/${d.getFullYear()} - ${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`; }
function formatSmartName(name) { if (!name) return name; if (window.innerWidth > 400) return name; if (name.length > 12) { let words = name.trim().split(/\s+/); if (words.length > 1) { let lastWord = words.pop(); return words.join(' ') + ' ' + lastWord.charAt(0).toUpperCase() + '.'; } } return name; }
function properTitleCase(str) { if(!str) return ""; return str.toLowerCase().replace(/\b\w/g, char => char.toUpperCase()); }

function showToast(msg, type = 'success') { 
    const box = document.getElementById('toastBox'); if(!box) return; 
    const t = document.createElement('div'); t.className = `toast ${type}`; t.innerHTML = msg; box.appendChild(t); 
    setTimeout(() => t.classList.add('show'), 10); 
    setTimeout(() => { t.classList.remove('show'); setTimeout(() => t.remove(), 400); }, 3500); 
}

function startCoffeeToastEngine() {
    setInterval(() => {
        const toast = document.getElementById('coffeeToast');
        if(!toast) return;
        toast.innerHTML = '☕ Developer butuh kopi? <br><span style="font-size:10px; color:rgba(255,255,255,0.8);">Bantu biaya server & pengembangan</span>';
        toast.onclick = () => window.open('https://sociabuzz.com/engyourbae/tribe', '_blank');
        toast.classList.add('show');
        setTimeout(() => toast.classList.remove('show'), 6000);
    }, 180000); // Muncul setiap 3 menit
}

// ==========================================
// MODAL & OVERLAY ENGINE (BODY LOCK)
// ==========================================
let forceLockModal = false;
function openModal(id, forceLock = false) {
    if(forceLock) forceLockModal = true;
    const el = document.getElementById(id);
    if(el) {
        el.classList.add('active');
        document.body.classList.add('body-lock'); // Kunci scroll belakang
    }
}
function closeModal(id, overrideLock = false) { 
    if(forceLockModal && !overrideLock) return; // Cannot close forced modals (like parent auth)
    forceLockModal = false;
    
    if(id) { 
        const el = document.getElementById(id); 
        if(el) el.classList.remove('active'); 
    } else {
        document.querySelectorAll('.modal-overlay.active').forEach(m => m.classList.remove('active'));
    }
    
    document.querySelectorAll('.custom-options.open').forEach(e => e.classList.remove('open')); 
    
    // Unlock body if no modals are active
    if(document.querySelectorAll('.modal-overlay.active').length === 0) {
        document.body.classList.remove('body-lock');
    }
}

let confirmActionCallback = null;
function openConfirmModal(title, desc, callback) { 
    document.getElementById('confirmTitle').innerText = title; 
    document.getElementById('confirmDesc').innerHTML = desc; 
    confirmActionCallback = callback; 
    openModal('confirmModal'); 
}
document.getElementById('btnConfirmYes').addEventListener('click', () => { 
    if(confirmActionCallback) confirmActionCallback(); 
    closeModal('confirmModal'); 
});

// ==========================================
// THEME RIPPLE ANIMATION
// ==========================================
function toggleTheme(event) {
    let x = window.innerWidth / 2;
    let y = 50;
    
    if(event) {
        // Fallback koordinat dari mouse / touch
        if (event.clientX) { x = event.clientX; y = event.clientY; }
        else if (event.touches && event.touches[0]) {
            x = event.touches[0].clientX;
            y = event.touches[0].clientY;
        }
    }

    const ripple = document.getElementById('theme-ripple');
    ripple.style.left = `${x}px`;
    ripple.style.top = `${y}px`;
    
    const currentTheme = document.documentElement.getAttribute('data-theme') || 'dark';
    const newTheme = currentTheme === 'dark' ? 'light' : 'dark';
    
    // Set ripple color ke warna background tema baru
    ripple.style.backgroundColor = newTheme === 'light' ? '#f8fafc' : '#05140e';
    
    // Expand Ripple
    ripple.style.width = '200vw';
    ripple.style.height = '200vw';
    ripple.style.marginLeft = '-100vw';
    ripple.style.marginTop = '-100vw';
    ripple.classList.add('active');
    
    // Tukar tema di puncak animasi
    setTimeout(() => {
        document.documentElement.setAttribute('data-theme', newTheme);
        setLS('app_theme', newTheme);
        updateThemeIcon(newTheme);
        
        // Reset ripple
        setTimeout(() => {
            ripple.classList.remove('active');
            ripple.style.width = '0';
            ripple.style.height = '0';
            ripple.style.marginLeft = '0';
            ripple.style.marginTop = '0';
        }, 100);
        
        if(typeof Chart !== 'undefined') {
            if(pieChart) pieChart.update();
            if(barChart) barChart.update();
            if(lineChart) lineChart.update();
        }
    }, 400);
}

function updateThemeIcon(theme) { 
    const btn = document.getElementById('themeToggleBtn'); if (!btn) return; 
    const iconSun = `<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="5"/><path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42"/></svg>`;
    const iconMoon = `<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>`;
    if (theme === 'light') { btn.innerHTML = iconMoon; btn.style.color = '#cbd5e1'; } 
    else { btn.innerHTML = iconSun; btn.style.color = 'var(--text-muted)'; } 
}

window.addEventListener('DOMContentLoaded', () => { 
    const savedTheme = getLS('app_theme') || 'dark';
    document.documentElement.setAttribute('data-theme', savedTheme);
    updateThemeIcon(savedTheme); 
});

// ==========================================
// CUSTOM DATEPICKER ENGINE (DOM VIRTUAL)
// ==========================================
let currentCalMonth = new Date().getMonth();
let currentCalYear = new Date().getFullYear();
let currentCalTargetId = null;

function openCustomDatePicker(targetId) {
    currentCalTargetId = targetId;
    const existingVal = document.getElementById(targetId).value;
    const dt = existingVal ? new Date(existingVal) : new Date();
    currentCalMonth = dt.getMonth();
    currentCalYear = dt.getFullYear();
    
    document.getElementById('calHour').value = String(dt.getHours()).padStart(2, '0');
    document.getElementById('calMin').value = String(dt.getMinutes()).padStart(2, '0');
    
    renderCalendarGrid();
    openModal('customDatePickerModal');
}

function changeCalMonth(dir) {
    currentCalMonth += dir;
    if (currentCalMonth > 11) { currentCalMonth = 0; currentCalYear++; }
    else if (currentCalMonth < 0) { currentCalMonth = 11; currentCalYear--; }
    renderCalendarGrid();
}

function renderCalendarGrid() {
    const monthNames = ["Januari", "Februari", "Maret", "April", "Mei", "Juni", "Juli", "Agustus", "September", "Oktober", "November", "Desember"];
    document.getElementById('calMonthYear').innerText = `${monthNames[currentCalMonth]} ${currentCalYear}`;
    
    const grid = document.getElementById('calDatesGrid');
    grid.innerHTML = '';
    
    const firstDay = new Date(currentCalYear, currentCalMonth, 1).getDay();
    const daysInMonth = new Date(currentCalYear, currentCalMonth + 1, 0).getDate();
    
    // Kosong awal bulan
    for (let i = 0; i < firstDay; i++) {
        grid.innerHTML += `<div></div>`;
    }
    
    // Tanggal
    const today = new Date();
    const existingVal = document.getElementById(currentCalTargetId).value;
    const selectedDt = existingVal ? new Date(existingVal) : null;

    for (let i = 1; i <= daysInMonth; i++) {
        const isToday = (today.getDate() === i && today.getMonth() === currentCalMonth && today.getFullYear() === currentCalYear);
        const isSelected = (selectedDt && selectedDt.getDate() === i && selectedDt.getMonth() === currentCalMonth && selectedDt.getFullYear() === currentCalYear);
        
        let cls = 'cal-date-btn';
        if (isSelected) cls += ' active';
        else if (isToday) cls += ' dimmed'; 
        
        grid.innerHTML += `<button type="button" class="${cls}" onclick="selectCalDate(${i})">${i}</button>`;
    }
}

function selectCalDate(day) {
    let hour = document.getElementById('calHour').value || "00";
    let min = document.getElementById('calMin').value || "00";
    if (hour === "") hour = "00"; if (min === "") min = "00";
    
    // Simpan zona waktu lokal ke format ISO
    const dt = new Date(currentCalYear, currentCalMonth, day, parseInt(hour), parseInt(min), 0);
    const targetInput = document.getElementById(currentCalTargetId);
    targetInput.value = dt.toISOString(); 
    
    // Tampilan label button
    const dispStr = `${String(day).padStart(2,'0')}/${String(currentCalMonth+1).padStart(2,'0')}/${currentCalYear} - ${String(dt.getHours()).padStart(2,'0')}:${String(dt.getMinutes()).padStart(2,'0')}`;
    document.getElementById('disp-' + currentCalTargetId).innerText = dispStr;
    
    closeModal('customDatePickerModal');
}

function applyCustomDate() {
    // Tombol fallback jika user tidak klik hari tapi menekan tombol pilih
    const today = new Date();
    selectCalDate(today.getDate());
}


// ==========================================
// PROFILE, WALLET, & UI
// ==========================================
function initAppHeader() { 
    if(APP_MODE === 'PUBLIC') return; // Bypass untuk Wali Santri
    document.getElementById('headName').innerText = formatSmartName(profile.name); 
    document.getElementById('headRole').innerText = profile.role || 'Pengurus TPA'; 
    document.getElementById('headProfileImg').src = profile.photo; 
}

function openProfileView() { 
    if(APP_MODE === 'PUBLIC') return; // Wali Santri dilarang masuk edit profil
    document.getElementById('viewProfileImg').src = profile.photo; 
    document.getElementById('viewProfileName').innerText = profile.name; 
    document.getElementById('viewJoinDate').innerText = "Bergabung: " + formatDetailDate(profile.joinDate); 
    document.getElementById('viewRole').innerText = profile.role || '-'; 
    document.getElementById('viewGender').innerText = profile.gender || '-'; 
    
    const stat = document.getElementById('viewGoogleStatus'); const btnText = document.getElementById('textGoogleLink'); const btn = document.getElementById('btnGoogleLink'); 
    
    if(APP_MODE === 'CLOUD') { 
        stat.innerHTML = `<span style="color:var(--hijau); font-weight:700;">${profile.googleEmail || (currentUser ? currentUser.email : 'Cloud User')}</span>`; 
        btnText.innerText = "Logout"; btn.style.borderColor = "var(--merah)"; btn.style.color = "var(--merah)"; 
        btn.onclick = () => { openConfirmModal("Logout Akun", "Logout ke mode Guest? Data Cloud tetap aman.", async () => { if(sbClient && navigator.onLine) { await sbClient.auth.signOut(); } else { forceLogoutToGuest(); } }); };
    } else { 
        stat.innerText = "Tidak Terhubung"; stat.style.color = "var(--text-muted)"; btnText.innerText = "Hubungkan"; btn.style.borderColor = "#4285F4"; btn.style.color = "#4285F4"; btn.onclick = () => openModal('googleAuthModal'); 
    } 
    openModal('profileViewModal'); 
}

function requestProfileEdit() { if(profile.pin && profile.pin !== '') { promptGlobalPin('editProfile'); } else { openProfileEdit(); } }
function openProfileEdit() { 
    closeModal('profileViewModal');
    document.getElementById('editProfileImg').src = profile.photo; 
    document.getElementById('editName').value = profile.name !== 'Pengurus' ? profile.name : ''; 
    selectRole(profile.role || 'Pengurus TPA');
    document.getElementById('editPin').value = ''; 
    openModal('profileEditModal'); 
}
function selectRole(val) { document.getElementById('editRole').value = val; document.getElementById('dispRoleVal').innerText = val; closeModal(''); }

async function saveProfileData() { 
    profile.name = properTitleCase(document.getElementById('editName').value.trim()) || 'Pengurus'; 
    profile.role = document.getElementById('editRole').value; 
    const rawPin = document.getElementById('editPin').value; 
    if (rawPin && rawPin.trim() !== '') { profile.pin = await hashPIN(rawPin); } 
    saveProfileLocal(); initAppHeader(); closeModal('profileEditModal'); showToast("Profil Disimpan"); saveProfileToSupabase(); 
}

async function saveProfileToSupabase() { 
    if (APP_MODE !== 'CLOUD' || !currentUser || currentUser.id === 'offline_user' || !navigator.onLine || !sbClient) return; 
    try { await sbClient.from('profiles').upsert({ id: currentUser.id, data: profile }); } catch(e) {} 
}

// PIN AUTH GLOBAL 2X (EDIT / DELETE)
function promptGlobalPin(action, dataId = '') {
    closeModal(''); // Close everything
    if (!profile.pin || profile.pin.trim() === '') {
        executeGlobalPinAction(action, dataId);
        return;
    }
    document.getElementById('authPinTargetAction').value = action;
    document.getElementById('authPinTargetData').value = dataId;
    document.getElementById('inputAuthPin').value = '';
    openModal('pinAuthModal');
    setTimeout(() => document.getElementById('inputAuthPin').focus(), 300);
}

async function verifyPinGlobal() {
    const inputVal = document.getElementById('inputAuthPin').value; 
    const hashedInput = await hashPIN(inputVal); 
    if (hashedInput === profile.pin) { 
        const action = document.getElementById('authPinTargetAction').value;
        const dataId = document.getElementById('authPinTargetData').value;
        closeModal('pinAuthModal');
        executeGlobalPinAction(action, dataId);
    } else { showToast("PIN Salah!", "error"); } 
}

function executeGlobalPinAction(action, dataId) {
    if(action === 'editProfile') openProfileEdit();
    else if(action === 'factoryReset') {
        openConfirmModal("PERINGATAN FATAL", "Seluruh data TPA akan dihapus permanen. Lanjutkan?", executeFactoryReset);
    }
    else if(action === 'editTx') openEditTxModal(dataId);
    else if(action === 'deleteTx') {
        openConfirmModal("Hapus Mutlak", "Tindakan ini tidak dapat dibatalkan. Lanjutkan?", () => executeTxDeleteFinal(dataId));
    }
}

function initResetSequence() { promptGlobalPin('factoryReset'); }
async function executeFactoryReset() { 
    showToast("Memulai format...", "syncing"); db = []; removeLS('cloud_db'); removeLS('cloud_db_fallback'); removeLS('guest_db'); removeLS('guest_db_fallback');
    try { if (APP_MODE === 'CLOUD' && currentUser && currentUser.id !== 'offline_user' && navigator.onLine && sbClient) { await sbClient.from('transactions').delete().eq('user_id', currentUser.id); } showToast("Database musnah.", "success"); } catch (e) { showToast("Direset Lokal Saja.", "error"); } 
    updateUI(''); 
}


// ==========================================
// RENDER UI & CHARTS & AI
// ==========================================
function switchWallet(type) { 
    activeWallet = type; document.getElementById('walletSwitchContainer').setAttribute('data-active', type); 
    document.querySelectorAll('.btn-tab').forEach(b => b.classList.remove('active')); 
    document.getElementById(`tab-${type}`).classList.add('active'); 
    renderShortcuts(); updateUI(document.getElementById('searchTxInput') ? document.getElementById('searchTxInput').value : ''); 
}

function toggleCustomSelect(id) { 
    const box = document.getElementById(id); const isOpen = box.classList.contains('open'); 
    document.querySelectorAll('.custom-options.open').forEach(el => el.classList.remove('open')); 
    if(!isOpen) box.classList.add('open'); 
}
function applyTimeFilter(days, labelText) { currentTimeFilter = days; document.getElementById('dispTimeFilter').innerText = labelText; closeModal(''); updateUI(''); }
function toggleSection(sec, icn) { document.getElementById(sec).classList.toggle('hidden'); document.getElementById(icn).classList.toggle('rotated'); }
function toggleExpandStat(el, id) { const items = document.getElementById(id).children; if (el.classList.contains('expanded')) { for(let i of items) i.className = 'expand-item glass-card'; } else { for(let i of items) i.className = (i === el) ? 'expand-item expanded glass-card' : 'expand-item collapsed'; } } 
function expandChart(el, id) { if(!el.classList.contains('expanded')) { for(let i of document.getElementById(id).children) i.className = (i === el) ? 'expand-item expanded glass-card' : 'expand-item collapsed'; setTimeout(() => { if(typeof Chart !== 'undefined' && pieChart) pieChart.resize(); if(typeof Chart !== 'undefined' && barChart) barChart.resize(); if(typeof Chart !== 'undefined' && lineChart) lineChart.resize(); }, 300); } } 
function closeChart(e, btn) { e.stopPropagation(); for(let i of btn.closest('.expand-container').children) i.className = 'expand-item glass-card'; setTimeout(() => { if(typeof Chart !== 'undefined' && pieChart) pieChart.resize(); if(typeof Chart !== 'undefined' && barChart) barChart.resize(); if(typeof Chart !== 'undefined' && lineChart) lineChart.resize(); }, 300); }

function renderShortcuts() { 
    if(APP_MODE === 'PUBLIC') return; // Hilangkan Shortcut input dari Wali Santri
    const c = document.getElementById('quickActionsContainer'); 
    c.className = 'quick-actions-wrap grid-mode grid-split-4'; 
    if(activeWallet === 'utama') {
        c.innerHTML = ` 
            <button class="btn-quick svg-hijau glass-card" onclick="quickInput('masuk', 'Infak Santri', 'Penerimaan Infak')">${svgs.uang} <span>Infak Santri</span></button> 
            <button class="btn-quick svg-biru glass-card" onclick="quickInput('masuk', 'SPP Santri', 'Pembayaran SPP')">${svgs.user} <span>Terima SPP</span></button> 
            <button class="btn-quick svg-merah glass-card" onclick="quickInput('keluar', 'Honor Guru', 'Pembayaran Honor')">${svgs.makan} <span>Honor Guru</span></button> 
            <button class="btn-quick svg-kuning glass-card" onclick="quickInput('masuk', 'Bantuan Pemerintah', 'Dana Bantuan')">${svgs.plus_bold} <span>Pemasukan Lain</span></button> 
        `;
    } else if(activeWallet === 'wakaf') {
        c.innerHTML = `
            <button class="btn-quick svg-hijau glass-card" onclick="quickInput('masuk', 'Wakaf', 'Penerimaan Wakaf')">${svgs.uang} <span>Terima Wakaf</span></button> 
            <button class="btn-quick svg-merah glass-card" onclick="quickInput('keluar', 'Perbaikan Bangunan', 'Penggunaan Wakaf')">${svgs.plus_bold} <span>Gunakan Wakaf</span></button>
            <button class="btn-quick svg-kuning glass-card" onclick="quickInput('keluar', 'Kebersihan', 'Biaya Kebersihan')">${svgs.minus_bold} <span>Pemeliharaan</span></button>
            <button class="btn-quick svg-biru glass-card" onclick="quickInput('masuk', 'Lainnya', 'Penerimaan Lain')">${svgs.plus_bold} <span>Lainnya (+)</span></button> 
        `;
    } else if(activeWallet === 'operasional') {
        c.innerHTML = `
            <button class="btn-quick svg-merah glass-card" onclick="quickInput('keluar', 'Listrik', 'Bayar Listrik')">${svgs.minus_bold} <span>Bayar Listrik</span></button>
            <button class="btn-quick svg-biru glass-card" onclick="quickInput('keluar', 'Air', 'Bayar Air')">${svgs.minus_bold} <span>Bayar Air</span></button>
            <button class="btn-quick svg-kuning glass-card" onclick="quickInput('keluar', 'ATK', 'Beli ATK')">${svgs.book} <span>Beli ATK</span></button>
            <button class="btn-quick svg-hijau glass-card" onclick="quickInput('masuk', 'Hibah', 'Suntikan Dana')">${svgs.plus_bold} <span>Tambah Dana</span></button>
        `;
    } else if(activeWallet === 'darurat') {
        c.innerHTML = `
            <button class="btn-quick svg-merah glass-card" onclick="quickInput('keluar', 'Transfer Darurat', 'Penggunaan Dana Darurat')">${svgs.minus_bold} <span>Pakai Dana</span></button>
            <button class="btn-quick svg-hijau glass-card" onclick="openPindahDanaModal()">${svgs.plus_bold} <span>Terima Transfer</span></button>
        `;
    }
}

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

function updateHealthEngine(filteredDb) { 
    let tIn = 0, tOut = 0; filteredDb.forEach(t => { if(t.type === 'masuk') tIn += t.amount; else tOut += t.amount; }); 
    let balance = tIn - tOut; const badge = document.getElementById('healthBadge'); const text = document.getElementById('healthText'); 
    if(!badge) return;
    badge.className = 'health-badge'; 
    if (tIn === 0 && tOut === 0) { badge.classList.add('health-netral'); text.innerText = 'Netral'; } 
    else if (balance < 0) { badge.classList.add('health-kritis'); text.innerText = 'Defisit'; } 
    else if (balance >= 0 && balance <= 50000) { badge.classList.add('health-waspada'); text.innerText = 'Waspada'; } 
    else { badge.classList.add('health-sehat'); text.innerText = 'Sehat'; } 
    generateAIForecast(filteredDb); 
}

function generateAIForecast(data) { 
    const textEl = document.getElementById('aiInsightText'); 
    aiMessages = []; 
    if (data.length === 0) { 
        aiMessages.push(`Belum ada pergerakan kas di dompet ${activeWallet.toUpperCase()}.`);
        if(APP_MODE === 'GUEST') aiMessages.push("Info: Hubungkan dengan Akun Google agar data TPA aman tersinkronisasi ke Cloud.");
        startAICarousel(textEl); return; 
    } 
    
    const today = new Date(); const currentMonthData = data.filter(t => { const d = new Date(t.date); return d.getMonth() === today.getMonth() && d.getFullYear() === today.getFullYear(); }); 
    const masukData = currentMonthData.filter(t => t.type === 'masuk'); const keluarData = currentMonthData.filter(t => t.type === 'keluar'); 
    let mIn = masukData.reduce((sum, t) => sum + t.amount, 0); let mOut = keluarData.reduce((sum, t) => sum + t.amount, 0); 
    
    if (keluarData.length > 0) { 
        let catTotals = {}; keluarData.forEach(t => { catTotals[t.category] = (catTotals[t.category] || 0) + t.amount; }); 
        let biggestCat = Object.keys(catTotals).reduce((a, b) => catTotals[a] > catTotals[b] ? a : b); 
        aiMessages.push(`Beban operasional terbesar bulan ini: ${properTitleCase(biggestCat)} (${formatRp(catTotals[biggestCat])}).`); 
    }
    
    if (mOut > mIn && mIn > 0) { aiMessages.push(`⚠️ Pengeluaran dompet ${activeWallet} bulan ini melampaui pemasukan. Pertimbangkan Transfer Dana Darurat.`); } 
    else if (mOut > 0) { aiMessages.push(`Arus kas normal. Tetap pantau alokasi dana operasional TPA.`); } 
    else if (mIn > 0 && mOut === 0) { aiMessages.push("Luar biasa! Seluruh pemasukan bulan ini masih utuh."); } 
    
    if(activeWallet === 'darurat') aiMessages.push("Dana Darurat hanya boleh digunakan untuk keadaan mendesak di luar RAB TPA.");
    aiMessages = [...new Set(aiMessages)].filter(m => m !== ""); 
    startAICarousel(textEl); 
}

let aiCarouselInterval = null;
let aiCurrentMsgIdx = 0;
function startAICarousel(textEl) { 
    if (aiCarouselInterval) clearInterval(aiCarouselInterval); 
    aiCurrentMsgIdx = 0; textEl.innerText = aiMessages[0]; textEl.style.opacity = 1;
    if (aiMessages.length > 1) { 
        aiCarouselInterval = setInterval(() => { 
            textEl.style.opacity = 0; 
            setTimeout(() => { 
                aiCurrentMsgIdx = (aiCurrentMsgIdx + 1) % aiMessages.length; 
                textEl.innerText = aiMessages[aiCurrentMsgIdx]; 
                textEl.style.opacity = 1; 
            }, 500); 
        }, 12000); 
    } 
}

function renderTable(data) {
    const t = document.getElementById('table-body');
    if(data.length === 0) { t.innerHTML = `<tr><td colspan="5" style="text-align:center; padding: 30px; color:var(--text-muted);">Kosong.</td></tr>`; isInitialTableRender = false; return; }
    
    let htmlStr = '';
    const animClass = isInitialTableRender ? 'row-anim' : ''; 
    [...data].sort((a,b) => new Date(b.date) - new Date(a.date)).forEach(tx => {
        const iM = tx.type === 'masuk'; 
        let linkHtml = tx.link_bukti ? `<a href="${tx.link_bukti}" target="_blank" style="color:var(--text-muted); font-size:11px; text-decoration:underline; display:block; margin-top:2px; cursor:pointer;" onclick="event.stopPropagation()">&#128279; Drive</a>` : '';
        let pihakHtml = tx.pihak_terkait ? `<br><span style="font-size:11px; color:var(--text-muted);">Pihak: <b class="text-neutral">${tx.pihak_terkait}</b></span>` : '';
        
        let cr = `<div class="badge-cat">${tx.category}</div>`;
        htmlStr += `<tr class="clickable-row ${animClass}" onclick="openReceipt('${tx.id || tx.date}')">
            <td style="color:var(--text-muted); font-size:11px; vertical-align:middle;">${formatDetailDate(tx.date).split(' - ')[0]}<br>${formatDetailDate(tx.date).split(' - ')[1]}</td>
            <td style="width: 1%; white-space: nowrap; padding: 15px 10px; vertical-align: middle;">${cr}</td>
            <td style="vertical-align:middle; width:100%;"><span class="text-neutral" style="font-weight:700;">${tx.desc}</span>${pihakHtml}${linkHtml}</td>
            <td class="th-admin-only" style="vertical-align:middle; text-align:center; padding-right:15px; width:1%; ${APP_MODE==='PUBLIC'?'display:none;':''}">
                <div style="display:flex; gap:6px; justify-content:center; align-items:center;">
                    <button type="button" class="btn-cal-nav" style="background:transparent; border-color:var(--border);" onclick="event.stopPropagation(); promptGlobalPin('editTx', '${tx.id || tx.date}')"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/></svg></button>
                    <button type="button" class="btn-cal-nav text-red" style="background:transparent; border-color:var(--border);" onclick="event.stopPropagation(); promptGlobalPin('deleteTx', '${tx.id || tx.date}')"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2-2v2"/></svg></button>
                </div>
            </td>
            <td class="amt-cell" style="vertical-align:middle; text-align:right; color:var(--teks-netral); white-space:nowrap; padding-left:0;">${iM?'+':'-'}${formatRp(tx.amount)}</td>
        </tr>`;
    });
    t.innerHTML = htmlStr; isInitialTableRender = false; 
}

function renderCharts(data) {
    if (typeof Chart === 'undefined') return;
    if (!document.getElementById('pieChart')) return; 
    Chart.defaults.color = '#64748b'; Chart.defaults.font.family = 'Inter';
    if(data.length === 0) { if(pieChart) pieChart.destroy(); if(barChart) barChart.destroy(); if(lineChart) lineChart.destroy(); return; }

    const gridLineColor = 'rgba(148, 163, 184, 0.2)';
    const cA = {}; data.forEach(t => { const k = `${t.category}`; if(cA[k]) cA[k].a += t.amount; else cA[k] = { a: t.amount, color: getDynamicColor(t.category, t.type) }; }); 
    const pL = Object.keys(cA);
    
    if(pieChart) pieChart.destroy(); 
    pieChart = new Chart(document.getElementById('pieChart'), { type: 'doughnut', data: { labels: pL, datasets: [{ data: pL.map(l => cA[l].a), backgroundColor: pL.map(l => cA[l].color), borderWidth: 2, borderColor: 'transparent' }] }, options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } } } });

    const rT = [...data].sort((a,b) => new Date(a.date) - new Date(b.date)).slice(-15);
    if(barChart) barChart.destroy(); 
    barChart = new Chart(document.getElementById('barChart'), { type: 'bar', data: { labels: rT.map(t => t.desc.substring(0,8)), datasets: [{ data: rT.map(t => t.type === 'masuk' ? t.amount : -t.amount), backgroundColor: rT.map(t => getDynamicColor(t.category, t.type)), borderRadius: 4 }] }, options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: { x: { display: false }, y: { grid: { color: gridLineColor } } } } });

    let cI = 0, cO = 0, hI = [], hO = []; 
    [...data].sort((a,b)=> new Date(a.date)-new Date(b.date)).forEach(t => { if(t.type === 'masuk') cI += t.amount; else cO += t.amount; hI.push(cI); hO.push(cO); });
    if(lineChart) lineChart.destroy(); 
    lineChart = new Chart(document.getElementById('lineChart'), { type: 'line', data: { labels: hI.map((_,i)=> `T${i+1}`), datasets: [{ label: 'Pemasukan', data: hI, borderColor: '#10b981', backgroundColor: 'rgba(16, 185, 129, 0.1)', fill: true, pointRadius: 2, tension: 0.3 }, { label: 'Pengeluaran', data: hO, borderColor: '#ef4444', backgroundColor: 'rgba(239, 68, 68, 0.1)', fill: true, pointRadius: 2, tension: 0.3 }] }, options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: { x: { display: false }, y: { grid: { color: gridLineColor } } } } });
}

function openReceipt(txId) { 
    const strTxId = String(txId); const tx = db.find(t => String(t.id) === strTxId || String(t.date) === strTxId); if(!tx) return; 
    const rDate = formatDetailDate(tx.date); const rId = "TRX-" + new Date(tx.date).getTime().toString().slice(-8); 
    const rType = tx.type === 'masuk' ? 'Pemasukan' : 'Pengeluaran';
    document.getElementById('receiptContent').innerHTML = ` 
        <div class="receipt-head"><h3 style="margin:0 0 5px 0;" class="text-neutral">BUKTI MUTASI TPA</h3><span style="font-size:11px; color:var(--text-muted); letter-spacing: 1px;">ID: ${rId}</span></div> 
        <div class="receipt-row"><span class="receipt-label">Waktu</span><span class="receipt-val text-neutral">${rDate}</span></div> 
        <div class="receipt-row"><span class="receipt-label">Dompet</span><span class="receipt-val text-neutral" style="text-transform:capitalize;">${tx.wallet}</span></div> 
        <div class="receipt-row"><span class="receipt-label">Kategori</span><span class="receipt-val text-neutral">${tx.category}</span></div> 
        <div class="receipt-row"><span class="receipt-label">Sifat</span><span class="receipt-val text-neutral">${rType}</span></div> 
        <div class="receipt-row"><span class="receipt-label">Keterangan</span><span class="receipt-val text-neutral">${tx.desc}</span></div> 
        ${tx.pihak_terkait ? `<div class="receipt-row"><span class="receipt-label">Pihak Terkait</span><span class="receipt-val text-neutral">${tx.pihak_terkait}</span></div>` : ''} 
        ${tx.link_bukti ? `<div class="receipt-row" style="margin-top:10px;"><span class="receipt-label" style="color:var(--text-muted);">Lampiran Drive</span><span class="receipt-val"><a href="${tx.link_bukti}" target="_blank" style="color:var(--biru); text-decoration:underline;">Buka Dokumen ↗</a></span></div>` : ''} 
        <div class="receipt-row" style="margin-top:25px; border-top:2px dashed var(--border); padding-top:20px; align-items: flex-end;"> 
            <span class="receipt-label" style="font-size:14px; color:var(--text-muted);">TOTAL</span> 
            <span class="receipt-val text-neutral" style="font-size: clamp(16px, 5.5vw, 22px); letter-spacing:-1px;">${formatRp(tx.amount)}</span> 
        </div> 
    `; 
    openModal('receiptModal'); 
}


// ==========================================
// TRANSACTIONS INPUT & TRANSFER DARURAT
// ==========================================
function selectCategory(val) { document.getElementById('tx-category').value = val; document.getElementById('dispTxCat').innerText = val; closeModal(''); }

function quickInput(type, cat, desc) { 
    document.getElementById('tx-type').value = type; 
    document.getElementById('modal-title').innerText = type === 'masuk' ? 'Catat Pemasukan TPA' : 'Catat Pengeluaran TPA'; 
    document.getElementById('tx-desc').value = desc; 
    document.getElementById('tx-pihak-terkait').value = ''; 
    document.getElementById('tx-category-manual').value = '';
    
    // Set custom date default
    const dt = new Date();
    document.getElementById('tx-date').value = dt.toISOString();
    document.getElementById('disp-tx-date').innerText = formatDetailDate(dt.toISOString());

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
document.getElementById('edit-tx-amount').addEventListener('input', function() { let v = this.value.replace(/[^0-9]/g, ''); if(v === '') { editRawAmount = 0; this.value = ''; return; } editRawAmount = parseInt(v, 10); this.value = editRawAmount.toLocaleString('id-ID'); });
document.getElementById('transfer-amount').addEventListener('input', function() { let v = this.value.replace(/[^0-9]/g, ''); if(v === '') { this.value = ''; return; } this.value = parseInt(v, 10).toLocaleString('id-ID'); });

document.getElementById('btnExecuteTx').addEventListener('click', async () => { 
    if(rawAmount <= 0) { showToast("Nominal 0", "error"); return; } 
    if (document.getElementById('tx-is-saving').value === 'true') return; document.getElementById('tx-is-saving').value = 'true'; 
    
    openConfirmModal("Eksekusi Transaksi", "Data akan dimasukkan ke pembukuan. Lanjutkan?", async () => {
        try {
            const type = document.getElementById('tx-type').value; 
            let cF = document.getElementById('tx-category-manual').style.display === 'block' ? document.getElementById('tx-category-manual').value.trim() : document.getElementById('tx-category').value; 
            let dF = document.getElementById('tx-desc').value.trim(); 
            const pihak = document.getElementById('tx-pihak-terkait').value.trim();
            let finalDate = document.getElementById('tx-date').value || new Date().toISOString();

            if(!cF || !dF) { showToast("Kategori & Deskripsi wajib", "error"); return; } 
            cF = properTitleCase(cF); dF = properTitleCase(dF);
            
            let tx = { wallet: activeWallet, type: type, category: cF, desc: dF, pihak_terkait: properTitleCase(pihak), amount: rawAmount, date: finalDate };
            
            if(APP_MODE === 'CLOUD' && navigator.onLine && sbClient && (!currentUser || currentUser.id !== 'offline_user')) { 
                try { 
                    let data = { ...tx, user_id: currentUser.id };
                    await sbClient.from('transactions').insert([data]); 
                    await fetchUserTransactions(); closeModal('txModal'); showToast("Tersimpan di Cloud"); 
                } catch(e) { 
                    tx.id = Date.now() + Math.random(); db.push(tx); pendingSync.push(tx); setLS('pending_sync', JSON.stringify(pendingSync)); saveLocalDB(db); closeModal('txModal'); updateUI(''); showToast("Masuk Antrean Offline.", "syncing"); 
                }
            } else { 
                tx.id = Date.now() + Math.floor(Math.random() * 1000); db.push(tx); 
                if (APP_MODE === 'CLOUD') { pendingSync.push(tx); setLS('pending_sync', JSON.stringify(pendingSync)); }
                saveLocalDB(db); closeModal('txModal'); updateUI(''); showToast("Disimpan di Lokal"); 
            }
        } finally { document.getElementById('tx-is-saving').value = 'false'; }
    });
});

function openPindahDanaModal() {
    document.getElementById('transfer-amount').value = '';
    document.getElementById('transfer-source').value = 'utama';
    document.getElementById('dispTransferSource').innerText = 'Kas Utama';
    openModal('transferDanaModal');
}
function selectTransferSource(val) {
    document.getElementById('transfer-source').value = val;
    document.getElementById('dispTransferSource').innerText = "Kas " + properTitleCase(val);
    closeModal('');
}

function executeTransferDarurat() {
    const amountVal = document.getElementById('transfer-amount').value.replace(/[^0-9]/g, '');
    const amount = amountVal ? parseInt(amountVal, 10) : 0;
    const source = document.getElementById('transfer-source').value;
    
    if(amount <= 0) { showToast("Nominal tidak valid", "error"); return; }
    if(source === 'darurat') { showToast("Sumber tidak bisa dari Dana Darurat", "error"); return; }
    
    openConfirmModal("Transfer Darurat", `Pindahkan ${formatRp(amount)} dari ${properTitleCase(source)} ke Darurat?`, async () => {
        const dateNow = new Date().toISOString();
        
        let txOut = { wallet: source, type: 'keluar', category: 'Transfer Darurat', desc: 'Mutasi Keluar ke Dana Darurat', amount: amount, date: dateNow, id: Date.now()+1 };
        let txIn = { wallet: 'darurat', type: 'masuk', category: 'Dana Darurat', desc: `Terima Transfer dari ${properTitleCase(source)}`, amount: amount, date: dateNow, id: Date.now()+2 };
        
        db.push(txOut, txIn);
        if(APP_MODE === 'CLOUD') { pendingSync.push(txOut, txIn); setLS('pending_sync', JSON.stringify(pendingSync)); processPendingSync(); }
        saveLocalDB(db);
        closeModal('transferDanaModal');
        updateUI('');
        showToast("Transfer Berhasil", "success");
    });
}

function openEditTxModal(txId) { 
    const tx = db.find(t => String(t.id) === txId || String(t.date) === txId); if(!tx) return; 
    document.getElementById('edit-tx-id').value = txId; 
    document.getElementById('edit-tx-category').value = tx.category; 
    document.getElementById('edit-tx-desc').value = tx.desc; 
    
    if(tx.date) {
        document.getElementById('edit-tx-date').value = tx.date;
        document.getElementById('disp-edit-tx-date').innerText = formatDetailDate(tx.date);
    }
    editRawAmount = tx.amount; 
    document.getElementById('edit-tx-amount').value = editRawAmount.toLocaleString('id-ID'); 
    openModal('editTxModal'); 
}

async function saveEditedTx() {
    const txId = document.getElementById('edit-tx-id').value; const idx = db.findIndex(t => String(t.id) === txId || String(t.date) === txId); if (idx === -1) return;
    const nCat = properTitleCase(document.getElementById('edit-tx-category').value.trim()); const nDesc = properTitleCase(document.getElementById('edit-tx-desc').value.trim());
    const nDateInput = document.getElementById('edit-tx-date').value;

    if(!nCat || !nDesc || editRawAmount <= 0) { showToast("Data tidak lengkap.", "error"); return; }
    openConfirmModal("Simpan Perubahan", "Perbarui transaksi ini?", async () => {
        db[idx].category = nCat; db[idx].desc = nDesc; db[idx].amount = editRawAmount;
        if(nDateInput) db[idx].date = nDateInput;

        if (APP_MODE === 'CLOUD' && currentUser && currentUser.id !== 'offline_user' && navigator.onLine && sbClient && db[idx].id) { 
            try { await sbClient.from('transactions').update({ category: nCat, "desc": nDesc, amount: editRawAmount, date: db[idx].date }).eq('id', db[idx].id); } 
            catch(e) { let syncIdx = pendingSync.findIndex(t => String(t.id) === txId || String(t.date) === txId); if(syncIdx > -1) pendingSync[syncIdx] = db[idx]; else pendingSync.push(db[idx]); setLS('pending_sync', JSON.stringify(pendingSync)); } 
        } else { let syncIdx = pendingSync.findIndex(t => String(t.id) === txId || String(t.date) === txId); if(syncIdx > -1) { pendingSync[syncIdx] = db[idx]; setLS('pending_sync', JSON.stringify(pendingSync)); } }
        saveLocalDB(db); closeModal('editTxModal'); updateUI(''); showToast("Berhasil Diperbarui.", "success");
    });
}

async function executeTxDeleteFinal(txId) {
    const idx = db.findIndex(t => String(t.id) === txId || String(t.date) === txId); if (idx === -1) return; const delTx = db[idx]; db.splice(idx, 1);
    if (APP_MODE === 'CLOUD' && currentUser && currentUser.id !== 'offline_user' && navigator.onLine && sbClient && delTx.id) { try { await sbClient.from('transactions').delete().eq('id', delTx.id); } catch(e) {} } else { pendingSync = pendingSync.filter(t => String(t.id) !== txId && String(t.date) !== txId); setLS('pending_sync', JSON.stringify(pendingSync)); }
    saveLocalDB(db); updateUI(''); showToast("Dihapus Permanen.", "success");
}

// ==========================================
// WISHLIST & DRIVE LINKS
// ==========================================
function renderWishlist() {
    const container = document.getElementById('wishlistContainer');
    if(wishlists.length === 0) { container.innerHTML = `<div class="glass-card text-neutral p-10 text-center text-sm">Kosong.</div>`; return; }
    container.innerHTML = wishlists.map(w => `
        <div class="glass-card" style="padding:15px; display:flex; justify-content:space-between; align-items:center;">
            <div><div class="text-xs font-bold text-muted mb-10">${w.name}</div><div class="text-sm font-bold text-neutral">Est: ${formatRp(w.amount)}</div></div>
            <button class="btn-cal-nav text-red admin-only-btn" onclick="openConfirmModal('Hapus Target', 'Hapus target dana ini?', () => deleteWishlist('${w.id}'))">✕</button>
        </div>
    `).join('');
}
function openAddWishlistModal() { document.getElementById('wishlist-name').value = ''; document.getElementById('wishlist-amount').value = ''; openModal('addWishlistModal'); }
function saveWishlist() {
    const name = properTitleCase(document.getElementById('wishlist-name').value.trim());
    const amountVal = document.getElementById('wishlist-amount').value.replace(/[^0-9]/g, '');
    const amount = amountVal ? parseInt(amountVal, 10) : 0;
    if(!name || amount <= 0) { showToast("Data tidak valid", "error"); return; }
    wishlists.push({ id: Date.now().toString(), name, amount }); setLS('wishlists', JSON.stringify(wishlists)); renderWishlist(); closeModal('addWishlistModal');
}
function deleteWishlist(id) { wishlists = wishlists.filter(w => w.id !== id); setLS('wishlists', JSON.stringify(wishlists)); renderWishlist(); }

function renderDriveLinks() {
    const container = document.getElementById('driveContainer');
    if(driveLinks.length === 0) { container.innerHTML = `<div class="glass-card text-neutral p-10 text-center text-sm w-100">Kosong.</div>`; return; }
    container.innerHTML = driveLinks.map(d => `
        <div class="glass-card" style="padding:12px 15px; display:flex; align-items:center; gap:10px; min-width:200px;">
            ${svgs.link}
            <a href="${d.url}" target="_blank" class="text-neutral font-bold flex-1" style="text-decoration:none; font-size:13px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${d.name}</a>
            <button class="btn-cal-nav text-red admin-only-btn" onclick="openConfirmModal('Hapus Link', 'Hapus link ini?', () => deleteDriveLink('${d.id}'))">✕</button>
        </div>
    `).join('');
}
function openAddDriveModal() { document.getElementById('drive-name').value = ''; document.getElementById('drive-url').value = ''; openModal('addDriveModal'); }
function saveDriveLink() {
    const name = properTitleCase(document.getElementById('drive-name').value.trim());
    const url = document.getElementById('drive-url').value.trim();
    if(!name || !url.startsWith('http')) { showToast("Format tidak valid", "error"); return; }
    driveLinks.push({ id: Date.now().toString(), name, url }); setLS('drivelinks', JSON.stringify(driveLinks)); renderDriveLinks(); closeModal('addDriveModal');
}
function deleteDriveLink(id) { driveLinks = driveLinks.filter(d => d.id !== id); setLS('drivelinks', JSON.stringify(driveLinks)); renderDriveLinks(); }


// ==========================================
// EXPORT CSV
// ==========================================
function openCSVModal() { if(db.length === 0) { showToast("Data kosong.", "error"); return; } openModal('csvExportModal'); }
function executeCSVExport() { 
    closeModal('csvExportModal'); let csv = "Tanggal,Dompet,Tipe,Kategori,Keterangan,Pihak_Terkait,Nominal\n"; 
    const startDateVal = document.getElementById('csv-start-date').value;
    const endDateVal = document.getElementById('csv-end-date').value;

    const filteredData = db.filter(tx => { 
        if(tx.wallet !== activeWallet) return false; 
        let txDate = new Date(tx.date); txDate.setHours(0,0,0,0);
        if (startDateVal) { let sDate = new Date(startDateVal); sDate.setHours(0,0,0,0); if (txDate < sDate) return false; }
        if (endDateVal) { let eDate = new Date(endDateVal); eDate.setHours(23,59,59,999); if (txDate > eDate) return false; }
        return true; 
    });

    if(filteredData.length === 0) { showToast("Data filter kosong.", "error"); return; }
    [...filteredData].sort((a,b) => new Date(a.date) - new Date(b.date)).forEach(row => { let r = [formatDetailDate(row.date), row.wallet, row.type, row.category, row.desc, row.pihak_terkait||'-', row.amount]; csv += r.map(v => `"${v}"`).join(",") + "\n"; }); 
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' }); const link = document.createElement("a"); link.href = URL.createObjectURL(blob); link.download = `Laporan_TPA_${activeWallet.toUpperCase()}_${new Date().toISOString().split('T')[0]}.csv`; 
    document.body.appendChild(link); link.click(); document.body.removeChild(link); showToast("CSV Berhasil Diunduh", "success"); 
}

const searchInput = document.getElementById('searchTxInput'); const searchClear = document.getElementById('searchClearBtn'); 
if(searchInput) { searchInput.addEventListener('input', function(e) { let val = e.target.value.toLowerCase(); searchClear.style.display = val.length > 0 ? 'block' : 'none'; updateUI(val); }); }
function clearSearch() { searchInput.value = ''; searchClear.style.display = 'none'; updateUI(''); }


// ==========================================
// MODUL SPP (MULTI-BULAN) & ABSENSI
// ==========================================
const listBulan = ["Januari", "Februari", "Maret", "April", "Mei", "Juni", "Juli", "Agustus", "September", "Oktober", "November", "Desember"];

function openSPPModal() { openModal('sppModal'); renderSppTable(); }

function addSppStudent() {
    const input = document.getElementById('newSppName'); const name = properTitleCase(input.value.trim());
    if (!name) { showToast("Nama santri wajib diisi", "error"); return; }
    sppData.push({ id: Date.now().toString(), name: name, months: [] });
    setLS('spp_data_v4', JSON.stringify(sppData)); input.value = ''; renderSppTable(); showToast("Santri ditambahkan", "success");
}

function renderSppTable() {
    const tbody = document.getElementById('sppTableBody');
    let displayData = sppData;
    
    // Jika Mode Publik, filter hanya murid yang dipilih ortu
    if(APP_MODE === 'PUBLIC' && publicStudentName) {
        displayData = sppData.filter(s => s.name === publicStudentName);
    }

    if (displayData.length === 0) { tbody.innerHTML = `<tr><td colspan="4" class="text-center p-10 text-muted">Belum ada data.</td></tr>`; return; }
    
    tbody.innerHTML = displayData.map(s => {
        let sortedMonths = (s.months || []).sort((a,b) => listBulan.indexOf(a) - listBulan.indexOf(b));
        let badgesHtml = sortedMonths.length > 0 ? sortedMonths.map(m => `<span class="badge-month">${m.substring(0,3)}</span>`).join('') : '<span class="text-muted text-xs">Belum Ada</span>';
        let statHtml = sortedMonths.length > 0 ? `<span class="text-hijau font-bold">LUNAS (${sortedMonths.length})</span>` : `<span class="text-merah font-bold">TUNGGAKAN</span>`;
        
        return `
        <tr class="spp-row">
            <td class="p-10 font-bold text-neutral">${s.name}</td>
            <td class="p-10 text-center" style="max-width: 150px; white-space: normal;">${badgesHtml}</td>
            <td class="p-10 text-center">${statHtml}</td>
            <td class="p-10 text-center th-admin-only spp-action-col" style="${APP_MODE==='PUBLIC'?'display:none;':''}">
                <div class="d-flex gap-10 flex-center">
                    <button class="btn-cal-nav text-neutral" onclick="openSppMonthEdit('${s.id}')">✎</button>
                    <button class="btn-cal-nav text-red" onclick="openConfirmModal('Hapus', 'Hapus santri?', () => deleteSpp('${s.id}'))">✕</button>
                </div>
            </td>
        </tr>`;
    }).join('');
}

function deleteSpp(id) { sppData = sppData.filter(s => s.id !== id); setLS('spp_data_v4', JSON.stringify(sppData)); renderSppTable(); }

function openSppMonthEdit(id) {
    const student = sppData.find(s => s.id === id); if(!student) return;
    document.getElementById('sppEditTitle').innerText = "Atur SPP: " + student.name;
    document.getElementById('sppEditTargetId').value = id;
    
    const grid = document.getElementById('monthCheckboxGrid');
    grid.innerHTML = listBulan.map(m => {
        let isChecked = (student.months || []).includes(m) ? 'checked' : '';
        return `<label class="month-checkbox-label"><input type="checkbox" value="${m}" class="spp-chk" ${isChecked}> ${m.substring(0,3)}</label>`;
    }).join('');
    
    openModal('sppEditMonthModal');
}

function saveSppMonths() {
    const id = document.getElementById('sppEditTargetId').value;
    const studentIdx = sppData.findIndex(s => s.id === id); if(studentIdx === -1) return;
    
    let checked = [];
    document.querySelectorAll('.spp-chk:checked').forEach(c => checked.push(c.value));
    
    sppData[studentIdx].months = checked;
    setLS('spp_data_v4', JSON.stringify(sppData));
    closeModal('sppEditMonthModal');
    renderSppTable();
}

function filterSppTable() {
    const q = document.getElementById('searchSppInput').value.toLowerCase();
    document.querySelectorAll('.spp-row').forEach(row => {
        const name = row.querySelector('td').innerText.toLowerCase();
        row.style.display = name.includes(q) ? '' : 'none';
    });
}

// ABSENSI ENGINE
function openAbsensiModal() {
    // Default hari ini
    const dt = new Date();
    document.getElementById('absen-date').value = dt.toISOString();
    document.getElementById('disp-absen-date').innerText = formatDetailDate(dt.toISOString()).split(' - ')[0];
    
    openModal('absensiModal');
    renderAbsensiTable();
}

function renderAbsensiTable() {
    const tbody = document.getElementById('absensiTableBody');
    const currentDate = document.getElementById('absen-date').value;
    const dateKey = currentDate ? new Date(currentDate).toISOString().split('T')[0] : new Date().toISOString().split('T')[0];
    
    let currentRec = absensiData.find(a => a.date === dateKey);
    let recordsMap = {};
    if(currentRec) { currentRec.records.forEach(r => recordsMap[r.id] = r.status); }

    let displayData = sppData;
    if(APP_MODE === 'PUBLIC' && publicStudentName) {
        displayData = sppData.filter(s => s.name === publicStudentName);
    }

    if (displayData.length === 0) { tbody.innerHTML = `<tr><td colspan="2" class="text-center p-10 text-muted">Belum ada data santri.</td></tr>`; return; }

    tbody.innerHTML = displayData.map(s => {
        let stat = recordsMap[s.id] || "Belum Absen";
        
        let selectHtml = '';
        if(APP_MODE === 'PUBLIC') {
            let color = stat === 'Hadir' ? 'var(--hijau)' : (stat==='Belum Absen' ? 'var(--text-muted)' : 'var(--kuning)');
            selectHtml = `<span style="color:${color}; font-weight:800;">${stat}</span>`;
        } else {
            selectHtml = `
            <select class="absensi-select" data-id="${s.id}">
                <option value="Belum Absen" ${stat==='Belum Absen'?'selected':''}>Belum Absen</option>
                <option value="Hadir" ${stat==='Hadir'?'selected':''}>Hadir</option>
                <option value="Sakit" ${stat==='Sakit'?'selected':''}>Sakit</option>
                <option value="Izin" ${stat==='Izin'?'selected':''}>Izin</option>
                <option value="Alfa" ${stat==='Alfa'?'selected':''}>Alfa</option>
            </select>`;
        }

        return `
        <tr class="spp-row">
            <td class="p-10 font-bold text-neutral">${s.name}</td>
            <td class="p-10 text-center">${selectHtml}</td>
        </tr>`;
    }).join('');
}

// Re-render absensi jika tanggal diganti dari Custom DatePicker
document.getElementById('disp-absen-date').addEventListener('DOMSubtreeModified', renderAbsensiTable);

function saveAbsensi() {
    const currentDate = document.getElementById('absen-date').value;
    const dateKey = currentDate ? new Date(currentDate).toISOString().split('T')[0] : new Date().toISOString().split('T')[0];
    
    let records = [];
    document.querySelectorAll('.absensi-select').forEach(sel => {
        records.push({ id: sel.getAttribute('data-id'), status: sel.value });
    });
    
    let existingIdx = absensiData.findIndex(a => a.date === dateKey);
    if(existingIdx > -1) { absensiData[existingIdx].records = records; }
    else { absensiData.push({ date: dateKey, records: records }); }
    
    setLS('absensi_data_v4', JSON.stringify(absensiData));
    showToast("Rekap Absensi Tersimpan");
}


// ==========================================
// SHARE LINK TRANSPARANSI
// ==========================================
function openShareLinkModal() {
    const currentDomain = window.location.origin + window.location.pathname;
    document.getElementById('publicLinkInput').innerText = `${currentDomain}?view=public`;
    openModal('shareLinkModal');
}
function copyPublicLink() {
    const val = document.getElementById('publicLinkInput').innerText;
    try { navigator.clipboard.writeText(val).then(() => { showToast("Tautan disalin!", "success"); closeModal('shareLinkModal'); }).catch(err => { showToast("Gagal Salin!", "error"); });
    } catch (err) {}
}


// ==========================================
// LUPA PIN (OTP via EmailJS)
// ==========================================
function startOTPResetProcess() { closeModal(''); if(!profile.googleLinked || !profile.googleEmail) { showToast("Belum terhubung Google!", "error"); return; } if(!navigator.onLine) { showToast("Butuh koneksi internet!", "error"); return; } document.getElementById('displayUserEmail').innerText = profile.googleEmail; openModal('otpRequestModal'); }
function sendOTPEmail() { if(!navigator.onLine) { showToast("Koneksi terputus!", "error"); return; } const btn = document.getElementById('btnSendOTP'); btn.innerText = "Mengirim..."; btn.disabled = true; generatedOTP = Math.floor(100000 + Math.random() * 900000).toString(); otpExpiryTime = Date.now() + (5 * 60 * 1000); const templateParams = { to_email: profile.googleEmail, to_name: profile.name, otp_code: generatedOTP }; emailjs.send('service_4v89q7h', 'template_w9fgvcf', templateParams).then(function() { showToast("Terkirim ke Email!"); closeModal('otpRequestModal'); document.getElementById('inputOTP').value = ''; document.getElementById('inputNewPinOTP').value = ''; openModal('otpVerifyModal'); btn.innerText = "Kirim Kode"; btn.disabled = false; }, function(e) { showToast("Error EmailJS", "error"); btn.innerText = "Kirim Kode"; btn.disabled = false; }); }
async function verifyOTPAndSavePin() { const inputCode = document.getElementById('inputOTP').value; const newPin = document.getElementById('inputNewPinOTP').value; if(Date.now() > otpExpiryTime) { showToast("OTP Kadaluarsa!", "error"); return; } if(inputCode !== generatedOTP) { showToast("OTP Salah!", "error"); return; } if(newPin.length < 4) { showToast("PIN min 4 digit!", "error"); return; } profile.pin = await hashPIN(newPin); saveProfileLocal(); await saveProfileToSupabase(); generatedOTP = ""; closeModal('otpVerifyModal'); showToast("PIN direset!"); }

// EXECUTOR TERTINGGI
window.addEventListener('load', () => { bootApp(); });
