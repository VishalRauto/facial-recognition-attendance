/* ══════════════════════════════════════════════════
   FaceAttend — Frontend Application (Advanced)
   ══════════════════════════════════════════════════ */

const API = 'http://localhost:5000/api';
let currentUser = null;

// ── Utility ───────────────────────────────────────────────────────────────────

function toast(msg, type = 'info') {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.className = `toast show ${type}`;
  clearTimeout(el._t);
  el._t = setTimeout(() => { el.className = 'toast'; }, 3500);
}

async function apiFetch(path, opts = {}) {
  const res = await fetch(API + path, {
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    ...opts
  });
  return res.json();
}

function formatDate(d) {
  if (!d) return '—';
  const [y, m, day] = d.split('-');
  return `${day}/${m}/${y}`;
}

function escHtml(s) {
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

// ── Theme ─────────────────────────────────────────────────────────────────────

function applyTheme(theme) {
  document.documentElement.setAttribute('data-theme', theme);
  document.getElementById('theme-icon').className =
    theme === 'dark' ? 'fa fa-moon' : 'fa fa-sun';
  localStorage.setItem('theme', theme);
}

document.getElementById('theme-toggle').addEventListener('click', () => {
  const current = document.documentElement.getAttribute('data-theme');
  applyTheme(current === 'dark' ? 'light' : 'dark');
});

applyTheme(localStorage.getItem('theme') || 'dark');

// ── Clock & Date ──────────────────────────────────────────────────────────────

function updateClock() {
  const now = new Date();
  document.getElementById('clock').textContent =
    now.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}
setInterval(updateClock, 1000);
updateClock();

const today = new Date().toISOString().split('T')[0];
document.getElementById('today-date').textContent =
  new Date().toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });

// ── Auth ──────────────────────────────────────────────────────────────────────

async function checkAuth() {
  const data = await apiFetch('/me');
  if (data.user) {
    currentUser = data.user;
    showApp();
  } else {
    showLoginOverlay();
  }
}

function showLoginOverlay() {
  document.getElementById('login-overlay').style.display = 'flex';
}

function showApp() {
  document.getElementById('login-overlay').style.display = 'none';
  document.getElementById('sidebar-user').innerHTML =
    `<i class="fa fa-user-circle"></i> <span>${escHtml(currentUser.username)}</span>
     <span class="role-badge ${currentUser.role}">${currentUser.role}</span>`;
  if (currentUser.role === 'admin') {
    document.getElementById('users-panel').style.display = '';
    document.getElementById('admin-only-class').style.display = '';
    document.getElementById('admin-only-subject').style.display = '';
  }
  loadDashboard();
  loadClassesDropdowns();
  loadSubjectsDropdown();
}

document.getElementById('login-btn').addEventListener('click', async () => {
  const username = document.getElementById('login-username').value.trim();
  const password = document.getElementById('login-password').value;
  const errEl = document.getElementById('login-error');
  errEl.style.display = 'none';
  if (!username || !password) { errEl.textContent = 'Enter username and password'; errEl.style.display='block'; return; }
  const data = await apiFetch('/login', {
    method: 'POST',
    body: JSON.stringify({ username, password })
  });
  if (data.error) {
    errEl.textContent = data.error; errEl.style.display = 'block';
  } else {
    currentUser = data.user;
    showApp();
  }
});

document.getElementById('login-password').addEventListener('keydown', e => {
  if (e.key === 'Enter') document.getElementById('login-btn').click();
});

document.getElementById('logout-btn').addEventListener('click', async () => {
  await apiFetch('/logout', { method: 'POST' });
  currentUser = null;
  showLoginOverlay();
});

// ── Sidebar Navigation ────────────────────────────────────────────────────────

const pageTitles = {
  dashboard: 'Dashboard', register: 'Register Student',
  mark: 'Mark Attendance', records: 'View Records',
  students: 'Students', analytics: 'Analytics',
  classes: 'Classes & Subjects', audit: 'Audit Log'
};

function showPage(name) {
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.nav-links li').forEach(l => l.classList.remove('active'));
  const page = document.getElementById('page-' + name);
  const nav  = document.querySelector(`.nav-links li[data-page="${name}"]`);
  if (page) page.classList.add('active');
  if (nav)  nav.classList.add('active');
  document.getElementById('page-title').textContent = pageTitles[name] || name;

  if (name === 'dashboard') loadDashboard();
  if (name === 'records')   { loadRecords(); }
  if (name === 'students')  loadStudents();
  if (name === 'mark')      { loadMarkToday(); loadSubjectsDropdown(); }
  if (name === 'analytics') loadAnalytics();
  if (name === 'classes')   { loadClassesList(); loadSubjectsList(); if (currentUser?.role==='admin') loadUsersList(); }
  if (name === 'audit')     loadAuditLog();
  if (name === 'register')  loadClassesDropdowns();
}

