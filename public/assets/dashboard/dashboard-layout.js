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

    global.CRM_DASHBOARD_LAYOUT = Object.freeze({
        categorias,
        normalizarCategoriasPermitidas,
        widgetVisivelParaCategoria,
        ajustarLargurasDireita,
        ajustarAlturasAbaixo
    });
})(window);
