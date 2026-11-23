const { test, expect } = require('@playwright/test');

const TEST_EMAIL = 'edhens85@gmail.com';
const TEST_PASSWORD = 'E2E-LOCAL-ONLY-2026!';

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('mp_sidebar', '1'));
  await page.goto('/index.html?e2e=1');

  // Fail closed: do not authenticate unless the page routed Firestore to localhost.
  const restBase = await page.evaluate(() => window._fbFirestoreRestBase || '');
  expect(restBase).toMatch(/^http:\/\/127\.0\.0\.1:8080\//);

  await expect.poll(() => page.evaluate(() => Boolean(window._fbReady))).toBe(true);
  await page.evaluate(async ({ email, password }) => {
    const auth = window._fbAuth;
    try {
      await auth.signInWithEmailAndPassword(email, password);
    } catch (signInError) {
      try {
        await auth.createUserWithEmailAndPassword(email, password);
      } catch (createError) {
        if (createError.code !== 'auth/email-already-in-use') throw createError;
        await auth.signInWithEmailAndPassword(email, password);
      }
    }
  }, { email: TEST_EMAIL, password: TEST_PASSWORD });

  await expect(page.locator('#authScreen')).toHaveClass(/hidden/, { timeout: 30000 });
  await expect(page.locator('#userInfo')).toBeVisible({ timeout: 30000 });
});

test('entra pela conta de teste isolada no Firebase Emulator', async ({ page }) => {
  await expect(page.locator('#pageMilhas')).toHaveClass(/active/);
  await expect(page.locator('#authScreen')).toBeHidden();
  expect(await page.evaluate(() => window._fbFirestoreRestBase)).toContain('127.0.0.1:8080');
});

test('tema claro mantém texto e ícones visíveis', async ({ page }) => {
  await page.locator('#menuWrap .btn-menu').click();
  await page.locator('#appMenuDropdown .menu-item').filter({ hasText: 'Alternar tema' }).click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');

  const ratios = await page.evaluate(() => {
    const css = getComputedStyle(document.documentElement);
    const parse = (value) => {
      const m = value.match(/rgba?\((\d+)\D+(\d+)\D+(\d+)/);
      if (m) return [Number(m[1]), Number(m[2]), Number(m[3])];
      const h = value.trim().match(/^#([\da-f]{3}|[\da-f]{6})$/i);
      if (!h) return null;
      const hex = h[1].length === 3 ? [...h[1]].map(x => x + x).join('') : h[1];
      return [0, 2, 4].map(i => parseInt(hex.slice(i, i + 2), 16));
    };
    const luminance = (c) => c.map(v => v / 255).map(v => v <= .04045 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4)
      .reduce((sum, v, i) => sum + v * [.2126, .7152, .0722][i], 0);
    const contrast = (a, b) => {
      const x = luminance(a), y = luminance(b);
      return (Math.max(x, y) + .05) / (Math.min(x, y) + .05);
    };
    const bg = parse(css.getPropertyValue('--bg').trim());
    const surface = parse(css.getPropertyValue('--surface').trim());
    return {
      primary: contrast(parse(css.getPropertyValue('--text').trim()), bg),
      secondary: contrast(parse(css.getPropertyValue('--text-dim').trim()), surface),
      muted: contrast(parse(css.getPropertyValue('--text-muted').trim()), surface)
    };
  });
  expect(ratios.primary).toBeGreaterThanOrEqual(7);
  expect(ratios.secondary).toBeGreaterThanOrEqual(4.5);
  expect(ratios.muted).toBeGreaterThanOrEqual(4.5);

  for (const selector of ['#sbNavCarteira svg', '#sbNavRelatorios svg', '#sbNavClube svg']) {
    const icon = page.locator(selector).first();
    await expect(icon).toBeVisible();
    const state = await icon.evaluate(el => ({
      width: el.getBoundingClientRect().width,
      height: el.getBoundingClientRect().height,
      opacity: Number(getComputedStyle(el).opacity),
      stroke: getComputedStyle(el).stroke
    }));
    expect(state.width).toBeGreaterThan(0);
    expect(state.height).toBeGreaterThan(0);
    expect(state.opacity).toBeGreaterThan(0);
    expect(state.stroke).not.toBe('none');
  }
});

test('submenu de Relatórios abre as três páginas', async ({ page }) => {
  await page.locator('#sidebar').hover();
  const submenu = page.locator('#sbReportsSubmenu');
  const toggle = page.locator('#sbNavRelatorios');
  if (await submenu.evaluate(el => el.classList.contains('collapsed'))) await toggle.click();
  await expect(toggle).toHaveAttribute('aria-expanded', 'true');

  const reportPages = [
    ['rotas', '#pageRotas'],
    ['emissoes', '#pageEmissoes'],
    ['relatorios', '#pageRelatorios']
  ];
  for (const [key, pageSelector] of reportPages) {
    await submenu.locator(`[data-report-page="${key}"]`).click();
    await expect(page.locator(pageSelector)).toHaveClass(/active/);
    await expect(submenu.locator(`[data-report-page="${key}"]`)).toBeVisible();
  }

  await toggle.click();
  await expect(toggle).toHaveAttribute('aria-expanded', 'false');
  await expect(submenu).toHaveClass(/collapsed/);
});

test('ticker conserva o texto e permite rolagem quando estreito', async ({ page }) => {
  await page.evaluate(() => {
    const inner = document.getElementById('tickerInner');
    inner.replaceChildren();
    for (let i = 1; i <= 12; i++) {
      const item = document.createElement('div');
      item.className = 'ticker-item';
      const name = document.createElement('span');
      name.className = 'ticker-name';
      name.textContent = `Programa de milhas teste ${i}`;
      const value = document.createElement('span');
      value.className = 'ticker-val';
      value.textContent = 'R$ 1.234.567,89';
      item.append(name, value);
      inner.append(item);
    }
  });
  await page.setViewportSize({ width: 390, height: 844 });
  const ticker = page.locator('#ticker');
  await expect(ticker).toBeVisible();
  const measurements = await ticker.evaluate(el => ({
    clientWidth: el.clientWidth,
    scrollWidth: el.scrollWidth,
    overflowX: getComputedStyle(el).overflowX
  }));
  expect(measurements.scrollWidth).toBeGreaterThan(measurements.clientWidth);
  expect(['auto', 'scroll']).toContain(measurements.overflowX);
  await expect(page.locator('#tickerInner .ticker-item')).toHaveCount(12);
});
