
// ==================== ESTADO ====================
let todosFinanceiros = [];
let filtroAtualFinanceiro = 'todos';
let salvandoFinanceiro = false;
let sincronizandoFinanceiro = false;
let salvandoNovaTransacao = false;
let anoSelecionado = new Date().getFullYear();

// ==================== FUNÇÃO AUXILIAR: PARSEAR VALOR MONETÁRIO ====================
function parseValorMonetario(valor) {
    if (!valor) return 0;
    if (typeof valor === 'number') return valor;

    let str = String(valor).trim();
    if (!str) return 0;

    str = str.replace(/R\$/g, '').trim();
    str = str.replace(/[^\d,.]/g, '');
    if (!str) return 0;

    if (str.includes(',')) {
        str = str.replace(/\./g, '');
        str = str.replace(',', '.');
    } else {
        const partes = str.split('.');
        if (partes.length > 1) {
            const ultimo = partes.pop();
            const inteiro = partes.join('');
            str = inteiro + '.' + ultimo;
        }
    }

    return parseFloat(str) || 0;
}

// ==================== SITUAÇÃO DE UMA ENTRADA ====================
function situacaoEntrada(f) {
    const status = String(f.STATUS_PAG || f.STATUS || '').toUpperCase().trim();

    if (status === 'DEVOLVIDO') return null;

    const temDataPagamento = String(f.DATA_PAGAMENTO || '').trim() !== '';
    if (temDataPagamento || status === 'PAGO') return 'recebido';

    if (status === 'VENCIDO') return 'vencido';
    return 'pendente';
}

function statusPagamentoDe(f) {
    return String(f.STATUS_PAG || f.STATUS || '').toUpperCase().trim();
}

// ==================== HELPER: LER VALOR SEGURO ====================
function val(id) {
    const el = document.getElementById(id);
    return el ? el.value : '';
}

function valTrim(id) {
    return val(id).trim();
}

// ==================== VERIFICAR PERMISSÕES ====================
function isTitularFinanceiro() {
    const usuario = auth.getUsuario();
    return usuario && (usuario.role === 'ADM' || usuario.role === 'ADVOGADO TITULAR');
}

// ==================== CARREGAR FINANCEIRO ====================
async function carregarFinanceiro() {
    try {
        // Carrega FINANCEIRO e PROCESSOS em paralelo para fazer o join
        const [dados, processos] = await Promise.all([
            carregarComCache('FINANCEIRO'),
            carregarComCache('PROCESSOS').catch(err => {
                console.warn('⚠️ Não foi possível carregar PROCESSOS para o join:', err);
                return [];
            })
        ]);

        // Indexa processos por N PROCESSO (para herdar STATUS_PAG/DATA_PAGAMENTO)
        const porProcesso = new Map();
        (processos || []).forEach(p => {
            const n = String(p['N PROCESSO'] || '').trim();
            if (n) porProcesso.set(n, p);
        });

        // Descarta apenas linhas realmente vazias (saídas sem cliente/parceiro/processo agora entram)
        todosFinanceiros = dados
            .filter(f => String(f.VALOR || '').trim())
            .map(f => {
                const n = String(f.PROCESSO_REF || '').trim();
                const proc = n ? porProcesso.get(n) : null;
                return {
                    ...f,
                    // Herda do processo apenas se o lançamento não tiver valor próprio
                    STATUS_PAG: f.STATUS_PAG || (proc ? proc.STATUS_PAG : '') || '',
                    DATA_PAGAMENTO: f.DATA_PAGAMENTO || (proc ? proc.DATA_PAGAMENTO : '') || ''
                };
            });

        //console.log(`📋 Lançamentos financeiros: ${todosFinanceiros.length}`);

        atualizarStatsFinanceiro();
        aplicarFiltrosFinanceiro();

        const pendentes = todosFinanceiros.filter(f => {
            const fluxo = (f.FLUXO || 'ENTRADA').toUpperCase();
            if (fluxo !== 'ENTRADA') return false;
            const sit = situacaoEntrada(f);
            return sit === 'pendente' || sit === 'vencido';
        }).length;

        const badge = document.getElementById('badgeFinanceiroMenu');
        if (badge) {
            badge.textContent = pendentes;
            badge.style.display = pendentes > 0 ? 'inline-block' : 'none';
        }
    } catch (error) {
        console.error('Erro ao carregar financeiro:', error);
    }
}

