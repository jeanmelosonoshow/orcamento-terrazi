(function iniciarDashboardLayout(global) {
    const categorias = Object.freeze([
        { codigo: 'DI', nome: 'Diretor' },
        { codigo: 'SU', nome: 'Supervisor' },
        { codigo: 'GR', nome: 'Gerente' },
        { codigo: 'VD', nome: 'Vendedor' },
        { codigo: 'CX', nome: 'Caixa' }
    ]);
    const codigos = new Set(categorias.map(item => item.codigo));

    function normalizarCategoriasPermitidas(valor) {
        if (!Array.isArray(valor)) return categorias.map(item => item.codigo);
        return Array.from(new Set(
            valor
                .map(item => String(item || '').trim().toUpperCase())
                .filter(item => codigos.has(item))
        ));
    }

    function widgetVisivelParaCategoria(widget, categoria) {
        const permitidas = normalizarCategoriasPermitidas(widget?.categoriasPermitidas);
        return permitidas.includes(String(categoria || '').trim().toUpperCase());
    }

    function faixasVerticaisSeSobrepoem(a, b) {
        return a.y < b.y + b.h && a.y + a.h > b.y;
    }

    function faixasHorizontaisSeSobrepoem(a, b) {
        return a.x < b.x + b.w && a.x + a.w > b.x;
    }

    function ajustarLargurasDireita(layouts, larguraCanvas, opcoes = {}) {
        const margemDireita = Math.max(0, Number(opcoes.margemDireita) || 12);
        const espacoEntreCards = Math.max(0, Number(opcoes.espacoEntreCards) || 12);
        const larguraMinima = Math.max(1, Number(opcoes.larguraMinima) || 260);
        const limiteCanvas = Math.max(larguraMinima, Number(larguraCanvas) || larguraMinima);
        const bases = (Array.isArray(layouts) ? layouts : []).map(layout => ({
            ...layout,
            x: Math.max(0, Number(layout.x) || 0),
            y: Math.max(0, Number(layout.y) || 0),
            w: Math.max(larguraMinima, Number(layout.w) || larguraMinima),
            h: Math.max(1, Number(layout.h) || 1)
        }));

        return bases.map(atual => {
            const proximoX = bases.reduce((limite, outro) => {
                if (outro.id === atual.id || outro.x <= atual.x || !faixasVerticaisSeSobrepoem(atual, outro)) {
                    return limite;
                }
                return Math.min(limite, outro.x - espacoEntreCards);
            }, limiteCanvas - margemDireita);
            const larguraDisponivel = Math.max(larguraMinima, proximoX - atual.x);
            const larguraAteCanvas = Math.max(larguraMinima, limiteCanvas - margemDireita - atual.x);
            return {
                ...atual,
                w: Math.min(Math.max(atual.w, larguraDisponivel), larguraAteCanvas)
            };
        });
    }

    function ajustarAlturasAbaixo(layouts, alturaCanvas, opcoes = {}) {
        const margemInferior = Math.max(0, Number(opcoes.margemInferior) || 12);
        const espacoEntreCards = Math.max(0, Number(opcoes.espacoEntreCards) || 12);
        const alturaMinima = Math.max(1, Number(opcoes.alturaMinima) || 180);
        const limiteCanvas = Math.max(alturaMinima, Number(alturaCanvas) || alturaMinima);
        const bases = (Array.isArray(layouts) ? layouts : []).map(layout => ({
            ...layout,
            x: Math.max(0, Number(layout.x) || 0),
            y: Math.max(0, Number(layout.y) || 0),
            w: Math.max(1, Number(layout.w) || 1),
            h: Math.max(alturaMinima, Number(layout.h) || alturaMinima)
        }));

        return bases.map(atual => {
            const proximoY = bases.reduce((limite, outro) => {
                if (outro.id === atual.id || outro.y <= atual.y || !faixasHorizontaisSeSobrepoem(atual, outro)) {
                    return limite;
                }
                return Math.min(limite, outro.y - espacoEntreCards);
            }, limiteCanvas - margemInferior);
            const alturaDisponivel = Math.max(alturaMinima, proximoY - atual.y);
            const alturaAteCanvas = Math.max(alturaMinima, limiteCanvas - margemInferior - atual.y);
            return {
                ...atual,
                h: Math.min(Math.max(atual.h, alturaDisponivel), alturaAteCanvas)
            };
        });
    }

    function ordenarPorLeitura(layouts, opcoes = {}) {
        const toleranciaLinha = Math.max(0, Number(opcoes.toleranciaLinha) || 32);
        const ordenados = (Array.isArray(layouts) ? layouts : []).map((layout, indice) => ({
            ...layout,
            x: Math.max(0, Number(layout.x) || 0),
            y: Math.max(0, Number(layout.y) || 0),
            indiceOriginal: indice
        })).sort((a, b) => (a.y - b.y) || (a.x - b.x) || (a.indiceOriginal - b.indiceOriginal));
        const linhas = [];

        ordenados.forEach(layout => {
            const linha = linhas.find(item => Math.abs(layout.y - item.yReferencia) <= toleranciaLinha);
            if (linha) {
                linha.itens.push(layout);
                linha.yReferencia = Math.min(linha.yReferencia, layout.y);
                return;
            }
            linhas.push({ yReferencia: layout.y, itens: [layout] });
        });

        return linhas
            .sort((a, b) => a.yReferencia - b.yReferencia)
            .flatMap(linha => linha.itens.sort((a, b) => (a.x - b.x) || (a.y - b.y) || (a.indiceOriginal - b.indiceOriginal)))
            .map(({ indiceOriginal, ...layout }) => layout);
    }

    function ajustarLayoutEditor(layout, outrosLayouts, opcoes = {}) {
        const operacao = opcoes.operacao === 'resize' ? 'resize' : 'move';
        const grade = Math.max(1, Number(opcoes.grade) || 24);
        const tolerancia = Math.max(0, Number(opcoes.tolerancia) || 10);
        const espacamento = Math.max(0, Number(opcoes.espacamento) || 12);
        const larguraMinima = Math.max(1, Number(opcoes.larguraMinima) || 260);
        const alturaMinima = Math.max(1, Number(opcoes.alturaMinima) || 180);
        const larguraCanvas = Math.max(larguraMinima, Number(opcoes.larguraCanvas) || larguraMinima);
        const livre = opcoes.livre === true;
        const outros = (Array.isArray(outrosLayouts) ? outrosLayouts : []).map(item => ({
            x: Math.max(0, Number(item.x) || 0),
            y: Math.max(0, Number(item.y) || 0),
            w: Math.max(1, Number(item.w) || 1),
            h: Math.max(1, Number(item.h) || 1)
        }));
        const bruto = {
            x: Math.max(0, Number(layout?.x) || 0),
            y: Math.max(0, Number(layout?.y) || 0),
            w: Math.max(larguraMinima, Number(layout?.w) || larguraMinima),
            h: Math.max(alturaMinima, Number(layout?.h) || alturaMinima)
        };
        const encaixarGrade = valor => livre ? valor : Math.round(valor / grade) * grade;
        const melhorCandidato = (valor, candidatos) => {
            if (livre) return null;
            return candidatos.reduce((melhor, candidato) => {
                const distancia = Math.abs(valor - candidato.valor);
                if (distancia > tolerancia || (melhor && distancia >= melhor.distancia)) return melhor;
                return { ...candidato, distancia };
            }, null);
        };
        const resultado = { ...bruto };
        let guiaX = null;
        let guiaY = null;
        const correspondencias = [];

        if (operacao === 'move') {
            resultado.x = encaixarGrade(bruto.x);
            resultado.y = encaixarGrade(bruto.y);
            const candidatosX = outros.flatMap(outro => [
                { valor: outro.x, guia: outro.x, descricao: 'bordas esquerdas alinhadas' },
                { valor: outro.x + outro.w - bruto.w, guia: outro.x + outro.w, descricao: 'bordas direitas alinhadas' },
                { valor: outro.x + (outro.w - bruto.w) / 2, guia: outro.x + outro.w / 2, descricao: 'centros alinhados' },
                { valor: outro.x + outro.w + espacamento, guia: outro.x + outro.w + espacamento, descricao: `espaço de ${espacamento}px` },
                { valor: outro.x - bruto.w - espacamento, guia: outro.x - espacamento, descricao: `espaço de ${espacamento}px` }
            ]);
            const candidatosY = outros.flatMap(outro => [
                { valor: outro.y, guia: outro.y, descricao: 'topos alinhados' },
                { valor: outro.y + outro.h - bruto.h, guia: outro.y + outro.h, descricao: 'bases alinhadas' },
                { valor: outro.y + (outro.h - bruto.h) / 2, guia: outro.y + outro.h / 2, descricao: 'centros alinhados' },
                { valor: outro.y + outro.h + espacamento, guia: outro.y + outro.h + espacamento, descricao: `espaço de ${espacamento}px` },
                { valor: outro.y - bruto.h - espacamento, guia: outro.y - espacamento, descricao: `espaço de ${espacamento}px` }
            ]);
            const ajusteX = melhorCandidato(bruto.x, candidatosX);
            const ajusteY = melhorCandidato(bruto.y, candidatosY);
            if (ajusteX) {
                resultado.x = ajusteX.valor;
                guiaX = ajusteX.guia;
                correspondencias.push(ajusteX.descricao);
            }
            if (ajusteY) {
                resultado.y = ajusteY.valor;
                guiaY = ajusteY.guia;
                correspondencias.push(ajusteY.descricao);
            }
            resultado.x = Math.max(0, Math.min(resultado.x, larguraCanvas - resultado.w));
            resultado.y = Math.max(0, resultado.y);
        } else {
            resultado.w = encaixarGrade(bruto.w);
            resultado.h = encaixarGrade(bruto.h);
            const candidatosW = outros.flatMap(outro => [
                { valor: outro.w, guia: bruto.x + outro.w, descricao: 'mesma largura' },
                { valor: outro.x - bruto.x, guia: outro.x, descricao: 'lateral alinhada' },
                { valor: outro.x + outro.w - bruto.x, guia: outro.x + outro.w, descricao: 'lateral alinhada' }
            ]);
            const candidatosH = outros.flatMap(outro => [
                { valor: outro.h, guia: bruto.y + outro.h, descricao: 'mesma altura' },
                { valor: outro.y - bruto.y, guia: outro.y, descricao: 'base alinhada' },
                { valor: outro.y + outro.h - bruto.y, guia: outro.y + outro.h, descricao: 'base alinhada' }
            ]);
            const ajusteW = melhorCandidato(bruto.w, candidatosW);
            const ajusteH = melhorCandidato(bruto.h, candidatosH);
            if (ajusteW) {
                resultado.w = ajusteW.valor;
                guiaX = ajusteW.guia;
                correspondencias.push(ajusteW.descricao);
            }
            if (ajusteH) {
                resultado.h = ajusteH.valor;
                guiaY = ajusteH.guia;
                correspondencias.push(ajusteH.descricao);
            }
            resultado.w = Math.max(larguraMinima, Math.min(resultado.w, larguraCanvas - bruto.x));
            resultado.h = Math.max(alturaMinima, resultado.h);
        }

        const sobrepoe = outros.some(outro => (
            resultado.x < outro.x + outro.w
            && resultado.x + resultado.w > outro.x
            && resultado.y < outro.y + outro.h
            && resultado.y + resultado.h > outro.y
        ));
        return {
            layout: resultado,
            guias: { x: guiaX, y: guiaY },
            correspondencias: Array.from(new Set(correspondencias)),
            sobrepoe
        };
    }

    global.CRM_DASHBOARD_LAYOUT = Object.freeze({
        categorias,
        normalizarCategoriasPermitidas,
        widgetVisivelParaCategoria,
        ajustarLargurasDireita,
        ajustarAlturasAbaixo,
        ordenarPorLeitura,
        ajustarLayoutEditor
    });
})(window);