document.querySelectorAll('.nav-links li').forEach(li => {
  li.addEventListener('click', () => showPage(li.dataset.page));
});

document.getElementById('menu-btn').addEventListener('click', () => {
  document.getElementById('sidebar').classList.toggle('collapsed');
  document.getElementById('main-content').classList.toggle('expanded');
});

// ── Dashboard ─────────────────────────────────────────────────────────────────

async function loadDashboard() {
  const [stats, todayRecs, absentList, auditRecs] = await Promise.all([
    apiFetch('/stats'),
    apiFetch(`/attendance?date=${today}`),
    apiFetch('/attendance/absent-today'),
    apiFetch('/audit?limit=10')
  ]);

  document.getElementById('stat-students').textContent = stats.total_students;
  document.getElementById('stat-today').textContent    = stats.present_today;
  document.getElementById('stat-absent').textContent   = stats.absent_today;
  document.getElementById('stat-days').textContent     = stats.distinct_days;
  document.getElementById('stat-total').textContent    = stats.total_records;

  const pList = document.getElementById('today-list');
  pList.innerHTML = todayRecs.length
    ? todayRecs.map(r => `<div class="att-item">
        <span class="att-dot green"></span>
        <span class="att-name">${escHtml(r.name)}</span>
        <span class="att-roll">${escHtml(r.roll)}</span>
        <span class="att-time">${r.time||''}</span>
      </div>`).join('')
    : '<div class="empty-msg">No attendance yet today</div>';

  const aList = document.getElementById('absent-list');
  aList.innerHTML = absentList.length
    ? absentList.map(r => `<div class="att-item">
        <span class="att-dot red"></span>
        <span class="att-name">${escHtml(r.name)}</span>
        <span class="att-roll">${escHtml(r.roll)}</span>
        <span class="att-time" style="color:var(--text-muted)">${r.class_name||''}</span>
      </div>`).join('')
    : '<div class="empty-msg">All students present!</div>';

  const feed = document.getElementById('activity-feed');
  feed.innerHTML = auditRecs.length
    ? auditRecs.map(r => `<div class="att-item">
        <span class="att-dot blue"></span>
        <span class="att-name" style="font-size:13px">${escHtml(r.action)}</span>
        <span class="att-time">${escHtml(r.timestamp||'')}</span>
      </div>`).join('')
    : '<div class="empty-msg">No activity yet</div>';
}

// ── Register Student (multi-photo + live face box) ────────────────────────────

let regStream = null;
let capturedImages = [];   // array of base64 strings
let regOverlayTimer = null;

async function loadClassesDropdowns() {
  const classes = await apiFetch('/classes');
  const selects = ['reg-class', 'student-class-filter', 'new-subject-class'];
  selects.forEach(id => {
    const sel = document.getElementById(id);
    if (!sel) return;
    const base = id === 'student-class-filter'
      ? '<option value="">All Classes</option>'
      : '<option value="">— None —</option>';
    sel.innerHTML = base + classes.map(c =>
      `<option value="${c.id}">${escHtml(c.name)}${c.section ? ' ' + escHtml(c.section) : ''}</option>`
    ).join('');
  });
}

document.getElementById('start-reg-cam').addEventListener('click', async () => {
  try {
    regStream = await navigator.mediaDevices.getUserMedia({ video: { width:640, height:480 } });
    const video = document.getElementById('reg-video');
    video.srcObject = regStream;
    video.style.display = 'block';
    document.getElementById('reg-cam-placeholder').style.display = 'none';
    document.getElementById('reg-preview').style.display = 'none';
    document.getElementById('reg-overlay').style.display = 'block';
    document.getElementById('capture-btn').disabled = false;
    setStatus('reg-status', 'Camera started. Position face in frame.', 'info');
    startRegFaceBox();
  } catch (e) {
    setStatus('reg-status', 'Camera error: ' + e.message, 'error');
  }
});

function startRegFaceBox() {
  const video   = document.getElementById('reg-video');
  const overlay = document.getElementById('reg-overlay');
  const hint    = document.getElementById('liveness-hint');

  regOverlayTimer = setInterval(async () => {
    if (!regStream) { clearInterval(regOverlayTimer); return; }
    const canvas = document.getElementById('reg-canvas');
    canvas.width = video.videoWidth || 640;
    canvas.height = video.videoHeight || 480;
    canvas.getContext('2d').drawImage(video, 0, 0);
    const b64 = canvas.toDataURL('image/jpeg', 0.6);

    try {
      const data = await apiFetch('/detect-face', {
        method: 'POST', body: JSON.stringify({ image: b64 })
      });
      overlay.width = video.offsetWidth;
      overlay.height = video.offsetHeight;
      const ctx = overlay.getContext('2d');
      ctx.clearRect(0, 0, overlay.width, overlay.height);
      if (data.box) {
        const b = data.box;
        ctx.strokeStyle = data.box.eyes_detected ? '#34d399' : '#fb923c';
        ctx.lineWidth = 2;
        ctx.strokeRect(
          b.x * overlay.width, b.y * overlay.height,
          b.w * overlay.width, b.h * overlay.height
        );
        hint.style.display = 'flex';
        hint.innerHTML = data.box.eyes_detected
          ? '<i class="fa fa-eye"></i> Eyes detected — liveness OK'
          : '<i class="fa fa-eye-slash"></i> Eyes not detected — hold still';
        hint.className = 'liveness-hint ' + (data.box.eyes_detected ? 'ok' : 'warn');
      } else {
        hint.style.display = 'none';
      }
    } catch(_) {}
  }, 800);
}

