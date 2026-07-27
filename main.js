// main.js
// ==========================================
// TPA FINANCE MIGRATION & NAMESPACE ISOLATION
// ==========================================
const APP_VERSION = '1.9'; 
const LS_PREFIX = 'tpa_finance_';

function getLS(key) { return localStorage.getItem(LS_PREFIX + key); }
function setLS(key, val) { localStorage.setItem(LS_PREFIX + key, val); }
function removeLS(key) { localStorage.removeItem(LS_PREFIX + key); }

function checkAppVersion() {
    const savedVersion = getLS('app_version');
    if (savedVersion !== APP_VERSION) {
        setLS('app_version', APP_VERSION);
        if (navigator.onLine) {
            const updateScreen = document.getElementById('updateScreen');
            if (updateScreen) {
                updateScreen.style.display = 'flex';
                setTimeout(() => { window.location.reload(true); }, 1500);
            }
        }
    }
}
checkAppVersion();

// ==========================================
// KONFIGURASI SUPABASE BARU (TPA)
// ==========================================
const SUPABASE_URL = 'https://ndsyyaxmiwskrkklseap.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5kc3l5YXhtaXdza3Jra2xzZWFwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODUxNDU4NjIsImV4cCI6MjEwMDcyMTg2Mn0.uXgAIhUjjkNpe9s6N6LGvRXZLUDQUZJrSfUFf1BDmKU';

let sbClient = null;
let db = []; 
let pendingSync = JSON.parse(getLS('pending_sync')) || []; 
let currentUser = null; 

let APP_MODE = getLS('app_mode') || 'GUEST';
let activeWallet = 'tunai'; 
let currentTimeFilter = 365; 
let rawAmount = 0;
let pieChart, barChart, lineChart; 
let isInitialTableRender = true; 
let realTimeSubscription = null;
let aiMessages = [];
let aiCurrentMsgIdx = 0;
let aiCarouselInterval = null;
let generatedOTP = "";
let otpExpiryTime = 0;
let pendingTxCallback = null;

const defaultProfile = { 
    name: 'Pengurus', pin: '', txPin: '',
    photo: 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAyNCAyNCIgZmlsbD0iIzEwYjk4MSI+PHBhdGggZD0iTTEyIDJhNSA1IDAgMSAwIDUgNSBNMTIgMTRhNyA3IDAgMCAwLTcgN3YxSDE5di0xYTcgNyAwIDAgMC03LTdaIi8+PC9zdmc+', 
    joinDate: new Date().toISOString(), birthDate: '', gender: 'Rahasia', googleLinked: false, googleEmail: ''
};

let profile = JSON.parse(getLS('profile_secure_v1'));
if (!profile) { profile = { ...defaultProfile }; setLS('profile_secure_v1', JSON.stringify(profile)); }

const svgs = {
    makan: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg>`,
    uang: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="2" y="6" width="20" height="12" rx="2"/><circle cx="12" cy="12" r="2"/><path d="M6 12h.01M18 12h.01"/></svg>`,
    book: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/></svg>`,
    user: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path><circle cx="9" cy="7" r="4"></circle><path d="M23 21v-2a4 4 0 0 0-3-3.87"></path><path d="M16 3.13a4 4 0 0 1 0 7.75"></path></svg>`,
    plus_bold: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>`,
    minus_bold: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><line x1="5" y1="12" x2="19" y2="12"></line></svg>`
};

const categories = { 
    masuk: ['Infak Santri', 'Infak Jumat', 'Donasi Masyarakat', 'Wakaf', 'Bantuan Pemerintah', 'Bantuan Masjid', 'Hibah', 'Donatur Tetap', 'Lainnya'], 
    keluar: ['Honor Guru', 'ATK', 'Al-Qur\'an', 'Buku Iqra\'', 'Snack Kegiatan', 'Listrik', 'Air', 'Kebersihan', 'Perbaikan Bangunan', 'Kegiatan Santri', 'Transportasi', 'Lainnya'] 
};

function getDynamicColor(categoryStr, type) {
    if (type === 'keluar') return '#ef4444';
    const inColors = { 'Wakaf': '#a855f7', 'Infak Santri': '#10b981', 'Donasi Masyarakat': '#3b82f6', 'Bantuan Pemerintah': '#f59e0b', 'Infak Jumat': '#10b981' };
    if (inColors[categoryStr]) return inColors[categoryStr];
    let hash = 0; for(let i = 0; i < categoryStr.length; i++) hash = categoryStr.charCodeAt(i) + ((hash << 5) - hash);
    return `hsl(${Math.abs(hash) % 360}, 70%, 55%)`; 
}

// ==========================================
// STORAGE ENGINE (ISOLATED)
// ==========================================
const SECRET_KEY = "TPA_Finance_Secure_K3y_99";
function getDBKey() { return APP_MODE === 'CLOUD' ? LS_PREFIX + 'cloud_db' : LS_PREFIX + 'guest_db'; }

function saveLocalDB(dataToSave) {
    const dbKey = getDBKey();
    try {
        if (typeof CryptoJS !== 'undefined') {
            const ciphertext = CryptoJS.AES.encrypt(JSON.stringify(dataToSave), SECRET_KEY).toString();
            localStorage.setItem(dbKey, ciphertext);
        } else {
            localStorage.setItem(dbKey + '_fallback', JSON.stringify(dataToSave));
        }
    } catch(e) { console.warn("Gagal simpan lokal:", e); }
}

function loadLocalDB() {
    const dbKey = getDBKey();
    let data = [];
    try {
        const ciphertext = localStorage.getItem(dbKey);
        if (ciphertext) {
            data = JSON.parse(CryptoJS.AES.decrypt(ciphertext, SECRET_KEY).toString(CryptoJS.enc.Utf8)); 
        } else {
            const fallback = localStorage.getItem(dbKey + '_fallback');
            if (fallback) data = JSON.parse(fallback);
        }
    } catch (e) { console.error("Database Lokal TPA Corrupt:", e); }
    return Array.isArray(data) ? data : [];
}

async function hashPIN(pin) {
    if (!pin) return '';
    try {
        if (window.crypto && window.crypto.subtle && window.isSecureContext) {
            const msgBuffer = new TextEncoder().encode(pin);
            const hashBuffer = await crypto.subtle.digest('SHA-256', msgBuffer);
            const hashArray = Array.from(new Uint8Array(hashBuffer));
            return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
        } else if (typeof CryptoJS !== 'undefined') {
            return CryptoJS.SHA256(pin).toString(CryptoJS.enc.Hex);
        } else { return btoa(pin); }
    } catch (error) { return btoa(pin); }
}

function saveProfileLocal() { setLS('profile_secure_v1', JSON.stringify(profile)); }

// ==========================================
// BOOT & SYNC ENGINE
// ==========================================
function bootApp() {
    renderShortcuts();
    db = loadLocalDB(); 
    initAppHeader();
    updateUI('');

    const netStatus = document.getElementById('networkStatus');
    if (APP_MODE === 'CLOUD') {
        currentUser = { id: 'offline_user', email: profile.googleEmail || 'Cloud User' }; 
        if(netStatus) { netStatus.innerText = navigator.onLine ? "Menyambungkan..." : "Offline Mode (Cloud)"; netStatus.className = navigator.onLine ? "status-sync sync-pending" : "status-sync sync-offline"; }
    } else {
        currentUser = null;
        if(netStatus) { netStatus.innerText = "Offline Mode (Guest)"; netStatus.className = "status-sync sync-offline"; }
    }
    setTimeout(initSupabaseBackground, 500);
}

