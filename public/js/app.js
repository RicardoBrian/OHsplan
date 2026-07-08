const PALETTE = [
  ['#667eea', '#764ba2'],
  ['#f093fb', '#f5576c'],
  ['#4facfe', '#00f2fe'],
  ['#43e97b', '#38f9d7'],
  ['#fa709a', '#fee140'],
  ['#30cfd0', '#330867'],
  ['#ff9a9e', '#f6416c'],
  ['#a18cd1', '#fbc2eb'],
];

let data = loadData();
let selectedColorIndex = 0;
let planDate = todayStr();
let viewMode = 'day';

let timerState = {
  subjectId: null,
  mode: 'work',
  remaining: 25 * 60,
  workMin: 25,
  breakMin: 5,
  running: false,
  intervalId: null,
};

function gradientFor(index) {
  const [a, b] = PALETTE[index % PALETTE.length];
  return `linear-gradient(135deg, ${a}, ${b})`;
}

function subjectById(id) {
  return data.subjects.find(s => s.id === id);
}

function persist() {
  saveData(data);
}

const WD_KR = ['일', '월', '화', '수', '목', '금', '토'];
const WD_KR_MON_FIRST = ['월', '화', '수', '목', '금', '토', '일'];

// ── 다크모드 ──
function toggleDark() {
  document.body.classList.toggle('dark');
  localStorage.setItem('ohsplan_dark', document.body.classList.contains('dark') ? '1' : '0');
}
if (localStorage.getItem('ohsplan_dark') === '1') document.body.classList.add('dark');

// ── 탭 전환 ──
function switchTab(name) {
  document.querySelectorAll('.tab-btn').forEach(el => el.classList.toggle('active', el.dataset.tab === name));
  document.querySelectorAll('.view').forEach(el => el.classList.toggle('active', el.id === `view-${name}`));
  if (name === 'plan') renderPlan();
  if (name === 'subjects') renderSubjects();
  if (name === 'timer') renderTimer();
  if (name === 'stats') renderStats();
}

// ── 플랜 탭: 일간/주간/월간 공용 네비게이션 ──
function setViewMode(mode) {
  viewMode = mode;
  document.querySelectorAll('.mode-btn').forEach(el => el.classList.toggle('active', el.dataset.mode === mode));
  document.getElementById('dayView').classList.toggle('hidden', mode !== 'day');
  document.getElementById('weekView').classList.toggle('hidden', mode !== 'week');
  document.getElementById('monthView').classList.toggle('hidden', mode !== 'month');
  renderPlan();
}

function navigatePeriod(delta) {
  if (viewMode === 'day') planDate = addDays(planDate, delta);
  else if (viewMode === 'week') planDate = addDays(planDate, delta * 7);
  else planDate = addMonths(planDate, delta);
  renderPlan();
}

function goToday() {
  planDate = todayStr();
  renderPlan();
}

function jumpToDay(dateStr) {
  planDate = dateStr;
  setViewMode('day');
}

function renderPlan() {
  if (viewMode === 'day') renderDayView();
  else if (viewMode === 'week') renderWeekView();
  else renderMonthView();
}

function formatDateTitle(dateStr) {
  const [, m, d] = dateStr.split('-').map(Number);
  const weekday = WD_KR[new Date(dateStr + 'T00:00:00').getDay()];
  const today = todayStr();
  let rel = '';
  if (dateStr === today) rel = ' · 오늘';
  else if (dateStr === addDays(today, -1)) rel = ' · 어제';
  else if (dateStr === addDays(today, 1)) rel = ' · 내일';
  return `${m}월 ${d}일 ${weekday}요일${rel}`;
}

// ── 일간 뷰 ──
function renderDayView() {
  document.getElementById('dayTitle').textContent = formatDateTitle(planDate);

  const totalOfDay = data.sessions.filter(s => s.date === planDate).reduce((sum, s) => sum + s.duration, 0);
  document.getElementById('dayTimeStat').textContent = `⏱ ${formatDuration(totalOfDay)}`;
  document.getElementById('dayStreakStat').textContent = `🔥 ${data.streak.count}일 연속`;

  const subjectSelect = document.getElementById('taskSubjectSelect');
  const hasSubjects = data.subjects.length > 0;
  subjectSelect.innerHTML = data.subjects.map(s => `<option value="${s.id}">${escapeHtml(s.name)}</option>`).join('');
  document.getElementById('taskAddForm').classList.toggle('hidden', !hasSubjects);
  document.getElementById('taskNoSubjectHint').classList.toggle('hidden', hasSubjects);

  const tasks = data.tasks.filter(t => t.date === planDate).sort((a, b) => (a.done === b.done ? 0 : a.done ? 1 : -1));
  const listEl = document.getElementById('taskList');
  if (!hasSubjects) {
    listEl.innerHTML = '';
    return;
  }
  if (!tasks.length) {
    listEl.innerHTML = `<div class="empty-state"><div class="icon">📝</div><p>등록된 할 일이 없어요.</p></div>`;
    return;
  }
  listEl.innerHTML = tasks.map(t => {
    const subj = subjectById(t.subjectId);
    const grad = subj ? gradientFor(subj.colorIndex) : 'transparent';
    return `
      <div class="task-item ${t.done ? 'done' : ''}">
        <button class="task-check" onclick="toggleTask('${t.id}')">${t.done ? '✓' : ''}</button>
        <span class="task-dot" style="background:${grad}"></span>
        <span class="task-title">${escapeHtml(t.title)}</span>
        <span class="task-subject">${subj ? escapeHtml(subj.name) : ''}</span>
        <button class="task-del" onclick="deleteTask('${t.id}')">✕</button>
      </div>`;
  }).join('');
}