// ==================== SINCRONIZAR COM PROCESSOS ====================
async function sincronizarFinanceiro() {
    if (sincronizandoFinanceiro) {
        notificar('Sincronização em andamento...', 'warning');
        return;
    }

    if (!isTitularFinanceiro()) {
        notificar('Apenas titular pode sincronizar.', 'warning');
        return;
    }

    sincronizandoFinanceiro = true;
    const btn = document.getElementById('btnSincronizarFinanceiro');
    if (btn) {
        btn.disabled = true;
        btn.innerHTML = '<i class="fas fa-spinner fa-pulse"></i> Sincronizando...';
    }

    //console.log('🔄 Iniciando sincronização financeira...');

    try {
        const processos = await carregarComCache('PROCESSOS', true);
        //console.log(`📋 ${processos.length} processos encontrados`);

        const financeiros = await carregarComCache('FINANCEIRO', true);
        //console.log(`📋 ${financeiros.length} lançamentos existentes`);

        const existentes = new Set();
        financeiros.forEach(f => {
            const cliente = String(f.CLIENTE || '').trim();
            const processoRef = String(f.PROCESSO_REF || '').trim();
            const valorNormalizado = parseValorMonetario(f.VALOR);

            if (cliente && processoRef) {
                existentes.add(`${cliente}|${processoRef}|${valorNormalizado}`);
            }
        });

        let criados = 0, ignorados = 0, erros = 0, semValor = 0;

        for (const processo of processos) {
            if (!processo['N PROCESSO']) continue;

            const numeroProcesso = String(processo['N PROCESSO'] || '').trim();
            const cliente = String(processo.CLIENTE || '').trim();
            // Aceita o cabeçalho com ou sem acento
            const data = processo['DATA DA INTIMACAO']
                || processo['DATA DA INTIMAÇÃO']
                || new Date().toISOString().split('T')[0];

            if (!cliente) {
                ignorados++;
                continue;
            }

            const valorCausa = parseValorMonetario(processo['VALOR DA CAUSA']);

            if (valorCausa <= 0) {
                semValor++;
                continue;
            }

            const chave = `${cliente}|${numeroProcesso}|${valorCausa}`;

            if (existentes.has(chave)) {
                ignorados++;
                continue;
            }

            // Herda status de pagamento do processo, se já existir
            const statusPagProcesso = String(processo.STATUS_PAG || '').toUpperCase().trim();
            const dataPagProcesso = String(processo.DATA_PAGAMENTO || '').trim();

            const dadosLancamento = {
                'DATA': data,
                'DATA_PAGAMENTO': dataPagProcesso,
                'FLUXO': 'ENTRADA',
                'CATEGORIA': 'HONORARIOS',
                'PARCEIRO': '',
                'TIPO_PAG': '',
                'CLIENTE': cliente,
                'PROCESSO_REF': numeroProcesso,
                'VALOR': formatarMoeda(valorCausa),
                'N_PARCELAS': '',
                'COMPROVANTE': '',
                'STATUS': statusPagProcesso === 'PAGO' ? 'PAGO' : 'PENDENTE',
                'STATUS_PAG': statusPagProcesso || 'PENDENTE',
                'OBS': `Valor da causa do processo ${numeroProcesso}`
            };

            try {
                await apiCreate('FINANCEIRO', dadosLancamento);
                criados++;
                existentes.add(chave);
            } catch (error) {
                console.error('❌ Erro ao criar lançamento:', error);
                erros++;
            }
        }

        // Invalida cache após escrita
        invalidarCacheAposEscrita('FINANCEIRO');

        await carregarFinanceiro();

        let mensagem = `✅ Sincronização concluída!\n• ${criados} lançamentos criados\n• ${ignorados} já existentes`;
        if (semValor > 0) mensagem += `\n• ${semValor} processos sem VALOR DA CAUSA`;
        if (erros > 0) mensagem += `\n• ${erros} erros`;
        notificar(mensagem, criados > 0 ? 'success' : 'info');

    } catch (error) {
        console.error('❌ Erro na sincronização:', error);
        notificar('Erro na sincronização: ' + error.message, 'error');
    } finally {
        sincronizandoFinanceiro = false;
        if (btn) {
            btn.disabled = false;
            btn.innerHTML = '<i class="fas fa-sync"></i> Sincronizar com Processos';
        }
    }
}

// ==================== ATUALIZAR STATS ====================
function atualizarStatsFinanceiro() {
    let totalEntradas = 0, totalSaidas = 0;
    let totalRecebido = 0, totalPendente = 0, totalVencido = 0;

    todosFinanceiros.forEach(f => {
        const valor = parseValorMonetario(f.VALOR);
        const fluxo = (f.FLUXO || 'ENTRADA').toUpperCase();

        // Saída fica só em saída
        if (fluxo === 'SAIDA') {
            totalSaidas += valor;
            return;
        }

        totalEntradas += valor;
        const sit = situacaoEntrada(f);
        if (sit === 'recebido') totalRecebido += valor;
        else if (sit === 'pendente') totalPendente += valor;
        else if (sit === 'vencido') totalVencido += valor;
    });

    const saldo = totalEntradas - totalSaidas;

    setText('totalEntradas', formatarMoeda(totalEntradas));
    setText('totalSaidas', formatarMoeda(totalSaidas));
    setText('totalSaldo', formatarMoeda(saldo));
    setText('totalRecebido', formatarMoeda(totalRecebido));
    setText('totalPendente', formatarMoeda(totalPendente));
    setText('totalVencido', formatarMoeda(totalVencido));

    const elSaldo = document.getElementById('totalSaldo');
    if (elSaldo) {
        elSaldo.style.color = saldo < 0 ? 'var(--danger)' : 'var(--success)';
    }
}

// ==================== APLICAR FILTROS ====================
function aplicarFiltrosFinanceiro() {
    let filtrados = [...todosFinanceiros];

    if (filtroAtualFinanceiro !== 'todos') {
        const filtro = filtroAtualFinanceiro.toUpperCase();
        filtrados = filtrados.filter(f => {
            // Filtro por fluxo
            if (filtro === 'ENTRADA') return (f.FLUXO || 'ENTRADA').toUpperCase() === 'ENTRADA';
            if (filtro === 'SAIDA')   return (f.FLUXO || 'ENTRADA').toUpperCase() === 'SAIDA';

            // Filtros por categoria
            const categoria = (f.CATEGORIA || '').toUpperCase();
            if (filtro === 'HONORARIOS') return categoria.includes('HONORARIOS');
            if (filtro === 'RETROATIVO') return categoria.includes('RETROATIVO');
            if (filtro === 'ACORDO')     return categoria.includes('ACORDO');
            if (filtro === 'COMISSAO')   return categoria.includes('COMISSAO');

            // Status (usa STATUS_PAG com fallback STATUS)
            return statusPagamentoDe(f).includes(filtro);
        });
    }

    const busca = (document.getElementById('buscaFinanceiro')?.value || '').toLowerCase().trim();
    if (busca) {
        filtrados = filtrados.filter(f =>
            String(f.CLIENTE || '').toLowerCase().includes(busca) ||
            String(f.PROCESSO_REF || '').toLowerCase().includes(busca) ||
            String(f.PARCEIRO || '').toLowerCase().includes(busca)
        );
    }

    renderizarTabelaFinanceiro(filtrados);
    setText('contagemFinanceiro', `${filtrados.length} de ${todosFinanceiros.length} registros`);
}

