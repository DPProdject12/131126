/* =====================================================================
   Bus Simulator — интерактивный тренажёр по архитектуре шин
   app.js — вся логика приложения (vanilla JS, ES6+, без сборщиков)
   ===================================================================== */

'use strict';

/* =====================================================================
   0. ХРАНЕНИЕ СОСТОЯНИЯ (localStorage)
   ===================================================================== */

const STORAGE_KEY = 'busSimulatorState_v1';

function defaultState() {
  return {
    student: { fio: '', group: '', date: '' },
    // quiz[n] = null (не отвечено) | { answerText, status, correctAnswerText }
    quiz: { 1: null, 2: null, 3: null, 4: null, 5: null },
    m1: { bits: 16 },
    m2: { bits: 8, freq: 100, mux: false, endian: 'little' },
    m3: { cyclesRead: 0, cyclesWrite: 0, sync: true, wait: 0 },
    m5: { placements: [], ioMode: 'mmio' }, // [{id, label, start, size}]
    m8: { arch: 'von' }
  };
}

let state = loadState();

function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return defaultState();
    const parsed = JSON.parse(raw);
    // мягкое слияние с дефолтом, чтобы не ломаться при неполных старых данных
    const def = defaultState();
    return {
      student: Object.assign(def.student, parsed.student),
      quiz: Object.assign(def.quiz, parsed.quiz),
      m1: Object.assign(def.m1, parsed.m1),
      m2: Object.assign(def.m2, parsed.m2),
      m3: Object.assign(def.m3, parsed.m3),
      m5: Object.assign(def.m5, parsed.m5),
      m8: Object.assign(def.m8, parsed.m8)
    };
  } catch (e) {
    return defaultState();
  }
}

function saveState() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

/* =====================================================================
   УТИЛИТЫ
   ===================================================================== */

function fmtInt(n) { return Math.round(n).toLocaleString('ru-RU'); }
function fmtFloat(n, digits) { return n.toLocaleString('ru-RU', { maximumFractionDigits: digits == null ? 2 : digits }); }

function toHex(value, bits) {
  const digits = Math.max(1, Math.ceil(bits / 4));
  return '0x' + value.toString(16).toUpperCase().padStart(digits, '0');
}

function bytesToHuman(bytes) {
  if (bytes < 1024) return bytes + ' байт';
  const units = ['КБ', 'МБ', 'ГБ', 'ТБ', 'ПБ'];
  let val = bytes, i = -1;
  while (val >= 1024 && i < units.length - 1) { val /= 1024; i++; }
  return fmtFloat(val, 2) + ' ' + units[i];
}

const TRANSLIT_MAP = {
  а:'a', б:'b', в:'v', г:'g', д:'d', е:'e', ё:'e', ж:'zh', з:'z', и:'i',
  й:'i', к:'k', л:'l', м:'m', н:'n', о:'o', п:'p', р:'r', с:'s', т:'t',
  у:'u', ф:'f', х:'h', ц:'c', ч:'ch', ш:'sh', щ:'sch', ъ:'', ы:'y', ь:'',
  э:'e', ю:'yu', я:'ya'
};
function translit(str) {
  return str.split('').map(ch => {
    const lower = ch.toLowerCase();
    if (TRANSLIT_MAP.hasOwnProperty(lower)) {
      const mapped = TRANSLIT_MAP[lower];
      if (ch !== lower && mapped.length) return mapped[0].toUpperCase() + mapped.slice(1);
      return mapped;
    }
    return ch;
  }).join('');
}

function simpleHash(str) {
  let h = 0;
  for (let i = 0; i < str.length; i++) {
    h = (h * 31 + str.charCodeAt(i)) >>> 0;
  }
  return h.toString(16).toUpperCase().padStart(8, '0');
}