function forceLogoutToGuest() {
    currentUser = null; APP_MODE = 'GUEST'; setLS('app_mode', 'GUEST');
    profile = { ...defaultProfile }; saveProfileLocal();
    removeLS('guest_db'); removeLS('guest_db_fallback'); db = []; 
    initAppHeader(); renderShortcuts(); updateUI(''); 
    showToast("Berhasil Logout. Kembali ke Guest.", "success");
    closeModal('profileViewModal');
    const netStatus = document.getElementById('networkStatus');
    if(netStatus) { netStatus.innerText = navigator.onLine ? "Online Mode (Guest)" : "Offline Mode (Guest)"; netStatus.className = navigator.onLine ? "status-sync sync-online" : "status-sync sync-offline"; }
}

async function initSupabaseBackground() {
    const netStatus = document.getElementById('networkStatus');
    if (typeof window.supabase === 'undefined') {
        if(netStatus) { netStatus.innerText = "Offline Mode (Lokal)"; netStatus.className = "status-sync sync-offline"; }
        return;
    }
    
    if (!sbClient) sbClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

    if (APP_MODE === 'CLOUD' && navigator.onLine) {
        try {
            const sessionPromise = sbClient.auth.getSession();
            const timeoutPromise = new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout')), 5000));
            
            const { data: { session }, error } = await Promise.race([sessionPromise, timeoutPromise]);
            if (error) throw error;

            if (session && session.user) {
                currentUser = session.user;
                if(netStatus) { netStatus.innerText = "Online Mode (Cloud)"; netStatus.className = "status-sync sync-online"; }
                fetchUserTransactions(); 
                setupRealtime();
                if (pendingSync.length > 0) processPendingSync();
            } else { forceLogoutToGuest(); }
        } catch(err) {
            if(netStatus) { netStatus.innerText = "Server Lambat (Mode Lokal)"; netStatus.className = "status-sync sync-offline"; }
        }
    }

    if (!window.supabaseListenerAdded) {
        window.supabaseListenerAdded = true;
        sbClient.auth.onAuthStateChange(async (event, currentSession) => {
            if (event === 'SIGNED_OUT') {
                forceLogoutToGuest();
            } else if (event === 'SIGNED_IN' && currentSession) {
                currentUser = currentSession.user; APP_MODE = 'CLOUD'; setLS('app_mode', 'CLOUD');
                if(netStatus) { netStatus.innerText = navigator.onLine ? "Online Mode (Cloud)" : "Offline Mode (Cloud)"; netStatus.className = navigator.onLine ? "status-sync sync-online" : "status-sync sync-offline"; }
                
                try {
                    const { data: profileData } = await sbClient.from('profiles').select('data').eq('id', currentUser.id).single();
                    if (profileData && profileData.data) { profile = { ...profile, ...profileData.data }; } 
                    else { if(profile.name === 'Pengurus') profile.name = properTitleCase(currentUser.user_metadata?.full_name) || 'Member'; profile.photo = currentUser.user_metadata?.avatar_url || profile.photo; await saveProfileToSupabase(); }
                } catch(e) { console.warn("Tarik profil dari Cloud gagal."); }
                
                profile.googleLinked = true; profile.googleEmail = currentUser.email; saveProfileLocal();
                db = loadLocalDB(); initAppHeader(); renderShortcuts(); fetchUserTransactions(); setupRealtime(); closeModal('googleAuthModal');
                if (navigator.onLine && pendingSync.length > 0) processPendingSync();
            }
        });
    }
    if (typeof window.emailjs !== 'undefined') { window.emailjs.init("vHhCqrnVXplmKz16K"); }
}

async function fetchUserTransactions() {
    if (APP_MODE !== 'CLOUD' || !currentUser || currentUser.id === 'offline_user' || !sbClient) return;
    try {
        if (!navigator.onLine) throw new Error("Offline mode aktif.");
        const fetchPromise = sbClient.from('transactions').select('*').eq('user_id', currentUser.id).order('date', { ascending: true });
        const timeoutPromise = new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout')), 8000));
        
        const { data, error } = await Promise.race([fetchPromise, timeoutPromise]);
        if (error) throw error;
        db = data; saveLocalDB(db); updateUI(document.getElementById('searchTxInput') ? document.getElementById('searchTxInput').value : ''); 
    } catch (error) {
        db = loadLocalDB(); updateUI(document.getElementById('searchTxInput') ? document.getElementById('searchTxInput').value : '');
    }
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
        const syncPromise = sbClient.from('transactions').insert(payload);
        const timeoutPromise = new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout Sync')), 8000));
        
        const { error } = await Promise.race([syncPromise, timeoutPromise]);
        if (error) throw error;
        pendingSync = []; setLS('pending_sync', JSON.stringify(pendingSync));
        showToast("Data offline tersimpan ke Cloud!", "success"); fetchUserTransactions();
    } catch (error) { console.warn("Gagal Auto-Sync", error); }
}

// ==========================================
// DETEKSI JARINGAN KETAT
// ==========================================
window.addEventListener('online', () => { 
    const netStatus = document.getElementById('networkStatus');
    if(netStatus) { netStatus.innerText = APP_MODE === 'CLOUD' ? "Menyambungkan Ulang..." : "Online Mode (Guest)"; netStatus.className = APP_MODE === 'CLOUD' ? "status-sync sync-pending" : "status-sync sync-online"; }
    if(APP_MODE === 'CLOUD') {
        if (currentUser && currentUser.id === 'offline_user') { initSupabaseBackground(); } 
        else { if (pendingSync.length > 0) { processPendingSync(); } else { fetchUserTransactions(); } if(netStatus) { netStatus.innerText = "Online Mode (Cloud)"; netStatus.className = "status-sync sync-online"; } }
    }
});

window.addEventListener('offline', () => { 
    const netStatus = document.getElementById('networkStatus');
    if(netStatus) { netStatus.innerText = pendingSync.length > 0 ? "Offline (Menunggu Sync)" : (APP_MODE === 'CLOUD' ? "Offline Mode (Cloud)" : "Offline Mode (Guest)"); netStatus.className = pendingSync.length > 0 ? "status-sync sync-pending" : "status-sync sync-offline"; }
    showToast("Koneksi terputus. Mode Offline.", "error"); updateUI(document.getElementById('searchTxInput') ? document.getElementById('searchTxInput').value : '');
});

