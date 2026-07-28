(function registrarRenderizadoresGraficos() {
    function numero(valor) {
        var convertido = Number(valor);
        return Number.isFinite(convertido) ? convertido : 0;
    }

    function limiteVisual(valores) {
        var numericos = valores.map(numero);
        return {
            min: Math.min.apply(null, numericos.concat([0])),
            max: Math.max.apply(null, numericos.concat([1]))
        };
    }

    function renderizarMatriz(contexto, percentual) {
        var dados = contexto.dados;
        var colunas = dados.series.map(function (serie) { return serie.nome; });
        var matriz = [];
        dados.series.forEach(function (serie, coluna) {
            serie.valores.forEach(function (valor, linha) {
                var numerico = numero(valor);
                if (percentual) {
                    var baseLinha = numero(dados.series[0] && dados.series[0].valores[linha]);
                    numerico = baseLinha ? (numerico / baseLinha) * 100 : 0;
                }
                matriz.push([coluna, linha, numerico]);
            });
        });
        var extensao = limiteVisual(matriz.map(function (item) { return item[2]; }));
        var formato = percentual ? 'percent' : (dados.series[0] && dados.series[0].formato);
        return Object.assign({}, contexto.base, {
            tooltip: Object.assign({}, contexto.base.tooltip, {
                trigger: 'item',
                formatter: function (params) {
                    return dados.categorias[params.value[1]] + ' / ' + colunas[params.value[0]] + ': ' + contexto.formatar(params.value[2], formato);
                }
            }),
            grid: { left: contexto.compacto ? 8 : 18, right: 12, top: 12, bottom: contexto.compacto ? 28 : 42, containLabel: true },
            xAxis: { type: 'category', data: colunas, splitArea: { show: true }, axisLabel: { hideOverlap: true } },
            yAxis: { type: 'category', data: dados.categorias, inverse: true, splitArea: { show: true }, axisLabel: { hideOverlap: true } },
            visualMap: {
                min: percentual ? 0 : extensao.min,
                max: percentual ? Math.max(100, extensao.max) : extensao.max,
                calculable: !contexto.compacto,
                orient: 'horizontal',
                left: 'center',
                bottom: 0,
                itemWidth: contexto.compacto ? 8 : 12,
                itemHeight: contexto.compacto ? 70 : 110,
                textStyle: { color: contexto.textoGrafico },
                inRange: { color: [contexto.paleta[3] || '#D9E8EE', contexto.paleta[1] || '#4E8FB8', contexto.paleta[0] || '#123865'] }
            },
            series: [{
                name: percentual ? 'Retencao' : 'Intensidade',
                type: 'heatmap',
                data: matriz,
                label: { show: !contexto.compacto, formatter: function (params) { return contexto.formatar(params.value[2], formato); } },
                emphasis: { itemStyle: { shadowBlur: 8, shadowColor: 'rgba(0,0,0,0.24)' } }
            }]
        });
    }

    function renderizarDispersao(contexto, bolhas) {
        var categoriasNumericas = contexto.dados.categorias.map(function (categoria) { return Number(String(categoria).replace(',', '.')); });
        var eixoNumerico = categoriasNumericas.every(Number.isFinite);
        var serieTamanho = contexto.dados.series[1];
        var tamanhos = serieTamanho ? serieTamanho.valores.map(numero) : contexto.dados.series[0].valores.map(function (valor) { return Math.abs(numero(valor)); });
        var extensaoTamanho = limiteVisual(tamanhos);
        var dimensionar = function (valor) {
            if (!bolhas) return contexto.compacto ? 7 : 10;
            var amplitude = Math.max(1, extensaoTamanho.max - extensaoTamanho.min);
            return (contexto.compacto ? 10 : 14) + ((numero(valor) - extensaoTamanho.min) / amplitude) * (contexto.compacto ? 24 : 38);
        };
        var series = bolhas ? [contexto.dados.series[0]] : contexto.dados.series;
        return Object.assign({}, contexto.base, {
            tooltip: Object.assign({}, contexto.base.tooltip, {
                trigger: 'item',
                formatter: function (params) {
                    var ponto = params.value;
                    var rotulo = ponto[3] || ponto[0];
                    var texto = rotulo + ': ' + contexto.formatar(ponto[1], params.seriesName === (contexto.dados.series[0] && contexto.dados.series[0].nome) ? contexto.dados.series[0].formato : 'decimal');
                    return bolhas ? texto + '<br>Tamanho: ' + contexto.formatar(ponto[2], serieTamanho && serieTamanho.formato) : texto;
                }
            }),
            xAxis: eixoNumerico
                ? { type: 'value', name: contexto.compacto ? '' : contexto.dados.nomeDimensao, splitLine: { lineStyle: { color: 'rgba(120,130,145,0.14)' } } }
                : { type: 'category', name: contexto.compacto ? '' : contexto.dados.nomeDimensao, data: contexto.dados.categorias, axisLabel: { hideOverlap: true } },
            yAxis: { type: 'value', splitLine: { lineStyle: { color: 'rgba(120,130,145,0.14)' } } },
            series: series.map(function (serie) {
                return {
                    name: serie.nome,
                    type: 'scatter',
                    symbolSize: function (ponto) { return dimensionar(ponto[2]); },
                    data: serie.valores.map(function (valor, index) {
                        return [eixoNumerico ? categoriasNumericas[index] : contexto.dados.categorias[index], numero(valor), tamanhos[index], contexto.dados.categorias[index]];
                    }),
                    emphasis: { focus: 'series', scale: true }
                };
            })
        });
    }

    function renderizarCascata(contexto) {
        var serie = contexto.dados.series[0];
        var base = [];
        var positivos = [];
        var negativos = [];
        var acumulado = 0;
        serie.valores.forEach(function (valor) {
            var atual = numero(valor);
            base.push(atual >= 0 ? acumulado : acumulado + atual);
            positivos.push(atual >= 0 ? atual : '-');
            negativos.push(atual < 0 ? Math.abs(atual) : '-');
            acumulado += atual;
        });
        return Object.assign({}, contexto.base, {
            tooltip: Object.assign({}, contexto.base.tooltip, { trigger: 'axis' }),
            xAxis: { type: 'category', data: contexto.dados.categorias, axisLabel: { hideOverlap: true, rotate: contexto.muitasCategorias ? 28 : 0 } },
            yAxis: { type: 'value', axisLabel: { formatter: function (valor) { return contexto.formatar(valor, serie.formato); } }, splitLine: { lineStyle: { color: 'rgba(120,130,145,0.14)' } } },
            series: [
                { type: 'bar', stack: 'cascata', silent: true, itemStyle: { color: 'transparent' }, emphasis: { itemStyle: { color: 'transparent' } }, data: base },
                { name: 'Aumento', type: 'bar', stack: 'cascata', data: positivos, itemStyle: { color: contexto.paleta[1] || '#2F7D5C' }, label: { show: !contexto.compacto, position: 'top', formatter: function (params) { return params.value === '-' ? '' : contexto.formatar(params.value, serie.formato); } } },
                { name: 'Reducao', type: 'bar', stack: 'cascata', data: negativos, itemStyle: { color: contexto.paleta[4] || '#B8563F' }, label: { show: !contexto.compacto, position: 'bottom', formatter: function (params) { return params.value === '-' ? '' : '-' + contexto.formatar(params.value, serie.formato); } } }
            ]
        });
    }

    function renderizarHistograma(contexto) {
        var categorias = contexto.dados.categorias.map(function (valor) { return Number(String(valor).replace(',', '.')); });
        var amostras = categorias.every(Number.isFinite) ? categorias : contexto.dados.series[0].valores.map(numero);
        var min = Math.min.apply(null, amostras);
        var max = Math.max.apply(null, amostras);
        var quantidade = Math.max(1, Math.min(12, Math.ceil(Math.sqrt(amostras.length))));
        var largura = max === min ? 1 : (max - min) / quantidade;
        var contagens = new Array(quantidade).fill(0);
        amostras.forEach(function (valor) { contagens[Math.min(quantidade - 1, Math.floor((valor - min) / largura))] += 1; });
        var faixas = contagens.map(function (_, index) {
            var inicio = min + index * largura;
            var fim = index === quantidade - 1 ? max : inicio + largura;
            return contexto.formatar(inicio, 'decimal') + ' - ' + contexto.formatar(fim, 'decimal');
        });
        return Object.assign({}, contexto.base, {
            tooltip: Object.assign({}, contexto.base.tooltip, { trigger: 'axis', valueFormatter: function (valor) { return contexto.formatar(valor, 'integer'); } }),
            xAxis: { type: 'category', data: faixas, axisLabel: { hideOverlap: true, rotate: contexto.compacto ? 28 : 0 } },
            yAxis: { type: 'value', minInterval: 1, name: contexto.compacto ? '' : 'Frequencia' },
            series: [{ name: 'Frequencia', type: 'bar', barCategoryGap: '2%', data: contagens, itemStyle: { color: contexto.paleta[0] }, label: { show: !contexto.compacto, position: 'top' } }]
        });
    }

    function renderizarBullet(contexto) {
        var realizado = contexto.dados.series[0];
        var meta = contexto.dados.series[1];
        var metas = meta ? meta.valores.map(numero) : realizado.valores.map(function (valor) { return Math.max(1, numero(valor)); });
        var limite = Math.max.apply(null, realizado.valores.concat(metas).map(numero)) * 1.12;
        return Object.assign({}, contexto.base, {
            tooltip: Object.assign({}, contexto.base.tooltip, { trigger: 'axis' }),
            legend: { show: !contexto.compacto, data: [realizado.nome, meta ? meta.nome : 'Referencia'], textStyle: { color: contexto.textoGrafico } },
            grid: { left: 12, right: 16, top: contexto.compacto ? 8 : 34, bottom: 8, containLabel: true },
            xAxis: { type: 'value', max: limite, splitLine: { lineStyle: { color: 'rgba(120,130,145,0.14)' } }, axisLabel: { formatter: function (valor) { return contexto.formatar(valor, realizado.formato); } } },
            yAxis: { type: 'category', inverse: true, data: contexto.dados.categorias, axisLabel: { hideOverlap: true } },
            series: [
                { name: realizado.nome, type: 'bar', data: realizado.valores, barWidth: contexto.compacto ? 10 : 16, showBackground: true, backgroundStyle: { color: 'rgba(120,130,145,0.16)', borderRadius: 4 }, itemStyle: { color: contexto.paleta[0], borderRadius: 4 }, label: { show: !contexto.compacto, position: 'insideLeft', formatter: function (params) { return contexto.formatar(params.value, realizado.formato); }, color: '#fff' } },
                { name: meta ? meta.nome : 'Referencia', type: 'scatter', data: metas.map(function (valor, index) { return [valor, index]; }), symbol: 'rect', symbolSize: [4, contexto.compacto ? 17 : 24], itemStyle: { color: contexto.paleta[4] || '#B8563F' }, z: 4 }
            ]
        });
    }

    function renderizarRanking(contexto) {
        var principal = contexto.dados.series[0];
        var indices = contexto.dados.categorias.map(function (_, index) { return index; })
            .sort(function (a, b) { return numero(principal.valores[b]) - numero(principal.valores[a]); })
            .slice(0, contexto.compacto ? 8 : 15);
        var categorias = indices.map(function (index, posicao) { return (posicao + 1) + '. ' + contexto.dados.categorias[index]; });
        return Object.assign({}, contexto.base, {
            grid: { left: 8, right: contexto.compacto ? 8 : 24, top: 8, bottom: 8, containLabel: true },
            tooltip: Object.assign({}, contexto.base.tooltip, { trigger: 'axis' }),
            xAxis: { type: 'value', splitLine: { lineStyle: { color: 'rgba(120,130,145,0.14)' } }, axisLabel: { formatter: function (valor) { return contexto.formatar(valor, principal.formato); } } },
            yAxis: { type: 'category', inverse: true, data: categorias, axisTick: { show: false }, axisLabel: { hideOverlap: true, width: Math.max(80, Math.round((contexto.container.clientWidth || 480) * 0.32)), overflow: 'truncate' } },
            series: contexto.dados.series.map(function (serie, serieIndex) {
                return {
                    name: serie.nome,
                    type: 'bar',
                    data: indices.map(function (index) { return serie.valores[index]; }),
                    barMaxWidth: contexto.compacto ? 18 : 28,
                    itemStyle: { color: function (params) { return contexto.paleta[(params.dataIndex + serieIndex) % contexto.paleta.length]; }, borderRadius: [0, 4, 4, 0] },
                    label: { show: !contexto.compacto, position: 'right', formatter: function (params) { return contexto.formatar(params.value, serie.formato); }, color: contexto.textoGrafico },
                    emphasis: { focus: 'series' }
                };
            })
        });
    }

    function renderizarSparkline(contexto) {
        return Object.assign({}, contexto.base, {
            legend: { show: false },
            grid: { left: 3, right: 3, top: 8, bottom: 3, containLabel: false },
            tooltip: Object.assign({}, contexto.base.tooltip, { trigger: 'axis' }),
            xAxis: { type: 'category', show: false, boundaryGap: false, data: contexto.dados.categorias },
            yAxis: { type: 'value', show: false, scale: true },
            series: contexto.dados.series.map(function (serie, index) {
                return {
                    name: serie.nome,
                    type: 'line',
                    data: serie.valores,
                    smooth: true,
                    showSymbol: false,
                    lineStyle: { width: index === 0 ? 3 : 1.5, color: contexto.paleta[index % contexto.paleta.length] },
                    areaStyle: index === 0 ? { opacity: 0.12, color: contexto.paleta[0] } : undefined,
                    emphasis: { focus: 'series' }
                };
            })
        });
    }

    function normalizarData(valor, index) {
        var texto = String(valor || '');
        var iso = /^\d{4}-\d{2}-\d{2}/.exec(texto);
        if (iso) return iso[0];
        var base = new Date(new Date().getFullYear(), 0, 1 + index);
        return base.toISOString().slice(0, 10);
    }

    function renderizarCalendario(contexto) {
        var serie = contexto.dados.series[0];
        var pontos = contexto.dados.categorias.map(function (categoria, index) { return [normalizarData(categoria, index), numero(serie.valores[index])]; });
        var extensao = limiteVisual(serie.valores);
        var inicio = pontos[0][0];
        var fim = pontos[pontos.length - 1][0];
        return Object.assign({}, contexto.base, {
            tooltip: Object.assign({}, contexto.base.tooltip, { trigger: 'item', formatter: function (params) { return params.value[0] + ': ' + contexto.formatar(params.value[1], serie.formato); } }),
            visualMap: { min: extensao.min, max: extensao.max, calculable: !contexto.compacto, orient: 'horizontal', left: 'center', bottom: 0, textStyle: { color: contexto.textoGrafico }, inRange: { color: [contexto.paleta[3] || '#D9E8EE', contexto.paleta[1] || '#4E8FB8', contexto.paleta[0] || '#123865'] } },
            calendar: { top: contexto.compacto ? 24 : 36, left: contexto.compacto ? 24 : 42, right: 12, bottom: contexto.compacto ? 24 : 38, range: [inicio, fim], cellSize: ['auto', contexto.compacto ? 12 : 18], splitLine: { show: false }, itemStyle: { borderWidth: 2, borderColor: 'rgba(255,255,255,0.72)' }, yearLabel: { show: false }, dayLabel: { color: contexto.textoGrafico }, monthLabel: { color: contexto.textoGrafico } },
            series: [{ name: serie.nome, type: 'heatmap', coordinateSystem: 'calendar', data: pontos }]
        });
    }

    window.CRM_CHART_RENDERERS = Object.freeze({
        heatmap: function (contexto) { return renderizarMatriz(contexto, false); },
        cohort: function (contexto) { return renderizarMatriz(contexto, true); },
        scatter: function (contexto) { return renderizarDispersao(contexto, false); },
        bubble: function (contexto) { return renderizarDispersao(contexto, true); },
        waterfall: renderizarCascata,
        histogram: renderizarHistograma,
        bullet: renderizarBullet,
        ranking: renderizarRanking,
        sparkline: renderizarSparkline,
        calendar: renderizarCalendario
    });
})();