function todayISO() {
  const d = new Date();
  const pad = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
function isoToDisplay(iso) {
  if (!iso) return '';
  const [y, m, d] = iso.split('-');
  return `${d}.${m}.${y}`;
}
function isoToDashed(iso) {
  if (!iso) return '';
  const [y, m, d] = iso.split('-');
  return `${d}-${m}-${y}`;
}

/* =====================================================================
   МОДУЛЬ 0. ИДЕНТИФИКАЦИЯ СТУДЕНТА
   ===================================================================== */

const identOverlay = document.getElementById('identOverlay');
const identFio = document.getElementById('identFio');
const identGroup = document.getElementById('identGroup');
const identDate = document.getElementById('identDate');
const identStartBtn = document.getElementById('identStartBtn');
const identFioHint = document.getElementById('identFioHint');
const identGroupHint = document.getElementById('identGroupHint');

const FIO_RE = /^[A-Za-zА-ЯЁа-яё\s-]+$/;

function validateIdentForm() {
  const fio = identFio.value.trim();
  const group = identGroup.value.trim();
  let ok = true;

  if (fio.length === 0) {
    identFio.classList.add('invalid');
    identFioHint.textContent = 'Поле обязательно для заполнения';
    identFioHint.classList.add('error');
    ok = false;
  } else if (!FIO_RE.test(fio)) {
    identFio.classList.add('invalid');
    identFioHint.textContent = 'Допустимы только буквы, пробелы и дефис';
    identFioHint.classList.add('error');
    ok = false;
  } else {
    identFio.classList.remove('invalid');
    identFioHint.textContent = 'Введите ФИО (кириллица/латиница, пробелы, дефис)';
    identFioHint.classList.remove('error');
  }

  if (group.length === 0) {
    identGroup.classList.add('invalid');
    identGroupHint.textContent = 'Поле обязательно для заполнения';
    identGroupHint.classList.add('error');
    ok = false;
  } else {
    identGroup.classList.remove('invalid');
    identGroupHint.textContent = 'Введите номер учебной группы';
    identGroupHint.classList.remove('error');
  }

  identStartBtn.disabled = !ok;
  return ok;
}

identFio.addEventListener('input', validateIdentForm);
identGroup.addEventListener('input', validateIdentForm);

identStartBtn.addEventListener('click', () => {
  if (!validateIdentForm()) return;
  state.student.fio = identFio.value.trim();
  state.student.group = identGroup.value.trim();
  if (!state.student.date) state.student.date = todayISO();
  saveState();
  updateStudentBadge();
  identOverlay.classList.add('hidden');
});

function initIdentScreen() {
  if (state.student.fio && state.student.group) {
    identFio.value = state.student.fio;
    identGroup.value = state.student.group;
  }
  if (!state.student.date) state.student.date = todayISO();
  identDate.value = isoToDisplay(state.student.date);
  validateIdentForm();

  if (state.student.fio && state.student.group) {
    // данные уже есть — не блокируем повторный запуск
    identOverlay.classList.add('hidden');
    updateStudentBadge();
  }
}

function updateStudentBadge() {
  const txt = state.student.fio && state.student.group
    ? `${state.student.fio} · ${state.student.group}`
    : '—';
  document.getElementById('studentBadgeText').textContent = txt;
}

document.getElementById('studentEditBtn').addEventListener('click', () => {
  identFio.value = state.student.fio;
  identGroup.value = state.student.group;
  identDate.value = isoToDisplay(state.student.date || todayISO());
  validateIdentForm();
  identOverlay.classList.remove('hidden');
});

/* =====================================================================
   НАВИГАЦИЯ ПО ВКЛАДКАМ
   ===================================================================== */

function switchTab(moduleId) {
  document.querySelectorAll('.module').forEach(el => el.classList.add('hidden'));
  document.querySelectorAll('.tab-btn').forEach(el => el.classList.remove('active'));
  document.getElementById(moduleId).classList.remove('hidden');
  document.querySelector(`.tab-btn[data-module="${moduleId}"]`).classList.add('active');
  if (moduleId === 'm3') drawTimingCanvas();
}

document.getElementById('tabsNav').addEventListener('click', (e) => {
  const btn = e.target.closest('.tab-btn');
  if (!btn) return;
  switchTab(btn.dataset.module);
});

/* =====================================================================
   МОДУЛЬ 1. КОНСТРУКТОР ШИНЫ АДРЕСА
   ===================================================================== */

const m1Slider = document.getElementById('m1Slider');
const m1BitsValue = document.getElementById('m1BitsValue');
const m1BitsFormula = document.getElementById('m1BitsFormula');
const m1MemResult = document.getElementById('m1MemResult');
const m1MemResultConverted = document.getElementById('m1MemResultConverted');
const m1RangeFrom = document.getElementById('m1RangeFrom');
const m1RangeTo = document.getElementById('m1RangeTo');
const m1BusLines = document.getElementById('m1BusLines');
const m1MemMapTop = document.getElementById('m1MemMapTop');
const m1MemMapBottom = document.getElementById('m1MemMapBottom');

function renderBusLines(container, bits, extraClass) {
  container.innerHTML = '';
  const visibleCount = Math.min(bits, 16);
  for (let i = 0; i < visibleCount; i++) {
    const line = document.createElement('div');
    line.className = 'bus-line';
    const dot = document.createElement('div');
    dot.className = 'bit-dot ' + (Math.random() > 0.5 ? 'bit1' : 'bit0');
    dot.style.animationDelay = (Math.random() * 1.2).toFixed(2) + 's';
    line.appendChild(dot);
    container.appendChild(line);
  }
  if (bits > 16) {
    const note = document.createElement('div');
    note.className = 'result-sub';
    note.textContent = `Показаны 16 из ${bits} линий шины адреса (для наглядности)`;
    container.appendChild(note);
  }
}

function updateM1() {
  const bits = parseInt(m1Slider.value, 10);
  state.m1.bits = bits;
  m1BitsValue.textContent = bits;
  m1BitsFormula.textContent = bits;

  const maxAddress = bits >= 53 ? Number.MAX_SAFE_INTEGER : Math.pow(2, bits) - 1;
  const totalBytes = bits >= 53 ? Number.MAX_SAFE_INTEGER : Math.pow(2, bits);

  m1MemResult.textContent = fmtInt(totalBytes) + ' байт';
  m1MemResultConverted.textContent = '= ' + bytesToHuman(totalBytes);

  m1RangeFrom.textContent = toHex(0, bits);
  m1RangeTo.textContent = toHex(maxAddress, bits);
  m1MemMapTop.textContent = toHex(maxAddress, bits);
  m1MemMapBottom.textContent = '0x' + '0'.repeat(Math.ceil(bits / 4));

  renderBusLines(m1BusLines, bits);
  saveState();
  updateM5HeaderRef(); // на случай если M5 где-то ссылается (не используется, т.к. M5 независим)
  renderM1AddrVisualizer(); // перерисовать разрядность под текущий адрес
}

m1Slider.addEventListener('input', updateM1);

// --- Ввод конкретного адреса и побитовая визуализация ---
const m1AddrFormat = document.getElementById('m1AddrFormat');
const m1AddrInput = document.getElementById('m1AddrInput');
const m1AddrHint = document.getElementById('m1AddrHint');
const m1BitVisualizer = document.getElementById('m1BitVisualizer');

function renderM1AddrVisualizer() {
  const bits = state.m1.bits;
  const raw = m1AddrInput.value.trim();
  m1BitVisualizer.innerHTML = '';
  m1AddrInput.classList.remove('invalid');
  m1AddrHint.textContent = '';
  m1AddrHint.classList.remove('error');

  if (!raw) return;

  const format = m1AddrFormat.value;
  const re = format === 'hex' ? /^[0-9A-Fa-f]+$/ : /^\d+$/;
  if (!re.test(raw)) {
    m1AddrInput.classList.add('invalid');
    m1AddrHint.textContent = format === 'hex' ? 'Допустимы только шестнадцатеричные цифры 0-9, A-F' : 'Допустимы только десятичные цифры';
    m1AddrHint.classList.add('error');
    return;
  }

  const value = format === 'hex' ? parseInt(raw, 16) : parseInt(raw, 10);
  const maxAddress = Math.pow(2, bits) - 1;
  if (value < 0 || value > maxAddress) {
    m1AddrInput.classList.add('invalid');
    m1AddrHint.textContent = `Адрес вне диапазона 0 … ${toHex(maxAddress, bits)}`;
    m1AddrHint.classList.add('error');
    return;
  }

  m1AddrHint.textContent = `DEC = ${value}, HEX = ${toHex(value, bits)}`;

  for (let b = bits - 1; b >= 0; b--) {
    const box = document.createElement('div');
    const bitVal = (value >> b) & 1;
    box.className = 'bit-box' + (bitVal ? ' bit-on' : '');
    box.textContent = bitVal;
    box.title = `Бит №${b}`;
    m1BitVisualizer.appendChild(box);
  }
}
m1AddrFormat.addEventListener('change', renderM1AddrVisualizer);
m1AddrInput.addEventListener('input', renderM1AddrVisualizer);

// --- Обратная задача ---
const m1ReverseSize = document.getElementById('m1ReverseSize');
const m1ReverseUnit = document.getElementById('m1ReverseUnit');
const m1ReverseResult = document.getElementById('m1ReverseResult');

function updateM1Reverse() {
  const sizeRaw = parseFloat(m1ReverseSize.value);
  m1ReverseSize.classList.remove('invalid');
  if (!m1ReverseSize.value) {
    m1ReverseResult.textContent = 'Введите нужный объём памяти, чтобы узнать минимальную разрядность шины.';
    return;
  }
  if (isNaN(sizeRaw) || sizeRaw < 0) {
    m1ReverseSize.classList.add('invalid');
    m1ReverseResult.textContent = 'Введите корректное положительное число.';
    return;
  }
  const unit = parseFloat(m1ReverseUnit.value);
  const bytes = sizeRaw * unit;
  const bitsNeeded = bytes <= 1 ? 1 : Math.ceil(Math.log2(bytes));
  m1ReverseResult.innerHTML = `Минимальная разрядность шины адреса: <b>${bitsNeeded} бит</b> ` +
    `(2<sup>${bitsNeeded}</sup> = ${bytesToHuman(Math.pow(2, bitsNeeded))}).` +
    (bitsNeeded > 32 ? ' <span class="muted">Превышает диапазон слайдера (макс. 32 бита) — показан справочно.</span>' : '');
}
m1ReverseSize.addEventListener('input', updateM1Reverse);
m1ReverseUnit.addEventListener('change', updateM1Reverse);

document.getElementById('m1Continue').addEventListener('click', () => {
  openQuiz(1, () => switchTab('m2'));
});

/* =====================================================================
   МОДУЛЬ 2. КОНСТРУКТОР ШИНЫ ДАННЫХ
   ===================================================================== */

const m2PresetButtons = document.getElementById('m2PresetButtons');
const m2BitsSlider = document.getElementById('m2BitsSlider');
const m2BitsValue = document.getElementById('m2BitsValue');
const m2FreqSlider = document.getElementById('m2FreqSlider');
const m2FreqValue = document.getElementById('m2FreqValue');
const m2BusLines = document.getElementById('m2BusLines');

function setM2Bits(bits) {
  state.m2.bits = bits;
  m2BitsSlider.value = bits;
  m2BitsValue.textContent = bits + ' бит';
  m2PresetButtons.querySelectorAll('.preset-btn').forEach(btn => {
    btn.classList.toggle('active', parseInt(btn.dataset.bits, 10) === bits);
  });
  renderBusLines(m2BusLines, bits, 'data-lines');
  if (typeof updateMuxPenalty === 'function') updateMuxPenalty();
  if (typeof renderBurst === 'function') renderBurst();
  if (typeof renderAlignment === 'function') renderAlignment();
  saveState();
}

m2PresetButtons.addEventListener('click', (e) => {
  const btn = e.target.closest('.preset-btn');
  if (!btn) return;
  setM2Bits(parseInt(btn.dataset.bits, 10));
});
m2BitsSlider.addEventListener('input', () => setM2Bits(parseInt(m2BitsSlider.value, 10)));

m2FreqSlider.addEventListener('input', () => {
  state.m2.freq = parseInt(m2FreqSlider.value, 10);
  m2FreqValue.textContent = state.m2.freq;
  updateMuxPenalty();
  if (typeof renderBurst === 'function') renderBurst();
  saveState();
});

// --- Передача файла ---
const m2FileSize = document.getElementById('m2FileSize');
const m2Transfers = document.getElementById('m2Transfers');
const m2Throughput = document.getElementById('m2Throughput');
const m2Time = document.getElementById('m2Time');

function computeTransfer() {
  const bits = state.m2.bits;
  const freqMHz = state.m2.freq;
  const fileSizeMB = parseFloat(m2FileSize.value) || 0;
  const fileBytes = fileSizeMB * 1024 * 1024;
  const bytesPerTransfer = bits / 8;
  const transfers = Math.ceil(fileBytes / bytesPerTransfer);
  const throughputBps = bytesPerTransfer * (freqMHz * 1e6); // байт/с
  const throughputMBs = throughputBps / (1024 * 1024);
  const timeSec = throughputBps > 0 ? fileBytes / throughputBps : 0;
  return { transfers, throughputMBs, timeSec };
}

document.getElementById('m2StartTransfer').addEventListener('click', () => {
  const r = computeTransfer();
  m2Transfers.textContent = fmtInt(r.transfers);
  m2Throughput.textContent = fmtFloat(r.throughputMBs, 2) + ' МБ/с';
  m2Time.textContent = r.timeSec < 1
    ? fmtFloat(r.timeSec * 1000, 2) + ' мс'
    : fmtFloat(r.timeSec, 3) + ' с';
  saveState();
});

// --- Гонка шин 8 бит vs 64 бит ---
document.getElementById('m2StartRace').addEventListener('click', () => {
  const fileBytes = 1024 * 1024; // фиксированно 1 МБ для наглядной гонки
  const freqHz = 100 * 1e6;      // фиксированно 100 МГц
  const time8 = fileBytes / ((8 / 8) * freqHz);
  const time64 = fileBytes / ((64 / 8) * freqHz);
  const maxTime = Math.max(time8, time64);
  // масштабируем для видимости (реальные тайминги слишком малы)
  const scale = 60; // визуальный коэффициент замедления анимации
  runRaceBar('m2Race8', time8, maxTime, scale);
  runRaceBar('m2Race64', time64, maxTime, scale);
  document.getElementById('m2Race8Time').textContent = fmtFloat(time8 * 1000, 3) + ' мс';
  document.getElementById('m2Race64Time').textContent = fmtFloat(time64 * 1000, 3) + ' мс';
});

function runRaceBar(elId, timeSec, maxTimeSec, scale) {
  const bar = document.getElementById(elId);
  bar.style.transition = 'none';
  bar.style.width = '0%';
  const durationMs = Math.max(300, (timeSec / maxTimeSec) * 1500 * scale / scale * 1 + (timeSec * 1000 * scale));
  // ограничим разумным диапазоном для UX
  const clampedMs = Math.min(4000, Math.max(300, timeSec * 1000 * scale));
  requestAnimationFrame(() => {
    bar.style.transition = `width ${clampedMs}ms linear`;
    bar.style.width = '100%';
  });
}

// --- Мультиплексированная/немультиплексированная шина ---
const m2MuxToggle = document.getElementById('m2MuxToggle');
const m2MuxLabel = document.getElementById('m2MuxLabel');
const m2MuxDiagram = document.getElementById('m2MuxDiagram');

function updateMuxDiagram() {
  const mux = m2MuxToggle.checked;
  state.m2.mux = mux;
  m2MuxLabel.textContent = mux
    ? 'Мультиплексированная (адрес и данные идут по одним проводникам поочерёдно, по фазам)'
    : 'Немультиплексированная (адрес и данные — раздельные линии, одновременно)';
  m2MuxDiagram.innerHTML = '';
  if (mux) {
    m2MuxDiagram.style.flexDirection = 'row';
    const phase1 = document.createElement('div');
    phase1.className = 'mux-phase';
    phase1.style.background = 'var(--color-addr)';
    phase1.textContent = 'Фаза 1: Адрес';
    const phase2 = document.createElement('div');
    phase2.className = 'mux-phase';
    phase2.style.background = 'var(--color-data)';
    phase2.textContent = 'Фаза 2: Данные';
    m2MuxDiagram.appendChild(phase1);
    m2MuxDiagram.appendChild(phase2);
  } else {
    m2MuxDiagram.style.flexDirection = 'column';
    const rowAddr = document.createElement('div');
    rowAddr.className = 'mux-phase';
    rowAddr.style.background = 'var(--color-addr)';
    rowAddr.textContent = 'Шина адреса — активна весь такт';
    const rowData = document.createElement('div');
    rowData.className = 'mux-phase';
    rowData.style.background = 'var(--color-data)';
    rowData.textContent = 'Шина данных — активна весь такт (одновременно с адресом)';
    m2MuxDiagram.appendChild(rowAddr);
    m2MuxDiagram.appendChild(rowData);
  }
  updateMuxPenalty();
  saveState();
}
m2MuxToggle.addEventListener('change', updateMuxDiagram);

function updateMuxPenalty() {
  const el = document.getElementById('m2MuxPenalty');
  if (!el) return;
  const bits = state.m2.bits, freq = state.m2.freq;
  const bytesPerTransfer = bits / 8;
  const ideal = bytesPerTransfer * freq;                    // МБ/с, без накладных расходов
  const mux = m2MuxToggle.checked;
  // немультиплексированная: адрес и данные идут параллельно -> 1 такт на передачу
  // мультиплексированная: сначала фаза адреса, потом фаза данных -> 2 такта на передачу
  const actual = mux ? ideal / 2 : ideal;
  el.innerHTML = mux
    ? `Мультиплексированная шина: адрес и данные делят одни проводники, поэтому на каждую передачу нужно <b>2 фазы</b> вместо одной. ` +
      `Пропускная способность падает вдвое: <b>${fmtFloat(actual, 2)} МБ/с</b> вместо ${fmtFloat(ideal, 2)} МБ/с. ` +
      `<span class="muted">Зато вдвое меньше выводов корпуса и дорожек на плате.</span>`
    : `Немультиплексированная шина: адрес и данные передаются одновременно, по одной фазе на передачу. ` +
      `Полная пропускная способность: <b>${fmtFloat(actual, 2)} МБ/с</b>. ` +
      `<span class="muted">Плата за это — удвоенное число выводов и проводников.</span>`;
}

/* ---------- Модуль 2: пакетный режим (burst) ---------- */
const m2BurstLine = document.getElementById('m2BurstLine');

function renderBurst() {
  const bits = state.m2.bits;
  const bytesPerTransfer = bits / 8;
  const lineBytes = parseInt(m2BurstLine.value, 10);
  const transfers = Math.ceil(lineBytes / bytesPerTransfer);

  // схема: одна фаза адреса + N фаз данных
  const grid = document.getElementById('m2BurstGrid');
  grid.innerHTML = '';
  const addrPhase = document.createElement('div');
  addrPhase.className = 'burst-phase addr';
  addrPhase.textContent = 'Адрес';
  addrPhase.title = 'Одна фаза адреса на весь пакет';
  grid.appendChild(addrPhase);
  for (let i = 0; i < Math.min(transfers, 24); i++) {
    const d = document.createElement('div');
    d.className = 'burst-phase data';
    d.textContent = (i === 0) ? 'Д' : '';
    d.title = `Фаза данных ${i + 1}`;
    grid.appendChild(d);
  }

  const totalPhases = 1 + transfers;
  // без burst: каждая передача = адрес + данные = 2 фазы
  const separatePhases = transfers * 2;
  const freq = state.m2.freq;
  // одна фаза = 1 такт; пропускная способность = байт за такт × частота
  const idealThroughput = bytesPerTransfer * freq;                     // без накладных (теор. макс)
  const separateThroughput = lineBytes / (separatePhases / freq) / 1e0; // байт/мкс -> МБ/с ниже
  const separateMBs = (lineBytes * freq) / separatePhases;
  const burstMBs = (lineBytes * freq) / totalPhases;

  document.getElementById('m2BurstResult').innerHTML = `
    <div class="result-card">
      <div class="result-label">Без пакетного режима</div>
      <div class="result-value">${fmtFloat(separateMBs, 2)} МБ/с</div>
      <div class="result-sub">${separatePhases} фаз (адрес + данные на каждую передачу)</div>
    </div>
    <div class="result-card">
      <div class="result-label">Пакетный режим (burst)</div>
      <div class="result-value" style="color:var(--color-data)">${fmtFloat(burstMBs, 2)} МБ/с</div>
      <div class="result-sub">${totalPhases} фаз (1 адрес + ${transfers} данных)</div>
    </div>
    <div class="result-card">
      <div class="result-label">Прирост от burst</div>
      <div class="result-value">×${fmtFloat(burstMBs / separateMBs, 2)}</div>
      <div class="result-sub">теоретический максимум: ${fmtFloat(idealThroughput, 2)} МБ/с</div>
    </div>`;
}

m2BurstLine.addEventListener('change', renderBurst);

/* ---------- Модуль 2: выравнивание доступа ---------- */
const m2AlignOffset = document.getElementById('m2AlignOffset');
const m2AlignSize = document.getElementById('m2AlignSize');

function renderAlignment() {
  const busBytes = state.m2.bits / 8;          // сколько байт за одну передачу
  const offset = parseInt(m2AlignOffset.value, 10);
  const size = parseInt(m2AlignSize.value, 10);

  document.getElementById('m2AlignOffsetValue').textContent = offset;
  document.getElementById('m2AlignBusWidth').textContent = fmtFloat(busBytes, 0);

  // показываем две передачи подряд, чтобы было видно пересечение границы
  const lanes = document.getElementById('m2AlignLanes');
  lanes.innerHTML = '';
  const totalCells = busBytes * 2;

  // вычисляем, какие байты покрывает доступ
  const covered = new Set();
  for (let b = 0; b < size; b++) covered.add(offset + b);
  const crosses = covered.size > 0 && Math.max(...covered) >= busBytes;

  for (let i = 0; i < totalCells; i++) {
    const cell = document.createElement('div');
    cell.className = 'byte-cell';
    const inFirstTransfer = i < busBytes;
    if (covered.has(i)) cell.classList.add(crosses ? 'crossing' : 'used');
    cell.innerHTML = `<span class="byte-offset">+${i}</span>${inFirstTransfer ? 'передача 1' : 'передача 2'}`;
    lanes.appendChild(cell);
  }

  const cycles = crosses ? 2 : 1;
  const el = document.getElementById('m2AlignResult');
  if (crosses) {
    el.innerHTML = `<b style="color:#c0392b">Невыровненный доступ:</b> ${size} байт начиная со смещения ${offset} ` +
      `пересекает границу ${busBytes}-байтной передачи. Требуется <b>${cycles} цикла</b> вместо одного — ` +
      `эффективная скорость падает вдвое. <span class="muted">Именно поэтому компиляторы выравнивают поля структур, ` +
      `а некоторые архитектуры вообще запрещают невыровненный доступ (исключение выравнивания).</span>`;
  } else {
    el.innerHTML = `<b style="color:#1e8449">Выровненный доступ:</b> ${size} байт со смещения ${offset} ` +
      `укладывается в одну ${busBytes}-байтную передачу. Достаточно <b>1 цикла</b>.`;
  }
}

m2AlignOffset.addEventListener('input', renderAlignment);
m2AlignSize.addEventListener('change', renderAlignment);

/* ---------- Модуль 2: порядок байтов ---------- */
const m2EndianValue = document.getElementById('m2EndianValue');
const m2EndianHint = document.getElementById('m2EndianHint');

function renderEndian() {
  const raw = m2EndianValue.value.trim().toUpperCase();
  const lanes = document.getElementById('m2EndianLanes');
  const result = document.getElementById('m2EndianResult');
  m2EndianValue.classList.remove('invalid');
  m2EndianHint.textContent = '';
  m2EndianHint.classList.remove('error');

  if (!/^[0-9A-F]{1,8}$/.test(raw)) {
    m2EndianValue.classList.add('invalid');
    m2EndianHint.textContent = 'Введите от 1 до 8 шестнадцатеричных цифр';
    m2EndianHint.classList.add('error');
    lanes.innerHTML = '';
    result.textContent = '';
    return;
  }

  const padded = raw.padStart(8, '0');
  const bytes = [];
  for (let i = 0; i < 4; i++) bytes.push(padded.slice(i * 2, i * 2 + 2));
  // bytes[0] — самый старший байт (MSB)

  const little = state.m2.endian === 'little';
  const order = little ? bytes.slice().reverse() : bytes.slice();

  lanes.innerHTML = '';
  order.forEach((byteVal, i) => {
    const cell = document.createElement('div');
    cell.className = 'byte-cell le';
    cell.innerHTML = `<span class="byte-offset">адрес +${i}</span>0x${byteVal}`;
    lanes.appendChild(cell);
  });

  const msbAddr = little ? 3 : 0;
  const lsbAddr = little ? 0 : 3;
  result.innerHTML = little
    ? `<b>little-endian</b> (x86, ARM по умолчанию): младший байт <span class="mono">0x${bytes[3]}</span> лежит по младшему адресу +0, ` +
      `старший <span class="mono">0x${bytes[0]}</span> — по адресу +3. ` +
      `При чтении 4 байт как 8-битных значений по порядку адресов число «перевернётся».`
    : `<b>big-endian</b> (сетевой порядок, PowerPC, SPARC): старший байт <span class="mono">0x${bytes[0]}</span> лежит по младшему адресу +0, ` +
      `младший <span class="mono">0x${bytes[3]}</span> — по адресу +3. ` +
      `Порядок байт в памяти совпадает с порядком в записи числа.`;

  m2EndianHint.textContent = `DEC = ${parseInt(padded, 16)}`;
}

m2EndianValue.addEventListener('input', renderEndian);

document.getElementById('m2EndianButtons').addEventListener('click', (e) => {
  const btn = e.target.closest('.preset-btn');
  if (!btn) return;
  document.querySelectorAll('#m2EndianButtons .preset-btn').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  state.m2.endian = btn.dataset.endian;
  renderEndian();
  saveState();
});

/* ---------- Модуль 2: задача проектирования ---------- */
const M2_DESIGN = {
  minBytes: 256 * 1024 * 1024,   // 256 МБ
  minThroughputMBs: 500,
  freqMHz: 100
};

function renderDesignTask() {
  const addrBits = parseInt(document.getElementById('m2DesignAddr').value, 10);
  const dataBits = parseInt(document.getElementById('m2DesignData').value, 10);
  document.getElementById('m2DesignAddrValue').textContent = addrBits;
  document.getElementById('m2DesignDataValue').textContent = dataBits;

  const capacity = Math.pow(2, addrBits);
  const throughput = (dataBits / 8) * M2_DESIGN.freqMHz;

  const capOk = capacity >= M2_DESIGN.minBytes;
  const thrOk = throughput >= M2_DESIGN.minThroughputMBs;
  const minDataBits = Math.ceil(M2_DESIGN.minThroughputMBs / M2_DESIGN.freqMHz * 8);
  const stdDataBits = [8, 16, 32, 64, 128].find(w => w >= minDataBits) || minDataBits;

  const box = document.getElementById('m2DesignChecks');
  box.innerHTML = `
    <div class="design-check ${capOk ? 'ok' : 'bad'}">
      <span class="dc-mark">${capOk ? '✓' : '✗'}</span>
      <span>Объём: 2<sup>${addrBits}</sup> = <b>${bytesToHuman(capacity)}</b> ${capOk ? '≥' : '<'} 256 МБ</span>
    </div>
    <div class="design-check ${thrOk ? 'ok' : 'bad'}">
      <span class="dc-mark">${thrOk ? '✓' : '✗'}</span>
      <span>Пропускная способность: ${dataBits}/8 × ${M2_DESIGN.freqMHz} = <b>${fmtFloat(throughput, 1)} МБ/с</b> ${thrOk ? '≥' : '<'} 500 МБ/с</span>
    </div>
    <div class="design-check ${capOk && thrOk ? 'ok' : ''}">
      <span class="dc-mark">${capOk && thrOk ? '🏆' : '…'}</span>
      <span>${capOk && thrOk
        ? `<b>Оба ограничения выполнены.</b> Минимальное решение: адрес ${Math.ceil(Math.log2(M2_DESIGN.minBytes))} бит, данные не менее ${minDataBits} бит (ближайшая стандартная разрядность — ${stdDataBits}).`
        : 'Подберите разрядности так, чтобы оба условия стали зелёными.'}</span>
    </div>`;
}

document.getElementById('m2DesignAddr').addEventListener('input', renderDesignTask);
document.getElementById('m2DesignData').addEventListener('input', renderDesignTask);

document.getElementById('m2Continue').addEventListener('click', () => {
  openQuiz(2, () => switchTab('m3'));
});

function initM2() {
  setM2Bits(state.m2.bits);
  m2FreqSlider.value = state.m2.freq;
  m2FreqValue.textContent = state.m2.freq;
  m2MuxToggle.checked = state.m2.mux;
  updateMuxDiagram();
  renderBurst();
  renderAlignment();
  renderEndian();
  renderDesignTask();
}

/* =====================================================================
   МОДУЛЬ 3. ЦИКЛ ЧТЕНИЯ/ЗАПИСИ (ТАЙМИНГ-ДИАГРАММА)
   ===================================================================== */

const m3AddrLine = document.getElementById('m3AddrLine');
const m3DataLine = document.getElementById('m3DataLine');
const m3CtrlLine = document.getElementById('m3CtrlLine');
const m3CellHighlight = document.getElementById('m3CellHighlight');
const m3StepExplanation = document.getElementById('m3StepExplanation');
const m3StartRead = document.getElementById('m3StartRead');
const m3StartWrite = document.getElementById('m3StartWrite');
const m3StepBtn = document.getElementById('m3StepBtn');
const m3AutoBtn = document.getElementById('m3AutoBtn');
const m3SpeedSlider = document.getElementById('m3SpeedSlider');
const m3SyncToggle = document.getElementById('m3SyncToggle');
const m3SyncLabel = document.getElementById('m3SyncLabel');
const m3CycleCounter = document.getElementById('m3CycleCounter');
const m3Canvas = document.getElementById('m3TimingCanvas');
const m3Ctx = m3Canvas.getContext('2d');

const READ_STEPS = [
  { key: 'addr', ctrlName: 'RD', label: 'Такт 1: ЦП выставляет адрес на шину адреса', addr: true },
  { key: 'ctrl', ctrlName: 'RD', label: 'Такт 1–2: ЦП активирует управляющий сигнал RD (чтение)', addr: true, ctrl: true },
  { key: 'decode', ctrlName: 'RD', label: 'Такт 2: Память декодирует адрес и находит ячейку', addr: true, ctrl: true, mem: true },
  { key: 'data', ctrlName: 'RD', label: 'Такт 2–3: Память выставляет данные на шину данных', addr: true, ctrl: true, mem: true, data: true },
  { key: 'ready', ctrlName: 'RD', label: 'Такт 3: Сигнал READY/ACK — цикл чтения завершён', addr: true, ctrl: true, mem: true, data: true, ready: true }
];
const WRITE_STEPS = [
  { key: 'addr', ctrlName: 'WR', label: 'Такт 1: ЦП выставляет адрес на шину адреса', addr: true },
  { key: 'ctrl', ctrlName: 'WR', label: 'Такт 1–2: ЦП активирует управляющий сигнал WR (запись)', addr: true, ctrl: true },
  { key: 'data', ctrlName: 'WR', label: 'Такт 1–2: ЦП выставляет данные на шину данных (первым)', addr: true, ctrl: true, data: true },
  { key: 'decode', ctrlName: 'WR', label: 'Такт 2: Память декодирует адрес и принимает данные', addr: true, ctrl: true, data: true, mem: true },
  { key: 'ready', ctrlName: 'WR', label: 'Такт 3: Сигнал READY/ACK — цикл записи завершён', addr: true, ctrl: true, data: true, mem: true, ready: true }
];

let m3Steps = null;
let m3CycleType = null;
let m3CurrentIndex = -1;
let m3AutoTimer = null;

const m3WaitSlider = document.getElementById('m3WaitSlider');
const m3WaitValue = document.getElementById('m3WaitValue');

/* Вставляет N тактов ожидания перед финальным шагом READY.
   Именно так ведёт себя медленная память: адрес и сигнал уже выставлены,
   ЦП удерживает их и ждёт, пока устройство поднимет READY. */
function buildM3Steps(type, waitStates) {
  const base = (type === 'read' ? READ_STEPS : WRITE_STEPS).slice();
  if (!waitStates) return base;
  const readyStep = base.pop();          // откладываем финальный шаг
  const waitSteps = [];
  for (let i = 1; i <= waitStates; i++) {
    waitSteps.push({
      key: 'wait', ctrlName: readyStep.ctrlName,
      label: `Такт ожидания ${i} из ${waitStates}: память ещё не готова, READY = 0 — ЦП удерживает адрес и сигнал`,
      addr: true, ctrl: true, data: !!readyStep.data, mem: !!readyStep.mem,
      wait: true
    });
  }
  const finalReady = Object.assign({}, readyStep, {
    label: `Такт ${2 + waitStates + 1}: Сигнал READY/ACK — цикл ${type === 'read' ? 'чтения' : 'записи'} завершён (после ${waitStates} такт(ов) ожидания)`
  });
  return base.concat(waitSteps, [finalReady]);
}

function currentWaitStates() {
  return parseInt(m3WaitSlider.value, 10) || 0;
}

function m3StartCycle(type) {
  m3Steps = buildM3Steps(type, currentWaitStates());
  m3CycleType = type;
  m3CurrentIndex = -1;
  m3StartRead.disabled = true;
  m3StartWrite.disabled = true;
  m3StepBtn.disabled = false;
  m3AutoBtn.disabled = false;
  const ws = currentWaitStates();
  m3StepExplanation.textContent = `Цикл ${type === 'read' ? 'чтения' : 'записи'} начат` +
    (ws ? `, память медленная: вставлено ${ws} такт(ов) ожидания.` : '.') +
    ' Нажмите «Шаг →» или «Авто ▶».';
  applyM3Step();
  drawTimingCanvas();
}

function applyM3Step() {
  const step = m3CurrentIndex >= 0 ? m3Steps[m3CurrentIndex] : null;
  m3AddrLine.classList.toggle('active', !!(step && step.addr));
  m3AddrLine.textContent = step && step.addr ? 'ADDR' : '';
  m3DataLine.classList.toggle('active', !!(step && step.data));
  m3DataLine.textContent = step && step.data ? 'DATA' : '';
  m3CtrlLine.classList.toggle('active', !!(step && step.ctrl));
  m3CtrlLine.textContent = step && step.ctrl ? step.ctrlName : '';
  m3CellHighlight.classList.toggle('hit', !!(step && step.mem));
  m3CellHighlight.style.left = step && step.mem ? '42%' : '-20%';
  if (step) m3StepExplanation.textContent = step.label;
}

function m3NextStep() {
  if (!m3Steps) return;
  if (m3CurrentIndex >= m3Steps.length - 1) return;
  m3CurrentIndex++;
  applyM3Step();
  drawTimingCanvas();
  if (m3CurrentIndex === m3Steps.length - 1) {
    m3FinishCycle();
  }
}

function m3FinishCycle() {
  if (m3CycleType === 'read') state.m3.cyclesRead++;
  else state.m3.cyclesWrite++;
  saveState();
  updateM3Counter();
  m3StepBtn.disabled = true;
  m3AutoBtn.disabled = true;
  if (m3AutoTimer) { clearInterval(m3AutoTimer); m3AutoTimer = null; m3AutoBtn.textContent = 'Авто ▶'; }
  setTimeout(() => {
    m3StartRead.disabled = false;
    m3StartWrite.disabled = false;
  }, 400);
}

function updateM3Counter() {
  m3CycleCounter.textContent = `Циклов выполнено: ${state.m3.cyclesRead + state.m3.cyclesWrite} ` +
    `(чтение: ${state.m3.cyclesRead}, запись: ${state.m3.cyclesWrite})`;
}

m3StartRead.addEventListener('click', () => m3StartCycle('read'));
m3StartWrite.addEventListener('click', () => m3StartCycle('write'));
m3StepBtn.addEventListener('click', m3NextStep);

m3AutoBtn.addEventListener('click', () => {
  if (m3AutoTimer) {
    clearInterval(m3AutoTimer);
    m3AutoTimer = null;
    m3AutoBtn.textContent = 'Авто ▶';
    return;
  }
  m3AutoBtn.textContent = '⏸ Пауза';
  m3AutoTimer = setInterval(() => {
    m3NextStep();
    if (!m3AutoTimer) return;
    if (m3CurrentIndex >= m3Steps.length - 1) {
      clearInterval(m3AutoTimer);
      m3AutoTimer = null;
      m3AutoBtn.textContent = 'Авто ▶';
    }
  }, parseInt(m3SpeedSlider.value, 10));
});

m3SyncToggle.addEventListener('change', () => {
  state.m3.sync = m3SyncToggle.checked;
  m3SyncLabel.textContent = state.m3.sync
    ? 'Синхронная шина (цикл привязан к тактовому генератору CLK)'
    : 'Асинхронная шина (цикл завершается по сигналу READY/ACK, длительность не фиксирована)';
  saveState();
  drawTimingCanvas();
});

function drawTimingCanvas() {
  const ctx = m3Ctx;
  const W = m3Canvas.width, H = m3Canvas.height;
  ctx.clearRect(0, 0, W, H);
  ctx.fillStyle = '#10151d';
  ctx.fillRect(0, 0, W, H);

  if (!m3Steps) {
    ctx.fillStyle = '#5c6779';
    ctx.font = '14px Consolas, monospace';
    ctx.fillText('Нажмите «Старт цикла чтения/записи», чтобы увидеть тайминг-диаграмму', 20, H / 2);
    return;
  }

  const steps = m3Steps;
  const n = steps.length;
  const marginLeft = 80, marginRight = 20, top = 16, rowH = 44;

  const weights = steps.map(s => (!state.m3.sync && s.ready) ? 1.8 : 1);
  const totalWeight = weights.reduce((a, b) => a + b, 0);
  const availW = W - marginLeft - marginRight;
  const colX = [marginLeft];
  weights.forEach(w => colX.push(colX[colX.length - 1] + availW * w / totalWeight));

  const rows = [
    { key: 'clk', label: 'CLK', color: '#8b97a8' },
    { key: 'addr', label: 'ADDR', color: '#2d6cdf' },
    { key: 'data', label: 'DATA', color: '#27ae60' },
    { key: 'ctrl', label: 'RD/WR', color: '#e8972e' },
    { key: 'ready', label: 'READY', color: '#e8972e' }
  ];

  // подсветка текущего такта
  // подсветка тактов ожидания на всей высоте диаграммы
  for (let i = 0; i < n; i++) {
    if (steps[i].wait) {
      ctx.fillStyle = 'rgba(232,151,46,0.10)';
      ctx.fillRect(colX[i], top - 6, colX[i + 1] - colX[i], rows.length * rowH + 10);
    }
  }

  if (m3CurrentIndex >= 0) {
    ctx.fillStyle = 'rgba(255,255,255,0.05)';
    ctx.fillRect(colX[m3CurrentIndex], top - 6, colX[m3CurrentIndex + 1] - colX[m3CurrentIndex], rows.length * rowH + 10);
  }

  rows.forEach((row, ri) => {
    const yMid = top + ri * rowH + rowH / 2;
    ctx.fillStyle = '#9aa7bb';
    ctx.font = '12px Consolas, monospace';
    ctx.fillText(row.label, 8, yMid + 4);

    ctx.strokeStyle = row.color;
    ctx.lineWidth = 2;
    ctx.beginPath();
    let prevY = null;
    for (let i = 0; i < n; i++) {
      let high;
      if (row.key === 'clk') {
        high = (i % 2 === 0);
      } else {
        high = !!steps[i][row.key] && i <= m3CurrentIndex;
      }
      const yLevel = yMid + (high ? -12 : 12);
      const xStart = colX[i], xEnd = colX[i + 1];
      if (prevY === null) { ctx.moveTo(xStart, yLevel); }
      else if (prevY !== yLevel) { ctx.lineTo(xStart, prevY); ctx.lineTo(xStart, yLevel); }
      ctx.lineTo(xEnd, yLevel);
      prevY = yLevel;
    }
    ctx.stroke();
  });

  // сетка тактов + номера + подпись фазы для READY в асинхронном режиме
  ctx.strokeStyle = 'rgba(255,255,255,0.08)';
  ctx.lineWidth = 1;
  for (let i = 0; i <= n; i++) {
    ctx.beginPath();
    ctx.moveTo(colX[i], top - 6);
    ctx.lineTo(colX[i], top + rows.length * rowH + 4);
    ctx.stroke();
  }
  ctx.fillStyle = '#5c6779';
  ctx.font = '11px Consolas, monospace';
  for (let i = 0; i < n; i++) {
    const isWait = !!steps[i].wait;
    ctx.fillStyle = isWait ? '#e8972e' : '#5c6779';
    ctx.fillText((isWait ? 'W' : 'T') + (i + 1), (colX[i] + colX[i + 1]) / 2 - 8, top + rows.length * rowH + 20);
  }
  ctx.fillStyle = '#5c6779';
  if (!state.m3.sync) {
    ctx.fillStyle = '#e8972e';
    ctx.font = '11px Consolas, monospace';
    ctx.fillText('⏳ переменная длительность — завершение по READY, а не по фиксированному такту', marginLeft, H - 6);
  }
}

document.getElementById('m3Continue').addEventListener('click', () => {
  openQuiz(3, () => switchTab('m4'));
});

m3WaitSlider.addEventListener('input', () => {
  m3WaitValue.textContent = m3WaitSlider.value;
  if (m3Steps) {                 // если цикл уже идёт — пересобираем и сбрасываем
    m3Steps = buildM3Steps(m3CycleType || 'read', currentWaitStates());
    m3CurrentIndex = -1;
    applyM3Step();
    drawTimingCanvas();
  }
  state.m3.wait = currentWaitStates();
  saveState();
});

function initM3() {
  m3SyncToggle.checked = state.m3.sync;
  m3SyncLabel.textContent = state.m3.sync
    ? 'Синхронная шина (цикл привязан к тактовому генератору CLK)'
    : 'Асинхронная шина (цикл завершается по сигналу READY/ACK, длительность не фиксирована)';
  const savedWait = (state.m3.wait != null) ? state.m3.wait : 0;
  m3WaitSlider.value = savedWait;
  m3WaitValue.textContent = savedWait;
  updateM3Counter();
  drawTimingCanvas();
}

/* =====================================================================
   МОДУЛЬ 4. АРБИТРАЖ И КОНФЛИКТЫ ШИНЫ
   ===================================================================== */

const m4Toggles = document.querySelectorAll('.enable-toggle');
const m4BusLine = document.getElementById('m4BusLine');
const m4StatusCard = document.getElementById('m4StatusCard');

function updateM4() {
  const enabled = Array.from(m4Toggles).filter(t => t.checked);
  document.querySelectorAll('.master-device').forEach(dev => {
    const toggle = dev.querySelector('.enable-toggle');
    dev.classList.toggle('enabled', toggle.checked && enabled.length === 1);
    dev.classList.toggle('conflict', toggle.checked && enabled.length >= 2);
  });

  m4BusLine.classList.remove('active-single', 'conflict');
  if (enabled.length === 0) {
    m4StatusCard.innerHTML = 'Шина свободна. Включите <b>Enable</b> только одного устройства, чтобы корректно передать данные.';
  } else if (enabled.length === 1) {
    m4BusLine.classList.add('active-single');
    const name = enabled[0].dataset.device === 'cpu' ? 'ЦП' : enabled[0].dataset.device === 'dma' ? 'контроллер DMA' : 'второе ядро';
    m4StatusCard.innerHTML = `✅ Шина корректно занята одним устройством (${name}). Данные передаются без конфликтов.`;
  } else {
    m4BusLine.classList.add('conflict');
    const names = enabled.map(t => t.dataset.device === 'cpu' ? 'ЦП' : t.dataset.device === 'dma' ? 'DMA' : 'второе ядро').join(', ');
    m4StatusCard.innerHTML = `⚠ <b>Конфликт шины (bus contention)!</b> Одновременно пытаются выставить сигнал: ${names}. ` +
      `Поскольку шина данных двунаправленная и имеет только один физический проводник на бит, два разных логических уровня ` +
      `на одной линии создают неопределённое (плавающее) напряжение — реальное оборудование может выйти из строя. ` +
      `Поэтому арбитр шины должен разрешать выход на шину только одному устройству за раз, остальные держат буферы в Z-состоянии.`;
  }
}
m4Toggles.forEach(t => t.addEventListener('change', updateM4));

document.getElementById('m4Continue').addEventListener('click', () => {
  openQuiz(4, () => switchTab('m5'));
});

/* =====================================================================
   МОДУЛЬ 5. ДЕКОДЕР АДРЕСНОГО ПРОСТРАНСТВА (КАРТА ПАМЯТИ)
   ===================================================================== */

const M5_TOTAL_BITS = 16;
const M5_TOTAL_SIZE = Math.pow(2, M5_TOTAL_BITS); // 65536 байт = 64 КБ
const M5_DEVICE_META = {
  rom: { label: 'ПЗУ', color: '#8e44ad' },
  ram: { label: 'ОЗУ', color: '#2ecc71' },
  io: { label: 'Порт ввода-вывода', color: '#e67e22' }
};

const m5DropZone = document.getElementById('m5DropZone');
const m5DevicesPool = document.getElementById('m5DevicesPool');
const m5ConflictWarning = document.getElementById('m5ConflictWarning');
const m5ResultTableBody = document.getElementById('m5ResultTableBody');
const m5ChipSelectExplain = document.getElementById('m5ChipSelectExplain');

document.getElementById('m5TotalBits').textContent = M5_TOTAL_BITS;
document.getElementById('m5TotalSize').textContent = bytesToHuman(M5_TOTAL_SIZE);

m5DevicesPool.querySelectorAll('.device-block').forEach(block => {
  block.addEventListener('dragstart', (e) => {
    e.dataTransfer.setData('text/plain', block.dataset.deviceId);
  });
});

m5DropZone.addEventListener('dragover', (e) => {
  e.preventDefault();
  m5DropZone.classList.add('drag-over');
});
m5DropZone.addEventListener('dragleave', () => m5DropZone.classList.remove('drag-over'));

m5DropZone.addEventListener('drop', (e) => {
  e.preventDefault();
  m5DropZone.classList.remove('drag-over');
  const deviceId = e.dataTransfer.getData('text/plain');
  if (!deviceId || state.m5.placements.find(p => p.id === deviceId)) return;
  const poolBlock = m5DevicesPool.querySelector(`.device-block[data-device-id="${deviceId}"]`);
  const size = parseInt(poolBlock.dataset.size, 10);

  const rect = m5DropZone.getBoundingClientRect();
  let fraction = (e.clientY - rect.top) / rect.height;
  fraction = Math.min(1, Math.max(0, fraction));

  let topAddr = Math.round((1 - fraction) * M5_TOTAL_SIZE / 256) * 256; // привязка к границе 256 байт
  let start = topAddr - size;
  if (start < 0) start = 0;
  if (start + size > M5_TOTAL_SIZE) start = M5_TOTAL_SIZE - size;

  state.m5.placements.push({ id: deviceId, label: M5_DEVICE_META[deviceId].label, color: M5_DEVICE_META[deviceId].color, start, size });
  poolBlock.classList.add('placed');
  poolBlock.setAttribute('draggable', 'false');
  saveState();
  renderM5();
  m5IoModeToggle.checked = (state.m5.ioMode === 'isolated');
  renderM5IoMode();

  renderM6();
  renderIO();
  document.querySelectorAll('#m8ArchButtons .preset-btn').forEach(b => {
    b.classList.toggle('active', b.dataset.arch === state.m8.arch);
  });
  renderM8();
});

function renderM5() {
  // отрисовка размещённых блоков
  m5DropZone.querySelectorAll('.placed-device').forEach(el => el.remove());
  const zoneHeight = m5DropZone.clientHeight || 360;

  // поиск конфликтов (пересечение диапазонов)
  const conflictIds = new Set();
  const placements = state.m5.placements;
  for (let i = 0; i < placements.length; i++) {
    for (let j = i + 1; j < placements.length; j++) {
      const a = placements[i], b = placements[j];
      const aEnd = a.start + a.size - 1, bEnd = b.start + b.size - 1;
      if (a.start <= bEnd && b.start <= aEnd) { conflictIds.add(a.id); conflictIds.add(b.id); }
    }
  }
  m5ConflictWarning.style.display = conflictIds.size > 0 ? 'block' : 'none';

  placements.forEach(p => {
    const topAddr = p.start + p.size;
    const topFraction = 1 - topAddr / M5_TOTAL_SIZE;
    const el = document.createElement('div');
    el.className = 'placed-device' + (conflictIds.has(p.id) ? ' conflict' : '');
    el.style.top = (topFraction * zoneHeight) + 'px';
    el.style.height = ((p.size / M5_TOTAL_SIZE) * zoneHeight) + 'px';
    el.style.background = p.color;
    el.textContent = `${p.label} (${bytesToHuman(p.size)})`;
    el.title = 'Нажмите, чтобы вернуть устройство в пул';
    el.addEventListener('click', () => removeM5Placement(p.id));
    m5DropZone.appendChild(el);
  });

  // таблица результатов
  if (placements.length === 0) {
    m5ResultTableBody.innerHTML = '<tr><td colspan="4" class="muted">Разместите устройства на шкале, чтобы увидеть таблицу.</td></tr>';
  } else {
    m5ResultTableBody.innerHTML = placements
      .slice()
      .sort((a, b) => b.start - a.start)
      .map(p => {
        const conflict = conflictIds.has(p.id);
        return `<tr${conflict ? ' style="color:#c0392b;font-weight:700;"' : ''}>
          <td>${p.label}${conflict ? ' ⚠' : ''}</td>
          <td class="mono">${toHex(p.start, M5_TOTAL_BITS)}</td>
          <td class="mono">${toHex(p.start + p.size - 1, M5_TOTAL_BITS)}</td>
          <td>${bytesToHuman(p.size)}</td>
        </tr>`;
      }).join('');
  }

  // объяснение Chip Select (только при полной бесконфликтной раскладке)
  if (placements.length === 3 && conflictIds.size === 0) {
    m5ChipSelectExplain.innerHTML = '<b>Принцип дешифрации (Chip Select):</b><br>' +
      placements.map(p => {
        const sizeBits = Math.log2(p.size);
        const csBits = M5_TOTAL_BITS - sizeBits;
        return `«${p.label}»: старшие ${csBits} бит адреса (биты ${M5_TOTAL_BITS - 1}…${sizeBits}) постоянны в пределах блока — ` +
          `именно по ним дешифратор формирует сигнал Chip Select; младшие ${sizeBits} бит выбирают конкретную ячейку внутри устройства.`;
      }).join('<br>');
  } else {
    m5ChipSelectExplain.innerHTML = '';
  }
}

function removeM5Placement(id) {
  state.m5.placements = state.m5.placements.filter(p => p.id !== id);
  const poolBlock = m5DevicesPool.querySelector(`.device-block[data-device-id="${id}"]`);
  if (poolBlock) { poolBlock.classList.remove('placed'); poolBlock.setAttribute('draggable', 'true'); }
  saveState();
  renderM5();
}

/* ---------- Модуль 5: memory-mapped vs isolated I/O ---------- */
const m5IoModeToggle = document.getElementById('m5IoModeToggle');
const m5IoModeLabel = document.getElementById('m5IoModeLabel');

function renderM5IoMode() {
  const isolated = m5IoModeToggle.checked;
  state.m5.ioMode = isolated ? 'isolated' : 'mmio';
  m5IoModeLabel.textContent = isolated
    ? 'Изолированное пространство ввода-вывода (isolated I/O)'
    : 'Память отображена в общее адресное пространство (memory-mapped I/O)';

  const vis = document.getElementById('m5IoSpaceVisual');
  const explain = document.getElementById('m5IoExplain');

  if (isolated) {
    vis.innerHTML = `
      <div class="io-block">
        <div class="io-block-title">Адресное пространство памяти (64 КБ)</div>
        <div class="io-region" style="background:#8e44ad">ПЗУ</div>
        <div class="io-region" style="background:#2ecc71">ОЗУ</div>
        <div class="io-region dim" style="background:#95a5a6">порты ввода-вывода сюда НЕ входят</div>
      </div>
      <div class="io-block">
        <div class="io-block-title">Отдельное пространство портов (64 КБ)</div>
        <div class="io-region" style="background:#e67e22">Порт ввода-вывода</div>
        <div class="io-region dim" style="background:#95a5a6">память сюда не входит</div>
      </div>`;
    explain.innerHTML = `<b>Изолированный ввод-вывод</b> (x86 с сигналом M/IO): устройства имеют собственное адресное ` +
      `пространство портов, не пересекающееся с памятью. Доступ — только специальными командами <span class="mono">IN</span>/<span class="mono">OUT</span>. ` +
      `<span class="muted">Плюс: память целиком доступна программам. Минус: нужны отдельные команды и отдельный управляющий сигнал.</span>`;
  } else {
    vis.innerHTML = `
      <div class="io-block">
        <div class="io-block-title">Единое адресное пространство (64 КБ)</div>
        <div class="io-region" style="background:#8e44ad">ПЗУ</div>
        <div class="io-region" style="background:#2ecc71">ОЗУ</div>
        <div class="io-region" style="background:#e67e22">Порт ввода-вывода (по обычным адресам)</div>
      </div>
      <div class="io-block">
        <div class="io-block-title">Отдельного пространства портов нет</div>
        <div class="io-region dim" style="background:#95a5a6">—</div>`;
    explain.innerHTML = `<b>Memory-mapped I/O</b> (ARM, RISC-V, MIPS): регистры устройств занимают адреса в общем пространстве. ` +
      `Обращение идёт обычными командами загрузки и сохранения — <span class="mono">LDR</span>/<span class="mono">STR</span>. ` +
      `<span class="muted">Плюс: не нужны спецкоманды и отдельный сигнал, работает любой способ адресации. Минус: устройства «съедают» часть адресного пространства памяти.</span>`;
  }
  if (typeof renderM5 === 'function') renderM5();
}
m5IoModeToggle.addEventListener('change', renderM5IoMode);

function updateM5HeaderRef() { /* заглушка: M5 использует независимую фиксированную разрядность 16 бит */ }

document.getElementById('m5Continue').addEventListener('click', () => {
  openQuiz(5, () => showToast('Все основные модули пройдены! Можно сформировать PDF-отчёт.'));
});

/* =====================================================================
   МОДУЛЬ 6. ЛОГИЧЕСКИЙ ДЕШИФРАТОР АДРЕСА + ПОИСК НЕИСПРАВНОСТИ
   ===================================================================== */

const M6_BUS_BITS = 16;
const M6_DEVICES = [
  { id: 'rom', label: 'ПЗУ', start: 0xC000, size: 16384 },
  { id: 'ram', label: 'ОЗУ', start: 0x0000, size: 32768 },
  { id: 'io',  label: 'Порт ввода-вывода', start: 0xB000, size: 1024 }
];

const m6Device = document.getElementById('m6Device');
const m6Addr = document.getElementById('m6Addr');
const m6AddrHint = document.getElementById('m6AddrHint');

M6_DEVICES.forEach(d => {
  const opt = document.createElement('option');
  opt.value = d.id;
  opt.textContent = `${d.label} — ${toHex(d.start, M6_BUS_BITS)}…${toHex(d.start + d.size - 1, M6_BUS_BITS)} (${bytesToHuman(d.size)})`;
  m6Device.appendChild(opt);
});

function m6SelectedDevice() {
  return M6_DEVICES.find(d => d.id === m6Device.value) || M6_DEVICES[0];
}

function renderM6() {
  const dev = m6SelectedDevice();
  const raw = m6Addr.value.trim().replace(/^0x/i, '');
  m6Addr.classList.remove('invalid');
  m6AddrHint.textContent = '';
  m6AddrHint.classList.remove('error');

  if (!/^[0-9A-Fa-f]{1,4}$/.test(raw)) {
    m6Addr.classList.add('invalid');
    m6AddrHint.textContent = 'Введите 1–4 шестнадцатеричные цифры (16-битный адрес)';
    m6AddrHint.classList.add('error');
    return;
  }

  const addr = parseInt(raw, 16);
  const addrBits = addr.toString(2).padStart(M6_BUS_BITS, '0');

  // сколько младших бит "внутри" устройства
  const insideBits = Math.round(Math.log2(dev.size));
  const csBits = M6_BUS_BITS - insideBits;

  // какие старшие биты дешифратор проверяет
  const expected = dev.start.toString(2).padStart(M6_BUS_BITS, '0');

  // --- строка формулы ---
  const terms = [];
  for (let b = M6_BUS_BITS - 1; b >= insideBits; b--) {
    const want = expected[M6_BUS_BITS - 1 - b];
    terms.push(`A${b}${want === '1' ? '' : "'"}`);
  }
  const eq = document.getElementById('m6Eq');
  eq.innerHTML = `CS<sub>${dev.label}</sub> = ` +
    terms.slice(0, 12).map(t => `<span class="eq-true">${t}</span>`).join(' · ') +
    (terms.length > 12 ? ` · … (всего ${terms.length} старших бит)` : '') +
    `<br><span style="color:#7a8799;font-size:12px">младшие ${insideBits} бит (A${insideBits - 1}…A0) в дешифрации не участвуют — они выбирают ячейку внутри устройства</span>`;

  // --- биты ---
  const bitsBox = document.getElementById('m6Bits');
  bitsBox.innerHTML = '';
  let allMatch = true;
  for (let b = M6_BUS_BITS - 1; b >= 0; b--) {
    const actual = addrBits[M6_BUS_BITS - 1 - b];
    const want = expected[M6_BUS_BITS - 1 - b];
    const checked = b >= insideBits;
    const match = actual === want;

    const el = document.createElement('div');
    el.className = 'dec-bit';
    if (checked) {
      el.classList.add('checked');
      el.classList.add(match ? 'match' : 'mismatch');
      if (!match) allMatch = false;
    }
    el.innerHTML = `<span class="dec-bit-num">A${b}</span><span class="dec-bit-val">${actual}</span>`;
    el.title = checked
      ? `Проверяется: нужно ${want}, на шине ${actual}` + (match ? ' — совпало' : ' — не совпало')
      : `Не проверяется (внутри устройства)`;
    bitsBox.appendChild(el);
  }

  // --- вентиль и вердикт ---
  const gate = document.getElementById('m6Gate');
  gate.innerHTML = allMatch
    ? '<div class="gate-arrow">↓</div><div class="cs-badge high">CS = 1 (устройство выбрано)</div>'
    : '<div class="gate-arrow">↓</div><div class="cs-badge low">CS = 0 (устройство не выбрано)</div>';

  const verdict = document.getElementById('m6Verdict');
  if (allMatch) {
    verdict.innerHTML = `✅ Адрес <span class="mono">${toHex(addr, M6_BUS_BITS)}</span> попадает в <b>${dev.label}</b>: ` +
      `все ${csBits} старших бит совпали с требуемыми. Дешифратор поднял CS, устройство вышло на шину, ` +
      `а младшие ${insideBits} бит указали на конкретную ячейку.`;
  } else {
    const mismatches = [];
    for (let b = M6_BUS_BITS - 1; b >= insideBits; b--) {
      const actual = addrBits[M6_BUS_BITS - 1 - b];
      const want = expected[M6_BUS_BITS - 1 - b];
      if (actual !== want) mismatches.push(`A${b} (нужно ${want}, на шине ${actual})`);
    }
    verdict.innerHTML = `⛔ Адрес <span class="mono">${toHex(addr, M6_BUS_BITS)}</span> <b>не</b> принадлежит ${dev.label}: ` +
      `не совпали биты ${mismatches.slice(0, 5).join(', ')}${mismatches.length > 5 ? ' и др.' : ''}. ` +
      `CS остался в нуле — дешифратор не выбрал это устройство.`;
  }
}

m6Device.addEventListener('change', () => {
  const dev = m6SelectedDevice();
  m6Addr.value = toHex(dev.start, 4).replace('0x', '');
  renderM6();
});
m6Addr.addEventListener('input', renderM6);

/* ---------- Модуль 6: задача "найди неисправность" ---------- */
const M6_FAULT = { bit: 11, stuckAt: 1 };  // A11 залипла в 1

const m6FaultBit = document.getElementById('m6FaultBit');
const m6FaultValue = document.getElementById('m6FaultValue');
const m6FaultVerdict = document.getElementById('m6FaultVerdict');

for (let b = M6_BUS_BITS - 1; b >= 0; b--) {
  const opt = document.createElement('option');
  opt.value = b;
  opt.textContent = `A${b} (вес ${Math.pow(2, b)})`;
  m6FaultBit.appendChild(opt);
}

function renderFaultSymptom() {
  const region = M6_FAULT.stuckAt === 1
    ? `${toHex(0x0800, 4)}…${toHex(0x0FFF, 4)}`
    : `${toHex(0x0800, 4)}…${toHex(0x0FFF, 4)}`;
  const el = document.getElementById('m6FaultSymptom');
  el.innerHTML = `<b>Симптом:</b> при прогоне теста памяти каждый блок данных размером 2 КБ записывается <b>строго дважды</b> — ` +
    `в зеркальные адреса, отличающиеся на <span class="mono">${toHex(Math.pow(2, M6_FAULT.bit), 4)}</span> ` +
    `(2<sup>${M6_FAULT.bit}</sup> = ${Math.pow(2, M6_FAULT.bit)}). Область <span class="mono">${region}</span> отвечает на обращения ` +
    `по адресам вне своего диапазона. Содержимое ячеек не повреждено, но половина адресного пространства «невидима».`;
}

function checkFault() {
  const bit = parseInt(m6FaultBit.value, 10);
  const val = parseInt(m6FaultValue.value, 10);
  const ok = (bit === M6_FAULT.bit && val === M6_FAULT.stuckAt);

  m6FaultVerdict.innerHTML = ok
    ? `✅ Верно. Залипла линия <b>A${M6_FAULT.bit}</b> в состоянии <b>${M6_FAULT.stuckAt}</b>. ` +
      `Поэтому адреса внутри блока различаются только младшими битами, а бит A${M6_FAULT.bit} всегда даёт одно и то же значение: ` +
      `два адреса, отличающиеся только этим битом, указывают на одну физическую ячейку — отсюда зеркалирование через ` +
      `${Math.pow(2, M6_FAULT.bit)}. <span class="muted">Диагностика: найти бит, при инверсии которого две ячейки дают одинаковые данные.</span>`
    : `❌ Неверно. Подсказка: зеркалирование происходит через адреса, отличающиеся ровно на ${Math.pow(2, M6_FAULT.bit)} — ` +
      `это степень двойки, то есть один конкретный бит. Определите его номер и уровень, на котором он зафиксирован.`;

  m6FaultVerdict.style.borderLeft = ok ? '4px solid #27ae60' : '4px solid #e74c3c';
}

document.getElementById('m6FaultCheck').addEventListener('click', checkFault);

renderFaultSymptom();

document.getElementById('m6Continue').addEventListener('click', () => switchTab('m7'));

/* =====================================================================
   МОДУЛЬ 7. СПОСОБЫ ОБМЕНА: ОПРОС / ПРЕРЫВАНИЯ / DMA
   ===================================================================== */

const m7Size = document.getElementById('m7Size');
const m7DeviceSpeed = document.getElementById('m7DeviceSpeed');
const m7DeviceSpeedValue = document.getElementById('m7DeviceSpeedValue');
const m7Bars = document.getElementById('m7Bars');
const m7TableBody = document.getElementById('m7TableBody');

m7DeviceSpeed.addEventListener('input', () => {
  m7DeviceSpeedValue.textContent = m7DeviceSpeed.value;
});

function computeIO() {
  const bytes = Math.max(1, parseInt(m7Size.value, 10) || 1);
  const cyclesPerByte = parseInt(m7DeviceSpeed.value, 10);   // тактов на подготовку байта

  // 1) Программный опрос (polling): ЦП в цикле читает флаг готовности.
  //    На каждый байт: цикл опроса ~4 такта, повторяется пока устройство не готово.
  const pollPerByte = cyclesPerByte + 4;
  const pollTotal = bytes * pollPerByte;

  // 2) Прерывания: устройство само сообщает о готовности.
  //    На каждый байт: вход в обработчик + выход (IRET) ~20 тактов, плюс сама передача 1 такт.
  const irqPerByte = 20 + 1;
  const irqTotal = bytes * irqPerByte;

  // 3) DMA: контроллер сам гоняет данные, ЦП тратит такты только на настройку.
  //    Настройка ~50 тактов на весь блок, затем ЦП свободен.
  const dmaSetup = 50;
  const dmaTotal = dmaSetup + Math.ceil(bytes / 64) * 2;   // + обслуживание по завершении

  return { bytes, cyclesPerByte, pollTotal, irqTotal, dmaTotal };
}

function renderIO() {
  const r = computeIO();
  const max = Math.max(r.pollTotal, r.irqTotal, r.dmaTotal);

  const rows = [
    { key: 'poll', name: 'Программный опрос (polling)', color: '#e74c3c', total: r.pollTotal,
      note: 'ЦП непрерывно читает регистр состояния и ничего больше не делает' },
    { key: 'irq', name: 'Прерывания (interrupts)', color: '#e8972e', total: r.irqTotal,
      note: 'Устройство само сигнализирует; ЦП тратит такты на вход и выход из обработчика' },
    { key: 'dma', name: 'Прямой доступ к памяти (DMA)', color: '#27ae60', total: r.dmaTotal,
      note: 'Контроллер DMA перекачивает данные сам, ЦП только настраивает' }
  ];

  m7Bars.innerHTML = rows.map(row => `
    <div class="io-bar-row">
      <div class="io-bar-name">${row.name}</div>
      <div class="io-bar-track">
        <div class="io-bar-fill" data-target="${Math.max(2, row.total / max * 100)}"
             style="background:${row.color}"></div>
      </div>
      <div class="io-bar-value">${fmtInt(row.total)} тактов</div>
    </div>`).join('');

  // анимация заполнения
  requestAnimationFrame(() => {
    m7Bars.querySelectorAll('.io-bar-fill').forEach(el => {
      el.style.width = el.dataset.target + '%';
    });
  });

  m7TableBody.innerHTML = rows.map(row => {
    const share = (row.total / r.pollTotal * 100);
    return `<tr>
      <td>${row.name}</td>
      <td class="mono">${fmtInt(row.total)}</td>
      <td>${fmtFloat(share, 1)}% от опроса</td>
      <td>${row.note}</td>
    </tr>`;
  }).join('');

  document.getElementById('m7Verdict').innerHTML =
    `Для передачи <b>${fmtInt(r.bytes)} байт</b> при устройстве, готовящем байт за ${r.cyclesPerByte} тактов: ` +
    `опрос — <b>${fmtInt(r.pollTotal)}</b>, прерывания — <b>${fmtInt(r.irqTotal)}</b>, ` +
    `DMA — <b>${fmtInt(r.dmaTotal)}</b> тактов ЦП. ` +
    `DMA быстрее опроса в <b>×${fmtFloat(r.pollTotal / r.dmaTotal, 1)}</b>. ` +
    `<span class="muted">Но у DMA есть цена: контроллер должен захватывать шину (см. Модуль 4 — арбитраж), ` +
    `поэтому при наших объёмах передачи иначе распределяются приоритеты.</span>`;
}

document.getElementById('m7Run').addEventListener('click', renderIO);

/* =====================================================================
   МОДУЛЬ 8. АРХИТЕКТУРЫ И ЭВОЛЮЦИЯ ШИН
   ===================================================================== */

const m8Ops = document.getElementById('m8Ops');
const m8OpsValue = document.getElementById('m8OpsValue');

function renderM8() {
  const arch = state.m8.arch;
  const ops = parseInt(m8Ops.value, 10);
  m8OpsValue.textContent = fmtInt(ops);

  const strip = document.getElementById('m8Strip');
  if (arch === 'von') {
    strip.innerHTML = `
      <div class="arch-row">
        <div class="arch-label">Фон Нейман</div>
        <div class="arch-lines">
          <div class="arch-line code">Команды + данные — одна общая шина</div>
        </div>
        <div class="arch-note">Выборка команды и чтение данных конфликтуют</div>
      </div>`;
    // 1 шина: каждая операция = выборка команды + доступ к данным = 2 обращения
    const busCycles = ops * 2;
    document.getElementById('m8Verdict').innerHTML =
      `<b>Фон-неймановская архитектура:</b> команды и данные делят одну шину, поэтому выборка команды и обращение к данным ` +
      `не могут идти одновременно. На ${fmtInt(ops)} операций приходится <b>${fmtInt(busCycles)}</b> обращений к шине — ` +
      `это и есть «узкое место фон Неймана». <span class="muted">Смягчается кэшем: раздельные кэши команд и данных (гарвардские по сути) ` +
      `внутри процессора, но общая память снаружи.</span>`;
  } else {
    strip.innerHTML = `
      <div class="arch-row">
        <div class="arch-label">Гарвардская</div>
        <div class="arch-lines">
          <div class="arch-line code">Шина команд</div>
          <div class="arch-line data">Шина данных</div>
        </div>
        <div class="arch-note">Выборка и данные идут параллельно</div>
      </div>`;
    const busCycles = ops;   // параллельно -> одна операция = один "такт" шины
    document.getElementById('m8Verdict').innerHTML =
      `<b>Гарвардская архитектура:</b> раздельные шины команд и данных позволяют выбирать команду и читать данные ` +
      `одновременно. На ${fmtInt(ops)} операций приходится <b>${fmtInt(busCycles)}</b> «тактов шины» — вдвое меньше, ` +
      `чем у фон Неймана. <span class="muted">Плата: удвоенное число шин и выводов. Так устроены многие микроконтроллеры (AVR, ARM Cortex-M с раздельными шинами I и D).</span>`;
  }
}

document.getElementById('m8ArchButtons').addEventListener('click', (e) => {
  const btn = e.target.closest('.preset-btn');
  if (!btn) return;
  document.querySelectorAll('#m8ArchButtons .preset-btn').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  state.m8.arch = btn.dataset.arch;
  renderM8();
  saveState();
});

m8Ops.addEventListener('input', renderM8);

/* =====================================================================
   ВСТРОЕННЫЙ ТЕСТОВЫЙ БЛОК (5 КОНТРОЛЬНЫХ ВОПРОСОВ)
   ===================================================================== */

const QUIZ_META = {
  1: { text: 'При разрядности шины адреса 20 бит, сколько МБ памяти можно адресовать?' },
  2: { text: 'Какая шина данных передаёт информацию быстрее при одинаковой тактовой частоте?' },
  3: { text: 'Расставьте карточки событий цикла чтения в правильном порядке (сверху вниз).' },
  4: { text: 'Можно ли одновременно разрешить выход на общую шину двум устройствам без арбитра? Поясните свой ответ одним предложением.' },
  5: { text: 'Укажите на карте памяти область, где возникает конфликт адресов (пересечение диапазонов двух устройств).' }
};

const quizOverlay = document.getElementById('quizOverlay');
const quizCard = document.getElementById('quizCard');
let quizCloseCallback = null;

function openQuiz(n, onClose) {
  quizCloseCallback = onClose;
  quizCard.innerHTML = buildQuizHtml(n);
  quizOverlay.classList.remove('hidden');
  attachQuizHandlers(n);
}

function closeQuiz() {
  quizOverlay.classList.add('hidden');
  if (quizCloseCallback) quizCloseCallback();
  quizCloseCallback = null;
}

function recordQuizAnswer(n, answerText, status, correctAnswerText) {
  state.quiz[n] = { answerText, status, correctAnswerText, questionText: QUIZ_META[n].text };
  saveState();
  updateTestCounter();
}

function updateTestCounter() {
  const correct = Object.values(state.quiz).filter(q => q && q.status === 'correct').length;
  document.getElementById('testCounter').textContent = `Верно: ${correct}/5`;
}

function buildQuizHtml(n) {
  const already = state.quiz[n];
  let body = '';
  if (n === 1) {
    body = `
      <div class="quiz-question">${QUIZ_META[1].text}</div>
      <div class="control-box">
        <input type="text" id="quizInput1" placeholder="Введите число в МБ" value="${already ? already.answerText : ''}">
      </div>
      <div class="quiz-feedback hidden" id="quizFeedback1"></div>
      <div class="quiz-actions">
        <button class="btn btn-secondary" id="quizSkip1">Пропустить</button>
        <button class="btn btn-primary" id="quizSubmit1">Проверить</button>
      </div>`;
  } else if (n === 2) {
    body = `
      <div class="quiz-question">${QUIZ_META[2].text}</div>
      <div class="quiz-radio-options" id="quizRadio2">
        <div class="quiz-radio-option" data-val="8">
          <div class="radio-visual">${'<div style="height:3px;background:#27ae60;margin:2px 0;width:70%"></div>'.repeat(3)}</div>
          Шина данных 8 бит
        </div>
        <div class="quiz-radio-option" data-val="64">
          <div class="radio-visual">${'<div style="height:2px;background:#27ae60;margin:1px 0;width:90%"></div>'.repeat(8)}</div>
          Шина данных 64 бита
        </div>
      </div>
      <div class="quiz-feedback hidden" id="quizFeedback2"></div>
      <div class="quiz-actions">
        <button class="btn btn-secondary" id="quizSkip2">Пропустить</button>
        <button class="btn btn-primary" id="quizSubmit2">Проверить</button>
      </div>`;
  } else if (n === 3) {
    const items = [
      { id: 'a', text: 'ЦП выставляет адрес на шину адреса' },
      { id: 'b', text: 'ЦП активирует сигнал RD (чтение)' },
      { id: 'c', text: 'Память декодирует адрес и находит ячейку' },
      { id: 'd', text: 'Память выставляет данные на шину данных' }
    ];
    const shuffled = items.slice().sort(() => Math.random() - 0.5);
    body = `
      <div class="quiz-question">${QUIZ_META[3].text}</div>
      <div class="quiz-drag-list" id="quizDragList3">
        ${shuffled.map((it, i) => `<div class="quiz-drag-item" draggable="true" data-id="${it.id}">
          <span class="drag-order-num">${i + 1}</span>${it.text}</div>`).join('')}
      </div>
      <div class="quiz-feedback hidden" id="quizFeedback3"></div>
      <div class="quiz-actions">
        <button class="btn btn-secondary" id="quizSkip3">Пропустить</button>
        <button class="btn btn-primary" id="quizSubmit3">Проверить</button>
      </div>`;
  } else if (n === 4) {
    body = `
      <div class="quiz-question">${QUIZ_META[4].text}</div>
      <div class="quiz-radio-options" id="quizRadio4">
        <div class="quiz-radio-option" data-val="yes"><div class="radio-visual">Да</div></div>
        <div class="quiz-radio-option" data-val="no"><div class="radio-visual">Нет</div></div>
      </div>
      <textarea class="quiz-textarea" id="quizExplain4" placeholder="Поясните свой ответ одним предложением..."></textarea>
      <div class="field-hint error hidden" id="quizExplainHint4">Пожалуйста, добавьте пояснение (самоконтроль).</div>
      <div class="quiz-feedback hidden" id="quizFeedback4"></div>
      <div class="quiz-actions">
        <button class="btn btn-secondary" id="quizSkip4">Пропустить</button>
        <button class="btn btn-primary" id="quizSubmit4">Проверить</button>
      </div>`;
  } else if (n === 5) {
    body = `
      <div class="quiz-question">${QUIZ_META[5].text}</div>
      <div class="m5-quiz-map" id="quizMap5">
        <div class="m5-quiz-segment" data-zone="A" style="top:0%; height:40%; background:#8e44ad;"></div>
        <div class="m5-quiz-segment" data-zone="conflict" style="top:30%; height:20%; background:#c0392b;"></div>
        <div class="m5-quiz-segment" data-zone="B" style="top:40%; height:35%; background:#2ecc71;"></div>
        <div class="m5-quiz-segment" data-zone="C" style="top:80%; height:20%; background:#e67e22;"></div>
      </div>
      <div class="quiz-feedback hidden" id="quizFeedback5"></div>
      <div class="quiz-actions">
        <button class="btn btn-secondary" id="quizSkip5">Пропустить</button>
      </div>`;
  }
  return `<h3>Контрольный вопрос №${n} из 5</h3>${body}`;
}

function attachQuizHandlers(n) {
  const skipBtn = document.getElementById('quizSkip' + n);
  if (skipBtn) skipBtn.addEventListener('click', () => {
    if (!state.quiz[n]) recordQuizAnswer(n, '', 'skipped', '');
    closeQuiz();
  });

  if (n === 1) {
    document.getElementById('quizSubmit1').addEventListener('click', () => {
      const input = document.getElementById('quizInput1');
      const match = input.value.replace(',', '.').match(/[\d.]+/);
      const val = match ? parseFloat(match[0]) : NaN;
      const correct = val === 1; // 2^20 байт = 1 МБ
      showQuizFeedback(1, correct, '1 МБ (2^20 байт = 1 048 576 байт = 1 МБ)');
      recordQuizAnswer(1, input.value, correct ? 'correct' : 'incorrect', '1 МБ');
    });
  }

  if (n === 2) {
    const options = document.querySelectorAll('#quizRadio2 .quiz-radio-option');
    let selected = null;
    options.forEach(opt => opt.addEventListener('click', () => {
      options.forEach(o => o.classList.remove('selected'));
      opt.classList.add('selected');
      selected = opt.dataset.val;
    }));
    document.getElementById('quizSubmit2').addEventListener('click', () => {
      if (!selected) { selected = null; }
      const correct = selected === '64';
      showQuizFeedback(2, correct, 'Шина данных 64 бита передаёт в 8 раз больше бит за такт при одинаковой частоте.');
      recordQuizAnswer(2, selected === '8' ? '8 бит' : selected === '64' ? '64 бита' : 'не выбрано',
        correct ? 'correct' : 'incorrect', '64 бита');
    });
  }

  if (n === 3) {
    const list = document.getElementById('quizDragList3');
    let dragSrc = null;
    list.querySelectorAll('.quiz-drag-item').forEach(item => {
      item.addEventListener('dragstart', () => { dragSrc = item; item.classList.add('dragging'); });
      item.addEventListener('dragend', () => item.classList.remove('dragging'));
      item.addEventListener('dragover', (e) => e.preventDefault());
      item.addEventListener('drop', (e) => {
        e.preventDefault();
        if (dragSrc && dragSrc !== item) {
          const items = Array.from(list.children);
          const srcIdx = items.indexOf(dragSrc), tgtIdx = items.indexOf(item);
          if (srcIdx < tgtIdx) item.after(dragSrc); else item.before(dragSrc);
          renumberDragList(list);
        }
      });
    });
    document.getElementById('quizSubmit3').addEventListener('click', () => {
      const order = Array.from(list.children).map(el => el.dataset.id);
      const correct = JSON.stringify(order) === JSON.stringify(['a', 'b', 'c', 'd']);
      showQuizFeedback(3, correct, 'Правильный порядок: адрес → сигнал RD → декодирование адреса памятью → данные на шину.');
      recordQuizAnswer(3, order.join('-'), correct ? 'correct' : 'incorrect', 'a-b-c-d');
    });
  }

  if (n === 4) {
    const options = document.querySelectorAll('#quizRadio4 .quiz-radio-option');
    let selected = null;
    options.forEach(opt => opt.addEventListener('click', () => {
      options.forEach(o => o.classList.remove('selected'));
      opt.classList.add('selected');
      selected = opt.dataset.val;
    }));
    document.getElementById('quizSubmit4').addEventListener('click', () => {
      const explain = document.getElementById('quizExplain4').value.trim();
      const hint = document.getElementById('quizExplainHint4');
      if (explain.length < 5) {
        hint.classList.remove('hidden');
        document.getElementById('quizExplain4').classList.add('invalid');
        return;
      }
      hint.classList.add('hidden');
      document.getElementById('quizExplain4').classList.remove('invalid');
      // да/нет оценивается по факту (арбитраж обязателен), пояснение — для самоконтроля, без автооценки
      const correct = selected === 'no';
      showQuizFeedback(4, correct, 'Нет — без арбитра возникнет конфликт шины (bus contention). Ваше пояснение сохранено для самоконтроля и не оценивается автоматически.');
      recordQuizAnswer(4, `${selected === 'yes' ? 'Да' : selected === 'no' ? 'Нет' : '—'}. ${explain}`,
        correct ? 'correct' : 'incorrect', 'Нет');
    });
  }

  if (n === 5) {
    const map = document.getElementById('quizMap5');
    map.addEventListener('click', (e) => {
      const rect = map.getBoundingClientRect();
      const fraction = (e.clientY - rect.top) / rect.height;
      const correct = fraction >= 0.30 && fraction <= 0.50; // зона "conflict"
      map.querySelectorAll('.m5-quiz-segment').forEach(s => s.classList.remove('chosen'));
      const clickedSeg = Array.from(map.querySelectorAll('.m5-quiz-segment')).find(s => {
        const top = parseFloat(s.style.top) / 100, h = parseFloat(s.style.height) / 100;
        return fraction >= top && fraction <= top + h;
      });
      if (clickedSeg) clickedSeg.classList.add('chosen');
      showQuizFeedback(5, correct, 'Конфликт возникает в зоне пересечения диапазонов устройств A и B (красная область).');
      recordQuizAnswer(5, clickedSeg ? clickedSeg.dataset.zone : 'вне карты', correct ? 'correct' : 'incorrect', 'зона пересечения (conflict)');
    });
  }
}

function renumberDragList(list) {
  Array.from(list.children).forEach((el, i) => { el.querySelector('.drag-order-num').textContent = i + 1; });
}

function showQuizFeedback(n, correct, explanation) {
  const fb = document.getElementById('quizFeedback' + n);
  fb.classList.remove('hidden', 'correct', 'incorrect');
  fb.classList.add(correct ? 'correct' : 'incorrect');
  fb.textContent = (correct ? '✅ Верно! ' : '❌ Неверно. ') + explanation;
  // заменяем кнопки на «Продолжить» после ответа
  const actions = fb.nextElementSibling;
  if (actions && actions.classList.contains('quiz-actions')) {
    actions.innerHTML = '<button class="btn btn-primary" id="quizContinueBtn">Продолжить →</button>';
    document.getElementById('quizContinueBtn').addEventListener('click', closeQuiz);
  }
}

document.getElementById('quizOverlay').addEventListener('click', (e) => {
  if (e.target === quizOverlay) { /* не закрываем по клику вне карточки — нужно явное действие */ }
});

/* =====================================================================
   ВСПЛЫВАЮЩЕЕ УВЕДОМЛЕНИЕ (toast)
   ===================================================================== */

function showToast(text) {
  const el = document.createElement('div');
  el.textContent = text;
  el.style.position = 'fixed';
  el.style.bottom = '24px';
  el.style.left = '50%';
  el.style.transform = 'translateX(-50%)';
  el.style.background = '#1b2430';
  el.style.color = '#fff';
  el.style.padding = '12px 20px';
  el.style.borderRadius = '10px';
  el.style.boxShadow = '0 6px 20px rgba(0,0,0,0.3)';
  el.style.zIndex = 900;
  el.style.fontSize = '14px';
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 3000);
}

