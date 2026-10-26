// ==================== ESTADO ====================
let todasTransacoes = [];
let todosProcessosFinanceiro = [];
let filtroAtualFinanceiro = 'todos';

// ==================== INICIALIZAÇÃO ====================
async function inicializarFinanceiro() {
    //console.log('💰 Inicializando financeiro...');
    try {
        await aguardarElementos();
        await carregarTransacoes();
        await carregarProcessosParaSelect();
        await carregarProcessosParaSelectParcelas();
        initEventos();
        //console.log('✅ Financeiro inicializado com sucesso!');
    } catch (error) {
        console.error('❌ Erro ao inicializar financeiro:', error);
    }
}

function aguardarElementos() {
    return new Promise((resolve) => {
        const check = () => {
            const tbody = document.getElementById('tbodyFinanceiro');
            const recebidos = document.getElementById('totalRecebidos');
            if (tbody && recebidos) {
                resolve();
            } else {
                setTimeout(check, 100);
            }
        };
        check();
    });
}

// ==================== CARREGAR PROCESSOS ====================
async function carregarProcessosParaSelect() {
    try {
        const dados = await carregarComCache('PROCESSOS').catch(() => []);
        todosProcessosFinanceiro = dados.filter(p => p['N PROCESSO'] || p.CLIENTE);
        
        const select = document.getElementById('financeiroProcesso');
        if (select) {
            const valorAtual = select.value;
            select.innerHTML = '<option value="">Nenhum</option>';
            
            todosProcessosFinanceiro.forEach(p => {
                const option = document.createElement('option');
                const label = `${p['N PROCESSO']} - ${p.CLIENTE || 'Sem cliente'} (R$ ${p['VALOR DA CAUSA'] || '0,00'})`;
                option.value = p._row;
                option.textContent = label;
                select.appendChild(option);
            });
            
            if (valorAtual) select.value = valorAtual;
        }
        
        //console.log(`📋 ${todosProcessosFinanceiro.length} processos carregados`);
    } catch (error) {
        console.error('Erro ao carregar processos:', error);
    }
}

async function carregarProcessosParaSelectParcelas() {
    try {
        const dados = await carregarComCache('PROCESSOS').catch(() => []);
        const processos = dados.filter(p => p['N PROCESSO'] || p.CLIENTE);
        
        const select = document.getElementById('parcelaProcesso');
        if (!select) return;
        
        const valorAtual = select.value;
        select.innerHTML = '<option value="">Nenhum</option>';
        
        processos.forEach(p => {
            const option = document.createElement('option');
            const label = `${p['N PROCESSO']} - ${p.CLIENTE || 'Sem cliente'}`;
            option.value = p._row;
            option.textContent = label;
            select.appendChild(option);
        });
        
        if (valorAtual) select.value = valorAtual;
    } catch (error) {
        console.error('Erro ao carregar processos para parcelas:', error);
    }
}

// ==================== PREENCHER DADOS DO PROCESSO ====================
function preencherDadosProcesso() {
    const select = document.getElementById('financeiroProcesso');
    const row = parseInt(select.value);
    
    if (!row) {
        document.getElementById('financeiroCliente').value = '';
        document.getElementById('financeiroValor').value = '';
        document.getElementById('financeiroData').value = '';
        return;
    }
    
    const processo = todosProcessosFinanceiro.find(p => p._row === row);
    if (!processo) return;
    
    if (processo['DATA DA INTIMAÇÃO']) {
        document.getElementById('financeiroData').value = converterDataISO(processo['DATA DA INTIMAÇÃO']);
    }
    
    document.getElementById('financeiroCliente').value = processo.CLIENTE || '';
    document.getElementById('financeiroValor').value = processo['VALOR DA CAUSA'] || 'R$ 0,00';
    document.getElementById('financeiroFluxo').value = 'ENTRADA';
    document.getElementById('financeiroCategoria').value = 'HONORÁRIOS';
    document.getElementById('financeiroStatus').value = 'PENDENTE';
    
    notificar(`Dados do processo ${processo['N PROCESSO']} carregados!`, 'success');
}

