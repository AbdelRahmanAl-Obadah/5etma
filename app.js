// =====================================================
// app.js — الواجهة الرئيسية لخدمة القرآن الكريم
// =====================================================

let membersListener = null;
let settingsListener = null;
let allMembers = [];
let currentSettings = {};

// حالة الأزرار المشغولة (loading state)
const pendingIds = new Set();

// ---- Device ID: معرّف فريد لكل جهاز/متصفح ----
function getDeviceId() {
  let id = localStorage.getItem('qDeviceId');
  if (!id) {
    id = 'dev_' + Math.random().toString(36).slice(2) + Date.now().toString(36);
    localStorage.setItem('qDeviceId', id);
  }
  return id;
}
const MY_DEVICE_ID = getDeviceId();

document.addEventListener('DOMContentLoaded', () => {
  initDarkMode();
  listenSettings();
  listenMembers();
});

// ---- Dark Mode ----
function initDarkMode() {
  if (localStorage.getItem('darkMode') === 'true') {
    document.body.classList.add('dark-mode');
    updateDarkBtn(true);
  }
}
function toggleDarkMode() {
  const isDark = document.body.classList.toggle('dark-mode');
  localStorage.setItem('darkMode', isDark);
  updateDarkBtn(isDark);
}
function updateDarkBtn(isDark) {
  const moon = document.getElementById('iconMoon');
  const sun  = document.getElementById('iconSun');
  if (moon) moon.style.display = isDark ? 'none' : '';
  if (sun)  sun.style.display  = isDark ? '' : 'none';
}

// ---- إعدادات ----
function listenSettings() {
  if (settingsListener) settingsListener();
  settingsListener = db.collection(SETTINGS_COLLECTION).doc(SETTINGS_DOC)
    .onSnapshot(doc => {
      currentSettings = doc.exists ? doc.data() : {};
      renderWeekBanner();
      if (allMembers.length > 0) renderMembers(allMembers);
    });
}

function getCurrentPart(originalPart) {
  return originalPart;
}

// ---- شريط الأسبوع ----
function renderWeekBanner() {
  const weekNum    = currentSettings.weekNumber || 1;
  const khatmaName = currentSettings.khatmaName || 'عن روح جمال الدويري';
  const ws = currentSettings.weekStart ? formatDateAr(currentSettings.weekStart) : '—';
  const we = currentSettings.weekEnd   ? formatDateAr(currentSettings.weekEnd)   : '—';
  const el = document.getElementById('weekBanner');
  if (!el) return;
  el.innerHTML = `
    <div class="week-info">
      <span class="week-label">📅 الفترة الحالية</span>
      <span class="week-dates">${ws} — ${we}</span>
      <span class="khatma-name-display">🕊️ ${escHtml(khatmaName)}</span>
    </div>
    <div class="week-number-badge">الأسبوع ${toArabicNum(weekNum)}</div>
  `;
}

// ---- الاستماع للأعضاء ----
function listenMembers() {
  if (membersListener) membersListener();
  membersListener = db.collection(MEMBERS_COLLECTION)
    .orderBy('order')
    .onSnapshot(snapshot => {
      allMembers = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      document.getElementById('loadingState').style.display = 'none';
      document.getElementById('membersColumns').style.display = 'grid';
      renderMembers(allMembers);
    }, err => {
      console.error(err);
      document.getElementById('loadingState').innerHTML = '⚠️ تعذّر تحميل البيانات';
    });
}

// ---- عرض الأعضاء في عمودين ----
function renderMembers(members) {
  const query = (document.getElementById('searchInput')?.value || '').trim();

  // بحث بالاسم أو برقم الجزء
  const filtered = query
    ? members.filter(m => {
        const part = String(m.originalPart || m.order || '');
        const partAr = part.replace(/\d/g, d => '٠١٢٣٤٥٦٧٨٩'[d]);
        return (m.name && m.name.includes(query)) ||
               part === query ||
               partAr === query;
      })
    : members;

  const sorted = [...filtered].map(m => ({
    ...m,
    currentPart: getCurrentPart(m.originalPart || m.order || 1)
  })).sort((a, b) => a.currentPart - b.currentPart);

  const right = sorted.filter(m => m.currentPart <= 15);
  const left  = sorted.filter(m => m.currentPart > 15);

  document.getElementById('colRight').innerHTML = renderCol(right);
  document.getElementById('colLeft').innerHTML  = renderCol(left);

  updateProgress(members);
}

