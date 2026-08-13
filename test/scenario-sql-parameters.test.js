import test from 'node:test';
import assert from 'node:assert/strict';
import { montarContextoConsulta, prepararSqlCenario } from '../lib/scenario-sql-parameters.js';

test('usa a identidade da sessao em vez dos valores enviados pelo navegador', () => {
    const contexto = montarContextoConsulta(
        {
            categoria: 'DI',
            idfuncionario: '999',
            idfilial: '99',
            idvendedor: '999',
            filiais: ['01', '02']
        },
        {
            categoria: 'gr',
            sub: '752',
            idfilial: '01',
            idvendedor: '632'
        }
    );

    assert.deepEqual(contexto, {
        categoria: 'GR',
        idfuncionario: '752',
        idfilial: '01',
        idvendedor: '632',
        filiais: ['01', '02']
    });
});

test('prepara parametros Firebird por categoria e listas', () => {
    const preparado = prepararSqlCenario(
        'SELECT * FROM V WHERE :categoria = CATEGORIA AND IDFILIAL IN (:filiais) AND IDVENDEDOR = :idvendedor',
        'firebird',
        { categoria: 'GR', filiais: ['01', '02'], idvendedor: '632' }
    );

    assert.equal(
        preparado.sql,
        'SELECT * FROM V WHERE ? = CATEGORIA AND IDFILIAL IN (?,?) AND IDVENDEDOR = ?'
    );
    assert.deepEqual(preparado.valores, ['GR', '01', '02', '632']);
});

test('remove filtros opcionais quando Todos esta selecionado', () => {
    const preparado = prepararSqlCenario(
        `SELECT * FROM VENDAS V
WHERE V.DATA BETWEEN :data_inicial AND :data_final
/* campo: V.IDFILIAL | filtro = :filiais */
/* campo: V.IDVENDEDOR | filtro = :vendedores */`,
        'firebird',
        {
            dataInicial: '2026-07-01',
            dataFinal: '2026-07-31',
            filiais: ['01', '02'],
            vendedores: ['10', '20'],
            filiaisTodos: true,
            vendedoresTodos: true
        }
    );

    assert.doesNotMatch(preparado.sql, /IDFILIAL|IDVENDEDOR|filiais|vendedores/i);
    assert.deepEqual(preparado.valores, ['2026-07-01', '2026-07-31']);
});

test('aplica filtros opcionais somente para selecoes parciais', () => {
    const preparado = prepararSqlCenario(
        `SELECT * FROM VENDAS V WHERE 1 = 1
/* campo: V.IDFILIAL | filtro = :filiais */
/* campo: V.IDVENDEDOR | filtro = :vendedores */`,
        'firebird',
        {
            filiais: ['01', '02'],
            vendedores: ['632'],
            filiaisTodos: false,
            vendedoresTodos: true
        }
    );

    assert.match(preparado.sql, /AND V\.IDFILIAL IN \(\?,\?\)/);
    assert.doesNotMatch(preparado.sql, /IDVENDEDOR/);
    assert.deepEqual(preparado.valores, ['01', '02']);
});

test('aceita operador logico AND ou OR na diretiva opcional', () => {
    const preparado = prepararSqlCenario(
        `SELECT * FROM VENDAS V WHERE V.ATIVO = 'S'
/* operador = OR | campo: V.IDFILIAL | filtro = :filiais */
/* operador = AND | campo: V.IDVENDEDOR | filtro = :vendedores */`,
        'firebird',
        {
            filiais: ['01', '02'],
            vendedores: ['632'],
            filiaisTodos: false,
            vendedoresTodos: false
        }
    );

    assert.match(preparado.sql, /OR V\.IDFILIAL IN \(\?,\?\)/);
    assert.match(preparado.sql, /AND V\.IDVENDEDOR IN \(\?\)/);
    assert.deepEqual(preparado.valores, ['01', '02', '632']);
});