function addTask() {
  const subjectId = document.getElementById('taskSubjectSelect').value;
  const input = document.getElementById('taskTitleInput');
  const title = input.value.trim();
  if (!subjectId || !title) return;
  data.tasks.push({ id: uid(), subjectId, title, date: planDate, done: false });
  input.value = '';
  persist();
  renderDayView();
}

function toggleTask(id) {
  const task = data.tasks.find(t => t.id === id);
  if (!task) return;
  task.done = !task.done;
  if (task.done) markActivity(data);
  persist();
  renderPlan();
}

function deleteTask(id) {
  data.tasks = data.tasks.filter(t => t.id !== id);
  persist();
  renderPlan();
}

// ── 주간 뷰 ──
function renderWeekView() {
  const weekStart = getWeekStart(planDate);
  const weekDates = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
  const weekEnd = weekDates[6];
  const today = todayStr();

  const fmt = ds => `${Number(ds.slice(5, 7))}/${Number(ds.slice(8, 10))}`;
  document.getElementById('weekTitle').textContent = `${fmt(weekStart)} - ${fmt(weekEnd)}`;
  document.getElementById('weeklyGoalInput').value = data.weeklyGoals[weekStart] || '';

  const weekTotal = data.sessions.filter(s => weekDates.includes(s.date)).reduce((sum, s) => sum + s.duration, 0);
  document.getElementById('weekTimeStat').textContent = `⏱ 이번 주 ${formatDuration(weekTotal)}`;

  const grid = document.getElementById('weekGrid');
  grid.innerHTML = weekDates.map((dateStr, i) => {
    const tasks = data.tasks.filter(t => t.date === dateStr);
    const MAX_SHOW = 4;
    const taskHtml = tasks.slice(0, MAX_SHOW).map(t => {
      const subj = subjectById(t.subjectId);
      const grad = subj ? gradientFor(subj.colorIndex) : 'transparent';
      return `<div class="week-mini-task ${t.done ? 'done' : ''}"><span class="week-mini-dot" style="background:${grad}"></span>${escapeHtml(t.title)}</div>`;
    }).join('');
    const more = tasks.length > MAX_SHOW ? `<div class="week-mini-more">+${tasks.length - MAX_SHOW}개 더</div>` : '';
    return `
      <div class="week-day-col ${dateStr === today ? 'is-today' : ''}" onclick="jumpToDay('${dateStr}')">
        <div class="week-day-head">
          <div class="wd">${WD_KR_MON_FIRST[i]}</div>
          <div class="dt">${Number(dateStr.slice(8, 10))}</div>
        </div>
        ${taskHtml}${more}
      </div>`;
  }).join('');
}

function saveWeeklyGoal() {
  const weekStart = getWeekStart(planDate);
  data.weeklyGoals[weekStart] = document.getElementById('weeklyGoalInput').value.trim();
  persist();
}

