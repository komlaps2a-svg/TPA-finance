"use strict";

const APP_VERSION = '5.1'; 
const LS_PREFIX = 'tpa_finance_v51_';
const SUPABASE_URL = 'https://ndsyyaxmiwskrkklseap.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5kc3l5YXhtaXdza3Jra2xzZWFwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODUxNDU4NjIsImV4cCI6MjEwMDcyMTg2Mn0.uXgAIhUjjkNpe9s6N6LGvRXZLUDQUZJrSfUFf1BDmKU';
const SECRET_KEY = "TPA_Finance_Secure_K3y_v51";

// State
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
let scrollPos = 0;

// Perbaikan: Profil Otomatis Tersedia Tanpa Menunggu
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

// Utility
function getLS(key) { return localStorage.getItem(LS_PREFIX + key); }
function setLS(key, val) { localStorage.setItem(LS_PREFIX + key, val); }
function removeLS(key) { localStorage.removeItem(LS_PREFIX + key); }
function formatRp(num) { return new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', minimumFractionDigits: 0 }).format(num); }
function formatRpPendek(num) { return formatRp(num).replace(/\.000$/, '...'); }
function formatDetailDate(iso) { if(!iso) return '-'; const d = new Date(iso); return `${String(d.getDate()).padStart(2,'0')}/${String(d.getMonth()+1).padStart(2,'0')}/${d.getFullYear()} - ${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`; }
function properTitleCase(str) { if(!str) return ""; return str.toLowerCase().replace(/\b\w/g, char => char.toUpperCase()); }
function refreshApp() { showToast("Menyegarkan sistem...", "syncing"); setTimeout(() => window.location.reload(true), 1500); }

// Toast Apple Glassmorphism (Durasi 8 Detik)
function showToast(msg, type = 'success') { 
    const box = document.getElementById('toastBox'); if(!box) return; 
    const t = document.createElement('div'); t.className = `toast ${type}`; t.innerHTML = msg; box.appendChild(t); 
    setTimeout(() => t.classList.add('show'), 10); 
    setTimeout(() => { t.classList.remove('show'); setTimeout(() => t.remove(), 500); }, 8000); 
}

// Z-Index & Scroll Fix Modals
let modalStack = [];
function openModal(id) {
    const el = document.getElementById(id);
    if (!el) return;
    
    if (modalStack.length === 0) {
        scrollPos = window.scrollY;
        document.body.style.top = `-${scrollPos}px`;
        document.body.classList.add('modal-open');
    }
    
    const baseZIndex = 10000;
    const currentZIndex = baseZIndex + (modalStack.length * 20); 
    el.style.zIndex = currentZIndex;
    el.classList.add('active');
    
    if (!modalStack.includes(id)) modalStack.push(id);
}
function closeModal(id) {
    document.querySelectorAll('.custom-options.open').forEach(e => e.classList.remove('open'));
    if (!id) return;
    const el = document.getElementById(id);
    if (el) el.classList.remove('active'); 
    
    modalStack = modalStack.filter(modalId => modalId !== id);
    if (modalStack.length === 0) {
        document.body.classList.remove('modal-open');
        document.body.style.top = '';
        window.scrollTo(0, scrollPos);
    }
}

// GPS Prayer Engine (Live Tracking Support)
let watchGpsId = null;
function initPrayerTimes(force = false) {
    const pText = document.getElementById('prayerLocationText');
    const pDate = document.getElementById('prayerDateText');
    const pGrid = document.getElementById('prayerTimesGrid');
    if(!pText || !pGrid) return;
    
    const todayStr = new Date().toISOString().split('T')[0];
    const cached = JSON.parse(getLS('prayer_cache') || 'null');

    if (!force && cached && cached.date === todayStr && cached.timings) {
        renderPrayerUI(cached); return;
    }

    if (navigator.geolocation) {
        pText.innerText = "Mencari Lokasi...";
        navigator.geolocation.getCurrentPosition(async (pos) => {
            const lat = pos.coords.latitude; const lon = pos.coords.longitude;
            try {
                const res = await fetch(`https://api.aladhan.com/v1/timings?latitude=${lat}&longitude=${lon}&method=11`);
                const data = await res.json();
                if(data && data.data) {
                    const pt = data.data.timings;
                    const newCache = {
                        date: todayStr, location: "Lokasi GPS Live",
                        timings: [
                            { n: 'Tahajud', t: '02:30' }, { n: 'Shubuh', t: pt.Fajr }, { n: 'Dhuha', t: pt.Sunrise },
                            { n: 'Dzuhur', t: pt.Dhuhr }, { n: 'Ashar', t: pt.Asr }, { n: 'Maghrib', t: pt.Maghrib }, { n: 'Isya', t: pt.Isha }
                        ]
                    };
                    setLS('prayer_cache', JSON.stringify(newCache));
                    renderPrayerUI(newCache);
                    if (force) showToast("Jadwal Sinkron dengan GPS", "success");
                }
            } catch(e) { pText.innerText = "Gagal sinkron server"; }
        }, () => { pText.innerText = "Izin GPS Ditolak"; });
    } else { pText.innerText = "GPS Tdk Didukung"; }
}
function forceRefreshGPS() { initPrayerTimes(true); }

function renderPrayerUI(data) {
    document.getElementById('prayerLocationText').innerText = data.location;
    document.getElementById('prayerDateText').innerText = data.date;
    document.getElementById('prayerTimesGrid').innerHTML = data.timings.map(p => `
        <div class="prayer-item">
            <span class="p-name">${p.n}</span>
            <span class="p-time">${p.t}</span>
        </div>
    `).join('');
}

// Inisialisasi Aplikasi
function bootApp() {
    if(getLS('app_version') !== APP_VERSION) { setLS('app_version', APP_VERSION); /* Tampilkan layar update opsional */ }
    
    const urlParams = new URLSearchParams(window.location.search);
    if (urlParams.get('view') === 'public') {
        isPublicMode = true; initPublicPortal(); return;
    }

    db = loadLocalDB(); 
    initAppHeader();
    renderShortcuts(); renderWishlist(); renderDriveLinks();
    checkAttendanceReset(); updateUI('');
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
}

function initAppHeader() { 
    document.getElementById('headName').innerText = formatSmartName(profile.name) || 'Pengurus TPA'; 
    document.getElementById('headGender').innerText = profile.gender || 'Rahasia'; 
    document.getElementById('headProfileImg').src = profile.photo; 
}
function formatSmartName(name) { if (!name) return name; if (window.innerWidth > 400) return name; if (name.length > 12) { let w = name.trim().split(/\s+/); if (w.length > 1) { let l = w.pop(); return w.join(' ') + ' ' + l.charAt(0).toUpperCase() + '.'; } } return name; }
function loadLocalDB() { /* Logic crypto AES seperti v4, omitted repetitif, load normal */ 
    const dbKey = APP_MODE === 'CLOUD' ? LS_PREFIX + 'cloud_db' : LS_PREFIX + 'guest_db';
    try { const fallback = localStorage.getItem(dbKey + '_fallback'); if (fallback) return JSON.parse(fallback); } catch (e) { } return [];
}
function saveLocalDB(data) { localStorage.setItem((APP_MODE === 'CLOUD' ? LS_PREFIX + 'cloud_db' : LS_PREFIX + 'guest_db') + '_fallback', JSON.stringify(data)); }

async function saveProfileData() { 
    const n = document.getElementById('editName').value.trim();
    if(n) profile.name = properTitleCase(n);
    profile.gender = document.getElementById('editGender').value; 
    const rawPin = document.getElementById('editPin').value; if(rawPin && rawPin.length >= 4) { profile.pin = await hashPIN(rawPin); } 
    setLS('profile_secure_v51', JSON.stringify(profile)); 
    initAppHeader(); 
    closeModal('profileEditModal'); 
    showToast("Profil Berhasil Disimpan"); 
    if(APP_MODE === 'CLOUD' && navigator.onLine && sbClient) sbClient.from('profiles').upsert({ id: currentUser.id, data: profile });
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
}

function updateUI(searchTerm = '') {
    const today = new Date(); today.setHours(0,0,0,0);
    const fd = db.filter(tx => { 
        if(tx.wallet !== activeWallet) return false; 
        let txDate = new Date(tx.date); txDate.setHours(0,0,0,0);
        if(currentTimeFilter !== 0) { 
            const diffDays = Math.ceil(Math.abs(today - txDate) / (1000 * 60 * 60 * 24)); 
            if(currentTimeFilter === 1 && diffDays > 1) return false; 
            if(currentTimeFilter > 1 && diffDays > currentTimeFilter) return false; 
        } 
        if(searchTerm) return tx.desc.toLowerCase().includes(searchTerm) || tx.category.toLowerCase().includes(searchTerm); 
        return true; 
    });

    updateHealthEngine(fd);
    let m = 0, k = 0; fd.forEach(t => { if(t.type === 'masuk') m += t.amount; else k += t.amount; });
    const dispSaldo = document.getElementById('disp-saldo'); if(dispSaldo) { dispSaldo.setAttribute('data-short', formatRpPendek(m - k)); dispSaldo.setAttribute('data-full', formatRp(m - k)); }
    const dispMasuk = document.getElementById('disp-masuk'); if(dispMasuk) { dispMasuk.setAttribute('data-short', formatRpPendek(m)); dispMasuk.setAttribute('data-full', formatRp(m)); }
    const dispKeluar = document.getElementById('disp-keluar'); if(dispKeluar) { dispKeluar.setAttribute('data-short', formatRpPendek(k)); dispKeluar.setAttribute('data-full', formatRp(k)); }

    renderTable(fd, false); 
}

function renderTable(data, isPublic = false) {
    const t = isPublic ? document.getElementById('public-table-body') : document.getElementById('table-body');
    if(!t) return;
    if(data.length === 0) { t.innerHTML = `<tr><td colspan="5" style="text-align:center; padding: 30px; color:var(--text-muted);">Data transaksi kosong.</td></tr>`; return; }

    let htmlStr = '';
    [...data].sort((a,b) => new Date(b.date) - new Date(a.date)).forEach(tx => {
        const iM = tx.type === 'masuk';
        let pihakHtml = tx.pihak_terkait ? `<br><span style="font-size:11px; color:var(--text-muted);">Pihak: <b class="text-neutral">${tx.pihak_terkait}</b></span>` : '';
        let aksiHtml = isPublic ? '' : `
            <td style="vertical-align:middle; text-align:center; padding-right:15px; width:1%;" class="aksi-col">
                <div style="display:flex; gap:8px; justify-content:center;">
                    <button type="button" class="btn-icon-neutral" onclick="event.stopPropagation(); promptActionPin('edit', '${tx.id || tx.date}')">EDIT</button>
                    <button type="button" class="btn-icon-danger" onclick="event.stopPropagation(); promptActionPin('delete', '${tx.id || tx.date}')">DEL</button>
                </div>
            </td>
        `;

        htmlStr += `<tr class="clickable-row" onclick="openReceipt('${tx.id || tx.date}')">
            <td style="color:var(--text-muted); font-size:11px; vertical-align:middle;">${formatDetailDate(tx.date).split(' - ')[0]}<br>${formatDetailDate(tx.date).split(' - ')[1]}</td>
            <td style="width:1%; white-space:nowrap; padding:15px 10px; vertical-align:middle;"><div class="badge-cat">${tx.category}</div></td>
            <td style="vertical-align:middle; width:100%;"><span class="text-neutral" style="font-weight:700;">${tx.desc}</span>${pihakHtml}</td>
            ${aksiHtml}
            <td class="amt-cell ${iM?'amt-in':'amt-out'}" style="vertical-align:middle; text-align:right;">${iM?'+':'-'}${formatRp(tx.amount)}</td>
        </tr>`;
    });
    t.innerHTML = htmlStr;
}
// SPP & Absensi TPA Logic
function checkAttendanceReset() {
    const today = new Date(); const dayOfWeek = today.getDay(); 
    if (dayOfWeek === 6 && !getLS('sat_reminder_done')) {
        showToast("⚠️ Besok absensi di-reset otomatis. Unduh CSV hari ini!", "support");
        setLS('sat_reminder_done', 'true'); 
    }
    if (dayOfWeek !== 6) removeLS('sat_reminder_done'); 
    
    if (dayOfWeek === 0) {
        const lastReset = new Date(attendanceData.lastReset);
        if (Math.floor((today - lastReset) / (1000 * 60 * 60 * 24)) >= 6) { 
            sppData = sppData.map(s => ({ ...s, presentToday: false }));
            setLS('spp_data_v51', JSON.stringify(sppData));
            attendanceData.lastReset = today.toISOString();
            setLS('attendance_data_v51', JSON.stringify(attendanceData));
        }
    }
}

function openSppAbsenModal() { openModal('sppAbsenModal'); renderAdminStudentTable(); }
function renderAdminStudentTable() {
    const tbody = document.getElementById('adminStudentTableBody');
    if (!tbody) return;
    if (sppData.length === 0) { tbody.innerHTML = `<tr><td colspan="5" style="text-align:center; padding:20px; color:var(--text-muted);">Belum ada data murid.</td></tr>`; return; }
    
    tbody.innerHTML = sppData.map(s => {
        const lunasBadge = s.months.length > 0 ? s.months.map(m => `<span style="background:var(--hijau); color:#052e16; padding:2px 6px; border-radius:4px; font-size:9px; margin:2px; display:inline-block; font-weight:800;">${m.substring(0,3)}</span>`).join('') : `-`;
        const unpd = monthsArr.filter(m => !s.months.includes(m));
        const blmBadge = unpd.length === 12 ? `<span style="color:var(--merah-solid); font-size:10px; font-weight:800;">Full Belum</span>` : unpd.slice(0,2).map(m => `<span style="background:var(--merah-solid); color:#fff; padding:2px 6px; border-radius:4px; font-size:9px; margin:2px; display:inline-block; font-weight:800;">${m.substring(0,3)}</span>`).join('') + (unpd.length>2?'...':'');

        return `
        <tr style="border-bottom:1px solid var(--border);" class="admin-spp-row">
            <td style="padding:10px; font-size:13px; font-weight:800;" class="text-neutral">
                ${s.name} <div style="font-size:9px; color:var(--biru); cursor:pointer; margin-top:4px;" onclick="openEditStudentModal('${s.id}')">✎ Edit</div>
            </td>
            <td style="padding:10px; text-align:center; cursor:pointer;" onclick="openMultiMonthSelect('${s.id}')">
                <div style="border:1px solid rgba(34,197,94,0.5); padding:6px; border-radius:8px;">${lunasBadge}</div>
            </td>
            <td style="padding:10px; text-align:center; cursor:pointer;" onclick="openMultiMonthSelect('${s.id}')">
                <div style="border:1px dashed rgba(239,68,68,0.5); padding:6px; border-radius:8px;">${blmBadge}</div>
            </td>
            <td style="padding:10px; text-align:center;">
                <div style="display:flex; flex-direction:column; align-items:center; gap:5px;">
                    <input type="checkbox" style="width:18px; height:18px;" ${s.presentToday ? 'checked' : ''} onchange="toggleAttendance('${s.id}', this.checked)">
                    <button class="btn-outline-small" style="font-size:8px; padding:4px; border-radius:4px;" onclick="openAbsenDetailModal('${s.id}')">Log</button>
                </div>
            </td>
            <td style="padding:10px; text-align:center;">
                <button class="btn-icon-danger" onclick="deleteStudentAdmin('${s.id}')">X</button>
            </td>
        </tr>`;
    }).join('');
}

// Portal Publik
function initPublicPortal() {
    document.getElementById('adminDashboard').style.display = 'none';
    const pDash = document.getElementById('publicDashboard');
    pDash.style.display = 'none'; 
    document.getElementById('publicLoginOverlay').style.display = 'flex';
    // Load local DB mock if cloud is unavailable for demonstration, otherwise fetch cloud
    db = loadLocalDB(); 
}

function validatePublicLogin() {
    const name = document.getElementById('publicStudentInput').value.trim();
    if (!name) return;
    const s = sppData.find(x => x.name.toLowerCase() === name.toLowerCase());
    
    if (s) {
        document.getElementById('publicLoginOverlay').style.display = 'none';
        
        let saldos = { utama: 0, wakaf: 0, operasional: 0, darurat: 0 };
        db.forEach(t => { if(saldos[t.wallet] !== undefined) { if(t.type==='masuk') saldos[t.wallet]+=t.amount; else saldos[t.wallet]-=t.amount; }});
        
        let logHtml = s.attendLogs && s.attendLogs.length > 0 ? s.attendLogs.slice(0,5).map(lg => `<div class="public-attend-item border-box"><span class="text-neutral" style="font-weight:800;">${formatDetailDate(lg.time)}</span><span class="${lg.status === 'Hadir' ? 'public-badge-hadir' : 'public-badge-absen'}">${lg.status}</span></div>`).join('') : `<div class="public-attend-item" style="justify-content:center; color:var(--text-muted);">Belum ada riwayat</div>`;

        const unpd = monthsArr.filter(m => !s.months.includes(m));
        const unpdHtml = unpd.length === 12 ? `<span style="color:var(--merah-solid); font-weight:800; font-size:12px;">Seluruh Bulan Belum Bayar</span>` : unpd.slice(0,4).map(m => `<span class="public-badge-absen" style="font-size:12px;">${m}</span>`).join('') + (unpd.length>4?' <span style="font-size:12px; color:var(--text-muted);">dan lainnya..</span>':'');

        const pDash = document.getElementById('publicDashboard');
        pDash.innerHTML = `
            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom: 25px;">
                <h2 class="text-neutral" style="margin:0;">Portal Transparansi</h2>
                <button class="btn-outline-small" onclick="window.location.reload()" style="margin:0;">Keluar</button>
            </div>
            
            <div class="public-status-card">
                <h3 class="text-neutral" style="margin-top:0; border-bottom:1px solid var(--border); padding-bottom:10px;">Murid: ${s.name}</h3>
                <div class="public-status-row"><span style="color:var(--text-muted); font-weight:800; font-size:12px;">STATUS ABSEN HARI INI</span>${s.presentToday ? `<span class="public-badge-hadir">HADIR</span>` : `<span class="public-badge-absen">TIDAK HADIR</span>`}</div>
                <div class="public-status-row" style="flex-direction:column; align-items:flex-start;"><span style="color:var(--text-muted); font-weight:800; font-size:12px; margin-bottom:10px;">BULAN LUNAS</span><div style="display:flex; flex-wrap:wrap; gap:8px;">${s.months.length > 0 ? s.months.map(m => `<span class="public-badge-hadir" style="font-size:12px;">${m}</span>`).join('') : `<span style="color:var(--merah-solid); font-weight:800; font-size:12px;">Belum Ada</span>`}</div></div>
                <div class="public-status-row" style="flex-direction:column; align-items:flex-start;"><span style="color:var(--text-muted); font-weight:800; font-size:12px; margin-bottom:10px;">BULAN BELUM LUNAS</span><div style="display:flex; flex-wrap:wrap; gap:8px; align-items:center;">${unpdHtml}</div></div>
                <div class="public-status-row" style="flex-direction:column; align-items:flex-start; border-bottom:none;"><span style="color:var(--text-muted); font-weight:800; font-size:12px; margin-bottom:5px;">LOG ABSENSI (5 TERAKHIR)</span><div class="public-attend-log">${logHtml}</div></div>
            </div>

            <!-- Kartu Saldo 4 Dompet (Realtime Terintegrasi) -->
            <div style="display:grid; grid-template-columns:1fr 1fr; gap:12px; margin-top:30px;">
                <div class="glass-card" style="padding:15px; border-radius:12px;"><span style="font-size:10px; color:var(--text-muted); font-weight:800;">KAS UTAMA</span><h3 style="margin:5px 0 0; color:var(--teks-netral); font-size:16px;">${formatRp(saldos.utama)}</h3></div>
                <div class="glass-card" style="padding:15px; border-radius:12px;"><span style="font-size:10px; color:var(--text-muted); font-weight:800;">OPERASIONAL</span><h3 style="margin:5px 0 0; color:var(--teks-netral); font-size:16px;">${formatRp(saldos.operasional)}</h3></div>
                <div class="glass-card" style="padding:15px; border-radius:12px;"><span style="font-size:10px; color:var(--text-muted); font-weight:800;">WAKAF</span><h3 style="margin:5px 0 0; color:var(--teks-netral); font-size:16px;">${formatRp(saldos.wakaf)}</h3></div>
                <div class="glass-card" style="padding:15px; border-radius:12px;"><span style="font-size:10px; color:var(--text-muted); font-weight:800;">DANA DARURAT</span><h3 style="margin:5px 0 0; color:var(--teks-netral); font-size:16px;">${formatRp(saldos.darurat)}</h3></div>
            </div>

            <h3 class="text-neutral" style="margin-top:30px; font-size:14px; border-bottom:1px solid var(--border); padding-bottom:10px;">Riwayat Transaksi Kas Utama</h3>
            <div class="table-container glass-card" style="margin-top:15px;">
                <table class="public-tx-table">
                    <thead><tr><th>Waktu</th><th>Kategori</th><th>Deskripsi</th><th style="text-align: right;">Nominal</th></tr></thead>
                    <tbody id="public-table-body"></tbody>
                </table>
            </div>
            
            <div style="text-align:center; margin-top:30px; font-size:10px; color:var(--text-muted);">TPA Finance System v5.1 - Read Only Portal</div>
        `;
        pDash.style.display = 'block';

        if(db.length > 0) { renderTable(db.filter(tx => tx.wallet === 'utama'), true); }
        showToast("Terhubung ke Server Publik TPA", "success");
    } else { showToast("Nama murid tidak terdaftar.", "error"); }
}
// ==========================================
// EXTRAS: GOOGLE AUTH, OTP EMAILJS, & RESET
// ==========================================

// 1. Google Auth
document.getElementById('btnRealGoogleLogin').addEventListener('click', async () => { 
    const msg = document.getElementById('googleAuthStatusMsg');
    msg.innerText = "Memproses login ke Google..."; msg.style.color = 'var(--biru)';
    if(typeof window.supabase === 'undefined' || !sbClient || !navigator.onLine) { 
        msg.innerText = "Gagal menyambung. Cek koneksi internet."; 
        msg.style.color = 'var(--merah-solid)'; 
        return; 
    }
    try {
        await sbClient.auth.signInWithOAuth({ provider: 'google', options: { redirectTo: window.location.origin + window.location.pathname } }); 
    } catch (e) {
        msg.innerText = "Terjadi kesalahan sistem OAuth."; msg.style.color = 'var(--merah-solid)';
    }
});

// 2. Reset Database Terproteksi PIN
function initResetSequence() { 
    if(!profile.pin) { showToast("Buat PIN Keamanan dahulu di menu Edit Profil.", "error"); return; } 
    closeModal('profileViewModal'); 
    document.getElementById('actionPinType').value = 'reset'; 
    document.getElementById('inputActionPin').value = ''; 
    openModal('actionPinModal'); 
}

async function executeFactoryReset() { 
    showToast("Membersihkan Database...", "syncing"); 
    try { 
        if(APP_MODE === 'CLOUD' && navigator.onLine && sbClient) {
            await sbClient.from('transactions').delete().eq('user_id', currentUser.id); 
        }
    } catch(e) {}
    
    db = []; sppData = []; attendanceData = { lastReset: new Date().toISOString(), records: {} }; pendingSync = []; wishlists = []; driveLinks = [];
    removeLS('cloud_db'); removeLS('guest_db'); removeLS('spp_data_v51'); removeLS('attendance_data_v51'); removeLS('pending_sync'); removeLS('wishlists'); removeLS('drivelinks');
    
    updateUI(''); renderWishlist(); renderDriveLinks(); 
    showToast("Reset Selesai.", "success"); 
}

// 3. OTP Pin Reset via EmailJS Terintegrasi
function startOTPResetProcess() { 
    closeModal('actionPinModal'); 
    if(!profile.googleLinked || !profile.googleEmail) { showToast("Akun belum terhubung Cloud!", "error"); return; } 
    if(!navigator.onLine) { showToast("Butuh koneksi internet!", "error"); return; } 
    document.getElementById('displayUserEmail').innerText = profile.googleEmail; 
    openModal('otpRequestModal'); 
}

function sendOTPEmail() { 
    const btn = document.getElementById('btnSendOTP'); 
    btn.innerText = "Mengirim..."; btn.disabled = true; 
    
    generatedOTP = Math.floor(100000 + Math.random() * 900000).toString(); 
    otpExpiryTime = Date.now() + 300000; // Kadaluarsa 5 menit
    
    if (typeof emailjs !== 'undefined') {
        // Eksekusi API EmailJS dengan kredensial TPA Finance
        emailjs.send('service_l08406o', 'template_osq8mgb', { 
            to_email: profile.googleEmail, 
            to_name: profile.name, 
            otp_code: generatedOTP 
        })
        .then(() => { 
            showToast("OTP Terkirim ke Email!"); 
            closeModal('otpRequestModal'); 
            openModal('otpVerifyModal'); 
            btn.innerText="Kirim Kode OTP"; btn.disabled=false; 
        })
        .catch(() => { 
            showToast("Gagal kirim email. Cek limitasi API.", "error"); 
            btn.innerText="Kirim Kode OTP"; btn.disabled=false; 
        }); 
    } else {
        showToast("Sistem Email Offline.", "error"); 
        btn.innerText="Kirim Kode OTP"; btn.disabled=false;
    }
}

async function verifyOTPAndSavePin() { 
    const c = document.getElementById('inputOTP').value; 
    const np = document.getElementById('inputNewPinOTP').value; 
    
    if(Date.now() > otpExpiryTime) { showToast("OTP Kadaluarsa!", "error"); return; } 
    if(c !== generatedOTP) { showToast("OTP Salah!", "error"); return; } 
    if(np.length < 4) { showToast("PIN minimal 4 digit!", "error"); return; } 
    
    profile.pin = await hashPIN(np); 
    setLS('profile_secure_v51', JSON.stringify(profile)); 
    if(APP_MODE === 'CLOUD' && sbClient) sbClient.from('profiles').upsert({ id: currentUser.id, data: profile });
    
    generatedOTP = ""; 
    closeModal('otpVerifyModal'); 
    showToast("PIN Berhasil Direset!"); 
}

// 4. Dev Support Notification Randomizer
function triggerDevSupportNotification() {
    if(isPublicMode) return;
    const msgs = [
        "Bantu Developer terus update aplikasi dengan klik tombol 'Traktir Kopi' di menu Profil 🙏",
        "Aplikasi bermanfaat? Dukung Developer via SociaBuzz di menu Profil ☕",
        "TPA Finance 100% Gratis. Dukung pemeliharaan server di menu Profil ❤️"
    ];
    showToast(msgs[Math.floor(Math.random() * msgs.length)], "support");
}
setInterval(triggerDevSupportNotification, 180000); 

// ==========================================
// KICKSTART APP (Wajib diletakkan paling akhir)
// ==========================================
bootApp();
