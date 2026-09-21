// ==========================================
// KODE PRODUKSI: TPA FINANCE 4.1 LOGIC
// ==========================================

const APP_VERSION = '4.1'; 
const LS_PREFIX = 'tpa_finance_v4_';

function getLS(key) { return localStorage.getItem(LS_PREFIX + key); }
function setLS(key, val) { localStorage.setItem(LS_PREFIX + key, val); }
function removeLS(key) { localStorage.removeItem(LS_PREFIX + key); }

const SUPABASE_URL = 'https://ndsyyaxmiwskrkklseap.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5kc3l5YXhtaXdza3Jra2xzZWFwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODUxNDU4NjIsImV4cCI6MjEwMDcyMTg2Mn0.uXgAIhUjjkNpe9s6N6LGvRXZLUDQUZJrSfUFf1BDmKU';

let sbClient = null;
let db = []; 
let pendingSync = JSON.parse(getLS('pending_sync')) || []; 
let sppData = JSON.parse(getLS('spp_data_v4')) || [];
let currentUser = null; 

let APP_MODE = getLS('app_mode') || 'GUEST';
let activeWallet = 'utama'; 
let currentTimeFilter = 365; 
let rawAmount = 0;
let pieChart, barChart, lineChart; 
let isInitialTableRender = true; 
let realTimeSubscription = null;
let sppRealTimeSubscription = null;

let isPublicMode = false;
let currentPublicStudent = null;

// ==========================================
// INISIALISASI & BOOTSTRAP
// ==========================================
window.addEventListener('DOMContentLoaded', () => { 
    checkAppVersion();
    enforcePublicReadOnlyMode();
    bootApp();
    setupThemeEngine();
    startDeveloperToast();
});

function checkAppVersion() {
    const savedVersion = getLS('app_version');
    if (savedVersion !== APP_VERSION) {
        setLS('app_version', APP_VERSION);
        if (navigator.onLine) {
            const updateScreen = document.getElementById('updateScreen');
            if (updateScreen) { updateScreen.style.display = 'flex'; setTimeout(() => { window.location.reload(true); }, 1500); }
        }
    }
}

const defaultProfile = { 
    name: 'Pengurus', pin: '', 
    photo: 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAyNCAyNCIgZmlsbD0iIzEwYjk4MSI+PHBhdGggZD0iTTEyIDJhNSA1IDAgMSAwIDUgNSBNMTIgMTRhNyA3IDAgMCAwLTcgN3YxSDE5di0xYTcgNyAwIDAgMC03LTdaIi8+PC9zdmc+', 
    joinDate: new Date().toISOString(), gender: 'Rahasia', googleLinked: false, googleEmail: ''
};

let profile = JSON.parse(getLS('profile_secure_v4')) || { ...defaultProfile };
if(!profile.photo) profile.photo = defaultProfile.photo;

function bootApp() {
    db = loadLocalDB(); 
    initAppHeader();
    switchWallet('utama'); // Auto render shortcuts & UI
    
    const netStatus = document.getElementById('networkStatus');
    if (APP_MODE === 'CLOUD') {
        currentUser = { id: 'offline_user', email: profile.googleEmail || 'Cloud User' }; 
        updateNetworkBadge(navigator.onLine ? "Menyambungkan..." : "Offline (Cloud)", navigator.onLine ? "sync-pending" : "sync-offline");
    } else {
        currentUser = null;
        updateNetworkBadge("Offline (Guest)", "sync-offline");
    }
    
    // Auto Hit DB Delay
    setTimeout(initSupabaseBackground, 300);
}

function updateNetworkBadge(text, className) {
    const netStatus = document.getElementById('networkStatus');
    if(netStatus) {
        netStatus.innerText = text;
        netStatus.className = `status-sync ${className}`;
    }
}

// ==========================================
// ENGINE TEMA (ANIMASI RIPPLE)
// ==========================================
function setupThemeEngine() {
    const savedTheme = getLS('app_theme') || 'dark';
    document.documentElement.setAttribute('data-theme', savedTheme);
}

function toggleTheme(event) {
    const htmlEl = document.documentElement; 
    const currentTheme = htmlEl.getAttribute('data-theme') || 'dark';
    const newTheme = currentTheme === 'dark' ? 'light' : 'dark'; 
    
    const ripple = document.getElementById('theme-ripple');
    if(event && ripple) {
        // Posisi klik untuk origin ripple
        const rect = event.target.getBoundingClientRect();
        const size = Math.max(window.innerWidth, window.innerHeight) * 2;
        ripple.style.width = ripple.style.height = `${size}px`;
        ripple.style.left = `${event.clientX - size/2}px`;
        ripple.style.top = `${event.clientY - size/2}px`;
        
        document.body.classList.add('theme-animating');
        setTimeout(() => {
            htmlEl.setAttribute('data-theme', newTheme);
            setLS('app_theme', newTheme);
            if(typeof Chart !== 'undefined') renderCharts(db); // Update chart colors
        }, 300);
        
        setTimeout(() => {
            document.body.classList.remove('theme-animating');
            ripple.style.width = ripple.style.height = '0px';
        }, 600);
    } else {
        htmlEl.setAttribute('data-theme', newTheme);
        setLS('app_theme', newTheme);
    }
}

// ==========================================
// DATABASE LOKAL & ENKRIPSI
// ==========================================
const SECRET_KEY = "TPA_Finance_Secure_K3y_v4";
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

async function hashPIN(pin) {
    if (!pin) return '';
    try {
        if (typeof CryptoJS !== 'undefined') { return CryptoJS.SHA256(pin).toString(CryptoJS.enc.Hex); } else { return btoa(pin); }
    } catch (error) { return btoa(pin); }
}

function saveProfileLocal() { setLS('profile_secure_v4', JSON.stringify(profile)); }

// ==========================================
// SUPABASE CLOUD & SINKRONISASI REAL-TIME
// ==========================================
async function initSupabaseBackground() {
    if (typeof window.supabase === 'undefined') { updateNetworkBadge("Offline (Lokal)", "sync-offline"); return; }
    if (!sbClient) sbClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

    if ((APP_MODE === 'CLOUD' || isPublicMode) && navigator.onLine) {
        try {
            const sessionPromise = sbClient.auth.getSession();
            const timeoutPromise = new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout')), 5000));
            const { data: { session }, error } = await Promise.race([sessionPromise, timeoutPromise]);
            
            if(isPublicMode) {
                updateNetworkBadge("Online (Publik)", "sync-online");
                // Mode publik hit DB tanpa user session (butuh RLS public di Supabase, atau fetch global anon)
                fetchGlobalSppData(); 
                return;
            }

            if (error) throw error;
            if (session && session.user) {
                currentUser = session.user;
                updateNetworkBadge("Online (Cloud)", "sync-online");
                fetchUserTransactions(); 
                fetchSppData();
                setupRealtime();
                if (pendingSync.length > 0) processPendingSync();
            }
        } catch(err) { updateNetworkBadge("Server Lambat", "sync-offline"); }
    }
}