// ── 월간 뷰 ──
function renderMonthView() {
  const monthKey = getMonthKey(planDate);
  const [y, m] = monthKey.split('-').map(Number);
  const today = todayStr();

  document.getElementById('monthTitle').textContent = `${y}년 ${m}월`;
  document.getElementById('monthlyGoalInput').value = data.monthlyGoals[monthKey] || '';

  const monthTotal = data.sessions.filter(s => getMonthKey(s.date) === monthKey).reduce((sum, s) => sum + s.duration, 0);
  document.getElementById('monthTimeStat').textContent = `⏱ ${m}월 총 ${formatDuration(monthTotal)}`;

  const firstOfMonth = `${monthKey}-01`;
  const firstWeekday = new Date(firstOfMonth + 'T00:00:00').getDay();
  const gridStart = addDays(firstOfMonth, -(firstWeekday === 0 ? 6 : firstWeekday - 1));
  const daysInMonth = new Date(y, m, 0).getDate();
  const lastOfMonth = `${monthKey}-${String(daysInMonth).padStart(2, '0')}`;
  const lastWeekday = new Date(lastOfMonth + 'T00:00:00').getDay();
  const gridEnd = addDays(lastOfMonth, (7 - lastWeekday) % 7);

  const cells = [];
  for (let cursor = gridStart; ; cursor = addDays(cursor, 1)) {
    cells.push(cursor);
    if (cursor === gridEnd) break;
  }

  const grid = document.getElementById('monthGrid');
  grid.innerHTML = cells.map(dateStr => {
    const inMonth = getMonthKey(dateStr) === monthKey;
    const tasks = data.tasks.filter(t => t.date === dateStr);
    const doneCount = tasks.filter(t => t.done).length;
    let dot = '';
    if (tasks.length) dot = `<span class="month-dot ${doneCount === tasks.length ? '' : 'partial'}"></span>`;
    return `
      <div class="month-cell ${inMonth ? '' : 'dim'} ${dateStr === today ? 'is-today' : ''}" onclick="jumpToDay('${dateStr}')">
        <span>${Number(dateStr.slice(8, 10))}</span>
        ${dot}
      </div>`;
  }).join('');
}

function saveMonthlyGoal() {
  const monthKey = getMonthKey(planDate);
  data.monthlyGoals[monthKey] = document.getElementById('monthlyGoalInput').value.trim();
  persist();
}

// ── 과목 탭 ──
function renderColorPicker() {
  const picker = document.getElementById('colorPicker');
  picker.innerHTML = PALETTE.map((_, i) =>
    `<div class="color-swatch ${i === selectedColorIndex ? 'selected' : ''}" style="background:${gradientFor(i)}" onclick="selectColor(${i})"></div>`
  ).join('');
}

function selectColor(i) {
  selectedColorIndex = i;
  renderColorPicker();
}

function renderSubjects() {
  renderColorPicker();
  const grid = document.getElementById('subjectGrid');
  if (!data.subjects.length) {
    grid.innerHTML = `<div class="empty-state"><div class="icon">📚</div><p>아직 등록된 과목이 없어요. 위에서 추가해보세요.</p></div>`;
    return;
  }
  grid.innerHTML = data.subjects.map(s => {
    const totalTime = data.sessions.filter(sess => sess.subjectId === s.id).reduce((sum, sess) => sum + sess.duration, 0);
    return `
      <div class="subject-card">
        <button class="subject-del" onclick="deleteSubject('${s.id}')">✕</button>
        <div class="subject-icon" style="background:${gradientFor(s.colorIndex)}">${escapeHtml(s.name[0] || '?')}</div>
        <div class="subject-name">${escapeHtml(s.name)}</div>
        <div class="subject-time">${formatDuration(totalTime)}</div>
      </div>`;
  }).join('');
}

function addSubject() {
  const input = document.getElementById('subjectNameInput');
  const name = input.value.trim();
  if (!name) return;
  data.subjects.push({ id: uid(), name, colorIndex: selectedColorIndex });
  input.value = '';
  persist();
  renderSubjects();
}

function deleteSubject(id) {
  if (!confirm('이 과목을 삭제할까요? 관련된 할 일과 학습 기록도 함께 삭제돼요.')) return;
  data.subjects = data.subjects.filter(s => s.id !== id);
  data.tasks = data.tasks.filter(t => t.subjectId !== id);
  data.sessions = data.sessions.filter(s => s.subjectId !== id);
  persist();
  renderSubjects();
}

// ── 타이머 탭 ──
function renderTimer() {
  const select = document.getElementById('timerSubjectSelect');
  select.innerHTML = data.subjects.map(s => `<option value="${s.id}">${escapeHtml(s.name)}</option>`).join('');
  if (!timerState.subjectId && data.subjects.length) timerState.subjectId = data.subjects[0].id;
  select.value = timerState.subjectId || '';
  document.getElementById('timerNoSubjectHint').classList.toggle('hidden', data.subjects.length > 0);
  document.getElementById('timerCard').classList.toggle('hidden', data.subjects.length === 0);
  updateTimerDisplay();
}

function updateTimerDisplay() {
  const m = Math.floor(timerState.remaining / 60).toString().padStart(2, '0');
  const s = (timerState.remaining % 60).toString().padStart(2, '0');
  document.getElementById('timerTime').textContent = `${m}:${s}`;
  document.getElementById('timerModeLabel').textContent = timerState.mode === 'work' ? '집중 시간' : '휴식 시간';
  document.getElementById('timerStartBtn').textContent = timerState.running ? '일시정지' : '시작';
  document.getElementById('workMinInput').value = timerState.workMin;
  document.getElementById('breakMinInput').value = timerState.breakMin;
  document.getElementById('workMinInput').disabled = timerState.running;
  document.getElementById('breakMinInput').disabled = timerState.running;
}

