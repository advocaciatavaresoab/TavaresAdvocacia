// ==================== ESTADO ====================
let todosParceiros = [];
let todosFinanceirosParceiros = [];
let metricasPorParceiro = {};
let filtroAtualParceiros = 'todos';
let salvandoParceiro = false;

// ==================== INICIALIZAÇÃO ====================
async function inicializarParceiros() {
    //console.log('🤝 Inicializando parceiros...');
    
    await aguardarElementosParceiros();
    await carregarParceiros();
    initEventosParceiros();
    
    //console.log('✅ Módulo parceiros inicializado');
}

function aguardarElementosParceiros() {
    return new Promise((resolve) => {
        const check = () => {
            const tabela = document.getElementById('tbodyParceiros');
            const busca = document.getElementById('buscaParceiro');
            if (tabela && busca) {
                resolve();
            } else {
                setTimeout(check, 100);
            }
        };
        check();
    });
}

function initEventosParceiros() {
    // Busca
    document.getElementById('buscaParceiro')?.addEventListener('input', debounce(() => {
        aplicarFiltrosParceiros();
    }, 300));

    // Filtros — escopados em #pageParceiros
    document.querySelectorAll('#pageParceiros .filtros-rapidos .filtro-btn').forEach(btn => {
        btn.addEventListener('click', function() {
            const container = this.closest('.filtros-rapidos');
            if (container) {
                container.querySelectorAll('.filtro-btn').forEach(b => b.classList.remove('active'));
            }
            this.classList.add('active');
            filtroAtualParceiros = this.getAttribute('data-filtro');
            aplicarFiltrosParceiros();
        });
    });

    // Modal de Cadastro/Edição
    document.getElementById('btnNovoParceiro')?.addEventListener('click', () => abrirModalParceiro('novo'));
    document.getElementById('fecharModalParceiro')?.addEventListener('click', fecharModalParceiro);
    document.getElementById('cancelarParceiro')?.addEventListener('click', fecharModalParceiro);
    document.getElementById('salvarParceiro')?.addEventListener('click', salvarParceiro);

    // Modal de Visualização
    document.getElementById('fecharModalVisualizar')?.addEventListener('click', fecharModalVisualizar);
    document.getElementById('btnFecharVisualizacao')?.addEventListener('click', fecharModalVisualizar);
    document.getElementById('btnEditarDoVisualizar')?.addEventListener('click', editarDoVisualizar);
}

// ==================== CARREGAMENTO ====================
async function carregarParceiros() {
    try {
        // Usa o cache centralizado — evita requisições duplicadas
        const [dadosParceiros, dadosFinanceiros] = await Promise.all([
            carregarComCache('PARCEIROS'),
            carregarComCache('FINANCEIRO')
        ]);
        
        todosParceiros = dadosParceiros.filter(p => p.NOME && String(p.NOME).trim());
        todosFinanceirosParceiros = dadosFinanceiros;
        
        //console.log(`📋 Parceiros válidos: ${todosParceiros.length}`);
        //console.log(`💰 Lançamentos financeiros: ${todosFinanceirosParceiros.length}`);
        
        // Calcula métricas de cada parceiro
        calcularMetricasTodosParceiros();
        
        atualizarStatsParceiros();
        aplicarFiltrosParceiros();
    } catch (error) {
        console.error('Erro ao carregar parceiros:', error);
        const tbody = document.getElementById('tbodyParceiros');
        if (tbody) tbody.innerHTML = '<tr class="row-empty"><td colspan="10">Erro ao carregar</td></tr>';
    }
}

// ==================== CÁLCULO DE MÉTRICAS ====================
function parseValorLocal(v) {
    if (!v) return 0;
    if (typeof v === 'number') return v;
    let s = String(v).trim().replace(/R\$/g, '').trim();
    s = s.replace(/[^\d,.]/g, '');
    if (!s) return 0;
    if (s.includes(',')) {
        s = s.replace(/\./g, '').replace(',', '.');
    }
    return parseFloat(s) || 0;
}

