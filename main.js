// main.js
// ==========================================
// TPA FINANCE MIGRATION & NAMESPACE ISOLATION
// ==========================================
const APP_VERSION = '1.6'; 
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
// KONFIGURASI SUPABASE BARU
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

const defaultProfile = { 
    name: 'Pengurus', photo: 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAyNCAyNCIgZmlsbD0iIzEwYjk4MSI+PHBhdGggZD0iTTEyIDJhNSA1IDAgMSAwIDUgNSBNMTIgMTRhNyA3IDAgMCAwLTcgN3YxSDE5di0xYTcgNyAwIDAgMC03LTdaIi8+PC9zdmc+', 
    joinDate: new Date().toISOString(), googleLinked: false, googleEmail: ''
};

let profile = JSON.parse(getLS('profile_secure'));
if (!profile) { profile = { ...defaultProfile }; setLS('profile_secure', JSON.stringify(profile)); }

// ==========================================
// SVGs & KATEGORI KHUSUS TPA
// ==========================================
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
    keluar: ['Honor Guru', 'ATK', 'Al-Qur\'an', 'Buku Iqra', 'Snack Kegiatan', 'Listrik', 'Air', 'Kebersihan', 'Perbaikan Bangunan', 'Kegiatan Santri', 'Transportasi', 'Lainnya'] 
};

function getDynamicColor(categoryStr, type) {
    if (type === 'keluar') return '#ef4444';
    const inColors = { 'Wakaf': '#a855f7', 'Infak Santri': '#10b981', 'Donasi Masyarakat': '#3b82f6', 'Bantuan Pemerintah': '#f59e0b' };
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

// ==========================================
// BOOT & SYNC ENGINE
// ==========================================
function bootApp() {
    renderShortcuts();
    db = loadLocalDB(); 
    document.getElementById('headName').innerText = profile.name;
    document.getElementById('headProfileImg').src = profile.photo;
    updateUI('');
    setTimeout(initSupabaseBackground, 500);
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
            } else {
                APP_MODE = 'GUEST'; setLS('app_mode', 'GUEST');
            }
        } catch(err) {
            if(netStatus) { netStatus.innerText = "Server Lambat (Mode Lokal)"; netStatus.className = "status-sync sync-offline"; }
        }
    }

    if (!window.supabaseListenerAdded) {
        window.supabaseListenerAdded = true;
        sbClient.auth.onAuthStateChange(async (event, currentSession) => {
            if (event === 'SIGNED_OUT') {
                currentUser = null; APP_MODE = 'GUEST'; setLS('app_mode', 'GUEST'); profile = { ...defaultProfile }; setLS('profile_secure', JSON.stringify(profile)); db = []; saveLocalDB(db); updateUI('');
            } else if (event === 'SIGNED_IN' && currentSession) {
                currentUser = currentSession.user; APP_MODE = 'CLOUD'; setLS('app_mode', 'CLOUD');
                if(netStatus) { netStatus.innerText = "Online Mode (Cloud)"; netStatus.className = "status-sync sync-online"; }
                profile.googleLinked = true; profile.googleEmail = currentUser.email; setLS('profile_secure', JSON.stringify(profile));
                db = loadLocalDB(); fetchUserTransactions(); setupRealtime(); closeModal('googleAuthModal');
                if (navigator.onLine && pendingSync.length > 0) processPendingSync();
            }
        });
    }
}

async function fetchUserTransactions() {
    if (APP_MODE !== 'CLOUD' || !currentUser || !sbClient) return;
    try {
        const { data, error } = await sbClient.from('transactions').select('*').eq('user_id', currentUser.id).order('date', { ascending: true });
        if (error) throw error;
        db = data; saveLocalDB(db); updateUI(document.getElementById('searchTxInput').value);
    } catch (error) { console.warn("Fetch lambat."); }
}

function setupRealtime() {
    if (APP_MODE !== 'CLOUD' || !currentUser || !sbClient) return;
    if (realTimeSubscription) sbClient.removeChannel(realTimeSubscription);
    realTimeSubscription = sbClient.channel('custom-tpa-channel')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'transactions', filter: `user_id=eq.${currentUser.id}` }, payload => { fetchUserTransactions(); }).subscribe();
}