// ==================== RENDERIZAR TABELA ====================
function renderizarTabelaFinanceiro(lancamentos) {
    const tbody = document.getElementById('tbodyFinanceiro');
    if (!tbody) return;

    if (!lancamentos.length) {
        tbody.innerHTML = '<tr class="row-empty"><td colspan="14"><i class="fas fa-search"></i> Nenhum lançamento encontrado</td></tr>';
        return;
    }

    const titular = isTitularFinanceiro();

    tbody.innerHTML = lancamentos.map(f => {
        const statusExibicao = statusPagamentoDe(f) || 'PENDENTE';
        const statusClass = statusExibicao.toLowerCase().replace(/\s+/g, '-');

        const fluxo = (f.FLUXO || 'ENTRADA').toUpperCase();
        const fluxoBadge = fluxo === 'ENTRADA'
            ? '<span class="badge-fluxo entrada"><i class="fas fa-arrow-up"></i> Entrada</span>'
            : '<span class="badge-fluxo saida"><i class="fas fa-arrow-down"></i> Saída</span>';

        const comprovanteHtml = f.COMPROVANTE ?
            `<a href="${esc(f.COMPROVANTE)}" target="_blank" class="btn-icon-small" title="Ver comprovante">
                <i class="fas fa-file-pdf"></i>
            </a>` : '';

        const categoriaBase = (f.CATEGORIA || 'OUTROS').toUpperCase().trim();
        let categoriaClass = 'outros';
        if (categoriaBase.includes('HONORARIOS')) categoriaClass = 'honorarios';
        else if (categoriaBase.includes('RETROATIVO')) categoriaClass = 'retroativo';
        else if (categoriaBase.includes('ACORDO')) categoriaClass = 'acordo';
        else if (categoriaBase.includes('COMISSAO')) categoriaClass = 'comissao';
        else if (categoriaBase.includes('CUSTAS')) categoriaClass = 'custas';
        else if (categoriaBase.includes('TAXAS')) categoriaClass = 'taxas';
        else if (categoriaBase.includes('MATERIAL')) categoriaClass = 'material';

        let botoesAcao = '';
        if (titular) {
            const statusAtual = statusPagamentoDe(f) || 'PENDENTE';
            const btnConfirmar = (statusAtual === 'PENDENTE' || statusAtual === 'VENCIDO' || statusAtual === 'AGUARDANDO') ? `
                <button class="btn-icon-small success" title="Confirmar Pagamento" onclick="confirmarPagamentoFinanceiro(${f._row})">
                    <i class="fas fa-check-circle"></i>
                </button>
            ` : '';

            botoesAcao = `
                ${btnConfirmar}
                <button class="btn-icon-small" title="Editar" onclick="abrirEdicaoFinanceiro(${f._row})">
                    <i class="fas fa-edit"></i>
                </button>
                <button class="btn-icon-small danger" title="Excluir" onclick="excluirFinanceiro(${f._row})">
                    <i class="fas fa-trash"></i>
                </button>
            `;
        } else {
            botoesAcao = `
                <button class="btn-icon-small" title="Visualizar" onclick="verDetalhesFinanceiro(${f._row})">
                    <i class="fas fa-eye"></i>
                </button>
            `;
        }

        return `
            <tr>
                <td><span class="mono-text">${formatarData(f.DATA) || '—'}</span></td>
                <td><span class="mono-text">${formatarData(f.DATA_PAGAMENTO) || '—'}</span></td>
                <td>${fluxoBadge}</td>
                <td><span class="badge-categoria ${categoriaClass}">${esc(f.CATEGORIA || '—')}</span></td>
                <td>${esc(f.PARCEIRO || '—')}</td>
                <td>${esc(f.TIPO_PAG || '—')}</td>
                <td><strong>${esc(f.CLIENTE || '—')}</strong></td>
                <td><span class="mono-text">${esc(f.PROCESSO_REF || '—')}</span></td>
                <td><strong class="${fluxo === 'ENTRADA' ? 'text-success' : 'text-danger'}">${esc(f.VALOR || 'R$ 0,00')}</strong></td>
                <td>${esc(f.N_PARCELAS || '1')}</td>
                <td>${comprovanteHtml}</td>
                <td><span class="status-pag ${statusClass}">${esc(statusExibicao)}</span></td>
                <td style="max-width: 120px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;" title="${esc(f.OBS || '')}">${esc(f.OBS || '—')}</td>
                <td>
                    <div class="acoes">
                        ${botoesAcao}
                    </div>
                </td>
            </tr>
        `;
    }).join('');
}

// ==================== CONFIRMAR PAGAMENTO ====================
async function confirmarPagamentoFinanceiro(row) {
    if (!isTitularFinanceiro()) {
        notificar('Apenas titular pode confirmar pagamento.', 'warning');
        return;
    }

    const lancamento = todosFinanceiros.find(f => f._row === row);
    if (!lancamento) {
        notificar('Lançamento não encontrado', 'error');
        return;
    }

    const statusAtual = statusPagamentoDe(lancamento) || 'PENDENTE';
    if (statusAtual === 'PAGO') {
        notificar('Este lançamento já está marcado como PAGO.', 'info');
        return;
    }

    const dataPagamento = new Date().toISOString().split('T')[0];
    const processoRef = String(lancamento.PROCESSO_REF || '').trim();

    const confirmar = confirm(
        `Confirmar pagamento de:\n\n` +
        `Cliente: ${lancamento.CLIENTE || '—'}\n` +
        `Processo: ${processoRef || '—'}\n` +
        `Valor: ${lancamento.VALOR || 'R$ 0,00'}\n` +
        `Data do Pagamento: ${formatarData(dataPagamento)}\n\n` +
        (processoRef ? `⚠️ Também atualizará o processo ${processoRef} (STATUS_PAG e DATA_PAGAMENTO).\n\n` : '') +
        `Deseja marcar como PAGO?`
    );

    if (!confirmar) return;

    try {
        // 1) Atualiza o lançamento financeiro (STATUS + STATUS_PAG + DATA_PAGAMENTO)
        const dadosAtualizados = {
            ...lancamento,
            'STATUS': 'PAGO',
            'STATUS_PAG': 'PAGO',
            'DATA_PAGAMENTO': dataPagamento
        };

        const { _row, ...dadosParaEnviar } = dadosAtualizados;
        await apiUpdate('FINANCEIRO', parseInt(row), dadosParaEnviar);
        invalidarCacheAposEscrita('FINANCEIRO');

        // 2) Atualiza o processo correspondente na aba PROCESSOS
        let processoAtualizado = false;
        if (processoRef) {
            try {
                const processos = await carregarComCache('PROCESSOS', true);
                const processo = (processos || []).find(p =>
                    String(p['N PROCESSO'] || '').trim() === processoRef
                );

                if (processo && processo._row) {
                    const { _row: procRow, ...dadosProcesso } = processo;
                    await apiUpdate('PROCESSOS', parseInt(procRow), {
                        ...dadosProcesso,
                        'STATUS_PAG': 'PAGO',
                        'DATA_PAGAMENTO': dataPagamento
                    });
                    invalidarCacheAposEscrita('PROCESSOS');
                    processoAtualizado = true;
                    //console.log(`✅ Processo ${processoRef} atualizado (STATUS_PAG=PAGO, DATA_PAGAMENTO=${dataPagamento})`);
                } else {
                    console.warn(`⚠️ Processo ${processoRef} não encontrado na aba PROCESSOS (ou sem _row)`);
                }
            } catch (errProc) {
                console.error('⚠️ Erro ao atualizar PROCESSOS:', errProc);
                // Não aborta: o financeiro já foi atualizado
            }
        }

        notificar(
            processoAtualizado
                ? '✅ Pagamento confirmado (financeiro + processo)!'
                : '✅ Pagamento confirmado no financeiro!' + (processoRef ? ' (processo não encontrado)' : ''),
            'success'
        );

        await carregarFinanceiro();
        await atualizarResumoAnual();
    } catch (error) {
        console.error('Erro ao confirmar pagamento:', error);
        notificar('Erro ao confirmar pagamento: ' + error.message, 'error');
    }
}