function normalizarNome(nome) {
    return String(nome || '').trim().toLowerCase();
}

function calcularMetricasTodosParceiros() {
    metricasPorParceiro = {};
    
    // Inicializa métricas
    todosParceiros.forEach(p => {
        const chave = normalizarNome(p.NOME);
        metricasPorParceiro[chave] = {
            faturamento: 0,
            pago: 0,
            lucro: 0,
            indicacoes: 0,
            _processosUnicos: new Set(),
            _clientesUnicos: new Set()
        };
    });
    
    // Percorre lançamentos financeiros
    todosFinanceirosParceiros.forEach(lanc => {
        const parceiroNome = normalizarNome(lanc.PARCEIRO);
        if (!parceiroNome) return;
        if (!metricasPorParceiro[parceiroNome]) return;
        
        const categoria = String(lanc.CATEGORIA || '').toUpperCase().trim();
        const fluxo = String(lanc.FLUXO || '').toUpperCase().trim();
        const valor = parseValorLocal(lanc.VALOR);
        
        // Só considera COMISSÃO PARCEIRO
        if (!categoria.includes('COMISSAO')) return;
        
        const m = metricasPorParceiro[parceiroNome];
        
        if (fluxo === 'ENTRADA') {
            m.faturamento += valor;
        } else if (fluxo === 'SAIDA') {
            m.pago += valor;
        }
        
        // Indicações únicas
        const processo = String(lanc.PROCESSO_REF || '').trim().toLowerCase();
        const cliente = String(lanc.CLIENTE || '').trim().toLowerCase();
        
        if (processo) {
            m._processosUnicos.add(processo);
        } else if (cliente) {
            m._clientesUnicos.add(cliente);
        }
    });
    
    // Finaliza
    Object.keys(metricasPorParceiro).forEach(chave => {
        const m = metricasPorParceiro[chave];
        m.lucro = m.faturamento - m.pago;
        m.indicacoes = m._processosUnicos.size + m._clientesUnicos.size;
        delete m._processosUnicos;
        delete m._clientesUnicos;
    });
    
    //console.log(`📊 Métricas calculadas para ${Object.keys(metricasPorParceiro).length} parceiros`);
}

function obterMetricasParceiro(nomeParceiro) {
    const chave = normalizarNome(nomeParceiro);
    return metricasPorParceiro[chave] || {
        faturamento: 0,
        pago: 0,
        lucro: 0,
        indicacoes: 0
    };
}

// ==================== STATS GLOBAIS ====================
function atualizarStatsParceiros() {
    const total = todosParceiros.length;
    const ativos = todosParceiros.filter(p => (p.STATUS || 'ATIVO').toUpperCase() === 'ATIVO').length;
    const inativos = todosParceiros.filter(p => (p.STATUS || 'ATIVO').toUpperCase() === 'INATIVO').length;
    
    let totalFaturado = 0;
    let totalPago = 0;
    let totalIndicacoes = 0;
    
    Object.values(metricasPorParceiro).forEach(m => {
        totalFaturado += m.faturamento;
        totalPago += m.pago;
        totalIndicacoes += m.indicacoes;
    });
    
    const lucro = totalFaturado - totalPago;
    
    setText('totalParceiros', total);
    setText('parceirosAtivos', ativos);
    setText('parceirosInativos', inativos);
    setText('totalIndicacoesParceiros', totalIndicacoes);
    setText('totalFaturamentoParceiros', formatarMoeda(totalFaturado));
    setText('totalPagoParceiros', formatarMoeda(totalPago));
    setText('lucroParceiros', formatarMoeda(lucro));
}