/* =====================================================================
   МОДУЛЬ 6. ФОРМИРОВАНИЕ ОТЧЁТА (PDF-ЭКСПОРТ)
   ===================================================================== */

let fontsRegistered = false;
function registerCyrillicFonts(doc) {
  if (!fontsRegistered) {
    doc.addFileToVFS('DejaVuSans-normal.ttf', window.DEJAVU_SANS_NORMAL_B64);
    doc.addFont('DejaVuSans-normal.ttf', 'DejaVuSans', 'normal');
    doc.addFileToVFS('DejaVuSans-bold.ttf', window.DEJAVU_SANS_BOLD_B64);
    doc.addFont('DejaVuSans-bold.ttf', 'DejaVuSans', 'bold');
    fontsRegistered = true;
  }
}

function buildReportFilename() {
  const fioParts = (state.student.fio || 'Студент').trim().split(/\s+/);
  const lastFirst = fioParts.slice(0, 2).map(translit).join('_');
  const group = translit(state.student.group || 'группа').replace(/\s+/g, '_');
  const date = isoToDashed(state.student.date || todayISO());
  const safe = s => s.replace(/[^A-Za-z0-9_\-]/g, '');
  return `Otchet_${safe(lastFirst)}_${safe(group)}_${date}.pdf`;
}