test('preserva o operador OR quando nao ha itens selecionados', () => {
    const preparado = prepararSqlCenario(
        'SELECT * FROM VENDAS V WHERE V.ATIVO = \'S\' /* operador = OR | campo: V.IDFILIAL | filtro = :filiais */',
        'firebird',
        { filiais: [], filiaisTodos: false }
    );

    assert.match(preparado.sql, /OR 1 = 0/);
});
test('operador OR neutraliza o filtro quando Todos esta selecionado', () => {
    const preparado = prepararSqlCenario(
        `SELECT * FROM VENDAS V
         WHERE V.ATIVO = 'S'
           AND (
               CAST(:categoria AS VARCHAR(2)) NOT IN ('DI', 'SU')
               /* operador = OR | campo: V.IDFILIAL | filtro = :filiais */
           )`,
        'firebird',
        { categoria: 'DI', filiais: ['01', '02'], filiaisTodos: true }
    );

    assert.match(preparado.sql, /NOT IN \('DI', 'SU'\)\s+OR 1 = 1/);
    assert.doesNotMatch(preparado.sql, /IDFILIAL IN/);
    assert.deepEqual(preparado.valores, ['DI']);
});
test('aplica diretiva opcional dentro de execute block', () => {
    const preparado = prepararSqlCenario(
        `EXECUTE BLOCK RETURNS (TOTAL INTEGER) AS
BEGIN
  SELECT COUNT(*) FROM VENDAS V
   WHERE 1 = 1
   /* campo: V.IDVENDEDOR | filtro = :vendedores */
    INTO :TOTAL;
  SUSPEND;
END`,
        'firebird',
        { vendedores: ['632', '731'], vendedoresTodos: false }
    );

    assert.match(preparado.sql, /AND V\.IDVENDEDOR IN \(:CRM_SYS_VENDEDORES_1,:CRM_SYS_VENDEDORES_2\)/);
    assert.deepEqual(preparado.valores, ['632', '731']);
});

test('aplica filtro de relacionamento antes da agregacao em execute block', () => {
    const preparado = prepararSqlCenario(
        `EXECUTE BLOCK RETURNS (TOTAL INTEGER) AS
BEGIN
  SELECT COUNT(DISTINCT V.DOCTOCLIENTE)
    FROM CLIENTES V
   WHERE 1 = 1
   /* relacionamento | campo: V.DOCTOCLIENTE */
    INTO :TOTAL;
  SUSPEND;
END`,
        'firebird',
        {
            relacionamentoModo: 'incluir',
            documentosRelacionamento: ['001', '002']
        }
    );

    assert.match(preparado.sql, /AND \(V\.DOCTOCLIENTE IN \(:CRM_SYS_DOCUMENTOS_RELACIONAMENTO_1_1,:CRM_SYS_DOCUMENTOS_RELACIONAMENTO_1_2\)\)/);
    assert.deepEqual(preparado.valores, ['001', '002']);
});

test('filtro de relacionamento divide listas e exclui contatos fora da selecao', () => {
    const documentos = Array.from({ length: 1001 }, (_, indice) => String(indice + 1));
    const preparado = prepararSqlCenario(
        'SELECT * FROM CLIENTES V WHERE 1 = 1 /* relacionamento | campo: V.DOCTOCLIENTE */',
        'firebird',
        { relacionamentoModo: 'excluir', documentosRelacionamento: documentos }
    );

    assert.match(preparado.sql, /V\.DOCTOCLIENTE NOT IN \([^)]{1000,}\) AND V\.DOCTOCLIENTE NOT IN \(\?\)/);
    assert.equal(preparado.valores.length, 1001);
});

test('filtro de relacionamento permite todos ou bloqueia retorno vazio', () => {
    const sql = 'SELECT * FROM CLIENTES V WHERE 1 = 1 /* relacionamento | campo: V.DOCTOCLIENTE */';
    const todos = prepararSqlCenario(sql, 'firebird', { relacionamentoModo: 'todos' });
    const nenhum = prepararSqlCenario(sql, 'firebird', { relacionamentoModo: 'nenhum' });

    assert.doesNotMatch(todos.sql, /DOCTOCLIENTE/);
    assert.match(nenhum.sql, /AND 1 = 0/);
});