// ==================== PREENCHER MODAL (detalhes / edição) ====================
function preencherModalFinanceiro(row, lancamento) {
    const set = (id, valor) => {
        const el = document.getElementById(id);
        if (el) el.value = valor;
    };

    set('financeiroRow', row);
    set('editFinanceiroData', converterDataISO(lancamento.DATA));
    set('editFinanceiroDataPagamento', converterDataISO(lancamento.DATA_PAGAMENTO) || '');
    set('editFinanceiroFluxo', lancamento.FLUXO || 'ENTRADA');
    set('editFinanceiroCategoria', lancamento.CATEGORIA || 'HONORARIOS');
    set('editFinanceiroParceiro', lancamento.PARCEIRO || '');
    set('editFinanceiroTipoPag', lancamento.TIPO_PAG || '');
    set('editFinanceiroCliente', lancamento.CLIENTE || '');
    set('editFinanceiroProcessoRef', lancamento.PROCESSO_REF || '');
    set('editFinanceiroValor', lancamento.VALOR || 'R$ 0,00');
    set('editFinanceiroNParcelas', lancamento.N_PARCELAS || '1');
    set('editFinanceiroStatus', lancamento.STATUS_PAG || lancamento.STATUS || 'PENDENTE');
    set('editFinanceiroObs', lancamento.OBS || '');
    set('editFinanceiroComprovante', lancamento.COMPROVANTE || '');
}

// ==================== VISUALIZAR DETALHES ====================
async function verDetalhesFinanceiro(row) {
    const lancamento = todosFinanceiros.find(f => f._row === row);
    if (!lancamento) {
        notificar('Lançamento não encontrado', 'error');
        return;
    }

    await preencherDatalistParceiros();

    const modal = document.getElementById('modalEditarFinanceiro');
    const titulo = document.getElementById('modalTituloFinanceiro');

    if (titulo) titulo.textContent = 'Detalhes do Lançamento';
    preencherModalFinanceiro(row, lancamento);

    document.querySelectorAll('#formEditarFinanceiro input, #formEditarFinanceiro select').forEach(el => {
        el.disabled = true;
    });

    const btnSalvar = document.getElementById('salvarFinanceiro');
    const btnExcluir = document.getElementById('btnExcluirFinanceiro');
    const btnCancelar = document.getElementById('cancelarFinanceiro');

    if (btnSalvar) btnSalvar.style.display = 'none';
    if (btnExcluir) btnExcluir.style.display = 'none';
    if (btnCancelar) btnCancelar.textContent = 'Fechar';

    if (modal) modal.classList.add('active');
}

// ==================== EDIÇÃO ====================
async function abrirEdicaoFinanceiro(row) {
    const lancamento = todosFinanceiros.find(f => f._row === row);
    if (!lancamento) {
        notificar('Lançamento não encontrado', 'error');
        return;
    }

    await preencherDatalistParceiros();

    const modal = document.getElementById('modalEditarFinanceiro');
    const titulo = document.getElementById('modalTituloFinanceiro');

    if (titulo) titulo.textContent = 'Editar Lançamento Financeiro';
    preencherModalFinanceiro(row, lancamento);

    document.querySelectorAll('#formEditarFinanceiro input, #formEditarFinanceiro select').forEach(el => {
        el.disabled = false;
    });

    const btnSalvar = document.getElementById('salvarFinanceiro');
    const btnExcluir = document.getElementById('btnExcluirFinanceiro');
    const btnCancelar = document.getElementById('cancelarFinanceiro');

    if (btnSalvar) btnSalvar.style.display = '';
    if (btnExcluir) btnExcluir.style.display = '';
    if (btnCancelar) btnCancelar.textContent = 'Cancelar';

    if (modal) modal.classList.add('active');
}

function fecharModalFinanceiro() {
    document.getElementById('modalEditarFinanceiro')?.classList.remove('active');
}