async function fetchUserTransactions() {
    if (!currentUser || currentUser.id === 'offline_user' || !sbClient) return;
    try {
        const { data, error } = await sbClient.from('transactions').select('*').eq('user_id', currentUser.id).order('date', { ascending: true });
        if (error) throw error;
        db = data; saveLocalDB(db); 
        updateUI(document.getElementById('searchTxInput') ? document.getElementById('searchTxInput').value : ''); 
    } catch (error) { db = loadLocalDB(); updateUI(); }
}

async function fetchSppData() {
    if (!currentUser || currentUser.id === 'offline_user' || !sbClient) return;
    try {
        const { data, error } = await sbClient.from('spp_data').select('*').eq('user_id', currentUser.id);
        if (error) throw error;
        sppData = data; setLS('spp_data_v4', JSON.stringify(sppData));
    } catch (error) { sppData = JSON.parse(getLS('spp_data_v4')) || []; }
}

async function fetchGlobalSppData() {
    // Dipanggil hanya dalam mode Wali Santri untuk auto-recommendation & live update
    if(!sbClient) return;
    try {
        // Menggunakan RLS Public atau memanggil semua data (Bergantung pada seting DB asli)
        const { data, error } = await sbClient.from('spp_data').select('*');
        if(!error && data) sppData = data; 
    } catch(e) {}
}

function setupRealtime() {
    if (!currentUser || currentUser.id === 'offline_user' || !sbClient) return;
    if (realTimeSubscription) sbClient.removeChannel(realTimeSubscription);
    realTimeSubscription = sbClient.channel('tpa-tx-channel')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'transactions', filter: `user_id=eq.${currentUser.id}` }, payload => { fetchUserTransactions(); }).subscribe();
        
    if (sppRealTimeSubscription) sbClient.removeChannel(sppRealTimeSubscription);
    sppRealTimeSubscription = sbClient.channel('tpa-spp-channel')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'spp_data', filter: `user_id=eq.${currentUser.id}` }, payload => { fetchSppData(); if(document.getElementById('sppModal').classList.contains('active')) renderSppTable(); }).subscribe();
}

async function processPendingSync() {
    if (!navigator.onLine || !currentUser || currentUser.id === 'offline_user' || !sbClient || pendingSync.length === 0) return;
    try {
        showToast("Menyinkronkan antrean...", "sync");
        const payload = pendingSync.map(t => { let newData = { ...t, user_id: currentUser.id }; if(String(newData.id).length > 10) delete newData.id; return newData; });
        const { error } = await sbClient.from('transactions').insert(payload);
        if (error) throw error;
        pendingSync = []; setLS('pending_sync', JSON.stringify(pendingSync));
        showToast("Data tersinkron!", "success"); fetchUserTransactions();
    } catch (error) {}
}

window.addEventListener('online', () => { 
    if(isPublicMode) { updateNetworkBadge("Online (Publik)", "sync-online"); fetchGlobalSppData(); return; }
    updateNetworkBadge(APP_MODE === 'CLOUD' ? "Menyambungkan..." : "Online (Guest)", APP_MODE === 'CLOUD' ? "sync-pending" : "sync-online");
    if(APP_MODE === 'CLOUD') {
        if (currentUser && currentUser.id === 'offline_user') { initSupabaseBackground(); } 
        else { if (pendingSync.length > 0) processPendingSync(); else fetchUserTransactions(); updateNetworkBadge("Online (Cloud)", "sync-online"); }
    }
});
window.addEventListener('offline', () => { 
    updateNetworkBadge("Offline", "sync-offline");
    showToast("Koneksi terputus.", "error"); 
});

// ==========================================
// FUNGSI UTILITIES DOM & CUSTOM UI
// ==========================================
function openModal(id) { 
    document.getElementById(id).classList.add('active'); 
    document.body.classList.add('no-scroll'); 
}

function closeModal(id) { 
    if(id) { const el = document.getElementById(id); if(el) el.classList.remove('active'); } 
    document.querySelectorAll('.custom-options.open').forEach(e => e.classList.remove('open')); 
    // Bebaskan scroll jika tidak ada modal terbuka
    if(document.querySelectorAll('.modal-overlay.active').length === 0) {
        document.body.classList.remove('no-scroll');
    }
}

function showToast(msg, type = 'success') { 
    const box = document.getElementById('toastBox'); if(!box) return; 
    const t = document.createElement('div'); t.className = `toast ${type}`; t.innerHTML = msg; 
    box.appendChild(t); 
    setTimeout(() => t.classList.add('show'), 10); 
    setTimeout(() => { t.classList.remove('show'); setTimeout(() => t.remove(), 400); }, 3000); 
}

function startDeveloperToast() {
    setInterval(() => {
        const box = document.getElementById('toastBox'); if(!box) return;
        const t = document.createElement('div'); t.className = `toast`;
        t.style.borderLeft = "4px solid var(--kuning)"; t.style.boxShadow = "0 10px 25px rgba(245, 158, 11, 0.2)";
        t.innerHTML = "☕ Dev bekerja keras! Dukung via traktir kopi di Menu Profil.";
        box.appendChild(t);
        setTimeout(() => t.classList.add('show'), 10);
        setTimeout(() => { t.classList.remove('show'); setTimeout(() => t.remove(), 400); }, 5000);
    }, 180000); // Tiap 3 Menit
}

let confirmCallback = null;
function openCustomConfirm(title, desc, action) { 
    document.getElementById('confirmTitle').innerText = title; 
    document.getElementById('confirmDesc').innerHTML = desc; 
    confirmCallback = action; 
    openModal('confirmModal'); 
}
document.getElementById('btnConfirmYes').addEventListener('click', () => { 
    if(confirmCallback) confirmCallback(); 
    closeModal('confirmModal'); 
});

function toggleCustomSelect(id) { 
    const box = document.getElementById(id); const isOpen = box.classList.contains('open'); 
    document.querySelectorAll('.custom-options.open').forEach(el => el.classList.remove('open')); 
    if(!isOpen) box.classList.add('open'); 
}

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
    } 
} 
function closeChart(e, btn) { 
    e.stopPropagation(); 
    for(let i of btn.closest('.expand-container').children) i.className = 'expand-item glass-card'; 
    setTimeout(() => { if(pieChart) pieChart.resize(); if(barChart) barChart.resize(); if(lineChart) lineChart.resize(); }, 100); 
}

// ==========================================
// MODE PUBLIK (WALI SANTRI)
// ==========================================
function enforcePublicReadOnlyMode() {
    const urlParams = new URLSearchParams(window.location.search);
    if (urlParams.get('view') === 'public') {
        isPublicMode = true;
        document.getElementById('publicAuthOverlay').classList.add('active');
        document.body.classList.add('no-scroll');
        setupPublicAutocomplete();
    }
}

function setupPublicAutocomplete() {
    const input = document.getElementById('publicStudentInput');
    const list = document.getElementById('publicAutocompleteList');
    
    input.addEventListener('input', () => {
        const val = input.value.toLowerCase();
        list.innerHTML = '';
        if(!val) return;
        
        // Match from sppData
        const matches = sppData.filter(s => s.name.toLowerCase().includes(val));
        matches.forEach(m => {
            const div = document.createElement('div');
            div.innerText = m.name;
            div.onclick = () => { input.value = m.name; list.innerHTML = ''; };
            list.appendChild(div);
        });
    });
}

