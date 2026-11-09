// ==================== ESTADO ====================
let todasAtividades = [];
let filtroAtualAtividades = 'todos';
let atividadeEditando = null;
let clientesCarregados = [];
let processosCarregados = [];
let dadosCarregados = false;
let listaNomesClientes = [];
let salvandoAtividade = false;
let processandoAcao = false;

// ==================== INFERÊNCIA DE CRIADOR ====================
// Ajuste conforme quem é titular. Quem NÃO estiver aqui é tratado como ESTAGIARIO.
const TITULARES_ATIVIDADES = [
    'IZAAC MANGUEIRA TAVARES'
    // 'LARISSA DO NASCIMENTO OLIVEIRA'  ← descomente se ela for titular
];

function inferirCriadoPor(a) {
    const direto = String(a['CRIADO_POR_ROLE'] || '').toUpperCase().trim();
    if (direto === 'TITULAR' || direto === 'ESTAGIARIO') return direto;

    const resp = String(a.RESPONSAVEL || '').toUpperCase().trim();
    if (!resp) return 'ESTAGIARIO';

    return TITULARES_ATIVIDADES.some(t => resp === t.toUpperCase())
        ? 'TITULAR'
        : 'ESTAGIARIO';
}

// ==================== HELPERS DE STATUS ====================
function isEmProducao(status) {
    const s = String(status || '').toUpperCase()
        .normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();
    return s === 'EM PRODUCAO';
}

function isEmAnalise(status) {
    const s = String(status || '').toUpperCase()
        .normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();
    return s === 'EM ANALISE';
}

// ==================== INICIALIZAÇÃO ====================
async function inicializarAtividades() {
    await aguardarElementosAtividades();

    const btnNova = document.getElementById('btnNovaAtividade');
    if (btnNova) {
        btnNova.disabled = true;
        btnNova.innerHTML = '<i class="fas fa-spinner fa-pulse"></i> Carregando...';
    }

    await carregarDadosAtividades();

    if (btnNova) {
        btnNova.disabled = false;
        btnNova.innerHTML = '<i class="fas fa-plus"></i> Nova atividade';
    }

    initEventosAtividades();
}

function aguardarElementosAtividades() {
    return new Promise((resolve) => {
        const check = () => {
            const tbody = document.getElementById('tbodyAtividades');
            if (tbody) {
                resolve();
            } else {
                setTimeout(check, 100);
            }
        };
        check();
    });
}

function initEventosAtividades() {
    document.getElementById('btnNovaAtividade')?.addEventListener('click', () => abrirModalAtividade('novo'));

    document.getElementById('fecharModalAtividade')?.addEventListener('click', fecharModalAtividade);
    document.getElementById('cancelarAtividade')?.addEventListener('click', fecharModalAtividade);
    document.getElementById('modalAtividade')?.addEventListener('click', function (e) {
        if (e.target === this) fecharModalAtividade();
    });

    document.getElementById('salvarAtividade')?.addEventListener('click', salvarAtividade);

    document.getElementById('buscaAtividades')?.addEventListener('input', debounce(() => {
        aplicarFiltrosAtividades();
    }, 300));

    document.querySelectorAll('.filtros-rapidos .filtro-btn').forEach(btn => {
        btn.addEventListener('click', function () {
            document.querySelectorAll('.filtros-rapidos .filtro-btn').forEach(b => b.classList.remove('active'));
            this.classList.add('active');
            filtroAtualAtividades = this.getAttribute('data-filtro');
            aplicarFiltrosAtividades();
        });
    });

    document.getElementById('atividadeCliente')?.addEventListener('change', function () {
        const clienteSelecionado = this.value;
        const processosSelect = document.getElementById('atividadeProcesso');
        processosSelect.innerHTML = '<option value="">Selecione um processo...</option>';

        if (clienteSelecionado && processosCarregados.length) {
            const processosCliente = processosCarregados.filter(p => p.CLIENTE === clienteSelecionado);
            processosCliente.forEach(p => {
                const option = document.createElement('option');
                option.value = p['N PROCESSO'] || p['Nº PROCESSO'] || p.PROCESSO;
                option.textContent = p['N PROCESSO'] || p['Nº PROCESSO'] || p.PROCESSO;
                processosSelect.appendChild(option);
            });
            processosSelect.disabled = false;
        } else {
            processosSelect.disabled = true;
        }
    });
}

