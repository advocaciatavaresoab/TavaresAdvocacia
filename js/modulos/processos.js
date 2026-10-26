
// ==================== ESTADO ====================
let todosProcessos = [];
let todosProcessosRemovidos = [];
let filtroAtualProcessos = 'todos';
let filtroAtualProcessosRemovidos = 'todos';
let salvandoProcesso = false;
let listaClientes = [];
let editandoProcesso = false;
let definicoes = {};
let abaAtual = 'ativos';
let intervaloPrazos = null;

// ==================== VERIFICAR PERMISSÕES ====================
function isTitular() {
    const usuario = auth.getUsuario();
    return usuario && (usuario.role === 'ADM' || usuario.role === 'ADVOGADO TITULAR');
}

function isEstagiario() {
    const usuario = auth.getUsuario();
    return usuario && usuario.role === 'ESTAGIARIO';
}

// ==================== HELPERS DE VALOR ====================
function moeda(valor) {
    return formatarMoeda(parseValor(valor));
}

/** Lê um input monetário e devolve "R$ 0,00" formatado */
function lerMoedaInput(id) {
    return moeda(document.getElementById(id)?.value);
}

// ==================== CALCULAR DIAS ÚTEIS ====================
function calcularDiasUteis(dataInicio, dias) {
    if (!dataInicio || !dias) return '';

    const data = new Date(dataInicio);
    let diasUteisContados = 0;

    while (diasUteisContados < dias) {
        data.setDate(data.getDate() + 1);
        const diaSemana = data.getDay();
        if (diaSemana !== 0 && diaSemana !== 6) {
            diasUteisContados++;
        }
    }

    const ano = data.getFullYear();
    const mes = String(data.getMonth() + 1).padStart(2, '0');
    const dia = String(data.getDate()).padStart(2, '0');
    return `${ano}-${mes}-${dia}`;
}

// ==================== CALCULAR SITUAÇÃO DO PRAZO (TEMPO REAL) ====================
function calcularSituacaoPrazoEmTempoReal(dataFinal, status) {
    if (status === 'FINALIZADO') {
        return { texto: '✅ FINALIZADO', classe: 'completed', diasRestantes: 0 };
    }

    if (!dataFinal) return { texto: 'PRAZO OK', classe: 'active', diasRestantes: 0 };

    const hoje = new Date();
    hoje.setHours(0, 0, 0, 0);
    const data = new Date(dataFinal);
    data.setHours(0, 0, 0, 0);

    const diff = Math.ceil((data - hoje) / (1000 * 60 * 60 * 24));

    if (diff < 0) {
        return { texto: `VENCIDO (${Math.abs(diff)}d)`, classe: 'urgent', diasRestantes: diff };
    }
    if (diff === 0) {
        return { texto: 'VENCE HOJE', classe: 'pending', diasRestantes: 0 };
    }
    if (diff <= 7) {
        return { texto: `${diff} dias`, classe: 'pending', diasRestantes: diff };
    }
    return { texto: `${diff} dias`, classe: 'active', diasRestantes: diff };
}

// ==================== ATUALIZAR PRAZOS EM TEMPO REAL ====================
function iniciarAtualizacaoPrazos() {
    if (intervaloPrazos) {
        clearInterval(intervaloPrazos);
    }

    intervaloPrazos = setInterval(() => {
        if (abaAtual === 'ativos') {
            aplicarFiltrosProcessos();
        }
        if (abaAtual === 'removidos') {
            aplicarFiltrosProcessosRemovidos();
        }
    }, 300000);

    //console.log('🔄 Atualização de prazos iniciada (a cada 5 minutos)');
}

// ==================== CARREGAR DEFINIÇÕES E POPULAR SELECTS ====================
async function carregarDefinicoesEPopularSelects() {
    try {
        const dados = await carregarComCache('DEFINICOES').catch(() => []);

        const novasDefinicoes = {
            'TIPO PROCESSO': [],
            'TIPO DE PRAZO': [],
            'TIPO DE ACAO': [],
            'LOCAL DO PROCESSO': []
        };

        if (!dados || dados.length === 0) {
            //console.log('📋 Nenhuma definição encontrada na planilha');
            definicoes = novasDefinicoes;
            popularSelects();
            return;
        }

        dados.forEach(item => {
            Object.keys(novasDefinicoes).forEach(chave => {
                if (item[chave] && String(item[chave]).trim()) {
                    novasDefinicoes[chave].push(String(item[chave]).trim());
                }
            });
        });

        Object.keys(novasDefinicoes).forEach(key => {
            novasDefinicoes[key] = [...new Set(novasDefinicoes[key])];
        });

        definicoes = novasDefinicoes;
        //console.log('✅ Definições carregadas:', definicoes);
        popularSelects();

    } catch (error) {
        console.error('❌ Erro ao carregar definições:', error);
        definicoes = {
            'TIPO PROCESSO': [],
            'TIPO DE PRAZO': [],
            'TIPO DE ACAO': [],
            'LOCAL DO PROCESSO': []
        };
        popularSelects();
    }
}

// ==================== POPULAR SELECTS ====================
function popularSelects() {
    const selects = [
        { id: 'processoTipo', key: 'TIPO PROCESSO' },
        { id: 'processoTipoPrazo', key: 'TIPO DE PRAZO' },
        { id: 'processoTipoAcao', key: 'TIPO DE ACAO' },
        { id: 'processoLocal', key: 'LOCAL DO PROCESSO' }
    ];

    selects.forEach(({ id, key }) => {
        const select = document.getElementById(id);
        if (!select) {
            console.warn(`⚠️ Select ${id} não encontrado`);
            return;
        }

        const valorAtual = select.value;
        select.innerHTML = '<option value="">Selecione...</option>';

        if (definicoes[key] && definicoes[key].length > 0) {
            definicoes[key].forEach(item => {
                const option = document.createElement('option');
                option.value = item;
                option.textContent = item;
                select.appendChild(option);
            });
        }

        if (valorAtual) {
            select.value = valorAtual;
        }
    });
}

