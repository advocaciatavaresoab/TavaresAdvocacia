
// ==================== ESTADO ====================
let todasPericias = [];
let todosProcessosPericias = [];
let filtroAtualPericias = 'todos';
let salvandoPericia = false;

// ==================== INICIALIZAÇÃO ====================
async function inicializarPericias() {
    //console.log('🩺 Inicializando perícias...');
    
    await aguardarElementosPericias();
    await carregarPericias();
    await carregarProcessosParaPericias();
    initEventosPericias();
    
    //console.log('✅ Módulo perícias inicializado');
}

function aguardarElementosPericias() {
    return new Promise((resolve) => {
        const check = () => {
            const tabela = document.getElementById('tbodyPericias');
            const busca = document.getElementById('buscaPericia');
            if (tabela && busca) {
                resolve();
            } else {
                setTimeout(check, 100);
            }
        };
        check();
    });
}

function initEventosPericias() {
    document.getElementById('buscaPericia')?.addEventListener('input', debounce(() => {
        aplicarFiltrosPericias();
    }, 300));

    document.querySelectorAll('.filtros-rapidos .filtro-btn').forEach(btn => {
        btn.addEventListener('click', function() {
            const container = this.closest('.filtros-rapidos');
            if (container) {
                container.querySelectorAll('.filtro-btn').forEach(b => b.classList.remove('active'));
            }
            this.classList.add('active');
            filtroAtualPericias = this.getAttribute('data-filtro');
            aplicarFiltrosPericias();
        });
    });

    // Modal Cadastro/Edição
    document.getElementById('btnNovaPericia')?.addEventListener('click', () => abrirModalPericia('novo'));
    document.getElementById('fecharModalPericia')?.addEventListener('click', fecharModalPericia);
    document.getElementById('cancelarPericia')?.addEventListener('click', fecharModalPericia);
    document.getElementById('salvarPericia')?.addEventListener('click', salvarPericia);
    document.getElementById('modalPericia')?.addEventListener('click', function(e) {
        if (e.target === this) fecharModalPericia();
    });

    // Auto-preenche cliente ao selecionar processo
    document.getElementById('periciaProcesso')?.addEventListener('input', function() {
        preencherClientePorProcessoPericia(this.value);
    });
    document.getElementById('periciaProcesso')?.addEventListener('change', function() {
        preencherClientePorProcessoPericia(this.value);
    });

    // Modal Visualizar
    document.getElementById('fecharModalVisualizarPericia')?.addEventListener('click', fecharModalVisualizarPericia);
    document.getElementById('btnFecharVisualizarPericia')?.addEventListener('click', fecharModalVisualizarPericia);
    document.getElementById('btnEditarDoVisualizarPericia')?.addEventListener('click', editarDoVisualizarPericia);
}

// ==================== CARREGAMENTO ====================
async function carregarPericias() {
    try {
        const dados = await carregarComCache('PERICIAS');
        todasPericias = dados.filter(p => p.PROCESSO || p.CLIENTE);
        //console.log(`📋 Perícias válidas: ${todasPericias.length} de ${dados.length}`);
        atualizarStatsPericias();
        aplicarFiltrosPericias();
    } catch (error) {
        console.error('Erro ao carregar perícias:', error);
        const tbody = document.getElementById('tbodyPericias');
        if (tbody) tbody.innerHTML = '<tr class="row-empty"><td colspan="10">Erro ao carregar</td></tr>';
    }
}

async function carregarProcessosParaPericias() {
    try {
        const dados = await carregarComCache('PROCESSOS');
        todosProcessosPericias = dados.filter(p => p['N PROCESSO'] && String(p['N PROCESSO']).trim());
        //console.log(`📋 Processos para perícias: ${todosProcessosPericias.length}`);
        preencherDatalistProcessosPericias();
    } catch (error) {
        console.error('Erro ao carregar processos para perícias:', error);
        todosProcessosPericias = [];
    }
}

function preencherDatalistProcessosPericias() {
    const datalist = document.getElementById('listaProcessosPericia');
    if (!datalist) return;
    
    const ordenados = [...todosProcessosPericias].sort((a, b) => {
        const na = String(a['N PROCESSO'] || '').trim();
        const nb = String(b['N PROCESSO'] || '').trim();
        return na.localeCompare(nb);
    });
    
    datalist.innerHTML = ordenados.map(p => {
        const num = String(p['N PROCESSO'] || '').trim();
        const cliente = String(p.CLIENTE || '').trim();
        const label = cliente ? `${num} — ${cliente}` : num;
        return `<option value="${esc(num)}">${esc(label)}</option>`;
    }).join('');
}