// ==================== CARREGAMENTO ====================
async function carregarDadosAtividades() {
    try {
        const clientes = await carregarComCache('CLIENTES');
        clientesCarregados = clientes.filter(c => c.NOME && String(c.NOME).trim());
        listaNomesClientes = clientesCarregados.map(c => c.NOME);
        await new Promise(r => setTimeout(r, 400));

        const processos = await carregarComCache('PROCESSOS');
        processosCarregados = processos.filter(p => p['N PROCESSO'] || p.CLIENTE);
        await new Promise(r => setTimeout(r, 400));

        const atividades = await carregarComCache('ATIVIDADES');
        todasAtividades = atividades.filter(a => a.CLIENTE || a.PROCESSO);

        dadosCarregados = true;

        preencherSelectClientes();
        preencherSelectProcessos();
        aplicarFiltrosAtividades();

    } catch (error) {
        console.error('❌ Erro ao carregar atividades:', error);
        mostrarErroAtividades();
    }
}

function preencherSelectClientes() {
    const select = document.getElementById('atividadeCliente');
    if (!select) return;

    select.innerHTML = '<option value="">Selecione um cliente...</option>';

    if (listaNomesClientes.length === 0) {
        select.innerHTML = '<option value="">Nenhum cliente cadastrado</option>';
        select.disabled = true;
        return;
    }

    listaNomesClientes.forEach(nome => {
        const option = document.createElement('option');
        option.value = nome;
        option.textContent = nome;
        select.appendChild(option);
    });

    select.disabled = false;
}

function preencherSelectProcessos() {
    const select = document.getElementById('atividadeProcesso');
    if (!select) return;

    select.innerHTML = '<option value="">Selecione um cliente primeiro...</option>';
    select.disabled = true;
}

function mostrarErroAtividades() {
    const tbody = document.getElementById('tbodyAtividades');
    if (tbody) {
        tbody.innerHTML = `<tr class="row-empty"><td colspan="8">Não foi possível carregar os dados. Verifique a conexão com a API.</td></tr>`;
    }
}

// ==================== FILTROS ====================
function aplicarFiltrosAtividades() {
    let filtrados = [...todasAtividades];

    if (filtroAtualAtividades !== 'todos') {
        const alvo = filtroAtualAtividades.toUpperCase()
            .normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();

        filtrados = filtrados.filter(a => {
            const st = String(a.STATUS || '').toUpperCase()
                .normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();
            const si = String(a.SITUACAO || a.SITUAÇÃO || '').toUpperCase()
                .normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();
            return st === alvo || si === alvo;
        });
    }

    const busca = (document.getElementById('buscaAtividades')?.value || '').toLowerCase().trim();
    if (busca) {
        filtrados = filtrados.filter(a =>
            String(a.CLIENTE || '').toLowerCase().includes(busca) ||
            String(a.PROCESSO || '').toLowerCase().includes(busca) ||
            String(a['TIPO DE PRAZO'] || '').toLowerCase().includes(busca) ||
            String(a.RESPONSAVEL || '').toLowerCase().includes(busca)
        );
    }

    filtrados.sort((a, b) => {
        const da = new Date(a.PRAZO || 0);
        const db = new Date(b.PRAZO || 0);
        return da - db;
    });

    renderizarTabelaAtividades(filtrados);
    setText('contagemAtividades', `${filtrados.length} atividades`);
}

// ==================== VERIFICAR PERFIL DO USUÁRIO ====================
function isTitular() {
    const u = auth.getUsuario();
    if (!u) return false;
    const r = String(u.role || '').toUpperCase()
        .normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();
    return r === 'ADM' || r === 'ADVOGADO TITULAR';
}

function isEstagiario() {
    const u = auth.getUsuario();
    if (!u) return false;
    const r = String(u.role || '').toUpperCase()
        .normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();
    return r === 'ESTAGIARIO';
}