// ==================== EVENTOS ====================
function initEventos() {
    document.getElementById('financeiroProcesso')?.addEventListener('change', preencherDadosProcesso);
    document.getElementById('btnNovaTransacao')?.addEventListener('click', () => abrirModalFinanceiro('novo'));
    document.getElementById('fecharModalFinanceiro')?.addEventListener('click', fecharModalFinanceiro);
    document.getElementById('cancelarFinanceiro')?.addEventListener('click', fecharModalFinanceiro);
    document.getElementById('salvarFinanceiro')?.addEventListener('click', salvarTransacao);
    
    document.getElementById('modalFinanceiro')?.addEventListener('click', function(e) {
        if (e.target === this) fecharModalFinanceiro();
    });
    
    document.getElementById('fecharModalParcelas')?.addEventListener('click', fecharModalParcelas);
    document.getElementById('cancelarParcelas')?.addEventListener('click', fecharModalParcelas);
    document.getElementById('modalParcelasParceiro')?.addEventListener('click', function(e) {
        if (e.target === this) fecharModalParcelas();
    });
    
    document.getElementById('btnParcelasParceiro')?.addEventListener('click', abrirModalParcelasParceiro);
    document.getElementById('btnGerarProcessos')?.addEventListener('click', gerarFinanceiroParaTodosProcessos);
    document.getElementById('btnRecalcularStatus')?.addEventListener('click', recalcularTodosStatusPagamento);
    
    document.getElementById('buscaFinanceiro')?.addEventListener('input', function() {
        filtrarTransacoes();
    });
    document.getElementById('filtroMesFinanceiro')?.addEventListener('change', filtrarTransacoes);
    
    document.querySelectorAll('.filtros-rapidos .filtro-btn').forEach(btn => {
        btn.addEventListener('click', function() {
            document.querySelectorAll('.filtros-rapidos .filtro-btn').forEach(b => b.classList.remove('active'));
            this.classList.add('active');
            filtroAtualFinanceiro = this.getAttribute('data-filtro');
            filtrarTransacoes();
        });
    });
    
    document.getElementById('financeiroValor')?.addEventListener('input', function(e) {
        let valor = e.target.value.replace(/\D/g, '');
        if (valor) {
            valor = (parseInt(valor) / 100).toLocaleString('pt-BR', { minimumFractionDigits: 2 });
            e.target.value = 'R$ ' + valor;
        } else {
            e.target.value = '';
        }
    });
    
    document.getElementById('parcelaValorTotal')?.addEventListener('input', function(e) {
        let valor = e.target.value.replace(/\D/g, '');
        if (valor) {
            valor = (parseInt(valor) / 100).toLocaleString('pt-BR', { minimumFractionDigits: 2 });
            e.target.value = 'R$ ' + valor;
        } else {
            e.target.value = '';
        }
    });
    
    document.getElementById('parcelaNumero')?.addEventListener('change', gerarCamposParcelas);
    document.getElementById('parcelaNumero')?.addEventListener('input', gerarCamposParcelas);
    document.getElementById('salvarParcelas')?.addEventListener('click', salvarParcelas);
}

// ==================== CARREGAR TRANSAÇÕES ====================
async function carregarTransacoes() {
    try {
        const dados = await carregarComCache('FINANCEIRO');
        todasTransacoes = dados.filter(t => t.DATA || t.CLIENTE);
        //console.log(`📋 Transações: ${todasTransacoes.length}`);
        atualizarResumo();
        renderizarGrafico();
        filtrarTransacoes();
    } catch (error) {
        console.error('Erro ao carregar financeiro:', error);
        const tbody = document.getElementById('tbodyFinanceiro');
        if (tbody) {
            tbody.innerHTML = '<tr class="row-empty"><td colspan="10"><i class="fas fa-exclamation-circle"></i> Erro ao carregar transações</td></tr>';
        }
    }
}