// ==========================================
// UTILITY SAKTI
// ==========================================
function formatRp(num) { return new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', minimumFractionDigits: 0 }).format(num); }
function formatRpPendek(num) { let str = formatRp(num); return str.replace(/\.000$/, '...'); }
function formatDetailDate(iso) { if(!iso) return '-'; const d = new Date(iso); return `${String(d.getDate()).padStart(2,'0')}/${String(d.getMonth()+1).padStart(2,'0')}/${d.getFullYear()} - ${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`; }
function formatSmartName(name) { if (!name) return name; if (window.innerWidth > 400) return name; if (name.length > 12) { let words = name.trim().split(/\s+/); if (words.length > 1) { let lastWord = words.pop(); return words.join(' ') + ' ' + lastWord.charAt(0).toUpperCase() + '.'; } } return name; }
function properTitleCase(str) { if(!str) return ""; return str.toLowerCase().replace(/\b\w/g, char => char.toUpperCase()); }

function showToast(msg, type = 'success') { 
    const box = document.getElementById('toastBox'); if(!box) return; 
    const t = document.createElement('div'); t.className = `toast ${type}`; t.innerHTML = msg; box.appendChild(t); 
    setTimeout(() => t.classList.add('show'), 10); setTimeout(() => { t.classList.remove('show'); setTimeout(() => t.remove(), 400); }, 3500); 
}
function closeModal(id) { if(id) { const el = document.getElementById(id); if(el) el.classList.remove('active'); } document.querySelectorAll('.custom-options.open').forEach(e => e.classList.remove('open')); }

let confirmAction = null;
function openCustomConfirm(title, desc, action) { document.getElementById('confirmTitle').innerText = title; document.getElementById('confirmDesc').innerHTML = desc; confirmAction = action; document.getElementById('confirmModal').classList.add('active'); }
document.getElementById('btnConfirmYes').addEventListener('click', () => { if(confirmAction) confirmAction(); closeModal('confirmModal'); });

// ==========================================
// PROFIL, KEAMANAN PIN & GOOGLE AUTH
// ==========================================
function initAppHeader() { 
    document.getElementById('headName').innerText = formatSmartName(profile.name); 
    document.getElementById('headGender').innerText = profile.gender || 'Rahasia'; 
    document.getElementById('headProfileImg').src = profile.photo; 
}

async function saveProfileToSupabase() { 
    if (APP_MODE !== 'CLOUD' || !currentUser || currentUser.id === 'offline_user' || !navigator.onLine || !sbClient) return; 
    try { 
        const upsertPromise = sbClient.from('profiles').upsert({ id: currentUser.id, data: profile }); 
        const timeoutPromise = new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout Profile')), 5000));
        await Promise.race([upsertPromise, timeoutPromise]);
    } catch(e) {} 
}

document.getElementById('btnRealGoogleLogin').addEventListener('click', async () => { 
    if(typeof window.supabase === 'undefined' || !sbClient || !navigator.onLine) { showToast("Mode Offline. Tidak bisa Login.", "error"); return; }
    const { error } = await sbClient.auth.signInWithOAuth({ provider: 'google', options: { redirectTo: window.location.origin + window.location.pathname } }); 
    if (error) showToast("Gagal Login", "error"); 
});

let currentProfileTimeFilter = 0; 
function applyProfileTimeFilter(days, labelText) { currentProfileTimeFilter = days; document.getElementById('dispProfileTimeFilter').innerText = labelText; closeModal(''); renderProfileStats(); }

function renderProfileStats() {
    let inTunai = 0, outTunai = 0, inOps = 0, outOps = 0; 
    const today = new Date(); today.setHours(0,0,0,0);
    db.forEach(t => { 
        if(currentProfileTimeFilter !== 0) { const d = new Date(t.date); d.setHours(0,0,0,0); if(Math.floor(Math.abs(today - d) / 86400000) > currentProfileTimeFilter) return; }
        if (t.wallet === 'tunai' || t.wallet === 'rekening') { if (t.type === 'masuk') inTunai += t.amount; else outTunai += t.amount; } 
        else if (t.wallet === 'operasional' || t.wallet === 'wakaf') { if (t.type === 'masuk') inOps += t.amount; else outOps += t.amount; }
    }); 
    document.getElementById('viewTotalMasuk').innerText = formatRp(inTunai); document.getElementById('viewTotalKeluar').innerText = formatRp(outTunai); 
    document.getElementById('viewTotalMasukTabungan').innerText = formatRp(inOps); document.getElementById('viewTotalKeluarTabungan').innerText = formatRp(outOps);
}

function openProfileView() { 
    currentProfileTimeFilter = 0; document.getElementById('dispProfileTimeFilter').innerText = 'Semua Waktu'; renderProfileStats();
    document.getElementById('viewProfileImg').src = profile.photo; document.getElementById('viewProfileName').innerText = profile.name; document.getElementById('viewJoinDate').innerText = "Bergabung: " + formatDetailDate(profile.joinDate); document.getElementById('viewGender').innerText = profile.gender || '-'; document.getElementById('viewBirth').innerText = profile.birthDate || '-'; 
    const stat = document.getElementById('viewGoogleStatus'); const btnText = document.getElementById('textGoogleLink'); const btn = document.getElementById('btnGoogleLink'); 
    
    if(APP_MODE === 'CLOUD') { 
        stat.innerHTML = `<span style="color:var(--hijau); font-weight:700;">${profile.googleEmail || (currentUser ? currentUser.email : 'Cloud User')}</span>`; 
        btnText.innerText = "Logout"; btn.style.borderColor = "var(--merah)"; btn.style.color = "var(--merah)"; 
        btn.onclick = () => { openCustomConfirm("Logout Akun", "Logout ke mode Guest? Data Cloud tetap aman di server.", async () => { if(sbClient && navigator.onLine) { await sbClient.auth.signOut(); } else { forceLogoutToGuest(); } }); };
    } else { 
        stat.innerText = "Tidak Terhubung"; stat.style.color = "var(--text-muted)"; btnText.innerText = "Hubungkan"; btn.style.borderColor = "#4285F4"; btn.style.color = "#4285F4"; btn.onclick = openGoogleAuthModal; 
    } 
    document.getElementById('profileViewModal').classList.add('active'); 
}

function openGoogleAuthModal() { document.getElementById('googleAuthModal').classList.add('active'); }
function requestProfileEdit() { if(profile.pin && profile.pin !== '') { closeModal('profileViewModal'); document.getElementById('inputAuthPin').value = ''; document.getElementById('pinAuthModal').classList.add('active'); } else { openProfileEdit(); } }
function initResetSequence() { if (!profile.pin || profile.pin.trim() === '') { showToast("Buat PIN di Edit Profil.", "error"); return; } closeModal('profileViewModal'); document.getElementById('inputResetPin').value = ''; document.getElementById('resetPinModal').classList.add('active'); }

async function verifyPinAuth(actionType) { 
    const inputVal = document.getElementById(actionType === 'edit' ? 'inputAuthPin' : 'inputResetPin').value; const hashedInput = await hashPIN(inputVal); 
    if (hashedInput === profile.pin) { if (actionType === 'edit') { closeModal('pinAuthModal'); openProfileEdit(); } else if (actionType === 'reset') { closeModal('resetPinModal'); document.getElementById('resetConfirmModal').classList.add('active'); } } else { showToast("PIN Salah!", "error"); } 
}

function openProfileEdit() { document.getElementById('editProfileImg').src = profile.photo; document.getElementById('editName').value = profile.name !== 'Pengurus' ? profile.name : ''; selectGender(profile.gender); document.getElementById('editBirth').value = profile.birthDate; document.getElementById('editPin').value = ''; document.getElementById('profileEditModal').classList.add('active'); }
function selectGender(val) { document.getElementById('editGender').value = val; document.getElementById('dispGenderVal').innerText = val; closeModal(''); }

document.getElementById('profileUploader').addEventListener('change', async function(e) { 
    const f = e.target.files[0]; if(!f) return; showToast("Memproses foto...", "syncing"); const reader = new FileReader(); 
    reader.onload = function(evt) { const img = new Image(); img.onload = async function() { 
        const canvas = document.createElement('canvas'); const MAX_WIDTH = 400; const MAX_HEIGHT = 400; let width = img.width; let height = img.height; 
        if (width > height) { if (width > MAX_WIDTH) { height *= MAX_WIDTH / width; width = MAX_WIDTH; } } else { if (height > MAX_HEIGHT) { width *= MAX_HEIGHT / height; height = MAX_HEIGHT; } } 
        canvas.width = width; canvas.height = height; const ctx = canvas.getContext('2d'); ctx.drawImage(img, 0, 0, width, height); 
        profile.photo = canvas.toDataURL('image/jpeg', 0.6); document.getElementById('editProfileImg').src = profile.photo; saveProfileLocal(); showToast("Foto tersimpan di LOKAL.", "success");
    }; img.src = evt.target.result; }; reader.readAsDataURL(f); 
});

async function saveProfileData() { profile.name = properTitleCase(document.getElementById('editName').value.trim()) || 'Pengurus'; profile.gender = document.getElementById('editGender').value; profile.birthDate = document.getElementById('editBirth').value; const rawPin = document.getElementById('editPin').value; if (rawPin && rawPin.trim() !== '') { profile.pin = await hashPIN(rawPin); } saveProfileLocal(); initAppHeader(); closeModal('profileEditModal'); showToast("Profil Disimpan"); saveProfileToSupabase(); }

async function executeFactoryReset() { 
    showToast("Memulai format...", "syncing"); db = []; removeLS('cloud_db'); removeLS('cloud_db_fallback'); removeLS('guest_db'); removeLS('guest_db_fallback');
    try { if (APP_MODE === 'CLOUD' && currentUser && currentUser.id !== 'offline_user' && navigator.onLine && sbClient) { const delPromise = sbClient.from('transactions').delete().eq('user_id', currentUser.id); const timeout = new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout')), 5000)); const { error } = await Promise.race([delPromise, timeout]); if (error) throw error; } showToast("Database musnah.", "success"); } catch (e) { showToast("Direset Lokal Saja.", "error"); } 
    closeModal('resetConfirmModal'); updateUI(document.getElementById('searchTxInput') ? document.getElementById('searchTxInput').value : ''); 
}

// ==========================================
// KONTROL UI TPA
// ==========================================
function switchWallet(type) { activeWallet = type; document.getElementById('walletSwitchContainer').setAttribute('data-active', type); document.querySelectorAll('.btn-tab').forEach(b => b.classList.remove('active')); document.getElementById(`tab-${type}`).classList.add('active'); renderShortcuts(); updateUI(document.getElementById('searchTxInput') ? document.getElementById('searchTxInput').value : ''); }
function toggleCustomSelect(id) { const box = document.getElementById(id); const isOpen = box.classList.contains('open'); document.querySelectorAll('.custom-options.open').forEach(el => el.classList.remove('open')); if(!isOpen) box.classList.add('open'); }
function applyTimeFilter(days, labelText) { currentTimeFilter = days; document.getElementById('dispTimeFilter').innerText = labelText; closeModal(''); updateUI(document.getElementById('searchTxInput') ? document.getElementById('searchTxInput').value : ''); }
function selectCategory(val) { document.getElementById('tx-category').value = val; document.getElementById('dispTxCat').innerText = val; closeModal(''); }
function toggleSection(sec, icn) { document.getElementById(sec).classList.toggle('hidden'); document.getElementById(icn).classList.toggle('rotated'); }
function toggleExpandStat(el, id) { const items = document.getElementById(id).children; if (el.classList.contains('expanded')) { for(let i of items) i.className = 'expand-item'; } else { for(let i of items) i.className = (i === el) ? 'expand-item expanded' : 'expand-item collapsed'; } } 
function expandChart(el, id) { if(!el.classList.contains('expanded')) { for(let i of document.getElementById(id).children) i.className = (i === el) ? 'expand-item expanded' : 'expand-item collapsed'; setTimeout(() => { if(typeof Chart !== 'undefined' && pieChart) pieChart.resize(); if(typeof Chart !== 'undefined' && barChart) barChart.resize(); if(typeof Chart !== 'undefined' && lineChart) lineChart.resize(); }, 100); setTimeout(() => { if(typeof Chart !== 'undefined' && pieChart) pieChart.resize(); if(typeof Chart !== 'undefined' && barChart) barChart.resize(); if(typeof Chart !== 'undefined' && lineChart) lineChart.resize(); }, 550); } } 
function closeChart(e, btn) { e.stopPropagation(); for(let i of btn.closest('.expand-container').children) i.className = 'expand-item'; setTimeout(() => { if(typeof Chart !== 'undefined' && pieChart) pieChart.resize(); if(typeof Chart !== 'undefined' && barChart) barChart.resize(); if(typeof Chart !== 'undefined' && lineChart) lineChart.resize(); }, 100); setTimeout(() => { if(typeof Chart !== 'undefined' && pieChart) pieChart.resize(); if(typeof Chart !== 'undefined' && barChart) barChart.resize(); if(typeof Chart !== 'undefined' && lineChart) lineChart.resize(); }, 550); }

function renderShortcuts() { 
    const c = document.getElementById('quickActionsContainer'); c.className = 'quick-actions-wrap grid-mode grid-split-4'; 
    if(activeWallet === 'tunai' || activeWallet === 'rekening') {
        c.innerHTML = ` 
            <button class="btn-quick glow-hijau" onclick="quickInput('masuk', 'Infak Santri', 'Penerimaan Infak Santri')">${svgs.uang} <span>Infak Santri</span></button> 
            <button class="btn-quick glow-biru" onclick="quickInput('masuk', 'Donasi Masyarakat', 'Donasi Umum')">${svgs.user} <span>Donasi Umum</span></button> 
            <button class="btn-quick glow-merah" onclick="quickInput('keluar', 'Honor Guru', 'Pembayaran Honor Guru')">${svgs.makan} <span>Honor Guru</span></button> 
            <button class="btn-quick glow-kuning" onclick="quickInput('keluar', 'ATK', 'Beli ATK TPA')">${svgs.book} <span>Beli ATK</span></button> 
            <button class="btn-quick glow-kuning" onclick="quickInput('keluar', 'MANUAL', '')">${svgs.minus_bold} <span>Lainnya (-)</span></button> 
            <button class="btn-quick glow-hijau" onclick="quickInput('masuk', 'MANUAL', '')">${svgs.plus_bold} <span>Lainnya (+)</span></button> 
        `;
    } else if(activeWallet === 'wakaf') {
        c.innerHTML = `
            <button class="btn-quick glow-hijau" onclick="quickInput('masuk', 'Wakaf', 'Penerimaan Dana Wakaf')">${svgs.uang} <span>Terima Wakaf</span></button> 
            <button class="btn-quick glow-merah" onclick="quickInput('keluar', 'Perbaikan Bangunan', 'Penggunaan Dana Wakaf')">${svgs.plus_bold} <span>Gunakan Wakaf</span></button>
        `;
    } else if(activeWallet === 'operasional') {
        c.innerHTML = `
            <button class="btn-quick glow-kuning" onclick="quickInput('keluar', 'Listrik', 'Bayar Tagihan Listrik')">${svgs.minus_bold} <span>Bayar Listrik</span></button>
            <button class="btn-quick glow-kuning" onclick="quickInput('keluar', 'Air', 'Bayar Tagihan Air')">${svgs.minus_bold} <span>Bayar Air</span></button>
            <button class="btn-quick glow-hijau" onclick="quickInput('masuk', 'Hibah', 'Suntikan Dana Operasional')">${svgs.plus_bold} <span>Tambah Dana</span></button>
        `;
    }
}

// ==========================================
// INPUT TRANSAKSI (TPA)
// ==========================================
function quickInput(type, cat, desc) { 
    document.getElementById('tx-type').value = type; 
    document.getElementById('modal-title').innerText = type === 'masuk' ? 'Catat Pemasukan TPA' : 'Catat Pengeluaran TPA'; 
    document.getElementById('tx-desc').value = desc; 
    document.getElementById('tx-pihak-terkait').value = ''; 
    document.getElementById('tx-link-bukti').value = '';
    document.getElementById('tx-category-manual').value = '';
    document.getElementById('tx-is-saving').value = 'false'; 
    
    if(cat === 'MANUAL') { 
        document.getElementById('catSelectWrapper').style.display = 'none'; document.getElementById('tx-category-manual').style.display = 'block'; document.getElementById('label-kategori').innerText = 'Ketik Nama Kategori'; 
    } else { 
        document.getElementById('catSelectWrapper').style.display = 'block'; document.getElementById('tx-category-manual').style.display = 'none'; document.getElementById('label-kategori').innerText = 'Kategori'; 
        const box = document.getElementById('catOptionsBox'); const arr = type === 'masuk' ? categories.masuk : categories.keluar; 
        box.innerHTML = arr.map(c => `<div class="custom-option" onclick="selectCategory('${c}')">${c}</div>`).join(''); 
        if(!arr.includes(cat)) box.innerHTML += `<div class="custom-option" onclick="selectCategory('${cat}')">${cat}</div>`; 
        selectCategory(cat); 
    } 
    
    document.getElementById('tx-amount').value = ''; rawAmount = 0; document.getElementById('txModal').classList.add('active'); 
    setTimeout(() => { if(cat === 'MANUAL') document.getElementById('tx-category-manual').focus(); else document.getElementById('tx-amount').focus(); }, 300); 
}

document.getElementById('tx-amount').addEventListener('input', function() { let v = this.value.replace(/[^0-9]/g, ''); if(v === '') { rawAmount = 0; this.value = ''; return; } rawAmount = parseInt(v, 10); this.value = rawAmount.toLocaleString('id-ID'); });
let editRawAmount = 0; document.getElementById('edit-tx-amount').addEventListener('input', function() { let v = this.value.replace(/[^0-9]/g, ''); if(v === '') { editRawAmount = 0; this.value = ''; return; } editRawAmount = parseInt(v, 10); this.value = editRawAmount.toLocaleString('id-ID'); });

document.getElementById('btnExecuteTx').addEventListener('click', async () => { 
    if(rawAmount <= 0) { showToast("Nominal 0", "error"); return; } 
    if (document.getElementById('tx-is-saving').value === 'true') return; document.getElementById('tx-is-saving').value = 'true'; 
    
    try {
        const type = document.getElementById('tx-type').value; 
        let cF = document.getElementById('tx-category-manual').style.display === 'block' ? document.getElementById('tx-category-manual').value.trim() : document.getElementById('tx-category').value; 
        let dF = document.getElementById('tx-desc').value.trim(); 
        const pihak = document.getElementById('tx-pihak-terkait').value.trim();
        const link = document.getElementById('tx-link-bukti').value.trim();
        
        if(!cF || !dF) { showToast("Kategori & Deskripsi wajib diisi", "error"); return; } 
        cF = properTitleCase(cF); dF = properTitleCase(dF);
        
        let tx = { wallet: activeWallet, type: type, category: cF, desc: dF, pihak_terkait: properTitleCase(pihak), link_bukti: link, amount: rawAmount, status: 'normal', date: new Date().toISOString() };
        
        if(APP_MODE === 'CLOUD' && navigator.onLine && sbClient && (!currentUser || currentUser.id !== 'offline_user')) { 
            try { 
                let data = { ...tx, user_id: currentUser.id };
                const insertPromise = sbClient.from('transactions').insert([data]); 
                const timeoutPromise = new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout Server')), 5000));
                const { error } = await Promise.race([insertPromise, timeoutPromise]);
                if(error) throw error;
                await fetchUserTransactions(); closeModal('txModal'); showToast("Tersimpan di Cloud"); 
            } catch(e) { 
                tx.id = Date.now() + Math.random(); db.push(tx); pendingSync.push(tx); setLS('pending_sync', JSON.stringify(pendingSync)); saveLocalDB(db); closeModal('txModal'); updateUI(document.getElementById('searchTxInput') ? document.getElementById('searchTxInput').value : '');
                showToast("Jaringan lambat. Masuk Antrean Offline.", "syncing"); 
            }
        } else { 
            tx.id = Date.now() + Math.floor(Math.random() * 1000); db.push(tx); 
            if (APP_MODE === 'CLOUD') { pendingSync.push(tx); setLS('pending_sync', JSON.stringify(pendingSync)); }
            saveLocalDB(db); closeModal('txModal'); updateUI(document.getElementById('searchTxInput') ? document.getElementById('searchTxInput').value : ''); 
            showToast("Disimpan di Lokal"); 
        }
    } finally { document.getElementById('tx-is-saving').value = 'false'; }
});

// ==========================================
// RENDER UI & AI INSIGHT
// ==========================================
function updateHealthEngine(filteredDb) { 
    let tIn = 0, tOut = 0; filteredDb.forEach(t => { if(t.type === 'masuk') tIn += t.amount; else tOut += t.amount; }); 
    let balance = tIn - tOut; const badge = document.getElementById('healthBadge'); const text = document.getElementById('healthText'); badge.className = 'health-badge'; 
    if (tIn === 0 && tOut === 0) { badge.classList.add('health-netral'); text.innerText = 'Netral'; } else if (balance < 0) { badge.classList.add('health-defisit'); text.innerText = 'Defisit'; } else if (balance >= 0 && balance <= 50000) { badge.classList.add('health-kritis'); text.innerText = 'Kritis'; } else { if (tOut > (tIn * 0.8)) { badge.classList.add('health-waspada'); text.innerText = 'Waspada'; } else { badge.classList.add('health-sehat'); text.innerText = 'Sehat'; } } 
    generateAIForecast(filteredDb); 
}

function generateAIForecast(data) { 
    const box = document.getElementById('aiInsightBox'); const textEl = document.getElementById('aiInsightText'); aiMessages = []; 
    if (data.length === 0) { 
        aiMessages.push(`Belum ada riwayat transaksi di dompet ${activeWallet.toUpperCase()}.`);
        if(APP_MODE === 'GUEST') aiMessages.push("Info: Hubungkan dengan Akun Google agar data TPA aman tersinkronisasi ke Cloud.");
        box.style.borderLeftColor = 'var(--biru)'; box.querySelector('svg').style.color = 'var(--biru)'; startAICarousel(textEl); return; 
    } 
    
    const today = new Date(); const currentMonthData = data.filter(t => { const d = new Date(t.date); return d.getMonth() === today.getMonth() && d.getFullYear() === today.getFullYear(); }); 
    const masukData = currentMonthData.filter(t => t.type === 'masuk'); const keluarData = currentMonthData.filter(t => t.type === 'keluar'); 
    let mIn = masukData.reduce((sum, t) => sum + t.amount, 0); let mOut = keluarData.reduce((sum, t) => sum + t.amount, 0); 
    
    let biggestExpenseMsg = "Belum ada pengeluaran bulan ini.";
    if (keluarData.length > 0) { let catTotals = {}; keluarData.forEach(t => { catTotals[t.category] = (catTotals[t.category] || 0) + t.amount; }); let biggestCat = Object.keys(catTotals).reduce((a, b) => catTotals[a] > catTotals[b] ? a : b); biggestExpenseMsg = `Pengeluaran operasional terbesar bulan ini: ${properTitleCase(biggestCat)} (${formatRp(catTotals[biggestCat])}).`; }
    
    let statusMsg = "", projectionMsg = "";
    if (mOut > mIn && mIn > 0) { statusMsg = `⚠️ Peringatan: Pengeluaran dompet ${activeWallet} telah melampaui pemasukan.`; projectionMsg = "Saran AI: Tinjau ulang anggaran operasional TPA untuk menghindari defisit."; box.style.borderLeftColor = 'var(--merah)'; box.querySelector('svg').style.color = 'var(--merah)'; } 
    else if (mOut > 0) { statusMsg = `Arus kas dompet ${activeWallet} berjalan normal.`; projectionMsg = "Tetap pantau alokasi dana agar sejalan dengan program kegiatan santri."; box.style.borderLeftColor = 'var(--kuning)'; box.querySelector('svg').style.color = 'var(--kuning)'; } 
    else if (mIn > 0 && mOut === 0) { statusMsg = "Luar biasa! Seluruh dana pemasukan bulan ini masih utuh."; projectionMsg = "Tips: Dana bisa dialokasikan untuk perbaikan fasilitas atau acara santri mendatang."; box.style.borderLeftColor = 'var(--hijau)'; box.querySelector('svg').style.color = 'var(--hijau)'; } 
    else { statusMsg = "Belum ada pergerakan kas bulan ini."; projectionMsg = "Selalu rutin mencatat donasi/infak yang masuk."; box.style.borderLeftColor = 'var(--biru)'; box.querySelector('svg').style.color = 'var(--biru)';}
    
    aiMessages.push(statusMsg); aiMessages.push(projectionMsg); aiMessages.push(biggestExpenseMsg);
    if(activeWallet === 'wakaf') aiMessages.push("Catatan: Pastikan dana Wakaf tidak disalahgunakan untuk operasional harian tanpa syariat yang jelas.");
    aiMessages = [...new Set(aiMessages)].filter(m => m !== ""); startAICarousel(textEl); 
}

function startAICarousel(textEl) { 
    if (aiCarouselInterval) clearInterval(aiCarouselInterval); aiCurrentMsgIdx = 0; textEl.style.minHeight = ''; textEl.style.display = ''; textEl.style.alignItems = ''; textEl.innerText = aiMessages[0]; textEl.classList.remove('fade-out'); 
    if (aiMessages.length > 1) { aiCarouselInterval = setInterval(() => { textEl.classList.add('fade-out'); setTimeout(() => { aiCurrentMsgIdx = (aiCurrentMsgIdx + 1) % aiMessages.length; textEl.innerText = aiMessages[aiCurrentMsgIdx]; textEl.classList.remove('fade-out'); }, 400); }, 10000); } 
}

function updateUI(searchTerm = '') {
    const today = new Date(); today.setHours(0,0,0,0);
    const fd = db.filter(tx => { 
        if(tx.wallet !== activeWallet) return false; 
        if(currentTimeFilter !== 0) { const d = new Date(tx.date); d.setHours(0,0,0,0); if(Math.floor(Math.abs(today - d) / 86400000) > currentTimeFilter) return false; } 
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
    if(data.length === 0) { t.innerHTML = `<tr><td colspan="5" style="text-align:center; padding: 30px; color:var(--text-muted);">Tidak ada transaksi pada dompet ini.</td></tr>`; isInitialTableRender = false; return; }
    
    let htmlStr = '';
    const animClass = isInitialTableRender ? 'row-anim' : ''; 
    [...data].sort((a,b) => new Date(b.date) - new Date(a.date)).forEach(tx => {
        const iM = tx.type === 'masuk'; let c = getDynamicColor(tx.category, tx.type);
        let linkHtml = tx.link_bukti ? `<a href="${tx.link_bukti}" target="_blank" style="color:var(--biru); font-size:11px; text-decoration:underline; display:block; margin-top:2px;">&#128279; Bukti Drive</a>` : '';
        let pihakHtml = tx.pihak_terkait ? `<br><span style="font-size:11px; color:var(--text-muted);">Pihak: <b style="color:var(--kuning);">${tx.pihak_terkait}</b></span>` : '';
        
        let cr = `<div class="badge-wrapper"><div class="badge-cat" style="border: 1px solid ${c}; color:${c}; background:rgba(0,0,0,0.5);">${tx.category}</div></div>`;
        htmlStr += `<tr class="clickable-row ${animClass}" onclick="openReceipt('${tx.id || tx.date}')">
            <td style="color:var(--text-muted); font-size:11px; vertical-align:middle;">${formatDetailDate(tx.date).split(' - ')[0]}<br>${formatDetailDate(tx.date).split(' - ')[1]}</td>
            <td class="col-category">${cr}</td>
            <td style="vertical-align:middle; width:100%;"><span style="font-weight:700;">${tx.desc}</span>${pihakHtml}${linkHtml}</td>
            <td style="vertical-align:middle; text-align:center; padding-right:15px; width:1%;">
                <div style="display:flex; gap:6px; justify-content:center; align-items:center;">
                    <button type="button" style="background:rgba(245,158,11,0.15); color:var(--kuning); border:1px solid var(--kuning); width:32px; height:32px; border-radius:8px; cursor:pointer; display:flex; align-items:center; justify-content:center; padding:0;" onclick="promptActionPinFromTable(event, 'edit', '${tx.id || tx.date}')">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/></svg>
                    </button>
                    <button type="button" style="background:rgba(239,68,68,0.15); color:var(--merah); border:1px solid var(--merah); width:32px; height:32px; border-radius:8px; cursor:pointer; display:flex; align-items:center; justify-content:center; padding:0;" onclick="promptActionPinFromTable(event, 'delete', '${tx.id || tx.date}')">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2-2v2"/></svg>
                    </button>
                </div>
            </td>
            <td class="amt-cell" style="vertical-align:middle; text-align:right; color:${iM?'var(--hijau)':'var(--merah)'}; white-space:nowrap; padding-left:0;">${iM?'+':'-'}${formatRp(tx.amount)}</td>
        </tr>`;
    });
    t.innerHTML = htmlStr; isInitialTableRender = false; 
}

function renderCharts(data) {
    if (typeof Chart === 'undefined') return;
    if (!document.getElementById('pieChart')) return; 
    Chart.defaults.color = '#64748b'; Chart.defaults.font.family = 'Inter';
    if(data.length === 0) { if(pieChart) pieChart.destroy(); if(barChart) barChart.destroy(); if(lineChart) lineChart.destroy(); return; }

    const gridLineColor = '#13271c';
    const cA = {}; data.forEach(t => { const k = `${t.category}`; if(cA[k]) cA[k].a += t.amount; else cA[k] = { a: t.amount, color: getDynamicColor(t.category, t.type) }; }); 
    const pL = Object.keys(cA);
    
    if(pieChart) pieChart.destroy(); 
    pieChart = new Chart(document.getElementById('pieChart'), { type: 'doughnut', data: { labels: pL, datasets: [{ data: pL.map(l => cA[l].a), backgroundColor: pL.map(l => cA[l].color), borderWidth: 4, borderColor: '#0a1711' }] }, options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false }, tooltip: { callbacks: { label: function(c) { return ' ' + formatRp(c.raw); } } } } } });

    const rT = [...data].sort((a,b) => new Date(a.date) - new Date(b.date)).slice(-15);
    if(barChart) barChart.destroy(); 
    barChart = new Chart(document.getElementById('barChart'), { type: 'bar', data: { labels: rT.map(t => t.desc.substring(0,8)), datasets: [{ data: rT.map(t => t.type === 'masuk' ? t.amount : -t.amount), backgroundColor: rT.map(t => getDynamicColor(t.category, t.type)), borderRadius: 4 }] }, options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false }, tooltip: { callbacks: { label: function(c) { return ' ' + formatRp(Math.abs(c.raw)); } } } }, scales: { x: { display: false }, y: { grid: { color: gridLineColor } } } } });

    let cI = 0, cO = 0, hI = [], hO = []; 
    [...data].sort((a,b)=> new Date(a.date)-new Date(b.date)).forEach(t => { if(t.type === 'masuk') cI += t.amount; else cO += t.amount; hI.push(cI); hO.push(cO); });
    if(lineChart) lineChart.destroy(); 
    lineChart = new Chart(document.getElementById('lineChart'), { type: 'line', data: { labels: hI.map((_,i)=> `T${i+1}`), datasets: [{ label: 'Pemasukan Total', data: hI, borderColor: '#10b981', backgroundColor: 'rgba(16, 185, 129, 0.1)', fill: true, pointRadius: 3, tension: 0.3 }, { label: 'Pengeluaran Total', data: hO, borderColor: '#ef4444', backgroundColor: 'rgba(239, 68, 68, 0.1)', fill: true, pointRadius: 3, tension: 0.3 }] }, options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false }, tooltip: { callbacks: { label: function(c) { return ' ' + formatRp(c.raw); } } } }, scales: { x: { display: false }, y: { grid: { color: gridLineColor } } } } });
}