test('diretiva sem itens selecionados impede retorno amplo acidental', () => {
    const preparado = prepararSqlCenario(
        'SELECT * FROM VENDAS V WHERE 1 = 1 /* campo: V.IDFILIAL | filtro = :filiais */',
        'firebird',
        { filiais: [], filiaisTodos: false }
    );

    assert.match(preparado.sql, /AND 1 = 0/);
    assert.deepEqual(preparado.valores, []);
});
test('rejeita diretiva opcional digitada incorretamente', () => {
    assert.throws(
        () => prepararSqlCenario(
            'SELECT * FROM VENDAS V WHERE 1 = 1 /* operador = XOR | campo: V.IDFILIAL | filtro = :filiais */',
            'firebird',
            { filiais: ['01'], filiaisTodos: false }
        ),
        /Diretiva de filtro opcional invalida/
    );
    assert.throws(
        () => prepararSqlCenario(
            'SELECT * FROM VENDAS V WHERE 1 = 1 /* campo: V.IDFILIAL | filtro = :clientes */',
            'firebird',
            {}
        ),
        /Diretiva de filtro opcional invalida/
    );
});

test('aceita parametros sem diferenciar maiusculas no Postgres', () => {
    const preparado = prepararSqlCenario(
        'SELECT * FROM vendas WHERE :CATEGORIA = categoria AND idfilial = :IDFILIAL',
        'postgres',
        { categoria: 'VD', idfilial: '01' }
    );

    assert.equal(
        preparado.sql,
        'SELECT * FROM vendas WHERE $1 = categoria AND idfilial = $2'
    );
    assert.deepEqual(preparado.valores, ['VD', '01']);
});


test('prepara parametros nomeados dentro de EXECUTE BLOCK Firebird', () => {
    const preparado = prepararSqlCenario(
        `EXECUTE BLOCK
RETURNS (TOTAL NUMERIC(18,2))
AS
BEGIN
  SELECT SUM(V.SUBTOTAL)
    FROM VENDAS V
   WHERE V.DATA BETWEEN :data_inicial AND :data_final
     AND V.IDFILIAL IN (:filiais)
    INTO :TOTAL;
  SUSPEND;
END`,
        'firebird',
        { dataInicial: '2026-07-01', dataFinal: '2026-07-28', filiais: ['01', '02'] }
    );

    assert.match(preparado.sql, /CRM_SYS_DATA_INICIAL VARCHAR\(10\) = \?/);
    assert.match(preparado.sql, /CRM_SYS_FILIAIS_1 VARCHAR\(50\) = \?/);
    assert.match(preparado.sql, /BETWEEN CAST\(:CRM_SYS_DATA_INICIAL AS DATE\) AND CAST\(:CRM_SYS_DATA_FINAL AS DATE\)/);
    assert.match(preparado.sql, /IN \(:CRM_SYS_FILIAIS_1,:CRM_SYS_FILIAIS_2\)/);
    assert.deepEqual(preparado.valores, ['2026-07-01', '2026-07-28', '01', '02']);
});

test('reaproveita o mesmo parametro quando ele aparece mais de uma vez no bloco', () => {
    const preparado = prepararSqlCenario(
        `EXECUTE BLOCK RETURNS (IDFILIAL VARCHAR(2)) AS
BEGIN
  IF (:idfilial = :idfilial) THEN IDFILIAL = :idfilial;
  SUSPEND;
END`,
        'firebird',
        { idfilial: '01' }
    );

    assert.equal((preparado.sql.match(/CRM_SYS_IDFILIAL VARCHAR\(50\) = \?/g) || []).length, 1);
    assert.equal((preparado.sql.match(/:CRM_SYS_IDFILIAL/g) || []).length, 3);
    assert.deepEqual(preparado.valores, ['01']);
});


test('vendedor ignora listas e usa somente sua identidade de vendedor', () => {
    const contexto = montarContextoConsulta(
        { filiais: ['99'], vendedores: ['999'] },
        { categoria: 'VD', sub: '10', idfilial: '01', idvendedor: '632' }
    );
    assert.deepEqual(contexto.filiais, []);
    assert.deepEqual(contexto.vendedores, []);
    assert.equal(contexto.idfilial, '');
    assert.equal(contexto.idvendedor, '632');
});

test('caixa ignora listas e usa somente sua filial autenticada', () => {
    const contexto = montarContextoConsulta(
        { filiais: ['99'], vendedores: ['999'] },
        { categoria: 'CX', sub: '11', idfilial: '19', idvendedor: '777' }
    );
    assert.deepEqual(contexto.filiais, []);
    assert.deepEqual(contexto.vendedores, []);
    assert.equal(contexto.idfilial, '19');
    assert.equal(contexto.idvendedor, '');
});

