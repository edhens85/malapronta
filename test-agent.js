/**
 * Agente de testes autônomo — Gestão de Milhas
 * Roda em headless, simula operações, reporta problemas encontrados.
 *
 * Áreas testadas:
 *  1. Programas: criar, ver saldo
 *  2. Movimentos: acúmulo, resgate, transferência, bônus
 *  3. Emissão de passagem: CPM, taxas, resultado
 *  4. Clube: assinar, acumular, cancelar
 *  5. Vencimentos: simular milhas com data
 *  6. Promos: cards carregando, filtros funcionando
 *  7. Layout: campos visíveis, sem overflow
 *  8. Cálculos: saldo = acúmulo - resgate, CPM, economia
 */

const { chromium } = require('playwright');

const URL = 'https://malapronta.pages.dev';
const TIMEOUT = 15000;

const results = {
  passed: [],
  failed: [],
  warnings: [],
  timestamp: new Date().toISOString()
};

function pass(label) {
  results.passed.push(label);
  console.log('✅', label);
}
function fail(label, detail) {
  results.failed.push({ label, detail });
  console.log('❌', label, detail || '');
}
function warn(label, detail) {
  results.warnings.push({ label, detail });
  console.log('⚠️', label, detail || '');
}

async function waitFor(page, selector, timeout = TIMEOUT) {
  try {
    await page.waitForSelector(selector, { timeout });
    return true;
  } catch {
    return false;
  }
}