function openReceipt(txId) { 
    const strTxId = String(txId); const tx = db.find(t => String(t.id) === strTxId || String(t.date) === strTxId); if(!tx) return; 
    const rDate = formatDetailDate(tx.date); const rId = "TRX-" + new Date(tx.date).getTime().toString().slice(-8); 
    const rType = tx.type === 'masuk' ? 'Pemasukan' : 'Pengeluaran'; const rColor = tx.type === 'masuk' ? 'var(--hijau)' : 'var(--merah)'; 
    document.getElementById('receiptContent').innerHTML = ` 
        <div class="receipt-head"><h3 style="margin:0 0 5px 0; color:var(--putih);">BUKTI MUTASI KAS TPA</h3><span style="font-size:11px; color:var(--text-muted); letter-spacing: 1px;">ID: ${rId}</span></div> 
        <div class="receipt-row"><span class="receipt-label">Waktu</span><span class="receipt-val">${rDate}</span></div> 
        <div class="receipt-row"><span class="receipt-label">Dompet Kas</span><span class="receipt-val" style="text-transform:capitalize;">${tx.wallet}</span></div> 
        <div class="receipt-row"><span class="receipt-label">Kategori</span><span class="receipt-val">${tx.category}</span></div> 
        <div class="receipt-row"><span class="receipt-label">Sifat</span><span class="receipt-val" style="color:${rColor};">${rType}</span></div> 
        <div class="receipt-row"><span class="receipt-label">Keterangan</span><span class="receipt-val">${tx.desc}</span></div> 
        ${tx.pihak_terkait ? `<div class="receipt-row"><span class="receipt-label" style="color:var(--kuning);">Pihak Terkait</span><span class="receipt-val" style="color:var(--kuning);">${tx.pihak_terkait}</span></div>` : ''} 
        ${tx.link_bukti ? `<div class="receipt-row" style="margin-top:10px;"><span class="receipt-label" style="color:var(--biru);">Lampiran Drive</span><span class="receipt-val"><a href="${tx.link_bukti}" target="_blank">Buka Dokumen ↗</a></span></div>` : ''} 
        <div class="receipt-row" style="margin-top:25px; border-top:2px dashed var(--border); padding-top:20px; align-items: flex-end; flex-wrap: nowrap !important;"> 
            <span class="receipt-label" style="font-size:14px; color:var(--putih); flex-shrink: 0;">TOTAL</span> 
            <span class="receipt-val" style="font-size: clamp(16px, 5.5vw, 22px); color:${rColor}; letter-spacing:-1px; white-space: nowrap !important; word-break: keep-all !important; flex-grow: 1; text-align: right;">${formatRp(tx.amount)}</span> 
        </div> 
    `; 
    document.getElementById('receiptModal').classList.add('active'); 
}