// ==================== CARREGAR CLIENTES PARA SELECT ====================
async function carregarClientesSelect() {
    try {
        const clientes = await carregarComCache('CLIENTES').catch(() => []);
        listaClientes = clientes.filter(c => c.NOME && String(c.NOME).trim());

        const select = document.getElementById('processoCliente');
        if (!select) return;

        const valorAtual = select.value;
        select.innerHTML = '<option value="">Selecione um cliente...</option>';
        listaClientes.forEach(c => {
            const option = document.createElement('option');
            option.value = c.NOME;
            option.textContent = c.NOME;
            select.appendChild(option);
        });
        if (valorAtual) select.value = valorAtual;

        //console.log(`📋 ${listaClientes.length} clientes carregados no select`);
    } catch (error) {
        console.error('Erro ao carregar clientes:', error);
    }
}

// ==================== TROCAR ABA ====================
function trocarAbaProcessos(aba) {
    abaAtual = aba;

    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.tab === aba);
    });

    document.getElementById('tabAtivos').style.display = aba === 'ativos' ? 'block' : 'none';
    document.getElementById('tabRemovidos').style.display = aba === 'removidos' ? 'block' : 'none';

    if (aba === 'ativos') {
        aplicarFiltrosProcessos();
    } else {
        aplicarFiltrosProcessosRemovidos();
    }
}

// ==================== ATUALIZAR STATUS ====================
async function atualizarStatusProcesso(row, novoStatus) {
    if (!isTitular()) {
        notificar('Você não tem permissão para alterar status.', 'warning');
        return;
    }

    try {
        const processo = todosProcessos.find(p => p._row === row);
        if (!processo) {
            notificar('Processo não encontrado', 'error');
            return;
        }

        const dadosAtualizados = { ...processo, 'STATUS': novoStatus };
        const { _row, ...dadosParaEnviar } = dadosAtualizados;
        await apiUpdate('PROCESSOS', parseInt(row), dadosParaEnviar);

        notificar(`Status atualizado para: ${novoStatus}`, 'success');
        await carregarProcessos();

    } catch (error) {
        console.error('Erro ao atualizar status:', error);
        notificar('Erro ao atualizar status: ' + error.message, 'error');
    }
}

// ==================== APROVAR PROCESSO ====================
async function aprovarProcesso(row) {
    if (!isTitular()) {
        notificar('Você não tem permissão para aprovar processos.', 'warning');
        return;
    }

    try {
        const processo = todosProcessos.find(p => p._row === row);
        if (!processo) {
            notificar('Processo não encontrado', 'error');
            return;
        }

        if (processo.RESULTADO === 'APROVADO') {
            notificar('Este processo já está aprovado.', 'warning');
            return;
        }

        const dadosAtualizados = { ...processo, 'RESULTADO': 'APROVADO' };
        const { _row, ...dadosParaEnviar } = dadosAtualizados;
        await apiUpdate('PROCESSOS', parseInt(row), dadosParaEnviar);

        notificar('✅ Processo aprovado com sucesso!', 'success');
        await carregarProcessos();

    } catch (error) {
        console.error('Erro ao aprovar processo:', error);
        notificar('Erro ao aprovar processo: ' + error.message, 'error');
    }
}

// ==================== MODAL DE CONFIRMAÇÃO COM CÓDIGO ====================
function mostrarModalConfirmacaoExclusao(row, numero, nomeCliente) {
    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay active';
    overlay.id = 'modalConfirmacaoExclusao';
    overlay.style.display = 'flex';

    overlay.innerHTML = `
        <div class="modal" style="max-width: 450px;">
            <div class="modal-header" style="border-bottom: 2px solid var(--danger);">
                <h2 style="color: var(--danger);"><i class="fas fa-exclamation-triangle"></i> Confirmar Exclusão</h2>
                <button class="modal-close" onclick="fecharModalConfirmacaoExclusao()">
                    <i class="fas fa-times"></i>
                </button>
            </div>
            <div class="modal-body">
                <p style="margin-bottom: 1rem; font-weight: 600;">
                    <i class="fas fa-gavel"></i> Processo: <strong>${numero}</strong>
                </p>
                <p style="margin-bottom: 1rem;">
                    <i class="fas fa-user"></i> Cliente: <strong>${nomeCliente}</strong>
                </p>
                <div style="background: var(--danger-bg); padding: 1rem; border-radius: 8px; margin-bottom: 1rem;">
                    <p style="color: var(--danger); font-weight: 600; margin: 0;">
                        <i class="fas fa-trash-alt"></i> Esta ação não pode ser desfeita!
                    </p>
                    <p style="color: var(--text-muted); font-size: 0.85rem; margin: 0.3rem 0 0 0;">
                        O processo será movido para "PROCESSOS_REMOVIDOS".
                    </p>
                </div>
                <div class="form-group" style="margin-top: 1rem;">
                    <label style="font-weight: 600;">
                        Digite o código de confirmação <span style="color: var(--danger);">"TAVARES"</span>
                    </label>
                    <input type="text" id="codigoConfirmacao" placeholder="Digite TAVARES para confirmar"
                           style="padding: 0.7rem; border: 2px solid var(--border); border-radius: 8px; font-size: 1rem; text-transform: uppercase; letter-spacing: 2px; font-weight: 600;">
                    <small style="color: var(--text-muted); font-size: 0.75rem;">Digite exatamente: TAVARES</small>
                </div>
            </div>
            <div class="modal-footer" style="justify-content: space-between;">
                <button class="btn-cancelar" onclick="fecharModalConfirmacaoExclusao()">
                    <i class="fas fa-times"></i> Cancelar
                </button>
                <button class="btn-danger" id="btnConfirmarExclusao" style="background: var(--danger); color: white; border: none; padding: 0.7rem 1.5rem; border-radius: 8px; font-weight: 600; cursor: pointer; opacity: 0.5; pointer-events: none;">
                    <i class="fas fa-trash-alt"></i> Excluir
                </button>
            </div>
        </div>
    `;

    document.body.appendChild(overlay);

    const inputCodigo = document.getElementById('codigoConfirmacao');
    const btnConfirmar = document.getElementById('btnConfirmarExclusao');

    inputCodigo.addEventListener('input', function () {
        const valor = this.value.toUpperCase().trim();
        if (valor === 'TAVARES') {
            btnConfirmar.style.opacity = '1';
            btnConfirmar.style.pointerEvents = 'auto';
            btnConfirmar.style.background = 'var(--danger)';
        } else {
            btnConfirmar.style.opacity = '0.5';
            btnConfirmar.style.pointerEvents = 'none';
        }
    });

    inputCodigo.addEventListener('keydown', function (e) {
        if (e.key === 'Enter') {
            const valor = this.value.toUpperCase().trim();
            if (valor === 'TAVARES') {
                btnConfirmar.click();
            }
        }
    });

    btnConfirmar.addEventListener('click', function () {
        const valor = inputCodigo.value.toUpperCase().trim();
        if (valor === 'TAVARES') {
            fecharModalConfirmacaoExclusao();
            confirmarExclusaoProcesso(row, numero);
        }
    });
}

