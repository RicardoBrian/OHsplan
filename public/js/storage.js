// 데이터 저장소 계층 — 지금은 localStorage를 쓰지만, 나중에 Firebase로 옮길 때
// 이 파일의 함수 시그니처(loadData/saveData)만 비동기 버전으로 바꾸면 되도록 분리해뒀다.
const STORAGE_KEY = 'ohsplan_data_v1';

const DEFAULT_DATA = {
  subjects: [],
  tasks: [],
  sessions: [],
  streak: { count: 0, lastDate: null },
  weeklyGoals: {},
  monthlyGoals: {},
};

function cloneDefault() {
  return JSON.parse(JSON.stringify(DEFAULT_DATA));
}

function loadData() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return cloneDefault();
    const parsed = JSON.parse(raw);
    return Object.assign(cloneDefault(), parsed);
  } catch (e) {
    return cloneDefault();
  }
}

function saveData(data) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
}

function uid() {
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
}

function toDateStr(d) {
  const tz = d.getTimezoneOffset() * 60000;
  return new Date(d.getTime() - tz).toISOString().slice(0, 10);
}

function todayStr() {
  return toDateStr(new Date());
}

function addDays(dateStr, n) {
  const d = new Date(dateStr + 'T00:00:00');
  d.setDate(d.getDate() + n);
  return toDateStr(d);
}

// 월 넘어갈 때 일자 overflow로 달이 튀지 않도록 월 단위로만 계산한다.
function addMonths(dateStr, n) {
  const [y, m, d] = dateStr.split('-').map(Number);
  const total = y * 12 + (m - 1) + n;
  const newY = Math.floor(total / 12);
  const newM = total % 12;
  const daysInMonth = new Date(newY, newM + 1, 0).getDate();
  const newD = Math.min(d, daysInMonth);
  return `${newY}-${String(newM + 1).padStart(2, '0')}-${String(newD).padStart(2, '0')}`;
}

// 월요일 시작 주간 기준
function getWeekStart(dateStr) {
  const day = new Date(dateStr + 'T00:00:00').getDay();
  const offset = day === 0 ? 6 : day - 1;
  return addDays(dateStr, -offset);
}

function getMonthKey(dateStr) {
  return dateStr.slice(0, 7);
}

function markActivity(data) {
  const today = todayStr();
  if (data.streak.lastDate === today) return;
  const yStr = addDays(today, -1);
  data.streak.count = data.streak.lastDate === yStr ? data.streak.count + 1 : 1;
  data.streak.lastDate = today;
}

function formatDuration(seconds) {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (h > 0) return `${h}시간 ${m}분`;
  if (m > 0) return `${m}분`;
  return `${seconds}초`;
}
