const APP_VERSION = '1.5; 
let sbClient = null;
let db = []; 
let currentUser = null; 
let APP_MODE = localStorage.getItem('tpa_app_mode') || 'GUEST';

// KREDENSIAL SUPABASE ANDA WAJIB DIISI DI SINI
const SUPABASE_URL = 'https://ndsyyaxmiwskrkklseap.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5kc3l5YXhtaXdza3Jra2xzZWFwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODUxNDU4NjIsImV4cCI6MjEwMDcyMTg2Mn0.uXgAIhUjjkNpe9s6N6LGvRXZLUDQUZJrSfUFf1BDmKU';

let activeWallet = 'operasional'; 
let currentTimeFilter = 30; 
let rawAmount = 0;
let pieChart, lineChart; 
let aiMessages = []; 
let aiCurrentMsgIdx = 0; 
let aiCarouselInterval = null; 

let profile = JSON.parse(localStorage.getItem('tpa_profile')) || { name: 'Admin TPA' };

const svgs = {
    uang: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="2" y="6" width="20" height="12" rx="2"/><circle cx="12" cy="12" r="2"/></svg>`,
    plus: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>`,
    minus_bold: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><line x1="5" y1="12" x2="19" y2="12"></line></svg>`,
    transport: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg>`
};

// KATEGORI TPA
const categories = { 
    masuk: ['Infak Santri', 'Infak Jumat', 'Donasi Masyarakat', 'Wakaf', 'Bantuan Pemerintah', 'Bantuan Masjid', 'Hibah', 'Donatur Tetap', 'Lainnya'], 
    keluar: ['Honor Guru', 'ATK', 'Al-Qur\'an', 'Buku Iqra\'', 'Snack Kegiatan', 'Listrik', 'Air', 'Kebersihan', 'Perbaikan Bangunan', 'Kegiatan Santri', 'Transportasi', 'Lainnya'] 
};

function getDynamicColor(cat, type) {
    if (type === 'keluar') return '#ef4444';
    const inColors = { 'Wakaf': '#f59e0b', 'Donatur Tetap': '#0ea5e9', 'Infak Santri': '#10b981' };
    return inColors[cat] || '#8b5cf6';
}