// ==================== ATUALIZAR RESUMO ====================
function atualizarResumo() {
    let recebidos = 0, aReceber = 0, despesas = 0, comissoes = 0, comissaoPaga = 0;

    todasTransacoes.forEach(t => {
        const valor = parseValor(t.VALOR);
        const fluxo = String(t.FLUXO || '').toUpperCase();
        const status = String(t.STATUS || '').toUpperCase();
        const categoria = String(t.CATEGORIA || '').toUpperCase();

        if (fluxo === 'ENTRADA' && status === 'PAGO') recebidos += valor;
        if (fluxo === 'ENTRADA' && (status === 'PENDENTE' || status === 'AGUARDANDO')) aReceber += valor;
        if (fluxo === 'SAÍDA' && status === 'PAGO') despesas += valor;
        if (fluxo === 'ENTRADA' && status === 'PAGO' && categoria === 'COMISSÃO PARCEIRO') comissoes += valor;
        if (fluxo === 'SAÍDA' && status === 'PAGO' && categoria === 'COMISSÃO PARCEIRO') comissaoPaga += valor;
    });

    const saldo = recebidos - despesas;

    const mesAtual = new Date().getMonth();
    let faturamentoMes = 0;
    todasTransacoes.forEach(t => {
        if (!t.DATA) return;
        const data = new Date(t.DATA);
        if (data.getMonth() === mesAtual && t.STATUS === 'PAGO') {
            const fluxo = String(t.FLUXO || '').toUpperCase();
            if (fluxo === 'ENTRADA') faturamentoMes += parseValor(t.VALOR);
        }
    });

    document.getElementById('totalRecebidos').textContent = formatarMoeda(recebidos);
    document.getElementById('totalAReceber').textContent = formatarMoeda(aReceber);
    document.getElementById('totalDespesas').textContent = formatarMoeda(despesas);
    document.getElementById('saldoGeral').textContent = formatarMoeda(saldo);
    document.getElementById('totalComissoes').textContent = formatarMoeda(comissoes);
    document.getElementById('totalComissaoPaga').textContent = formatarMoeda(comissaoPaga);
    document.getElementById('faturamentoMes').textContent = formatarMoeda(faturamentoMes);
}

// ==================== FILTRAR ====================
function filtrarTransacoes() {
    let filtradas = [...todasTransacoes];

    if (filtroAtualFinanceiro !== 'todos') {
        if (filtroAtualFinanceiro === 'PROCESSO') {
            filtradas = filtradas.filter(t => t.PROCESSO_REF && t.PROCESSO_REF !== '');
        } else if (filtroAtualFinanceiro === 'PARCEIRO') {
            filtradas = filtradas.filter(t => t.N_PARCELAS && t.N_PARCELAS !== '');
        } else {
            filtradas = filtradas.filter(t => String(t.FLUXO || '').toUpperCase() === filtroAtualFinanceiro);
        }
    }

    const mesFiltro = document.getElementById('filtroMesFinanceiro')?.value;
    if (mesFiltro && mesFiltro !== 'todos') {
        filtradas = filtradas.filter(t => {
            if (!t.DATA) return false;
            return new Date(t.DATA).getMonth() === parseInt(mesFiltro);
        });
    }

    const busca = (document.getElementById('buscaFinanceiro')?.value || '').toLowerCase().trim();
    if (busca) {
        filtradas = filtradas.filter(t =>
            String(t.CLIENTE || '').toLowerCase().includes(busca) ||
            String(t.CATEGORIA || '').toLowerCase().includes(busca) ||
            String(t.PROCESSO_REF || '').toLowerCase().includes(busca)
        );
    }

    filtradas.sort((a, b) => new Date(b.DATA || 0) - new Date(a.DATA || 0));
    renderizarTabela(filtradas);
    document.getElementById('contagemFinanceiro').textContent = `${filtradas.length} transações`;
}

