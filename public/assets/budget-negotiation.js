(function () {
    'use strict';

    let modal;
    let estado = { orcamentoId: null, onSaved: null, dados: null, initialStatus: null };

    function escapeHtml(valor) {
        return String(valor ?? '').replace(/[&<>'"]/g, caractere => ({
            '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;'
        })[caractere]);
    }

    function cabecalhos() {
        let usuario = {};
        try { usuario = JSON.parse(sessionStorage.getItem('usuarioLogado') || '{}'); } catch (error) {}
        return {
            'Content-Type': 'application/json',
            ...(usuario.sessionToken ? { Authorization: 'Bearer ' + usuario.sessionToken } : {})
        };
    }

    function formatarData(valor) {
        if (!valor) return 'Nao informado';
        return new Date(valor).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' });
    }

    function formatarDataSimples(valor) {
        if (!valor) return 'Sem validade';
        const data = String(valor).slice(0, 10).split('-');
        return data.length === 3 ? `${data[2]}/${data[1]}/${data[0]}` : String(valor);
    }

    function formatarMoeda(valor) {
        return Number(valor || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
    }

    function rotuloStatus(valor) {
        return ({
            'ORCAMENTO CRIADO': 'ORÇAMENTO CRIADO',
            'EM NEGOCIACAO': 'EM NEGOCIAÇÃO',
            LIGACAO: 'LIGAÇÃO'
        })[valor] || valor;
    }

    function renderizarLinhaSaida(saida = {}, desabilitada = false, obrigatoria = true) {
        return `
            <div class="budget-sale-row" data-budget-sale-row>
                <label>Filial da saída
                    <input name="idfilialsaida" type="text" maxlength="2" autocomplete="off" value="${escapeHtml(saida.idfilialsaida || '')}" ${obrigatoria ? 'required' : ''} ${desabilitada ? 'disabled' : ''}>
                </label>
                <label>Número da saída
                    <input name="numerosaida" type="number" min="1" step="1" inputmode="numeric" value="${escapeHtml(saida.numerosaida || '')}" ${obrigatoria ? 'required' : ''} ${desabilitada ? 'disabled' : ''}>
                </label>
                ${desabilitada ? '' : '<button type="button" class="budget-sale-remove" data-budget-remove-sale aria-label="Remover pedido" title="Remover pedido"><i class="fa-solid fa-trash" aria-hidden="true"></i></button>'}
            </div>`;
    }

    function obterSaidasFormulario(form) {
        return Array.from(form?.querySelectorAll('[data-budget-sale-row]') || []).map(linha => ({
            idfilialsaida: linha.querySelector('[name="idfilialsaida"]')?.value || '',
            numerosaida: linha.querySelector('[name="numerosaida"]')?.value || ''
        }));
    }

    function garantirModal() {
        if (modal) return modal;
        document.body.insertAdjacentHTML('beforeend', `
            <div class="budget-negotiation-modal" data-budget-negotiation-modal hidden>
                <div class="budget-negotiation-backdrop" data-budget-negotiation-close></div>
                <section class="budget-negotiation-panel" role="dialog" aria-modal="true" aria-labelledby="budgetNegotiationTitle">
                    <header class="budget-negotiation-head">
                        <div><span class="budget-negotiation-eyebrow">Funil de orçamentos</span><h2 id="budgetNegotiationTitle">Gestão da negociação</h2></div>
                        <button type="button" class="budget-negotiation-close" data-budget-negotiation-close aria-label="Fechar" title="Fechar">×</button>
                    </header>
                    <div data-budget-negotiation-content><div class="budget-negotiation-loading">Carregando negociacao...</div></div>
                </section>
            </div>`);
        modal = document.querySelector('[data-budget-negotiation-modal]');
        modal.addEventListener('click', evento => {
            if (evento.target.closest('[data-budget-negotiation-close]')) close();
            const adicionar = evento.target.closest('[data-budget-add-sale]');
            if (adicionar) {
                adicionar.closest('[data-budget-sale-fields]')?.querySelector('[data-budget-sale-rows]')
                    ?.insertAdjacentHTML('beforeend', renderizarLinhaSaida());
                return;
            }
            const remover = evento.target.closest('[data-budget-remove-sale]');
            if (remover) {
                const linha = remover.closest('[data-budget-sale-row]');
                const lista = linha?.parentElement;
                if (!linha || !lista) return;
                if (lista.querySelectorAll('[data-budget-sale-row]').length > 1) linha.remove();
                else linha.querySelectorAll('input').forEach(input => { input.value = ''; });
            }
        });
        modal.addEventListener('submit', tratarFormulario);
        modal.addEventListener('change', evento => {
            if (!evento.target.matches('[data-budget-negotiation-form] [name="status"]')) return;
            atualizarCamposCondicionais(evento.target.form, evento.target.value);
        });
        return modal;
    }

    function atualizarCampoMotivoRecusa(form, status) {
        const campo = form?.querySelector('[data-budget-rejection-reason]');
        const select = campo?.querySelector('select');
        const recusado = status === 'RECUSADO';
        if (campo) campo.hidden = !recusado;
        if (select) {
            select.required = recusado;
            if (!recusado) select.value = '';
        }
    }

    function atualizarCamposSaida(form, status) {
        const campos = form?.querySelector('[data-budget-sale-fields]');
        const lista = campos?.querySelector('[data-budget-sale-rows]');
        const gerouVenda = status === 'GEROU VENDA';
        if (campos) campos.hidden = !gerouVenda;
        if (lista && !lista.children.length) lista.innerHTML = renderizarLinhaSaida();
        const inputs = campos?.querySelectorAll('input') || [];
        inputs.forEach(input => {
            input.required = gerouVenda;
        });
        if (!gerouVenda && lista) lista.innerHTML = renderizarLinhaSaida({}, false, false);
    }

    function atualizarCamposCondicionais(form, status) {
        atualizarCampoMotivoRecusa(form, status);
        atualizarCamposSaida(form, status);
    }

    function renderizar(dados) {
        estado.dados = dados;
        const o = dados.orcamento || {};
        const contato = dados.contato;
        const statusAtual = dados.negociacao?.status || o.status_negociacao || 'ORCAMENTO CRIADO';
        const negociacaoEncerrada = ['GEROU VENDA', 'RECUSADO'].includes(statusAtual);
        const statusSelecionado = negociacaoEncerrada ? statusAtual : (estado.initialStatus || statusAtual);
        const contatoFinalizado = contato?.finalizado === true;
        const historico = Array.isArray(dados.historico) ? dados.historico : [];
        const saidas = Array.isArray(dados.saidas) ? dados.saidas : [];
        const motivosRecusa = Array.isArray(dados.motivosRecusa) ? dados.motivosRecusa : [];
        const content = modal.querySelector('[data-budget-negotiation-content]');
        content.innerHTML = `
            <dl class="budget-negotiation-summary">
                <div><dt>Cliente</dt><dd>${escapeHtml(o.cliente_nome || 'Cliente não informado')}</dd></div>
                <div><dt>Orçamento</dt><dd>#${escapeHtml(o.id)}</dd></div>
                <div><dt>Valor atual</dt><dd>${escapeHtml(formatarMoeda(o.valor_total))}</dd></div>
                <div><dt>Validade</dt><dd>${escapeHtml(formatarDataSimples(o.data_validade))}</dd></div>
            </dl>
            <div class="budget-negotiation-body">
                <section class="budget-negotiation-column">
                    <h3 class="budget-negotiation-section-title"><i class="fa-solid fa-chart-line" aria-hidden="true"></i> Etapa da negociação</h3>
                    <form class="budget-negotiation-form" data-budget-negotiation-form>
                        <label>Status
                            <select name="status" required ${negociacaoEncerrada ? 'disabled' : ''}>
                                ${(statusAtual === 'EXPIRADO' ? ['EXPIRADO'] : []).concat(['ENVIADO AO CLIENTE', 'EM NEGOCIACAO', 'GEROU VENDA', 'RECUSADO']).map(status => `<option value="${status}"${status === statusSelecionado ? ' selected' : ''}${status === 'EXPIRADO' ? ' disabled' : ''}>${escapeHtml(rotuloStatus(status))}</option>`).join('')}
                            </select>
                        </label>
                        <label data-budget-rejection-reason ${statusSelecionado === 'RECUSADO' ? '' : 'hidden'}>Motivo da recusa
                            <select name="motivoRecusa" ${statusSelecionado === 'RECUSADO' ? 'required' : ''}>
                                <option value="">Selecione o motivo</option>
                                ${motivosRecusa.map(motivo => `<option value="${escapeHtml(motivo.id)}" title="${escapeHtml(motivo.description || motivo.label)}">${escapeHtml(motivo.label)}</option>`).join('')}
                            </select>
                        </label>
                        <div class="budget-sale-fields" data-budget-sale-fields ${statusSelecionado === 'GEROU VENDA' ? '' : 'hidden'}>
                            <div class="budget-sale-list" data-budget-sale-rows>
                                ${(saidas.length ? saidas : [{}]).map(saida => renderizarLinhaSaida(saida, negociacaoEncerrada, statusSelecionado === 'GEROU VENDA')).join('')}
                            </div>
                            <button type="button" class="budget-sale-add" data-budget-add-sale ${negociacaoEncerrada ? 'hidden' : ''}><i class="fa-solid fa-plus" aria-hidden="true"></i> Adicionar pedido</button>
                        </div>
                        <label>Observação da etapa
                            <textarea name="observacao" maxlength="10000" placeholder="Registre o motivo, a condição negociada ou o próximo passo." ${negociacaoEncerrada ? 'disabled' : ''}></textarea>
                        </label>
                        <div class="budget-negotiation-message" data-budget-negotiation-message>${negociacaoEncerrada ? 'Negociação encerrada.' : ''}</div>
                        <button type="submit" ${negociacaoEncerrada ? 'disabled' : ''}>Salvar etapa</button>
                    </form>
                    <ol class="budget-negotiation-history">
                        ${historico.length ? historico.map(item => `
                            <li>
                                <strong>${escapeHtml(rotuloStatus(item.status))}</strong>
                                <span>${escapeHtml(formatarData(item.dataStatus))}${item.origem ? ` · ${escapeHtml(item.origem)}` : ''}</span>
                                ${item.valorAnterior !== null && item.valorAnterior !== undefined ? `<span>Valor: ${escapeHtml(formatarMoeda(item.valorAnterior))} → ${escapeHtml(formatarMoeda(item.valorAtual))}</span>` : ''}
                                ${item.motivoRecusaDescricao ? `<span>Motivo: ${escapeHtml(item.motivoRecusaDescricao)}</span>` : ''}
                                ${item.observacao ? `<small>${escapeHtml(item.observacao)}</small>` : ''}
                            </li>`).join('') : '<li><span>Sem movimentacoes registradas.</span></li>'}
                    </ol>
                    ${statusAtual === 'GEROU VENDA' ? `
                        <form class="budget-negotiation-form budget-sale-later" data-budget-sale-add-form>
                            <h4>Adicionar outro pedido</h4>
                            <div class="budget-sale-list">${renderizarLinhaSaida()}</div>
                            <div class="budget-negotiation-message" data-budget-sale-message></div>
                            <button type="submit">Vincular pedido</button>
                        </form>` : ''}
                </section>
                <section class="budget-negotiation-column">
                    <h3 class="budget-negotiation-section-title"><i class="fa-solid fa-comments" aria-hidden="true"></i> Contato sobre o orcamento</h3>
                    <form class="budget-negotiation-form" data-budget-contact-form>
                        <div class="budget-negotiation-grid">
                            <label>Status contato
                                <select name="statusContato" required ${contatoFinalizado ? 'disabled' : ''}>
                                    ${['PENDENTE', 'AGUARDANDO RETORNO', 'FINALIZADO'].map(status => `<option value="${status}"${status === (contato?.statusContato || 'PENDENTE') ? ' selected' : ''}>${status}</option>`).join('')}
                                </select>
                            </label>
                            <label>Canal
                                <select name="tipoContato" required ${contatoFinalizado ? 'disabled' : ''}>
                                    ${['WHATSAPP', 'LIGACAO', 'EMAIL', 'SMS', 'TELEGRAM'].map(tipo => `<option value="${tipo}"${tipo === (contato?.tipoContato || 'WHATSAPP') ? ' selected' : ''}>${escapeHtml(rotuloStatus(tipo))}</option>`).join('')}
                                </select>
                            </label>
                        </div>
                        <label>Observação
                            <textarea name="observacao" maxlength="10000" placeholder="Registre o retorno do cliente e o próximo contato." ${contatoFinalizado ? 'disabled' : ''}>${escapeHtml(contato?.observacao || '')}</textarea>
                        </label>
                        <div class="budget-negotiation-message" data-budget-contact-message>${contatoFinalizado ? 'Contato finalizado e bloqueado para alteracoes.' : (contato?.dataUltimaAtualizacao ? `Ultima atualizacao: ${escapeHtml(formatarData(contato.dataUltimaAtualizacao))}` : '')}</div>
                        <button type="submit" ${contatoFinalizado ? 'disabled' : ''}>Salvar contato</button>
                    </form>
                </section>
            </div>`;
    }

    async function carregar() {
        const resposta = await fetch('/api/negociacao-orcamento?id=' + encodeURIComponent(estado.orcamentoId), { headers: cabecalhos() });
        const dados = await resposta.json().catch(() => ({}));
        if (resposta.status === 401) {
            sessionStorage.removeItem('usuarioLogado');
            window.top.location.replace('login.html');
        }
        if (!resposta.ok) throw new Error(dados.error || 'Nao foi possivel carregar a negociacao.');
        renderizar(dados);
        return dados;
    }

    async function enviar(form, url, payload, seletorMensagem) {
        const mensagem = form.querySelector(seletorMensagem);
        const botao = form.querySelector('button[type="submit"]');
        botao.disabled = true;
        if (mensagem) mensagem.textContent = 'Salvando...';
        try {
            const resposta = await fetch(url, { method: 'POST', headers: cabecalhos(), body: JSON.stringify(payload) });
            const dados = await resposta.json().catch(() => ({}));
            if (resposta.status === 401) {
                sessionStorage.removeItem('usuarioLogado');
                window.top.location.replace('login.html');
            }
            if (!resposta.ok) throw new Error(dados.error || 'Nao foi possivel salvar.');
            if (!url.includes('controle-contato')) estado.initialStatus = null;
            await carregar();
            if (typeof estado.onSaved === 'function') await estado.onSaved({ tipo: url.includes('controle-contato') ? 'contato' : 'negociacao', dados });
        } catch (error) {
            if (mensagem) mensagem.textContent = error.message;
            botao.disabled = false;
        }
    }

    function tratarFormulario(evento) {
        evento.preventDefault();
        const form = evento.target;
        const campos = new FormData(form);
        if (form.matches('[data-budget-negotiation-form]')) {
            enviar(form, '/api/negociacao-orcamento', {
                orcamentoId: estado.orcamentoId,
                status: campos.get('status'),
                motivoRecusa: campos.get('motivoRecusa'),
                saidas: obterSaidasFormulario(form),
                observacao: campos.get('observacao')
            }, '[data-budget-negotiation-message]');
        } else if (form.matches('[data-budget-sale-add-form]')) {
            enviar(form, '/api/saidas-orcamento', {
                orcamentoId: estado.orcamentoId,
                saidas: obterSaidasFormulario(form)
            }, '[data-budget-sale-message]');
        } else if (form.matches('[data-budget-contact-form]')) {
            enviar(form, '/api/controle-contato-orcamento', {
                orcamentoId: estado.orcamentoId,
                statusContato: campos.get('statusContato'),
                tipoContato: campos.get('tipoContato'),
                observacao: campos.get('observacao')
            }, '[data-budget-contact-message]');
        }
    }

    async function open({ orcamentoId, onSaved, initialStatus } = {}) {
        const id = Number.parseInt(orcamentoId, 10);
        if (!id) throw new Error('Orcamento nao informado.');
        garantirModal();
        estado = { orcamentoId: id, onSaved, dados: null, initialStatus: String(initialStatus || '').trim().toUpperCase() || null };
        modal.hidden = false;
        document.body.classList.add('budget-negotiation-open');
        modal.querySelector('[data-budget-negotiation-content]').innerHTML = '<div class="budget-negotiation-loading">Carregando negociacao...</div>';
        try {
            await carregar();
        } catch (error) {
            modal.querySelector('[data-budget-negotiation-content]').innerHTML = `<div class="budget-negotiation-loading">${escapeHtml(error.message)}</div>`;
        }
    }

    function close() {
        if (modal) modal.hidden = true;
        document.body.classList.remove('budget-negotiation-open');
        estado = { orcamentoId: null, onSaved: null, dados: null, initialStatus: null };
    }

    document.addEventListener('keydown', evento => {
        if (evento.key === 'Escape' && modal && !modal.hidden) close();
    });

    window.BudgetNegotiation = { open, close };
})();
