(function () {
    const STORAGE_KEY = 'crmTemaFilial';

    function getUsuarioLogado() {
        try {
            return JSON.parse(sessionStorage.getItem('usuarioLogado') || '{}') || {};
        } catch (error) {
            return {};
        }
    }

    const usuario = getUsuarioLogado();
    const filial = String(usuario.idfilial || '').trim().toUpperCase();

    const cssVars = {
        verdeEscuro: ['--verde-escuro'],
        verdeMedio: ['--verde-medio'],
        verdeClaro: ['--verde-claro'],
        fundo: ['--fundo', '--cinza-suave'],
        painel: ['--painel'],
        linha: ['--linha', '--borda'],
        texto: ['--texto'],
        muted: ['--muted'],
        madeira: ['--madeira'],
        dourado: ['--dourado', '--premium-gold'],
        sidebarStart: ['--sidebar-start'],
        sidebarEnd: ['--sidebar-end'],
        accent: ['--accent']
    };

    function aplicarTema(themeName, theme) {
        if (!theme) return;
        document.body.dataset.theme = themeName;
        document.body.dataset.brandName = theme.label || themeName;
        sessionStorage.setItem(STORAGE_KEY, JSON.stringify({ themeName, theme }));

        Object.entries(theme.colors || {}).forEach(([key, value]) => {
            (cssVars[key] || []).forEach(cssVar => document.documentElement.style.setProperty(cssVar, value));
        });

        if (theme.logoUrl) {
            document.querySelectorAll('[data-brand-logo], #brand-logo, .crm-brand img').forEach(img => {
                img.src = theme.logoUrl;
            });
        }
    }

    function aplicarTemaSalvo() {
        try {
            const saved = JSON.parse(sessionStorage.getItem(STORAGE_KEY) || 'null');
            if (saved?.theme) aplicarTema(saved.themeName, saved.theme);
        } catch (error) {
            sessionStorage.removeItem(STORAGE_KEY);
        }
    }

    aplicarTemaSalvo();

    fetch('filial-themes.json', { cache: 'no-store' })
        .then(response => response.ok ? response.json() : null)
        .then(config => {
            if (!config) return;
            const branchTheme = filial ? config.branches?.[filial] : null;
            const themeName = branchTheme || config.defaultTheme || 'casaterrazi';
            aplicarTema(themeName, config.themes?.[themeName]);
        })
        .catch(() => aplicarTemaSalvo());
})();
