(function () {
  'use strict';

  const STYLE_ID = 'clube-extrato-ui-v3';
  const YEAR_FILTER_ID = 'clubeExtratoYear';
  const PROGRAM_FILTER_PREFIX = 'clubeExtratoProgram-';
  const YEAR_GROUP_PREFIX = 'clubeExtratoYear-';
  const OPEN_YEARS_KEY = 'malapronta_clube_extrato_open_years_v1';
  let originalRender = null;
  let installed = false;
  let rendering = false;
  const yearProgramFilters = new Map();
  let expandedYears = new Set();

  function appState() {
    try {
      return {
        movements: Array.isArray(window.cMovimentos) ? window.cMovimentos : [],
        plans: Array.isArray(window.cPlanos) ? window.cPlanos : [],
        programs: Array.isArray(window.db?.programas) ? window.db.programas : []
      };
    } catch (_) {
      return { movements: [], plans: [], programs: [] };
    }
  }

  function movementDate(movement) {
    return movement?.data || movement?.date || '';
  }

  function getYear(value) {
    const match = String(value || '').match(/(?:^|\D)((?:19|20)\d{2})(?:\D|$)/);
    if (match) return match[1];
    const parts = String(value || '').match(/^(\d{1,2})\/(\d{1,2})\/((?:19|20)\d{2})$/);
    return parts ? parts[3] : '';
  }

  function planFor(movement, plans) {
    const planId = movement?.planoId || movement?.planId || movement?.clubePlanId || movement?._clube;
    return plans.find(plan => plan.id === planId) || null;
  }

  function programIdFor(movement, plans) {
    const plan = planFor(movement, plans);
    return movement?.programaId || movement?.programId || plan?.programaId || plan?.programId || '';
  }

  function programLabel(id, programs, plans) {
    const program = programs.find(item => item.id === id);
    if (program) return program.nome || program.name || id;
    const plan = plans.find(item => item.programaId === id || item.programId === id);
    return plan?.programa || plan?.programaNome || id;
  }

  function readExpandedYears() {
    try {
      const saved = JSON.parse(localStorage.getItem(OPEN_YEARS_KEY) || '[]');
      return new Set(Array.isArray(saved) ? saved : []);
    } catch (_) {
      return new Set();
    }
  }

  function saveExpandedYears() {
    try { localStorage.setItem(OPEN_YEARS_KEY, JSON.stringify([...expandedYears])); } catch (_) {}
  }

  function escapeHtml(value) {
    return String(value ?? '').replace(/[&<>"']/g, char => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    })[char]);
  }

  function addStyles() {
    if (document.getElementById(STYLE_ID)) return;
    const style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = `
      /* Legibility and spacing pass: retain the existing visual system. */
      html{font-size:15px}
      .sec-title,.detail-sub,.stat-sub,.fhint,.td-date,.td-obs,.badge,.preview-table td,.preview-table th{font-size:max(.78rem, 1em)}
      .clube-extrato-controls{display:flex;align-items:center;gap:.55rem;flex-wrap:wrap;margin:.35rem 0 .85rem}
      .clube-extrato-controls label{font-size:.82rem;font-weight:600;color:var(--text-dim)}
      .clube-extrato-controls select{width:auto;min-width:145px;max-width:230px;font-size:.88rem}
      .clube-extrato-years{display:flex;flex-direction:column;gap:.65rem}
      .clube-extrato-year{overflow:hidden;border:1px solid var(--border);border-radius:var(--radius-sm);background:var(--surface2)}
      .clube-extrato-year-head{display:flex;align-items:center;justify-content:space-between;gap:.75rem;padding:.7rem .85rem;background:var(--surface3)}
      .clube-extrato-year-toggle{display:flex;align-items:center;gap:.55rem;min-width:0;background:none;border:0;color:var(--text);font:700 .95rem 'Inter',sans-serif;cursor:pointer;text-align:left}
      .clube-extrato-year-toggle:focus-visible,.clube-extrato-year-program:focus-visible{outline:2px solid var(--gold);outline-offset:2px}
      .clube-extrato-chevron{display:inline-block;transition:transform .16s ease;color:var(--gold)}
      .clube-extrato-year-toggle[aria-expanded="true"] .clube-extrato-chevron{transform:rotate(90deg)}
      .clube-extrato-year-meta{font-size:.78rem;color:var(--text-muted);font-weight:500}
      .clube-extrato-year-program{width:auto;max-width:min(220px,48vw);min-width:130px;padding:.35rem .55rem;font-size:.82rem}
      .clube-extrato-year-body{padding:.35rem .55rem .65rem;overflow-x:auto}
      .clube-extrato-year-body[hidden]{display:none!important}
      .clube-extrato-year-body .cg-header td{background:var(--surface3)}
      .clube-extrato-empty{padding:1.2rem;text-align:center;color:var(--text-muted);font-size:.85rem}
      @media(max-width:600px){
        .clube-extrato-controls{display:grid;grid-template-columns:auto minmax(0,1fr);align-items:center}
        .clube-extrato-controls select{width:100%;max-width:none;min-width:0}
        .clube-extrato-year-head{align-items:flex-start;flex-direction:column}
        .clube-extrato-year-program{max-width:none;width:100%}
        .clube-extrato-year-body{padding:.25rem}
      }
      /* Clearer app-wide hierarchy, including secondary labels and tabular data. */
      .routes-tbl,.preview-table,.tbl-wrap table,.routes-page table{font-size:.88rem}
      .routes-tbl thead th,.preview-table th,.tbl-wrap thead th{font-size:.76rem}
      .detail-sub,.stat-sub,.fhint,.promos-subtitle,.promos-card-desc,.promos-card-source,.promos-card-date,.gsr-sub{font-size:.78rem}
      .sidebar-item,.sidebar-subitem,.sidebar-prog-item,.menu-item{font-size:.84rem}
      .dash-section-title,.sum-label,.sum-group-label{font-size:.68rem}
      #alertsList .alert-dismiss-btn{flex:0 0 auto;width:28px;height:28px;border:1px solid var(--border);border-radius:6px;background:var(--surface2);color:var(--text-muted);font-size:1.1rem;line-height:1;cursor:pointer}
      #alertsList .alert-dismiss-btn:hover{color:var(--text);border-color:var(--gold);background:var(--surface3)}
      #alertsList [data-alert-signature]{position:relative;padding-right:2.5rem!important}
    `;
    document.head.appendChild(style);
  }

  function appendControls(panel, years) {
    let controls = panel.querySelector('.clube-extrato-controls');
    if (!controls) {
      controls = document.createElement('div');
      controls.className = 'clube-extrato-controls';
      controls.innerHTML = `<label for="${YEAR_FILTER_ID}">Navegar para o ano</label><select class="fi" id="${YEAR_FILTER_ID}" aria-label="Navegar para o ano"></select>`;
      const title = panel.querySelector('.modal-title');
      title ? title.insertAdjacentElement('afterend', controls) : panel.prepend(controls);
      controls.addEventListener('change', event => {
        if (event.target.id !== YEAR_FILTER_ID) return;
        const year = event.target.value;
        if (year) {
          expandedYears.add(year);
          saveExpandedYears();
          panel.querySelector(`#${YEAR_GROUP_PREFIX}${CSS.escape(year)}`)?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
        }
        renderAccordion();
      });
    }
    const select = controls.querySelector('select');
    const selected = select.value;
    select.replaceChildren(new Option('Todos os anos', ''));
    years.forEach(year => select.add(new Option(year, year)));
    select.value = years.includes(selected) ? selected : '';
  }

  function captureOriginalRows() {
    if (!originalRender) return [];
    const originalMovements = window.cMovimentos;
    try {
      window.cMovimentos = appState().movements;
      originalRender();
      const tbody = document.getElementById('cExtratoBody');
      return tbody ? [...tbody.rows].filter(row => !row.classList.contains('extrato-year-header')).map(row => row.cloneNode(true)) : [];
    } finally {
      window.cMovimentos = originalMovements;
    }
  }

  function rowYear(row) {
    const dateCell = row.cells[1] || row.cells[0];
    return getYear(dateCell?.textContent || '');
  }

  function rowProgram(row, programs, plans) {
    // Club statement rows include plan name in the third column. Prefer the
    // program name from source movements when matching, with row text fallback.
    return (row.cells[2]?.textContent || '').trim();
  }

  function getYearData(rows) {
    const grouped = new Map();
    rows.forEach(row => {
      const year = rowYear(row);
      if (!year) return;
      if (!grouped.has(year)) grouped.set(year, []);
      grouped.get(year).push(row);
    });
    return [...grouped.entries()].sort(([a], [b]) => Number(b) - Number(a));
  }

  function fillYearProgramSelect(select, yearRows, year, programs, plans) {
    const previous = yearProgramFilters.get(year) || '';
    const labels = new Map();
    const yearMovements = appState().movements.filter(movement => getYear(movementDate(movement)) === year);
    yearMovements.forEach(movement => {
      const id = programIdFor(movement, plans);
      if (id) labels.set(id, programLabel(id, programs, plans));
    });
    // Legacy rows may not carry a normalized program ID; use their visible plan cell.
    yearRows.forEach(row => {
      const label = rowProgram(row, programs, plans);
      if (label && ![...labels.values()].includes(label)) labels.set(`label:${label}`, label);
    });
    select.replaceChildren(new Option('Todos os programas', ''));
    [...labels.entries()].sort((a, b) => a[1].localeCompare(b[1], 'pt-BR'))
      .forEach(([id, label]) => select.add(new Option(label, id)));
    select.value = labels.has(previous) ? previous : '';
    yearProgramFilters.set(year, select.value);
  }

  function filteredRowsForYear(year, rows, selectedProgram, programs, plans) {
    if (!selectedProgram) return rows;
    const yearMovements = appState().movements.filter(movement => getYear(movementDate(movement)) === year);
    const matchingIds = new Set(yearMovements.filter(movement => {
      const id = programIdFor(movement, plans);
      return id && (id === selectedProgram || programLabel(id, programs, plans) === selectedProgram);
    }).map(movement => movement.id));
    const matchingNames = new Set(yearMovements.filter(movement => matchingIds.has(movement.id))
      .map(movement => programLabel(programIdFor(movement, plans), programs, plans)));
    const selectedLabel = selectedProgram.startsWith('label:') ? selectedProgram.slice(6) : programLabel(selectedProgram, programs, plans);
    if (matchingNames.size) matchingNames.add(selectedLabel);
    else matchingNames.add(selectedLabel);
    return rows.filter(row => {
      const label = rowProgram(row, programs, plans);
      return label && [...matchingNames].some(name => label.includes(name) || name.includes(label));
    });
  }

  function renderAccordion() {
    if (rendering || !originalRender) return;
    rendering = true;
    try {
      const panel = document.getElementById('cTabExtrato');
      const body = document.getElementById('cExtratoBody');
      if (!panel || !body) return;
      const { programs, plans } = appState();
      const groups = getYearData(captureOriginalRows());
      const years = groups.map(([year]) => year);
      appendControls(panel, years);
      if (!years.length) {
        body.innerHTML = '<tr><td colspan="6" class="em-table">Nenhum movimento.</td></tr>';
        return;
      }
      const selectedYear = document.getElementById(YEAR_FILTER_ID)?.value || '';
      const visibleGroups = selectedYear ? groups.filter(([year]) => year === selectedYear) : groups;
      const html = visibleGroups.map(([year, rows]) => {
        const groupId = YEAR_GROUP_PREFIX + year;
        const isOpen = expandedYears.has(year);
        const countLabel = `${rows.length} movimenta${rows.length === 1 ? 'ção' : 'ções'}`;
        const programOptions = new Map();
        appState().movements.filter(movement => getYear(movementDate(movement)) === year).forEach(movement => {
          const id = programIdFor(movement, plans);
          if (id) programOptions.set(id, programLabel(id, programs, plans));
        });
        rows.forEach(row => {
          const label = rowProgram(row, programs, plans);
          if (label && ![...programOptions.values()].includes(label)) programOptions.set(`label:${label}`, label);
        });
        const selectedProgram = yearProgramFilters.get(year) || '';
        const options = [...programOptions].sort((a, b) => a[1].localeCompare(b[1], 'pt-BR'))
          .map(([id, label]) => `<option value="${escapeHtml(id)}"${id === selectedProgram ? ' selected' : ''}>${escapeHtml(label)}</option>`).join('');
        const visibleRows = filteredRowsForYear(year, rows, selectedProgram, programs, plans);
        const tableRows = visibleRows.length ? visibleRows.map(row => row.outerHTML).join('')
          : '<tr><td colspan="6" class="em-table">Nenhuma movimentação para este programa neste ano.</td></tr>';
        return `<tr class="${HEADER_CLASS}"><td colspan="6"><section class="clube-extrato-year" id="${groupId}">
          <div class="clube-extrato-year-head">
            <button type="button" class="clube-extrato-year-toggle" data-year="${year}" aria-expanded="${isOpen}" aria-controls="${groupId}-body">
              <span class="clube-extrato-chevron" aria-hidden="true">›</span><span>${year}</span><span class="clube-extrato-year-meta">${countLabel}</span>
            </button>
            <select class="fi clube-extrato-year-program" data-year-program="${year}" aria-label="Filtrar programas em ${year}" ${isOpen ? '' : 'disabled'}>
              <option value="">Todos os programas</option>${options}
            </select>
          </div>
          <div class="clube-extrato-year-body" id="${groupId}-body" ${isOpen ? '' : 'hidden'}>
            <table class="preview-table"><thead><tr><th>Parcela</th><th>Data</th><th>Plano</th><th>Milhas</th><th>Status</th><th></th></tr></thead><tbody>${tableRows}</tbody></table>
          </div>
        </section></td></tr>`;
      }).join('');
      body.innerHTML = html;
      body.querySelectorAll('[data-year]').forEach(button => button.addEventListener('click', () => {
        const year = button.dataset.year;
        if (expandedYears.has(year)) expandedYears.delete(year);
        else expandedYears.add(year);
        saveExpandedYears();
        renderAccordion();
      }));
      body.querySelectorAll('[data-year-program]').forEach(select => select.addEventListener('change', () => {
        yearProgramFilters.set(select.dataset.yearProgram, select.value);
        renderAccordion();
      }));
    } finally {
      rendering = false;
    }
  }

  function install() {
    if (installed || typeof window.cRenderExtrato !== 'function') return false;
    originalRender = window.cRenderExtrato;
    expandedYears = readExpandedYears();
    window.cRenderExtrato = function (...args) {
      originalRender.apply(this, args);
      renderAccordion();
    };
    installed = true;
    insertStyleAndControls();
    renderAccordion();
    return true;
  }

  function insertStyleAndControls() {
    addStyles();
    const panel = document.getElementById('cTabExtrato');
    if (panel) appendControls(panel, getYearData(captureOriginalRows()).map(([year]) => year));
  }

  function start() {
    if (install()) return;
    let attempts = 0;
    const timer = setInterval(() => {
      attempts += 1;
      if (install() || attempts >= 80) clearInterval(timer);
    }, 250);
    const observer = new MutationObserver(() => {
      if (install()) observer.disconnect();
    });
    observer.observe(document.documentElement, { childList: true, subtree: true });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once: true });
  else start();
})();
