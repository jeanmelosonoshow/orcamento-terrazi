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

    global.CRM_DASHBOARD_LAYOUT = Object.freeze({
        categorias,
        normalizarCategoriasPermitidas,
        widgetVisivelParaCategoria,
        ajustarLargurasDireita
    });
})(window);
