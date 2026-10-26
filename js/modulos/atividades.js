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

// ==================== INICIALIZAÇÃO ====================
async function inicializarAtividades() {
    //console.log('📋 Inicializando controle de atividades...');
    
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
    document.getElementById('modalAtividade')?.addEventListener('click', function(e) {
        if (e.target === this) fecharModalAtividade();
    });
    
    document.getElementById('salvarAtividade')?.addEventListener('click', salvarAtividade);
    
    document.getElementById('buscaAtividades')?.addEventListener('input', debounce(() => {
        aplicarFiltrosAtividades();
    }, 300));
    
    document.querySelectorAll('.filtros-rapidos .filtro-btn').forEach(btn => {
        btn.addEventListener('click', function() {
            document.querySelectorAll('.filtros-rapidos .filtro-btn').forEach(b => b.classList.remove('active'));
            this.classList.add('active');
            filtroAtualAtividades = this.getAttribute('data-filtro');
            aplicarFiltrosAtividades();
        });
    });
    
    document.getElementById('atividadeCliente')?.addEventListener('change', function() {
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
        //console.log('📥 Carregando dados das atividades...');

        //console.log('📥 Carregando clientes...');
        const clientes = await carregarComCache('CLIENTES');
        clientesCarregados = clientes.filter(c => c.NOME && String(c.NOME).trim());
        listaNomesClientes = clientesCarregados.map(c => c.NOME);
        //console.log(`✅ ${listaNomesClientes.length} clientes carregados`);
        await new Promise(r => setTimeout(r, 400));

        //console.log('📥 Carregando processos...');
        const processos = await carregarComCache('PROCESSOS');
        processosCarregados = processos.filter(p => p['N PROCESSO'] || p.CLIENTE);
        //console.log(`✅ ${processosCarregados.length} processos carregados`);
        await new Promise(r => setTimeout(r, 400));

        //console.log('📥 Carregando atividades...');
        const atividades = await carregarComCache('ATIVIDADES');
        todasAtividades = atividades.filter(a => a.CLIENTE || a.PROCESSO);
        //console.log(`✅ ${todasAtividades.length} atividades carregadas`);

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
        filtrados = filtrados.filter(a =>
            String(a.STATUS || '').toUpperCase() === filtroAtualAtividades.toUpperCase() ||
            String(a.SITUAÇÃO || '').toUpperCase() === filtroAtualAtividades.toUpperCase()
        );
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
    const usuario = auth.getUsuario();
    return usuario && (usuario.role === 'ADM' || usuario.role === 'ADVOGADO TITULAR');
}

function isEstagiario() {
    const usuario = auth.getUsuario();
    return usuario && usuario.role === 'ESTAGIARIO';
}

// ==================== NOTIFICAÇÃO INTERNA ====================
function enviarNotificacaoInterna(dados) {
    try {
        if (typeof window.getNotificacoes !== 'function') {
            console.warn('⚠️ Módulo de notificações não disponível');
            return;
        }
        
        const notificacoes = window.getNotificacoes();
        const novaNotificacao = {
            id: `atividade_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`,
            titulo: dados.titulo,
            mensagem: dados.mensagem,
            tipo: dados.tipo || 'info',
            data: new Date().toISOString(),
            lida: false,
            link: dados.link || 'atividades',
            processo: dados.processo || '',
            origem: 'sistema'
        };
        
        notificacoes.unshift(novaNotificacao);
        localStorage.setItem('tavares_notificacoes', JSON.stringify(notificacoes));
        
        if (typeof window.atualizarBadge === 'function') {
            window.atualizarBadge();
        }
        
        //console.log('🔔 Notificação enviada:', dados.titulo);
        
    } catch (error) {
        console.error('❌ Erro ao enviar notificação:', error);
    }
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
        const statusClass = getStatusAtividadeClass(a.STATUS);
        const situacaoClass = getSituacaoAtividadeClass(a.SITUAÇÃO);
        const prazoClass = getPrazoClass(a.PRAZO);
        
        let botoesAcao = '';
        
        if (titular) {
            if (a.STATUS === 'EM ANÁLISE') {
                botoesAcao = `
                    <button class="btn-icon-small" onclick="aprovarAtividade('${a._row}')" title="Aprovar (CONFERIDO)" style="color: var(--success);">
                        <i class="fas fa-check-circle"></i>
                    </button>
                    <button class="btn-icon-small" onclick="corrigirAtividade('${a._row}')" title="Solicitar correção (CORRIGIR)" style="color: var(--warning);">
                        <i class="fas fa-undo-alt"></i>
                    </button>
                `;
            } else if (a.STATUS === 'CORRIGIR') {
                botoesAcao = `
                    <span style="font-size: 0.7rem; color: var(--warning);">⏳ Aguardando estagiário</span>
                `;
            } else if (a.STATUS === 'CONFERIDO') {
                botoesAcao = `
                    <span style="font-size: 0.7rem; color: var(--success);">✅ Concluído</span>
                `;
            }
        } else if (estagiario) {
            if (a.STATUS === 'CORRIGIR') {
                botoesAcao = `
                    <button class="btn-icon-small" onclick="enviarParaAnalise('${a._row}')" title="Enviar para análise (EM ANÁLISE)" style="color: var(--info);">
                        <i class="fas fa-paper-plane"></i>
                    </button>
                `;
            } else if (a.STATUS === 'EM ANÁLISE') {
                botoesAcao = `
                    <span style="font-size: 0.7rem; color: var(--warning);">⏳ Aguardando análise</span>
                `;
            } else if (a.STATUS === 'CONFERIDO') {
                botoesAcao = `
                    <span style="font-size: 0.7rem; color: var(--success);">✅ Aprovado</span>
                `;
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
                <td><span class="status ${situacaoClass}">${esc(a.SITUAÇÃO)}</span></td>
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
    const s = String(status || '').toUpperCase();
    if (s.includes('EM ANÁLISE')) return 'pending';
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

// ==================== AÇÕES (com loading) ====================

// ESTAGIARIO: Enviar para análise (CORRIGIR → EM ANÁLISE)
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
        
        const usuario = auth.getUsuario();
        enviarNotificacaoInterna({
            titulo: '📋 Atividade em Análise',
            mensagem: `${usuario.nome} enviou a atividade de ${atividade.CLIENTE} para análise.`,
            tipo: 'info',
            link: 'atividades',
            processo: atividade.PROCESSO || ''
        });
        
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
        
        const usuario = auth.getUsuario();
        enviarNotificacaoInterna({
            titulo: '✅ Atividade Aprovada',
            mensagem: `A atividade de ${atividade.CLIENTE} foi aprovada por ${usuario.nome}.`,
            tipo: 'success',
            link: 'atividades',
            processo: atividade.PROCESSO || ''
        });
        
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
        
        const usuario = auth.getUsuario();
        enviarNotificacaoInterna({
            titulo: '⚠️ Correção Solicitada',
            mensagem: `A atividade de ${atividade.CLIENTE} precisa de correção. Solicitado por ${usuario.nome}.`,
            tipo: 'urgent',
            link: 'atividades',
            processo: atividade.PROCESSO || ''
        });
        
        await carregarDadosAtividades();
        
    } catch (error) {
        console.error('❌ Erro ao solicitar correção:', error);
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
    
    // 🔓 Restaura o botão Salvar
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
        
        if (isTitular()) {
            document.getElementById('atividadeStatus').value = 'CORRIGIR';
        }
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
    document.getElementById('atividadeStatus').value = atividade.STATUS || '';
    document.getElementById('atividadeSituacao').value = atividade.SITUAÇÃO || '';

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

    const dados = {
        'CLIENTE': document.getElementById('atividadeCliente')?.value || '',
        'PROCESSO': document.getElementById('atividadeProcesso')?.value || '',
        'PRAZO': document.getElementById('atividadePrazo')?.value || '',
        'TIPO DE PRAZO': document.getElementById('atividadeTipoPrazo')?.value || '',
        'RESPONSAVEL': document.getElementById('atividadeResponsavel')?.value || '',
        'STATUS': document.getElementById('atividadeStatus')?.value || '',
        'SITUAÇÃO': document.getElementById('atividadeSituacao')?.value || ''
    };

    //console.log('📝 Salvando atividade:', dados);

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
            
            if (isTitular()) {
                const usuario = auth.getUsuario();
                enviarNotificacaoInterna({
                    titulo: '📋 Nova Atividade para Corrigir',
                    mensagem: `${usuario.nome} criou uma nova atividade para ${dados.CLIENTE}. Aguardando correção.`,
                    tipo: 'info',
                    link: 'atividades',
                    processo: dados.PROCESSO || ''
                });
            }
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

//console.log('📋 Módulo de atividades carregado (v2.0 — loading + proteção duplo clique)');