function verifyPublicAccess() {
    const inputName = document.getElementById('publicStudentInput').value.trim();
    if(!inputName) { showToast("Masukkan nama Santri", "error"); return; }
    
    // Pencocokan ketat untuk privasi
    const student = sppData.find(s => s.name.toLowerCase() === inputName.toLowerCase());
    if(!student) { showToast("Nama santri tidak terdaftar!", "error"); return; }
    
    currentPublicStudent = student;
    document.getElementById('publicAuthOverlay').classList.remove('active');
    document.body.classList.remove('no-scroll');
    
    // Terapkan Restriksi UI
    document.getElementById('headName').innerText = student.name;
    document.getElementById('headGender').innerText = "WALI SANTRI (READ-ONLY)";
    
    const adminCols = document.querySelectorAll('.admin-only-col, .admin-only-btn, .admin-only-section');
    adminCols.forEach(el => el.style.display = 'none');
    
    document.getElementById('quickActionsContainer').style.display = 'none';
    document.getElementById('publicStudentDashboard').style.display = 'block';
    
    renderPublicDashboard();
    showToast("Akses Diberikan (Mode Pantau)", "success");
}

function renderPublicDashboard() {
    if(!currentPublicStudent) return;
    document.getElementById('pubStudentName').innerText = currentPublicStudent.name;
    document.getElementById('pubStudentSpp').innerText = currentPublicStudent.status;
    document.getElementById('pubStudentSppMonths').innerText = "Bulan: " + (currentPublicStudent.months || "-");
    
    const statusColor = currentPublicStudent.status === 'Lunas' ? 'var(--hijau)' : (currentPublicStudent.status === 'Nyicil' ? 'var(--kuning)' : 'var(--merah)');
    document.getElementById('pubStudentSpp').style.color = statusColor;
    
    document.getElementById('pubAbsHadir').innerText = currentPublicStudent.absHadir || 0;
    document.getElementById('pubAbsIzin').innerText = currentPublicStudent.absIzin || 0;
    document.getElementById('pubAbsAlfa').innerText = currentPublicStudent.absAlfa || 0;
}

// ==========================================
// MANAJEMEN SPP & ABSENSI (ADMIN)
// ==========================================
function openSPPModal() { openModal('sppModal'); renderSppTable(); }

async function addSppStudent() {
    const input = document.getElementById('newSppName'); const name = input.value.trim();
    if (!name) { showToast("Nama wajib diisi", "error"); return; }
    
    const newStudent = { id: Date.now().toString(), name: name, months: "-", status: "Belum", absHadir: 0, absIzin: 0, absAlfa: 0 };
    sppData.push(newStudent);
    
    await syncSppToCloud(newStudent, 'insert');
    input.value = ''; renderSppTable(); showToast("Santri ditambahkan", "success");
}

async function syncSppToCloud(data, action='update') {
    setLS('spp_data_v4', JSON.stringify(sppData));
    if (APP_MODE === 'CLOUD' && currentUser && currentUser.id !== 'offline_user' && navigator.onLine && sbClient) {
        try {
            if(action === 'delete') { await sbClient.from('spp_data').delete().eq('id', data.id); }
            else { await sbClient.from('spp_data').upsert({ ...data, user_id: currentUser.id }); }
        } catch(e) {}
    }
}

function deleteSppStudent(id) { 
    openCustomConfirm("Hapus Santri", "Data histori absen & SPP santri ini akan hilang permanen.", async () => {
        const student = sppData.find(s => s.id === id);
        sppData = sppData.filter(s => s.id !== id); 
        await syncSppToCloud(student, 'delete');
        renderSppTable(); showToast("Dihapus permanen", "success"); 
    });
}

function renderSppTable() {
    const tbody = document.getElementById('sppTableBody');
    if (sppData.length === 0) { tbody.innerHTML = `<tr><td colspan="5" style="text-align:center; padding:20px; color:var(--text-muted); font-size:12px;">Belum ada santri terdaftar.</td></tr>`; return; }
    
    tbody.innerHTML = sppData.map(s => {
        const statusColor = s.status === 'Lunas' ? 'var(--hijau)' : (s.status === 'Nyicil' ? 'var(--kuning)' : 'var(--merah)');
        return `
        <tr style="border-bottom:1px solid var(--border);" class="spp-row">
            <td style="padding:10px; font-size:12px; font-weight:700; color:var(--teks-netral);">${s.name}</td>
            <td style="padding:10px; text-align:center; font-size:11px; color:var(--text-muted);">${s.months}</td>
            <td style="padding:10px; text-align:center;"><span style="color:${statusColor}; font-weight:900; font-size:10px; text-transform:uppercase;">${s.status}</span></td>
            <td style="padding:10px; text-align:center; font-size:10px; font-weight:bold;">
                <span style="color:var(--hijau)">H:${s.absHadir||0}</span> <span style="color:var(--biru)">I:${s.absIzin||0}</span> <span style="color:var(--merah)">A:${s.absAlfa||0}</span>
            </td>
            <td style="padding:10px; text-align:center;">
                <button onclick="openSppAction('${s.id}')" style="background:var(--hijau); border:none; color:#000; padding:6px 12px; border-radius:6px; cursor:pointer; font-size:10px; font-weight:800;">UBAH</button>
                <button onclick="deleteSppStudent('${s.id}')" style="background:transparent; border:1px solid var(--merah); color:var(--merah); padding:5px 8px; border-radius:6px; cursor:pointer; font-size:10px; margin-left:5px;">✕</button>
            </td>
        </tr>`;
    }).join('');
}

function filterSppTable() {
    const query = document.getElementById('searchSppInput').value.toLowerCase();
    const rows = document.querySelectorAll('.spp-row');
    rows.forEach(row => {
        const name = row.querySelector('td').innerText.toLowerCase();
        row.style.display = name.includes(query) ? '' : 'none';
    });
}

// Action Modal State
let tempActionAbs = { hadir: 0, izin: 0, alfa: 0 };

function openSppAction(id) {
    const student = sppData.find(s => s.id === id); if(!student) return;
    document.getElementById('actionSppId').value = student.id;
    document.getElementById('actionSppName').innerText = student.name;
    document.getElementById('actionSppMonths').value = student.months === '-' ? '' : student.months;
    
    selectSppStatus(student.status);
    tempActionAbs = { hadir: 0, izin: 0, alfa: 0 }; // Reset temp
    updateAbsTextUI();
    
    openModal('sppActionModal');
}

function selectSppStatus(val) { 
    document.getElementById('actionSppStatusVal').value = val; 
    document.getElementById('dispSppStatus').innerText = val; 
    closeModal(''); 
}

function addAbsensi(type) { tempActionAbs[type]++; updateAbsTextUI(); }
function resetAbsensi() { tempActionAbs = { hadir: 0, izin: 0, alfa: 0 }; updateAbsTextUI(); }
function updateAbsTextUI() { 
    document.getElementById('txtAbsHadir').innerText = tempActionAbs.hadir;
    document.getElementById('txtAbsIzin').innerText = tempActionAbs.izin;
    document.getElementById('txtAbsAlfa').innerText = tempActionAbs.alfa;
}

