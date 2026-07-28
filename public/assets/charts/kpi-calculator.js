(function (global) {
    'use strict';

    function criarErro(mensagem) {
        var erro = new Error(mensagem);
        erro.name = 'KpiFormulaError';
        return erro;
    }

    function tokenizar(formula) {
        var texto = String(formula || '');
        var tokens = [];
        var indice = 0;

        while (indice < texto.length) {
            var caractere = texto[indice];
            if (/\s/.test(caractere)) {
                indice += 1;
                continue;
            }
            if ('+-*/^()'.indexOf(caractere) >= 0) {
                tokens.push({ tipo: caractere, valor: caractere });
                indice += 1;
                continue;
            }
            if (caractere === '[') {
                var fim = texto.indexOf(']', indice + 1);
                if (fim < 0) throw criarErro('Feche a referencia do indicador com ].');
                var referencia = texto.slice(indice + 1, fim).trim();
                if (!referencia) throw criarErro('A referencia do indicador esta vazia.');
                tokens.push({ tipo: 'referencia', valor: referencia });
                indice = fim + 1;
                continue;
            }
            if (/\d|[.,]/.test(caractere)) {
                var restante = texto.slice(indice);
                var correspondencia = restante.match(/^(?:\d+(?:[.,]\d+)?|[.,]\d+)/);
                if (!correspondencia) throw criarErro('Numero invalido na formula.');
                var numero = Number(correspondencia[0].replace(',', '.'));
                if (!Number.isFinite(numero)) throw criarErro('Numero invalido na formula.');
                tokens.push({ tipo: 'numero', valor: numero });
                indice += correspondencia[0].length;
                continue;
            }
            throw criarErro('Use somente numeros, referencias e os operadores +, -, *, / e ^.');
        }

        tokens.push({ tipo: 'fim' });
        return tokens;
    }

    function extrairReferencias(formula) {
        var referencias = [];
        tokenizar(formula).forEach(function (token) {
            if (token.tipo === 'referencia' && referencias.indexOf(token.valor) < 0) referencias.push(token.valor);
        });
        return referencias;
    }

    function avaliar(formula, valores) {
        var tokens = tokenizar(formula);
        var indice = 0;
        var mapa = valores || {};

        function atual() {
            return tokens[indice];
        }

        function consumir(tipo) {
            if (atual().tipo !== tipo) throw criarErro('Formula incompleta ou com parenteses invalidos.');
            var token = atual();
            indice += 1;
            return token;
        }

        function primario() {
            if (atual().tipo === 'numero') return consumir('numero').valor;
            if (atual().tipo === 'referencia') {
                var referencia = consumir('referencia').valor;
                if (!Object.prototype.hasOwnProperty.call(mapa, referencia)) {
                    throw criarErro('Indicador nao encontrado: ' + referencia + '.');
                }
                var valor = Number(mapa[referencia]);
                if (!Number.isFinite(valor)) throw criarErro('O indicador ' + referencia + ' nao possui valor numerico.');
                return valor;
            }
            if (atual().tipo === '(') {
                consumir('(');
                var resultado = expressao();
                consumir(')');
                return resultado;
            }
            throw criarErro('Informe um numero, um indicador ou uma expressao entre parenteses.');
        }

        function unario() {
            if (atual().tipo === '+') {
                consumir('+');
                return unario();
            }
            if (atual().tipo === '-') {
                consumir('-');
                return -unario();
            }
            return primario();
        }

        function potencia() {
            var resultado = unario();
            if (atual().tipo === '^') {
                consumir('^');
                resultado = Math.pow(resultado, potencia());
            }
            return resultado;
        }

        function termo() {
            var resultado = potencia();
            while (atual().tipo === '*' || atual().tipo === '/') {
                var operador = atual().tipo;
                consumir(operador);
                var divisor = potencia();
                if (operador === '/' && divisor === 0) throw criarErro('Nao e possivel dividir por zero.');
                resultado = operador === '*' ? resultado * divisor : resultado / divisor;
            }
            return resultado;
        }

        function expressao() {
            var resultado = termo();
            while (atual().tipo === '+' || atual().tipo === '-') {
                var operador = atual().tipo;
                consumir(operador);
                resultado = operador === '+' ? resultado + termo() : resultado - termo();
            }
            return resultado;
        }

        if (!String(formula || '').trim()) throw criarErro('Informe a formula do indicador.');
        var resultado = expressao();
        if (atual().tipo !== 'fim') throw criarErro('Revise a formula a partir de "' + atual().valor + '".');
        if (!Number.isFinite(resultado)) throw criarErro('A formula nao gerou um resultado numerico valido.');
        return resultado;
    }

    global.CRM_KPI_CALCULATOR = {
        avaliar: avaliar,
        extrairReferencias: extrairReferencias
    };
}(window));