test('aceita o nome completo da categoria ao montar o contexto', () => {
    const contexto = montarContextoConsulta(
        { filiais: ['99'], vendedores: ['999'] },
        { categoria: 'Vendedor', sub: '10', idfilial: '01', idvendedor: '632' }
    );

    assert.equal(contexto.categoria, 'VD');
    assert.deepEqual(contexto.filiais, []);
    assert.deepEqual(contexto.vendedores, []);
    assert.equal(contexto.idfilial, '');
    assert.equal(contexto.idvendedor, '632');
});

test('vendedor neutraliza filtros de listas e mantem identidade e periodo', () => {
    const preparado = prepararSqlCenario(
        `SELECT * FROM VENDAS V
WHERE V.DATA BETWEEN :data_inicial AND :data_final
  AND V.IDFILIAL IN (:filiais)
  AND V.IDVENDEDOR IN (:vendedores)
  AND V.IDVENDEDOR = :idvendedor`,
        'firebird',
        {
            categoria: 'VD',
            dataInicial: '2026-07-01',
            dataFinal: '2026-07-29',
            idvendedor: '632',
            filiais: [],
            vendedores: []
        }
    );

    assert.doesNotMatch(preparado.sql, /:filiais|:vendedores|__SEM_VALOR__/i);
    assert.equal((preparado.sql.match(/1 = 1/g) || []).length, 2);
    assert.deepEqual(preparado.valores, ['2026-07-01', '2026-07-29', '632']);
});

test('caixa neutraliza listas dentro de execute block e mantem sua filial', () => {
    const preparado = prepararSqlCenario(
        `EXECUTE BLOCK RETURNS (TOTAL INTEGER) AS
BEGIN
  SELECT COUNT(*)
    FROM VENDAS V
   WHERE V.IDFILIAL IN (:filiais)
     AND V.IDVENDEDOR IN (:vendedores)
     AND V.IDFILIAL = :idfilial
    INTO :TOTAL;
  SUSPEND;
END`,
        'firebird',
        { categoria: 'CX', idfilial: '19', filiais: [], vendedores: [] }
    );

    assert.doesNotMatch(preparado.sql, /CRM_SYS_FILIAIS|CRM_SYS_VENDEDORES|__SEM_VALOR__/);
    assert.equal((preparado.sql.match(/1 = 1/g) || []).length, 2);
    assert.match(preparado.sql, /CRM_SYS_IDFILIAL VARCHAR\(50\) = \?/);
    assert.deepEqual(preparado.valores, ['19']);
});
test('parametriza o contexto do relatorio aberto por clique', () => {
    const contexto = montarContextoConsulta(
        {
            dataInicial: '2026-08-01',
            detalheValor: '01',
            detalheCampo: 'IDFILIAL',
            detalheSerie: 'Faturamento'
        },
        { categoria: 'DI', sub: '10', idfilial: '01', idvendedor: '632' }
    );
    const preparado = prepararSqlCenario(
        'SELECT * FROM VENDAS WHERE IDFILIAL = :detalhe_valor AND :detalhe_campo = :detalhe_campo AND :detalhe_serie IS NOT NULL',
        'firebird',
        contexto
    );

    assert.equal(contexto.detalheValor, '01');
    assert.equal(contexto.detalheCampo, 'IDFILIAL');
    assert.equal(contexto.detalheSerie, 'Faturamento');
    assert.deepEqual(preparado.valores, ['01', 'IDFILIAL', 'IDFILIAL', 'Faturamento']);
});

test('injeta parametros do detalhe em execute block sem concatenar valores', () => {
    const preparado = prepararSqlCenario(
        `EXECUTE BLOCK RETURNS (TOTAL INTEGER) AS
BEGIN
  SELECT COUNT(*) FROM VENDAS
   WHERE IDFILIAL = :detalhe_valor
     AND :detalhe_serie = :detalhe_serie
    INTO :TOTAL;
  SUSPEND;
END`,
        'firebird',
        { detalheValor: '01', detalheSerie: 'Vendas' }
    );

    assert.match(preparado.sql, /CRM_SYS_DETALHE_VALOR VARCHAR\(500\) = \?/);
    assert.match(preparado.sql, /CRM_SYS_DETALHE_SERIE VARCHAR\(200\) = \?/);
    assert.doesNotMatch(preparado.sql, /IDFILIAL = '01'/);
    assert.deepEqual(preparado.valores, ['01', 'Vendas']);
});