// ==================== TABELA ====================
function renderizarTabela(transacoes) {
    const tbody = document.getElementById('tbodyFinanceiro');
    if (!tbody) return;

    if (!transacoes.length) {
        tbody.innerHTML = '<tr class="row-empty"><td colspan="10"><i class="fas fa-search"></i> Nenhuma transação encontrada</td></tr>';
        return;
    }

    tbody.innerHTML = transacoes.map(t => {
        const fluxo = String(t.FLUXO || '').toUpperCase();
        const fluxoClass = fluxo === 'ENTRADA' ? 'entrada' : fluxo === 'SAÍDA' ? 'saida' : 'comissao';
        const valor = parseValor(t.VALOR);
        const valorClass = fluxo === 'ENTRADA' ? 'valor-positivo' : fluxo === 'SAÍDA' ? 'valor-negativo' : 'valor-pendente';
        const statusClass = (t.STATUS || '').toLowerCase() === 'pago' ? 'pago' :
                           (t.STATUS || '').toLowerCase() === 'devolvido' ? 'devolvido' : 
                           (t.STATUS || '').toLowerCase() === 'cancelado' ? 'cancelado' :
                           (t.STATUS || '').toLowerCase() === 'pendente' ? 'pendente' : 'aguardando';

        let origem = 'manual', origemLabel = 'Manual';
        if (t.N_PARCELAS && t.N_PARCELAS !== '') {
            origem = 'parceiro';
            origemLabel = '🤝 Parceiro';
        } else if (t.PROCESSO_REF && t.PROCESSO_REF !== '') {
            origem = 'processo';
            origemLabel = '📋 Processo';
        }

        return `
            <tr>
                <td><span class="mono-text">${formatarData(t.DATA)}</span></td>
                <td><span class="badge-fluxo ${fluxoClass}">${esc(t.FLUXO)}</span></td>
                <td><strong>${esc(t.CLIENTE || '—')}</strong></td>
                <td>${esc(t.CATEGORIA || '—')}</td>
                <td><span class="${valorClass}">${formatarMoeda(valor)}</span></td>
                <td><span class="badge-parcela">${esc(t.N_PARCELAS || '1/1')}</span></td>
                <td><span class="status-pagamento ${statusClass}">${esc(t.STATUS)}</span></td>
                <td><span class="badge-origem ${origem}">${origemLabel}</span></td>
                <td>${t.COMPROVANTE ? `<a href="${esc(t.COMPROVANTE)}" target="_blank" class="documento-link"><i class="fas fa-file-invoice"></i> Ver</a>` : '—'}</td>
                <td>
                    <div class="acoes">
                        <button class="btn-icon-small" onclick="abrirEdicaoFinanceiro(${t._row})"><i class="fas fa-edit"></i></button>
                        <button class="btn-icon-small danger" onclick="confirmarExclusaoFinanceiro(${t._row})"><i class="fas fa-trash"></i></button>
                    </div>
                </td>
            </tr>
        `;
    }).join('');
}

// ==================== GRÁFICO ====================
function renderizarGrafico() {
    const container = document.getElementById('graficoAnual');
    if (!container) return;

    const meses = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];
    const entradasPorMes = new Array(12).fill(0);
    const saidasPorMes = new Array(12).fill(0);

    todasTransacoes.forEach(t => {
        if (!t.DATA) return;
        const mes = new Date(t.DATA).getMonth();
        const valor = parseValor(t.VALOR);
        const fluxo = String(t.FLUXO || '').toUpperCase();
        if (fluxo === 'ENTRADA' && t.STATUS === 'PAGO') entradasPorMes[mes] += valor;
        if (fluxo === 'SAÍDA' && t.STATUS === 'PAGO') saidasPorMes[mes] += valor;
    });

    const maxValor = Math.max(...entradasPorMes, ...saidasPorMes, 1);
    container.innerHTML = meses.map((mes, i) => {
        const alturaEntradas = (entradasPorMes[i] / maxValor) * 150;
        const alturaSaidas = (saidasPorMes[i] / maxValor) * 150;
        return `
            <div class="barra-mes">
                <div style="display: flex; gap: 2px; align-items: flex-end; height: 150px;">
                    ${entradasPorMes[i] > 0 ? `<div class="barra entradas" style="height: ${alturaEntradas}px;" title="Entradas: ${formatarMoeda(entradasPorMes[i])}"></div>` : ''}
                    ${saidasPorMes[i] > 0 ? `<div class="barra saidas" style="height: ${alturaSaidas}px;" title="Saídas: ${formatarMoeda(saidasPorMes[i])}"></div>` : ''}
                </div>
                <span class="barra-label">${mes}</span>
                ${entradasPorMes[i] > 0 ? `<span class="barra-valor" style="color: var(--success);">+${formatarMoeda(entradasPorMes[i])}</span>` : ''}
            </div>
        `;
    }).join('');
}