function renderCol(members) {
  if (members.length === 0) return '';
  return members.map((m, i) => {
    const isDone    = m.done === true;
    const isMyRead  = isDone && m.doneByDevice === MY_DEVICE_ID;
    const readTime  = m.readAt ? formatDateTime(m.readAt) : '';
    const isPending = pendingIds.has(m.id);

    // SVGs
    const svgCheck = `<svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>`;
    const svgUndo  = `<svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 1 0 .49-3.41"/></svg>`;
    const svgLock  = `<svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>`;
    const svgSpin  = `<svg class="btn-spinner" xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round"><circle cx="12" cy="12" r="10" stroke-opacity="0.25"/><path d="M12 2a10 10 0 0 1 10 10" /></svg>`;

    let btnHtml = '';
    if (isPending) {
      btnHtml = `<button class="read-btn mark-done no-print btn-loading" disabled>
        ${svgSpin}
      </button>`;
    } else if (!isDone) {
      btnHtml = `<button class="read-btn mark-done no-print" onclick="markDone('${m.id}')">
        ${svgCheck} تمت
      </button>`;
    } else if (isMyRead) {
      btnHtml = `<button class="read-btn mark-undone no-print" onclick="markUndone('${m.id}')">
        ${svgUndo} إلغاء
      </button>`;
    } else {
      btnHtml = `<button class="read-btn mark-locked no-print" disabled title="سُجِّلت من جهاز آخر">
        ${svgLock}
      </button>`;
    }

    return `
      <div class="member-card ${isDone ? 'done' : ''}" id="card-${m.id}"
           style="animation-delay:${i * 25}ms">
        <div class="rank-badge">${toArabicNum(m.currentPart)}</div>
        <div class="member-info">
          <div class="member-name">${escHtml(m.name)}</div>
          <div class="member-meta">
            <span class="part-badge">الجزء ${toArabicNum(m.currentPart)}</span>
            <span class="status-text ${isDone ? 'done-txt' : ''}">
              ${isDone ? '✅ تمت القراءة' : '⏳ لم يُقرأ'}
            </span>
          </div>
          ${readTime ? `<div class="read-time">🕐 ${readTime}</div>` : ''}
        </div>
        ${btnHtml}
      </div>
    `;
  }).join('');
}

// ---- تسجيل القراءة (مع optimistic update) ----
async function markDone(memberId) {
  // هل هذا الجهاز سجّل لشخص آخر؟
  const alreadyMarked = allMembers.find(
    m => m.done === true && m.doneByDevice === MY_DEVICE_ID
  );
  if (alreadyMarked) {
    showToast(`⚠️ سجّلت "${escHtml(alreadyMarked.name)}" مسبقاً — ألغِها أولاً`, true);
    const card = document.getElementById(`card-${alreadyMarked.id}`);
    if (card) {
      card.style.outline = '3px solid var(--gold)';
      card.scrollIntoView({ behavior: 'smooth', block: 'center' });
      setTimeout(() => card.style.outline = '', 2500);
    }
    return;
  }

  // optimistic: اعمل التغيير فوراً على الشاشة
  pendingIds.add(memberId);
  const memberIdx = allMembers.findIndex(m => m.id === memberId);
  const original  = memberIdx !== -1 ? { ...allMembers[memberIdx] } : null;
  if (memberIdx !== -1) {
    allMembers[memberIdx] = {
      ...allMembers[memberIdx],
      done: true,
      doneByDevice: MY_DEVICE_ID,
      readAt: { toDate: () => new Date() }
    };
  }
  renderMembers(allMembers);

  try {
    await db.collection(MEMBERS_COLLECTION).doc(memberId).update({
      done:         true,
      readAt:       firebase.firestore.FieldValue.serverTimestamp(),
      doneByDevice: MY_DEVICE_ID
    });
    showToast('✅ تم تسجيل القراءة');
  } catch (err) {
    // rollback لو فشل
    if (memberIdx !== -1 && original) allMembers[memberIdx] = original;
    showToast('❌ حدث خطأ، حاول مجدداً', true);
    console.error(err);
  } finally {
    pendingIds.delete(memberId);
    renderMembers(allMembers);
  }
}