function saveLocalDB(data) { localStorage.setItem('tpa_db', JSON.stringify(data)); }
function loadLocalDB() { return JSON.parse(localStorage.getItem('tpa_db')) || []; }
function formatRp(num) { return new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', minimumFractionDigits: 0 }).format(num); }
function formatRpPendek(num) { let str = formatRp(num); return str.replace(/\.000$/, 'k'); }
function properTitleCase(str) { return str ? str.toLowerCase().replace(/\b\w/g, c => c.toUpperCase()) : ""; }

function showToast(msg, type = 'success') { 
    const box = document.getElementById('toastBox'); 
    if(!box) return; 
    const t = document.createElement('div'); 
    t.className = `toast ${type}`; 
    t.innerHTML = msg; 
    box.appendChild(t); 
    setTimeout(() => t.classList.add('show'), 10); 
    setTimeout(() => { t.classList.remove('show'); setTimeout(() => t.remove(), 400); }, 3500); 
}

function bootApp() {
    db = loadLocalDB(); 
    document.getElementById('headName').innerText = profile.name;
    renderShortcuts(); 
    updateUI('');
    setTimeout(initSupabaseBackground, 500);
}

async function initSupabaseBackground() {
    if (!window.supabase || SUPABASE_URL.includes('ISI_DENGAN')) return;
    if (!sbClient) sbClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
    
    sbClient.auth.onAuthStateChange(async (event, session) => {
        if (event === 'SIGNED_IN' && session) {
            currentUser = session.user; 
            APP_MODE = 'CLOUD'; localStorage.setItem('tpa_app_mode', 'CLOUD');
            const netStat = document.getElementById('networkStatus');
            netStat.innerText = "Online (Cloud)"; netStat.className = "status-sync sync-online";
            fetchUserTransactions();
            closeModal('googleAuthModal');
        } else if (event === 'SIGNED_OUT') {
            APP_MODE = 'GUEST'; localStorage.setItem('tpa_app_mode', 'GUEST');
            currentUser = null; db = []; saveLocalDB(db); updateUI('');
            const netStat = document.getElementById('networkStatus');
            netStat.innerText = "Offline Mode"; netStat.className = "status-sync sync-offline";
        }
    });
}

async function fetchUserTransactions() {
    if (APP_MODE !== 'CLOUD' || !currentUser || !sbClient) return;
    try {
        const { data, error } = await sbClient.from('transactions').select('*').eq('user_id', currentUser.id);
        if (error) throw error;
        db = data; saveLocalDB(db); updateUI('');
    } catch (e) { showToast("Gagal fetch data cloud", "error"); }
}

function switchWallet(type) { 
    activeWallet = type; 
    document.getElementById('walletSwitchContainer').setAttribute('data-active', type); 
    renderShortcuts(); updateUI(''); 
}

function renderShortcuts() { 
    const c = document.getElementById('quickActionsContainer'); 
    if(activeWallet === 'operasional') { 
        c.className = 'quick-actions-wrap grid-mode'; 
        c.innerHTML = ` 
            <button class="btn-quick glow-hijau" onclick="quickInput('masuk', 'Infak Santri', '', true)"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg> <span>Infak Santri</span></button> 
            <button class="btn-quick glow-biru" onclick="quickInput('masuk', 'Donatur Tetap', '', true)"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="2" y="6" width="20" height="12" rx="2"/><circle cx="12" cy="12" r="2"/></svg> <span>Donatur</span></button> 
            <button class="btn-quick glow-merah" onclick="quickInput('keluar', 'Honor Guru', '', true)"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><line x1="5" y1="12" x2="19" y2="12"></line></svg> <span>Honor Guru</span></button> 
            <button class="btn-quick glow-kuning" onclick="quickInput('keluar', 'Kegiatan Santri', '')"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg> <span>Kegiatan</span></button> 
        `; 
    } else { 
        c.className = 'quick-actions-wrap grid-mode'; 
        c.innerHTML = ` 
            <button class="btn-quick glow-hijau" onclick="quickInput('masuk', 'Wakaf', '', true)"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="2" y="6" width="20" height="12" rx="2"/><circle cx="12" cy="12" r="2"/></svg> <span>Terima Wakaf</span></button> 
            <button class="btn-quick glow-merah" onclick="quickInput('keluar', 'Perbaikan Bangunan', '')"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><line x1="5" y1="12" x2="19" y2="12"></line></svg> <span>Pembangunan</span></button> 
            <button class="btn-quick glow-biru" onclick="quickInput('masuk', 'Hibah', '', true)"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg> <span>Dana Khusus</span></button> 
            <button class="btn-quick glow-kuning" onclick="quickInput('keluar', 'Lainnya', '')"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><line x1="5" y1="12" x2="19" y2="12"></line></svg> <span>Pengeluaran</span></button> 
        `; 
    } 
}

// LOGIKA UI DOM (EVENT CLICK FIX)
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

function selectCategory(cat) { 
    document.getElementById('tx-category').value = cat; 
    document.getElementById('dispTxCat').innerText = cat; 
    closeModal(''); 
}

function closeModal(id) { 
    if(id) {
        const el = document.getElementById(id); 
        if(el) el.classList.remove('active'); 
    }
    document.querySelectorAll('.custom-options.open').forEach(e => e.classList.remove('open')); 
}

function toggleExpandStat(el, id) { 
    const items = document.getElementById(id).children; 
    if (el.classList.contains('expanded')) { 
        for(let i of items) i.className = 'expand-item'; 
    } else { 
        for(let i of items) i.className = (i === el) ? 'expand-item expanded' : 'expand-item collapsed'; 
    } 
} 

function expandChart(el, id) { 
    if(!el.classList.contains('expanded')) { 
        for(let i of document.getElementById(id).children) i.className = (i === el) ? 'expand-item expanded' : 'expand-item collapsed'; 
        setTimeout(() => { if(pieChart) pieChart.resize(); if(lineChart) lineChart.resize(); }, 100); 
    } 
} 

function closeChart(e, btn) { 
    e.stopPropagation(); 
    for(let i of btn.closest('.expand-container').children) i.className = 'expand-item'; 
    setTimeout(() => { if(pieChart) pieChart.resize(); if(lineChart) lineChart.resize(); }, 100); 
}

function toggleSection(sec, icn) { 
    document.getElementById(sec).classList.toggle('hidden'); 
    document.getElementById(icn).classList.toggle('rotated'); 
}

function openProfileView() { document.getElementById('profileViewModal').classList.add('active'); }
function openCSVModal() { document.getElementById('csvExportModal').classList.add('active'); }

// INPUT LOGIC (PENGGUNAAN LINK DRIVE BUKAN UPLOAD FILE)
function quickInput(type, cat, desc, reqEntity = false) { 
    document.getElementById('tx-type').value = type; 
    document.getElementById('modal-title').innerText = type === 'masuk' ? 'Catat Pemasukan TPA' : 'Catat Pengeluaran TPA'; 
    document.getElementById('tx-desc').value = desc; 
    document.getElementById('tx-entity').value = ''; 
    document.getElementById('tx-drive').value = '';
    
    document.getElementById('catSelectWrapper').style.display = 'block'; 
    const box = document.getElementById('catOptionsBox'); 
    const arr = type === 'masuk' ? categories.masuk : categories.keluar; 
    box.innerHTML = arr.map(c => `<div class="custom-option" onclick="selectCategory('${c}')">${c}</div>`).join(''); 
    selectCategory(cat !== 'MANUAL' ? cat : arr[0]);

    const bw = document.getElementById('borrowerWrapper'); 
    if(reqEntity) { 
        bw.style.display = 'block'; 
        document.getElementById('label-entity').innerText = type === 'masuk' ? 'Nama Donatur / Sumber' : 'Nama Penerima / Guru';
    } else { bw.style.display = 'none'; } 
    
    document.getElementById('tx-amount').value = ''; rawAmount = 0; 
    document.getElementById('txModal').classList.add('active'); 
}

document.getElementById('tx-amount').addEventListener('input', function() { 
    let v = this.value.replace(/[^0-9]/g, ''); 
    rawAmount = v ? parseInt(v, 10) : 0; 
    this.value = rawAmount ? rawAmount.toLocaleString('id-ID') : ''; 
});

document.getElementById('btnExecuteTx').addEventListener('click', async () => { 
    if(rawAmount <= 0) return showToast("Nominal tidak valid", "error"); 
    const btn = document.getElementById('btnExecuteTx');
    btn.innerText = "Memproses..."; btn.disabled = true;

    try {
        const type = document.getElementById('tx-type').value; 
        const cF = document.getElementById('tx-category').value; 
        const dF = properTitleCase(document.getElementById('tx-desc').value.trim()) || '-'; 
        const ent = document.getElementById('borrowerWrapper').style.display === 'block' ? properTitleCase(document.getElementById('tx-entity').value.trim()) : ''; 
        const driveLink = document.getElementById('tx-drive').value.trim();

        const txData = { wallet: activeWallet, type, category: cF, desc: dF, entity: ent, amount: rawAmount, receipt_url: driveLink || null, date: new Date().toISOString() };

        if (APP_MODE === 'CLOUD' && sbClient) { 
            txData.user_id = currentUser.id;
            await sbClient.from('transactions').insert([txData]); 
            await fetchUserTransactions(); 
            showToast("Berhasil Disimpan ke Cloud", "success");
        } else { 
            txData.id = Date.now(); db.push(txData); saveLocalDB(db); updateUI('');
            showToast("Berhasil Disimpan Lokal", "success");
        }
        closeModal('txModal'); 
    } finally {
        btn.innerText = "Simpan ke Buku Kas"; btn.disabled = false;
    }
});

const searchInput = document.getElementById('searchTxInput'); 
const searchClear = document.getElementById('searchClearBtn'); 
if(searchInput) {
    searchInput.addEventListener('input', function(e) { 
        let val = e.target.value.toLowerCase(); searchClear.style.display = val.length > 0 ? 'block' : 'none'; updateUI(val); 
    }); 
}
function clearSearch() { searchInput.value = ''; searchClear.style.display = 'none'; updateUI(''); }

function updateUI(searchTerm = '') {
    let tI = 0, tO = 0; 
    const today = new Date();
    
    const fd = db.filter(tx => { 
        if(tx.wallet !== activeWallet) return false; 
        if(currentTimeFilter !== 0) { 
            const d = new Date(tx.date); 
            if(Math.floor(Math.abs(today - d) / 86400000) > currentTimeFilter) return false; 
        } 
        if(searchTerm) return tx.desc.toLowerCase().includes(searchTerm) || (tx.entity && tx.entity.toLowerCase().includes(searchTerm)) || tx.category.toLowerCase().includes(searchTerm); 
        return true; 
    });

    fd.forEach(t => { if(t.type === 'masuk') tI += t.amount; else tO += t.amount; });
    
    let balance = tI - tO;
    document.getElementById('disp-saldo').setAttribute('data-short', formatRpPendek(balance));
    document.getElementById('disp-saldo').setAttribute('data-full', formatRp(balance));
    document.getElementById('disp-masuk').setAttribute('data-short', formatRpPendek(tI));
    document.getElementById('disp-masuk').setAttribute('data-full', formatRp(tI));
    document.getElementById('disp-keluar').setAttribute('data-short', formatRpPendek(tO));
    document.getElementById('disp-keluar').setAttribute('data-full', formatRp(tO));
    
    const badge = document.getElementById('healthBadge'); const text = document.getElementById('healthText');
    badge.className = 'health-badge';
    if (tI === 0 && tO === 0) { badge.classList.add('health-netral'); text.innerText = 'Netral'; } 
    else if (balance < 0) { badge.classList.add('health-defisit'); text.innerText = 'Defisit'; } 
    else if (balance >= 0 && balance <= 50000) { badge.classList.add('health-kritis'); text.innerText = 'Kritis'; } 
    else { if (tO > (tI * 0.8)) { badge.classList.add('health-waspada'); text.innerText = 'Waspada'; } else { badge.classList.add('health-sehat'); text.innerText = 'Aman'; } }
    
    generateAIForecast(fd); renderTable(fd); renderCharts(fd);
}

function generateAIForecast(data) { 
    const textEl = document.getElementById('aiInsightText'); aiMessages = []; 
    if (data.length === 0) {
        aiMessages.push("Belum ada pencatatan kas. Mulai catat transaksi pertama TPA.");
    } else if (activeWallet === 'operasional') {
        let outHonor = data.filter(t => t.category === 'Honor Guru').reduce((a,b)=>a+b.amount,0);
        aiMessages.push("Transparansi adalah kunci. Sematkan Link Google Drive untuk arsip nota.");
        if(outHonor === 0 && data.length > 5) aiMessages.push("⚠️ Anggaran Honor Guru belum tercatat bulan ini. Jangan terlewat!");
    } else {
        aiMessages.push("Peringatan: Dana Wakaf dilarang keras digunakan untuk konsumsi operasional harian TPA.");
    }
    
    if (aiCarouselInterval) clearInterval(aiCarouselInterval); 
    aiCurrentMsgIdx = 0; textEl.innerText = aiMessages[0]; 
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

function renderTable(data) {
    const t = document.getElementById('table-body');
    if(data.length === 0) { t.innerHTML = `<tr><td colspan="5" style="text-align:center; color:var(--text-muted);">Tidak ada transaksi.</td></tr>`; return; }
    
    let htmlStr = '';
    [...data].sort((a,b) => new Date(b.date) - new Date(a.date)).forEach(tx => {
        let c = getDynamicColor(tx.category, tx.type);
        let dr = `<span style="font-weight:700;">${tx.desc}</span>`;
        if(tx.entity) dr += `<br><span style="font-size:11px; color:var(--kuning);">Pihak: <b>${tx.entity}</b></span>`;
        if(tx.receipt_url) dr += `<br><a href="${tx.receipt_url}" target="_blank" style="font-size:10px; color:var(--biru); text-decoration:underline;">Lihat Arsip/Nota (Drive)</a>`;
        
        let cr = `<div class="badge-cat" style="border:1px solid ${c}; color:${c}; background:rgba(0,0,0,0.3);">${tx.category}</div>`;
        
        htmlStr += `<tr>
            <td style="font-size:11px; color:var(--text-muted);">${new Date(tx.date).toLocaleDateString('id-ID')}<br>${new Date(tx.date).toLocaleTimeString('id-ID').slice(0,5)}</td>
            <td style="width:1%; padding-right:15px;">${cr}</td>
            <td style="width:100%; white-space:normal;">${dr}</td>
            <td style="text-align:center; width:1%;">
                <button style="background:rgba(239,68,68,0.15); color:var(--merah); border:1px solid var(--merah); padding:6px 10px; border-radius:6px; cursor:pointer; font-size:11px; font-weight:bold;" onclick="deleteTx('${tx.id || tx.date}')">Hapus</button>
            </td>
            <td style="text-align:right; font-weight:900; font-size:15px; color:${tx.type==='masuk'?'var(--biru)':'var(--merah)'};">${tx.type==='masuk'?'+':'-'}${formatRp(tx.amount)}</td>
        </tr>`;
    });
    t.innerHTML = htmlStr;
}

function renderCharts(data) {
    if (typeof Chart === 'undefined') return;
    if (!document.getElementById('pieChart')) return; 
    Chart.defaults.color = '#94a3b8'; Chart.defaults.font.family = 'Inter';
    
    if(pieChart) pieChart.destroy(); if(lineChart) lineChart.destroy();
    if(data.length === 0) return;

    const cA = {}; 
    data.forEach(t => { const k = `${t.category}`; if(cA[k]) { cA[k].a += t.amount; } else { cA[k] = { a: t.amount, color: getDynamicColor(t.category, t.type) }; } }); 
    const pL = Object.keys(cA);
    
    pieChart = new Chart(document.getElementById('pieChart'), { type: 'doughnut', data: { labels: pL, datasets: [{ data: pL.map(l => cA[l].a), backgroundColor: pL.map(l => cA[l].color), borderWidth: 2, borderColor: '#064e3b' }] }, options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } } } });

    let cI = 0, cO = 0, hI = [], hO = []; 
    [...data].sort((a,b)=> new Date(a.date)-new Date(b.date)).forEach(t => { if(t.type === 'masuk') cI += t.amount; else cO += t.amount; hI.push(cI); hO.push(cO); });
    lineChart = new Chart(document.getElementById('lineChart'), { type: 'line', data: { labels: hI.map((_,i)=> `T${i+1}`), datasets: [{ label: 'Pemasukan', data: hI, borderColor: '#0ea5e9', backgroundColor: 'rgba(14, 165, 233, 0.1)', fill: true, tension: 0.3 }, { label: 'Pengeluaran', data: hO, borderColor: '#ef4444', backgroundColor: 'rgba(239, 68, 68, 0.1)', fill: true, tension: 0.3 }] }, options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: { x: { display: false }, y: { grid: { color: '#065f46' } } } } });
}