// ==================== MODAL PRINCIPAL ====================
function abrirModalFinanceiro(modo, dados) {
    const modal = document.getElementById('modalFinanceiro');
    if (!modal) { console.warn('⚠️ Modal financeiro não encontrado'); return; }
    document.getElementById('formFinanceiro').reset();
    carregarProcessosParaSelect();

    if (modo === 'edicao' && dados) {
        document.getElementById('modalTituloFinanceiro').textContent = 'Editar Transação';
        document.getElementById('financeiroRow').value = dados._row || '';
        document.getElementById('financeiroFluxo').value = dados.FLUXO || 'ENTRADA';
        document.getElementById('financeiroCategoria').value = dados.CATEGORIA || 'HONORÁRIOS';
        document.getElementById('financeiroTipoPag').value = dados.TIPO_PAG || '';
        document.getElementById('financeiroCliente').value = dados.CLIENTE || '';
        document.getElementById('financeiroProcesso').value = dados.PROCESSO_REF || '';
        document.getElementById('financeiroValor').value = dados.VALOR || '';
        document.getElementById('financeiroParcelas').value = dados.N_PARCELAS || '';
        document.getElementById('financeiroStatus').value = dados.STATUS || 'PENDENTE';
        document.getElementById('financeiroComprovante').value = dados.COMPROVANTE || '';
        document.getElementById('financeiroObs').value = dados.OBS || '';
        document.getElementById('financeiroData').value = converterDataISO(dados.DATA);
    } else {
        document.getElementById('modalTituloFinanceiro').textContent = 'Nova Transação';
        document.getElementById('financeiroRow').value = '';
        document.getElementById('financeiroData').value = new Date().toISOString().split('T')[0];
        document.getElementById('financeiroStatus').value = 'PENDENTE';
        document.getElementById('financeiroFluxo').value = 'ENTRADA';
        document.getElementById('financeiroCategoria').value = 'HONORÁRIOS';
        document.getElementById('financeiroValor').value = '';
        document.getElementById('financeiroParcelas').value = '';
        document.getElementById('financeiroTipoPag').value = '';
    }
    modal.classList.add('active');
}

function fecharModalFinanceiro() {
    document.getElementById('modalFinanceiro')?.classList.remove('active');
}

// ==================== SALVAR TRANSAÇÃO ====================
async function salvarTransacao() {
    const row = document.getElementById('financeiroRow')?.value;
    const valor = document.getElementById('financeiroValor')?.value?.trim() || '';

    if (!valor || valor === 'R$ 0,00' || valor === '') {
        notificar('Informe um valor válido!', 'warning');
        return;
    }

    const dados = {
        'DATA': document.getElementById('financeiroData')?.value || '',
        'FLUXO': document.getElementById('financeiroFluxo')?.value || 'ENTRADA',
        'CATEGORIA': document.getElementById('financeiroCategoria')?.value || 'HONORÁRIOS',
        'TIPO_PAG': document.getElementById('financeiroTipoPag')?.value || '',
        'CLIENTE': document.getElementById('financeiroCliente')?.value?.trim() || '',
        'PROCESSO_REF': document.getElementById('financeiroProcesso')?.value || '',
        'VALOR': valor,
        'N_PARCELAS': document.getElementById('financeiroParcelas')?.value?.trim() || '',
        'COMPROVANTE': document.getElementById('financeiroComprovante')?.value?.trim() || '',
        'STATUS': document.getElementById('financeiroStatus')?.value || 'PENDENTE',
        'OBS': document.getElementById('financeiroObs')?.value?.trim() || ''
    };

    if (!dados['DATA'] || !dados['VALOR']) {
        notificar('Preencha Data e Valor!', 'warning');
        return;
    }

    try {
        const btnSalvar = document.getElementById('salvarFinanceiro');
        if (btnSalvar) {
            btnSalvar.disabled = true;
            btnSalvar.innerHTML = '<i class="fas fa-spinner fa-pulse"></i> Salvando...';
        }
        if (row) {
            await apiUpdate('FINANCEIRO', parseInt(row), dados);
            notificar('Transação atualizada!', 'success');
        } else {
            await apiCreate('FINANCEIRO', dados);
            notificar('Transação cadastrada!', 'success');
        }
        fecharModalFinanceiro();
        await carregarTransacoes();
        await carregarProcessosParaSelect();
    } catch (error) {
        console.error('Erro ao salvar:', error);
        notificar('Erro: ' + error.message, 'error');
    } finally {
        const btnSalvar = document.getElementById('salvarFinanceiro');
        if (btnSalvar) {
            btnSalvar.disabled = false;
            btnSalvar.innerHTML = '<i class="fas fa-save"></i> Salvar';
        }
    }
}