// ==================== FILTROS ====================
function aplicarFiltrosParceiros() {
    let filtrados = [...todosParceiros];
    
    if (filtroAtualParceiros === 'ATIVO') {
        filtrados = filtrados.filter(p => (p.STATUS || 'ATIVO').toUpperCase() === 'ATIVO');
    } else if (filtroAtualParceiros === 'INATIVO') {
        filtrados = filtrados.filter(p => (p.STATUS || 'ATIVO').toUpperCase() === 'INATIVO');
    }
    
    const busca = (document.getElementById('buscaParceiro')?.value || '').toLowerCase().trim();
    if (busca) {
        filtrados = filtrados.filter(p => 
            String(p.NOME || '').toLowerCase().includes(busca) ||
            String(p.Especialidade || '').toLowerCase().includes(busca) ||
            String(p.Cidade || '').toLowerCase().includes(busca) ||
            String(p.Email || '').toLowerCase().includes(busca) ||
            String(p.Escritorio || p.ESCRITORIO || '').toLowerCase().includes(busca)
        );
    }
    
    renderizarTabelaParceiros(filtrados);
    setText('contagemParceiros', `${filtrados.length} de ${todosParceiros.length} registros`);
}

// ==================== TABELA ====================
function renderizarTabelaParceiros(parceiros) {
    const tbody = document.getElementById('tbodyParceiros');
    if (!tbody) return;
    
    if (!parceiros.length) {
        tbody.innerHTML = '<tr class="row-empty"><td colspan="10"><i class="fas fa-search"></i> Nenhum parceiro encontrado</td></tr>';
        return;
    }
    
    tbody.innerHTML = parceiros.map(p => {
        const nome = esc(p.NOME || '');
        const status = (p.STATUS || 'ATIVO').toUpperCase();
        const statusClass = status === 'ATIVO' ? 'active' : 'pending';
        
        const m = obterMetricasParceiro(p.NOME);
        
        return `
            <tr>
                <td>
                    <div class="parceiro-nome">
                        <div class="avatar-small">
                            <i class="fa-solid fa-handshake"></i>
                        </div>
                        <div>
                            <strong>${nome}</strong>
                            <br><small class="text-muted">${esc(p.Especialidade || '')}</small>
                        </div>
                    </div>
                </td>
                <td><i class="fas fa-building"></i> ${esc(p.Escritorio || p.ESCRITORIO || '—')}</td>
                <td><i class="fas fa-phone"></i> ${esc(p.Contato || p.CONTATO || '—')}</td>
                <td>${p.Email ? `<i class="fas fa-envelope"></i> ${esc(p.Email)}` : '—'}</td>
                <td><i class="fas fa-map-marker-alt"></i> ${esc(p.Cidade || '—')}</td>
                <td><span class="badge-indicacoes">${m.indicacoes} ${m.indicacoes === 1 ? 'indicação' : 'indicações'}</span></td>
                <td><span class="faturamento-texto">${formatarMoeda(m.faturamento)}</span></td>
                <td><span class="pagamento-texto">${formatarMoeda(m.pago)}</span></td>
                <td><span class="status ${statusClass}">${esc(status)}</span></td>
                <td>
                    <div class="acoes">
                        <button class="btn-icon-small" title="Visualizar" onclick="verDetalhesParceiro(${p._row})">
                            <i class="fas fa-eye"></i>
                        </button>
                        <button class="btn-icon-small" title="Editar" onclick="abrirEdicaoParceiro(${p._row})">
                            <i class="fas fa-edit"></i>
                        </button>
                        <button class="btn-icon-small danger" title="Excluir" onclick="confirmarExclusaoParceiro(${p._row})">
                            <i class="fas fa-trash"></i>
                        </button>
                    </div>
                </td>
            </tr>
        `;
    }).join('');
}