async function processPendingSync() {
    if (!navigator.onLine || APP_MODE !== 'CLOUD' || !currentUser || !sbClient || pendingSync.length === 0) return;
    try {
        const payload = pendingSync.map(t => { let newData = { ...t, user_id: currentUser.id }; if(String(newData.id).length > 10) delete newData.id; return newData; });
        const { error } = await sbClient.from('transactions').insert(payload);
        if (error) throw error;
        pendingSync = []; setLS('pending_sync', JSON.stringify(pendingSync));
        fetchUserTransactions();
    } catch (error) { console.warn("Gagal Auto-Sync"); }
}

// ==========================================
// UTILITY SAKTI
// ==========================================
function formatRp(num) { return new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', minimumFractionDigits: 0 }).format(num); }
function formatRpPendek(num) { let str = formatRp(num); return str.replace(/\.000$/, '...'); }
function formatDetailDate(iso) { if(!iso) return '-'; const d = new Date(iso); return `${String(d.getDate()).padStart(2,'0')}/${String(d.getMonth()+1).padStart(2,'0')}/${d.getFullYear()} - ${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`; }

function showToast(msg, type = 'success') { 
    const box = document.getElementById('toastBox'); 
    if(!box) return; 
    const t = document.createElement('div'); t.className = `toast ${type}`; t.innerHTML = msg; box.appendChild(t); 
    setTimeout(() => t.classList.add('show'), 10); setTimeout(() => { t.classList.remove('show'); setTimeout(() => t.remove(), 400); }, 3500); 
}
function closeModal(id) { if(id) { const el = document.getElementById(id); if(el) el.classList.remove('active'); } document.querySelectorAll('.custom-options.open').forEach(e => e.classList.remove('open')); }
function toggleCustomSelect(id) { const box = document.getElementById(id); const isOpen = box.classList.contains('open'); document.querySelectorAll('.custom-options.open').forEach(el => el.classList.remove('open')); if(!isOpen) box.classList.add('open'); }
function toggleSection(sec, icn) { document.getElementById(sec).classList.toggle('hidden'); document.getElementById(icn).classList.toggle('rotated'); }
function switchWallet(type) { 
    activeWallet = type; 
    document.getElementById('walletSwitchContainer').setAttribute('data-active', type); 
    document.querySelectorAll('.btn-tab').forEach(b => b.classList.remove('active'));
    document.getElementById(`tab-${type}`).classList.add('active');
    renderShortcuts(); updateUI(document.getElementById('searchTxInput').value); 
}
function applyTimeFilter(days, labelText) { currentTimeFilter = days; document.getElementById('dispTimeFilter').innerText = labelText; closeModal(''); updateUI(document.getElementById('searchTxInput').value); }
function selectCategory(val) { document.getElementById('tx-category').value = val; document.getElementById('dispTxCat').innerText = val; closeModal(''); }

// ==========================================
// UI & INPUT LOGIC
// ==========================================
function renderShortcuts() { 
    const c = document.getElementById('quickActionsContainer'); 
    c.className = 'quick-actions-wrap grid-mode grid-split-4'; 
    if(activeWallet === 'tunai' || activeWallet === 'rekening') {
        c.innerHTML = ` 
            <button class="btn-quick glow-hijau" onclick="quickInput('masuk', 'Infak Santri', '')">${svgs.uang} <span>Infak Santri</span></button> 
            <button class="btn-quick glow-biru" onclick="quickInput('masuk', 'Donasi Masyarakat', '')">${svgs.user} <span>Donasi Umum</span></button> 
            <button class="btn-quick glow-merah" onclick="quickInput('keluar', 'Honor Guru', '')">${svgs.makan} <span>Honor Guru</span></button> 
            <button class="btn-quick glow-kuning" onclick="quickInput('keluar', 'ATK', '')">${svgs.book} <span>Beli ATK</span></button> 
        `;
    } else if(activeWallet === 'wakaf') {
        c.innerHTML = `
            <button class="btn-quick glow-hijau" onclick="quickInput('masuk', 'Wakaf', 'Penerimaan Wakaf')">${svgs.uang} <span>Terima Wakaf</span></button> 
            <button class="btn-quick glow-merah" onclick="quickInput('keluar', 'Perbaikan Bangunan', 'Penggunaan Dana Wakaf')">${svgs.plus_bold} <span>Gunakan Wakaf</span></button>
        `;
    } else if(activeWallet === 'operasional') {
        c.innerHTML = `
            <button class="btn-quick glow-kuning" onclick="quickInput('keluar', 'Listrik', 'Bayar Listrik')">${svgs.minus_bold} <span>Bayar Listrik</span></button>
            <button class="btn-quick glow-kuning" onclick="quickInput('keluar', 'Air', 'Bayar Air')">${svgs.minus_bold} <span>Bayar Air</span></button>
        `;
    }
}

function quickInput(type, cat, desc) { 
    document.getElementById('tx-type').value = type; 
    document.getElementById('modal-title').innerText = type === 'masuk' ? 'Catat Pemasukan TPA' : 'Catat Pengeluaran TPA'; 
    document.getElementById('tx-desc').value = desc; 
    document.getElementById('tx-pihak-terkait').value = ''; 
    document.getElementById('tx-link-bukti').value = '';
    document.getElementById('tx-is-saving').value = 'false'; 
    
    document.getElementById('catSelectWrapper').style.display = 'block'; 
    document.getElementById('tx-category-manual').style.display = 'none'; 
    const box = document.getElementById('catOptionsBox'); 
    const arr = type === 'masuk' ? categories.masuk : categories.keluar; 
    box.innerHTML = arr.map(c => `<div class="custom-option" onclick="selectCategory('${c}')">${c}</div>`).join(''); 
    selectCategory(cat); 
    
    document.getElementById('tx-amount').value = ''; rawAmount = 0; 
    document.getElementById('txModal').classList.add('active'); 
    setTimeout(() => { document.getElementById('tx-amount').focus(); }, 300); 
}

document.getElementById('tx-amount').addEventListener('input', function() { 
    let v = this.value.replace(/[^0-9]/g, ''); 
    if(v === '') { rawAmount = 0; this.value = ''; return; } 
    rawAmount = parseInt(v, 10); this.value = rawAmount.toLocaleString('id-ID'); 
});

document.getElementById('btnExecuteTx').addEventListener('click', async () => { 
    if(rawAmount <= 0) { showToast("Nominal 0", "error"); return; } 
    if (document.getElementById('tx-is-saving').value === 'true') return; 
    document.getElementById('tx-is-saving').value = 'true'; 
    
    try {
        const type = document.getElementById('tx-type').value; 
        const cF = document.getElementById('tx-category').value; 
        const dF = document.getElementById('tx-desc').value.trim(); 
        const pihak = document.getElementById('tx-pihak-terkait').value.trim();
        const link = document.getElementById('tx-link-bukti').value.trim();
        
        if(!cF || !dF) { showToast("Isi Keterangan dengan lengkap", "error"); return; } 
        
        let tx = { wallet: activeWallet, type: type, category: cF, desc: dF, pihak_terkait: pihak, link_bukti: link, amount: rawAmount, date: new Date().toISOString() };
        
        if(APP_MODE === 'CLOUD' && navigator.onLine && sbClient) { 
            try { 
                let data = { ...tx, user_id: currentUser.id };
                const { error } = await sbClient.from('transactions').insert([data]); 
                if(error) throw error;
                await fetchUserTransactions(); 
                closeModal('txModal'); showToast("Tersimpan di Cloud", "success"); 
            } catch(e) { 
                tx.id = Date.now() + Math.random(); db.push(tx); pendingSync.push(tx); 
                setLS('pending_sync', JSON.stringify(pendingSync)); saveLocalDB(db); closeModal('txModal'); updateUI('');
                showToast("Jaringan lambat. Tersimpan Offline.", "syncing"); 
            }
        } else { 
            tx.id = Date.now() + Math.floor(Math.random() * 1000); db.push(tx); saveLocalDB(db); closeModal('txModal'); updateUI(''); 
            showToast("Disimpan di Lokal"); 
        }
    } finally { document.getElementById('tx-is-saving').value = 'false'; }
});

function updateUI(searchTerm = '') {
    const today = new Date(); today.setHours(0,0,0,0);
    const fd = db.filter(tx => { 
        if(tx.wallet !== activeWallet) return false; 
        if(currentTimeFilter !== 0) { const d = new Date(tx.date); d.setHours(0,0,0,0); if(Math.floor(Math.abs(today - d) / 86400000) > currentTimeFilter) return false; } 
        if(searchTerm) { return tx.desc.toLowerCase().includes(searchTerm) || tx.category.toLowerCase().includes(searchTerm) || (tx.pihak_terkait && tx.pihak_terkait.toLowerCase().includes(searchTerm)); } 
        return true; 
    });

    let m = 0, k = 0; fd.forEach(t => { if(t.type === 'masuk') m += t.amount; else k += t.amount; });
    
    document.getElementById('disp-saldo').setAttribute('data-full', formatRp(m - k)); document.getElementById('disp-saldo').setAttribute('data-short', formatRpPendek(m - k));
    document.getElementById('disp-masuk').setAttribute('data-full', formatRp(m)); document.getElementById('disp-masuk').setAttribute('data-short', formatRpPendek(m));
    document.getElementById('disp-keluar').setAttribute('data-full', formatRp(k)); document.getElementById('disp-keluar').setAttribute('data-short', formatRpPendek(k));
    
    // AI Insight (TPA Context)
    const aiText = document.getElementById('aiInsightText');
    if(m === 0 && k === 0) aiText.innerText = `Belum ada transaksi di dompet ${activeWallet}.`;
    else if(k > m) { aiText.innerText = `Peringatan: Pengeluaran dompet ${activeWallet} melebih pemasukan.`; document.getElementById('aiInsightBox').style.borderColor = 'var(--merah)'; }
    else aiText.innerText = `Status Keuangan Dompet ${activeWallet} sehat dan transparan.`;

    renderTable(fd); renderCharts(fd);
}

function renderTable(data) {
    const t = document.getElementById('table-body');
    if(data.length === 0) { t.innerHTML = `<tr><td colspan="5" style="text-align:center; padding: 30px; color:var(--text-muted);">Tidak ada transaksi.</td></tr>`; return; }
    
    let htmlStr = '';
    [...data].sort((a,b) => new Date(b.date) - new Date(a.date)).forEach(tx => {
        const iM = tx.type === 'masuk'; let c = getDynamicColor(tx.category, tx.type);
        let linkHtml = tx.link_bukti ? `<a href="${tx.link_bukti}" target="_blank" style="color:var(--biru); font-size:11px; text-decoration:underline;">[Lihat Bukti]</a>` : '';
        let pihakHtml = tx.pihak_terkait ? `<br><span style="font-size:11px; color:var(--text-muted);">Terkait: <b style="color:var(--kuning);">${tx.pihak_terkait}</b></span>` : '';
        
        let cr = `<div class="badge-wrapper"><div class="badge-cat" style="border: 1px solid ${c}; color:${c}; background:rgba(0,0,0,0.5);">${tx.category}</div></div>`;
        
        htmlStr += `<tr class="clickable-row">
            <td style="color:var(--text-muted); font-size:11px; vertical-align:middle;">${formatDetailDate(tx.date).split(' - ')[0]}<br>${formatDetailDate(tx.date).split(' - ')[1]}</td>
            <td class="col-category">${cr}</td>
            <td style="vertical-align:middle; width:100%;"><span style="font-weight:700;">${tx.desc}</span> ${linkHtml} ${pihakHtml}</td>
            <td style="vertical-align:middle; text-align:center;">
                <button type="button" style="background:rgba(239,68,68,0.15); color:var(--merah); border:1px solid var(--merah); width:32px; height:32px; border-radius:8px; cursor:pointer; display:flex; align-items:center; justify-content:center;" onclick="deleteTx('${tx.id || tx.date}')">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2-2v2"/></svg>
                </button>
            </td>
            <td class="amt-cell" style="vertical-align:middle; color:${iM?'var(--hijau)':'var(--merah)'};">${iM?'+':'-'}${formatRp(tx.amount)}</td>
        </tr>`;
    });
    t.innerHTML = htmlStr;
}

function renderCharts(data) {
    if (typeof Chart === 'undefined') return;
    Chart.defaults.color = '#64748b'; Chart.defaults.font.family = 'Inter';
    if(data.length === 0) { if(pieChart) pieChart.destroy(); if(barChart) barChart.destroy(); if(lineChart) lineChart.destroy(); return; }

    const cA = {}; data.forEach(t => { const k = `${t.category}`; if(cA[k]) cA[k].a += t.amount; else cA[k] = { a: t.amount, color: getDynamicColor(t.category, t.type) }; }); 
    const pL = Object.keys(cA);
    
    if(pieChart) pieChart.destroy(); 
    pieChart = new Chart(document.getElementById('pieChart'), { type: 'doughnut', data: { labels: pL, datasets: [{ data: pL.map(l => cA[l].a), backgroundColor: pL.map(l => cA[l].color), borderWidth: 4, borderColor: '#0a1510' }] }, options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } } } });

    const rT = [...data].sort((a,b) => new Date(a.date) - new Date(b.date)).slice(-15);
    if(barChart) barChart.destroy(); 
    barChart = new Chart(document.getElementById('barChart'), { type: 'bar', data: { labels: rT.map(t => t.desc.substring(0,8)), datasets: [{ data: rT.map(t => t.type === 'masuk' ? t.amount : -t.amount), backgroundColor: rT.map(t => getDynamicColor(t.category, t.type)), borderRadius: 4 }] }, options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } } } });

    let cI = 0, cO = 0, hI = [], hO = []; 
    [...data].sort((a,b)=> new Date(a.date)-new Date(b.date)).forEach(t => { if(t.type === 'masuk') cI += t.amount; else cO += t.amount; hI.push(cI); hO.push(cO); });
    if(lineChart) lineChart.destroy(); 
    lineChart = new Chart(document.getElementById('lineChart'), { type: 'line', data: { labels: hI.map((_,i)=> `T${i+1}`), datasets: [{ label: 'Pemasukan Total', data: hI, borderColor: '#10b981', backgroundColor: 'rgba(16, 185, 129, 0.1)', fill: true, tension: 0.3 }, { label: 'Pengeluaran Total', data: hO, borderColor: '#ef4444', backgroundColor: 'rgba(239, 68, 68, 0.1)', fill: true, tension: 0.3 }] }, options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } } } });
}