// ==================== PARCELAS PARCEIRO ====================
function abrirModalParcelasParceiro() {
    const modal = document.getElementById('modalParcelasParceiro');
    if (!modal) return;
    document.getElementById('formParcelas').reset();
    document.getElementById('parcelaNumero').value = 1;
    document.getElementById('parcelaValorTotal').value = '';
    carregarProcessosParaSelectParcelas();
    gerarCamposParcelas();
    modal.classList.add('active');
}

function fecharModalParcelas() {
    document.getElementById('modalParcelasParceiro')?.classList.remove('active');
}

function gerarCamposParcelas() {
    const numParcelas = parseInt(document.getElementById('parcelaNumero')?.value) || 1;
    const container = document.getElementById('containerParcelas');
    if (!container) return;
    
    let html = `<h4 style="margin-top: 0.5rem; color: var(--gold-600);">📅 Datas das Parcelas</h4>`;
    html += `<div style="display: grid; grid-template-columns: repeat(auto-fill, minmax(200px, 1fr)); gap: 0.5rem; margin-top: 0.5rem;">`;
    const hoje = new Date();
    
    for (let i = 1; i <= numParcelas; i++) {
        const dataSugerida = new Date(hoje);
        dataSugerida.setMonth(hoje.getMonth() + i);
        const dataStr = dataSugerida.toISOString().split('T')[0];
        html += `
            <div class="campo-parcela">
                <label>Parcela ${i}/${numParcelas}</label>
                <input type="date" id="parcelaData_${i}" value="${dataStr}">
                <div class="parcela-check">
                    <input type="checkbox" id="parcelaPaga_${i}">
                    <label for="parcelaPaga_${i}">Paga</label>
                </div>
            </div>
        `;
    }
    html += `</div>`;
    container.innerHTML = html;
}

async function salvarParcelas() {
    const parceiro = document.getElementById('parcelaParceiro')?.value?.trim();
    const descricao = document.getElementById('parcelaDescricao')?.value?.trim();
    const valorTotal = document.getElementById('parcelaValorTotal')?.value || 'R$ 0,00';
    const numParcelas = parseInt(document.getElementById('parcelaNumero')?.value) || 1;
    const tipoPag = document.getElementById('parcelaTipoPag')?.value || '';
    const processoRef = document.getElementById('parcelaProcesso')?.value || '';
    
    if (!parceiro || !descricao) {
        notificar('Preencha Nome do Parceiro e Descrição!', 'warning');
        return;
    }
    
    const valorPorParcela = parseValor(valorTotal) / numParcelas;
    
    try {
        const btnSalvar = document.getElementById('salvarParcelas');
        btnSalvar.disabled = true;
        btnSalvar.innerHTML = '<i class="fas fa-spinner fa-pulse"></i> Salvando...';
        let salvos = 0;
        
        for (let i = 1; i <= numParcelas; i++) {
            const dataParcela = document.getElementById(`parcelaData_${i}`)?.value || new Date().toISOString().split('T')[0];
            const paga = document.getElementById(`parcelaPaga_${i}`)?.checked || false;
            
            const transacao = {
                'DATA': dataParcela,
                'FLUXO': 'ENTRADA',
                'CATEGORIA': 'COMISSÃO PARCEIRO',
                'TIPO_PAG': tipoPag,
                'CLIENTE': parceiro,
                'PROCESSO_REF': processoRef,
                'VALOR': formatarMoeda(valorPorParcela),
                'N_PARCELAS': `${i}/${numParcelas}`,
                'COMPROVANTE': '',
                'STATUS': paga ? 'PAGO' : 'PENDENTE',
                'OBS': `${descricao} - Parcela ${i}/${numParcelas}`
            };
            await apiCreate('FINANCEIRO', transacao);
            salvos++;
        }
        notificar(`✅ ${salvos} parcelas salvas com sucesso!`, 'success');
        fecharModalParcelas();
        await carregarTransacoes();
    } catch (error) {
        console.error('Erro ao salvar parcelas:', error);
        notificar('Erro ao salvar: ' + error.message, 'error');
    } finally {
        const btnSalvar = document.getElementById('salvarParcelas');
        if (btnSalvar) {
            btnSalvar.disabled = false;
            btnSalvar.innerHTML = '<i class="fas fa-save"></i> Salvar parcelas';
        }
    }
}