// ==================== RENDERIZAÇÃO ====================
function renderizarTabelaAtividades(atividades) {
    const tbody = document.getElementById('tbodyAtividades');
    if (!tbody) return;

    if (!atividades.length) {
        tbody.innerHTML = `
            <tr class="row-empty">
                <td colspan="8">
                    <i class="fas fa-check-circle" style="color: var(--success);"></i>
                    Nenhuma atividade encontrada
                    <br><button class="btn-primary" style="margin-top: 0.5rem;" onclick="abrirModalAtividade('novo')">
                        <i class="fas fa-plus"></i> Criar atividade
                    </button>
                </td>
            </tr>`;
        return;
    }

    const titular = isTitular();
    const estagiario = isEstagiario();

    tbody.innerHTML = atividades.map(a => {
        const norm = s => String(s || '').trim().toUpperCase();
        const statusUp = norm(a.STATUS);
        const situacaoRaw = a.SITUACAO || a.SITUAÇÃO || '';
        const situacaoUp = norm(situacaoRaw);
        const jaProtocolado = situacaoUp === 'PROTOCOLADO';

        const criadoPor = inferirCriadoPor(a);
        const emProducao = isEmProducao(a.STATUS);
        const emAnalise = isEmAnalise(a.STATUS);

        const statusClass = getStatusAtividadeClass(a.STATUS);
        const situacaoClass = getSituacaoAtividadeClass(situacaoRaw);
        const prazoClass = getPrazoClass(a.PRAZO);

        let botoesAcao = '';

        if (titular) {
            const emProducaoDoEstagiario = emProducao && criadoPor === 'ESTAGIARIO';
            const emProducaoDoTitular    = emProducao && criadoPor === 'TITULAR';

            if (emAnalise || emProducaoDoEstagiario) {
                botoesAcao = `
                    <button class="btn-icon-small" onclick="aprovarAtividade('${a._row}')" title="Aprovar (CONFERIDO)" style="color: var(--success);">
                        <i class="fas fa-check-circle"></i>
                    </button>
                    <button class="btn-icon-small" onclick="corrigirAtividade('${a._row}')" title="Solicitar correção (CORRIGIR)" style="color: var(--warning);">
                        <i class="fas fa-undo-alt"></i>
                    </button>
                `;
            } else if (emProducaoDoTitular) {
                botoesAcao = `<span style="font-size: 0.7rem; color: var(--warning);">⏳ Aguardando estagiário</span>`;
            } else if (statusUp === 'CORRIGIR') {
                botoesAcao = `<span style="font-size: 0.7rem; color: var(--warning);">⏳ Aguardando estagiário</span>`;
            } else if (statusUp === 'CONFERIDO') {
                botoesAcao = jaProtocolado
                    ? `<span style="font-size: 0.7rem; color: var(--success);">✅ Protocolado</span>`
                    : `<span style="font-size: 0.7rem; color: var(--warning);">⏳ Aguardando protocolo</span>`;
            }
        } else if (estagiario) {
            const emProducaoDoTitular    = emProducao && criadoPor === 'TITULAR';
            const emProducaoDoEstagiario = emProducao && criadoPor === 'ESTAGIARIO';

            if (statusUp === 'CORRIGIR' || emProducaoDoTitular) {
                botoesAcao = `
                    <button class="btn-icon-small" onclick="enviarParaAnalise('${a._row}')" title="Enviar para análise (EM ANÁLISE)" style="color: var(--info);">
                        <i class="fas fa-paper-plane"></i>
                    </button>
                `;
            } else if (emProducaoDoEstagiario) {
                botoesAcao = `<span style="font-size: 0.7rem; color: var(--warning);">⏳ Aguardando análise</span>`;
            } else if (emAnalise) {
                botoesAcao = `<span style="font-size: 0.7rem; color: var(--warning);">⏳ Aguardando análise</span>`;
            } else if (statusUp === 'CONFERIDO') {
                botoesAcao = jaProtocolado
                    ? `<span style="font-size: 0.7rem; color: var(--success);">✅ Protocolado</span>`
                    : `<button class="btn-icon-small" onclick="protocolarAtividade('${a._row}')" title="Marcar como PROTOCOLADO" style="color: var(--success);">
                           <i class="fas fa-file-signature"></i>
                       </button>`;
            }
        }

        return `
            <tr>
                <td><strong>${esc(a.CLIENTE)}</strong></td>
                <td><span class="mono-text">${esc(a.PROCESSO)}</span></td>
                <td><span class="data-prazo ${prazoClass}">${formatarData(a.PRAZO)}</span></td>
                <td><span class="badge-tipo-prazo">${esc(a['TIPO DE PRAZO'])}</span></td>
                <td>${esc(a.RESPONSAVEL)}</td>
                <td><span class="status ${statusClass}">${esc(a.STATUS)}</span></td>
                <td><span class="status ${situacaoClass}">${esc(situacaoRaw)}</span></td>
                <td>
                    <div style="display: flex; gap: 0.3rem; align-items: center; flex-wrap: wrap;">
                        <button class="btn-icon-small" onclick="editarAtividade('${a._row}')" title="Editar">
                            <i class="fas fa-edit"></i>
                        </button>
                        ${botoesAcao}
                        <button class="btn-icon-small" onclick="excluirAtividade('${a._row}')" title="Excluir" style="color: var(--danger);">
                            <i class="fas fa-trash"></i>
                        </button>
                    </div>
                </td>
            </tr>
        `;
    }).join('');
}