async function saveSppAction() {
    const id = document.getElementById('actionSppId').value;
    const months = document.getElementById('actionSppMonths').value.trim() || '-';
    const status = document.getElementById('actionSppStatusVal').value;
    
    const idx = sppData.findIndex(s => s.id === id); if(idx === -1) return;
    
    sppData[idx].months = months;
    sppData[idx].status = status;
    sppData[idx].absHadir = (sppData[idx].absHadir || 0) + tempActionAbs.hadir;
    sppData[idx].absIzin = (sppData[idx].absIzin || 0) + tempActionAbs.izin;
    sppData[idx].absAlfa = (sppData[idx].absAlfa || 0) + tempActionAbs.alfa;
    
    await syncSppToCloud(sppData[idx]);
    renderSppTable();
    closeModal('sppActionModal');
    showToast("Data Tersimpan", "success");
}

// ==========================================
// CUSTOM CALENDAR ENGINE
// ==========================================
let calCurrentDate = new Date();
function openCustomCalendar(targetId) {
    document.getElementById('calTargetInputId').value = targetId;
    calCurrentDate = new Date(); // Reset to today on open
    renderCalendar();
    openModal('customCalendarModal');
}

function calChangeMonth(dir) {
    calCurrentDate.setMonth(calCurrentDate.getMonth() + dir);
    renderCalendar();
}

function renderCalendar() {
    const container = document.getElementById('calDaysContainer');
    const monthYear = document.getElementById('calMonthYearDisplay');
    
    const monthNames = ["Januari", "Februari", "Maret", "April", "Mei", "Juni", "Juli", "Agustus", "September", "Oktober", "November", "Desember"];
    monthYear.innerText = `${monthNames[calCurrentDate.getMonth()]} ${calCurrentDate.getFullYear()}`;
    
    container.innerHTML = '';
    
    const firstDay = new Date(calCurrentDate.getFullYear(), calCurrentDate.getMonth(), 1).getDay();
    const daysInMonth = new Date(calCurrentDate.getFullYear(), calCurrentDate.getMonth() + 1, 0).getDate();
    
    const today = new Date();
    
    // Empty slots
    for(let i = 0; i < firstDay; i++) {
        container.innerHTML += `<div class="cal-day empty"></div>`;
    }
    
    // Days
    for(let i = 1; i <= daysInMonth; i++) {
        const isToday = (i === today.getDate() && calCurrentDate.getMonth() === today.getMonth() && calCurrentDate.getFullYear() === today.getFullYear());
        const activeClass = isToday ? 'active' : '';
        // Date string YYYY-MM-DD
        const dateStr = `${calCurrentDate.getFullYear()}-${String(calCurrentDate.getMonth()+1).padStart(2,'0')}-${String(i).padStart(2,'0')}`;
        container.innerHTML += `<div class="cal-day ${activeClass}" onclick="selectCalDate('${dateStr}')">${i}</div>`;
    }
}

function selectCalDate(dateStr) {
    const targetId = document.getElementById('calTargetInputId').value;
    const displayEl = document.getElementById(targetId);
    if(displayEl) {
        displayEl.value = dateStr; // Simple format for display
        // Also set hidden val if exists
        const hiddenEl = document.getElementById(targetId.replace('-display', '-val'));
        if(hiddenEl) hiddenEl.value = dateStr + "T00:00:00"; 
    }
    closeModal('customCalendarModal');
}

// ==========================================
// CORE UI & TRANSACTIONS LOGIC
// ==========================================
function switchWallet(type) { 
    activeWallet = type; 
    document.getElementById('walletSwitchContainer').setAttribute('data-active', type); 
    document.querySelectorAll('.btn-tab').forEach(b => b.classList.remove('active')); 
    document.getElementById(`tab-${type}`).classList.add('active'); 
    renderShortcuts(); 
    updateUI(document.getElementById('searchTxInput') ? document.getElementById('searchTxInput').value : ''); 
}

function renderShortcuts() { 
    const c = document.getElementById('quickActionsContainer'); 
    c.className = 'quick-actions-wrap grid-mode'; 
    if(activeWallet === 'utama') {
        c.innerHTML = ` 
            <button class="btn-quick svg-hijau" onclick="quickInput('masuk', 'Infak Santri', 'Ustadz / Santri - ')"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="2" y="6" width="20" height="12" rx="2"/><circle cx="12" cy="12" r="2"/></svg> <span>Infak Santri</span></button> 
            <button class="btn-quick svg-biru" onclick="quickInput('masuk', 'Donasi Masyarakat', 'Tokoh - ')"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path><circle cx="9" cy="7" r="4"></circle></svg> <span>Donasi Umum</span></button> 
            <button class="btn-quick svg-merah" onclick="quickInput('keluar', 'Honor Guru', 'Ustadz - ')"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg> <span>Honor Guru</span></button> 
            <button class="btn-quick svg-kuning" onclick="quickInput('masuk', 'Bantuan Pemerintah', 'Instansi - ')"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg> <span>Lainnya (+)</span></button> 
        `;
    } else if(activeWallet === 'wakaf') {
        c.innerHTML = `
            <button class="btn-quick svg-hijau" onclick="quickInput('masuk', 'Wakaf', 'Donatur - ')"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="2" y="6" width="20" height="12" rx="2"/><circle cx="12" cy="12" r="2"/></svg> <span>Terima Wakaf</span></button> 
            <button class="btn-quick svg-merah" onclick="quickInput('keluar', 'Perbaikan Bangunan', 'Tukang - ')"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><line x1="5" y1="12" x2="19" y2="12"></line></svg> <span>Gunakan Dana</span></button>
        `;
    } else if(activeWallet === 'operasional') {
        c.innerHTML = `
            <button class="btn-quick svg-merah" onclick="quickInput('keluar', 'Listrik', 'PLN')"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><line x1="5" y1="12" x2="19" y2="12"></line></svg> <span>Bayar Listrik</span></button>
            <button class="btn-quick svg-kuning" onclick="quickInput('keluar', 'ATK', 'Toko - ')"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/></svg> <span>Beli ATK</span></button>
        `;
    } else if(activeWallet === 'darurat') {
        c.innerHTML = `
            <button class="btn-quick svg-hijau" onclick="quickInput('masuk', 'Dana Darurat', 'Pengurus - Masuk dari Utama')"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg> <span>Simpan Dana</span></button>
            <button class="btn-quick svg-merah" onclick="quickInput('keluar', 'Penggunaan Darurat', 'Pengurus - Keperluan Mendesak')"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><line x1="5" y1="12" x2="19" y2="12"></line></svg> <span>Gunakan Dana</span></button>
        `;
    }
}