function fecharModalConfirmacaoExclusao() {
    const modal = document.getElementById('modalConfirmacaoExclusao');
    if (modal) {
        modal.remove();
    }
}

// ==================== INICIALIZAÇÃO ====================
async function inicializarProcessos() {
    //console.log('⚖️ Inicializando processos...');

    await aguardarElementosProcessos();

    await carregarDefinicoesEPopularSelects();
    await carregarClientesSelect();
    await carregarProcessos();
    await carregarProcessosRemovidos();

    initEventosProcessos();
    aplicarPermissoes();

    trocarAbaProcessos('ativos');
    iniciarAtualizacaoPrazos();
}

function aguardarElementosProcessos() {
    return new Promise((resolve) => {
        const check = () => {
            const tabela = document.getElementById('tbodyProcessos');
            const busca = document.getElementById('buscaProcesso');
            if (tabela && busca) {
                resolve();
            } else {
                setTimeout(check, 100);
            }
        };
        check();
    });
}

// ==================== APLICAR PERMISSÕES ====================
function aplicarPermissoes() {
    const titular = isTitular();

    const colunaHonorarios = document.getElementById('colunaHonorarios');
    if (colunaHonorarios) {
        colunaHonorarios.style.display = titular ? 'table-cell' : 'none';
    }

    document.querySelectorAll('td.honorarios-cell').forEach(cell => {
        cell.style.display = titular ? 'table-cell' : 'none';
    });
}

// ==================== EVENTOS ====================
function initEventosProcessos() {
    document.getElementById('buscaProcesso')?.addEventListener('input', debounce(() => {
        if (abaAtual === 'ativos') {
            aplicarFiltrosProcessos();
        } else {
            aplicarFiltrosProcessosRemovidos();
        }
    }, 300));

    document.querySelectorAll('#tabAtivos .filtro-btn').forEach(btn => {
        btn.addEventListener('click', function () {
            document.querySelectorAll('#tabAtivos .filtro-btn').forEach(b => b.classList.remove('active'));
            this.classList.add('active');
            filtroAtualProcessos = this.getAttribute('data-filtro');
            if (abaAtual === 'ativos') {
                aplicarFiltrosProcessos();
            }
        });
    });

    document.querySelectorAll('#tabRemovidos .filtro-btn').forEach(btn => {
        btn.addEventListener('click', function () {
            document.querySelectorAll('#tabRemovidos .filtro-btn').forEach(b => b.classList.remove('active'));
            this.classList.add('active');
            filtroAtualProcessosRemovidos = this.getAttribute('data-filtro');
            if (abaAtual === 'removidos') {
                aplicarFiltrosProcessosRemovidos();
            }
        });
    });

    document.getElementById('btnNovoProcesso')?.addEventListener('click', () => abrirModalProcesso('novo'));
    document.getElementById('fecharModalProcesso')?.addEventListener('click', fecharModalProcesso);
    document.getElementById('cancelarProcesso')?.addEventListener('click', fecharModalProcesso);
    document.getElementById('salvarProcesso')?.addEventListener('click', salvarProcesso);
    document.getElementById('modalProcesso')?.addEventListener('click', function (e) {
        if (e.target === this) fecharModalProcesso();
    });

    document.getElementById('fecharModalVisualizarProcesso')?.addEventListener('click', fecharModalVisualizarProcesso);
    document.getElementById('modalVisualizarProcesso')?.addEventListener('click', function (e) {
        if (e.target === this) fecharModalVisualizarProcesso();
    });

    ['processoHonorarios', 'processoRetroativo', 'processoValorAcordo'].forEach(id => {
        const el = document.getElementById(id);
        if (el) {
            el.addEventListener('input', function () {
                if (!editandoProcesso) calcularValorCausa();
            });
        }
    });

    ['processoDataIntimacao', 'processoPrazoDias'].forEach(id => {
        const el = document.getElementById(id);
        if (!el) return;
        ['change', 'input'].forEach(evento => {
            el.addEventListener(evento, function () {
                if (!editandoProcesso) calcularDataFinalAutomatico();
            });
        });
    });
}

// ==================== CALCULAR DATA FINAL AUTOMÁTICO ====================
function calcularDataFinalAutomatico() {
    const dataIntimacao = document.getElementById('processoDataIntimacao')?.value;
    const prazoDias = parseInt(document.getElementById('processoPrazoDias')?.value) || 0;

    if (dataIntimacao && prazoDias > 0) {
        const dataFinal = calcularDiasUteis(dataIntimacao, prazoDias);
        const campoDataFinal = document.getElementById('processoDataFinal');
        if (campoDataFinal) {
            campoDataFinal.value = dataFinal;
            //console.log(`📅 Data Final calculada: ${dataFinal} (${prazoDias} dias úteis)`);
        }
    }
}

// ==================== CALCULAR VALOR DA CAUSA ====================
/**
 * Regra: se existe valor de acordo → acordo + retroativo
 *        senão → honorários + retroativo
 */
function calcularValorCausaDe(honorarios, retroativo, valorAcordo) {
    return valorAcordo > 0 ? valorAcordo + retroativo : honorarios + retroativo;
}

function calcularValorCausa() {
    const honorarios = parseValor(document.getElementById('processoHonorarios')?.value);
    const retroativo = parseValor(document.getElementById('processoRetroativo')?.value);
    const valorAcordo = parseValor(document.getElementById('processoValorAcordo')?.value);

    return calcularValorCausaDe(honorarios, retroativo, valorAcordo);
}

