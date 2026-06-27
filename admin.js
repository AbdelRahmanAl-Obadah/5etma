// =====================================================
// admin.js — لوحة تحكم الأدمن
// =====================================================

let isAuthenticated = false;
let membersSnap = [];

document.addEventListener('DOMContentLoaded', () => {
  initDarkMode();
  showPinModal();
});

// ---- Dark Mode ----
function initDarkMode() {
  const isDark = localStorage.getItem('darkMode') === 'true';
  if (isDark) document.body.classList.add('dark-mode');
  const moon = document.getElementById('iconMoon');
  const sun  = document.getElementById('iconSun');
  if (moon) moon.style.display = isDark ? 'none' : '';
  if (sun)  sun.style.display  = isDark ? '' : 'none';
}
function toggleDarkMode() {
  const isDark = document.body.classList.toggle('dark-mode');
  localStorage.setItem('darkMode', isDark);
  const moon = document.getElementById('iconMoon');
  const sun  = document.getElementById('iconSun');
  if (moon) moon.style.display = isDark ? 'none' : '';
  if (sun)  sun.style.display  = isDark ? '' : 'none';
}

// ---- PIN Auth ----
function showPinModal() {
  document.getElementById('pinOverlay').style.display = 'flex';
  document.getElementById('adminContent').style.display = 'none';
}
function checkPin() {
  const pin = document.getElementById('pinInput').value.trim();
  if (pin === ADMIN_PIN) {
    isAuthenticated = true;
    document.getElementById('pinOverlay').style.display = 'none';
    document.getElementById('adminContent').style.display = 'block';
    loadAll();
  } else {
    document.getElementById('pinError').textContent = '❌ الرمز غير صحيح، حاول مجدداً';
    document.getElementById('pinInput').value = '';
    document.getElementById('pinInput').focus();
  }
}
document.addEventListener('keydown', e => {
  if (e.key === 'Enter' && document.getElementById('pinOverlay').style.display !== 'none') {
    checkPin();
  }
});

// ---- تحميل كل شيء ----
async function loadAll() {
  await loadSettings();
  await loadMembers();
  await loadKhatmaHistory();
}

// ---- الإعدادات ----
async function loadSettings() {
  try {
    const doc = await db.collection(SETTINGS_COLLECTION).doc(SETTINGS_DOC).get();
    if (doc.exists) {
      const s = doc.data();
      setVal('weekStart',  s.weekStart  || '');
      setVal('weekEnd',    s.weekEnd    || '');
      const wnEl = document.getElementById('weekNumber');
      if (wnEl) wnEl.value = s.weekNumber || 1;
      // عرض اسم الختمة الحالية
      const curNameEl = document.getElementById('currentKhatmaName');
      if (curNameEl) curNameEl.textContent = s.khatmaName || 'عن روح جمال الدويري';
    }
  } catch (e) { console.error(e); }
}

async function saveSettings() {
  const weekStart  = getVal('weekStart');
  const weekEnd    = getVal('weekEnd');
  const weekNumber = parseInt(document.getElementById('weekNumber')?.value) || 1;
  if (!weekStart || !weekEnd) {
    showToast('⚠️ يرجى ملء تواريخ الأسبوع', true);
    return;
  }
  try {
    await db.collection(SETTINGS_COLLECTION).doc(SETTINGS_DOC).set({
      weekStart, weekEnd, weekNumber,
      updatedAt: firebase.firestore.FieldValue.serverTimestamp()
    }, { merge: true });
    showToast('✅ تم حفظ الإعدادات');
  } catch (e) {
    showToast('❌ فشل الحفظ', true);
    console.error(e);
  }
}

// ---- سجل الختمات ----
async function loadKhatmaHistory() {
  try {
    const snap = await db.collection('khatmaat')
      .orderBy('completedAt', 'desc')
      .limit(10)
      .get();
    const list = document.getElementById('khatmaHistoryList');
    if (!list) return;
    if (snap.empty) {
      list.innerHTML = `<p style="color:var(--text3); font-size:0.95rem;">لا توجد ختمات مسجّلة بعد.</p>`;
      return;
    }
    list.innerHTML = snap.docs.map((d, i) => {
      const k = d.data();
      let dateStr = '—';
      if (k.completedAt) {
        try { dateStr = new Date(k.completedAt.toDate()).toLocaleDateString('ar-EG', { year:'numeric', month:'long', day:'numeric' }); } catch(e) {}
      }
      if (dateStr === '—' && k.completedAtIso) {
        try { dateStr = new Date(k.completedAtIso).toLocaleDateString('ar-EG', { year:'numeric', month:'long', day:'numeric' }); } catch(e) {}
      }
      return `
        <div style="display:flex; align-items:center; gap:12px; padding:12px 14px;
                    background:var(--surface2); border-radius:10px; border:1px solid var(--border);">
          <div style="font-family:var(--font-display); font-size:1.3rem; color:var(--gold); min-width:32px; text-align:center;">
            ${toArabicNum(i + 1)}
          </div>
          <div style="flex:1;">
            <div style="font-weight:700; color:var(--text); font-size:1rem;">🕊️ ${escHtml(k.name)}</div>

            <div style="font-size:0.82rem; color:var(--text3); margin-top:2px;">
              الأسبوع ${toArabicNum(k.weekNumber || '—')} — ${dateStr}
            </div>
          </div>
        </div>
      `;
    }).join('');
  } catch (e) {
    console.error('khatma history error:', e);
  }
}

