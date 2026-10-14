(function registrarCompatibilidadePowerBi() {
    'use strict';

    var equivalencias = Object.freeze({
        kpi: 'card',
        'kpi-target': 'kpi',
        'kpi-calculated': 'card',
        bar: 'clustered-column-chart',
        'horizontal-bar': 'clustered-bar-chart',
        'grouped-bar': 'clustered-column-chart',
        'stacked-bar': 'stacked-column-chart',
        'stacked-100': '100-percent-stacked-column-chart',
        line: 'line-chart',
        'step-line': 'line-chart',
        area: 'area-chart',
        combo: 'line-and-clustered-column-chart',
        pareto: 'line-and-clustered-column-chart',
        pie: 'pie-chart',
        donut: 'donut-chart',
        gauge: 'gauge',
        funnel: 'funnel',
        treemap: 'treemap',
        waterfall: 'waterfall-chart',
        scatter: 'scatter-chart',
        bubble: 'scatter-chart',
        table: 'table',
        pivot: 'matrix',
        bullet: 'kpi',
        ranking: 'clustered-bar-chart',
        sparkline: 'line-chart',
        histogram: 'column-chart',
        heatmap: 'matrix-custom-visual',
        cohort: 'matrix-custom-visual',
        calendar: 'calendar-custom-visual',
        'radial-bar': 'radial-bar-custom-visual'
    });

    function mapearComponente(componente, transformacao) {
        if (Array.isArray(componente)) return componente.map(transformacao);
        return componente ? transformacao(componente) : componente;
    }

    function aplicarEixo(eixo, cores) {
        return Object.assign({}, eixo, {
            axisLine: Object.assign({}, eixo.axisLine, { lineStyle: Object.assign({}, eixo.axisLine && eixo.axisLine.lineStyle, { color: cores.eixo }) }),
            axisTick: Object.assign({}, eixo.axisTick, { lineStyle: Object.assign({}, eixo.axisTick && eixo.axisTick.lineStyle, { color: cores.eixo }) }),
            axisLabel: Object.assign({}, eixo.axisLabel, { color: cores.textoSuave, fontSize: 11, fontFamily: 'Segoe UI, Inter, Arial, sans-serif' }),
            splitLine: Object.assign({}, eixo.splitLine, { lineStyle: Object.assign({}, eixo.splitLine && eixo.splitLine.lineStyle, { color: cores.grade, type: 'solid' }) }),
            nameTextStyle: Object.assign({}, eixo.nameTextStyle, { color: cores.textoSuave, fontSize: 11 })
        });
    }

    function aplicarSerie(serie, cores) {
        var atualizada = Object.assign({}, serie, {
            emphasis: Object.assign({ focus: 'series' }, serie.emphasis)
        });
        if (serie.type === 'bar') {
            atualizada.barMaxWidth = serie.barMaxWidth || 46;
            atualizada.itemStyle = Object.assign({ borderRadius: 2 }, serie.itemStyle);
        }
        if (serie.type === 'line') {
            atualizada.showSymbol = serie.showSymbol !== false;
            atualizada.symbol = serie.symbol || 'circle';
            atualizada.symbolSize = serie.symbolSize || 6;
            atualizada.lineStyle = Object.assign({ width: 2.5 }, serie.lineStyle);
        }
        if (serie.type === 'pie') {
            atualizada.padAngle = serie.padAngle == null ? 1.2 : serie.padAngle;
            atualizada.itemStyle = Object.assign({ borderColor: cores.superficie, borderWidth: 2 }, serie.itemStyle);
        }
        if (serie.type === 'scatter') {
            atualizada.itemStyle = Object.assign({ borderColor: cores.superficie, borderWidth: 1, opacity: 0.9 }, serie.itemStyle);
        }
        if (serie.type === 'funnel') {
            atualizada.gap = serie.gap == null ? 3 : serie.gap;
            atualizada.itemStyle = Object.assign({ borderColor: cores.superficie, borderWidth: 2 }, serie.itemStyle);
        }
        if (serie.type === 'gauge') {
            atualizada.axisLine = Object.assign({}, serie.axisLine, { lineStyle: Object.assign({ color: [[1, cores.gradeForte]] }, serie.axisLine && serie.axisLine.lineStyle) });
            atualizada.pointer = Object.assign({ itemStyle: { color: cores.texto } }, serie.pointer);
            atualizada.detail = Object.assign({ color: cores.texto, fontFamily: 'Segoe UI, Inter, Arial, sans-serif' }, serie.detail);
        }
        if (serie.type === 'treemap') {
            atualizada.itemStyle = Object.assign({ borderColor: cores.superficie, borderWidth: 2, gapWidth: 2 }, serie.itemStyle);
        }
        return atualizada;
    }

    function aplicar(opcao, contexto) {
        var escuro = Boolean(contexto && contexto.escuro);
        var paletaPowerBi = ['#118DFF', '#12239E', '#E66C37', '#6B007B', '#E044A7', '#744EC2', '#D9B300', '#D64550', '#197278', '#1AAB40'];
        var cores = escuro
            ? { superficie: '#19232E', tooltip: '#202C38', texto: '#F1F4F7', textoSuave: '#B9C3CE', eixo: '#596978', grade: 'rgba(185,195,206,0.16)', gradeForte: '#334250' }
            : { superficie: '#FFFFFF', tooltip: '#FFFFFF', texto: '#252423', textoSuave: '#605E5C', eixo: '#C8C6C4', grade: 'rgba(96,94,92,0.14)', gradeForte: '#E1DFDD' };
        var resultado = Object.assign({}, opcao, {
            color: paletaPowerBi,
            aria: Object.assign({ enabled: true, show: true }, opcao.aria),
            textStyle: Object.assign({}, opcao.textStyle, {
                color: cores.texto,
                fontFamily: 'Segoe UI, Inter, Arial, sans-serif',
                fontSize: 11
            }),
            tooltip: Object.assign({}, opcao.tooltip, {
                confine: true,
                backgroundColor: cores.tooltip,
                borderColor: cores.eixo,
                borderWidth: 1,
                padding: [9, 11],
                textStyle: Object.assign({}, opcao.tooltip && opcao.tooltip.textStyle, { color: cores.texto, fontSize: 12 }),
                extraCssText: 'box-shadow:0 4px 14px rgba(0,0,0,.18);border-radius:2px;'
            })
        });

        if (resultado.legend) {
            resultado.legend = Object.assign({}, resultado.legend, {
                itemWidth: 10,
                itemHeight: 10,
                itemGap: 14,
                icon: 'circle',
                textStyle: Object.assign({}, resultado.legend.textStyle, { color: cores.textoSuave, fontSize: 11 })
            });
        }
        if (resultado.grid && !Array.isArray(resultado.grid)) {
            resultado.grid = Object.assign({ containLabel: true }, resultado.grid);
        }
        resultado.xAxis = mapearComponente(resultado.xAxis, function (eixo) { return aplicarEixo(eixo, cores); });
        resultado.yAxis = mapearComponente(resultado.yAxis, function (eixo) { return aplicarEixo(eixo, cores); });
        resultado.series = (resultado.series || []).map(function (serie) { return aplicarSerie(serie, cores); });
        return resultado;
    }

    window.CRM_POWERBI_COMPAT = Object.freeze({
        versao: 'powerbi-v1',
        equivalencias: equivalencias,
        obterEquivalente: function (tipo) { return equivalencias[tipo] || 'custom-visual'; },
        aplicar: aplicar
    });
})();