// ==================== ATUALIZAR VALOR DA CAUSA ====================
async function atualizarValorCausaNaPlanilha(processo) {
    if (!processo || !processo._row) return;

    const novoValorCausa = calcularValorCausaDe(
        parseValor(processo.HONORARIOS),
        parseValor(processo.RETROATIVO),
        parseValor(processo['VALOR DE ACORDO'])
    );

    const valorAtualPlanilha = parseValor(processo['VALOR DA CAUSA']);

    if (Math.abs(novoValorCausa - valorAtualPlanilha) > 0.01) {
        try {
            const dadosAtualizados = { ...processo, 'VALOR DA CAUSA': formatarMoeda(novoValorCausa) };
            const { _row, ...dadosParaEnviar } = dadosAtualizados;
            await apiUpdate('PROCESSOS', parseInt(processo._row), dadosParaEnviar);
            processo['VALOR DA CAUSA'] = formatarMoeda(novoValorCausa);
            return true;
        } catch (error) {
            console.error('❌ Erro ao atualizar VALOR DA CAUSA:', error);
            return false;
        }
    }
    return true;
}

// ==================== VERIFICAR E CORRIGIR VALORES ====================
async function verificarECorrigirTodosValoresCausa() {
    //console.log('🔍 Verificando VALOR DA CAUSA de todos os processos...');
    let corrigidos = 0;
    for (const processo of todosProcessos) {
        const atualizado = await atualizarValorCausaNaPlanilha(processo);
        if (atualizado) corrigidos++;
    }
    //console.log(`✅ ${corrigidos} processos verificados.`);
    return corrigidos;
}

// ==================== CARREGAR PROCESSOS ====================
async function carregarProcessos() {
    try {
        const dados = await carregarComCache('PROCESSOS');
        todosProcessos = dados.filter(p => p['N PROCESSO'] || p.CLIENTE);
        //console.log(`📋 Processos ativos: ${todosProcessos.length}`);

        setTimeout(async () => {
            await verificarECorrigirTodosValoresCausa();
            atualizarStatsProcessos();
            if (abaAtual === 'ativos') aplicarFiltrosProcessos();
        }, 1000);

        atualizarStatsProcessos();
        if (abaAtual === 'ativos') aplicarFiltrosProcessos();

        document.getElementById('badgeAtivos').textContent = todosProcessos.length;
    } catch (error) {
        console.error('Erro ao carregar processos:', error);
    }
}

// ==================== CARREGAR PROCESSOS REMOVIDOS ====================
async function carregarProcessosRemovidos() {
    try {
        const dados = await carregarComCache('PROCESSOS_REMOVIDOS').catch(() => []);
        todosProcessosRemovidos = dados.filter(p => p['N PROCESSO'] || p.CLIENTE);
        //console.log(`🗑️ Processos removidos: ${todosProcessosRemovidos.length}`);

        if (abaAtual === 'removidos') aplicarFiltrosProcessosRemovidos();
        document.getElementById('badgeRemovidos').textContent = todosProcessosRemovidos.length;
    } catch (error) {
        console.error('Erro ao carregar processos removidos:', error);
    }
}

// ==================== STATS ====================
function atualizarStatsProcessos() {
    const total = todosProcessos.length;
    const andamento = todosProcessos.filter(p => p.STATUS === 'EM ANDAMENTO').length;
    const aprovados = todosProcessos.filter(p => p.RESULTADO === 'APROVADO').length;

    const prazosVencidos = todosProcessos.filter(p => {
        if (p.STATUS === 'FINALIZADO') return false;
        const situacao = calcularSituacaoPrazoEmTempoReal(p['DATA FINAL'], p.STATUS);
        return situacao.classe === 'urgent';
    }).length;

    let honorariosTotal = 0;
    todosProcessos.forEach(p => { honorariosTotal += parseValor(p.HONORARIOS); });

    setText('totalProcessos', total);
    setText('processosAndamento', andamento);
    setText('prazosVencidos', prazosVencidos);
    setText('processosAprovados', aprovados);
    setText('honorariosTotal', formatarMoeda(honorariosTotal));
    setText('badgeProcessos', total);
}

// ==================== FILTROS ====================
function aplicarFiltrosProcessos() {
    let filtrados = [...todosProcessos];

    if (filtroAtualProcessos === 'todos') {
        filtrados = filtrados.filter(p => p.STATUS !== 'FINALIZADO');
    } else {
        const filtro = filtroAtualProcessos.toUpperCase();
        filtrados = filtrados.filter(p =>
            String(p.STATUS || '').toUpperCase().includes(filtro) ||
            String(p.RESULTADO || '').toUpperCase().includes(filtro)
        );
    }

    const busca = (document.getElementById('buscaProcesso')?.value || '').toLowerCase().trim();
    if (busca) {
        filtrados = filtrados.filter(p =>
            String(p['N PROCESSO'] || '').toLowerCase().includes(busca) ||
            String(p.CLIENTE || '').toLowerCase().includes(busca) ||
            String(p.RESPONSÁVEL || '').toLowerCase().includes(busca)
        );
    }

    renderizarTabelaProcessos(filtrados);
    setText('contagemProcessos', `${filtrados.length} de ${todosProcessos.length} registros (FINALIZADOS ocultos)`);
}

function aplicarFiltrosProcessosRemovidos() {
    let filtrados = [...todosProcessosRemovidos];

    if (filtroAtualProcessosRemovidos !== 'todos') {
        const filtro = filtroAtualProcessosRemovidos.toUpperCase();
        filtrados = filtrados.filter(p =>
            String(p.STATUS || '').toUpperCase().includes(filtro)
        );
    }

    const busca = (document.getElementById('buscaProcesso')?.value || '').toLowerCase().trim();
    if (busca) {
        filtrados = filtrados.filter(p =>
            String(p['N PROCESSO'] || '').toLowerCase().includes(busca) ||
            String(p.CLIENTE || '').toLowerCase().includes(busca)
        );
    }

    renderizarTabelaProcessosRemovidos(filtrados);
    setText('contagemProcessosRemovidos', `${filtrados.length} de ${todosProcessosRemovidos.length} registros`);
}