// ---- إلغاء القراءة (مع optimistic update) ----
async function markUndone(memberId) {
  const member = allMembers.find(m => m.id === memberId);
  if (!member || member.doneByDevice !== MY_DEVICE_ID) {
    showToast('🚫 لا يمكنك إلغاء قراءة شخص آخر', true);
    return;
  }

  // optimistic
  pendingIds.add(memberId);
  const memberIdx = allMembers.findIndex(m => m.id === memberId);
  const original  = memberIdx !== -1 ? { ...allMembers[memberIdx] } : null;
  if (memberIdx !== -1) {
    allMembers[memberIdx] = {
      ...allMembers[memberIdx],
      done: false, readAt: null, doneByDevice: null
    };
  }
  renderMembers(allMembers);

  try {
    await db.collection(MEMBERS_COLLECTION).doc(memberId).update({
      done:         false,
      readAt:       null,
      doneByDevice: null
    });
    showToast('↩️ تم إلغاء التسجيل');
  } catch (err) {
    if (memberIdx !== -1 && original) allMembers[memberIdx] = original;
    showToast('❌ حدث خطأ، حاول مجدداً', true);
    console.error(err);
  } finally {
    pendingIds.delete(memberId);
    renderMembers(allMembers);
  }
}

// ---- شريط التقدم (مع %) ----
function updateProgress(members) {
  const total = members.length;
  const done  = members.filter(m => m.done === true).length;
  const pct   = total > 0 ? Math.round((done / total) * 100) : 0;
  const countEl = document.getElementById('progressCount');
  const pctEl   = document.getElementById('progressPct');
  const fillEl  = document.getElementById('progressFill');
  if (countEl) countEl.textContent = `${toArabicNum(done)} من ${toArabicNum(total)}`;
  if (pctEl)   pctEl.textContent   = `${toArabicNum(pct)}٪`;
  if (fillEl)  fillEl.style.width  = `${pct}%`;
}

// ---- بحث ----
function onSearch() {
  if (allMembers.length > 0) renderMembers(allMembers);
}

// ---- Helpers ----
function toArabicNum(n) {
  return String(n).replace(/\d/g, d => '٠١٢٣٤٥٦٧٨٩'[d]);
}
function formatDateAr(dateStr) {
  if (!dateStr) return '—';
  const d = new Date(dateStr + 'T00:00:00');
  return d.toLocaleDateString('ar-EG', { weekday:'long', year:'numeric', month:'long', day:'numeric' });
}
function formatDateTime(ts) {
  if (!ts) return '';
  const d = ts.toDate ? ts.toDate() : new Date(ts);
  return d.toLocaleString('ar-EG', { month:'short', day:'numeric', hour:'2-digit', minute:'2-digit' });
}
function escHtml(str) {
  const div = document.createElement('div');
  div.textContent = str || '';
  return div.innerHTML;
}
function showToast(msg, isError = false) {
  let t = document.getElementById('toastEl');
  t.textContent = msg;
  t.className = 'toast' + (isError ? ' error' : '');
  t.classList.add('show');
  setTimeout(() => t.classList.remove('show'), 2800);
}

document.addEventListener('DOMContentLoaded', () => {
  initDarkMode();
  listenSettings();
  listenMembers();
});

// ---- Dark Mode ----
function initDarkMode() {
  if (localStorage.getItem('darkMode') === 'true') {
    document.body.classList.add('dark-mode');
    updateDarkBtn(true);
  }
}
function toggleDarkMode() {
  const isDark = document.body.classList.toggle('dark-mode');
  localStorage.setItem('darkMode', isDark);
  updateDarkBtn(isDark);
}
function updateDarkBtn(isDark) {
  const moon = document.getElementById('iconMoon');
  const sun  = document.getElementById('iconSun');
  if (moon) moon.style.display = isDark ? 'none' : '';
  if (sun)  sun.style.display  = isDark ? '' : 'none';
}

