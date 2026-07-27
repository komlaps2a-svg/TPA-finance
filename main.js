const APP_VERSION = '1.1'; 
let sbClient = null;
let db = []; 
let pendingSync = JSON.parse(localStorage.getItem('tpa_pending_sync')) || []; 
let currentUser = null; 
let APP_MODE = localStorage.getItem('tpa_app_mode') || 'GUEST';

// PASTE CREDENTIAL SUPABASE BARU ANDA DI SINI
const SUPABASE_URL = 'https://ISI_DENGAN_URL_PROJECT_BARU.supabase.co';
const SUPABASE_KEY = 'ISI_DENGAN_ANON_KEY_PROJECT_BARU';

let activeWallet = 'operasional'; 
let currentTimeFilter = 30; 
let rawAmount = 0;
let pieChart, lineChart; 
let aiMessages = []; 
let aiCurrentMsgIdx = 0; 
let aiCarouselInterval = null; 

let profile = JSON.parse(localStorage.getItem('tpa_profile')) || { name: 'Admin TPA', photo: '', googleEmail: '' };

const svgs = {
    uang: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="2" y="6" width="20" height="12" rx="2"/><circle cx="12" cy="12" r="2"/></svg>`,
    plus: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>`,
    minus_bold: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><line x1="5" y1="12" x2="19" y2="12"></line></svg>`,
    transport: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg>`
};

const categories = { 
    masuk: ['Infak Santri', 'Infak Jumat', 'Donasi Masyarakat', 'Wakaf', 'Bantuan Pemerintah', 'Bantuan Masjid', 'Hibah', 'Donatur Tetap', 'Lainnya'], 
    keluar: ['Honor Guru', 'ATK', 'Al-Qur\'an', 'Buku Iqra\'', 'Snack Kegiatan', 'Listrik', 'Air', 'Kebersihan', 'Perbaikan Bangunan', 'Kegiatan Santri', 'Transportasi', 'Lainnya'] 
};

function getDynamicColor(cat, type) {
    if (type === 'keluar') return '#ef4444';
    const inColors = { 'Wakaf': '#f59e0b', 'Donatur Tetap': '#3b82f6', 'Infak Santri': '#10b981' };
    return inColors[cat] || '#8b5cf6';
}

function saveLocalDB(data) { localStorage.setItem('tpa_db', JSON.stringify(data)); }
function loadLocalDB() { return JSON.parse(localStorage.getItem('tpa_db')) || []; }
function formatRp(num) { return new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', minimumFractionDigits: 0 }).format(num); }
function properTitleCase(str) { return str ? str.toLowerCase().replace(/\b\w/g, c => c.toUpperCase()) : ""; }

function bootApp() {
    db = loadLocalDB(); 
    document.getElementById('headName').innerText = profile.name;
    renderShortcuts(); 
    updateUI('');
    setTimeout(initSupabaseBackground, 500);
}

async function initSupabaseBackground() {
    if (!window.supabase) return;
    if (!sbClient) sbClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
    
    sbClient.auth.onAuthStateChange(async (event, session) => {
        if (event === 'SIGNED_IN' && session) {
            currentUser = session.user; 
            APP_MODE = 'CLOUD'; localStorage.setItem('tpa_app_mode', 'CLOUD');
            document.getElementById('networkStatus').innerText = "Online (Cloud)";
            document.getElementById('networkStatus').className = "status-sync sync-online";
            fetchUserTransactions();
            closeModal('googleAuthModal');
        } else if (event === 'SIGNED_OUT') {
            APP_MODE = 'GUEST'; localStorage.setItem('tpa_app_mode', 'GUEST');
            currentUser = null; db = []; saveLocalDB(db); updateUI('');
        }
    });
}

async function fetchUserTransactions() {
    if (APP_MODE !== 'CLOUD' || !currentUser || !sbClient) return;
    try {
        const { data, error } = await sbClient.from('transactions').select('*').eq('user_id', currentUser.id);
        if (error) throw error;
        db = data; saveLocalDB(db); updateUI('');
    } catch (e) { console.warn("Gagal fetch, gunakan lokal."); }
}

function switchWallet(type) { 
    activeWallet = type; 
    document.getElementById('walletSwitchContainer').setAttribute('data-active', type); 
    renderShortcuts(); updateUI(''); 
}

function renderShortcuts() { 
    const c = document.getElementById('quickActionsContainer'); 
    if(activeWallet === 'operasional') { 
        c.className = 'quick-actions-wrap grid-mode grid-split-4'; 
        c.innerHTML = ` 
            <button class="btn-quick glow-hijau" onclick="quickInput('masuk', 'Infak Santri', 'Pembayaran SPP/Bulanan', true)">${svgs.plus} <span>Infak Santri</span></button> 
            <button class="btn-quick glow-biru" onclick="quickInput('masuk', 'Donatur Tetap', 'Donasi Operasional', true)">${svgs.uang} <span>Donatur</span></button> 
            <button class="btn-quick glow-merah" onclick="quickInput('keluar', 'Honor Guru', 'Pembayaran Honor', true)">${svgs.minus_bold} <span>Honor Guru</span></button> 
            <button class="btn-quick glow-kuning" onclick="quickInput('keluar', 'Kegiatan Santri', 'Konsumsi/Operasional')">${svgs.transport} <span>Kegiatan</span></button> 
        `; 
    } else { 
        c.className = 'quick-actions-wrap grid-mode grid-split-4'; 
        c.innerHTML = ` 
            <button class="btn-quick glow-hijau" onclick="quickInput('masuk', 'Wakaf', 'Penerimaan Dana Wakaf', true)">${svgs.uang} <span>Terima Wakaf</span></button> 
            <button class="btn-quick glow-merah" onclick="quickInput('keluar', 'Perbaikan Bangunan', 'Pembangunan/Renovasi')">${svgs.minus_bold} <span>Pembangunan</span></button> 
            <button class="btn-quick glow-biru" onclick="quickInput('masuk', 'Hibah', 'Dana Terikat Khusus', true)">${svgs.plus} <span>Dana Khusus</span></button> 
            <button class="btn-quick glow-kuning" onclick="quickInput('keluar', 'Lainnya', 'Pengeluaran Darurat')">${svgs.minus_bold} <span>Pengeluaran</span></button> 
        `; 
    } 
}

function quickInput(type, cat, desc, reqEntity = false) { 
    document.getElementById('tx-type').value = type; 
    document.getElementById('modal-title').innerText = type === 'masuk' ? 'Catat Pemasukan TPA' : 'Catat Pengeluaran TPA'; 
    document.getElementById('tx-desc').value = desc; 
    document.getElementById('tx-entity').value = ''; 
    document.getElementById('tx-receipt').value = '';
    
    const box = document.getElementById('catOptionsBox'); 
    const arr = type === 'masuk' ? categories.masuk : categories.keluar; 
    box.innerHTML = arr.map(c => `<div class="custom-option" onclick="selectCategory('${c}')">${c}</div>`).join(''); 
    document.getElementById('tx-category').value = cat; 
    document.getElementById('dispTxCat').innerText = cat;
    
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
    rawAmount = v ? parseInt(v, 10) : 0; this.value = rawAmount ? rawAmount.toLocaleString('id-ID') : ''; 
});

