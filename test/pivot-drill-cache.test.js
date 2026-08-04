import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const dashboardPath = new URL('../public/crm.js', import.meta.url);
const apiPath = new URL('../api/executar-cenario.js', import.meta.url);

test('cache detalhado e carregado somente quando o drill-down for solicitado', async () => {
    const [dashboard, api] = await Promise.all([
        readFile(dashboardPath, 'utf8'),
        readFile(apiPath, 'utf8')
    ]);

    assert.match(dashboard, /cacheBaseDrill: ehPivot && Boolean\(opcoes\.campoDrill\)/);
    assert.match(api, /deveTentarCacheBaseVisualizacao\(preparadoBase, fonteNormalizada, visualizacao\)/);
    assert.match(api, /estrategiaVisualizacao = 'cache-base'/);
});

test('rota possui limites e fallback para agregacao no banco', async () => {
    const api = await readFile(apiPath, 'utf8');

    assert.match(api, /BI_DRILL_CACHE_MAX_ROWS/);
    assert.match(api, /BI_DRILL_CACHE_MAX_BYTES/);
    assert.match(api, /sql-agregado-limite-linhas/);
    assert.match(api, /sql-agregado-limite-memoria/);
});