function quickInput(type, cat, pihakPreset) { 
    document.getElementById('tx-type').value = type; 
    document.getElementById('modal-title').innerText = type === 'masuk' ? 'Catat Pemasukan TPA' : 'Catat Pengeluaran TPA'; 
    document.getElementById('tx-desc').value = ''; 
    document.getElementById('tx-pihak-terkait').value = pihakPreset || ''; 
    document.getElementById('tx-date-display').value = ''; 
    document.getElementById('tx-date-val').value = ''; 
    
    document.getElementById('catSelectWrapper').style.display = 'block'; 
    document.getElementById('tx-category-manual').style.display = 'none'; 
    document.getElementById('label-kategori').innerText = 'Kategori'; 
    
    const categoriesList = type === 'masuk' ? ['Infak Santri', 'Donasi Masyarakat', 'Wakaf', 'Dana Darurat', 'Bantuan Pemerintah', 'Lainnya'] : ['Honor Guru', 'ATK', 'Listrik', 'Air', 'Perbaikan Bangunan', 'Penggunaan Darurat', 'Lainnya'];
    const box = document.getElementById('catOptionsBox'); 
    box.innerHTML = categoriesList.map(c => `<div class="custom-option text-neutral" onclick="selectCategory('${c}')">${c}</div>`).join(''); 
    
    selectCategory(cat); 
    document.getElementById('tx-amount').value = ''; rawAmount = 0; 
    
    openModal('txModal'); 
    setTimeout(() => document.getElementById('tx-amount').focus(), 300); 
}

function selectCategory(val) { 
    document.getElementById('tx-category').value = val; 
    document.getElementById('dispTxCat').innerText = val; 
    closeModal(''); 
}

document.getElementById('tx-amount').addEventListener('input', function() { 
    let v = this.value.replace(/[^0-9]/g, ''); 
    if(v === '') { rawAmount = 0; this.value = ''; return; } 
    rawAmount = parseInt(v, 10); 
    this.value = rawAmount.toLocaleString('id-ID'); 
});

// Double konfirmasi sebelum save transaksi
document.getElementById('btnExecuteTx').addEventListener('click', () => {
    if(rawAmount <= 0) { showToast("Nominal tidak valid", "error"); return; } 
    openCustomConfirm("Simpan Transaksi", `Kategori: ${document.getElementById('tx-category').value}<br>Nominal: <b>Rp ${rawAmount.toLocaleString('id-ID')}</b>`, executeTxSave);
});

async function executeTxSave() { 
    try {
        const type = document.getElementById('tx-type').value; 
        let cF = document.getElementById('tx-category').value; 
        let dF = document.getElementById('tx-desc').value.trim(); 
        const pihak = document.getElementById('tx-pihak-terkait').value.trim();
        
        let txDateVal = document.getElementById('tx-date-val').value;
        let finalDate = txDateVal ? new Date(txDateVal).toISOString() : new Date().toISOString();

        if(!cF || !dF) { showToast("Deskripsi wajib diisi", "error"); return; } 
        
        let tx = { wallet: activeWallet, type: type, category: cF, desc: dF, pihak_terkait: pihak, amount: rawAmount, status: 'normal', date: finalDate };
        
        if(APP_MODE === 'CLOUD' && navigator.onLine && sbClient && (!currentUser || currentUser.id !== 'offline_user')) { 
            try { 
                let data = { ...tx, user_id: currentUser.id };
                await sbClient.from('transactions').insert([data]); 
                await fetchUserTransactions(); 
                showToast("Tersimpan di Cloud"); 
            } catch(e) { 
                tx.id = Date.now() + Math.random(); db.push(tx); pendingSync.push(tx); setLS('pending_sync', JSON.stringify(pendingSync)); saveLocalDB(db); 
                updateUI();
                showToast("Jaringan lambat. Masuk Antrean Offline.", "syncing"); 
            }
        } else { 
            tx.id = Date.now() + Math.floor(Math.random() * 1000); db.push(tx); 
            if (APP_MODE === 'CLOUD') { pendingSync.push(tx); setLS('pending_sync', JSON.stringify(pendingSync)); }
            saveLocalDB(db); updateUI(); 
            showToast("Disimpan di Lokal"); 
        }
    } finally { closeModal('txModal'); }
}

function applyTimeFilter(days, labelText) { 
    currentTimeFilter = days; 
    document.getElementById('dispTimeFilter').innerHTML = labelText; 
    closeModal(''); 
    updateUI(document.getElementById('searchTxInput') ? document.getElementById('searchTxInput').value : ''); 
}

function getDynamicColor(categoryStr, type) {
    if (type === 'keluar') return '#ef4444';
    const inColors = { 'Wakaf': '#a855f7', 'Infak Santri': '#10b981', 'Donasi Masyarakat': '#3b82f6', 'Dana Darurat': '#f59e0b' };
    if (inColors[categoryStr]) return inColors[categoryStr];
    return '#10b981'; 
}

// ==========================================
// RENDER ENGINE & AI TICKER
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

    updateHealthAndAI(fd);
    
    let m = 0, k = 0; fd.forEach(t => { if(t.type === 'masuk') m += t.amount; else k += t.amount; });
    const formatRp = num => new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', minimumFractionDigits: 0 }).format(num);
    const formatRpPendek = num => formatRp(num).replace(/\.000$/, '...');
    
    const dispSaldo = document.getElementById('disp-saldo'); if(dispSaldo) { dispSaldo.setAttribute('data-short', formatRpPendek(m - k)); dispSaldo.setAttribute('data-full', formatRp(m - k)); dispSaldo.innerText = formatRp(m-k); }
    const dispMasuk = document.getElementById('disp-masuk'); if(dispMasuk) { dispMasuk.setAttribute('data-short', formatRpPendek(m)); dispMasuk.setAttribute('data-full', formatRp(m)); dispMasuk.innerText = formatRp(m); }
    const dispKeluar = document.getElementById('disp-keluar'); if(dispKeluar) { dispKeluar.setAttribute('data-short', formatRpPendek(k)); dispKeluar.setAttribute('data-full', formatRp(k)); dispKeluar.innerText = formatRp(k); }
    
    renderTable(fd); 
    renderCharts(fd);
}

// AI Logic
let aiCarouselInterval = null;
let aiMessagesDynamic = [];
let aiCurrentMsgIdx = 0;

function updateHealthAndAI(data) { 
    let tIn = 0, tOut = 0; data.forEach(t => { if(t.type === 'masuk') tIn += t.amount; else tOut += t.amount; }); 
    let balance = tIn - tOut; 
    
    const badge = document.getElementById('healthBadge'); 
    const text = document.getElementById('healthText'); 
    
    if(!badge) return; // public mode
    
    badge.className = 'health-badge glass-card'; 
    if (tIn === 0 && tOut === 0) { badge.classList.add('health-netral'); text.innerText = 'NETRAL'; } 
    else if (balance < 0) { badge.classList.add('health-defisit'); text.innerText = 'DEFISIT'; } 
    else if (balance >= 0 && balance <= 50000) { badge.classList.add('health-kritis'); text.innerText = 'KRITIS'; } 
    else { if (tOut > (tIn * 0.8)) { badge.classList.add('health-waspada'); text.innerText = 'WASPADA'; } else { badge.classList.add('health-sehat'); text.innerText = 'SEHAT'; } } 
    
    // Generate AI Messages
    aiMessagesDynamic = [];
    if(data.length === 0) {
        aiMessagesDynamic.push(`Belum ada riwayat di dompet ${activeWallet.toUpperCase()}.`);
    } else {
        if(balance < 0) aiMessagesDynamic.push(`Peringatan: Kas ${activeWallet.toUpperCase()} defisit. Evaluasi pengeluaran.`);
        else if (tOut > 0) aiMessagesDynamic.push(`Arus kas ${activeWallet.toUpperCase()} berjalan normal.`);
        else aiMessagesDynamic.push(`Luar biasa! Seluruh pemasukan utuh.`);
        
        if(activeWallet === 'darurat') aiMessagesDynamic.push("Dana Darurat hanya digunakan untuk keperluan mendesak/force majeure.");
        else aiMessagesDynamic.push("Transparansi adalah kunci kepercayaan Wali Santri.");
    }
    
    renderAITicker();
}