function preencherClientePorProcessoPericia(numeroProcesso) {
    const campoCliente = document.getElementById('periciaCliente');
    if (!campoCliente) return;
    
    const numero = String(numeroProcesso || '').trim();
    if (!numero) return;
    
    const processo = todosProcessosPericias.find(p => 
        String(p['N PROCESSO'] || '').trim().toLowerCase() === numero.toLowerCase()
    );
    
    if (processo) {
        const cliente = String(processo.CLIENTE || '').trim();
        if (cliente) {
            campoCliente.value = cliente;
            //console.log(`✅ Cliente preenchido automaticamente: ${cliente}`);
        }
    }
}

function atualizarStatsPericias() {
    const total = todasPericias.length;
    const realizadas = todasPericias.filter(p => p.STATUS === 'REALIZADA').length;
    const agendadas = todasPericias.filter(p => p.STATUS === 'AGENDADA').length;
    const pendentes = todasPericias.filter(p => p.STATUS === 'PENDENTE').length;
    const canceladas = todasPericias.filter(p => p.STATUS === 'CANCELADA').length;
    const judiciais = todasPericias.filter(p => p['TIPO DE PERICIA'] === 'JUDICIAL').length;
    
    setText('totalPericias', total);
    setText('periciasRealizadas', realizadas);
    setText('periciasAgendadas', agendadas);
    setText('periciasPendentes', pendentes);
    setText('periciasCanceladas', canceladas);
    setText('periciasJudiciais', judiciais);
}

function aplicarFiltrosPericias() {
    let filtradas = [...todasPericias];
    
    if (['AGENDADA', 'REALIZADA', 'PENDENTE', 'CANCELADA'].includes(filtroAtualPericias)) {
        filtradas = filtradas.filter(p => p.STATUS === filtroAtualPericias);
    } else if (filtroAtualPericias === 'MÉDICA') {
        filtradas = filtradas.filter(p => String(p.PERICIA || '').toUpperCase().includes('MÉDICA'));
    } else if (filtroAtualPericias === 'SOCIAL') {
        filtradas = filtradas.filter(p => String(p.PERICIA || '').toUpperCase().includes('SOCIAL'));
    }
    
    const busca = (document.getElementById('buscaPericia')?.value || '').toLowerCase().trim();
    if (busca) {
        filtradas = filtradas.filter(p =>
            String(p.PROCESSO || '').toLowerCase().includes(busca) ||
            String(p.CLIENTE || '').toLowerCase().includes(busca) ||
            String(p['TIPO DE BENEFICIO'] || '').toLowerCase().includes(busca)
        );
    }
    
    renderizarTabelaPericias(filtradas);
    setText('contagemPericias', `${filtradas.length} de ${todasPericias.length} registros`);
}

