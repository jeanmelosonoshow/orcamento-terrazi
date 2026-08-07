(function (global) {
    'use strict';
    function erro(mensagem) { var falha = new Error(mensagem); falha.name = 'CompositeDatasetError'; return falha; }
    function aliasValido(valor, fallback) { var alias = String(valor || fallback || '').trim().replace(/[^a-zA-Z0-9_]+/g, '_'); if (!alias) throw erro('Informe um apelido para cada consulta.'); return alias; }
    function obterValor(linha, coluna) { if (!linha || !coluna) return undefined; if (Object.prototype.hasOwnProperty.call(linha, coluna)) return linha[coluna]; var chave = Object.keys(linha).find(function (item) { return item.toLowerCase() === String(coluna).toLowerCase(); }); return chave ? linha[chave] : undefined; }
    function prefixarLinha(linha, alias) { return Object.fromEntries(Object.entries(linha || {}).map(function (entrada) { return [alias + '.' + entrada[0], entrada[1]]; })); }
    function chaveRelacao(valor) { if (valor === null || valor === undefined || valor === '') return null; return String(valor).trim(); }
    function aplicarFormulas(linhas, campos, avaliar) {
        return linhas.map(function (linha) {
            var calculada = Object.assign({}, linha); var nomes = new Set();
            (campos || []).forEach(function (campo) {
                var nome = String(campo && campo.nome || '').trim(); var formula = String(campo && campo.formula || '').trim();
                if (!nome || !formula) throw erro('Preencha o nome e a formula de todos os campos calculados.');
                var chaveNome = nome.toLowerCase();
                if (nomes.has(chaveNome) || Object.keys(calculada).some(function (chave) { return chave.toLowerCase() === chaveNome; })) throw erro('O campo calculado "' + nome + '" esta duplicado.');
                calculada[nome] = avaliar(formula, calculada); nomes.add(chaveNome);
            }); return calculada;
        });
    }
    function colunasUniao(fontes) {
        var nomes = new Map();
        fontes.forEach(function (fonte) {
            fonte.colunas.forEach(function (coluna) {
                var chave = String(coluna).toLowerCase();
                if (!nomes.has(chave)) nomes.set(chave, coluna);
            });
        });
        return Array.from(nomes.values());
    }
    function unirLinhas(fontes) {
        var colunas = colunasUniao(fontes);
        var dados = [];
        fontes.forEach(function (fonte) {
            fonte.dados.forEach(function (linha) {
                var unificada = {};
                colunas.forEach(function (coluna) {
                    var valor = obterValor(linha, coluna);
                    unificada[coluna] = valor === undefined ? null : valor;
                });
                dados.push(unificada);
            });
        });
        return { colunas: colunas, dados: dados };
    }
    function combinar(consultas, combinacao, camposCalculados, avaliar) {
        var fontes = (consultas || []).filter(Boolean).map(function (consulta, indice) { return { alias: aliasValido(consulta.alias, 'consulta' + (indice + 1)), colunas: Array.isArray(consulta.colunas) ? consulta.colunas : [], dados: Array.isArray(consulta.dados) ? consulta.dados : [] }; });
        if (!fontes.length) return { colunas: [], dados: [] };
        if (typeof avaliar !== 'function' && camposCalculados && camposCalculados.length) throw erro('Avaliador de formulas indisponivel.');
        var linhas; var colunas;
        if (fontes.length === 1) {
            linhas = fontes[0].dados.map(function (linha) { return Object.assign({}, linha); });
            colunas = fontes[0].colunas.slice();
        } else {
            var modo = String(combinacao && combinacao.modo || 'single');
            if (modo === 'union') {
                var uniao = unirLinhas(fontes);
                linhas = uniao.dados;
                colunas = uniao.colunas;
            } else if (modo === 'single') {
                if (fontes.some(function (fonte) { return fonte.dados.length > 1; })) throw erro('Resultado unico exige no maximo uma linha em cada consulta.');
                linhas = [fontes.reduce(function (resultado, fonte) { return Object.assign(resultado, prefixarLinha(fonte.dados[0] || {}, fonte.alias)); }, {})];
                colunas = fontes.reduce(function (resultado, fonte) { return resultado.concat(fonte.colunas.map(function (coluna) { return fonte.alias + '.' + coluna; })); }, []);
            } else {
                if (fontes.length !== 2) throw erro('O relacionamento por campo aceita duas consultas. Para tres ou mais, use Unir linhas das consultas.');
                var principal = fontes[0]; var secundaria = fontes[1];
                colunas = principal.colunas.map(function (coluna) { return principal.alias + '.' + coluna; }).concat(secundaria.colunas.map(function (coluna) { return secundaria.alias + '.' + coluna; }));
                var chavePrincipal = String(combinacao && combinacao.chavePrincipal || '').trim(); var chaveSecundaria = String(combinacao && combinacao.chaveSecundaria || '').trim();
                if (!chavePrincipal || !chaveSecundaria) throw erro('Selecione os dois campos de relacionamento.');
                var indiceSecundario = new Map();
                secundaria.dados.forEach(function (linha) { var chave = chaveRelacao(obterValor(linha, chaveSecundaria)); if (chave === null) return; if (indiceSecundario.has(chave)) throw erro('A chave da segunda consulta possui valores duplicados. Agregue-a antes do relacionamento.'); indiceSecundario.set(chave, linha); });
                linhas = principal.dados.map(function (linha) { var relacionada = indiceSecundario.get(chaveRelacao(obterValor(linha, chavePrincipal))) || {}; return Object.assign({}, prefixarLinha(linha, principal.alias), prefixarLinha(relacionada, secundaria.alias)); });
            }
        }
        var calculados = (camposCalculados || []).filter(function (campo) { return String(campo && campo.nome || '').trim() || String(campo && campo.formula || '').trim(); });
        if (calculados.length) { linhas = aplicarFormulas(linhas, calculados, avaliar); colunas = colunas.concat(calculados.map(function (campo) { return String(campo.nome).trim(); })); }
        return { colunas: colunas, dados: linhas };
    }
    global.CRM_COMPOSITE_DATASETS = { combinar: combinar, aliasValido: aliasValido };
}(window));