// ==================== MODAL DE VISUALIZAÇÃO ====================
function verDetalhesParceiro(row) {
    const p = todosParceiros.find(x => x._row === row);
    if (!p) {
        notificar('Parceiro não encontrado', 'error');
        return;
    }
    
    const m = obterMetricasParceiro(p.NOME);
    
    document.getElementById('vizParceiroNome').textContent = p.NOME || '—';
    document.getElementById('vizParceiroEspecialidade').textContent = p.Especialidade || '—';
    document.getElementById('vizParceiroEscritorio').textContent = p.Escritorio || p.ESCRITORIO || '—';
    document.getElementById('vizParceiroContato').textContent = p.Contato || p.CONTATO || '—';
    document.getElementById('vizParceiroEmail').textContent = p.Email || '—';
    document.getElementById('vizParceiroCidade').textContent = p.Cidade || '—';
    document.getElementById('vizParceiroIndicacoes').textContent = m.indicacoes;
    document.getElementById('vizParceiroFaturamento').textContent = formatarMoeda(m.faturamento);
    document.getElementById('vizParceiroPagamento').textContent = formatarMoeda(m.pago);
    document.getElementById('vizParceiroLucro').textContent = formatarMoeda(m.lucro);
    
    const statusElement = document.getElementById('vizParceiroStatus');
    const status = (p.STATUS || 'ATIVO').toUpperCase();
    statusElement.textContent = status;
    statusElement.className = 'status ' + (status === 'ATIVO' ? 'active' : 'pending');
    
    document.getElementById('modalVisualizarParceiro').dataset.parceiroRow = row;
    document.getElementById('modalVisualizarParceiro').classList.add('active');
}

function fecharModalVisualizar() {
    document.getElementById('modalVisualizarParceiro')?.classList.remove('active');
}

function editarDoVisualizar() {
    const row = document.getElementById('modalVisualizarParceiro')?.dataset.parceiroRow;
    if (row) {
        fecharModalVisualizar();
        abrirEdicaoParceiro(parseInt(row));
    }
}

// ==================== MODAL DE CADASTRO/EDIÇÃO ====================
function abrirModalParceiro(modo, dados) {
    const modal = document.getElementById('modalParceiro');
    const titulo = document.getElementById('modalTituloParceiro');
    const form = document.getElementById('formParceiro');
    if (!modal || !form) return;
    
    form.reset();
    
    // Restaura o botão Salvar
    const btnSalvar = document.getElementById('salvarParceiro');
    if (btnSalvar) {
        btnSalvar.disabled = false;
        btnSalvar.innerHTML = '<i class="fas fa-save"></i> Salvar';
    }
    
    if (modo === 'edicao' && dados) {
        titulo.textContent = 'Editar Parceiro';
        document.getElementById('parceiroRow').value = dados._row || '';
        document.getElementById('parceiroNome').value = dados.NOME || '';
        document.getElementById('parceiroEspecialidade').value = dados.Especialidade || '';
        document.getElementById('parceiroEscritorio').value = dados.Escritorio || dados.ESCRITORIO || '';
        document.getElementById('parceiroContato').value = dados.Contato || dados.CONTATO || '';
        document.getElementById('parceiroEmail').value = dados.Email || '';
        document.getElementById('parceiroCidade').value = dados.Cidade || '';
        document.getElementById('parceiroStatus').value = dados.STATUS || 'ATIVO';
    } else {
        titulo.textContent = 'Novo Parceiro';
        document.getElementById('parceiroRow').value = '';
        document.getElementById('parceiroStatus').value = 'ATIVO';
    }
    
    modal.classList.add('active');
}

function fecharModalParceiro() {
    document.getElementById('modalParceiro')?.classList.remove('active');
    
    // Restaura o botão Salvar ao fechar
    const btnSalvar = document.getElementById('salvarParceiro');
    if (btnSalvar) {
        btnSalvar.disabled = false;
        btnSalvar.innerHTML = '<i class="fas fa-save"></i> Salvar';
    }
    salvandoParceiro = false;
}