document.getElementById('btnExecuteTx').addEventListener('click', async () => { 
    if(rawAmount <= 0) return alert("Nominal tidak valid"); 
    const btn = document.getElementById('btnExecuteTx');
    btn.innerText = "Memproses..."; btn.disabled = true;

    try {
        const type = document.getElementById('tx-type').value; 
        const cF = document.getElementById('tx-category').value; 
        const dF = properTitleCase(document.getElementById('tx-desc').value.trim()); 
        const ent = document.getElementById('borrowerWrapper').style.display === 'block' ? properTitleCase(document.getElementById('tx-entity').value.trim()) : ''; 
        
        let receiptUrl = null;
        const fileInput = document.getElementById('tx-receipt');
        
        if (fileInput.files.length > 0 && APP_MODE === 'CLOUD' && sbClient) {
            const file = fileInput.files[0];
            const fileName = `${Date.now()}_${Math.random().toString(36).substring(7)}.${file.name.split('.').pop()}`;
            const { data, error } = await sbClient.storage.from('receipts').upload(fileName, file);
            if (!error) {
                const { data: urlData } = sbClient.storage.from('receipts').getPublicUrl(fileName);
                receiptUrl = urlData.publicUrl;
            }
        }

        const txData = { wallet: activeWallet, type, category: cF, desc: dF, entity: ent, amount: rawAmount, receipt_url: receiptUrl, date: new Date().toISOString() };

        if (APP_MODE === 'CLOUD' && sbClient) { 
            txData.user_id = currentUser.id;
            await sbClient.from('transactions').insert([txData]); 
            await fetchUserTransactions(); 
        } else { 
            txData.id = Date.now(); db.push(txData); saveLocalDB(db); updateUI('');
        }
        closeModal('txModal'); 
    } finally {
        btn.innerText = "Simpan ke Buku Kas"; btn.disabled = false;
    }
});

function updateUI(searchTerm = '') {
    let tI = 0, tO = 0; 
    const today = new Date();
    
    const fd = db.filter(tx => { 
        if(tx.wallet !== activeWallet) return false; 
        if(currentTimeFilter !== 0) { 
            const d = new Date(tx.date); 
            if(Math.floor(Math.abs(today - d) / 86400000) > currentTimeFilter) return false; 
        } 
        if(searchTerm) return tx.desc.toLowerCase().includes(searchTerm) || (tx.entity && tx.entity.toLowerCase().includes(searchTerm)); 
        return true; 
    });

    fd.forEach(t => { if(t.type === 'masuk') tI += t.amount; else tO += t.amount; });
    
    document.getElementById('disp-saldo').innerText = formatRp(tI - tO);
    document.getElementById('disp-masuk').innerText = formatRp(tI);
    document.getElementById('disp-keluar').innerText = formatRp(tO);
    
    generateAIForecast(fd); renderTable(fd);
}

