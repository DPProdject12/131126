'use strict';

(function () {
  const OPS = {
    0x00: { m: 'NOP', len: 1 },
    0x01: { m: 'LDA', len: 3 },
    0x02: { m: 'ADD', len: 3 },
    0x03: { m: 'STA', len: 3 },
    0x04: { m: 'JMP', len: 3 },
    0x05: { m: 'HLT', len: 1 },
    0x06: { m: 'RETI', len: 1 }
  };
  const OPCODE = {};
  Object.keys(OPS).forEach(k => { OPCODE[OPS[k].m] = Number(k); });

  const ISR_ADDR = 0x0040;
  const SP_INIT = 0xFFFE;
  const PHASES = [['fetch', 'Выборка'], ['decode', 'Декодирование'], ['execute', 'Исполнение'], ['interrupt', 'Прерывание']];
  const PHASE_NAME = Object.fromEntries(PHASES);

  const PROGRAMS = {
    sum: {
      title: 'Сумма двух ячеек',
      desc: 'Складывает содержимое ячеек 0x0100 и 0x0101 и записывает результат в 0x0102.',
      code: [
        { addr: 0x0000, op: 'LDA', arg: 0x0100, note: 'первое слагаемое в A' },
        { addr: 0x0003, op: 'ADD', arg: 0x0101, note: 'прибавляем второе' },
        { addr: 0x0006, op: 'STA', arg: 0x0102, note: 'сохраняем сумму' },
        { addr: 0x0009, op: 'HLT', note: 'останов' }
      ],
      data: { 0x0100: 5, 0x0101: 7, 0x0102: 0 }
    },
    jump: {
      title: 'Программа с переходом',
      desc: 'Та же сумма, но между LDA и ADD стоит переход JMP, который пропускает NOP.',
      code: [
        { addr: 0x0000, op: 'LDA', arg: 0x0100, note: 'первое слагаемое в A' },
        { addr: 0x0003, op: 'JMP', arg: 0x0007, note: 'переход на ADD' },
        { addr: 0x0006, op: 'NOP', note: 'пропускается переходом' },
        { addr: 0x0007, op: 'ADD', arg: 0x0101, note: 'прибавляем второе' },
        { addr: 0x000A, op: 'STA', arg: 0x0102, note: 'сохраняем сумму' },
        { addr: 0x000D, op: 'HLT', note: 'останов' }
      ],
      data: { 0x0100: 5, 0x0101: 7, 0x0102: 0 }
    }
  };

  const ISR_CODE = [
    { addr: ISR_ADDR, op: 'NOP' },
    { addr: ISR_ADDR + 1, op: 'NOP' },
    { addr: ISR_ADDR + 2, op: 'RETI' }
  ];

  const hex16 = v => '0x' + (v & 0xFFFF).toString(16).toUpperCase().padStart(4, '0');
  const hex8 = v => '0x' + (v & 0xFF).toString(16).toUpperCase().padStart(2, '0');

  function encodeIns(ins) {
    const bytes = [OPCODE[ins.op]];
    if (OPS[OPCODE[ins.op]].len === 3) bytes.push(ins.arg & 0xFF, ins.arg >> 8);
    return bytes;
  }

  function buildTrace(progKey, interruptAfter) {
    const prog = PROGRAMS[progKey];
    const mem = new Uint8Array(0x10000);
    const place = (base, bytes) => bytes.forEach((b, i) => { mem[(base + i) & 0xFFFF] = b; });
    prog.code.forEach(ins => place(ins.addr, encodeIns(ins)));
    ISR_CODE.forEach(ins => place(ins.addr, encodeIns(ins)));
    Object.keys(prog.data).forEach(a => { mem[Number(a)] = prog.data[a]; });

    const cpu = { pc: 0, ir: 0, a: 0, sp: SP_INIT };
    const steps = [];
    let intrMode = false;
    let instrAddr = -1;
    let mainCount = 0;
    let interruptDone = false;

    const rec = extra => steps.push(Object.assign({
      phase: 'fetch', label: '', addr: null, data: null, ctl: null,
      cycle: false, intr: intrMode, instr: instrAddr
    }, extra, { pc: cpu.pc, ir: cpu.ir, a: cpu.a, sp: cpu.sp }));

    const read = (addr, phase, label) => {
      const a = addr & 0xFFFF;
      const v = mem[a];
      rec({ phase, label, addr: a, data: v, ctl: 'RD', cycle: true });
      return v;
    };
    const write = (addr, v, phase, label) => {
      const a = addr & 0xFFFF;
      mem[a] = v & 0xFF;
      rec({ phase, label, addr: a, data: v & 0xFF, ctl: 'WR', cycle: true });
    };
    const fetchByte = label => {
      const a = cpu.pc;
      cpu.pc = (cpu.pc + 1) & 0xFFFF;
      return read(a, 'fetch', label);
    };

    function executeOne() {
      instrAddr = cpu.pc;
      const opcode = fetchByte('Выборка кода операции');
      const info = OPS[opcode];
      if (!info) throw new Error('Неизвестный код операции ' + hex8(opcode));
      cpu.ir = opcode;
      rec({ phase: 'decode', label: `Декодирование: ${info.m}, длина ${info.len} байт (внутренний шаг, шина не занята)` });

      let arg = 0;
      if (info.len === 3) {
        const lo = fetchByte(`Выборка младшего байта операнда (${info.m})`);
        const hi = fetchByte(`Выборка старшего байта операнда (${info.m})`);
        arg = lo | (hi << 8);
      }

      switch (info.m) {
        case 'NOP':
          rec({ phase: 'execute', label: 'NOP: пустая операция' });
          break;
        case 'LDA': {
          const v = read(arg, 'execute', `LDA: чтение ячейки ${hex16(arg)}`);
          cpu.a = v;
          rec({ phase: 'execute', label: `LDA: A = ${v}` });
          break;
        }
        case 'ADD': {
          const v = read(arg, 'execute', `ADD: чтение операнда из ${hex16(arg)}`);
          cpu.a = (cpu.a + v) & 0xFF;
          rec({ phase: 'execute', label: `ADD: A = A + ${v} = ${cpu.a}` });
          break;
        }
        case 'STA':
          write(arg, cpu.a, 'execute', `STA: запись A (${cpu.a}) в ячейку ${hex16(arg)}`);
          break;
        case 'JMP':
          cpu.pc = arg;
          rec({ phase: 'execute', label: `JMP: PC = ${hex16(arg)}` });
          break;
        case 'HLT':
          cpu.halted = true;
          rec({ phase: 'execute', label: 'HLT: останов' });
          break;
        case 'RETI': {
          const lo = read(cpu.sp, 'execute', 'RETI: извлечение младшего байта адреса из стека');
          cpu.sp = (cpu.sp + 1) & 0xFFFF;
          const hi = read(cpu.sp, 'execute', 'RETI: извлечение старшего байта адреса из стека');
          cpu.sp = (cpu.sp + 1) & 0xFFFF;
          cpu.pc = lo | (hi << 8);
          rec({ phase: 'execute', label: `RETI: возврат в основную программу, PC = ${hex16(cpu.pc)}` });
          intrMode = false;
          break;
        }
      }
    }

    function takeInterrupt() {
      intrMode = true;
      instrAddr = -1;
      rec({ phase: 'interrupt', label: `INTA: запрос принят, устройство выставляет вектор ${hex8(ISR_ADDR)}`, data: ISR_ADDR & 0xFF, ctl: 'INTA', cycle: true });
      cpu.sp = (cpu.sp - 1) & 0xFFFF;
      write(cpu.sp, cpu.pc >> 8, 'interrupt', 'Сохранение старшего байта PC в стеке');
      cpu.sp = (cpu.sp - 1) & 0xFFFF;
      write(cpu.sp, cpu.pc & 0xFF, 'interrupt', 'Сохранение младшего байта PC в стеке');
      cpu.pc = ISR_ADDR;
      rec({ phase: 'interrupt', label: `Переход к обработчику: PC = ${hex16(ISR_ADDR)}` });
      interruptDone = true;
    }

    for (let guard = 0; !cpu.halted && guard < 200; guard++) {
      const inIsr = intrMode;
      executeOne();
      if (!inIsr && !cpu.halted) {
        mainCount++;
        if (interruptAfter && !interruptDone && mainCount === interruptAfter) takeInterrupt();
      }
    }

    const busSteps = steps.filter(s => s.cycle);
    const perInstr = {};
    busSteps.forEach(s => { if (!s.intr) perInstr[s.instr] = (perInstr[s.instr] || 0) + 1; });

    return {
      steps,
      progCycles: busSteps.filter(s => !s.intr).length,
      intrCycles: busSteps.filter(s => s.intr).length,
      intaCycles: busSteps.filter(s => s.ctl === 'INTA').length,
      pushCycles: busSteps.filter(s => s.phase === 'interrupt' && s.ctl === 'WR').length,
      perInstr,
      result: mem[0x0102],
      finalA: cpu.a,
      interruptDone
    };
  }

  const $ = id => document.getElementById(id);
  const ui = {
    prog: $('m9Program'), intToggle: $('m9IntToggle'), intAfter: $('m9IntAfter'),
    desc: $('m9Desc'), step: $('m9Step'), auto: $('m9Auto'), reset: $('m9Reset'),
    regs: $('m9Regs'), bus: $('m9Bus'), phases: $('m9Phases'),
    listing: $('m9ListingBody'), trace: $('m9TraceBody'), summary: $('m9Summary')
  };
  if (!ui.prog) return;

  let trace = null;
  let idx = -1;
  let timer = null;

  const freqMHz = () => (typeof state !== 'undefined' && state.m2 && state.m2.freq) || 100;
  const idleCls = v => (v ? '' : 'idle');

  function fillIntAfter() {
    const prog = PROGRAMS[ui.prog.value];
    const prev = Number(ui.intAfter.value) || 1;
    ui.intAfter.innerHTML = '';
    for (let k = 1; k < prog.code.length; k++) {
      const o = document.createElement('option');
      o.value = k;
      o.textContent = `после команды ${k} (${prog.code[k - 1].op})`;
      ui.intAfter.appendChild(o);
    }
    ui.intAfter.value = Math.min(prev, prog.code.length - 1);
  }

  function stopAuto() {
    if (timer) { clearInterval(timer); timer = null; }
    ui.auto.textContent = 'Авто ▶';
  }

  function rebuild() {
    stopAuto();
    idx = -1;
    const key = ui.prog.value;
    const after = ui.intToggle.checked ? Number(ui.intAfter.value) : 0;
    trace = buildTrace(key, after);
    ui.desc.textContent = PROGRAMS[key].desc;
    render();
  }

  function stepOnce() {
    if (idx < trace.steps.length - 1) idx++;
    if (idx >= trace.steps.length - 1) stopAuto();
    render();
  }

  function render() {
    const prog = PROGRAMS[ui.prog.value];
    const steps = trace.steps;
    const cur = idx >= 0 ? steps[idx] : null;
    const st = cur || { pc: 0, ir: 0, a: 0, sp: SP_INIT, intr: false };

    ui.regs.innerHTML = `
      <div class="cpu-kv"><b>PC</b> ${hex16(st.pc)}</div>
      <div class="cpu-kv"><b>IR</b> ${hex8(st.ir)}</div>
      <div class="cpu-kv"><b>A</b> ${hex8(st.a)} (${st.a})</div>
      <div class="cpu-kv"><b>SP</b> ${hex16(st.sp)}</div>
      <div class="cpu-kv"><b>Режим</b> ${st.intr ? 'прерывание' : 'основная программа'}</div>`;

    const hasAddr = cur && cur.addr != null;
    const hasData = cur && cur.data != null;
    const hasCtl = cur && cur.ctl;
    ui.bus.innerHTML = `
      <div class="cpu-kv"><b>ADDR</b> <span class="bus-val ${idleCls(hasAddr)}">${hasAddr ? hex16(cur.addr) : '—'}</span></div>
      <div class="cpu-kv"><b>DATA</b> <span class="bus-val ${idleCls(hasData)}">${hasData ? hex8(cur.data) : '—'}</span></div>
      <div class="cpu-kv"><b>CTL</b> <span class="bus-val ${idleCls(hasCtl)}">${hasCtl ? cur.ctl : '—'}</span></div>
      <div class="muted" style="font-size:12px">${cur ? (cur.cycle ? 'Цикл шины' : 'Внутренний шаг, шина не занята') : 'Программа ещё не запущена'}</div>`;

    ui.phases.innerHTML = PHASES.map(([k, t]) =>
      `<span class="${cur && cur.phase === k ? 'on' : ''}">${t}</span>`).join('');

    ui.listing.innerHTML = prog.code.map(ins => {
      const bytes = encodeIns(ins).map(hex8).join(' ');
      const cyc = trace.perInstr[ins.addr] || 0;
      const isCur = cur && !cur.intr && cur.instr === ins.addr;
      const operand = ins.arg != null ? ' ' + hex16(ins.arg) : '';
      return `<tr class="${isCur ? 'm9-current' : ''}">
        <td class="mono">${hex16(ins.addr)}</td>
        <td class="mono">${bytes}</td>
        <td class="mono">${ins.op}${operand}</td>
        <td>${cyc || '—'}</td>
        <td>${cyc ? ins.note : 'не выполняется: ' + ins.note}</td></tr>`;
    }).join('');

    ui.trace.innerHTML = steps.map((s, i) => {
      const cls = [i === idx ? 'm9-current' : '', s.intr ? 'm9-intr' : ''].join(' ').trim();
      return `<tr class="${cls}">
        <td>${i + 1}</td>
        <td>${PHASE_NAME[s.phase]}</td>
        <td class="mono">${s.addr != null ? hex16(s.addr) : '—'}</td>
        <td class="mono">${s.data != null ? hex8(s.data) : '—'}</td>
        <td class="mono">${s.ctl || '—'}</td>
        <td>${s.label}${s.intr ? ' <span class="m9-intr-tag">прерывание</span>' : ''}</td></tr>`;
    }).join('');

    const wrap = ui.trace.closest('.trace-wrap');
    const row = ui.trace.children[idx];
    if (wrap && row) wrap.scrollTop = Math.max(0, row.offsetTop - 60);

    const total = trace.progCycles + trace.intrCycles;
    const f = freqMHz();
    const baseline = buildTrace(ui.prog.value, 0);
    let html = `<b>${prog.title}.</b> Тактов шины: <b>${total}</b> — основная программа ${trace.progCycles}` +
      (trace.intrCycles ? `, обработка прерывания ${trace.intrCycles}` : '') + `. ` +
      `При частоте ${f} МГц это ${fmtFloat(total / f, 3)} мкс.`;
    if (trace.intrCycles) {
      const rest = trace.intrCycles - trace.intaCycles - trace.pushCycles;
      html += `<br>Состав прерывания: INTA ${trace.intaCycles} такт, сохранение PC ${trace.pushCycles} такта, ` +
        `обработчик и возврат ${rest} тактов.`;
    }
    if (ui.intToggle.checked) {
      html += trace.interruptDone
        ? `<br>Прерывание пришло после команды ${ui.intAfter.value} (${prog.code[ui.intAfter.value - 1].op}).`
        : `<br>Прерывание не произошло: программа уже остановлена.`;
    }
    const same = trace.result === baseline.result && trace.finalA === baseline.finalA;
    html += `<br>Результат в ячейке 0x0102: <b>${trace.result}</b>.`;
    if (ui.intToggle.checked && trace.interruptDone) {
      html += same
        ? ' Совпадает с выполнением без прерывания: обработчик не испортил аккумулятор и результат.'
        : ' <span style="color:#c0392b">Не совпадает с выполнением без прерывания.</span>';
    }
    ui.summary.innerHTML = html;

    ui.step.disabled = idx >= steps.length - 1;
    ui.auto.disabled = idx >= steps.length - 1;
  }

  ui.prog.addEventListener('change', () => { fillIntAfter(); rebuild(); });
  ui.intToggle.addEventListener('change', () => { ui.intAfter.disabled = !ui.intToggle.checked; rebuild(); });
  ui.intAfter.addEventListener('change', rebuild);
  ui.step.addEventListener('click', () => { stopAuto(); stepOnce(); });
  ui.reset.addEventListener('click', () => { stopAuto(); idx = -1; render(); });
  ui.auto.addEventListener('click', () => {
    if (timer) { stopAuto(); return; }
    ui.auto.textContent = '⏸ Пауза';
    timer = setInterval(stepOnce, 500);
  });

  fillIntAfter();
  ui.intAfter.disabled = !ui.intToggle.checked;
  rebuild();
})();