function renderAITicker() {
    const container = document.getElementById('aiTextContainer');
    if(!container) return;
    
    // Reset Interval
    if(aiCarouselInterval) clearInterval(aiCarouselInterval);
    
    container.innerHTML = aiMessagesDynamic.map(msg => `<div class="ai-msg-item">${msg}</div>`).join('');
    container.style.transform = `translateY(0)`;
    
    if(aiMessagesDynamic.length > 1) {
        aiCurrentMsgIdx = 0;
        aiCarouselInterval = setInterval(() => {
            aiCurrentMsgIdx = (aiCurrentMsgIdx + 1) % aiMessagesDynamic.length;
            container.style.transform = `translateY(-${aiCurrentMsgIdx * 65}px)`; // 65px is min-height of msg
        }, 5000);
    }
}

function formatDetailDate(iso) { 
    if(!iso) return '-'; 
    const d = new Date(iso); 
    return `${String(d.getDate()).padStart(2,'0')}/${String(d.getMonth()+1).padStart(2,'0')}/${d.getFullYear()} - ${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`; 
}

function renderTable(data) {
    const t = document.getElementById('table-body');
    if(data.length === 0) { t.innerHTML = `<tr><td colspan="5" style="text-align:center; padding: 30px; color:var(--text-muted);">Tidak ada transaksi.</td></tr>`; return; }
    
    const formatRp = num => new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', minimumFractionDigits: 0 }).format(num);
    let htmlStr = '';
    [...data].sort((a,b) => new Date(b.date) - new Date(a.date)).forEach(tx => {
        const iM = tx.type === 'masuk'; 
        let pihakHtml = tx.pihak_terkait ? `<br><span style="font-size:11px; color:var(--text-muted);">${tx.pihak_terkait}</span>` : '';
        let cr = `<div class="badge-cat" style="color:var(--teks-netral);">${tx.category}</div>`;
        
        htmlStr += `<tr class="clickable-row" onclick="openReceipt('${tx.id || tx.date}')">
            <td style="color:var(--text-muted); font-size:11px; vertical-align:middle;">${formatDetailDate(tx.date).split(' - ')[0]}</td>
            <td style="width:1%; padding-right:15px; vertical-align:middle;">${cr}</td>
            <td style="vertical-align:middle; width:100%;"><span class="text-neutral" style="font-weight:700;">${tx.desc}</span>${pihakHtml}</td>
            <td class="admin-only-col" style="vertical-align:middle; text-align:center; width:1%;">
                <button type="button" style="background:transparent; color:var(--merah); border:1px solid var(--border); width:32px; height:32px; border-radius:8px; cursor:pointer;" onclick="promptActionPinFromTable(event, '${tx.id || tx.date}')">✕</button>
            </td>
            <td class="amt-cell" style="vertical-align:middle; color:var(--teks-netral);">${iM?'+':'-'}${formatRp(tx.amount)}</td>
        </tr>`;
    });
    t.innerHTML = htmlStr; 
    
    // Enforce restriction manually if active (because innerHTML overwrites)
    if(isPublicMode) {
        document.querySelectorAll('.admin-only-col').forEach(el => el.style.display = 'none');
    }
}

function promptActionPinFromTable(event, id) {
    event.stopPropagation();
    openCustomConfirm("Hapus Transaksi", "Data histori akan dihapus. Lanjutkan?", async () => {
        const idx = db.findIndex(t => String(t.id) === id || String(t.date) === id); if (idx === -1) return; 
        const delTx = db[idx]; db.splice(idx, 1);
        if (APP_MODE === 'CLOUD' && currentUser && currentUser.id !== 'offline_user' && navigator.onLine && sbClient && delTx.id) { 
            try { await sbClient.from('transactions').delete().eq('id', delTx.id); } catch(e) {} 
        }
        saveLocalDB(db); updateUI(); showToast("Transaksi dihapus.", "success");
    });
}

function openReceipt(txId) { 
    const strTxId = String(txId); const tx = db.find(t => String(t.id) === strTxId || String(t.date) === strTxId); if(!tx) return; 
    const rDate = formatDetailDate(tx.date); const rId = "TRX-" + new Date(tx.date).getTime().toString().slice(-8); 
    const rType = tx.type === 'masuk' ? 'Pemasukan' : 'Pengeluaran';
    const formatRp = num => new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', minimumFractionDigits: 0 }).format(num);
    
    document.getElementById('receiptContent').innerHTML = ` 
        <div class="receipt-head"><h3 style="margin:0 0 5px 0;" class="text-neutral">BUKTI KAS TPA</h3><span style="font-size:11px; color:var(--text-muted);">${rId}</span></div> 
        <div class="receipt-row"><span class="receipt-label">Waktu</span><span class="receipt-val">${rDate}</span></div> 
        <div class="receipt-row"><span class="receipt-label">Dompet Kas</span><span class="receipt-val" style="text-transform:capitalize;">${tx.wallet}</span></div> 
        <div class="receipt-row"><span class="receipt-label">Kategori</span><span class="receipt-val">${tx.category}</span></div> 
        <div class="receipt-row"><span class="receipt-label">Sifat</span><span class="receipt-val">${rType}</span></div> 
        <div class="receipt-row"><span class="receipt-label">Keterangan</span><span class="receipt-val">${tx.desc}</span></div> 
        ${tx.pihak_terkait ? `<div class="receipt-row"><span class="receipt-label">Pihak</span><span class="receipt-val">${tx.pihak_terkait}</span></div>` : ''} 
        <div class="receipt-row" style="margin-top:25px; border-top:2px dashed var(--border); padding-top:20px;"> 
            <span class="receipt-label" style="font-size:14px;">TOTAL</span> 
            <span class="receipt-val text-neutral" style="font-size: 22px;">${formatRp(tx.amount)}</span> 
        </div> 
    `; 
    openModal('receiptModal'); 
}