function generateAIForecast(data) { 
    const textEl = document.getElementById('aiInsightText'); aiMessages = []; 
    if (activeWallet === 'operasional') {
        let outHonor = data.filter(t => t.category === 'Honor Guru').reduce((a,b)=>a+b.amount,0);
        aiMessages.push("Transparansi adalah kunci. Pastikan pengeluaran dicatat dengan bukti nota digital.");
        if(outHonor === 0 && data.length > 5) aiMessages.push("⚠️ Anggaran Honor Guru belum tercatat bulan ini. Jangan terlewat!");
    } else {
        aiMessages.push("Peringatan: Dana Wakaf dilarang keras digunakan untuk konsumsi operasional harian TPA.");
    }
    
    if (aiCarouselInterval) clearInterval(aiCarouselInterval); 
    aiCurrentMsgIdx = 0; textEl.innerText = aiMessages[0]; 
    if (aiMessages.length > 1) { 
        aiCarouselInterval = setInterval(() => { 
            textEl.style.opacity = 0; 
            setTimeout(() => { 
                aiCurrentMsgIdx = (aiCurrentMsgIdx + 1) % aiMessages.length; 
                textEl.innerText = aiMessages[aiCurrentMsgIdx]; 
                textEl.style.opacity = 1; 
            }, 400); 
        }, 8000); 
    } 
}

function renderTable(data) {
    const t = document.getElementById('table-body');
    if(data.length === 0) { t.innerHTML = `<tr><td colspan="5" style="text-align:center;">Tidak ada transaksi.</td></tr>`; return; }
    
    let htmlStr = '';
    [...data].sort((a,b) => new Date(b.date) - new Date(a.date)).forEach(tx => {
        let c = getDynamicColor(tx.category, tx.type);
        let dr = `<span style="font-weight:700;">${tx.desc}</span>`;
        if(tx.entity) dr += `<br><span style="font-size:11px; color:var(--kuning);">Pihak: <b>${tx.entity}</b></span>`;
        if(tx.receipt_url) dr += `<br><a href="${tx.receipt_url}" target="_blank" style="font-size:10px; color:var(--biru); text-decoration:underline;">Lihat Bukti Foto</a>`;
        
        let cr = `<div class="badge-cat" style="border:1px solid ${c}; color:${c}; background:rgba(0,0,0,0.5); font-size:10px; padding:4px; border-radius:4px;">${tx.category}</div>`;
        
        htmlStr += `<tr>
            <td style="font-size:11px;">${new Date(tx.date).toLocaleDateString('id-ID')}</td>
            <td>${cr}</td>
            <td style="width:100%;">${dr}</td>
            <td style="text-align:center;">
                <button style="background:rgba(239,68,68,0.15); color:var(--merah); border:1px solid; padding:4px 8px; border-radius:4px; cursor:pointer;" onclick="deleteTx('${tx.id}')">Hapus</button>
            </td>
            <td style="text-align:right; font-weight:900; color:${tx.type==='masuk'?'var(--biru)':'var(--merah)'};">${tx.type==='masuk'?'+':'-'}${formatRp(tx.amount)}</td>
        </tr>`;
    });
    t.innerHTML = htmlStr;
}

async function deleteTx(id) {
    if(confirm("Hapus catatan pembukuan ini?")) {
        if(APP_MODE === 'CLOUD' && sbClient) {
            await sbClient.from('transactions').delete().eq('id', id);
            fetchUserTransactions();
        } else {
            db = db.filter(t => String(t.id) !== String(id));
            saveLocalDB(db); updateUI('');
        }
    }
}

function selectCategory(cat) { document.getElementById('tx-category').value = cat; document.getElementById('dispTxCat').innerText = cat; closeModal(''); }
function toggleCustomSelect(id) { document.getElementById(id).classList.toggle('open'); }
function closeModal(id) { if(id) document.getElementById(id).classList.remove('active'); document.querySelectorAll('.custom-options').forEach(e => e.classList.remove('open')); }
function toggleExpandStat(el, id) { el.classList.toggle('expanded'); }
function toggleSection(sec, icn) { document.getElementById(sec).classList.toggle('hidden'); document.getElementById(icn).classList.toggle('rotated'); }

function executeCSVExport() { 
    let csv = "Tanggal,Dompet,Tipe,Kategori,Deskripsi,Entitas,Nominal,Bukti_URL\n"; 
    db.forEach(row => { 
        csv += `"${new Date(row.date).toLocaleDateString()}","${row.wallet}","${row.type}","${row.category}","${row.desc}","${row.entity||'-'}","${row.amount}","${row.receipt_url||'-'}"\n`; 
    }); 
    const link = document.createElement("a"); link.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' })); 
    link.download = `Laporan_TPA_${new Date().toISOString().split('T')[0]}.csv`; link.click(); 
    closeModal('csvExportModal');
}
document.getElementById('btnRealGoogleLogin').addEventListener('click', async () => { 
    if(sbClient) await sbClient.auth.signInWithOAuth({ provider: 'google' }); 
});
window.addEventListener('load', bootApp);