// ==========================================
// EXPORT & EDIT/DELETE LOGIC
// ==========================================
function openCSVModal() { if(db.length === 0) { showToast("Data kosong.", "error"); return; } document.getElementById('csvExportModal').classList.add('active'); }
function executeCSVExport() { 
    closeModal('csvExportModal'); let csv = "Tanggal,Dompet,Tipe,Kategori,Keterangan,Pihak_Terkait,Link_Drive,Nominal\n"; 
    const today = new Date(); today.setHours(0,0,0,0);
    const filteredData = db.filter(tx => { if(tx.wallet !== activeWallet) return false; if(currentTimeFilter !== 0) { const d = new Date(tx.date); d.setHours(0,0,0,0); if(Math.floor(Math.abs(today - d) / 86400000) > currentTimeFilter) return false; } return true; });
    if(filteredData.length === 0) { showToast("Data filter kosong.", "error"); return; }
    [...filteredData].sort((a,b) => new Date(a.date) - new Date(b.date)).forEach(row => { let r = [formatDetailDate(row.date), row.wallet, row.type, row.category, row.desc, row.pihak_terkait||'-', row.link_bukti||'-', row.amount]; csv += r.map(v => `"${v}"`).join(",") + "\n"; }); 
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' }); const link = document.createElement("a"); link.href = URL.createObjectURL(blob); link.download = `Laporan_TPA_${activeWallet.toUpperCase()}_${new Date().toISOString().split('T')[0]}.csv`; 
    document.body.appendChild(link); link.click(); document.body.removeChild(link); showToast("CSV Berhasil Diunduh", "success"); 
}