// ==================== SALVAR EDIÇÃO ====================
async function salvarEdicaoFinanceiro() {
    if (salvandoFinanceiro) {
        notificar('Aguarde, salvando...', 'warning');
        return;
    }

    const row = val('financeiroRow');
    if (!row) {
        notificar('Nenhum registro para editar', 'error');
        return;
    }

    const status = val('editFinanceiroStatus') || 'PENDENTE';
    let dataPagamento = val('editFinanceiroDataPagamento');

    // Status PAGO sem data de pagamento: preenche com a data de hoje
    if (status === 'PAGO' && !dataPagamento) {
        dataPagamento = new Date().toISOString().split('T')[0];
    }

    const dados = {
        'DATA': val('editFinanceiroData'),
        'DATA_PAGAMENTO': dataPagamento,
        'FLUXO': val('editFinanceiroFluxo') || 'ENTRADA',
        'CATEGORIA': val('editFinanceiroCategoria') || 'HONORARIOS',
        'PARCEIRO': valTrim('editFinanceiroParceiro'),
        'TIPO_PAG': val('editFinanceiroTipoPag'),
        'CLIENTE': valTrim('editFinanceiroCliente'),
        'PROCESSO_REF': valTrim('editFinanceiroProcessoRef'),
        'VALOR': val('editFinanceiroValor') || 'R$ 0,00',
        'N_PARCELAS': val('editFinanceiroNParcelas') || '1',
        'STATUS': status,
        'STATUS_PAG': status, // espelha para manter coerência com a aba PROCESSOS
        'OBS': valTrim('editFinanceiroObs'),
        'COMPROVANTE': valTrim('editFinanceiroComprovante')
    };

    if (!dados.CLIENTE && !dados.PROCESSO_REF && !dados.PARCEIRO && !dados.OBS) {
        notificar('Preencha Cliente, Processo Ref., Parceiro ou Observação.', 'warning');
        return;
    }

    salvandoFinanceiro = true;
    const btnSalvar = document.getElementById('salvarFinanceiro');
    if (btnSalvar) {
        btnSalvar.disabled = true;
        btnSalvar.innerHTML = '<i class="fas fa-spinner fa-pulse"></i> Salvando...';
    }

    try {
        await apiUpdate('FINANCEIRO', parseInt(row), dados);
        invalidarCacheAposEscrita('FINANCEIRO');
        notificar('Lançamento atualizado com sucesso!', 'success');
        fecharModalFinanceiro();
        await carregarFinanceiro();
        await atualizarResumoAnual();
    } catch (error) {
        console.error('Erro ao salvar:', error);
        notificar('Erro ao salvar: ' + error.message, 'error');
    } finally {
        salvandoFinanceiro = false;
        if (btnSalvar) {
            btnSalvar.disabled = false;
            btnSalvar.innerHTML = '<i class="fas fa-save"></i> Salvar';
        }
    }
}

// ==================== EXCLUIR ====================
async function excluirFinanceiro(row) {
    if (!isTitularFinanceiro()) {
        notificar('Apenas titular pode excluir.', 'warning');
        return;
    }

    if (!confirm('Tem certeza que deseja excluir este lançamento?')) return;

    try {
        await apiDelete('FINANCEIRO', row);
        invalidarCacheAposEscrita('FINANCEIRO');
        notificar('Lançamento excluído com sucesso!', 'success');
        await carregarFinanceiro();
        await atualizarResumoAnual();
    } catch (error) {
        console.error('Erro ao excluir:', error);
        notificar('Erro ao excluir: ' + error.message, 'error');
    }
}

// ==================== RESUMO ANUAL ====================
function popularAnosResumo() {
    const select = document.getElementById('anoResumo');
    if (!select) return;

    const anoAtual = new Date().getFullYear();
    select.innerHTML = '';

    for (let ano = anoAtual + 1; ano >= anoAtual - 5; ano--) {
        const option = document.createElement('option');
        option.value = ano;
        option.textContent = ano;
        if (ano === anoAtual) {
            option.selected = true;
        }
        select.appendChild(option);
    }
}

async function atualizarResumoAnual() {
    const select = document.getElementById('anoResumo');
    if (!select) return;

    anoSelecionado = parseInt(select.value) || new Date().getFullYear();

    // total = total de ENTRADAS do mês
    const meses = Array.from({ length: 12 }, (_, i) => ({
        mes: i,
        entradas: 0,
        saidas: 0,
        recebido: 0,
        pendente: 0,
        vencido: 0,
        total: 0
    }));

    todosFinanceiros.forEach(f => {
        if (!f.DATA) return;

        const fluxo = String(f.FLUXO || 'ENTRADA').toUpperCase();

        // Se tem data de pagamento, usa ela; senão usa a data do lançamento
        const dataParaUsar = String(f.DATA_PAGAMENTO || '').trim() || f.DATA;

        const dataStr = String(dataParaUsar).trim();
        let anoLancamento = null;
        let mesLancamento = null;

        if (dataStr.includes('-')) {
            const partes = dataStr.split('T')[0].split('-');
            anoLancamento = parseInt(partes[0]);
            mesLancamento = parseInt(partes[1]) - 1;
        } else if (dataStr.includes('/')) {
            const partes = dataStr.split('/');
            anoLancamento = parseInt(partes[2]);
            mesLancamento = parseInt(partes[1]) - 1;
        } else {
            const d = new Date(dataStr);
            if (!isNaN(d.getTime())) {
                anoLancamento = d.getFullYear();
                mesLancamento = d.getMonth();
            }
        }

        if (anoLancamento === anoSelecionado && mesLancamento >= 0 && mesLancamento <= 11) {
            const valor = parseValorMonetario(f.VALOR);
            const m = meses[mesLancamento];

            // Saída fica só em saída
            if (fluxo === 'SAIDA') {
                m.saidas += valor;
                return;
            }

            m.entradas += valor;
            m.total += valor;

            const sit = situacaoEntrada(f);
            if (sit === 'recebido') m.recebido += valor;
            else if (sit === 'pendente') m.pendente += valor;
            else if (sit === 'vencido') m.vencido += valor;
        }
    });

    const totalEntradasAno = meses.reduce((sum, m) => sum + m.entradas, 0);
    const totalSaidasAno   = meses.reduce((sum, m) => sum + m.saidas, 0);
    const totalRecebido    = meses.reduce((sum, m) => sum + m.recebido, 0);
    const totalPendente    = meses.reduce((sum, m) => sum + m.pendente, 0);
    const totalVencido     = meses.reduce((sum, m) => sum + m.vencido, 0);
    const mediaMensal      = totalEntradasAno / 12; // média mensal das entradas

    setText('entradasAno', formatarMoeda(totalEntradasAno));
    setText('saidasAno', formatarMoeda(totalSaidasAno));
    setText('totalRecebidoAno', formatarMoeda(totalRecebido));
    setText('totalPendenteAno', formatarMoeda(totalPendente));
    setText('totalVencidoAno', formatarMoeda(totalVencido));
    setText('mediaMensalAno', formatarMoeda(mediaMensal));

    renderizarGraficoMensal(meses);
    renderizarTabelaResumoMensal(meses);
}