function renderCharts(data) {
    if (typeof Chart === 'undefined') return;
    if (!document.getElementById('pieChart')) return; 
    
    const isLight = document.documentElement.getAttribute('data-theme') === 'light';
    Chart.defaults.color = isLight ? '#475569' : '#8ba396'; 
    Chart.defaults.font.family = 'Inter';
    const gridLineColor = isLight ? '#e2e8f0' : '#0c2b1a';

    if(data.length === 0) { if(pieChart) pieChart.destroy(); if(barChart) barChart.destroy(); if(lineChart) lineChart.destroy(); return; }

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
    lineChart = new Chart(document.getElementById('lineChart'), { type: 'line', data: { labels: hI.map((_,i)=> `T${i+1}`), datasets: [{ label: 'Masuk', data: hI, borderColor: '#10b981', backgroundColor: 'rgba(16, 185, 129, 0.1)', fill: true, tension: 0.3 }, { label: 'Keluar', data: hO, borderColor: '#ef4444', backgroundColor: 'rgba(239, 68, 68, 0.1)', fill: true, tension: 0.3 }] }, options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: { x: { display: false }, y: { grid: { color: gridLineColor } } } } });
}

// ==========================================
// CSV EXPORT CUSTOM
// ==========================================
function openCustomCSVModal() {
    // Re-use CustomConfirm Pattern for CSV download
    openCustomConfirm("Unduh Laporan CSV", "Laporan riwayat transaksi dompet ini akan diunduh ke perangkat Anda.", () => {
        let csv = "Tanggal,Dompet,Tipe,Kategori,Keterangan,Pihak_Terkait,Nominal\n"; 
        
        // Use visible table data logic
        const fd = db.filter(tx => tx.wallet === activeWallet);
        if(fd.length === 0) { showToast("Data kosong.", "error"); return; }
        
        [...fd].sort((a,b) => new Date(a.date) - new Date(b.date)).forEach(row => { 
            let r = [formatDetailDate(row.date), row.wallet, row.type, row.category, row.desc, row.pihak_terkait||'-', row.amount]; 
            csv += r.map(v => `"${v}"`).join(",") + "\n"; 
        }); 
        
        const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' }); 
        const link = document.createElement("a"); link.href = URL.createObjectURL(blob); 
        link.download = `Laporan_TPA_${activeWallet.toUpperCase()}_${new Date().toISOString().split('T')[0]}.csv`; 
        document.body.appendChild(link); link.click(); document.body.removeChild(link); 
        showToast("CSV Berhasil Diunduh", "success"); 
    });
}

function openShareLinkModal() { openModal('shareLinkModal'); }
function copyPublicLink() {
    const input = document.getElementById('publicLinkInput'); input.select(); input.setSelectionRange(0, 99999); 
    try { navigator.clipboard.writeText(input.value); showToast("Tautan disalin!", "success"); } catch (err) { document.execCommand("copy"); showToast("Tautan disalin!", "success"); }
}
// ==========================================
// KODE PRODUKSI: TPA FINANCE 4.1 (LOGIKA PROFIL & AUTH)
// ==========================================

// Buka Profile Modal
function openProfileView() { 
    if (isPublicMode) { showToast("Akses ditolak di Mode Publik", "error"); return; }
    
    document.getElementById('viewProfileImg').src = profile.photo; 
    document.getElementById('viewProfileName').innerText = profile.name; 
    document.getElementById('viewJoinDate').innerText = "Bergabung: " + formatDetailDate(profile.joinDate).split(' - ')[0]; 
    
    const stat = document.getElementById('viewGoogleStatus'); 
    const btn = document.getElementById('btnGoogleLink'); 
    const btnText = document.getElementById('textGoogleLink'); 
    
    if(APP_MODE === 'CLOUD') { 
        stat.innerHTML = profile.googleEmail || (currentUser ? currentUser.email : 'Cloud User'); 
        stat.style.color = 'var(--hijau)';
        btnText.innerText = "Logout"; 
        btn.style.borderColor = "var(--merah)"; btn.style.color = "var(--merah)"; 
        btn.onclick = () => { 
            openCustomConfirm("Logout Akun", "Logout ke mode Guest? Data Cloud tetap aman di server.", async () => { 
                if(sbClient && navigator.onLine) { await sbClient.auth.signOut(); } 
                else { forceLogoutToGuest(); } 
            }); 
        };
    } else { 
        stat.innerText = "Offline Lokal"; 
        stat.style.color = "var(--merah)"; 
        btnText.innerText = "Login Cloud"; 
        btn.style.borderColor = "var(--biru)"; btn.style.color = "var(--biru)"; 
        btn.onclick = () => { 
            if(!navigator.onLine) { showToast("Koneksi Offline!", "error"); return; }
            if(sbClient) {
                sbClient.auth.signInWithOAuth({ provider: 'google', options: { redirectTo: window.location.origin + window.location.pathname } }); 
            }
        }; 
    } 
    openModal('profileViewModal'); 
}

function forceLogoutToGuest() {
    currentUser = null; APP_MODE = 'GUEST'; setLS('app_mode', 'GUEST');
    profile = { ...defaultProfile }; saveProfileLocal();
    removeLS('cloud_db'); db = loadLocalDB(); 
    initAppHeader(); switchWallet('utama'); 
    showToast("Berhasil Logout.", "success"); 
    closeModal('profileViewModal');
    updateNetworkBadge(navigator.onLine ? "Online (Guest)" : "Offline (Guest)", navigator.onLine ? "sync-online" : "sync-offline");
}

function initAppHeader() { 
    document.getElementById('headName').innerText = profile.name; 
    document.getElementById('headProfileImg').src = profile.photo; 
}

// ==========================================
// PIN & PROFIL EDIT ENGINE
// ==========================================
function requestProfileEdit() { 
    if(profile.pin && profile.pin !== '') { 
        promptActionPin('edit_profile');
    } else { 
        openProfileEdit(); 
    } 
}

function initResetSequence() { 
    if (!profile.pin || profile.pin.trim() === '') { 
        showToast("Buat PIN di Edit Profil terlebih dahulu.", "error"); return; 
    } 
    promptActionPin('factory_reset');
}

// Universal PIN Prompt (Menerima parameter target aksi)
function promptActionPin(targetAction) {
    closeModal('profileViewModal');
    document.getElementById('authPinTargetAction').value = targetAction;
    document.getElementById('inputAuthPin').value = '';
    openModal('pinAuthModal');
    setTimeout(() => document.getElementById('inputAuthPin').focus(), 300);
}

async function verifyPinAuth() { 
    const inputVal = document.getElementById('inputAuthPin').value; 
    const targetAction = document.getElementById('authPinTargetAction').value;
    const hashedInput = await hashPIN(inputVal); 
    
    if (hashedInput === profile.pin) { 
        closeModal('pinAuthModal');
        if (targetAction === 'edit_profile') { 
            openProfileEdit(); 
        } else if (targetAction === 'factory_reset') { 
            openCustomConfirm("PERINGATAN FATAL", "Seluruh data transaksi dan kas akan <b>dihapus permanen</b>. Tindakan ini tidak dapat dibatalkan!", executeFactoryReset);
        }
    } else { 
        showToast("PIN Keamanan Salah!", "error"); 
    } 
}

function openProfileEdit() { 
    closeModal('profileViewModal');
    document.getElementById('editProfileImg').src = profile.photo; 
    document.getElementById('editName').value = profile.name !== 'Pengurus' ? profile.name : ''; 
    document.getElementById('editPin').value = ''; 
    openModal('profileEditModal'); 
}