function onTimerSubjectChange() {
  timerState.subjectId = document.getElementById('timerSubjectSelect').value;
}

function applyTimerSettings() {
  if (timerState.running) return;
  timerState.workMin = Math.max(1, parseInt(document.getElementById('workMinInput').value, 10) || 25);
  timerState.breakMin = Math.max(1, parseInt(document.getElementById('breakMinInput').value, 10) || 5);
  timerState.remaining = (timerState.mode === 'work' ? timerState.workMin : timerState.breakMin) * 60;
  updateTimerDisplay();
}

function toggleTimer() {
  if (!timerState.subjectId) return;
  timerState.running = !timerState.running;
  if (timerState.running) {
    timerState.intervalId = setInterval(timerTick, 1000);
  } else {
    clearInterval(timerState.intervalId);
  }
  updateTimerDisplay();
}

function resetTimer() {
  clearInterval(timerState.intervalId);
  timerState.running = false;
  timerState.mode = 'work';
  timerState.remaining = timerState.workMin * 60;
  document.getElementById('timerMsg').textContent = '';
  updateTimerDisplay();
}

function timerTick() {
  timerState.remaining--;
  if (timerState.remaining <= 0) {
    clearInterval(timerState.intervalId);
    timerState.running = false;
    if (timerState.mode === 'work') {
      data.sessions.push({
        id: uid(),
        subjectId: timerState.subjectId,
        date: todayStr(),
        duration: timerState.workMin * 60,
      });
      markActivity(data);
      persist();
      timerState.mode = 'break';
      timerState.remaining = timerState.breakMin * 60;
      document.getElementById('timerMsg').textContent = '집중 완료! 잠시 휴식할까요? 🎉';
    } else {
      timerState.mode = 'work';
      timerState.remaining = timerState.workMin * 60;
      document.getElementById('timerMsg').textContent = '휴식 끝, 다시 집중해볼까요? 💪';
    }
  }
  updateTimerDisplay();
}

// ── 통계 탭 ──
function renderStats() {
  document.getElementById('statsStreak').textContent = `🔥 ${data.streak.count}일`;

  const today = new Date();
  const weekDates = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date(today.getTime() - i * 86400000);
    const tz = d.getTimezoneOffset() * 60000;
    weekDates.push(new Date(d.getTime() - tz).toISOString().slice(0, 10));
  }
  const weekTotal = data.sessions.filter(s => weekDates.includes(s.date)).reduce((sum, s) => sum + s.duration, 0);
  document.getElementById('statsWeekTotal').textContent = formatDuration(weekTotal);

  // 과목별 비중
  const bySubject = document.getElementById('bySubjectStats');
  if (!data.subjects.length) {
    bySubject.innerHTML = `<div class="empty-state"><div class="icon">📊</div><p>과목을 등록하고 타이머를 사용하면 통계가 쌓여요.</p></div>`;
  } else {
    const totals = data.subjects.map(s => ({
      subject: s,
      total: data.sessions.filter(sess => sess.subjectId === s.id).reduce((sum, sess) => sum + sess.duration, 0),
    }));
    const maxTotal = Math.max(1, ...totals.map(t => t.total));
    bySubject.innerHTML = totals.map(t => `
      <div class="bar-row">
        <div class="bar-row-label"><span>${escapeHtml(t.subject.name)}</span><span>${formatDuration(t.total)}</span></div>
        <div class="bar-track"><div class="bar-fill" style="width:${(t.total / maxTotal) * 100}%;background:${gradientFor(t.subject.colorIndex)}"></div></div>
      </div>`).join('');
  }

  // 최근 7일 차트
  const dayLabels = weekDates.map(ds => WD_KR[new Date(ds + 'T00:00:00').getDay()]);
  const dayTotals = weekDates.map(ds => data.sessions.filter(s => s.date === ds).reduce((sum, s) => sum + s.duration, 0));
  const maxDay = Math.max(1, ...dayTotals);
  const chart = document.getElementById('weekChart');
  chart.innerHTML = weekDates.map((ds, i) => `
    <div class="week-col">
      <div class="week-bar" style="height:${(dayTotals[i] / maxDay) * 100}%"></div>
      <div class="week-day-label">${dayLabels[i]}</div>
    </div>`).join('');
}

// ── util ──
function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

// ── init ──
document.getElementById('taskTitleInput').addEventListener('keydown', e => { if (e.key === 'Enter') addTask(); });
document.getElementById('subjectNameInput').addEventListener('keydown', e => { if (e.key === 'Enter') addSubject(); });
switchTab('plan');