// ==================== GRÁFICO MENSAL (Entradas x Saídas) ====================
// Escala mínima do eixo Y. Se algum mês passar disso, a escala cresce sozinha.
const GRAFICO_ESCALA_MINIMA = 60000;

// Calcula o topo do eixo e as linhas de grade (valores "redondos": 20k, 40k...)
function calcularEscalaGrafico(maxDados) {
    const alvo = Math.max(GRAFICO_ESCALA_MINIMA, maxDados);
    const passoBruto = alvo / 4;
    const magnitude = Math.pow(10, Math.floor(Math.log10(passoBruto)));
    const norm = passoBruto / magnitude;
    const fator = norm <= 1 ? 1 : norm <= 2 ? 2 : norm <= 2.5 ? 2.5 : norm <= 5 ? 5 : 10;
    const passo = fator * magnitude;
    const topo = Math.ceil(alvo / passo) * passo;
    const marcas = [];
    for (let v = passo; v <= topo + 0.001; v += passo) marcas.push(v);
    return { topo, marcas };
}

// 51000 -> "51k" | 5200 -> "5,2k" | 1500000 -> "1,5M"
function formatarCompacto(v) {
    if (v >= 1e6) return (v / 1e6).toFixed(1).replace('.', ',').replace(/,0$/, '') + 'M';
    if (v >= 1e3) {
        const k = v / 1e3;
        const texto = k >= 10 ? String(Math.round(k)) : k.toFixed(1).replace('.', ',').replace(/,0$/, '');
        return texto + 'k';
    }
    return String(Math.round(v));
}

function renderizarGraficoMensal(meses) {
    const container = document.getElementById('graficoMensal');
    if (!container) return;

    const nomesMeses = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];
    const hasData = meses.some(m => m.entradas > 0 || m.saidas > 0);

    if (!hasData) {
        container.innerHTML = `
            <div class="grafico-vazio">
                <i class="fas fa-chart-bar"></i>
                <span>Nenhum dado disponível para ${anoSelecionado}</span>
            </div>
        `;
        return;
    }

    // Mesma escala (a partir do zero) para todas as barras
    const maxDados = Math.max(...meses.map(m => Math.max(m.entradas, m.saidas)));
    const { topo, marcas } = calcularEscalaGrafico(maxDados);
    const pct = (valor) => (valor / topo) * 100;

    const grade = marcas.map(v => `
        <div class="grafico-grade" style="bottom: ${pct(v)}%;"><span>${formatarCompacto(v)}</span></div>
    `).join('');

    const barra = (valor, tipo, nome) => valor > 0 ? `
        <div class="barra ${tipo}" style="height: ${pct(valor)}%;" data-valor="${nome}: ${formatarMoeda(valor)}">
            <span class="barra-rotulo">${formatarCompacto(valor)}</span>
        </div>` : '';

    const colunas = meses.map((m, i) => {
        const saldo = m.entradas - m.saidas;
        const resumo = `${nomesMeses[i]} — Entradas: ${formatarMoeda(m.entradas)} | Saídas: ${formatarMoeda(m.saidas)} | Saldo: ${formatarMoeda(saldo)}`;
        return `
            <div class="coluna-mes">
                ${barra(m.entradas, 'entrada', 'Entradas')}
                ${barra(m.saidas, 'saida', 'Saídas')}
                <div class="coluna-rotulo" title="${resumo}">${nomesMeses[i]}</div>
            </div>`;
    }).join('');

    container.innerHTML = `
        <div class="grafico-plot">
            ${grade}
            <div class="grafico-colunas">${colunas}</div>
        </div>`;
}

function renderizarTabelaResumoMensal(meses) {
    const tbody = document.getElementById('tbodyResumoMensal');
    if (!tbody) return;

    const nomesMeses = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];
    // Considera também meses com apenas saídas
    const hasData = meses.some(m => m.entradas > 0 || m.saidas > 0);

    if (!hasData) {
        tbody.innerHTML = `<tr class="row-empty"><td colspan="7">Nenhum dado disponível para ${anoSelecionado}</td></tr>`;
        return;
    }

    tbody.innerHTML = meses.map((m, i) => {
        const saldo = m.entradas - m.saidas;
        const saldoClass = saldo < 0 ? 'text-danger' : 'text-success';

        return `
            <tr>
                <td><strong>${nomesMeses[i]}</strong></td>
                <td class="text-success">${formatarMoeda(m.entradas)}</td>
                <td class="text-danger">${formatarMoeda(m.saidas)}</td>
                <td class="${saldoClass}"><strong>${formatarMoeda(saldo)}</strong></td>
                <td class="text-warning">${formatarMoeda(m.pendente)}</td>
                <td class="text-danger">${formatarMoeda(m.vencido)}</td>
                <td><strong>${formatarMoeda(m.total)}</strong></td>
            </tr>
        `;
    }).join('');
}

function initResumoAnual() {
    popularAnosResumo();

    const select = document.getElementById('anoResumo');
    if (select) {
        select.addEventListener('change', atualizarResumoAnual);
    }

    const btnAtualizar = document.getElementById('btnAtualizarResumo');
    if (btnAtualizar) {
        btnAtualizar.addEventListener('click', atualizarResumoAnual);
    }

    setTimeout(atualizarResumoAnual, 800);
}