// ==================== TABELA ====================
function renderizarTabelaPericias(pericias) {
    const tbody = document.getElementById('tbodyPericias');
    if (!tbody) return;
    
    if (!pericias.length) {
        tbody.innerHTML = '<tr class="row-empty"><td colspan="10"><i class="fas fa-search"></i> Nenhuma perícia encontrada</td></tr>';
        return;
    }
    
    tbody.innerHTML = pericias.map(p => {
        const periciaUpper = String(p.PERICIA || '').toUpperCase();
        const periciaClass = periciaUpper.includes('SOCIAL') && periciaUpper.includes('MÉDICA') ? 'ambas' :
                            periciaUpper.includes('SOCIAL') ? 'social' : 'medica';
        
        const statusUpper = String(p.STATUS || '').toUpperCase();
        const statusClass = statusUpper === 'REALIZADA' ? 'completed' :
                           statusUpper === 'AGENDADA' ? 'active' :
                           statusUpper === 'PENDENTE' ? 'pending' : 'urgent';
        
        const judicialClass = String(p['TIPO DE PERICIA'] || '').toUpperCase() === 'ADMINISTRATIVA' ? 'administrativa' : 'judicial';
        
        const dataMedica = p['DATA DA PERICIA MEDICA'];
        const dataSocial = p['DATA DA PERICIA SOCIAL'];
        
        const hoje = new Date().toISOString().split('T')[0];
        const classeDataMedica = !dataMedica ? '' : dataMedica === hoje ? 'hoje' : dataMedica < hoje ? 'passada' : 'proxima';
        const classeDataSocial = !dataSocial ? '' : dataSocial === hoje ? 'hoje' : dataSocial < hoje ? 'passada' : 'proxima';
        
        return `
            <tr>
                <td><span class="mono-text">${esc(p.PROCESSO)}</span></td>
                <td><strong>${esc(p.CLIENTE)}</strong></td>
                <td>${esc(p['TIPO DE BENEFICIO'])}</td>
                <td><span class="badge-pericia ${periciaClass}">${esc(p.PERICIA)}</span></td>
                <td><span class="data-pericia ${classeDataMedica}">${formatarData(dataMedica)}</span></td>
                <td><span class="data-pericia ${classeDataSocial}">${formatarData(dataSocial)}</span></td>
                <td><span class="badge-judicial ${judicialClass}">${esc(p['TIPO DE PERICIA'])}</span></td>
                <td><i class="fas fa-map-marker-alt"></i> ${esc(p['LOCAL DA PERICIA'])}</td>
                <td><span class="status ${statusClass}">${esc(p.STATUS)}</span></td>
                <td>
                    <div class="acoes">
                        <button class="btn-icon-small" title="Editar" onclick="abrirEdicaoPericia(${p._row})">
                            <i class="fas fa-edit"></i>
                        </button>
                        <button class="btn-icon-small" title="Visualizar" onclick="abrirModalVisualizarPericia(${p._row})">
                            <i class="fas fa-eye"></i>
                        </button>
                        <button class="btn-icon-small danger" title="Excluir" onclick="confirmarExclusaoPericia(${p._row})">
                            <i class="fas fa-trash"></i>
                        </button>
                    </div>
                </td>
            </tr>
        `;
    }).join('');
}

// ==================== MODAL CADASTRO/EDIÇÃO ====================
function abrirModalPericia(modo, dados) {
    const modal = document.getElementById('modalPericia');
    const titulo = document.getElementById('modalTituloPericia');
    const form = document.getElementById('formPericia');
    if (!modal || !form) return;
    
    form.reset();
    document.getElementById('periciaRow').value = '';
    
    const btnSalvar = document.getElementById('salvarPericia');
    if (btnSalvar) {
        btnSalvar.disabled = false;
        btnSalvar.innerHTML = '<i class="fas fa-save"></i> Salvar';
    }
    salvandoPericia = false;
    
    if (modo === 'edicao' && dados) {
        titulo.textContent = 'Editar Perícia';
        document.getElementById('periciaRow').value = dados._row || '';
        document.getElementById('periciaProcesso').value = dados.PROCESSO || '';
        document.getElementById('periciaCliente').value = dados.CLIENTE || '';
        document.getElementById('periciaBeneficio').value = dados['TIPO DE BENEFICIO'] || '';
        document.getElementById('periciaTipo').value = dados.PERICIA || 'MÉDICA';
        document.getElementById('periciaDataMedica').value = converterDataISO(dados['DATA DA PERICIA MEDICA']);
        document.getElementById('periciaDataSocial').value = converterDataISO(dados['DATA DA PERICIA SOCIAL']);
        document.getElementById('periciaTipoJudicial').value = dados['TIPO DE PERICIA'] || 'JUDICIAL';
        document.getElementById('periciaLocal').value = dados['LOCAL DA PERICIA'] || '';
        document.getElementById('periciaStatus').value = dados.STATUS || 'AGENDADA';
        document.getElementById('periciaResultado').value = dados.RESULTADO || '';
        document.getElementById('periciaObs').value = dados.OBS || '';
    } else {
        titulo.textContent = 'Nova Perícia';
        document.getElementById('periciaRow').value = '';
    }
    
    modal.classList.add('active');
}

function fecharModalPericia() {
    document.getElementById('modalPericia')?.classList.remove('active');
    
    const btnSalvar = document.getElementById('salvarPericia');
    if (btnSalvar) {
        btnSalvar.disabled = false;
        btnSalvar.innerHTML = '<i class="fas fa-save"></i> Salvar';
    }
    salvandoPericia = false;
}

