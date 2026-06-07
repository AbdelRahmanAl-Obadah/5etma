// =====================================================
// app.js — الواجهة الرئيسية لخدمة القرآن الكريم
// =====================================================

let membersListener = null;
let settingsListener = null;
let allMembers = [];
let currentSettings = {};

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

// ---- رقم الأسبوع (مخزّن من الأدمن، لا يُحسب تلقائياً) ----
function getCurrentWeekOffset() {
  return currentSettings.weekNumber ? currentSettings.weekNumber - 1 : 0;
}

function getCurrentPart(originalPart) {
  // الجزء الحالي = originalPart مباشرة (يُحدَّث عند كل ختمة)
  return originalPart;
}

// ---- شريط الأسبوع ----
function renderWeekBanner() {
  const weekNum = currentSettings.weekNumber || 1;
  const ws = currentSettings.weekStart ? formatDateAr(currentSettings.weekStart) : '—';
  const we = currentSettings.weekEnd   ? formatDateAr(currentSettings.weekEnd)   : '—';
  const el = document.getElementById('weekBanner');
  if (el) el.innerHTML = `
    <div class="week-info">
      <span class="week-label">📅 الفترة الحالية</span>
      <span class="week-dates">${ws} — ${we}</span>
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

  // ترتيب حسب الجزء الحالي
  const sorted = [...filtered].map(m => ({
    ...m,
    currentPart: getCurrentPart(m.originalPart || m.order || 1)
  })).sort((a, b) => a.currentPart - b.currentPart);

  // تقسيم: 1-15 يمين، 16-30 يسار
  const right = sorted.filter(m => m.currentPart <= 15);
  const left  = sorted.filter(m => m.currentPart > 15);

  const colRight = document.getElementById('colRight');
  const colLeft  = document.getElementById('colLeft');

  colRight.innerHTML = renderCol(right);
  colLeft.innerHTML  = renderCol(left);

  updateProgress(members);
}

function renderCol(members) {
  if (members.length === 0) return '';
  return members.map((m, i) => {
    const isDone = m.done === true;
    const readTime = m.readAt ? formatDateTime(m.readAt) : '';
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
        <button class="read-btn ${isDone ? 'mark-undone' : 'mark-done'} no-print"
                onclick="toggleRead('${m.id}', ${isDone})">
          ${isDone ? '↩️ إلغاء' : '✔️ تمت'}
        </button>
      </div>
    `;
  }).join('');
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

// ---- تبديل القراءة ----
async function toggleRead(memberId, currentDone) {
  try {
    await db.collection(MEMBERS_COLLECTION).doc(memberId).update({
      done:   !currentDone,
      readAt: !currentDone ? firebase.firestore.FieldValue.serverTimestamp() : null
    });
    showToast(!currentDone ? '✅ تم تسجيل القراءة' : '↩️ تم الإلغاء');
  } catch (err) {
    showToast('❌ حدث خطأ، حاول مجدداً', true);
  }
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
  div.textContent = str;
  return div.innerHTML;
}

function showToast(msg, isError = false) {
  let t = document.getElementById('toastEl');
  t.textContent = msg;
  t.className = 'toast' + (isError ? ' error' : '');
  t.classList.add('show');
  setTimeout(() => t.classList.remove('show'), 2800);
}