function promptActionPin(action, txId) {
    closeModal('receiptModal');
    if (!profile.pin || profile.pin.trim() === '') { if (action === 'edit') openEditTxModal(txId); else executeTxDeleteFinal(txId); return; }
    document.getElementById('actionPinType').value = action; document.getElementById('actionPinTxId').value = txId; document.getElementById('inputActionPin').value = ''; document.getElementById('actionPinModal').classList.add('active'); setTimeout(() => document.getElementById('inputActionPin').focus(), 300);
}
function promptActionPinFromTable(e, action, txId) { e.stopPropagation(); promptActionPin(action, txId); }

async function verifyActionPinFinal() {
    const inputVal = document.getElementById('inputActionPin').value; const hashedInput = await hashPIN(inputVal);
    if (hashedInput === profile.pin) { closeModal('actionPinModal'); const action = document.getElementById('actionPinType').value; const txId = document.getElementById('actionPinTxId').value; if (action === 'edit') openEditTxModal(txId); else if (action === 'delete') executeTxDeleteFinal(txId); } else { showToast("PIN Salah! Akses Ditolak.", "error"); }
}

function openEditTxModal(txId) {
    const tx = db.find(t => String(t.id) === txId || String(t.date) === txId); if(!tx) return;
    document.getElementById('edit-tx-id').value = txId; document.getElementById('edit-tx-category').value = tx.category; document.getElementById('edit-tx-desc').value = tx.desc;
    document.getElementById('edit-tx-pihak-terkait').value = tx.pihak_terkait || '';
    document.getElementById('edit-tx-link-bukti').value = tx.link_bukti || '';
    editRawAmount = tx.amount; document.getElementById('edit-tx-amount').value = editRawAmount.toLocaleString('id-ID'); document.getElementById('editTxModal').classList.add('active');
}