function collectReportData() {
  const quizRows = [1, 2, 3, 4, 5].map(n => {
    const q = state.quiz[n];
    let statusLabel = 'Не отвечено';
    if (q) {
      if (q.status === 'correct') statusLabel = 'Верно';
      else if (q.status === 'incorrect') statusLabel = 'Неверно';
      else if (q.status === 'skipped') statusLabel = 'Пропущено';
    }
    return {
      n,
      question: QUIZ_META[n].text,
      answer: q ? (q.answerText || '—') : '—',
      status: statusLabel,
      correct: q && q.status === 'incorrect' ? q.correctAnswerText : ''
    };
  });
  const correctCount = quizRows.filter(r => r.status === 'Верно').length;

  const m1Bits = state.m1.bits;
  const m1Bytes = Math.pow(2, m1Bits);

  const m2Bits = state.m2.bits;
  const m2Freq = state.m2.freq;
  const m2ThroughputMBs = (m2Bits / 8) * m2Freq; // упрощённая формула из ТЗ: бит × МГц / 8

  const m3SyncLabel = state.m3.sync ? 'синхронный' : 'асинхронный';
  const m3Total = state.m3.cyclesRead + state.m3.cyclesWrite;

  const m5Conflicts = (() => {
    const p = state.m5.placements;
    for (let i = 0; i < p.length; i++)
      for (let j = i + 1; j < p.length; j++) {
        const a = p[i], b = p[j];
        if (a.start <= b.start + b.size - 1 && b.start <= a.start + a.size - 1) return true;
      }
    return false;
  })();
  const m5Complete = state.m5.placements.length === 3 && !m5Conflicts;

  // параметры новых модулей
  const m3Wait = state.m3.wait || 0;
  const m5IoModeLabel = state.m5.ioMode === 'isolated'
    ? 'изолированный ввод-вывод'
    : 'memory-mapped I/O';
  const m8ArchLabel = state.m8.arch === 'harvard' ? 'гарвардская' : 'фон Неймана';

  return {
    student: state.student,
    quizRows, correctCount,
    m1: { bits: m1Bits, bytesHuman: bytesToHuman(m1Bytes) },
    m2: { bits: m2Bits, freq: m2Freq, throughput: m2ThroughputMBs },
    m3: { syncLabel: m3SyncLabel, total: m3Total, read: state.m3.cyclesRead, write: state.m3.cyclesWrite, wait: m3Wait },
    m5: { complete: m5Complete, placements: state.m5.placements, ioMode: m5IoModeLabel },
    m8: { arch: m8ArchLabel }
  };
}