// ==========================================
// PENGHAPUSAN, EXPORT & EVENT LISTENER
// ==========================================
let deleteTxId = null;
function deleteTx(id) { deleteTxId = id; document.getElementById('confirmTitle').innerText = 'Hapus Transaksi'; document.getElementById('confirmDesc').innerText = 'Arsip transaksi akan hilang permanen.'; document.getElementById('confirmModal').classList.add('active'); }
document.getElementById('btnConfirmYes').addEventListener('click', async () => {
    if(!deleteTxId) return;
    const idx = db.findIndex(t => String(t.id) === deleteTxId || String(t.date) === deleteTxId);
    if (idx > -1) {
        const delTx = db[idx]; db.splice(idx, 1);
        if (APP_MODE === 'CLOUD' && navigator.onLine && sbClient && delTx.id) {
            try { await sbClient.from('transactions').delete().eq('id', delTx.id); } catch(e) { }
        }
        saveLocalDB(db); updateUI(document.getElementById('searchTxInput').value); showToast("Dihapus", "success");
    }
    closeModal('confirmModal');
});

function openCSVModal() { document.getElementById('csvExportModal').classList.add('active'); }
function executeCSVExport() {
    closeModal('csvExportModal'); let csv = "Tanggal,Dompet,Tipe,Kategori,Deskripsi,Pihak_Terkait,Link_Bukti,Nominal\n"; 
    const fd = db.filter(tx => tx.wallet === activeWallet);
    fd.sort((a,b) => new Date(a.date) - new Date(b.date)).forEach(row => { let r = [formatDetailDate(row.date), row.wallet, row.type, row.category, row.desc, row.pihak_terkait||'-', row.link_bukti||'-', row.amount]; csv += r.map(v => `"${v}"`).join(",") + "\n"; }); 
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' }); const link = document.createElement("a"); link.href = URL.createObjectURL(blob); link.download = `Laporan_TPA_${activeWallet.toUpperCase()}.csv`; 
    document.body.appendChild(link); link.click(); document.body.removeChild(link); showToast("Laporan Diunduh"); 
}

const searchInput = document.getElementById('searchTxInput');
if(searchInput) { searchInput.addEventListener('input', function(e) { let val = e.target.value.toLowerCase(); document.getElementById('searchClearBtn').style.display = val.length > 0 ? 'block' : 'none'; updateUI(val); }); }
function clearSearch() { searchInput.value = ''; document.getElementById('searchClearBtn').style.display = 'none'; updateUI(''); }

function openGoogleAuthModal() { document.getElementById('googleAuthModal').classList.add('active'); }
document.getElementById('btnRealGoogleLogin').addEventListener('click', async () => { 
    if(!sbClient || !navigator.onLine) { showToast("Mode Offline.", "error"); return; }
    const { error } = await sbClient.auth.signInWithOAuth({ provider: 'google', options: { redirectTo: window.location.origin + window.location.pathname } }); 
});

window.addEventListener('load', bootApp);