// ---- إعدادات ----
function listenSettings() {
  if (settingsListener) settingsListener();
  settingsListener = db.collection(SETTINGS_COLLECTION).doc(SETTINGS_DOC)
    .onSnapshot(doc => {
      currentSettings = doc.exists ? doc.data() : {};
      renderWeekBanner();
      if (allMembers.length > 0) renderMembers(allMembers);
    });
}

function getCurrentPart(originalPart) {
  return originalPart;
}

// ---- شريط الأسبوع ----
function renderWeekBanner() {
  const weekNum    = currentSettings.weekNumber || 1;
  const khatmaName = currentSettings.khatmaName || 'عن روح جمال الدويري';
  const ws = currentSettings.weekStart ? formatDateAr(currentSettings.weekStart) : '—';
  const we = currentSettings.weekEnd   ? formatDateAr(currentSettings.weekEnd)   : '—';
  const el = document.getElementById('weekBanner');
  if (!el) return;
  el.innerHTML = `
    <div class="week-info">
      <span class="week-label">📅 الفترة الحالية</span>
      <span class="week-dates">${ws} — ${we}</span>
      <span class="khatma-name-display">🕊️ ${escHtml(khatmaName)}</span>
    </div>
    <div class="week-number-badge">الأسبوع ${toArabicNum(weekNum)}</div>
  `;
}

// ---- الاستماع للأعضاء ----
function listenMembers() {
  if (membersListener) membersListener();
  membersListener = db.collection(MEMBERS_COLLECTION)
    .orderBy('order')
    .onSnapshot(snapshot => {
      allMembers = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      document.getElementById('loadingState').style.display = 'none';
      document.getElementById('membersColumns').style.display = 'grid';
      renderMembers(allMembers);
    }, err => {
      console.error(err);
      document.getElementById('loadingState').innerHTML = '⚠️ تعذّر تحميل البيانات';
    });
}

// ---- عرض الأعضاء في عمودين ----
function renderMembers(members) {
  const query = (document.getElementById('searchInput')?.value || '').trim();

  const filtered = query
    ? members.filter(m => m.name && m.name.includes(query))
    : members;

  const sorted = [...filtered].map(m => ({
    ...m,
    currentPart: getCurrentPart(m.originalPart || m.order || 1)
  })).sort((a, b) => a.currentPart - b.currentPart);

  const right = sorted.filter(m => m.currentPart <= 15);
  const left  = sorted.filter(m => m.currentPart > 15);

  document.getElementById('colRight').innerHTML = renderCol(right);
  document.getElementById('colLeft').innerHTML  = renderCol(left);

  updateProgress(members);
}

function renderCol(members) {
  if (members.length === 0) return '';
  return members.map((m, i) => {
    const isDone   = m.done === true;
    const isMyRead = isDone && m.doneByDevice === MY_DEVICE_ID;
    const readTime = m.readAt ? formatDateTime(m.readAt) : '';

    let btnHtml = '';
    if (!isDone) {
      btnHtml = `<button class="read-btn mark-done no-print" onclick="markDone('${m.id}')">
        <svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
        تمت
      </button>`;
    } else if (isMyRead) {
      btnHtml = `<button class="read-btn mark-undone no-print" onclick="markUndone('${m.id}')">
        <svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 1 0 .49-3.41"/></svg>
        إلغاء
      </button>`;
    } else {
      btnHtml = `<button class="read-btn mark-locked no-print" disabled title="سُجِّلت من جهاز آخر">
        <svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
      </button>`;
    }

    return `
      <div class="member-card ${isDone ? 'done' : ''}" id="card-${m.id}"
           style="animation-delay:${i * 25}ms">
        <div class="rank-badge">${toArabicNum(m.currentPart)}</div>
        <div class="member-info">
          <div class="member-name">${escHtml(m.name)}</div>
          <div class="member-meta">
            <span class="part-badge">الجزء ${toArabicNum(m.currentPart)}</span>
            <span class="status-text ${isDone ? 'done-txt' : ''}">
              ${isDone ? '✅ تمت القراءة' : '⏳ لم يُقرأ'}
            </span>
          </div>
          ${readTime ? `<div class="read-time">🕐 ${readTime}</div>` : ''}
        </div>
        ${btnHtml}
      </div>
    `;
  }).join('');
}