async function deleteTx(id) {
    if(confirm("Hapus catatan pembukuan ini permanen?")) {
        const strId = String(id);
        if(APP_MODE === 'CLOUD' && sbClient) {
            try {
                await sbClient.from('transactions').delete().eq('id', id);
                fetchUserTransactions();
                showToast("Dihapus dari Cloud", "success");
            } catch(e) { showToast("Gagal hapus dari server", "error"); }
        } else {
            db = db.filter(t => String(t.id) !== strId && String(t.date) !== strId);
            saveLocalDB(db); updateUI('');
            showToast("Dihapus dari Lokal", "success");
        }
    }
}

async function executeFactoryReset() { 
    if(confirm("PERINGATAN: Seluruh data lokal Anda akan dihapus permanen. Lanjutkan?")) {
        db = [];
        localStorage.removeItem('tpa_db');
        updateUI(''); 
        showToast("Database lokal direset.", "success");
        closeModal('profileViewModal');
    }
}

function executeCSVExport() { 
    let csv = "Tanggal,Waktu,Dompet,Tipe,Kategori,Deskripsi,Entitas,Nominal,Link_Arsip_Drive\n"; 
    db.forEach(row => { 
        csv += `"${new Date(row.date).toLocaleDateString()}","${new Date(row.date).toLocaleTimeString()}","${row.wallet}","${row.type}","${row.category}","${row.desc}","${row.entity||'-'}","${row.amount}","${row.receipt_url||'-'}"\n`; 
    }); 
    const link = document.createElement("a"); link.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' })); 
    link.download = `Laporan_TPA_${new Date().toISOString().split('T')[0]}.csv`; link.click(); 
    closeModal('csvExportModal');
}

document.getElementById('btnRealGoogleLogin').addEventListener('click', async () => { 
    if(sbClient) await sbClient.auth.signInWithOAuth({ provider: 'google' }); 
});

window.addEventListener('load', bootApp);