async function captureMemoryMap() {
  const zone = document.getElementById('m5DropZone');
  if (!zone || state.m5.placements.length === 0) return null;
  if (!window.html2canvas) return null;
  try {
    // снимаем элемент, даже если модуль 5 сейчас скрыт — уводим его за пределы экрана,
    // чтобы не было визуальной вспышки при переключении вкладок
    const moduleEl = document.getElementById('m5');
    const wasHidden = moduleEl.classList.contains('hidden');
    const prevStyle = moduleEl.getAttribute('style') || '';
    if (wasHidden) {
      moduleEl.style.position = 'fixed';
      moduleEl.style.left = '-20000px';
      moduleEl.style.top = '0';
      moduleEl.style.display = 'block';
      moduleEl.style.width = '1100px';
    }
    let result = null;
    try {
      const canvas = await window.html2canvas(zone, {
        backgroundColor: '#eef2f8',
        scale: Math.min(2, window.devicePixelRatio || 1),
        logging: false,
        useCORS: false
      });
      result = {
        dataUrl: canvas.toDataURL('image/png'),
        width: canvas.width,
        height: canvas.height
      };
    } finally {
      if (wasHidden) {
        if (prevStyle) moduleEl.setAttribute('style', prevStyle);
        else moduleEl.removeAttribute('style');
      }
    }
    return result;
  } catch (e) {
    return null;
  }
}