// ---- تمت الختمة ----
async function completeKhatma() {
  const khatmaName = getVal('newKhatmaName');
  if (!khatmaName) {
    showToast('⚠️ أدخل اسم الختمة (مثال: عن روح جمال الدويري)', true);
    document.getElementById('newKhatmaName').focus();
    return;
  }

  if (!confirm(`تأكيد إتمام الختمة:\n"${khatmaName}"\n\nسيتم:\n• حفظ الختمة في السجل\n• تقديم كل عضو جزءاً\n• إعادة ضبط القراءة\n• الانتقال للأسبوع التالي`)) return;

  try {
    const settingsDoc = await db.collection(SETTINGS_COLLECTION).doc(SETTINGS_DOC).get();
    const s = settingsDoc.exists ? settingsDoc.data() : {};
    const currentWeekNum = s.weekNumber || 1;
    const newWeekNum = currentWeekNum + 1;

    // تواريخ الأسبوع الجديد (+7)
    let newWeekStart = '', newWeekEnd = '';
    if (s.weekEnd) {
      const d = new Date(s.weekEnd + 'T00:00:00');
      d.setDate(d.getDate() + 1);
      newWeekStart = d.toISOString().split('T')[0];
      d.setDate(d.getDate() + 6);
      newWeekEnd = d.toISOString().split('T')[0];
    }

    const snap = await db.collection(MEMBERS_COLLECTION).get();
    const batch = db.batch();

    // تقديم الأجزاء وإعادة الضبط (مع مسح doneByDevice)
    snap.docs.forEach(d => {
      const currentPart = d.data().originalPart || d.data().order || 1;
      const nextPart = (currentPart % 30) + 1;
      batch.update(d.ref, {
        originalPart:  nextPart,
        done:          false,
        readAt:        null,
        doneByDevice:  null
      });
    });

    // حفظ الإعدادات الجديدة مع اسم الختمة الجديدة
    const settingsRef = db.collection(SETTINGS_COLLECTION).doc(SETTINGS_DOC);
    batch.set(settingsRef, {
      weekNumber: newWeekNum,
      weekStart:  newWeekStart || getVal('weekStart'),
      weekEnd:    newWeekEnd   || getVal('weekEnd'),
      khatmaName: khatmaName,
      updatedAt:  firebase.firestore.FieldValue.serverTimestamp()
    }, { merge: true });

    // تسجيل الختمة المكتملة في سجل الختمات
    const khatmaRef = db.collection('khatmaat').doc();
    const nowIso = new Date().toISOString();
    batch.set(khatmaRef, {
      name:           khatmaName,
      weekNumber:     currentWeekNum,
      completedAt:    firebase.firestore.FieldValue.serverTimestamp(),
      completedAtIso: nowIso
    });

    await batch.commit();

    // تحديث الواجهة
    document.getElementById('newKhatmaName').value = '';
    const wnEl = document.getElementById('weekNumber');
    if (wnEl) wnEl.value = newWeekNum;
    if (newWeekStart) setVal('weekStart', newWeekStart);
    if (newWeekEnd)   setVal('weekEnd',   newWeekEnd);
    const curNameEl = document.getElementById('currentKhatmaName');
    if (curNameEl) curNameEl.textContent = khatmaName;

    showToast(`✅ تمت الختمة! بدأ الأسبوع ${toArabicNum(newWeekNum)} 🎉`);
    await loadMembers();
    await loadKhatmaHistory();
  } catch (e) {
    showToast('❌ حدث خطأ', true);
    console.error(e);
  }
}

// ---- الأعضاء ----
async function loadMembers() {
  try {
    const snap = await db.collection(MEMBERS_COLLECTION).orderBy('order').get();
    membersSnap = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    renderMembersAdmin();
  } catch (e) {
    console.error(e);
    showToast('❌ تعذّر تحميل الأعضاء', true);
  }
}

function renderMembersAdmin() {
  const list = document.getElementById('membersAdminList');
  if (!list) return;
  if (membersSnap.length === 0) {
    list.innerHTML = `<div class="state-msg" style="padding:20px">لا يوجد أعضاء بعد.</div>`;
    return;
  }
  list.innerHTML = membersSnap.map(m => `
    <div class="member-admin-row" id="row-${m.id}">
      <div class="member-admin-num">${toArabicNum(m.order)}</div>
      <input type="text" class="field-input" value="${escHtml(m.name)}"
             id="name-${m.id}" style="max-width:260px; padding:8px 12px; font-size:1rem;">
      <div class="member-admin-part">الجزء ${toArabicNum(m.originalPart || m.order)}</div>
      <input type="number" title="تعديل الجزء"
             class="field-input" value="${m.originalPart || m.order}"
             id="part-${m.id}" min="1" max="30"
             style="max-width:80px; padding:8px 10px; text-align:center;">
      <button class="btn btn-primary btn-sm" onclick="updateMember('${m.id}')">💾</button>
      <button class="btn btn-danger btn-sm" onclick="deleteMember('${m.id}', '${escHtml(m.name)}')">🗑️</button>
    </div>
  `).join('');
}