// ==================== PARCEIROS (para o datalist do modal) ====================
async function preencherDatalistParceiros() {
    try {
        const dados = await carregarComCache('PARCEIROS');

        const nomes = dados
            .map(p => String(p.NOME || '').trim())
            .filter(n => n)
            .sort((a, b) => a.localeCompare(b, 'pt-BR'));

        const vistos = new Set();
        const unicos = nomes.filter(n => {
            const k = n.toLowerCase();
            if (vistos.has(k)) return false;
            vistos.add(k);
            return true;
        });

        ['listaParceiros', 'listaParceirosEdit'].forEach(id => {
            const datalist = document.getElementById(id);
            if (!datalist) return;
            datalist.innerHTML = unicos
                .map(nome => `<option value="${esc(nome)}"></option>`)
                .join('');
        });

        //console.log(`👥 [financeiro] ${unicos.length} parceiros no datalist`);
    } catch (error) {
        console.error('Erro ao preencher datalist de parceiros:', error);
    }
}

// ==================== NOVA TRANSAÇÃO ====================
async function abrirModalNovaTransacao() {
    if (!isTitularFinanceiro()) {
        notificar('Apenas titular pode adicionar transações.', 'warning');
        return;
    }

    await preencherDatalistParceiros();

    const form = document.getElementById('formNovaTransacao');
    if (form) form.reset();

    const hoje = new Date().toISOString().split('T')[0];
    if (document.getElementById('novaTransacaoData')) document.getElementById('novaTransacaoData').value = hoje;
    if (document.getElementById('novaTransacaoStatus')) document.getElementById('novaTransacaoStatus').value = 'PENDENTE';
    if (document.getElementById('novaTransacaoNParcelas')) document.getElementById('novaTransacaoNParcelas').value = '1';
    if (document.getElementById('novaTransacaoFluxo')) document.getElementById('novaTransacaoFluxo').value = 'ENTRADA';

    const preview = document.getElementById('previewParcelas');
    if (preview) preview.style.display = 'none';

    document.getElementById('modalNovaTransacao')?.classList.add('active');
}

function fecharModalNovaTransacao() {
    document.getElementById('modalNovaTransacao')?.classList.remove('active');
}

function calcularPreviewParcelas() {
    const valorStr = val('novaTransacaoValor');
    const nParcelas = parseInt(val('novaTransacaoNParcelas')) || 1;
    const dataBase = val('novaTransacaoData');

    const valorTotal = parseValorMonetario(valorStr);
    const preview = document.getElementById('previewParcelas');
    const previewConteudo = document.getElementById('previewParcelasConteudo');

    if (!preview || !previewConteudo) return;

    if (valorTotal <= 0 || nParcelas < 1 || !dataBase) {
        preview.style.display = 'none';
        return;
    }

    const valorParcela = valorTotal / nParcelas;

    let html = '';
    for (let i = 1; i <= nParcelas; i++) {
        const dataParcela = calcularDataParcela(dataBase, i);
        html += `<div class="preview-linha">
            <span class="preview-parcela"><strong>${i}/${nParcelas}</strong></span>
            <span class="preview-valor">${formatarMoeda(valorParcela)}</span>
            <span class="preview-data">Venc. ${formatarData(dataParcela)}</span>
        </div>`;
    }

    html += `<div class="preview-total">
        Total: ${formatarMoeda(valorTotal)} em ${nParcelas}x de ${formatarMoeda(valorParcela)}
    </div>`;

    previewConteudo.innerHTML = html;
    preview.style.display = 'block';
}

function calcularDataParcela(dataBaseStr, numeroParcela) {
    if (!dataBaseStr) return '';

    const partes = dataBaseStr.split('-');
    const ano = parseInt(partes[0]);
    const mes = parseInt(partes[1]) - 1;
    const dia = parseInt(partes[2]);

    const data = new Date(ano, mes + (numeroParcela - 1), dia);

    const y = data.getFullYear();
    const m = String(data.getMonth() + 1).padStart(2, '0');
    const d = String(data.getDate()).padStart(2, '0');

    return `${y}-${m}-${d}`;
}

async function salvarNovaTransacao() {
    if (salvandoNovaTransacao) {
        notificar('Aguarde, salvando...', 'warning');
        return;
    }

    const data            = val('novaTransacaoData');
    const fluxo           = val('novaTransacaoFluxo') || 'ENTRADA';
    const categoria       = val('novaTransacaoCategoria');
    const tipoPag         = val('novaTransacaoTipoPag');
    const cliente         = valTrim('novaTransacaoCliente');
    const processoRef     = valTrim('novaTransacaoProcessoRef');
    const parceiro        = valTrim('novaTransacaoParceiro');
    const valorStr        = val('novaTransacaoValor');
    const nParcelas       = parseInt(val('novaTransacaoNParcelas')) || 1;
    const status          = val('novaTransacaoStatus') || 'PENDENTE';
    const dataPagamento   = val('novaTransacaoDataPagamento');
    const comprovante     = valTrim('novaTransacaoComprovante');
    const obs             = valTrim('novaTransacaoObs');

    if (!data) {
        notificar('Preencha a Data.', 'warning');
        return;
    }
    if (!categoria) {
        notificar('Selecione a Categoria.', 'warning');
        return;
    }

    const valorTotal = parseValorMonetario(valorStr);
    if (valorTotal <= 0) {
        notificar('Informe um valor válido.', 'warning');
        return;
    }

    if (nParcelas < 1) {
        notificar('N° de parcelas deve ser no mínimo 1.', 'warning');
        return;
    }

    salvandoNovaTransacao = true;
    const btn = document.getElementById('salvarNovaTransacao');
    if (btn) {
        btn.disabled = true;
        btn.innerHTML = '<i class="fas fa-spinner fa-pulse"></i> Salvando...';
    }

    try {
        const valorParcela = valorTotal / nParcelas;
        let criados = 0;

        for (let i = 1; i <= nParcelas; i++) {
            const dataParcela = calcularDataParcela(data, i);

            let obsFinal = obs;
            if (nParcelas > 1) {
                const sufixoParcela = `Parcela ${i}/${nParcelas}`;
                obsFinal = obs ? `${obs} - ${sufixoParcela}` : sufixoParcela;
            }

            let statusFinal = status;
            let dataPagamentoFinal = '';

            if (nParcelas > 1) {
                if (i === 1 && dataPagamento) {
                    statusFinal = status;
                    dataPagamentoFinal = dataPagamento;
                } else if (i === 1 && status === 'PAGO') {
                    statusFinal = 'PAGO';
                    dataPagamentoFinal = dataParcela;
                } else {
                    statusFinal = 'PENDENTE';
                    dataPagamentoFinal = '';
                }
            } else {
                statusFinal = status;
                dataPagamentoFinal = (status === 'PAGO' && !dataPagamento) ? dataParcela : dataPagamento;
            }

            const dadosLancamento = {
                'DATA': dataParcela,
                'DATA_PAGAMENTO': dataPagamentoFinal,
                'FLUXO': fluxo,
                'CATEGORIA': categoria,
                'PARCEIRO': parceiro,
                'TIPO_PAG': tipoPag,
                'CLIENTE': cliente,
                'PROCESSO_REF': processoRef,
                'VALOR': formatarMoeda(valorParcela),
                'N_PARCELAS': `${i}/${nParcelas}`,
                'COMPROVANTE': comprovante,
                'STATUS': statusFinal,
                'STATUS_PAG': statusFinal, // espelha
                'OBS': obsFinal
            };

            await apiCreate('FINANCEIRO', dadosLancamento);
            criados++;
        }

        invalidarCacheAposEscrita('FINANCEIRO');
        notificar(`✅ ${criados} transação(ões) criada(s) com sucesso!`, 'success');
        fecharModalNovaTransacao();
        await carregarFinanceiro();
        await atualizarResumoAnual();

    } catch (error) {
        console.error('Erro ao salvar transação:', error);
        notificar('Erro ao salvar: ' + error.message, 'error');
    } finally {
        salvandoNovaTransacao = false;
        if (btn) {
            btn.disabled = false;
            btn.innerHTML = '<i class="fas fa-save"></i> Salvar Transação';
        }
    }
}