function generateReport() {
  if (!window.jspdf) { showToast('Библиотека jsPDF не загружена.'); return Promise.resolve(null); }
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  registerCyrillicFonts(doc);

  const data = collectReportData();
  const pageW = 210, pageH = 297;
  const left = 15, right = pageW - 15;
  const bottomLimit = pageH - 22;
  let y = 18;

  /* --- помощник: гарантирует место под блок высотой need (мм) --- */
  function ensureSpace(need) {
    if (y + need > bottomLimit) {
      doc.addPage();
      y = 18;
      doc.setFont('DejaVuSans', 'normal');
      doc.setFontSize(8);
      doc.setTextColor(150);
      doc.text('Bus Simulator — продолжение отчёта', pageW / 2, 10, { align: 'center' });
      doc.setTextColor(0);
      y = 18;
      return true;
    }
    return false;
  }

  /* --- шапка (только на первой странице) --- */
  doc.setFont('DejaVuSans', 'bold'); doc.setFontSize(15);
  doc.text('Архитектура аппаратных средств', pageW / 2, y, { align: 'center' }); y += 7;
  doc.setFont('DejaVuSans', 'normal'); doc.setFontSize(12);
  doc.text('Практическая работа: «Шины адреса и данных — интерактивный тренажёр»', pageW / 2, y, { align: 'center' }); y += 9;

  doc.setFontSize(11);
  doc.text(`ФИО: ${data.student.fio || '—'}`, left, y);
  doc.text(`Группа: ${data.student.group || '—'}`, 110, y);
  doc.text(`Дата: ${isoToDisplay(data.student.date)}`, 170, y); y += 8;

  doc.setDrawColor(200); doc.line(left, y, right, y); y += 8;

  /* --- таблица вопросов --- */
  doc.setFont('DejaVuSans', 'bold'); doc.setFontSize(13);
  doc.text('Результаты контрольных вопросов', left, y); y += 7;

  doc.setFont('DejaVuSans', 'bold'); doc.setFontSize(9);
  doc.text('№', 15, y); doc.text('Вопрос', 22, y); doc.text('Ответ студента', 105, y);
  doc.text('Статус', 150, y); doc.text('Правильный ответ', 170, y);
  y += 2; doc.line(left, y, right, y); y += 4;

  doc.setFont('DejaVuSans', 'normal');
  data.quizRows.forEach(row => {
    const qLines = doc.splitTextToSize(row.question, 80);
    const aLines = doc.splitTextToSize(String(row.answer), 42);
    const cLines = doc.splitTextToSize(String(row.correct || '—'), 35);
    const lineCount = Math.max(qLines.length, aLines.length, cLines.length, 1);
    const rowHeight = lineCount * 4.6 + 1.5;

    if (y + rowHeight > bottomLimit) {
      doc.addPage(); y = 18;
      // повторяем заголовок таблицы на новой странице
      doc.setFont('DejaVuSans', 'bold'); doc.setFontSize(9);
      doc.text('№', 15, y); doc.text('Вопрос', 22, y); doc.text('Ответ студента', 105, y);
      doc.text('Статус', 150, y); doc.text('Правильный ответ', 170, y);
      y += 2; doc.line(left, y, right, y); y += 4;
      doc.setFont('DejaVuSans', 'normal');
    }

    doc.text(String(row.n), 15, y);
    doc.text(qLines, 22, y);
    doc.text(aLines, 105, y);
    doc.text(row.status, 150, y);
    doc.text(cLines, 170, y);
    y += rowHeight;
  });

  y += 4;
  ensureSpace(12);
  doc.setFont('DejaVuSans', 'bold'); doc.setFontSize(14);
  doc.text(`Правильных ответов: ${data.correctCount} из 5`, left, y); y += 10;

  doc.setDrawColor(200); doc.line(left, y, right, y); y += 8;

  /* --- параметры модулей --- */
  doc.setFont('DejaVuSans', 'bold'); doc.setFontSize(13);
  doc.text('Параметры, с которыми работал студент', left, y); y += 7;
  doc.setFont('DejaVuSans', 'normal'); doc.setFontSize(10);

  const lines = [
    `Модуль 1 (шина адреса): разрядность ${data.m1.bits} бит → объём адресуемой памяти ${data.m1.bytesHuman}.`,
    `Модуль 2 (шина данных): разрядность ${data.m2.bits} бит, частота ${data.m2.freq} МГц → пропускная способность ${fmtFloat(data.m2.throughput, 2)} МБ/с.`,
    `Модуль 3 (цикл чтения/записи): режим шины — ${data.m3.syncLabel}; тактов ожидания памяти — ${data.m3.wait}; выполнено циклов: ${data.m3.total} (чтение: ${data.m3.read}, запись: ${data.m3.write}).`,
    data.m5.complete
      ? `Модуль 5 (карта памяти): раскладка завершена без конфликтов. ` +
        data.m5.placements.slice().sort((a, b) => b.start - a.start)
          .map(p => `${p.label} [${toHex(p.start, M5_TOTAL_BITS)}…${toHex(p.start + p.size - 1, M5_TOTAL_BITS)}]`).join(', ') + '.'
      : 'Модуль 5 (карта памяти): раскладка не завершена без конфликтов на момент формирования отчёта.',
    `Модуль 5 (отображение ввода-вывода): ${data.m5.ioMode}.`,
    `Модуль 8 (архитектура): ${data.m8.arch}.`
  ];
  lines.forEach(line => {
    const wrapped = doc.splitTextToSize(line, right - left);
    ensureSpace(wrapped.length * 5 + 2);
    doc.text(wrapped, left, y);
    y += wrapped.length * 5 + 2;
  });

  return { doc, data, pageW, pageH, left, right, bottomLimit, getY: () => y, setY: v => { y = v; }, ensureSpace };
}

