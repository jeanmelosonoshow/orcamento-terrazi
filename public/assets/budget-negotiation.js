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
        });
        modal.addEventListener('submit', tratarFormulario);
        modal.addEventListener('change', evento => {
            if (!evento.target.matches('[data-budget-negotiation-form] [name="status"]')) return;
            atualizarCampoMotivoRecusa(evento.target.form, evento.target.value);
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

    function renderizar(dados) {
        estado.dados = dados;
        const o = dados.orcamento || {};
        const contato = dados.contato;
        const statusAtual = dados.negociacao?.status || o.status_negociacao || 'ORCAMENTO CRIADO';
        const negociacaoEncerrada = ['GEROU VENDA', 'RECUSADO'].includes(statusAtual);
        const statusSelecionado = negociacaoEncerrada ? statusAtual : (estado.initialStatus || statusAtual);
        const contatoFinalizado = contato?.finalizado === true;
        const historico = Array.isArray(dados.historico) ? dados.historico : [];
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
                observacao: campos.get('observacao')
            }, '[data-budget-negotiation-message]');
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