document.getElementById('capture-btn').addEventListener('click', () => {
  if (capturedImages.length >= 5) {
    setStatus('reg-status', 'Maximum 5 photos reached. Register or reset.', 'error');
    return;
  }
  const video = document.getElementById('reg-video');
  const canvas = document.getElementById('reg-canvas');
  canvas.width = video.videoWidth;
  canvas.height = video.videoHeight;
  canvas.getContext('2d').drawImage(video, 0, 0);
  const b64 = canvas.toDataURL('image/jpeg', 0.9);
  capturedImages.push(b64);

  // Add thumb
  const thumbs = document.getElementById('photo-thumbs');
  const img = document.createElement('img');
  img.src = b64; img.className = 'photo-thumb';
  thumbs.appendChild(img);

  document.getElementById('photo-count').textContent = capturedImages.length;
  document.getElementById('register-btn').disabled = false;
  document.getElementById('reset-photos-btn').disabled = false;

  setStatus('reg-status',
    capturedImages.length < 5
      ? `Photo ${capturedImages.length} captured. Take ${5 - capturedImages.length} more for best accuracy.`
      : 'All 5 photos captured! Ready to register.',
    'success'
  );
});

document.getElementById('reset-photos-btn').addEventListener('click', () => {
  capturedImages = [];
  document.getElementById('photo-thumbs').innerHTML = '';
  document.getElementById('photo-count').textContent = '0';
  document.getElementById('register-btn').disabled = true;
  document.getElementById('reset-photos-btn').disabled = true;
  setStatus('reg-status', 'Photos reset. Capture again.', 'info');
});

document.getElementById('register-btn').addEventListener('click', async () => {
  const name     = document.getElementById('reg-name').value.trim();
  const roll     = document.getElementById('reg-roll').value.trim();
  const class_id = document.getElementById('reg-class').value || null;
  if (!name) return setStatus('reg-status', 'Enter student name.', 'error');
  if (!roll) return setStatus('reg-status', 'Enter roll number.', 'error');
  if (!capturedImages.length) return setStatus('reg-status', 'Capture at least one photo.', 'error');

  setStatus('reg-status', 'Registering…', 'info');
  document.getElementById('register-btn').disabled = true;

  const data = await apiFetch('/students', {
    method: 'POST',
    body: JSON.stringify({ name, roll, images: capturedImages, class_id })
  });

  if (data.error) {
    setStatus('reg-status', data.error, 'error');
    document.getElementById('register-btn').disabled = false;
  } else {
    setStatus('reg-status', data.message, 'success');
    toast(data.message, 'success');
    document.getElementById('reg-name').value = '';
    document.getElementById('reg-roll').value = '';
    capturedImages = [];
    document.getElementById('photo-thumbs').innerHTML = '';
    document.getElementById('photo-count').textContent = '0';
    if (regStream) { regStream.getTracks().forEach(t => t.stop()); regStream = null; }
    clearInterval(regOverlayTimer);
  }
});

function setStatus(id, msg, type) {
  const el = document.getElementById(id);
  el.textContent = msg;
  el.className = 'status-msg ' + type;
}

// ── Mark Attendance (live box + confidence + manual) ──────────────────────────

let markStream = null;
let autoScanTimer = null;
let markBoxTimer = null;

async function loadSubjectsDropdown() {
  const subjects = await apiFetch('/subjects');
  ['mark-subject', 'new-subject-class'].forEach(id => {
    const sel = document.getElementById(id);
    if (!sel || id !== 'mark-subject') return;
    sel.innerHTML = '<option value="">— Any —</option>' +
      subjects.map(s => `<option value="${s.id}">${escHtml(s.name)}</option>`).join('');
  });
}

document.getElementById('start-mark-cam').addEventListener('click', async () => {
  try {
    markStream = await navigator.mediaDevices.getUserMedia({ video: { width:640, height:480 } });
    const video = document.getElementById('mark-video');
    video.srcObject = markStream;
    video.style.display = 'block';
    document.getElementById('mark-cam-placeholder').style.display = 'none';
    document.getElementById('mark-overlay').style.display = 'block';
    document.getElementById('start-mark-cam').style.display = 'none';
    document.getElementById('stop-mark-cam').style.display = 'inline-flex';
    document.getElementById('scan-once-btn').disabled = false;
    startMarkFaceBox();
    toast('Camera started', 'info');
  } catch (e) {
    toast('Camera error: ' + e.message, 'error');
  }
});