/* --- финализация: снимок карты памяти + подвал + сохранение --- */
async function buildAndSaveReport() {
  const ctx = generateReport();
  if (!ctx) return null;
  const { doc, data, pageW, pageH, left, right } = ctx;
  let y = ctx.getY();

  /* снимок карты памяти из Модуля 5 (если раскладка есть) */
  const shot = await captureMemoryMap();
  if (shot) {
    const maxW = right - left;                       // 180 мм
    const maxH = 110;                                // ограничение по высоте, мм
    let imgW = maxW;
    let imgH = imgW * (shot.height / shot.width);    // сохраняем реальные пропорции снимка
    if (imgH > maxH) {                               // слишком высокий — ужимаем по высоте
      imgH = maxH;
      imgW = imgH * (shot.width / shot.height);
    }
    const xImg = left + (maxW - imgW) / 2;           // центрируем по ширине страницы

    if (y + 6 + imgH + 8 > pageH - 22) { doc.addPage(); y = 18; }
    doc.setFont('DejaVuSans', 'bold'); doc.setFontSize(11);
    doc.text('Визуальная карта размещения устройств (Модуль 5)', left, y); y += 6;
    try { doc.addImage(shot.dataUrl, 'PNG', xImg, y, imgW, imgH); } catch (e) { /* пропускаем, если образ не принят */ }
    y += imgH + 6;
  }

  /* подвал на последней странице */
  const timestamp = new Date().toLocaleString('ru-RU');
  const hash = simpleHash(JSON.stringify(data) + timestamp);
  const totalPages = doc.internal.getNumberOfPages();
  for (let p = 1; p <= totalPages; p++) {
    doc.setPage(p);
    doc.setFont('DejaVuSans', 'normal'); doc.setFontSize(8); doc.setTextColor(140);
    doc.text(`Отчёт сформирован: ${timestamp}   |   Контрольная сумма: ${hash}   |   Стр. ${p} из ${totalPages}`, left, pageH - 10);
    doc.setTextColor(0);
  }

  const filename = buildReportFilename();
  doc.save(filename);
  return filename;
}

