(function () {
    'use strict';

    const STORAGE_KEY = 'terrazziColorMode';
    const LIGHT = 'light';
    const DARK = 'dark';
    const DARK_SURFACES = Object.freeze({
        '--fundo': '#0D1411',
        '--painel': '#151E1A',
        '--cinza-suave': '#101815',
        '--linha': '#314039',
        '--borda': '#314039',
        '--texto': '#EDF4EF',
        '--text': '#EDF4EF',
        '--muted': '#A8B6AD'
    });
    const lightSurfaceValues = new Map();

    function normalizarModo(value) {
        return value === DARK ? DARK : LIGHT;
    }

    function lerModoSalvo() {
        try {
            return normalizarModo(localStorage.getItem(STORAGE_KEY));
        } catch (error) {
            return LIGHT;
        }
    }

    function iconeSol() {
        return '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="4"></circle><path d="M12 2v2M12 20v2M4.93 4.93l1.42 1.42M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.42-1.42M17.66 6.34l1.41-1.41"></path></svg>';
    }

    function iconeLua() {
        return '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20.4 14.7A8.5 8.5 0 0 1 9.3 3.6 8.5 8.5 0 1 0 20.4 14.7Z"></path></svg>';
    }

    function atualizarControle(modo) {
        const botao = document.querySelector('[data-color-mode-toggle]');
        if (!botao) return;
        const escuro = modo === DARK;
        const proximo = escuro ? 'claro' : 'escuro';
        botao.innerHTML = escuro ? iconeSol() : iconeLua();
        botao.setAttribute('aria-label', `Ativar tema ${proximo}`);
        botao.setAttribute('title', `Ativar tema ${proximo}`);
        botao.setAttribute('aria-pressed', String(escuro));
        botao.dataset.activeMode = modo;
    }

    function aplicarSuperficies(modo) {
        const style = document.documentElement.style;
        Object.entries(DARK_SURFACES).forEach(([property, darkValue]) => {
            if (modo === DARK) {
                const current = style.getPropertyValue(property).trim();
                if (current && current.toUpperCase() !== darkValue) lightSurfaceValues.set(property, current);
                style.setProperty(property, darkValue);
                return;
            }

            if (lightSurfaceValues.has(property)) style.setProperty(property, lightSurfaceValues.get(property));
            else style.removeProperty(property);
        });
    }

    function aplicarModo(value, options = {}) {
        const modo = normalizarModo(value);
        document.documentElement.dataset.colorMode = modo;
        document.documentElement.style.colorScheme = modo;
        aplicarSuperficies(modo);

        if (options.persistir) {
            try {
                localStorage.setItem(STORAGE_KEY, modo);
            } catch (error) {
                // A interface continua funcionando quando o armazenamento e bloqueado.
            }
        }

        atualizarControle(modo);
        if (options.notificar !== false && document.body) {
            window.dispatchEvent(new CustomEvent('appcolormodechange', { detail: { mode: modo } }));
        }
        return modo;
    }

    function criarControle() {
        if (!document.body || document.querySelector('[data-color-mode-toggle]')) return;
        const botao = document.createElement('button');
        botao.type = 'button';
        botao.className = 'app-color-mode-toggle';
        botao.dataset.colorModeToggle = '';
        botao.addEventListener('click', () => {
            const atual = normalizarModo(document.documentElement.dataset.colorMode);
            aplicarModo(atual === DARK ? LIGHT : DARK, { persistir: true });
        });
        document.body.appendChild(botao);
        atualizarControle(normalizarModo(document.documentElement.dataset.colorMode));
    }

    const modoInicial = aplicarModo(lerModoSalvo(), { notificar: false });
    window.AppColorMode = Object.freeze({
        storageKey: STORAGE_KEY,
        get: () => normalizarModo(document.documentElement.dataset.colorMode),
        set: modo => aplicarModo(modo, { persistir: true }),
        refresh: () => aplicarModo(document.documentElement.dataset.colorMode, { notificar: false })
    });

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', criarControle, { once: true });
    } else {
        criarControle();
    }

    window.addEventListener('storage', event => {
        if (event.key === STORAGE_KEY) aplicarModo(event.newValue || modoInicial);
    });
})();