// ==================== TABELA ATIVOS ====================
function renderizarTabelaProcessos(processos) {
    const tbody = document.getElementById('tbodyProcessos');
    if (!tbody) return;

    if (!processos.length) {
        tbody.innerHTML = '<tr class="row-empty"><td colspan="13"><i class="fas fa-search"></i> Nenhum processo encontrado</td></tr>';
        return;
    }

    const titular = isTitular();

    tbody.innerHTML = processos.map(p => {
        const num = esc(p['N PROCESSO']);

        const situacaoPrazo = calcularSituacaoPrazoEmTempoReal(p['DATA FINAL'], p.STATUS);
        const prazoClass = situacaoPrazo.classe;
        const situacaoTexto = situacaoPrazo.texto;

        const isAprovado = p.RESULTADO === 'APROVADO';
        const resultadoClass = isAprovado ? 'completed' :
                               p.RESULTADO === 'NEGADO' ? 'urgent' : 'pending';

        const pastaLink = p.PASTA ? `<a href="${esc(p.PASTA)}" target="_blank" class="btn-icon-small" title="Abrir pasta"><i class="fas fa-folder-open"></i></a>` : '';

        // Status do processo
        const statusOptions = ['EM ANDAMENTO', 'FINALIZADO', 'SUSPENSO', 'EM ANALISE', 'ANALISAR'];
        const statusHtml = titular ? `
            <select class="status-select" onchange="atualizarStatusProcesso(${p._row}, this.value)"
                    style="padding: 0.2rem 0.5rem; border-radius: 20px; font-size: 0.75rem; font-weight: 600;
                           border: 1px solid var(--border); background: var(--bg); cursor: pointer;
                           font-family: var(--font-body); min-width: 110px;">
                ${statusOptions.map(s => `
                    <option value="${s}" ${p.STATUS === s ? 'selected' : ''}>${s}</option>
                `).join('')}
            </select>
        ` : `<span class="status ${getStatusClass(p.STATUS)}">${esc(p.STATUS)}</span>`;

        // Status de pagamento (apenas exibe)
        const statusPagAtual = p.STATUS_PAG || 'PENDENTE';
        const statusPagClass = statusPagAtual.toLowerCase();
        const statusPagHtml = `<span class="status-pag ${statusPagClass}">${esc(statusPagAtual)}</span>`;

        let botoesAcao = '';
        if (titular) {
            botoesAcao = `
                <button class="btn-icon-small" title="Visualizar" onclick="verDetalhesProcesso(${p._row})">
                    <i class="fas fa-eye"></i>
                </button>
                <button class="btn-icon-small" title="Editar" onclick="abrirEdicaoProcesso(${p._row})">
                    <i class="fas fa-edit"></i>
                </button>
                ${p.RESULTADO !== 'APROVADO' ? `
                    <button class="btn-icon-small" title="Aprovar" onclick="aprovarProcesso(${p._row})" style="color: var(--success); border-color: var(--success);">
                        <i class="fas fa-check-circle"></i>
                    </button>
                ` : `
                    <span style="display: inline-block; padding: 0.1rem 0.4rem; background: var(--success-bg); color: var(--success); border-radius: 12px; font-size: 0.6rem; font-weight: 600;">APROVADO</span>
                `}
                ${pastaLink}
                <button class="btn-icon-small danger" title="Excluir" onclick="mostrarModalConfirmacaoExclusao(${p._row}, '${num.replace(/'/g, "\\'")}', '${esc(p.CLIENTE).replace(/'/g, "\\'")}')">
                    <i class="fas fa-trash"></i>
                </button>
            `;
        } else {
            botoesAcao = `
                <button class="btn-icon-small" title="Visualizar" onclick="verDetalhesProcesso(${p._row})">
                    <i class="fas fa-eye"></i>
                </button>
                ${pastaLink}
            `;
        }

        const honorariosCell = `<td class="honorarios-cell" style="display: ${titular ? 'table-cell' : 'none'};"><strong class="text-success">${moeda(p.HONORARIOS)}</strong></td>`;

        return `
            <tr>
                <td><span class="mono-text">${num}</span></td>
                <td><span class="badge-tipo pf">${esc(p['TIPO PROCESSO'])}</span></td>
                <td><strong>${esc(p.CLIENTE)}</strong></td>
                <td>${esc(p['TIPO DE ACAO'])}</td>
                <td>${esc(p['LOCAL PROCESSO'])}</td>
                <td>${esc(p.RESPONSÁVEL)}</td>
                <td><span class="mono-text">${formatarData(p['DATA FINAL'])}</span></td>
                <td><span class="status ${prazoClass}" title="${situacaoTexto}">${situacaoTexto}</span></td>
                <td>${statusHtml}</td>
                <td>${statusPagHtml}</td>
                <td><span class="status ${resultadoClass}">${esc(p.RESULTADO)}</span></td>
                ${honorariosCell}
                <td>
                    <div class="acoes">
                        ${botoesAcao}
                    </div>
                </td>
            </tr>
        `;
    }).join('');

    setTimeout(() => aplicarPermissoes(), 100);
}

// ==================== TABELA REMOVIDOS ====================
function renderizarTabelaProcessosRemovidos(processos) {
    const tbody = document.getElementById('tbodyProcessosRemovidos');
    if (!tbody) return;

    if (!processos.length) {
        tbody.innerHTML = '<tr class="row-empty"><td colspan="13"><i class="fas fa-search"></i> Nenhum processo excluído encontrado</td></tr>';
        return;
    }

    tbody.innerHTML = processos.map(p => {
        const num = esc(p['N PROCESSO']);
        const situacaoPrazo = calcularSituacaoPrazoEmTempoReal(p['DATA FINAL'], p.STATUS);
        const prazoClass = situacaoPrazo.classe;
        const situacaoTexto = situacaoPrazo.texto;
        const resultadoClass = p.RESULTADO === 'APROVADO' ? 'completed' :
                               p.RESULTADO === 'NEGADO' ? 'urgent' : 'pending';

        const statusPagAtual = p.STATUS_PAG || 'PENDENTE';
        const statusPagClass = statusPagAtual.toLowerCase();

        return `
            <tr>
                <td><span class="mono-text">${num}</span></td>
                <td><span class="badge-tipo pf">${esc(p['TIPO PROCESSO'])}</span></td>
                <td><strong>${esc(p.CLIENTE)}</strong></td>
                <td>${esc(p['TIPO DE ACAO'])}</td>
                <td>${esc(p['LOCAL PROCESSO'])}</td>
                <td>${esc(p.RESPONSÁVEL)}</td>
                <td><span class="mono-text">${formatarData(p['DATA FINAL'])}</span></td>
                <td><span class="status ${prazoClass}" title="${situacaoTexto}">${situacaoTexto}</span></td>
                <td><span class="status ${getStatusClass(p.STATUS)}">${esc(p.STATUS)}</span></td>
                <td><span class="status-pag ${statusPagClass}">${esc(statusPagAtual)}</span></td>
                <td><span class="status ${resultadoClass}">${esc(p.RESULTADO)}</span></td>
                <td><strong class="text-success">${moeda(p.HONORARIOS)}</strong></td>
                <td>
                    <div class="acoes">
                        <button class="btn-icon-small" title="Visualizar" onclick="verDetalhesProcessoRemovido(${p._row})">
                            <i class="fas fa-eye"></i>
                        </button>
                    </div>
                </td>
            </tr>
        `;
    }).join('');
}

