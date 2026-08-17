import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

async function carregarDiretivas() {
    const source = await readFile(new URL('../public/crm.js', import.meta.url), 'utf8');
    const inicio = source.indexOf('const iconesFontAwesomeMarca');
    const fim = source.indexOf('function renderizarConteudoCelula', inicio);
    assert.ok(inicio >= 0 && fim > inicio);
    return Function(`${source.slice(inicio, fim)}; return { sanitizarCssDiretiva, iconeCelula };`)();
}

async function carregarLeitorDiretivas() {
    const source = await readFile(new URL('../public/crm.js', import.meta.url), 'utf8');
    const inicio = source.indexOf('function obterSqlWidget');
    const fim = source.indexOf('const iconesFontAwesomeMarca', inicio);
    assert.ok(inicio >= 0 && fim > inicio);
    return Function(`${source.slice(inicio, fim)}; return obterDiretivasCelula;`)();
}

test('diretiva reconhece alias com espacos entre aspas em SELECT e EXECUTE BLOCK', async () => {
    const obterDiretivasCelula = await carregarLeitorDiretivas();
    const select = obterDiretivasCelula({
        sql: 'SELECT /* icon:fa-calendar-days | color:#FFDE21 */ C.DATA AS "DATA CONTATO" FROM CLIENTE C'
    });
    const bloco = obterDiretivasCelula({
        sql: 'EXECUTE BLOCK RETURNS ("DATA CONTATO" DATE) AS BEGIN /* icon:fa-calendar-days */ /* AS "DATA CONTATO" */ SUSPEND; END'
    });

    assert.equal(select[0].campo, 'DATA CONTATO');
    assert.equal(select[0].valor, 'fa-calendar-days');
    assert.equal(bloco[0].campo, 'DATA CONTATO');
});

test('diretivas nao duplicam o SQL principal nem vazam do relatorio de detalhe', async () => {
    const obterDiretivasCelula = await carregarLeitorDiretivas();
    const sql = 'SELECT /* action:contact | label:Registrar */ C.DOCUMENTO AS DOCUMENTO FROM CLIENTE C';
    const principal = obterDiretivasCelula({
        sql,
        consultas: [{ alias: 'principal', sql }],
        detalhe: { sql: 'SELECT /* action:contact */ D.DOCUMENTO AS DOCUMENTO FROM DETALHE D' }
    });
    const detalhe = obterDiretivasCelula({
        relatorioDetalhe: true,
        sql: 'SELECT /* icon:fa-route */ D.DISTANCIA AS DISTANCIA_KM FROM DETALHE D'
    });

    assert.equal(principal.length, 1);
    assert.equal(principal[0].tipo, 'action');
    assert.equal(detalhe.length, 1);
    assert.equal(detalhe[0].campo, 'DISTANCIA_KM');
});

test('diretiva aceita alvo herdado com prefixo e coluna criada pelo motor', async () => {
    const obterDiretivasCelula = await carregarLeitorDiretivas();
    const diretivas = obterDiretivasCelula({
        sql: `
            /* icon:fa-check-double */ /* AS CONTATO.STATUS_CONTATO */
            /* icon:fa-route */ /* AS DISTANCIA_KM */
            SELECT 1 FROM RDB$DATABASE
        `
    });

    assert.deepEqual(diretivas.map(item => item.campo), ['CONTATO.STATUS_CONTATO', 'DISTANCIA_KM']);
});

test('diretiva aceita campo explicito sem depender de AS no SQL', async () => {
    const obterDiretivasCelula = await carregarLeitorDiretivas();
    const diretivas = obterDiretivasCelula({
        sql: `
            /* icon:fa-check-double | campo:CONTATO.STATUS_CONTATO | color:#FFDE21 | background:#123865 */
            EXECUTE BLOCK RETURNS (SITUACAO VARCHAR(30)) AS BEGIN SUSPEND; END
        `
    });

    assert.equal(diretivas.length, 1);
    assert.equal(diretivas[0].campo, 'CONTATO.STATUS_CONTATO');
    assert.equal(diretivas[0].color, '#FFDE21');
});

test('tabela dinamica aplica diretivas em apelidos, cabecalhos e valores agregados', async () => {
    const source = await readFile(new URL('../public/crm.js', import.meta.url), 'utf8');
    assert.match(source, /normalizarNomeCampoContato\(campo\?\.apelido \|\| ''\)/);
    assert.match(source, /somenteIcones: true/);
    assert.match(source, /renderizarConteudoCelula\(widget, valor, registrosColuna\[0\]/);
});

test('diretiva renderiza Font Awesome solid, regular e marcas', async () => {
    const { iconeCelula } = await carregarDiretivas();
    assert.match(iconeCelula('fa-user-plus'), /class="fa-solid fa-user-plus"/);
    assert.match(iconeCelula('fa-address-card', { family: 'regular' }), /class="fa-regular fa-address-card"/);
    assert.match(iconeCelula('fa-whatsapp'), /class="fa-brands fa-whatsapp"/);
});

test('CSS da diretiva aceita somente propriedades visuais seguras', async () => {
    const { sanitizarCssDiretiva } = await carregarDiretivas();
    const css = sanitizarCssDiretiva('background:#25D366;color:#fff;border-radius:14px;padding:7px 12px;position:fixed;background-image:url(https://x)');
    assert.equal(css, 'background:#25D366;color:#fff;border-radius:14px;padding:7px 12px');
    assert.doesNotMatch(css, /position|url|background-image/);
});