// ==================== SALVAR PARCEIRO (com loading) ====================
async function salvarParceiro() {
    // 🔒 Evita duplo clique
    if (salvandoParceiro) {
        notificar('Aguarde, salvando...', 'warning');
        return;
    }
    
    const row = document.getElementById('parceiroRow')?.value;
    
    const dados = {
        'NOME': document.getElementById('parceiroNome')?.value?.trim() || '',
        'Especialidade': document.getElementById('parceiroEspecialidade')?.value?.trim() || '',
        'ESCRITORIO': document.getElementById('parceiroEscritorio')?.value?.trim() || '',
        'Contato': document.getElementById('parceiroContato')?.value?.trim() || '',
        'Email': document.getElementById('parceiroEmail')?.value?.trim() || '',
        'Cidade': document.getElementById('parceiroCidade')?.value?.trim() || '',
        'STATUS': document.getElementById('parceiroStatus')?.value || 'ATIVO'
    };
    
    // Validações
    if (!dados['NOME']) {
        notificar('Preencha o nome do parceiro!', 'warning');
        return;
    }
    
    if (!dados['Especialidade']) {
        notificar('Preencha a especialidade!', 'warning');
        return;
    }
    
    if (!dados['Contato']) {
        notificar('Preencha o contato!', 'warning');
        return;
    }
    
    // 🔒 Ativa estado de "salvando"
    salvandoParceiro = true;
    const btnSalvar = document.getElementById('salvarParceiro');
    if (btnSalvar) {
        btnSalvar.disabled = true;
        btnSalvar.innerHTML = '<i class="fas fa-spinner fa-pulse"></i> Salvando...';
    }
    
    try {
        if (row) {
            await apiUpdate('PARCEIROS', parseInt(row), dados);
            notificar('Parceiro atualizado com sucesso!', 'success');
        } else {
            await apiCreate('PARCEIROS', dados);
            notificar('Parceiro cadastrado com sucesso!', 'success');
        }
        
        // Invalida cache
        invalidarCacheAposEscrita('PARCEIROS');
        
        fecharModalParceiro();
        await carregarParceiros();
    } catch (error) {
        console.error('Erro ao salvar parceiro:', error);
        notificar('Erro ao salvar: ' + error.message, 'error');
    } finally {
        // 🔓 Sempre restaura o botão, independente do resultado
        salvandoParceiro = false;
        if (btnSalvar) {
            btnSalvar.disabled = false;
            btnSalvar.innerHTML = '<i class="fas fa-save"></i> Salvar';
        }
    }
}

async function abrirEdicaoParceiro(row) {
    const parceiro = todosParceiros.find(p => p._row === row);
    if (!parceiro) {
        notificar('Parceiro não encontrado', 'error');
        return;
    }
    abrirModalParceiro('edicao', parceiro);
}

async function confirmarExclusaoParceiro(row) {
    const p = todosParceiros.find(x => x._row === row);
    const nome = p?.NOME || 'este parceiro';
    
    if (!confirm(`Tem certeza que deseja excluir o parceiro "${nome}"?\n\nEsta ação não pode ser desfeita!`)) return;
    
    try {
        await apiDelete('PARCEIROS', row);
        invalidarCacheAposEscrita('PARCEIROS');
        notificar('Parceiro excluído com sucesso!', 'success');
        await carregarParceiros();
    } catch (error) {
        console.error('Erro ao excluir parceiro:', error);
        notificar('Erro ao excluir parceiro', 'error');
    }
}

// ==================== EXPORTAÇÃO GLOBAL ====================
window.inicializarParceiros = inicializarParceiros;
window.verDetalhesParceiro = verDetalhesParceiro;
window.abrirEdicaoParceiro = abrirEdicaoParceiro;
window.confirmarExclusaoParceiro = confirmarExclusaoParceiro;
window.fecharModalParceiro = fecharModalParceiro;
window.fecharModalVisualizar = fecharModalVisualizar;

//console.log('📋 Módulo parceiros carregado (v2.2 — loading no salvar)');