document.getElementById('reportBtn').addEventListener('click', async () => {
  const btn = document.getElementById('reportBtn');
  const originalText = btn.textContent;
  btn.disabled = true;
  btn.textContent = '⏳ Формирование...';
  try {
    const filename = await buildAndSaveReport();
    if (!filename) return;
    document.getElementById('reportModalText').textContent =
      `Файл «${filename}» скачивается автоматически. Проверьте папку загрузок браузера.`;
    document.getElementById('reportOverlay').classList.remove('hidden');
  } catch (e) {
    showToast('Не удалось сформировать отчёт: ' + e.message);
  } finally {
    btn.disabled = false;
    btn.textContent = originalText;
  }
});
document.getElementById('reportModalClose').addEventListener('click', () => {
  document.getElementById('reportOverlay').classList.add('hidden');
});

/* =====================================================================
   ИНИЦИАЛИЗАЦИЯ ПРИЛОЖЕНИЯ
   ===================================================================== */

function restoreQuizInputsFromState() {
  // счётчик теста выставляется сразу из сохранённого состояния
  updateTestCounter();
}

function init() {
  initIdentScreen();
  updateStudentBadge();

  m1Slider.value = state.m1.bits;
  updateM1();
  updateM1Reverse();

  initM2();
  initM3();
  updateM4();
  renderM5();

  restoreQuizInputsFromState();
  switchTab('m1');
}

init();
