// =====================================================
// app.js — الواجهة الرئيسية لخدمة القرآن الكريم
// =====================================================

let membersListener = null;
let settingsListener = null;
let allMembers = [];
let currentSettings = {};

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
  const btn = document.getElementById('darkModeBtn');
  if (btn) btn.textContent = isDark ? '☀️' : '🌙';
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
      <span style="display:inline-block; margin-top:4px; font-size:0.88rem; color:var(--green); font-weight:600;">
        🕊️ ${escHtml(khatmaName)}
      </span>
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
      btnHtml = `<button class="read-btn mark-done no-print" onclick="markDone('${m.id}')">✔️ تمت</button>`;
    } else if (isMyRead) {
      btnHtml = `<button class="read-btn mark-undone no-print" onclick="markUndone('${m.id}')">↩️ إلغاء</button>`;
    } else {
      btnHtml = `<button class="read-btn mark-locked no-print" disabled title="سُجِّلت من جهاز آخر">🔒</button>`;
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

// ---- طباعة ----
function printList() {
  const container = document.querySelector(".container");
  if (container) {
    const now = new Date();
    container.setAttribute("data-print-date",
      now.toLocaleDateString("ar-EG", { weekday:"long", year:"numeric", month:"long", day:"numeric" })
    );
  }
  window.print();
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