async function saveEditedTx() {
    const txId = document.getElementById('edit-tx-id').value; const idx = db.findIndex(t => String(t.id) === txId || String(t.date) === txId); if (idx === -1) return;
    const nCat = properTitleCase(document.getElementById('edit-tx-category').value.trim()); const nDesc = properTitleCase(document.getElementById('edit-tx-desc').value.trim());
    const nPihak = properTitleCase(document.getElementById('edit-tx-pihak-terkait').value.trim()); const nLink = document.getElementById('edit-tx-link-bukti').value.trim();
    if(!nCat || !nDesc || editRawAmount <= 0) { showToast("Gagal: Data manipulasi tidak lengkap.", "error"); return; }

    db[idx].category = nCat; db[idx].desc = nDesc; db[idx].pihak_terkait = nPihak; db[idx].link_bukti = nLink; db[idx].amount = editRawAmount;
    if (APP_MODE === 'CLOUD' && currentUser && currentUser.id !== 'offline_user' && navigator.onLine && sbClient && db[idx].id) {
        try { await sbClient.from('transactions').update({ category: nCat, "desc": nDesc, pihak_terkait: nPihak, link_bukti: nLink, amount: editRawAmount }).eq('id', db[idx].id); } 
        catch(e) { let syncIdx = pendingSync.findIndex(t => String(t.id) === txId || String(t.date) === txId); if(syncIdx > -1) pendingSync[syncIdx] = db[idx]; else pendingSync.push(db[idx]); setLS('pending_sync', JSON.stringify(pendingSync)); }
    } else { let syncIdx = pendingSync.findIndex(t => String(t.id) === txId || String(t.date) === txId); if(syncIdx > -1) { pendingSync[syncIdx] = db[idx]; setLS('pending_sync', JSON.stringify(pendingSync)); } }
    saveLocalDB(db); closeModal('editTxModal'); updateUI(document.getElementById('searchTxInput') ? document.getElementById('searchTxInput').value : ''); showToast("Transaksi Berhasil Diperbarui.", "success");
}