document.getElementById('profileUploader').addEventListener('change', async function(e) { 
    const f = e.target.files[0]; if(!f) return; 
    showToast("Memproses foto...", "sync"); 
    const reader = new FileReader(); 
    reader.onload = function(evt) { 
        const img = new Image(); 
        img.onload = async function() { 
            const canvas = document.createElement('canvas'); 
            const MAX = 400; let w = img.width, h = img.height; 
            if (w > h) { if (w > MAX) { h *= MAX / w; w = MAX; } } 
            else { if (h > MAX) { w *= MAX / h; h = MAX; } } 
            canvas.width = w; canvas.height = h; 
            const ctx = canvas.getContext('2d'); ctx.drawImage(img, 0, 0, w, h); 
            profile.photo = canvas.toDataURL('image/jpeg', 0.6); 
            document.getElementById('editProfileImg').src = profile.photo; 
            saveProfileLocal(); 
            showToast("Foto siap disimpan.", "success");
        }; 
        img.src = evt.target.result; 
    }; 
    reader.readAsDataURL(f); 
});

async function saveProfileData() { 
    const nName = document.getElementById('editName').value.trim();
    profile.name = nName ? nName.toLowerCase().replace(/\b\w/g, c => c.toUpperCase()) : 'Pengurus'; 
    
    const rawPin = document.getElementById('editPin').value; 
    if (rawPin && rawPin.trim() !== '') { 
        if(rawPin.length < 4) { showToast("PIN minimal 4 digit", "error"); return; }
        profile.pin = await hashPIN(rawPin); 
    } 
    
    saveProfileLocal(); 
    initAppHeader(); 
    closeModal('profileEditModal'); 
    showToast("Profil Berhasil Disimpan", "success"); 
    
    if (APP_MODE === 'CLOUD' && currentUser && currentUser.id !== 'offline_user' && navigator.onLine && sbClient) {
        sbClient.from('profiles').upsert({ id: currentUser.id, data: profile }).then();
    }
}

async function executeFactoryReset() { 
    showToast("Memulai format sistem...", "sync"); 
    db = []; sppData = []; 
    removeLS('cloud_db'); removeLS('guest_db'); removeLS('spp_data_v4');
    try { 
        if (APP_MODE === 'CLOUD' && currentUser && currentUser.id !== 'offline_user' && navigator.onLine && sbClient) { 
            await sbClient.from('transactions').delete().eq('user_id', currentUser.id); 
            await sbClient.from('spp_data').delete().eq('user_id', currentUser.id); 
        } 
        showToast("Database musnah secara absolut.", "success"); 
    } catch (e) { showToast("Direset di tingkat Lokal.", "error"); } 
    updateUI(); 
}

// ==========================================
// EMAILJS OTP (LUPA PIN)
// ==========================================
let generatedOTP = "";
let otpExpiryTime = 0;

function startOTPResetProcess() { 
    closeModal('pinAuthModal'); 
    if(!profile.googleLinked || !profile.googleEmail) { 
        showToast("Akun belum terhubung ke Google Cloud!", "error"); return; 
    } 
    if(!navigator.onLine) { 
        showToast("Butuh koneksi internet untuk OTP!", "error"); return; 
    } 
    document.getElementById('displayUserEmail').innerText = profile.googleEmail; 
    openModal('otpRequestModal'); 
}

function sendOTPEmail() { 
    if(!navigator.onLine) { showToast("Koneksi terputus!", "error"); return; } 
    if(typeof emailjs === 'undefined') { showToast("Library Email gagal dimuat.", "error"); return; }
    
    const btn = document.getElementById('btnSendOTP'); 
    btn.innerText = "Mengirim..."; btn.disabled = true; 
    
    generatedOTP = Math.floor(100000 + Math.random() * 900000).toString(); 
    otpExpiryTime = Date.now() + (5 * 60 * 1000); // 5 Menit kedaluwarsa
    
    // Ganti dengan Service ID dan Template ID EmailJS Anda yang valid
    const templateParams = { 
        to_email: profile.googleEmail, 
        to_name: profile.name, 
        otp_code: generatedOTP 
    }; 
    
    // Initialize EmailJS public key jika belum
    // emailjs.init("YOUR_PUBLIC_KEY");
    
    emailjs.send('service_4v89q7h', 'template_w9fgvcf', templateParams)
    .then(function() { 
        showToast("OTP Terkirim ke Email Anda!"); 
        closeModal('otpRequestModal'); 
        document.getElementById('inputOTP').value = ''; 
        document.getElementById('inputNewPinOTP').value = ''; 
        openModal('otpVerifyModal'); 
        btn.innerText = "Kirim Kode OTP"; btn.disabled = false; 
    }, function(e) { 
        showToast("Gagal mengirim Email. Coba lagi.", "error"); 
        btn.innerText = "Kirim Kode OTP"; btn.disabled = false; 
    }); 
}

async function verifyOTPAndSavePin() { 
    const inputCode = document.getElementById('inputOTP').value; 
    const newPin = document.getElementById('inputNewPinOTP').value; 
    
    if(Date.now() > otpExpiryTime) { showToast("Kode OTP Kadaluarsa!", "error"); return; } 
    if(inputCode !== generatedOTP) { showToast("Kode OTP Salah!", "error"); return; } 
    if(newPin.length < 4) { showToast("PIN Baru minimal 4 digit!", "error"); return; } 
    
    profile.pin = await hashPIN(newPin); 
    saveProfileLocal(); 
    
    if (APP_MODE === 'CLOUD' && currentUser && currentUser.id !== 'offline_user' && navigator.onLine && sbClient) {
        sbClient.from('profiles').upsert({ id: currentUser.id, data: profile }).then();
    }
    
    generatedOTP = ""; 
    closeModal('otpVerifyModal'); 
    showToast("PIN Keamanan berhasil direset!", "success"); 
}

// ==========================================
// SERVICE WORKER & OFFLINE PWA CAPABILITY
// ==========================================
if ('serviceWorker' in navigator) { 
    window.addEventListener('load', async () => { 
        navigator.serviceWorker.register('./sw.js').then(reg => { 
            reg.addEventListener('updatefound', () => { 
                const newWorker = reg.installing; 
                newWorker.addEventListener('statechange', () => { 
                    if (newWorker.state === 'installed' && navigator.serviceWorker.controller) { 
                        const updateScreen = document.getElementById('updateScreen'); 
                        if (updateScreen) { updateScreen.style.display = 'flex'; } 
                        setTimeout(() => window.location.reload(true), 1500); 
                    } 
                }); 
            }); 
        }); 
    }); 
    let refreshing = false; 
    navigator.serviceWorker.addEventListener('controllerchange', () => { 
        if (!refreshing) { refreshing = true; window.location.reload(true); } 
    }); 
}

// Re-render chart on tab switch to prevent compression bugs
document.addEventListener("visibilitychange", () => { 
    if (document.visibilityState === "visible") { 
        setTimeout(() => { 
            if (typeof Chart !== 'undefined') { 
                for (let id in Chart.instances) { 
                    Chart.instances[id].resize(); Chart.instances[id].update(); 
                } 
            } 
        }, 300); 
    } 
});