function startMarkFaceBox() {
  const video   = document.getElementById('mark-video');
  const overlay = document.getElementById('mark-overlay');
  markBoxTimer = setInterval(async () => {
    if (!markStream) { clearInterval(markBoxTimer); return; }
    const canvas = document.getElementById('mark-canvas');
    canvas.width = video.videoWidth || 640;
    canvas.height = video.videoHeight || 480;
    canvas.getContext('2d').drawImage(video, 0, 0);
    const b64 = canvas.toDataURL('image/jpeg', 0.5);
    try {
      const data = await apiFetch('/detect-face', {
        method: 'POST', body: JSON.stringify({ image: b64 })
      });
      overlay.width = video.offsetWidth;
      overlay.height = video.offsetHeight;
      const ctx = overlay.getContext('2d');
      ctx.clearRect(0, 0, overlay.width, overlay.height);
      if (data.box) {
        const b = data.box;
        ctx.strokeStyle = '#34d399';
        ctx.lineWidth = 2;
        ctx.strokeRect(b.x * overlay.width, b.y * overlay.height,
                       b.w * overlay.width, b.h * overlay.height);
        ctx.fillStyle = 'rgba(52,211,153,0.15)';
        ctx.fillRect(b.x * overlay.width, b.y * overlay.height,
                     b.w * overlay.width, b.h * overlay.height);
      }
    } catch(_) {}
  }, 500);
}

document.getElementById('stop-mark-cam').addEventListener('click', stopMarkCam);

function stopMarkCam() {
  if (markStream) { markStream.getTracks().forEach(t => t.stop()); markStream = null; }
  clearInterval(autoScanTimer); autoScanTimer = null;
  clearInterval(markBoxTimer); markBoxTimer = null;
  document.getElementById('mark-video').style.display = 'none';
  document.getElementById('mark-overlay').style.display = 'none';
  document.getElementById('mark-cam-placeholder').style.display = 'flex';
  document.getElementById('start-mark-cam').style.display = 'inline-flex';
  document.getElementById('stop-mark-cam').style.display = 'none';
  document.getElementById('scan-once-btn').disabled = true;
  document.getElementById('auto-scan').checked = false;
  document.getElementById('conf-meter').style.display = 'none';
}

document.getElementById('auto-scan').addEventListener('change', function () {
  if (this.checked) {
    if (!markStream) { toast('Start camera first', 'error'); this.checked = false; return; }
    autoScanTimer = setInterval(scanFrame, 3000);
    toast('Auto-scan enabled (every 3s)', 'info');
  } else {
    clearInterval(autoScanTimer); autoScanTimer = null;
    toast('Auto-scan disabled', 'info');
  }
});

document.getElementById('scan-once-btn').addEventListener('click', scanFrame);

async function scanFrame() {
  if (!markStream) return;
  const video   = document.getElementById('mark-video');
  const canvas  = document.getElementById('mark-canvas');
  canvas.width  = video.videoWidth;
  canvas.height = video.videoHeight;
  canvas.getContext('2d').drawImage(video, 0, 0);
  const imageB64  = canvas.toDataURL('image/jpeg', 0.85);
  const subjectId = document.getElementById('mark-subject').value || null;

  try {
    const data = await apiFetch('/mark-attendance', {
      method: 'POST',
      body: JSON.stringify({ image: imageB64, subject_id: subjectId })
    });
    showMarkResult(data);
    if (data.confidence !== undefined) showConfidence(data.confidence);
    if (data.status === 'marked') {
      loadMarkToday();
      toast(`✅ ${data.name} marked present (${data.confidence}%)`, 'success');
    }
  } catch (e) {
    showMarkResult({ status: 'error', message: 'Server error' });
  }
}

function showConfidence(pct) {
  const meter = document.getElementById('conf-meter');
  const bar   = document.getElementById('conf-bar');
  const label = document.getElementById('conf-pct');
  meter.style.display = 'flex';
  bar.style.width = pct + '%';
  bar.style.background = pct >= 70 ? 'var(--accent-green)' : pct >= 40 ? 'var(--accent-orange)' : 'var(--accent-red)';
  label.textContent = pct + '%';
}

function showMarkResult(data) {
  const el = document.getElementById('mark-result');
  el.classList.remove('hidden', 'marked', 'already', 'unknown', 'no-face');
  const icons   = { marked: '✅', already_marked: '⚠️', unknown: '❓', no_face: '👁️', error: '❌' };
  const classes = { marked: 'marked', already_marked: 'already', unknown: 'unknown', no_face: 'no-face', error: 'unknown' };
  el.textContent = (icons[data.status] || '') + ' ' + data.message;
  el.classList.add(classes[data.status] || 'no-face');
  clearTimeout(el._t);
  el._t = setTimeout(() => el.classList.add('hidden'), 5000);
}