function executeTxDeleteFinal(txId) {
    openCustomConfirm("Konfirmasi Hapus Mutlak", "Tindakan ini tidak dapat dibatalkan. Riwayat akan dihapus secara permanen dari server dan lokal. Lanjutkan?", async () => {
        const idx = db.findIndex(t => String(t.id) === txId || String(t.date) === txId); if (idx === -1) return; const delTx = db[idx]; db.splice(idx, 1);
        if (APP_MODE === 'CLOUD' && currentUser && currentUser.id !== 'offline_user' && navigator.onLine && sbClient && delTx.id) {
            try { await sbClient.from('transactions').delete().eq('id', delTx.id); } catch(e) {}
        } else { pendingSync = pendingSync.filter(t => String(t.id) !== txId && String(t.date) !== txId); setLS('pending_sync', JSON.stringify(pendingSync)); }
        saveLocalDB(db); updateUI(document.getElementById('searchTxInput') ? document.getElementById('searchTxInput').value : ''); showToast("Transaksi Dihapus Secara Permanen.", "success");
    });
}

const searchInput = document.getElementById('searchTxInput'); const searchClear = document.getElementById('searchClearBtn'); 
if(searchInput) { searchInput.addEventListener('input', function(e) { let val = e.target.value.toLowerCase(); searchClear.style.display = val.length > 0 ? 'block' : 'none'; updateUI(val); }); }
function clearSearch() { searchInput.value = ''; searchClear.style.display = 'none'; updateUI(''); }

// ==========================================
// SISTEM LUPA PIN & OTP EMAIL
// ==========================================
function startOTPResetProcess() {
    closeModal('pinAuthModal'); closeModal('resetPinModal'); closeModal('resetTxPinAuthModal');
    if(!profile.googleLinked || !profile.googleEmail) { showToast("Akun belum terhubung ke Google!", "error"); return; }
    if(!navigator.onLine) { showToast("Reset PIN butuh koneksi internet!", "error"); return; }
    document.getElementById('displayUserEmail').innerText = profile.googleEmail; document.getElementById('otpRequestModal').classList.add('active');
}
function sendOTPEmail() {
    if(!navigator.onLine) { showToast("Koneksi terputus!", "error"); return; }
    const btn = document.getElementById('btnSendOTP'); btn.innerText = "Mengirim..."; btn.disabled = true;
    generatedOTP = Math.floor(100000 + Math.random() * 900000).toString(); otpExpiryTime = Date.now() + (5 * 60 * 1000);
    const templateParams = { to_email: profile.googleEmail, to_name: profile.name, otp_code: generatedOTP };
    emailjs.send('service_4v89q7h', 'template_w9fgvcf', templateParams).then(function() { showToast("Kode terkirim ke Email!", "success"); closeModal('otpRequestModal'); document.getElementById('inputOTP').value = ''; document.getElementById('inputNewPinOTP').value = ''; document.getElementById('otpVerifyModal').classList.add('active'); btn.innerText = "Kirim Kode Sekarang"; btn.disabled = false; }, function(error) { showToast("Error: " + (error.text || "Ditolak EmailJS"), "error"); btn.innerText = "Kirim Kode Sekarang"; btn.disabled = false; });
}
async function verifyOTPAndSavePin() {
    const inputCode = document.getElementById('inputOTP').value; const newPin = document.getElementById('inputNewPinOTP').value;
    if(Date.now() > otpExpiryTime) { showToast("Kode OTP Kadaluarsa!", "error"); return; }
    if(inputCode !== generatedOTP) { showToast("Kode OTP Salah!", "error"); return; }
    if(newPin.length < 4) { showToast("PIN Baru minimal 4 digit!", "error"); return; }
    profile.pin = await hashPIN(newPin); profile.txPin = ''; saveProfileLocal(); await saveProfileToSupabase(); generatedOTP = ""; closeModal('otpVerifyModal'); showToast("PIN Utama berhasil direset!", "success");
}
const iconSun = `<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="5"/><path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42"/></svg>`;
const iconMoon = `<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>`;

const savedTheme = getLS('app_theme') || 'dark';
document.documentElement.setAttribute('data-theme', savedTheme);

window.addEventListener('DOMContentLoaded', () => {
    updateThemeIcon(savedTheme);
});

function toggleTheme() {
    const htmlEl = document.documentElement;
    const currentTheme = htmlEl.getAttribute('data-theme') || 'dark';
    const newTheme = currentTheme === 'dark' ? 'light' : 'dark';
    
    htmlEl.setAttribute('data-theme', newTheme);
    setLS('app_theme', newTheme);
    updateThemeIcon(newTheme);
    
    const searchTerm = document.getElementById('searchTxInput') ? document.getElementById('searchTxInput').value : '';
    if(typeof updateUI === 'function') updateUI(searchTerm);
}

function updateThemeIcon(theme) {
    const btn = document.getElementById('themeToggleBtn');
    if (!btn) return;
    if (theme === 'light') {
        btn.innerHTML = iconMoon;
        btn.style.color = '#64748b'; 
    } else {
        btn.innerHTML = iconSun;
        btn.style.color = 'var(--kuning)'; 
    }
}

// INIT
window.addEventListener('load', () => { bootApp(); });

if ('serviceWorker' in navigator) {
    window.addEventListener('load', async () => {
        navigator.serviceWorker.register('./sw.js').then(reg => {
            reg.addEventListener('updatefound', () => { const newWorker = reg.installing; newWorker.addEventListener('statechange', () => { if (newWorker.state === 'installed' && navigator.serviceWorker.controller) { const updateScreen = document.getElementById('updateScreen'); if (updateScreen) { updateScreen.style.display = 'flex'; } setTimeout(() => window.location.reload(true), 1500); } }); });
        });
    });
    let refreshing = false; navigator.serviceWorker.addEventListener('controllerchange', () => { if (!refreshing) { refreshing = true; window.location.reload(true); } });
}

document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible") { setTimeout(() => { if (typeof Chart !== 'undefined') { for (let id in Chart.instances) { Chart.instances[id].resize(); Chart.instances[id].update(); } } }, 300); } });
