(function () {
  'use strict';

  const YEAR_FILTER_ID = 'clubeExtratoYear';
  const PROGRAM_FILTER_ID = 'clubeExtratoProgram';
  const HEADER_CLASS = 'extrato-year-header';
  let originalRender = null;
  let installed = false;

  function state() {
    try {
      return {
        movements: typeof cMovimentos !== 'undefined' && Array.isArray(cMovimentos) ? cMovimentos : [],
        plans: typeof cPlanos !== 'undefined' && Array.isArray(cPlanos) ? cPlanos : [],
        programs: typeof db !== 'undefined' && Array.isArray(db.programas) ? db.programas : []
      };
    } catch (_) {
      return { movements: [], plans: [], programs: [] };
    }
  }

  function yearOf(date) {
    if (!date) return null;
    const match = String(date).match(/(?:^|\D)(20\d{2})(?:\D|$)/);
    return match ? match[1] : null;
  }

  function planFor(movement, plans) {
    return plans.find(plan => plan.id === movement.planoId) || null;
  }

  function programIdFor(movement, plans) {
    const plan = planFor(movement, plans);
    return movement.programaId || movement.programId || plan?.programaId || plan?.programId || '';
  }

  function programName(id, programs, plans) {
    if (!id) return '';
    const program = programs.find(item => item.id === id);
    if (program?.nome || program?.name) return program.nome || program.name;
    const plan = plans.find(item => item.programaId === id || item.programId === id);
    return plan?.programa || plan?.programaNome || id;
  }

  function movementsWithYear(movements) {
    return movements.map(movement => ({ movement, year: yearOf(movement.data || movement.date) }))
      .filter(item => item.year);
  }

  function insertControls() {
    if (document.getElementById(YEAR_FILTER_ID) || !document.getElementById('cTabExtrato')) return;
    const panel = document.getElementById('cTabExtrato');
    const row = document.createElement('div');
    row.className = 'extrato-year-controls';
    row.innerHTML = `
      <label class="extrato-year-label" for="${YEAR_FILTER_ID}">Ano</label>
      <select class="fi extrato-year-select" id="${YEAR_FILTER_ID}" aria-label="Filtrar extrato por ano"></select>
      <label class="extrato-year-label" for="${PROGRAM_FILTER_ID}">Programa</label>
      <select class="fi extrato-year-select" id="${PROGRAM_FILTER_ID}" aria-label="Filtrar programas com movimentação no ano"></select>`;
    const existing = document.getElementById('cFiltroPlanoSelect');
    const anchor = existing?.closest('.frow, .extrato-controls, .c-extrato-controls') || existing?.parentElement;
    if (anchor?.parentElement) anchor.parentElement.insertBefore(row, anchor.nextSibling);
    else panel.prepend(row);
    row.addEventListener('change', event => {
      if (event.target.id === YEAR_FILTER_ID) refreshProgramOptions();
      renderFilteredExtrato();
    });
    addStyles();
  }

  function addStyles() {
    if (document.getElementById('extrato-year-styles')) return;
    const style = document.createElement('style');
    style.id = 'extrato-year-styles';
    style.textContent = `
      .extrato-year-controls{display:flex;align-items:center;gap:.45rem;flex-wrap:wrap;margin:.65rem 0}
      .extrato-year-label{font-size:.72rem;font-weight:600;color:var(--text-dim)}
      .extrato-year-select{width:auto;min-width:125px;max-width:220px;padding:.4rem .65rem}
      tr.${HEADER_CLASS} td{background:var(--surface3);color:var(--gold);font-size:.75rem;font-weight:800;letter-spacing:.04em;padding:.5rem .75rem;border-top:1px solid var(--border)}
      @media(max-width:600px){.extrato-year-controls{align-items:stretch}.extrato-year-select{flex:1;min-width:110px}}
    `;
    document.head.appendChild(style);
  }

  function fillSelect(select, options, allLabel, selectedValue) {
    if (!select) return;
    select.replaceChildren();
    const all = document.createElement('option');
    all.value = '';
    all.textContent = allLabel;
    select.appendChild(all);
    options.forEach(option => {
      const element = document.createElement('option');
      element.value = option.value;
      element.textContent = option.label;
      select.appendChild(element);
    });
    select.value = options.some(option => option.value === selectedValue) ? selectedValue : '';
  }

  function refreshFilters() {
    const { movements, plans, programs } = state();
    const yearSelect = document.getElementById(YEAR_FILTER_ID);
    const programSelect = document.getElementById(PROGRAM_FILTER_ID);
    if (!yearSelect || !programSelect) return;
    const selectedYear = yearSelect.value;
    const years = [...new Set(movementsWithYear(movements).map(item => item.year))]
      .sort((a, b) => Number(b) - Number(a));
    fillSelect(yearSelect, years.map(year => ({ value: year, label: year })), 'Todos os anos', selectedYear);
    refreshProgramOptions();
  }

  function refreshProgramOptions() {
    const { movements, plans, programs } = state();
    const year = document.getElementById(YEAR_FILTER_ID)?.value || '';
    const select = document.getElementById(PROGRAM_FILTER_ID);
    if (!select) return;
    const current = select.value;
    const ids = new Set();
    movementsWithYear(movements).forEach(({ movement, year: movementYear }) => {
      if ((!year || movementYear === year) && programIdFor(movement, plans)) ids.add(programIdFor(movement, plans));
    });
    const options = [...ids].map(id => ({ value: id, label: programName(id, programs, plans) }))
      .sort((a, b) => a.label.localeCompare(b.label, 'pt-BR'));
    fillSelect(select, options, 'Todos os programas', current);
  }

  function addYearHeaders() {
    const body = document.getElementById('cExtratoBody');
    if (!body) return;
    body.querySelectorAll(`tr.${HEADER_CLASS}`).forEach(row => row.remove());
    let lastYear = null;
    [...body.rows].forEach(row => {
      if (row.classList.contains('cg-header') || row.classList.contains('cg-row')) return;
      const dateText = row.cells[0]?.textContent || '';
      const year = yearOf(dateText);
      if (!year || year === lastYear) return;
      lastYear = year;
      const header = document.createElement('tr');
      header.className = HEADER_CLASS;
      const cell = document.createElement('td');
      cell.colSpan = Math.max(1, row.cells.length);
      cell.textContent = year;
      header.appendChild(cell);
      row.before(header);
    });
  }

  function renderFilteredExtrato() {
    if (!originalRender) return;
    const { movements, plans } = state();
    const year = document.getElementById(YEAR_FILTER_ID)?.value || '';
    const programId = document.getElementById(PROGRAM_FILTER_ID)?.value || '';
    if (!year && !programId) {
      originalRender();
      addYearHeaders();
      return;
    }
    try {
      cMovimentos = movements.filter(movement => {
        const movementYear = yearOf(movement.data || movement.date);
        return (!year || movementYear === year) && (!programId || programIdFor(movement, plans) === programId);
      });
      originalRender();
      addYearHeaders();
    } finally {
      cMovimentos = movements;
    }
  }

  function install() {
    if (installed || typeof window.cRenderExtrato !== 'function') return false;
    installed = true;
    originalRender = window.cRenderExtrato;
    window.cRenderExtrato = function (...args) {
      refreshFilters();
      renderFilteredExtrato();
    };
    insertControls();
    refreshFilters();
    renderFilteredExtrato();
    return true;
  }

  function start() {
    if (install()) return;
    let attempts = 0;
    const timer = setInterval(() => {
      attempts += 1;
      if (install() || attempts >= 40) clearInterval(timer);
    }, 250);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once: true });
  else start();
})();