// ==================== GERAR FINANCEIRO DOS PROCESSOS (CORRIGIDO) ====================
async function gerarFinanceiroParaTodosProcessos() {
    //console.log('🔄 Gerando financeiro para todos os processos...');
    try {
        // Busca todos os processos (forçando dados frescos)
        const processos = await carregarComCache('PROCESSOS', true).catch(() => []);
        
        // Busca transações existentes para verificar duplicidade (dados frescos)
        const transacoesExistentes = await carregarComCache('FINANCEIRO', true).catch(() => []);
        
        // Cria um Set com os PROCESSO_REF já existentes
        const existentes = new Set();
        transacoesExistentes.forEach(t => {
            if (t.PROCESSO_REF) {
                existentes.add(String(t.PROCESSO_REF).trim().toUpperCase());
            }
        });
        
        let gerados = 0;
        let ignorados = 0;
        let erros = 0;
        
        for (const p of processos) {
            const numProcesso = String(p['N PROCESSO'] || '').trim();
            const valorCausa = parseValor(p['VALOR DA CAUSA']);
            
            // Pula se não tem número de processo ou valor = 0
            if (!numProcesso || valorCausa === 0) continue;
            
            // Verifica se já existe
            const chave = numProcesso.toUpperCase();
            if (existentes.has(chave)) {
                ignorados++;
                continue;
            }
            
            try {
                // DATA = DATA DA INTIMAÇÃO
                let data = p['DATA DA INTIMAÇÃO'] || '';
                if (data) {
                    // Tenta converter para ISO
                    const dataObj = new Date(data);
                    if (!isNaN(dataObj.getTime())) {
                        data = dataObj.toISOString().split('T')[0];
                    } else {
                        // Se não conseguiu, usa hoje
                        data = new Date().toISOString().split('T')[0];
                    }
                } else {
                    data = new Date().toISOString().split('T')[0];
                }
                
                const transacao = {
                    'DATA': data,
                    'FLUXO': 'ENTRADA',
                    'CATEGORIA': 'HONORÁRIOS',
                    'TIPO_PAG': '',
                    'CLIENTE': p['CLIENTE'] || '',
                    'PROCESSO_REF': numProcesso,
                    'VALOR': formatarMoeda(valorCausa),
                    'N_PARCELAS': '',
                    'COMPROVANTE': '',
                    'STATUS': 'PENDENTE',
                    'OBS': ''
                };
                
                await apiCreate('FINANCEIRO', transacao);
                existentes.add(chave);
                gerados++;
                //console.log(`✅ Gerado: ${numProcesso} - R$ ${formatarMoeda(valorCausa)}`);
            } catch (error) {
                erros++;
                console.error(`❌ Erro ao gerar ${numProcesso}:`, error);
            }
        }
        
        const msg = `✅ ${gerados} transações geradas, ${ignorados} já existiam${erros > 0 ? `, ${erros} erros` : ''}!`;
        notificar(msg, erros > 0 ? 'warning' : 'success');
        
        await carregarTransacoes();
        return gerados;
    } catch (error) {
        console.error('Erro ao gerar:', error);
        notificar('Erro ao gerar: ' + error.message, 'error');
        return 0;
    }
}

// ==================== ATUALIZAR STATUS_PAG ====================
async function atualizarStatusPagamentoProcesso(processoRow) {
    if (!processoRow) return null;
    try {
        const processo = await apiGet('PROCESSOS', parseInt(processoRow));
        if (!processo) return null;
        
        const transacoesPagas = todasTransacoes.filter(t => 
            t.PROCESSO_REF && String(t.PROCESSO_REF).trim().toUpperCase() === String(processo['N PROCESSO']).trim().toUpperCase() &&
            String(t.STATUS || '').toUpperCase() === 'PAGO'
        );
        
        let totalRecebido = 0;
        transacoesPagas.forEach(t => { totalRecebido += parseValor(t.VALOR); });
        
        const valorCausa = parseValor(processo['VALOR DA CAUSA']);
        let statusPag = 'AGUARDANDO';
        if (totalRecebido === 0) statusPag = 'AGUARDANDO';
        else if (totalRecebido >= valorCausa && valorCausa > 0) statusPag = 'RECEBIDO';
        else if (totalRecebido > 0 && totalRecebido < valorCausa) statusPag = 'PARCIAL';
        else if (valorCausa === 0 && totalRecebido > 0) statusPag = 'RECEBIDO';
        
        const dadosAtualizados = { 
            ...processo, 
            'STATUS_PAG': statusPag, 
            'VALOR_RECEBIDO': formatarMoeda(totalRecebido) 
        };
        const { _row, ...dadosParaEnviar } = dadosAtualizados;
        await apiUpdate('PROCESSOS', parseInt(processoRow), dadosParaEnviar);
        return statusPag;
    } catch (error) {
        console.error('❌ Erro ao atualizar STATUS_PAG:', error);
        return null;
    }
}

