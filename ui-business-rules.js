(function () {
  'use strict';

  const FONT_STYLE_ID = 'ui-business-rules-style';
  const DISMISSED_ALERTS_KEY = 'malapronta_dismissed_expiry_alerts_v1';
  const ALERT_LIST_ID = 'alertsList';

  function addReadableTypography() {
    if (document.getElementById(FONT_STYLE_ID)) return;
    const style = document.createElement('style');
    style.id = FONT_STYLE_ID;
    style.textContent = `
      html{font-size:15px}
      .td-date,.td-obs,.stat-sub,.fhint,.detail-sub,.promos-subtitle,.promos-card-desc,.promos-card-source,.promos-card-date,.gsr-sub{font-size:max(.78rem,1em)}
      .tbl-wrap table,.routes-tbl,.preview-table{font-size:.88rem}
      .tbl-wrap thead th,.routes-tbl thead th,.preview-table th{font-size:.76rem}
      .sidebar-item,.sidebar-subitem,.sidebar-prog-item,.menu-item{font-size:.84rem}
      .alert-dismiss-btn{display:inline-flex;align-items:center;justify-content:center;flex:0 0 30px;width:30px;height:30px;margin-left:auto;border:1px solid var(--border);border-radius:7px;background:var(--surface2);color:var(--text-muted);font-size:1.15rem;line-height:1;cursor:pointer}
      .alert-dismiss-btn:hover{background:var(--surface3);border-color:var(--gold);color:var(--text)}
      .expiry-alert-item{display:flex!important;align-items:center;gap:.7rem}
      .expiry-alert-copy{flex:1;min-width:0}
    `;
    document.head.appendChild(style);
  }

  function signatureFor(element) {
    const text = (element.innerText || element.textContent || '').replace(/\s+/g, ' ').trim();
    return text ? `alert:${text}` : '';
  }

  function readDismissed() {
    try {
      const parsed = JSON.parse(localStorage.getItem(DISMISSED_ALERTS_KEY) || '[]');
      return new Set(Array.isArray(parsed) ? parsed : []);
    } catch (_) { return new Set(); }
  }

  function saveDismissed(set) {
    try { localStorage.setItem(DISMISSED_ALERTS_KEY, JSON.stringify([...set])); } catch (_) {}
  }

  function hideDismissedAndAddButtons() {
    const list = document.getElementById(ALERT_LIST_ID);
    if (!list) return;
    const dismissed = readDismissed();
    [...list.children].forEach(item => {
      if (!(item instanceof HTMLElement)) return;
      if (item.dataset.dismissedByUser === 'true') return;
      const signature = signatureFor(item);
      if (!signature) return;
      if (dismissed.has(signature)) {
        item.remove();
        return;
      }
      item.classList.add('expiry-alert-item');
      item.dataset.alertSignature = signature;
      let copy = item.querySelector('.expiry-alert-copy');
      if (!copy) {
        copy = document.createElement('div');
        copy.className = 'expiry-alert-copy';
        while (item.firstChild) copy.appendChild(item.firstChild);
        item.appendChild(copy);
      }
      if (item.querySelector('.alert-dismiss-btn')) return;
      const dismiss = document.createElement('button');
      dismiss.type = 'button';
      dismiss.className = 'alert-dismiss-btn';
      dismiss.setAttribute('aria-label', 'Dispensar alerta de vencimento');
      dismiss.title = 'Dispensar alerta';
      dismiss.textContent = '×';
      dismiss.addEventListener('click', event => {
        event.preventDefault();
        event.stopPropagation();
        const next = readDismissed();
        next.add(signature);
        saveDismissed(next);
        item.dataset.dismissedByUser = 'true';
        item.remove();
        if (!list.children.length) {
          list.innerHTML = '<div style="padding:1.5rem 1rem;text-align:center;color:var(--text-muted);font-size:.85rem">Nenhum alerta de vencimento.</div>';
        }
      });
      item.appendChild(dismiss);
    });
  }

  function installAlertObserver() {
    const list = document.getElementById(ALERT_LIST_ID);
    if (!list || list.dataset.dismissObserverInstalled) return;
    list.dataset.dismissObserverInstalled = 'true';
    const observer = new MutationObserver(() => {
      // Ignore our own wrapper/button edits to avoid a mutation loop.
      if (observer._scheduled) return;
      observer._scheduled = true;
      queueMicrotask(() => {
        observer._scheduled = false;
        hideDismissedAndAddButtons();
      });
    });
    observer.observe(list, { childList: true, subtree: false });
    hideDismissedAndAddButtons();
  }

  function wrapClubAlertSource() {
    const source = window._getClubDueAlerts;
    if (typeof source !== 'function' || source._dismissAware) return;
    const wrapped = function (...args) {
      const alerts = source.apply(this, args) || [];
      const plans = Array.isArray(window.cPlanos) ? window.cPlanos : [];
      const activePlanIds = new Set(plans.filter(plan => plan.status === 'ativo' || plan.status === 'active').map(plan => plan.id));
      return alerts.filter(alert => {
        if (!alert || !(alert.kind === 'clube' || alert.type === 'clube' || alert.planoId || alert.planId)) return true;
        const planId = alert.planoId || alert.planId;
        return !planId || activePlanIds.has(planId);
      });
    };
    wrapped._dismissAware = true;
    window._getClubDueAlerts = wrapped;
  }

  function start() {
    addReadableTypography();
    installAlertObserver();
    wrapClubAlertSource();
    let attempts = 0;
    const timer = setInterval(() => {
      attempts += 1;
      installAlertObserver();
      wrapClubAlertSource();
      if (document.getElementById(ALERT_LIST_ID) && (typeof window._getClubDueAlerts !== 'function' || window._getClubDueAlerts._dismissAware) || attempts >= 80) clearInterval(timer);
    }, 250);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once: true });
  else start();
})();