// ==================== BLOCO FINANCEIRO (MODAL DE DETALHES) ====================
function gerarFinanceiroHtml(p) {
    return `
        <div style="grid-column: 1 / -1; border-top: 2px solid var(--gold-500); padding-top: 0.5rem; margin-top: 0.1rem;">
            <h4 style="font-size: 0.85rem; color: var(--gold-600); margin-bottom: 0.4rem;">💰 Financeiro</h4>
            <div style="display: grid; grid-template-columns: 1fr 1fr 1fr 1fr; gap: 0.4rem;">
                <div class="detalhe-item">
                    <label>Honorários</label>
                    <p style="color: var(--success);">${moeda(p.HONORARIOS)}</p>
                </div>
                <div class="detalhe-item">
                    <label>Retroativo</label>
                    <p>${moeda(p.RETROATIVO)}</p>
                </div>
                <div class="detalhe-item">
                    <label>Valor da Causa</label>
                    <p>${moeda(p['VALOR DA CAUSA'])}</p>
                </div>
                <div class="detalhe-item">
                    <label>Valor de Acordo</label>
                    <p>${moeda(p['VALOR DE ACORDO'])}</p>
                </div>
            </div>
        </div>
    `;
}

// ==================== VISUALIZAR REMOVIDO ====================
function verDetalhesProcessoRemovido(row) {
    const p = todosProcessosRemovidos.find(x => x._row === row);
    if (!p) return;

    const modal = document.getElementById('modalVisualizarProcesso');
    const body = document.getElementById('visualizarProcessoBody');
    if (!modal || !body) {
        alert(`Processo: ${p['N PROCESSO']}\nCliente: ${p.CLIENTE}\nStatus: ${p.STATUS}`);
        return;
    }

    const situacaoPrazo = calcularSituacaoPrazoEmTempoReal(p['DATA FINAL'], p.STATUS);
    const statusPagAtual = p.STATUS_PAG || 'PENDENTE';
    const statusPagClass = statusPagAtual.toLowerCase();

    body.innerHTML = `
        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 0.5rem;">
            <div class="detalhe-item" style="grid-column: 1 / -1; text-align: center; padding-bottom: 0.5rem; border-bottom: 2px solid var(--gold-500);">
                <h3 style="font-family: var(--font-display); color: var(--navy-950); margin: 0; font-size: 1.1rem;">${esc(p['N PROCESSO'])}</h3>
                <span class="status ${p.STATUS === 'EM ANDAMENTO' ? 'active' : 'pending'}" style="margin-top: 0.3rem;">${esc(p.STATUS)}</span>
                <span style="display: inline-block; margin-left: 0.5rem; padding: 0.1rem 0.5rem; background: var(--danger-bg); color: var(--danger); border-radius: 12px; font-size: 0.6rem; font-weight: 600;">EXCLUÍDO</span>
            </div>
            <div class="detalhe-item"><label>Cliente</label><p>${esc(p.CLIENTE)}</p></div>
            <div class="detalhe-item"><label>Tipo de Processo</label><p>${esc(p['TIPO PROCESSO'])}</p></div>
            <div class="detalhe-item"><label>Tipo de Ação</label><p>${esc(p['TIPO DE ACAO']) || '—'}</p></div>
            <div class="detalhe-item"><label>Local</label><p>${esc(p['LOCAL PROCESSO']) || '—'}</p></div>
            <div class="detalhe-item"><label>Responsável</label><p>${esc(p.RESPONSÁVEL) || '—'}</p></div>
            <div class="detalhe-item"><label>Data Final</label><p>${formatarData(p['DATA FINAL']) || '—'}</p></div>
            <div class="detalhe-item"><label>Situação do Prazo</label><p><span class="status ${situacaoPrazo.classe}">${situacaoPrazo.texto}</span></p></div>
            <div class="detalhe-item"><label>Status</label><p>${esc(p.STATUS)}</p></div>
            <div class="detalhe-item"><label>Status Pagamento</label><p><span class="status-pag ${statusPagClass}">${esc(statusPagAtual)}</span></p></div>
            <div class="detalhe-item"><label>Resultado</label><p>${esc(p.RESULTADO)}</p></div>
            ${gerarFinanceiroHtml(p)}
        </div>
    `;

    modal.classList.add('active');
}

// ==================== EXCLUSÃO (COM STATUS FINALIZADO) ====================
async function confirmarExclusaoProcesso(row, numero) {
    if (!isTitular()) {
        notificar('Você não tem permissão para excluir processos.', 'warning');
        return;
    }

    try {
        const processo = todosProcessos.find(p => p._row === row);
        if (!processo) {
            notificar('Processo não encontrado', 'error');
            return;
        }

        const dadosProcessoAtualizado = {
            ...processo,
            'STATUS': 'FINALIZADO'
        };

        await apiDelete('PROCESSOS', row);

        const { _row, ...dadosParaRemover } = dadosProcessoAtualizado;
        await apiCreate('PROCESSOS_REMOVIDOS', dadosParaRemover);

        notificar('Processo excluído e movido para PROCESSOS_REMOVIDOS com status FINALIZADO!', 'success');
        await carregarProcessos();
        await carregarProcessosRemovidos();
        if (typeof inicializarPainel === 'function') {
            setTimeout(() => inicializarPainel(), 500);
        }
    } catch (error) {
        console.error('Erro ao excluir processo:', error);
        notificar('Erro ao excluir processo: ' + error.message, 'error');
    }
}