function getStatusAtividadeClass(status) {
    const s = String(status || '').toUpperCase()
        .normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    if (s.includes('EM PRODUCAO')) return 'pending';
    if (s.includes('EM ANALISE')) return 'pending';
    if (s.includes('CONFERIDO')) return 'completed';
    if (s.includes('CORRIGIR')) return 'urgent';
    return 'active';
}

function getSituacaoAtividadeClass(situacao) {
    const s = String(situacao || '').toUpperCase();
    if (s.includes('AGUARDANDO')) return 'pending';
    if (s.includes('PROTOCOLADO')) return 'completed';
    return 'active';
}

function getPrazoClass(data) {
    const dias = diasRestantes(data);
    if (dias === null) return '';
    if (dias < 0) return 'tipo-vencido';
    if (dias === 0) return 'tipo-hoje';
    if (dias <= 7) return 'tipo-proximo';
    return '';
}

// ==================== AÇÕES ====================

async function enviarParaAnalise(row) {
    if (processandoAcao) {
        notificar('Aguarde, processando...', 'warning');
        return;
    }

    if (!confirm('Enviar esta atividade para análise? O status será alterado para EM ANÁLISE.')) return;

    processandoAcao = true;

    try {
        const atividade = todasAtividades.find(a => String(a._row) === String(row));
        if (!atividade) {
            notificar('Atividade não encontrada', 'error');
            return;
        }

        await apiUpdate('ATIVIDADES', parseInt(row), { STATUS: 'EM ANÁLISE' });
        invalidarCacheAposEscrita('ATIVIDADES');
        notificar('📤 Atividade enviada para análise!', 'success');

        await carregarDadosAtividades();

    } catch (error) {
        console.error('❌ Erro ao enviar para análise:', error);
        notificar('Erro: ' + error.message, 'error');
    } finally {
        processandoAcao = false;
    }
}

async function aprovarAtividade(row) {
    if (processandoAcao) {
        notificar('Aguarde, processando...', 'warning');
        return;
    }

    if (!confirm('Aprovar esta atividade? O status será alterado para CONFERIDO.')) return;

    processandoAcao = true;

    try {
        const atividade = todasAtividades.find(a => String(a._row) === String(row));
        if (!atividade) {
            notificar('Atividade não encontrada', 'error');
            return;
        }

        await apiUpdate('ATIVIDADES', parseInt(row), { STATUS: 'CONFERIDO' });
        invalidarCacheAposEscrita('ATIVIDADES');
        notificar('✅ Atividade aprovada com sucesso!', 'success');

        await carregarDadosAtividades();

    } catch (error) {
        console.error('❌ Erro ao aprovar:', error);
        notificar('Erro: ' + error.message, 'error');
    } finally {
        processandoAcao = false;
    }
}

async function corrigirAtividade(row) {
    if (processandoAcao) {
        notificar('Aguarde, processando...', 'warning');
        return;
    }

    if (!confirm('Solicitar correção desta atividade? O status será alterado para CORRIGIR.')) return;

    processandoAcao = true;

    try {
        const atividade = todasAtividades.find(a => String(a._row) === String(row));
        if (!atividade) {
            notificar('Atividade não encontrada', 'error');
            return;
        }

        await apiUpdate('ATIVIDADES', parseInt(row), { STATUS: 'CORRIGIR' });
        invalidarCacheAposEscrita('ATIVIDADES');
        notificar('🔄 Correção solicitada!', 'success');

        await carregarDadosAtividades();

    } catch (error) {
        console.error('❌ Erro ao solicitar correção:', error);
        notificar('Erro: ' + error.message, 'error');
    } finally {
        processandoAcao = false;
    }
}