async function loadMarkToday() {
  const records = await apiFetch(`/attendance?date=${today}`);
  const list = document.getElementById('mark-today-list');
  list.innerHTML = records.length
    ? records.map(r => `<div class="att-item">
        <span class="att-dot green"></span>
        <span class="att-name">${escHtml(r.name)}</span>
        <span class="att-roll">${escHtml(r.roll)}</span>
        <span class="att-time">${r.time||''}</span>
        <span class="method-badge ${r.method||'face'}">${r.method||'face'}</span>
      </div>`).join('')
    : '<div class="empty-msg">No attendance marked yet today</div>';
}

// Manual mark
document.getElementById('manual-date').value = today;
document.getElementById('manual-mark-btn').addEventListener('click', async () => {
  const roll     = document.getElementById('manual-roll').value.trim();
  const dateVal  = document.getElementById('manual-date').value;
  const subjectId= document.getElementById('mark-subject').value || null;
  if (!roll) return toast('Enter roll number', 'error');
  const data = await apiFetch('/mark-attendance/manual', {
    method: 'POST',
    body: JSON.stringify({ roll, date: dateVal, subject_id: subjectId })
  });
  if (data.error) toast(data.error, 'error');
  else { toast(data.message, 'success'); loadMarkToday(); }
});

// ── Records (pagination + export PDF/Excel/CSV) ───────────────────────────────

let currentRecords = [];
let recPage = 1;
const REC_PAGE_SIZE = 20;

async function loadRecords(records = null) {
  if (!records) records = await apiFetch('/attendance/all');
  currentRecords = records;
  recPage = 1;
  renderTable();
}

function renderTable() {
  const tbody = document.getElementById('att-tbody');
  const start = (recPage - 1) * REC_PAGE_SIZE;
  const slice = currentRecords.slice(start, start + REC_PAGE_SIZE);

  document.getElementById('rec-count').textContent =
    `${currentRecords.length} record${currentRecords.length !== 1 ? 's' : ''}`;

  if (!currentRecords.length) {
    tbody.innerHTML = '<tr><td colspan="8" class="empty-row">No records found</td></tr>';
    document.getElementById('pagination').innerHTML = '';
    return;
  }

  tbody.innerHTML = slice.map((r, i) => `
    <tr>
      <td>${start + i + 1}</td>
      <td>${escHtml(r.name)}</td>
      <td><code>${escHtml(r.roll)}</code></td>
      <td>${formatDate(r.date)}</td>
      <td>${r.time || '—'}</td>
      <td><span class="method-badge ${r.method||'face'}">${r.method||'face'}</span></td>
      <td>${r.subject_name ? escHtml(r.subject_name) : '—'}</td>
      <td><button class="icon-btn danger" onclick="deleteRecord(${r.id})" title="Delete"><i class="fa fa-trash"></i></button></td>
    </tr>`).join('');

  renderPagination();
}

function renderPagination() {
  const total = Math.ceil(currentRecords.length / REC_PAGE_SIZE);
  const pg = document.getElementById('pagination');
  if (total <= 1) { pg.innerHTML = ''; return; }
  let html = '';
  html += `<button class="pg-btn" ${recPage===1?'disabled':''} onclick="gotoPage(${recPage-1})"><i class="fa fa-chevron-left"></i></button>`;
  for (let i = 1; i <= total; i++) {
    if (i === 1 || i === total || Math.abs(i - recPage) <= 2)
      html += `<button class="pg-btn ${i===recPage?'active':''}" onclick="gotoPage(${i})">${i}</button>`;
    else if (Math.abs(i - recPage) === 3)
      html += `<span class="pg-ellipsis">…</span>`;
  }
  html += `<button class="pg-btn" ${recPage===total?'disabled':''} onclick="gotoPage(${recPage+1})"><i class="fa fa-chevron-right"></i></button>`;
  pg.innerHTML = html;
}

function gotoPage(n) {
  recPage = n;
  renderTable();
}

async function deleteRecord(id) {
  if (!confirm('Delete this attendance record?')) return;
  const data = await apiFetch(`/attendance/${id}`, { method: 'DELETE' });
  if (data.error) toast(data.error, 'error');
  else { toast('Record deleted', 'success'); loadRecords(); }
}

document.getElementById('filter-btn').addEventListener('click', async () => {
  const d = document.getElementById('filter-date').value;
  if (!d) return toast('Select a date', 'error');
  const records = await apiFetch(`/attendance?date=${d}`);
  currentRecords = records; recPage = 1; renderTable();
});

document.getElementById('filter-roll-btn').addEventListener('click', async () => {
  const roll = document.getElementById('filter-roll').value.trim();
  if (!roll) return toast('Enter roll number', 'error');
  const records = await apiFetch(`/attendance/student/${roll}`);
  currentRecords = records; recPage = 1; renderTable();
});

document.getElementById('show-all-btn').addEventListener('click', () => loadRecords());