// ==================== SALVAR ====================
async function salvarPericia() {
    if (salvandoPericia) {
        notificar('Aguarde, salvando...', 'warning');
        return;
    }
    
    const row = document.getElementById('periciaRow')?.value;
    
    const dados = {
        'PROCESSO': document.getElementById('periciaProcesso')?.value?.trim() || '',
        'CLIENTE': document.getElementById('periciaCliente')?.value?.trim() || '',
        'TIPO DE BENEFICIO': document.getElementById('periciaBeneficio')?.value?.trim() || '',
        'PERICIA': document.getElementById('periciaTipo')?.value || 'MÉDICA',
        'DATA DA PERICIA MEDICA': document.getElementById('periciaDataMedica')?.value || '',
        'DATA DA PERICIA SOCIAL': document.getElementById('periciaDataSocial')?.value || '',
        'TIPO DE PERICIA': document.getElementById('periciaTipoJudicial')?.value || 'JUDICIAL',
        'LOCAL DA PERICIA': document.getElementById('periciaLocal')?.value?.trim() || '',
        'STATUS': document.getElementById('periciaStatus')?.value || 'AGENDADA',
        'RESULTADO': document.getElementById('periciaResultado')?.value || '',
        'OBS': document.getElementById('periciaObs')?.value?.trim() || ''
    };
    
    if (!dados['PROCESSO'] || !dados['CLIENTE']) {
        notificar('Preencha Processo e Cliente!', 'warning');
        return;
    }
    
    //console.log('📝 Salvando perícia:', dados);
    
    salvandoPericia = true;
    const btnSalvar = document.getElementById('salvarPericia');
    if (btnSalvar) {
        btnSalvar.disabled = true;
        btnSalvar.innerHTML = '<i class="fas fa-spinner fa-pulse"></i> Salvando...';
    }
    
    try {
        if (row) {
            await apiUpdate('PERICIAS', parseInt(row), dados);
            notificar('Perícia atualizada!', 'success');
        } else {
            await apiCreate('PERICIAS', dados);
            notificar('Perícia cadastrada!', 'success');
        }
        fecharModalPericia();
        await carregarPericias();
        
        if (typeof inicializarPainel === 'function') {
            setTimeout(() => inicializarPainel(), 500);
        }
    } catch (error) {
        console.error('Erro ao salvar:', error);
        notificar('Erro: ' + error.message, 'error');
    } finally {
        salvandoPericia = false;
        if (btnSalvar) {
            btnSalvar.disabled = false;
            btnSalvar.innerHTML = '<i class="fas fa-save"></i> Salvar';
        }
    }
}

async function abrirEdicaoPericia(row) {
    try {
        const pericia = await apiGet('PERICIAS', row);
        abrirModalPericia('edicao', pericia);
    } catch (error) {
        notificar('Erro ao carregar', 'error');
    }
}

async function confirmarExclusaoPericia(row, processo) {
    if (!processo) {
        const p = todasPericias.find(x => x._row === row);
        processo = p?.PROCESSO || 'esta perícia';
    }
    
    if (!confirm(`Excluir perícia do processo ${processo}?`)) return;
    try {
        await apiDelete('PERICIAS', row);
        notificar('Perícia excluída!', 'success');
        await carregarPericias();
    } catch (error) {
        notificar('Erro ao excluir', 'error');
    }
}