async function protocolarAtividade(row) {
    if (processandoAcao) {
        notificar('Aguarde, processando...', 'warning');
        return;
    }

    if (!isEstagiario()) {
        notificar('Apenas estagiários podem protocolar.', 'warning');
        return;
    }

    if (!confirm('Marcar esta atividade como PROTOCOLADA? Ela sairá do painel.')) return;

    processandoAcao = true;

    try {
        const atividade = todasAtividades.find(a => String(a._row) === String(row));
        if (!atividade) {
            notificar('Atividade não encontrada', 'error');
            return;
        }

        await apiUpdate('ATIVIDADES', parseInt(row), { SITUACAO: 'PROTOCOLADO' });
        invalidarCacheAposEscrita('ATIVIDADES');
        notificar('📄 Atividade protocolada!', 'success');

        await carregarDadosAtividades();

    } catch (error) {
        console.error('❌ Erro ao protocolar:', error);
        notificar('Erro: ' + error.message, 'error');
    } finally {
        processandoAcao = false;
    }
}

// ==================== MODAL ====================
function abrirModalAtividade(modo, row) {
    const modal = document.getElementById('modalAtividade');
    const titulo = document.getElementById('modalTituloAtividade');
    const form = document.getElementById('formAtividade');
    if (!modal || !form) return;

    form.reset();
    document.getElementById('atividadeRow').value = '';

    const btnSalvar = document.getElementById('salvarAtividade');
    if (btnSalvar) {
        btnSalvar.disabled = false;
        btnSalvar.innerHTML = '<i class="fas fa-save"></i> Salvar';
    }
    salvandoAtividade = false;

    const selectCliente = document.getElementById('atividadeCliente');
    const selectProcesso = document.getElementById('atividadeProcesso');

    if (selectCliente) {
        selectCliente.innerHTML = '<option value="">Selecione um cliente...</option>';

        if (listaNomesClientes.length === 0) {
            selectCliente.innerHTML = '<option value="">Nenhum cliente cadastrado</option>';
            selectCliente.disabled = true;
        } else {
            listaNomesClientes.forEach(nome => {
                const option = document.createElement('option');
                option.value = nome;
                option.textContent = nome;
                selectCliente.appendChild(option);
            });
            selectCliente.disabled = false;
        }
    }

    if (selectProcesso) {
        selectProcesso.innerHTML = '<option value="">Selecione um cliente primeiro...</option>';
        selectProcesso.disabled = true;
    }

    if (modo === 'editar' && row) {
        titulo.textContent = 'Editar Atividade';
        setTimeout(() => {
            carregarAtividadeParaEdicao(row);
        }, 100);
    } else {
        titulo.textContent = 'Nova Atividade';
        document.getElementById('atividadePrazo').value = new Date().toISOString().split('T')[0];

        const selSit = document.getElementById('atividadeSituacao');
        if (selSit) selSit.value = 'AGUARDANDO';
    }

    modal.classList.add('active');
}

function fecharModalAtividade() {
    document.getElementById('modalAtividade')?.classList.remove('active');
    atividadeEditando = null;

    const btnSalvar = document.getElementById('salvarAtividade');
    if (btnSalvar) {
        btnSalvar.disabled = false;
        btnSalvar.innerHTML = '<i class="fas fa-save"></i> Salvar';
    }
    salvandoAtividade = false;
}

function carregarAtividadeParaEdicao(row) {
    const atividade = todasAtividades.find(a => String(a._row) === String(row));
    if (!atividade) return;

    document.getElementById('atividadeRow').value = row;
    document.getElementById('atividadeCliente').value = atividade.CLIENTE || '';
    document.getElementById('atividadeProcesso').value = atividade.PROCESSO || '';
    document.getElementById('atividadePrazo').value = atividade.PRAZO || '';
    document.getElementById('atividadeTipoPrazo').value = atividade['TIPO DE PRAZO'] || '';
    document.getElementById('atividadeResponsavel').value = atividade.RESPONSAVEL || '';

    const selSit = document.getElementById('atividadeSituacao');
    if (selSit) selSit.value = atividade.SITUACAO || atividade.SITUAÇÃO || 'AGUARDANDO';

    setTimeout(() => {
        const event = new Event('change');
        document.getElementById('atividadeCliente').dispatchEvent(event);

        setTimeout(() => {
            document.getElementById('atividadeProcesso').value = atividade.PROCESSO || '';
        }, 100);
    }, 100);
}

