(function (global) {
    'use strict';

    var TAMANHO_LOTE_PADRAO = 200;

    function erro(mensagem) {
        var falha = new Error(mensagem);
        falha.name = 'RelationshipQueryError';
        return falha;
    }

    function normalizar(valor) { return String(valor || '').trim().toLowerCase(); }
    function valorLinha(linha, campo) {
        if (!linha || !campo) return undefined;
        if (Object.prototype.hasOwnProperty.call(linha, campo)) return linha[campo];
        var chave = Object.keys(linha).find(function (item) { return normalizar(item) === normalizar(campo); });
        return chave ? linha[chave] : undefined;
    }
    function valorChave(valor) {
        if (valor === null || valor === undefined || valor === '') return null;
        return String(valor).trim();
    }

    function extrairDeclaracao(sql) {
        var texto = String(sql || '');
        var padrao = /\/\*\s*RELACIONAR\b([\s\S]*?)\*\//gi;
        var encontradas = [];
        var match;
        while ((match = padrao.exec(texto)) !== null) {
            var atributos = {};
            var conteudo = String(match[1] || '').replace(/^\s*[|:]\s*/, '');
            var atributo = /([a-z_][a-z0-9_]*)\s*:\s*(?:"([^"]*)"|'([^']*)'|([^|\r\n]+))/gi;
            var item;
            while ((item = atributo.exec(conteudo)) !== null) {
                atributos[normalizar(item[1])] = String(item[2] !== undefined ? item[2] : (item[3] !== undefined ? item[3] : item[4] || '')).trim();
            }
            if (!atributos.apelido || !/^[a-z_][a-z0-9_$]*$/i.test(atributos.apelido)) {
                throw erro('A diretiva RELACIONAR precisa de um apelido simples.');
            }
            encontradas.push({
                apelido: atributos.apelido,
                consulta: atributos.consulta || '',
                campoPadrao: atributos.campo || '',
                inicio: match.index,
                fim: match.index + match[0].length
            });
        }
        if (encontradas.length > 1) throw erro('Use somente uma declaracao RELACIONAR em cada consulta adicional.');
        return encontradas[0] || null;
    }

    function camposVirtuaisUsados(sql, declaracao) {
        if (!declaracao) return [];
        var texto = String(sql || '').slice(0, declaracao.inicio) + ' ' + String(sql || '').slice(declaracao.fim);
        var campos = [];
        var apelido = declaracao.apelido.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        var padraoCampo = new RegExp('/\\*\\s*' + apelido + '\\.([a-z_][a-z0-9_$]*)\\s*\\*/', 'gi');
        var match;
        while ((match = padraoCampo.exec(texto)) !== null) campos.push(match[1]);
        var padraoSimples = new RegExp('/\\*\\s*' + apelido + '\\s*\\*/', 'gi');
        if (padraoSimples.test(texto)) {
            if (!declaracao.campoPadrao) throw erro('Informe campo: CAMPO na declaracao RELACIONAR ou use /* apelido.CAMPO */.');
            campos.push(declaracao.campoPadrao);
        }
        return Array.from(new Map(campos.map(function (campo) { return [normalizar(campo), campo]; })).values());
    }

    function camposJoinValidos(campos) {
        var lista = Array.isArray(campos) ? campos : [];
        return lista.map(function (campo) {
            return {
                chavePrincipal: String(campo && campo.chavePrincipal || '').trim(),
                chaveSecundaria: String(campo && campo.chaveSecundaria || '').trim()
            };
        }).filter(function (campo) { return campo.chavePrincipal && campo.chaveSecundaria; });
    }

    function planejar(consulta, principal, camposJoin, tamanhoLote) {
        var campos = camposJoinValidos(camposJoin);
        if (!campos.length) return null;
        var declaracao = extrairDeclaracao(consulta && consulta.sql);
        var aliasPrincipal = String(principal && principal.alias || '').trim();
        if (declaracao && declaracao.consulta && normalizar(declaracao.consulta) !== normalizar(aliasPrincipal)) {
            throw erro('O relacionamento "' + declaracao.apelido + '" deve usar a consulta "' + declaracao.consulta + '" como origem.');
        }
        var camposVirtuais = camposVirtuaisUsados(consulta && consulta.sql, declaracao);
        var linhasOrigem = Array.isArray(principal && principal.dados) ? principal.dados : [];
        var entradasPorChave = new Map();
        linhasOrigem.forEach(function (linha) {
            var valoresChave = campos.map(function (campo) { return valorLinha(linha, campo.chavePrincipal); });
            if (valoresChave.some(function (valor) { return valorChave(valor) === null; })) return;
            var virtuais = {};
            camposVirtuais.forEach(function (campo) {
                virtuais[(declaracao ? declaracao.apelido + '.' : '') + campo] = valorLinha(linha, campo);
            });
            var assinaturaChave = JSON.stringify(valoresChave.map(valorChave));
            var assinaturaVirtual = JSON.stringify(Object.entries(virtuais).map(function (entrada) { return [normalizar(entrada[0]), entrada[1]]; }));
            if (entradasPorChave.has(assinaturaChave)) {
                if (entradasPorChave.get(assinaturaChave).assinaturaVirtual !== assinaturaVirtual) {
                    throw erro('A mesma chave de relacionamento possui valores virtuais diferentes na consulta principal. Complete a chave composta para eliminar a ambiguidade.');
                }
                return;
            }
            entradasPorChave.set(assinaturaChave, { valoresChave: valoresChave, virtuais: virtuais, assinaturaVirtual: assinaturaVirtual });
        });

        var grupos = new Map();
        Array.from(entradasPorChave.values()).forEach(function (entrada) {
            if (!grupos.has(entrada.assinaturaVirtual)) grupos.set(entrada.assinaturaVirtual, { virtuais: entrada.virtuais, linhas: [] });
            grupos.get(entrada.assinaturaVirtual).linhas.push(entrada.valoresChave);
        });
        var limite = Math.max(1, Math.min(250, Number(tamanhoLote) || TAMANHO_LOTE_PADRAO));
        var lotes = [];
        grupos.forEach(function (grupo) {
            for (var inicio = 0; inicio < grupo.linhas.length; inicio += limite) {
                lotes.push({
                    apelido: declaracao ? declaracao.apelido : '',
                    consulta: aliasPrincipal,
                    chaves: campos.map(function (campo) { return { origem: campo.chavePrincipal, destino: campo.chaveSecundaria }; }),
                    linhas: grupo.linhas.slice(inicio, inicio + limite),
                    virtuais: grupo.virtuais
                });
            }
        });
        return { lotes: lotes, declaracao: declaracao, camposVirtuais: camposVirtuais };
    }

    global.CRM_RELATIONSHIP_QUERY = {
        extrairDeclaracao: extrairDeclaracao,
        camposVirtuaisUsados: camposVirtuaisUsados,
        planejar: planejar
    };
}(window));