// ==================== EVENTOS ====================
function initEventosNovaTransacao() {
    document.getElementById('btnNovaTransacao')?.addEventListener('click', abrirModalNovaTransacao);
    document.getElementById('fecharModalNovaTransacao')?.addEventListener('click', fecharModalNovaTransacao);
    document.getElementById('cancelarNovaTransacao')?.addEventListener('click', fecharModalNovaTransacao);
    document.getElementById('salvarNovaTransacao')?.addEventListener('click', salvarNovaTransacao);

    ['novaTransacaoValor', 'novaTransacaoNParcelas', 'novaTransacaoData'].forEach(id => {
        document.getElementById(id)?.addEventListener('input', calcularPreviewParcelas);
        document.getElementById(id)?.addEventListener('change', calcularPreviewParcelas);
    });
}

function initEventosFinanceiro() {
    document.getElementById('btnSincronizarFinanceiro')?.addEventListener('click', sincronizarFinanceiro);

    document.getElementById('buscaFinanceiro')?.addEventListener('input', debounce(() => {
        aplicarFiltrosFinanceiro();
    }, 300));

    document.querySelectorAll('#pageFinanceiro .filtro-btn-financeiro').forEach(btn => {
        btn.addEventListener('click', function() {
            document.querySelectorAll('#pageFinanceiro .filtro-btn-financeiro').forEach(b => b.classList.remove('active'));
            this.classList.add('active');
            filtroAtualFinanceiro = this.getAttribute('data-filtro');
            aplicarFiltrosFinanceiro();
        });
    });

    document.getElementById('fecharModalFinanceiro')?.addEventListener('click', fecharModalFinanceiro);
    document.getElementById('cancelarFinanceiro')?.addEventListener('click', fecharModalFinanceiro);
    document.getElementById('salvarFinanceiro')?.addEventListener('click', salvarEdicaoFinanceiro);
    document.getElementById('btnExcluirFinanceiro')?.addEventListener('click', async function() {
        const row = val('financeiroRow');
        if (row && confirm('Tem certeza que deseja excluir este lançamento?')) {
            await excluirFinanceiro(parseInt(row));
            fecharModalFinanceiro();
        }
    });

    initEventosNovaTransacao();
}

// ==================== INICIALIZAÇÃO ====================
async function inicializarFinanceiro() {
    //console.log('💰 Inicializando financeiro...');

    await aguardarElementosFinanceiro();

    await carregarFinanceiro();
    initEventosFinanceiro();
    initResumoAnual();

    preencherDatalistParceiros().catch(err =>
        console.warn('Aviso: datalist de parceiros não pôde ser pré-carregado:', err)
    );

    //console.log('✅ Módulo financeiro inicializado');
}

function aguardarElementosFinanceiro() {
    return new Promise((resolve) => {
        const check = () => {
            const tabela = document.getElementById('tbodyFinanceiro');
            const busca = document.getElementById('buscaFinanceiro');
            if (tabela && busca) {
                resolve();
            } else {
                setTimeout(check, 100);
            }
        };
        check();
    });
}

// ==================== EXPORTAÇÃO GLOBAL ====================
window.inicializarFinanceiro = inicializarFinanceiro;
window.carregarFinanceiro = carregarFinanceiro;
window.sincronizarFinanceiro = sincronizarFinanceiro;
window.abrirEdicaoFinanceiro = abrirEdicaoFinanceiro;
window.fecharModalFinanceiro = fecharModalFinanceiro;
window.salvarEdicaoFinanceiro = salvarEdicaoFinanceiro;
window.excluirFinanceiro = excluirFinanceiro;
window.aplicarFiltrosFinanceiro = aplicarFiltrosFinanceiro;
window.verDetalhesFinanceiro = verDetalhesFinanceiro;
window.confirmarPagamentoFinanceiro = confirmarPagamentoFinanceiro;
window.atualizarResumoAnual = atualizarResumoAnual;
window.parseValorMonetario = parseValorMonetario;
window.situacaoEntrada = situacaoEntrada;
window.abrirModalNovaTransacao = abrirModalNovaTransacao;
window.fecharModalNovaTransacao = fecharModalNovaTransacao;
window.salvarNovaTransacao = salvarNovaTransacao;
window.preencherDatalistParceiros = preencherDatalistParceiros;
window.statusPagamentoDe = statusPagamentoDe;

//console.log('💰 Módulo financeiro carregado (v2.8 — confirmar pagamento atualiza FINANCEIRO + PROCESSOS)');