// ==================== VISUALIZAR ====================
function verDetalhesProcesso(row) {
    const p = todosProcessos.find(x => x._row === row);
    if (!p) return;

    const modal = document.getElementById('modalVisualizarProcesso');
    const body = document.getElementById('visualizarProcessoBody');
    if (!modal || !body) return;

    const titular = isTitular();
    const situacaoPrazo = calcularSituacaoPrazoEmTempoReal(p['DATA FINAL'], p.STATUS);
    const statusPagAtual = p.STATUS_PAG || 'PENDENTE';
    const statusPagClass = statusPagAtual.toLowerCase();

    const financeiro = titular ? gerarFinanceiroHtml(p) : '';

    body.innerHTML = `
        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 0.5rem;">
            <div class="detalhe-item" style="grid-column: 1 / -1; text-align: center; padding-bottom: 0.5rem; border-bottom: 2px solid var(--gold-500);">
                <h3 style="font-family: var(--font-display); color: var(--navy-950); margin: 0; font-size: 1.1rem;">${esc(p['N PROCESSO'])}</h3>
                <span class="status ${p.STATUS === 'EM ANDAMENTO' ? 'active' : 'pending'}" style="margin-top: 0.3rem;">${esc(p.STATUS)}</span>
            </div>
            <div class="detalhe-item"><label>Cliente</label><p>${esc(p.CLIENTE)}</p></div>
            <div class="detalhe-item"><label>Tipo de Processo</label><p>${esc(p['TIPO PROCESSO'])}</p></div>
            <div class="detalhe-item"><label>Tipo de Ação</label><p>${esc(p['TIPO DE ACAO']) || '—'}</p></div>
            <div class="detalhe-item"><label>Local</label><p>${esc(p['LOCAL PROCESSO']) || '—'}</p></div>
            <div class="detalhe-item"><label>Responsável</label><p>${esc(p.RESPONSÁVEL) || '—'}</p></div>
            <div class="detalhe-item"><label>Data Final</label><p>${formatarData(p['DATA FINAL']) || '—'}</p></div>
            <div class="detalhe-item"><label>Situação do Prazo</label><p><span class="status ${situacaoPrazo.classe}">${situacaoPrazo.texto}</span></p></div>
            <div class="detalhe-item"><label>Status</label><p>${esc(p.STATUS)}</p></div>
            <div class="detalhe-item"><label>Status Pagamento</label><p><span class="status-pag ${statusPagClass}">${esc(statusPagAtual)}</span></p></div>
            <div class="detalhe-item"><label>Resultado</label><p>${esc(p.RESULTADO)}</p></div>
            ${financeiro}
            ${p.PASTA ? `<div class="detalhe-item" style="grid-column: 1 / -1;"><label>Pasta (Link)</label><p><a href="${esc(p.PASTA)}" target="_blank" style="color: var(--info);">${esc(p.PASTA)}</a></p></div>` : ''}
        </div>
    `;
    modal.classList.add('active');
}

function fecharModalVisualizarProcesso() {
    document.getElementById('modalVisualizarProcesso')?.classList.remove('active');
}

// ==================== MODAL ====================
function abrirModalProcesso(modo, dados) {
    const modal = document.getElementById('modalProcesso');
    const titulo = document.getElementById('modalTituloProcesso');
    const form = document.getElementById('formProcesso');
    if (!modal || !form) return;

    editandoProcesso = (modo === 'edicao');

    if (modo === 'novo') {
        titulo.textContent = 'Novo Processo';
        form.reset();
        document.getElementById('processoRow').value = '';
        document.getElementById('salvarProcesso').disabled = false;
        document.getElementById('salvarProcesso').innerHTML = '<i class="fas fa-save"></i> Salvar';
        document.getElementById('processoDataIntimacao').value = new Date().toISOString().split('T')[0];
        document.getElementById('processoPrazoDias').value = 15;
        document.getElementById('processoStatus').value = 'EM ANDAMENTO';
        document.getElementById('processoStatusPag').value = 'PENDENTE';
        document.getElementById('processoResultado').value = 'AGUARDANDO';
        setTimeout(() => calcularDataFinalAutomatico(), 100);
    }

    carregarClientesSelect();
    popularSelects();

    const setValor = (id, valor) => {
        const el = document.getElementById(id);
        if (el) el.value = valor || '';
    };

    if (modo === 'edicao' && dados) {
        titulo.textContent = 'Editar Processo';
        setValor('processoRow', dados._row);
        setValor('processoCliente', dados.CLIENTE);
        setValor('processoNumero', dados['N PROCESSO']);
        setValor('processoTipo', dados['TIPO PROCESSO']);
        setValor('processoTipoPrazo', dados['TIPO DE PRAZO']);
        setValor('processoDataIntimacao', converterDataISO(dados['DATA DA INTIMAÇÃO']));
        setValor('processoPrazoDias', dados['PRAZO (DIAS)']);
        setValor('processoDataFinal', converterDataISO(dados['DATA FINAL']));
        setValor('processoSituacaoPrazo', dados['SITUAÇÃO DO PRAZO']);
        setValor('processoResponsavel', dados.RESPONSÁVEL);
        setValor('processoTipoAcao', dados['TIPO DE ACAO']);
        setValor('processoLocal', dados['LOCAL PROCESSO']);
        setValor('processoStatus', dados.STATUS);
        setValor('processoStatusPag', dados.STATUS_PAG || 'PENDENTE');
        setValor('processoResultado', dados.RESULTADO);
        setValor('processoPasta', dados.PASTA);
        // Valores monetários sempre aparecem formatados em R$
        setValor('processoHonorarios', dados.HONORARIOS ? moeda(dados.HONORARIOS) : '');
        setValor('processoRetroativo', dados.RETROATIVO ? moeda(dados.RETROATIVO) : '');
        setValor('processoValorAcordo', dados['VALOR DE ACORDO'] ? moeda(dados['VALOR DE ACORDO']) : '');
    }

    modal.classList.add('active');
    setTimeout(() => {
        calcularValorCausa();
        if (modo === 'edicao') {
            calcularDataFinalAutomatico();
        }
        editandoProcesso = false;
    }, 300);
}