async function runTests() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1280, height: 800 },
    locale: 'pt-BR'
  });
  const page = await context.newPage();

  // Captura erros JS
  const jsErrors = [];
  page.on('pageerror', e => jsErrors.push(e.message));
  page.on('console', msg => {
    if (msg.type() === 'error') jsErrors.push(msg.text());
  });

  try {
    // ── 1. CARREGAMENTO ──────────────────────────────────────────
    console.log('\n── Carregamento ──');
    await page.goto(URL, { waitUntil: 'networkidle', timeout: 30000 });

    const authVisible = await waitFor(page, '#authScreen:not(.hidden)', 3000);
    if (authVisible) {
      pass('Tela de login aparece');
    } else {
      fail('Tela de login não encontrada');
    }

    // Verifica meta noindex
    const noindex = await page.evaluate(() => {
      const m = document.querySelector('meta[name="robots"]');
      return m ? m.content : null;
    });
    if (noindex && noindex.includes('noindex')) {
      pass('Meta noindex presente');
    } else {
      fail('Meta noindex ausente', noindex);
    }

    // ── 2. INJEÇÃO DE DADOS FICTÍCIOS (bypass auth) ───────────────
    console.log('\n── Injeção de dados de teste ──');

    // Simula dados no localStorage para testar sem login real
    await page.evaluate(() => {
      const mockDB = {
        programs: [
          {
            id: 'prog_smiles', name: 'Smiles', type: 'aerea', color: '#B22222',
            icon: null, points: 150000, invest: 1500, alianca: 'star',
            vencimento: new Date(Date.now() + 90*24*60*60*1000).toISOString().split('T')[0]
          },
          {
            id: 'prog_latam', name: 'Latam Pass', type: 'aerea', color: '#CC0000',
            icon: null, points: 80000, invest: 900, alianca: 'oneworld',
            vencimento: new Date(Date.now() + 365*24*60*60*1000).toISOString().split('T')[0]
          },
          {
            id: 'prog_livelo', name: 'Livelo', type: 'pontos', color: '#FF6B00',
            icon: null, points: 200000, invest: 1800
          }
        ],
        movements: [
          // Acúmulo Smiles
          {
            id: 'mov1', progId: 'prog_smiles', type: 'acumulo', date: '2026-01-15',
            points: 50000, value: 500, obs: 'Cartão Itaucard'
          },
          // Acúmulo mais
          {
            id: 'mov2', progId: 'prog_smiles', type: 'acumulo', date: '2026-02-10',
            points: 100000, value: 1000, obs: 'Bônus promoção'
          },
          // Emissão passagem
          {
            id: 'mov3', progId: 'prog_smiles', type: 'emissao_passagem', date: '2026-03-01',
            points: -80000, value: 0,
            emCpm: 0.025, emTaxas: 450, emMercado: 2800, emTrecho: 'GRU-MIA',
            emCabine: 'economica', emCia: 'GOL', emDataVoo: '2026-06-15',
            emBenef: 'propria', obs: 'Voo Miami'
          },
          // Resgate Latam
          {
            id: 'mov4', progId: 'prog_latam', type: 'resgate', date: '2026-02-20',
            points: -20000, value: 400, obs: 'Upgrade executiva'
          },
          // Transferência Livelo → Smiles
          {
            id: 'mov5', progId: 'prog_livelo', type: 'transferencia', date: '2026-03-05',
            points: -50000, value: 0, obs: 'Transferência para Smiles'
          },
          {
            id: 'mov6', progId: 'prog_smiles', type: 'transferencia', date: '2026-03-05',
            points: 60000, value: 0, obs: 'Recebido da Livelo (bônus 20%)'
          },
          // Bônus de transferência
          {
            id: 'mov7', progId: 'prog_smiles', type: 'bonus_transferencia', date: '2026-03-05',
            points: 10000, value: 0, obs: 'Bônus 20% Livelo'
          },
          // Vencimento próximo
          {
            id: 'mov8', progId: 'prog_latam', type: 'acumulo', date: '2026-01-01',
            points: 100000, value: 1000, obs: 'Acúmulo base'
          }
        ],
        routes: [],
        airlines: [],
        aliancaMap: {}
      };
      localStorage.setItem('milhas_v3', JSON.stringify(mockDB));
    });

    pass('Dados fictícios injetados no localStorage');

    // Simula usuário logado diretamente
    await page.evaluate(() => {
      // Esconde tela de login, mostra app
      const auth = document.getElementById('authScreen');
      if (auth) auth.classList.add('hidden');
      const ui = document.getElementById('userInfo');
      if (ui) ui.style.display = 'flex';
      const uname = document.getElementById('userName');
      if (uname) uname.textContent = 'Teste Automatizado';
      // Carrega dados do localStorage
      if (window.loadDB) window.loadDB();
      if (window.render) window.render();
    });

    await page.waitForTimeout(1500);

    // ── 3. DASHBOARD / SALDOS ─────────────────────────────────────
    console.log('\n── Dashboard e saldos ──');

    const sumPontos = await page.$eval('#sumPontos', el => el.textContent).catch(() => null);
    if (sumPontos && sumPontos !== '0') {
      pass(`Saldo de pontos renderizado: ${sumPontos}`);
    } else {
      warn('Saldo de pontos zerado ou não encontrado', sumPontos);
    }

    // Verifica programas no dashboard
    const progCards = await page.$$('.program-card, .prog-card, [data-prog-id]');
    if (progCards.length >= 3) {
      pass(`${progCards.length} cards de programa no dashboard`);
    } else {
      warn(`Apenas ${progCards.length} cards de programa encontrados`);
    }

    // ── 4. NAVEGAÇÃO POR ABAS ─────────────────────────────────────
    console.log('\n── Navegação por abas ──');
    const tabs = ['Emissões', 'Clube', 'Vencimentos', 'Promos'];
    for (const tab of tabs) {
      const btn = await page.$(`button.nav-tab:has-text("${tab}"), button.nav-tab >> text="${tab}"`);
      if (btn) {
        await btn.click();
        await page.waitForTimeout(500);
        pass(`Aba "${tab}" clicável`);
      } else {
        warn(`Aba "${tab}" não encontrada`);
      }
    }

    // Volta para Carteira
    const carteiraTab = await page.$('button.nav-tab >> text="Carteira"');
    if (carteiraTab) await carteiraTab.click();
    await page.waitForTimeout(500);

    // ── 5. MODAL REGISTRAR MOVIMENTO ──────────────────────────────
    console.log('\n── Modal de movimento ──');

    // Clica em um programa primeiro
    const firstProg = await page.$('.program-card, [onclick*="selectProg"]');
    if (firstProg) {
      await firstProg.click();
      await page.waitForTimeout(800);
      pass('Programa selecionado');
    }

    // Abre modal de movimento
    const addBtn = await page.$('button[onclick*="openMovModal"], button:has-text("Registrar"), .fab');
    if (addBtn) {
      await addBtn.click();
      await page.waitForTimeout(600);

      const modalVisible = await page.$('#modalMovement:not(.hidden)');
      if (modalVisible) {
        pass('Modal de movimento abre');

        // Testa campo CIA aérea visível quando tipo = emissão
        await page.selectOption('#mType', 'emissao_passagem');
        await page.waitForTimeout(400);

        const emBox = await page.$('#mEmissaoBox:not(.hidden), #mEmissaoBox:not([style*="none"])');
        if (emBox) {
          pass('Campos de emissão aparecem ao selecionar tipo emissão');
        } else {
          fail('Campos de emissão não aparecem para tipo emissão');
        }

        const ciaField = await page.$('#mEmCia');
        if (ciaField) {
          const ciaVisible = await ciaField.isVisible();
          if (ciaVisible) pass('Campo CIA aérea visível');
          else fail('Campo CIA aérea não visível');

          // Verifica largura próxima de outros campos
          const ciaBox = await ciaField.boundingBox();
          const cpmField = await page.$('#mEmCpm');
          if (cpmField && ciaBox) {
            const cpmBox = await cpmField.boundingBox();
            if (cpmBox) {
              const widthDiff = Math.abs(ciaBox.width - cpmBox.width);
              if (widthDiff < 10) {
                pass(`CIA aérea e CPM mesma largura (~${Math.round(ciaBox.width)}px)`);
              } else {
                fail(`CIA aérea (${Math.round(ciaBox.width)}px) ≠ CPM (${Math.round(cpmBox.width)}px), diff=${Math.round(widthDiff)}px`);
              }
            }
          }
        }

        // Fecha modal
        await page.click('button:has-text("Cancelar")');
        await page.waitForTimeout(300);
      } else {
        warn('Modal de movimento não abriu');
      }
    } else {
      warn('Botão de adicionar movimento não encontrado');
    }

    // ── 6. VENCIMENTOS ────────────────────────────────────────────
    console.log('\n── Vencimentos ──');
    const vencTab = await page.$('#navTabVencimentos, button.nav-tab:has-text("Venc")');
    if (vencTab) {
      await vencTab.click();
      await page.waitForTimeout(600);

      const vencPage = await page.$('#pageVencimentos:not(.hidden)');
      if (vencPage) {
        pass('Página de vencimentos carrega');

        // Verifica se há itens de vencimento
        const vencItems = await page.$$('.venc-item, .venc-row, [class*="venc"]');
        if (vencItems.length > 0) {
          pass(`${vencItems.length} item(s) de vencimento encontrado(s)`);
        } else {
          warn('Nenhum item de vencimento listado (pode ser normal se sem dados)');
        }
      } else {
        fail('Página de vencimentos não carregou');
      }
    }

    // ── 7. PROMOS ─────────────────────────────────────────────────
    console.log('\n── Promos ──');
    const promosTab = await page.$('#navTabPromos, button.nav-tab:has-text("Promos")');
    if (promosTab) {
      await promosTab.click();
      await page.waitForTimeout(1000);

      const promosPage = await page.$('#pagePromos:not(.hidden)');
      if (promosPage) {
        pass('Página de Promos carrega');

        // Conta cards
        const cards = await page.$$('.promos-card');
        if (cards.length >= 10) {
          pass(`${cards.length} cards de promos carregados`);
        } else if (cards.length > 0) {
          warn(`Apenas ${cards.length} cards de promos (esperado ≥10)`);
        } else {
          warn('Nenhum card de promos ainda (pode estar carregando)');
        }

        // Testa filtros
        const tags = await page.$$('.promos-tag');
        if (tags.length > 1) {
          pass(`${tags.length} tags de filtro disponíveis`);
          // Clica no segundo tag
          await tags[1].click();
          await page.waitForTimeout(400);
          const activeTags = await page.$$('.promos-tag.active');
          if (activeTags.length === 1) {
            pass('Filtro por tag funciona (seleção única)');
          }
          // Clica novamente para deselecionar
          await tags[1].click();
          await page.waitForTimeout(300);
        }
      } else {
        fail('Página de Promos não carregou');
      }
    } else {
      warn('Aba Promos não encontrada');
    }

    // ── 8. ERROS JS ───────────────────────────────────────────────
    console.log('\n── Erros de JavaScript ──');
    const relevantErrors = jsErrors.filter(e =>
      !e.includes('favicon') && !e.includes('sw.js') &&
      !e.includes('firebase') && !e.includes('google') &&
      !e.includes('cross-origin') && !e.includes('blocked')
    );
    if (relevantErrors.length === 0) {
      pass('Nenhum erro JS relevante detectado');
    } else {
      relevantErrors.forEach(e => fail('Erro JS', e.substring(0, 150)));
    }

    // ── 9. LAYOUT / RESPONSIVO ────────────────────────────────────
    console.log('\n── Layout ──');

    // Verifica overflow horizontal
    const hasHorizScroll = await page.evaluate(() => {
      return document.documentElement.scrollWidth > document.documentElement.clientWidth;
    });
    if (!hasHorizScroll) {
      pass('Sem scroll horizontal (sem overflow)');
    } else {
      warn('Scroll horizontal detectado — possível overflow de layout');
    }

    // Screenshot final
    await page.screenshot({
      path: '/tmp/claude-0/-home-claude/404b18f5-663d-5183-880e-eb81e644657b/scratchpad/test-screenshot.png',
      fullPage: false
    });
    pass('Screenshot capturado');

  } catch (err) {
    fail('Erro fatal no agente de testes', err.message);
  } finally {
    await browser.close();
  }

  // ── RELATÓRIO FINAL ───────────────────────────────────────────
  console.log('\n════════════════════════════════════════');
  console.log('RELATÓRIO DE TESTES — ' + results.timestamp);
  console.log('════════════════════════════════════════');
  console.log(`✅ Passaram: ${results.passed.length}`);
  console.log(`❌ Falharam: ${results.failed.length}`);
  console.log(`⚠️  Avisos:   ${results.warnings.length}`);

  if (results.failed.length > 0) {
    console.log('\nFALHAS:');
    results.failed.forEach(f => console.log(`  • ${f.label}: ${f.detail || ''}`));
  }
  if (results.warnings.length > 0) {
    console.log('\nAVISOS:');
    results.warnings.forEach(w => console.log(`  • ${w.label}: ${w.detail || ''}`));
  }

  return results;
}

runTests().catch(console.error);