// ==================== VISUALIZAR PERÍCIA ====================
function abrirModalVisualizarPericia(row) {
    const p = todasPericias.find(x => x._row === row);
    if (!p) {
        notificar('Perícia não encontrada', 'error');
        return;
    }
    
    const modal = document.getElementById('modalVisualizarPericia');
    if (!modal) return;
    
    // 🔒 Converte TUDO para String (evita erro de .trim())
    const processo = String(p.PROCESSO || '—');
    const cliente = String(p.CLIENTE || '—');
    const beneficio = String(p['TIPO DE BENEFICIO'] || '—');
    const modalidade = String(p.PERICIA || '—');
    const tipoPericia = String(p['TIPO DE PERICIA'] || '—');
    const local = String(p['LOCAL DA PERICIA'] || '—');
    const status = String(p.STATUS || 'AGENDADA').toUpperCase();
    const resultado = p.RESULTADO !== undefined && p.RESULTADO !== null ? String(p.RESULTADO) : '';
    const obs = p.OBS !== undefined && p.OBS !== null ? String(p.OBS) : '';
    const dataMedica = p['DATA DA PERICIA MEDICA'];
    const dataSocial = p['DATA DA PERICIA SOCIAL'];
    
    // === Ícone dinâmico ===
    const icone = document.getElementById('vizPericiaIcone');
    if (icone) {
        let iconClass = 'fa-stethoscope';
        const modalidadeUpper = modalidade.toUpperCase();
        if (modalidadeUpper.includes('SOCIAL') && !modalidadeUpper.includes('MÉDICA')) {
            iconClass = 'fa-users';
        } else if (modalidadeUpper.includes('SOCIAL') && modalidadeUpper.includes('MÉDICA')) {
            iconClass = 'fa-user-md';
        }
        icone.innerHTML = `<i class="fas ${iconClass}"></i>`;
    }
    
    // === Cabeçalho ===
    document.getElementById('vizPericiaProcesso').textContent = processo;
    document.getElementById('vizPericiaCliente').textContent = cliente;
    
    const statusEl = document.getElementById('vizPericiaStatus');
    if (statusEl) {
        statusEl.textContent = status;
        let statusClass = 'active';
        if (status === 'REALIZADA') statusClass = 'completed';
        else if (status === 'PENDENTE') statusClass = 'pending';
        else if (status === 'CANCELADA') statusClass = 'urgent';
        statusEl.className = 'status ' + statusClass;
    }
    
    // === Detalhes ===
    document.getElementById('vizPericiaBeneficio').textContent = beneficio;
    document.getElementById('vizPericiaTipo').textContent = tipoPericia;
    document.getElementById('vizPericiaModalidade').textContent = modalidade;
    document.getElementById('vizPericiaEsfera').textContent = tipoPericia;
    
    // === Datas ===
    const dataMedicaBox = document.getElementById('vizPericiaDataMedicaBox');
    const dataSocialBox = document.getElementById('vizPericiaDataSocialBox');
    
    if (dataMedica) {
        if (dataMedicaBox) dataMedicaBox.style.display = 'flex';
        document.getElementById('vizPericiaDataMedica').textContent = formatarData(dataMedica);
    } else {
        if (dataMedicaBox) dataMedicaBox.style.display = 'none';
    }
    
    if (dataSocial) {
        if (dataSocialBox) dataSocialBox.style.display = 'flex';
        document.getElementById('vizPericiaDataSocial').textContent = formatarData(dataSocial);
    } else {
        if (dataSocialBox) dataSocialBox.style.display = 'none';
    }
    
    // === Local ===
    document.getElementById('vizPericiaLocal').textContent = local;
    
    // === Resultado (só se tiver) ===
    const resultadoBox = document.getElementById('vizPericiaResultadoBox');
    const resultadoTexto = resultado.trim();
    if (resultadoTexto) {
        if (resultadoBox) resultadoBox.style.display = 'block';
        document.getElementById('vizPericiaResultado').textContent = resultadoTexto;
    } else {
        if (resultadoBox) resultadoBox.style.display = 'none';
    }
    
    // === Observações (só se tiver) ===
    const obsBox = document.getElementById('vizPericiaObsBox');
    const obsTexto = obs.trim();
    if (obsTexto) {
        if (obsBox) obsBox.style.display = 'block';
        document.getElementById('vizPericiaObs').textContent = obsTexto;
    } else {
        if (obsBox) obsBox.style.display = 'none';
    }
    
    modal.dataset.periciaRow = row;
    modal.classList.add('active');
}

function fecharModalVisualizarPericia() {
    document.getElementById('modalVisualizarPericia')?.classList.remove('active');
}

function editarDoVisualizarPericia() {
    const row = document.getElementById('modalVisualizarPericia')?.dataset.periciaRow;
    if (row) {
        fecharModalVisualizarPericia();
        abrirEdicaoPericia(parseInt(row));
    }
}

// ==================== KEYBOARD SHORTCUTS ====================
document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
        fecharModalPericia();
        fecharModalVisualizarPericia();
    }
});

// ==================== EXPORTAÇÃO GLOBAL ====================
window.inicializarPericias = inicializarPericias;
window.abrirModalPericia = abrirModalPericia;
window.fecharModalPericia = fecharModalPericia;
window.abrirEdicaoPericia = abrirEdicaoPericia;
window.confirmarExclusaoPericia = confirmarExclusaoPericia;
window.salvarPericia = salvarPericia;
window.abrirModalVisualizarPericia = abrirModalVisualizarPericia;
window.fecharModalVisualizarPericia = fecharModalVisualizarPericia;
window.editarDoVisualizarPericia = editarDoVisualizarPericia;

//console.log('🩺 Módulo perícias carregado (v3.1 — datalist + cache + loading + visualizar)');