// ==================== CRUD ====================
async function salvarAtividade() {
    if (salvandoAtividade) {
        notificar('Aguarde, salvando...', 'warning');
        return;
    }

    const row = document.getElementById('atividadeRow').value;
    const roleUsuario = isTitular() ? 'TITULAR' : 'ESTAGIARIO';

    let statusFinal;
    if (row) {
        const atual = todasAtividades.find(a => String(a._row) === String(row));
        statusFinal = atual?.STATUS || 'EM PRODUÇÃO';
    } else {
        statusFinal = 'EM PRODUÇÃO';
    }

    const dados = {
        'CLIENTE': document.getElementById('atividadeCliente')?.value || '',
        'PROCESSO': document.getElementById('atividadeProcesso')?.value || '',
        'PRAZO': document.getElementById('atividadePrazo')?.value || '',
        'TIPO DE PRAZO': document.getElementById('atividadeTipoPrazo')?.value || '',
        'RESPONSAVEL': document.getElementById('atividadeResponsavel')?.value || '',
        'STATUS': statusFinal,
        'SITUACAO': document.getElementById('atividadeSituacao')?.value || 'AGUARDANDO'
    };

    if (!row) {
        dados['CRIADO_POR_ROLE'] = roleUsuario;
    }

    if (!dados.CLIENTE || !dados.PROCESSO || !dados.PRAZO || !dados['TIPO DE PRAZO'] || !dados.RESPONSAVEL) {
        notificar('Preencha todos os campos obrigatórios!', 'warning');
        return;
    }

    salvandoAtividade = true;
    const btnSalvar = document.getElementById('salvarAtividade');
    if (btnSalvar) {
        btnSalvar.disabled = true;
        btnSalvar.innerHTML = '<i class="fas fa-spinner fa-pulse"></i> Salvando...';
    }

    try {
        if (row) {
            await apiUpdate('ATIVIDADES', parseInt(row), dados);
            notificar('Atividade atualizada!', 'success');
        } else {
            await apiCreate('ATIVIDADES', dados);
            notificar('Atividade criada!', 'success');
        }

        invalidarCacheAposEscrita('ATIVIDADES');

        fecharModalAtividade();
        await carregarDadosAtividades();

    } catch (error) {
        console.error('Erro ao salvar:', error);
        notificar('Erro: ' + error.message, 'error');
    } finally {
        salvandoAtividade = false;
        if (btnSalvar) {
            btnSalvar.disabled = false;
            btnSalvar.innerHTML = '<i class="fas fa-save"></i> Salvar';
        }
    }
}

function editarAtividade(row) {
    abrirModalAtividade('editar', row);
}

async function excluirAtividade(row) {
    if (!confirm('Tem certeza que deseja excluir esta atividade?')) return;

    try {
        await apiDelete('ATIVIDADES', parseInt(row));
        invalidarCacheAposEscrita('ATIVIDADES');
        notificar('Atividade excluída!', 'success');
        await carregarDadosAtividades();
    } catch (error) {
        console.error('Erro ao excluir:', error);
        notificar('Erro: ' + error.message, 'error');
    }
}

// ==================== KEYBOARD SHORTCUTS ====================
document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') fecharModalAtividade();
});

// ==================== EXPORTAÇÃO GLOBAL ====================
window.inicializarAtividades = inicializarAtividades;
window.abrirModalAtividade = abrirModalAtividade;
window.fecharModalAtividade = fecharModalAtividade;
window.editarAtividade = editarAtividade;
window.excluirAtividade = excluirAtividade;
window.salvarAtividade = salvarAtividade;
window.enviarParaAnalise = enviarParaAnalise;
window.aprovarAtividade = aprovarAtividade;
window.corrigirAtividade = corrigirAtividade;
window.protocolarAtividade = protocolarAtividade;
window.inferirCriadoPor = inferirCriadoPor;