// ==================== RECALCULAR TODOS ====================
async function recalcularTodosStatusPagamento() {
    //console.log('🔄 Recalculando STATUS_PAG de todos os processos...');
    try {
        const processos = await carregarComCache('PROCESSOS').catch(() => []);
        let atualizados = 0;
        for (const p of processos) {
            if (p._row) {
                const resultado = await atualizarStatusPagamentoProcesso(p._row);
                if (resultado) atualizados++;
            }
        }
        notificar(`✅ ${atualizados} processos atualizados!`, 'success');
        await carregarTransacoes();
        return atualizados;
    } catch (error) {
        console.error('Erro ao recalcular:', error);
        notificar('Erro ao recalcular: ' + error.message, 'error');
        return 0;
    }
}

// ==================== EDIÇÃO E EXCLUSÃO ====================
async function abrirEdicaoFinanceiro(row) {
    try {
        const transacao = await apiGet('FINANCEIRO', row);
        abrirModalFinanceiro('edicao', transacao);
    } catch (error) {
        console.error('Erro ao carregar transação:', error);
        notificar('Erro ao carregar dados', 'error');
    }
}

async function confirmarExclusaoFinanceiro(row) {
    if (!confirm('Excluir esta transação?')) return;
    try {
        const transacao = await apiGet('FINANCEIRO', row);
        const processoRef = transacao.PROCESSO_REF;
        
        await apiDelete('FINANCEIRO', row);
        notificar('Transação excluída!', 'success');
        
        if (processoRef) {
            await atualizarStatusPagamentoProcesso(processoRef);
        }
        
        await carregarTransacoes();
    } catch (error) {
        console.error('Erro ao excluir:', error);
        notificar('Erro ao excluir', 'error');
    }
}

// ==================== ATALHOS ====================
document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
        fecharModalFinanceiro();
        fecharModalParcelas();
    }
    if (e.ctrlKey && e.key === 'f') {
        e.preventDefault();
        const busca = document.getElementById('buscaFinanceiro');
        if (busca) busca.focus();
    }
});

// ==================== EXPORTAÇÃO GLOBAL ====================
window.inicializarFinanceiro = inicializarFinanceiro;
window.abrirModalFinanceiro = abrirModalFinanceiro;
window.fecharModalFinanceiro = fecharModalFinanceiro;
window.salvarTransacao = salvarTransacao;
window.abrirEdicaoFinanceiro = abrirEdicaoFinanceiro;
window.confirmarExclusaoFinanceiro = confirmarExclusaoFinanceiro;
window.recalcularTodosStatusPagamento = recalcularTodosStatusPagamento;
window.atualizarStatusPagamentoProcesso = atualizarStatusPagamentoProcesso;
window.carregarTransacoes = carregarTransacoes;
window.carregarProcessosParaSelect = carregarProcessosParaSelect;
window.gerarFinanceiroParaTodosProcessos = gerarFinanceiroParaTodosProcessos;
window.abrirModalParcelasParceiro = abrirModalParcelasParceiro;
window.fecharModalParcelas = fecharModalParcelas;
window.gerarCamposParcelas = gerarCamposParcelas;
window.salvarParcelas = salvarParcelas;

//console.log('📋 Módulo financeiro carregado com sucesso!');
//console.log('💰 Comandos disponíveis:');
//console.log('   - gerarFinanceiroParaTodosProcessos() → Gerar transações dos processos');
//console.log('   - recalcularTodosStatusPagamento() → Recalcular STATUS_PAG de todos os processos');
//console.log('   - carregarTransacoes() → Recarregar transações');