function fecharModalProcesso() {
    document.getElementById('modalProcesso')?.classList.remove('active');
    const btn = document.getElementById('salvarProcesso');
    if (btn) {
        btn.disabled = false;
        btn.innerHTML = '<i class="fas fa-save"></i> Salvar';
    }
    editandoProcesso = false;
}

// ==================== SALVAR ====================
async function salvarProcesso() {
    if (salvandoProcesso) {
        notificar('Aguarde, salvando...', 'warning');
        return;
    }

    const row = document.getElementById('processoRow')?.value;
    const dataIntimacao = document.getElementById('processoDataIntimacao')?.value || '';
    const prazoDias = parseInt(document.getElementById('processoPrazoDias')?.value) || 0;
    const dataFinal = dataIntimacao && prazoDias > 0 ? calcularDiasUteis(dataIntimacao, prazoDias) : '';
    const valorCausa = calcularValorCausa();

    const dados = {
        'TIPO PROCESSO': document.getElementById('processoTipo')?.value || '',
        'CLIENTE': document.getElementById('processoCliente')?.value || '',
        'N PROCESSO': document.getElementById('processoNumero')?.value?.trim() || '',
        'TIPO DE PRAZO': document.getElementById('processoTipoPrazo')?.value || '',
        'DATA DA INTIMAÇÃO': dataIntimacao,
        'PRAZO (DIAS)': prazoDias,
        'DATA FINAL': dataFinal,
        'RESPONSÁVEL': document.getElementById('processoResponsavel')?.value || '',
        'SITUAÇÃO DO PRAZO': '',
        'TIPO DE ACAO': document.getElementById('processoTipoAcao')?.value || '',
        'LOCAL PROCESSO': document.getElementById('processoLocal')?.value || '',
        'HONORARIOS': lerMoedaInput('processoHonorarios'),
        'RETROATIVO': lerMoedaInput('processoRetroativo'),
        'VALOR DA CAUSA': formatarMoeda(valorCausa),
        'VALOR DE ACORDO': lerMoedaInput('processoValorAcordo'),
        'STATUS': document.getElementById('processoStatus')?.value || '',
        'STATUS_PAG': document.getElementById('processoStatusPag')?.value || 'PENDENTE',
        'RESULTADO': document.getElementById('processoResultado')?.value || '',
        'PASTA': document.getElementById('processoPasta')?.value?.trim() || ''
    };

    if (!dados['CLIENTE'] || !dados['N PROCESSO']) {
        notificar('Preencha Cliente e Nº Processo!', 'warning');
        return;
    }

    salvandoProcesso = true;
    const btnSalvar = document.getElementById('salvarProcesso');
    btnSalvar.disabled = true;
    btnSalvar.innerHTML = '<i class="fas fa-spinner fa-pulse"></i> Salvando...';

    try {
        if (row) {
            await apiUpdate('PROCESSOS', parseInt(row), dados);
            notificar('Processo atualizado com sucesso!', 'success');
        } else {
            await apiCreate('PROCESSOS', dados);
            notificar('Processo cadastrado com sucesso!', 'success');
        }
        fecharModalProcesso();
        await carregarProcessos();
        await carregarProcessosRemovidos();
        if (typeof inicializarPainel === 'function') {
            setTimeout(() => inicializarPainel(), 500);
        }
    } catch (error) {
        console.error('Erro ao salvar processo:', error);
        notificar('Erro ao salvar: ' + error.message, 'error');
    } finally {
        salvandoProcesso = false;
        btnSalvar.disabled = false;
        btnSalvar.innerHTML = '<i class="fas fa-save"></i> Salvar';
    }
}

// ==================== EDIÇÃO ====================
async function abrirEdicaoProcesso(row) {
    if (salvandoProcesso) {
        notificar('Aguarde a operação atual', 'warning');
        return;
    }
    try {
        const processo = await apiGet('PROCESSOS', row);
        abrirModalProcesso('edicao', processo);
    } catch (error) {
        console.error('Erro ao carregar processo:', error);
        notificar('Erro ao carregar dados', 'error');
    }
}

// ==================== RECALCULAR TODOS ====================
async function recalcularTodosValoresCausa() {
    //console.log('🔄 Iniciando recálculo manual de todos os VALORES DA CAUSA...');
    const resultado = await verificarECorrigirTodosValoresCausa();
    notificar(`✅ ${resultado} processos verificados!`, 'success');
    return resultado;
}

// ==================== ATALHOS ====================
// Evita registrar o listener várias vezes quando a página é recarregada
if (!window._processosAtalhosRegistrados) {
    window._processosAtalhosRegistrados = true;

    document.addEventListener('keydown', function (e) {
        if (e.key === 'Escape') {
            if (typeof fecharModalProcesso === 'function') fecharModalProcesso();
            if (typeof fecharModalVisualizarProcesso === 'function') fecharModalVisualizarProcesso();
            if (typeof fecharModalConfirmacaoExclusao === 'function') fecharModalConfirmacaoExclusao();
        }
        if (e.ctrlKey && e.key === 'n' && document.getElementById('btnNovoProcesso')) {
            e.preventDefault();
            abrirModalProcesso('novo');
        }
    });
}

// ==================== EXPORTAÇÃO GLOBAL ====================
window.inicializarProcessos = inicializarProcessos;
window.abrirModalProcesso = abrirModalProcesso;
window.fecharModalProcesso = fecharModalProcesso;
window.salvarProcesso = salvarProcesso;
window.verDetalhesProcesso = verDetalhesProcesso;
window.fecharModalVisualizarProcesso = fecharModalVisualizarProcesso;
window.abrirEdicaoProcesso = abrirEdicaoProcesso;
window.confirmarExclusaoProcesso = confirmarExclusaoProcesso;
window.recalcularTodosValoresCausa = recalcularTodosValoresCausa;
window.trocarAbaProcessos = trocarAbaProcessos;
window.atualizarStatusProcesso = atualizarStatusProcesso;
window.aprovarProcesso = aprovarProcesso;
window.verDetalhesProcessoRemovido = verDetalhesProcessoRemovido;
window.mostrarModalConfirmacaoExclusao = mostrarModalConfirmacaoExclusao;
window.fecharModalConfirmacaoExclusao = fecharModalConfirmacaoExclusao;

//console.log('📋 Módulo processos carregado');
//console.log('💰 Para recalcular todos os VALORES DA CAUSA, digite: recalcularTodosValoresCausa()');