// CSV Export
document.getElementById('export-csv-btn').addEventListener('click', () => {
  if (!currentRecords.length) return toast('No data to export', 'error');
  const headers = ['#','Name','Roll No.','Date','Time','Method','Subject'];
  const rows = currentRecords.map((r,i) =>
    [i+1, r.name, r.roll, r.date, r.time||'', r.method||'face', r.subject_name||''].join(',')
  );
  const csv = [headers.join(','), ...rows].join('\n');
  downloadBlob(new Blob([csv], {type:'text/csv'}), 'attendance.csv');
  toast('CSV exported!', 'success');
});

// Excel Export (simple TSV → .xls trick, works in Excel)
document.getElementById('export-excel-btn').addEventListener('click', () => {
  if (!currentRecords.length) return toast('No data to export', 'error');
  const headers = ['#','Name','Roll No.','Date','Time','Method','Subject'];
  const rows = currentRecords.map((r,i) =>
    [i+1, r.name, r.roll, r.date, r.time||'', r.method||'face', r.subject_name||''].join('\t')
  );
  const content = [headers.join('\t'), ...rows].join('\n');
  downloadBlob(new Blob([content], {type:'application/vnd.ms-excel'}), 'attendance.xls');
  toast('Excel exported!', 'success');
});

// PDF Export (using print-friendly page)
document.getElementById('export-pdf-btn').addEventListener('click', () => {
  if (!currentRecords.length) return toast('No data to export', 'error');
  const win = window.open('', '_blank');
  const rows = currentRecords.map((r,i) =>
    `<tr><td>${i+1}</td><td>${escHtml(r.name)}</td><td>${escHtml(r.roll)}</td>
     <td>${r.date}</td><td>${r.time||'—'}</td><td>${r.method||'face'}</td><td>${r.subject_name||'—'}</td></tr>`
  ).join('');
  win.document.write(`<!DOCTYPE html><html><head><title>Attendance Report</title>
    <style>body{font-family:Arial,sans-serif;padding:20px}
    table{width:100%;border-collapse:collapse}th,td{border:1px solid #ccc;padding:8px;font-size:13px}
    th{background:#f0f0f0}@media print{button{display:none}}</style></head>
    <body><h2>FaceAttend — Attendance Report</h2>
    <p>Generated: ${new Date().toLocaleString()}</p>
    <button onclick="window.print()" style="margin-bottom:12px;padding:8px 16px;cursor:pointer">Print / Save PDF</button>
    <table><thead><tr><th>#</th><th>Name</th><th>Roll No.</th><th>Date</th><th>Time</th><th>Method</th><th>Subject</th></tr></thead>
    <tbody>${rows}</tbody></table></body></html>`);
  win.document.close();
});

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
}

document.getElementById('filter-date').value = today;

// ── Students (search + photo + attendance %) ──────────────────────────────────

let allStudents = [];
let pctMap = {};

async function loadStudents() {
  const [students, pctData] = await Promise.all([
    apiFetch('/students'),
    apiFetch('/students/attendance-pct')
  ]);
  allStudents = students;
  pctMap = {};
  pctData.forEach(p => { pctMap[p.roll] = p; });
  renderStudentGrid();
}

function renderStudentGrid() {
  const search = (document.getElementById('student-search').value || '').toLowerCase();
  const classF = document.getElementById('student-class-filter').value;

  const filtered = allStudents.filter(s => {
    const matchSearch = !search || s.name.toLowerCase().includes(search) || s.roll.toLowerCase().includes(search);
    const matchClass  = !classF || String(s.class_id) === classF;
    return matchSearch && matchClass;
  });

  const grid = document.getElementById('students-grid');
  if (!filtered.length) {
    grid.innerHTML = '<div class="empty-msg">No students found</div>';
    return;
  }

  grid.innerHTML = filtered.map(s => {
    const pct  = pctMap[s.roll];
    const pctVal = pct ? pct.percentage : null;
    const pctColor = pctVal === null ? 'var(--text-muted)'
                   : pctVal >= 75 ? 'var(--accent-green)'
                   : pctVal >= 50 ? 'var(--accent-orange)'
                   : 'var(--accent-red)';
    const avatarHtml = s.image_path
      ? `<img src="${API}/students/${encodeURIComponent(s.roll)}/photo" class="student-avatar" alt="${escHtml(s.name)}" onerror="this.outerHTML='<div class=student-avatar-placeholder><i class=fa fa-user></i></div>'">`
      : `<div class="student-avatar-placeholder"><i class="fa fa-user"></i></div>`;
    const classLabel = s.class_name ? `<div class="student-class">${escHtml(s.class_name)}</div>` : '';
    const pctLabel = pctVal !== null
      ? `<div class="att-pct-pill" style="color:${pctColor}">${pctVal}%</div>`
      : '';

    return `<div class="student-card" id="sc-${s.roll}">
      <button class="student-delete" onclick="deleteStudent('${escHtml(s.roll)}','${escHtml(s.name)}')" title="Delete">
        <i class="fa fa-trash"></i>
      </button>
      ${avatarHtml}
      <div class="student-name">${escHtml(s.name)}</div>
      <div class="student-roll">${escHtml(s.roll)}</div>
      ${classLabel}
      ${pctLabel}
      ${pct ? `<div class="att-pct-bar-wrap"><div class="att-pct-bar" style="width:${pctVal}%;background:${pctColor}"></div></div>` : ''}
      <div class="student-date">Since ${formatDate(s.registered_on)}</div>
    </div>`;
  }).join('');
}