async function updateMember(id) {
  const name = document.getElementById(`name-${id}`)?.value.trim();
  const part = parseInt(document.getElementById(`part-${id}`)?.value);
  if (!name) { showToast('⚠️ الاسم لا يمكن أن يكون فارغاً', true); return; }
  if (!part || part < 1 || part > 30) { showToast('⚠️ رقم الجزء يجب أن يكون بين 1 و 30', true); return; }
  try {
    await db.collection(MEMBERS_COLLECTION).doc(id).update({ name, originalPart: part });
    showToast(`✅ تم تحديث: ${name}`);
    await loadMembers();
  } catch (e) {
    showToast('❌ فشل التحديث', true);
    console.error(e);
  }
}

async function deleteMember(id, name) {
  if (!confirm(`هل تريد حذف العضو "${name}" نهائياً؟`)) return;
  try {
    await db.collection(MEMBERS_COLLECTION).doc(id).delete();
    showToast(`🗑️ تم حذف: ${name}`);
    await loadMembers();
  } catch (e) {
    showToast('❌ فشل الحذف', true);
  }
}

async function addMember() {
  const input = document.getElementById('newMemberName');
  const name = input?.value.trim();
  if (!name) { showToast('⚠️ أدخل اسم العضو', true); return; }
  const nextOrder = membersSnap.length + 1;
  if (nextOrder > 30) { showToast('⚠️ وصلت للحد الأقصى (30 عضو)', true); return; }
  try {
    await db.collection(MEMBERS_COLLECTION).add({
      name, order: nextOrder, originalPart: nextOrder,
      done: false, readAt: null, doneByDevice: null,
      createdAt: firebase.firestore.FieldValue.serverTimestamp()
    });
    input.value = '';
    showToast(`✅ تمت إضافة: ${name}`);
    await loadMembers();
  } catch (e) {
    showToast('❌ فشلت الإضافة', true);
    console.error(e);
  }
}

async function bulkAddMembers() {
  const raw = document.getElementById('bulkNames')?.value.trim();
  if (!raw) { showToast('⚠️ أدخل الأسماء', true); return; }
  const names = raw.split('\n').map(n => n.trim()).filter(Boolean);
  if (names.length === 0) { showToast('⚠️ لا توجد أسماء صالحة', true); return; }
  if (names.length > 30)  { showToast('⚠️ الحد الأقصى 30 اسماً', true); return; }
  if (!confirm(`سيتم إضافة ${names.length} عضواً وحذف القديم. متابعة؟`)) return;
  try {
    const batch = db.batch();
    const old = await db.collection(MEMBERS_COLLECTION).get();
    old.docs.forEach(d => batch.delete(d.ref));
    names.forEach((name, i) => {
      const ref = db.collection(MEMBERS_COLLECTION).doc();
      batch.set(ref, {
        name, order: i + 1, originalPart: i + 1,
        done: false, readAt: null, doneByDevice: null,
        createdAt: firebase.firestore.FieldValue.serverTimestamp()
      });
    });
    await batch.commit();
    document.getElementById('bulkNames').value = '';
    showToast(`✅ تمت إضافة ${names.length} عضو`);
    await loadMembers();
  } catch (e) {
    showToast('❌ حدث خطأ', true);
    console.error(e);
  }
}

async function resetAllReadStatus() {
  if (!confirm('هل تريد إعادة ضبط حالة القراءة لجميع الأعضاء؟')) return;
  try {
    const snap = await db.collection(MEMBERS_COLLECTION).get();
    const batch = db.batch();
    snap.docs.forEach(d => batch.update(d.ref, { done: false, readAt: null, doneByDevice: null }));
    await batch.commit();
    showToast('✅ تمت إعادة الضبط للجميع');
    await loadMembers();
  } catch (e) {
    showToast('❌ فشلت العملية', true);
    console.error(e);
  }
}

// ---- Helpers ----
function getVal(id) { return document.getElementById(id)?.value.trim() || ''; }
function setVal(id, v) { const el = document.getElementById(id); if (el) el.value = v; }
function toArabicNum(n) {
  return String(n).replace(/\d/g, d => '٠١٢٣٤٥٦٧٨٩'[d]);
}
function escHtml(str) {
  const div = document.createElement('div');
  div.textContent = str || '';
  return div.innerHTML;
}
function showToast(msg, isError = false) {
  let t = document.getElementById('toastEl');
  if (!t) { t = document.createElement('div'); t.id = 'toastEl'; t.className = 'toast'; document.body.appendChild(t); }
  t.textContent = msg;
  t.className = 'toast' + (isError ? ' error' : '');
  t.classList.add('show');
  setTimeout(() => t.classList.remove('show'), 3000);
}