// ---- تسجيل القراءة ----
async function markDone(memberId) {
  // هل هذا الجهاز سجّل لشخص آخر؟
  const alreadyMarked = allMembers.find(
    m => m.done === true && m.doneByDevice === MY_DEVICE_ID
  );
  if (alreadyMarked) {
    showToast(`⚠️ سجّلت "${escHtml(alreadyMarked.name)}" مسبقاً — ألغِها أولاً`, true);
    const card = document.getElementById(`card-${alreadyMarked.id}`);
    if (card) {
      card.style.outline = '3px solid var(--gold)';
      card.scrollIntoView({ behavior: 'smooth', block: 'center' });
      setTimeout(() => card.style.outline = '', 2500);
    }
    return;
  }

  try {
    await db.collection(MEMBERS_COLLECTION).doc(memberId).update({
      done:         true,
      readAt:       firebase.firestore.FieldValue.serverTimestamp(),
      doneByDevice: MY_DEVICE_ID
    });
    showToast('✅ تم تسجيل القراءة');
  } catch (err) {
    showToast('❌ حدث خطأ، حاول مجدداً', true);
    console.error(err);
  }
}

// ---- إلغاء القراءة (فقط إذا أنا سجّلتها) ----
async function markUndone(memberId) {
  const member = allMembers.find(m => m.id === memberId);
  if (!member || member.doneByDevice !== MY_DEVICE_ID) {
    showToast('🚫 لا يمكنك إلغاء قراءة شخص آخر', true);
    return;
  }
  try {
    await db.collection(MEMBERS_COLLECTION).doc(memberId).update({
      done:         false,
      readAt:       null,
      doneByDevice: null
    });
    showToast('↩️ تم إلغاء التسجيل');
  } catch (err) {
    showToast('❌ حدث خطأ، حاول مجدداً', true);
    console.error(err);
  }
}

// ---- شريط التقدم ----
function updateProgress(members) {
  const total = members.length;
  const done  = members.filter(m => m.done === true).length;
  const pct   = total > 0 ? Math.round((done / total) * 100) : 0;
  const countEl = document.getElementById('progressCount');
  const fillEl  = document.getElementById('progressFill');
  if (countEl) countEl.textContent = `${toArabicNum(done)} من ${toArabicNum(total)}`;
  if (fillEl)  fillEl.style.width  = `${pct}%`;
}

// ---- بحث ----
function onSearch() {
  if (allMembers.length > 0) renderMembers(allMembers);
}

// ---- Helpers ----
function toArabicNum(n) {
  return String(n).replace(/\d/g, d => '٠١٢٣٤٥٦٧٨٩'[d]);
}
function formatDateAr(dateStr) {
  if (!dateStr) return '—';
  const d = new Date(dateStr + 'T00:00:00');
  return d.toLocaleDateString('ar-EG', { weekday:'long', year:'numeric', month:'long', day:'numeric' });
}
function formatDateTime(ts) {
  if (!ts) return '';
  const d = ts.toDate ? ts.toDate() : new Date(ts);
  return d.toLocaleString('ar-EG', { month:'short', day:'numeric', hour:'2-digit', minute:'2-digit' });
}
function escHtml(str) {
  const div = document.createElement('div');
  div.textContent = str || '';
  return div.innerHTML;
}
function showToast(msg, isError = false) {
  let t = document.getElementById('toastEl');
  t.textContent = msg;
  t.className = 'toast' + (isError ? ' error' : '');
  t.classList.add('show');
  setTimeout(() => t.classList.remove('show'), 2800);
}