document.getElementById('student-search').addEventListener('input', renderStudentGrid);
document.getElementById('student-class-filter').addEventListener('change', renderStudentGrid);

async function deleteStudent(roll, name) {
  if (!confirm(`Delete ${name} (${roll})? This also removes all attendance records.`)) return;
  const data = await apiFetch(`/students/${roll}`, { method: 'DELETE' });
  if (data.error) return toast(data.error, 'error');
  toast(`${name} deleted`, 'success');
  const card = document.getElementById('sc-' + roll);
  if (card) card.remove();
}

// ── Analytics (Chart.js) ──────────────────────────────────────────────────────

let chartTrend = null;
let chartPie   = null;
let chartHeat  = null;

async function loadAnalytics() {
  const [stats, trend, heatmap, pctData] = await Promise.all([
    apiFetch('/stats'),
    apiFetch('/analytics/trend?days=30'),
    apiFetch('/analytics/heatmap'),
    apiFetch('/students/attendance-pct')
  ]);

  // ── Bar chart: daily trend ──────────────────────────────────────────────────
  const trendLabels = trend.map(t => formatDate(t.date));
  const trendData   = trend.map(t => t.count);

  if (chartTrend) chartTrend.destroy();
  chartTrend = new Chart(document.getElementById('chart-trend'), {
    type: 'bar',
    data: {
      labels: trendLabels,
      datasets: [{ label: 'Present', data: trendData,
        backgroundColor: 'rgba(79,142,247,0.6)', borderColor: '#4f8ef7',
        borderWidth: 1, borderRadius: 4 }]
    },
    options: { responsive: true, plugins: { legend: { display: false } },
      scales: { y: { beginAtZero: true, ticks: { stepSize: 1 } } } }
  });

  // ── Pie chart: today present vs absent ─────────────────────────────────────
  if (chartPie) chartPie.destroy();
  chartPie = new Chart(document.getElementById('chart-pie'), {
    type: 'doughnut',
    data: {
      labels: ['Present', 'Absent'],
      datasets: [{ data: [stats.present_today, stats.absent_today],
        backgroundColor: ['#34d399','#f87171'],
        borderColor: ['#34d399','#f87171'], borderWidth: 2 }]
    },
    options: { responsive: true, plugins: {
      legend: { position: 'bottom' },
      tooltip: { callbacks: {
        label: ctx => `${ctx.label}: ${ctx.raw} students`
      }}
    }}
  });

  // ── Weekly heatmap bar chart ────────────────────────────────────────────────
  const days = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
  const heatData = Array(7).fill(0);
  heatmap.forEach(h => { heatData[parseInt(h.dow)] = h.count; });

  if (chartHeat) chartHeat.destroy();
  chartHeat = new Chart(document.getElementById('chart-heatmap'), {
    type: 'bar',
    data: {
      labels: days,
      datasets: [{ label: 'Attendance', data: heatData,
        backgroundColor: 'rgba(167,139,250,0.6)', borderColor: '#a78bfa',
        borderWidth: 1, borderRadius: 4 }]
    },
    options: { responsive: true, plugins: { legend: { display: false } },
      scales: { y: { beginAtZero: true } } }
  });

  // ── Per-student attendance % list ──────────────────────────────────────────
  const list = document.getElementById('att-pct-list');
  if (!pctData.length) {
    list.innerHTML = '<div class="empty-msg">No data yet</div>';
    return;
  }
  list.innerHTML = pctData.map(p => {
    const color = p.percentage >= 75 ? 'var(--accent-green)'
                : p.percentage >= 50 ? 'var(--accent-orange)'
                : 'var(--accent-red)';
    return `<div class="pct-row">
      <span class="pct-name">${escHtml(p.name)}</span>
      <span class="pct-roll">${escHtml(p.roll)}</span>
      <div class="pct-bar-wrap">
        <div class="pct-bar" style="width:${p.percentage}%;background:${color}"></div>
      </div>
      <span class="pct-val" style="color:${color}">${p.percentage}%</span>
      <span class="pct-days">${p.days_present}/${p.total_days} days</span>
    </div>`;
  }).join('');
}

// ── Classes & Subjects & Users ────────────────────────────────────────────────

async function loadClassesList() {
  const classes = await apiFetch('/classes');
  const el = document.getElementById('classes-list');
  el.innerHTML = classes.length
    ? classes.map(c => `
        <div class="list-item">
          <span class="list-name">${escHtml(c.name)} ${c.section ? '<small>'+escHtml(c.section)+'</small>' : ''}</span>
          <span class="list-meta">${c.student_count} student(s)</span>
          ${currentUser?.role==='admin' ? `<button class="icon-btn danger" onclick="deleteClass(${c.id})"><i class="fa fa-trash"></i></button>` : ''}
        </div>`).join('')
    : '<div class="empty-msg">No classes yet</div>';
}

async function loadSubjectsList() {
  const subjects = await apiFetch('/subjects');
  const el = document.getElementById('subjects-list');
  el.innerHTML = subjects.length
    ? subjects.map(s => `
        <div class="list-item">
          <span class="list-name">${escHtml(s.name)}</span>
          <span class="list-meta">${s.class_name ? escHtml(s.class_name) : 'All classes'}</span>
          ${currentUser?.role==='admin' ? `<button class="icon-btn danger" onclick="deleteSubject(${s.id})"><i class="fa fa-trash"></i></button>` : ''}
        </div>`).join('')
    : '<div class="empty-msg">No subjects yet</div>';
}

async function loadUsersList() {
  const users = await apiFetch('/users');
  const el = document.getElementById('users-list');
  el.innerHTML = users.length
    ? users.map(u => `
        <div class="list-item">
          <span class="list-name">${escHtml(u.username)}</span>
          <span class="role-badge ${u.role}">${u.role}</span>
          <button class="icon-btn danger" onclick="deleteUser(${u.id},'${escHtml(u.username)}')"><i class="fa fa-trash"></i></button>
        </div>`).join('')
    : '<div class="empty-msg">No users</div>';
}

document.getElementById('add-class-btn').addEventListener('click', async () => {
  const name    = document.getElementById('new-class-name').value.trim();
  const section = document.getElementById('new-class-section').value.trim();
  if (!name) return toast('Enter class name', 'error');
  const data = await apiFetch('/classes', { method:'POST', body: JSON.stringify({name, section}) });
  if (data.error) toast(data.error, 'error');
  else { toast(data.message,'success'); document.getElementById('new-class-name').value='';
    loadClassesList(); loadClassesDropdowns(); }
});

document.getElementById('add-subject-btn').addEventListener('click', async () => {
  const name     = document.getElementById('new-subject-name').value.trim();
  const class_id = document.getElementById('new-subject-class').value || null;
  if (!name) return toast('Enter subject name', 'error');
  const data = await apiFetch('/subjects', { method:'POST', body: JSON.stringify({name, class_id}) });
  if (data.error) toast(data.error, 'error');
  else { toast(data.message,'success'); document.getElementById('new-subject-name').value='';
    loadSubjectsList(); loadSubjectsDropdown(); }
});

document.getElementById('add-user-btn').addEventListener('click', async () => {
  const username = document.getElementById('new-user-name').value.trim();
  const password = document.getElementById('new-user-pw').value;
  const role     = document.getElementById('new-user-role').value;
  if (!username || !password) return toast('Enter username and password', 'error');
  const data = await apiFetch('/users', { method:'POST', body: JSON.stringify({username,password,role}) });
  if (data.error) toast(data.error, 'error');
  else { toast(data.message,'success'); document.getElementById('new-user-name').value='';
    document.getElementById('new-user-pw').value=''; loadUsersList(); }
});

async function deleteClass(id) {
  if (!confirm('Delete this class?')) return;
  await apiFetch(`/classes/${id}`, { method:'DELETE' });
  toast('Class deleted','success'); loadClassesList(); loadClassesDropdowns();
}
async function deleteSubject(id) {
  if (!confirm('Delete this subject?')) return;
  await apiFetch(`/subjects/${id}`, { method:'DELETE' });
  toast('Subject deleted','success'); loadSubjectsList(); loadSubjectsDropdown();
}
async function deleteUser(id, name) {
  if (!confirm(`Delete user ${name}?`)) return;
  await apiFetch(`/users/${id}`, { method:'DELETE' });
  toast('User deleted','success'); loadUsersList();
}

// ── Audit Log ─────────────────────────────────────────────────────────────────

async function loadAuditLog() {
  const rows = await apiFetch('/audit?limit=100');
  const tbody = document.getElementById('audit-tbody');
  tbody.innerHTML = rows.length
    ? rows.map((r,i) => `<tr>
        <td>${i+1}</td>
        <td><strong>${escHtml(r.action)}</strong></td>
        <td>${escHtml(r.detail||'')}</td>
        <td>${escHtml(r.performed_by||'system')}</td>
        <td>${escHtml(r.timestamp||'')}</td>
      </tr>`).join('')
    : '<tr><td colspan="5" class="empty-row">No log entries</td></tr>';
}

// ── Init ──────────────────────────────────────────────────────────────────────
checkAuth();
