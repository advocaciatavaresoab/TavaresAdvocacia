// ==================== ESTADO ====================
let todosEventos = [];
let todosProcessosAgenda = [];
let filtroAtualAgenda = 'todos';
let dataSelecionada = new Date();
let mesAtual = new Date().getMonth();
let anoAtual = new Date().getFullYear();
let salvandoEvento = false;

// ==================== HELPER DE FUSO HORÁRIO ====================
function parseDataLocal(dataStr) {
    if (!dataStr) return null;
    if (dataStr instanceof Date) return dataStr;
    
    const str = String(dataStr).trim();
    const matchIso = str.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (matchIso) {
        const ano = parseInt(matchIso[1], 10);
        const mes = parseInt(matchIso[2], 10) - 1;
        const dia = parseInt(matchIso[3], 10);
        return new Date(ano, mes, dia);
    }
    
    const matchBr = str.match(/^(\d{2})\/(\d{2})\/(\d{4})/);
    if (matchBr) {
        const dia = parseInt(matchBr[1], 10);
        const mes = parseInt(matchBr[2], 10) - 1;
        const ano = parseInt(matchBr[3], 10);
        return new Date(ano, mes, dia);
    }
    
    const d = new Date(str);
    return isNaN(d.getTime()) ? null : d;
}

function formatarDataISO(data) {
    if (!data || isNaN(data.getTime())) return '';
    const ano = data.getFullYear();
    const mes = String(data.getMonth() + 1).padStart(2, '0');
    const dia = String(data.getDate()).padStart(2, '0');
    return `${ano}-${mes}-${dia}`;
}

// ==================== HELPER: FORMATA DURAÇÃO ====================
function formatarDuracao(minutos) {
    const min = parseInt(minutos) || 60;
    if (min >= 60) {
        const h = Math.floor(min / 60);
        const restoMin = min % 60;
        return restoMin > 0
            ? `${h}h${String(restoMin).padStart(2, '0')}`
            : `${h}h`;
    }
    return `${min}min`;
}

// ==================== INICIALIZAÇÃO ====================
async function inicializarAgenda() {
    //console.log('📅 Inicializando agenda...');
    
    await aguardarElementosAgenda();
    await carregarEventos();
    await carregarProcessosParaAgenda();
    renderizarCalendario();
    initEventosAgenda();
    
    //console.log('✅ Módulo agenda inicializado');
}

function aguardarElementosAgenda() {
    return new Promise((resolve) => {
        const check = () => {
            const calendario = document.getElementById('calendarioDias');
            const timeline = document.getElementById('timelineEventos');
            if (calendario && timeline) {
                resolve();
            } else {
                setTimeout(check, 100);
            }
        };
        check();
    });
}

function initEventosAgenda() {
    document.getElementById('btnMesAnterior')?.addEventListener('click', () => {
        mesAtual--;
        if (mesAtual < 0) { mesAtual = 11; anoAtual--; }
        renderizarCalendario();
    });
    
    document.getElementById('btnMesProximo')?.addEventListener('click', () => {
        mesAtual++;
        if (mesAtual > 11) { mesAtual = 0; anoAtual++; }
        renderizarCalendario();
    });
    
    document.getElementById('btnHoje')?.addEventListener('click', () => {
        const hoje = new Date();
        mesAtual = hoje.getMonth();
        anoAtual = hoje.getFullYear();
        dataSelecionada = hoje;
        renderizarCalendario();
        mostrarEventosDoDia(hoje);
    });

    document.getElementById('buscaAgenda')?.addEventListener('input', debounce(() => {
        aplicarFiltrosAgenda();
    }, 300));

    document.querySelectorAll('.calendario-nav .filtro-btn').forEach(btn => {
        btn.addEventListener('click', function() {
            document.querySelectorAll('.calendario-nav .filtro-btn').forEach(b => b.classList.remove('active'));
            this.classList.add('active');
            filtroAtualAgenda = this.getAttribute('data-filtro');
            aplicarFiltrosAgenda();
        });
    });

    // Modal Evento (novo/editar)
    document.getElementById('btnNovoEvento')?.addEventListener('click', () => abrirModalEvento('novo'));
    document.getElementById('fecharModalEvento')?.addEventListener('click', fecharModalEvento);
    document.getElementById('cancelarEvento')?.addEventListener('click', fecharModalEvento);
    document.getElementById('salvarEvento')?.addEventListener('click', salvarEvento);
    
    // Auto-preenche cliente ao selecionar processo
    document.getElementById('eventoProcesso')?.addEventListener('input', function() {
        preencherClientePorProcesso(this.value);
    });
    document.getElementById('eventoProcesso')?.addEventListener('change', function() {
        preencherClientePorProcesso(this.value);
    });

    // Modal Visualizar Evento
    document.getElementById('fecharModalVisualizarEvento')?.addEventListener('click', fecharModalVisualizarEvento);
    document.getElementById('btnFecharVisualizarEvento')?.addEventListener('click', fecharModalVisualizarEvento);
    document.getElementById('btnEditarDoVisualizarEvento')?.addEventListener('click', editarDoVisualizarEvento);
}

// ==================== CARREGAMENTO ====================
async function carregarEventos() {
    try {
        const dados = await carregarComCache('AGENDA');
        //console.log('📋 Dados brutos:', dados);
        
        todosEventos = dados.filter(e => e.Data || e['DATA EVENTO'] || e['Cliente/Parte']);
        //console.log(`📋 Eventos carregados: ${todosEventos.length}`);
        aplicarFiltrosAgenda();
    } catch (error) {
        console.error('Erro ao carregar agenda:', error);
    }
}

async function carregarProcessosParaAgenda() {
    try {
        const dados = await carregarComCache('PROCESSOS');
        
        todosProcessosAgenda = dados.filter(p => p['N PROCESSO'] && String(p['N PROCESSO']).trim());
        //console.log(`📋 Processos para a agenda: ${todosProcessosAgenda.length}`);
        
        preencherDatalistProcessos();
    } catch (error) {
        //console.error('Erro ao carregar processos para agenda:', error);
        todosProcessosAgenda = [];
    }
}

function preencherDatalistProcessos() {
    const datalist = document.getElementById('listaProcessosAgenda');
    if (!datalist) return;
    
    const ordenados = [...todosProcessosAgenda].sort((a, b) => {
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

/**
 * Preenche o campo Cliente/Parte baseado no número do processo digitado/selecionado.
 */
function preencherClientePorProcesso(numeroProcesso) {
    const campoCliente = document.getElementById('eventoCliente');
    if (!campoCliente) return;
    
    const numero = String(numeroProcesso || '').trim();
    if (!numero) return;
    
    const processo = todosProcessosAgenda.find(p => 
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

// ==================== CALENDÁRIO ====================
function renderizarCalendario() {
    const container = document.getElementById('calendarioDias');
    if (!container) return;
    
    const meses = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
                   'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];
    document.getElementById('tituloMesAno').textContent = `${meses[mesAtual]} ${anoAtual}`;
    
    const primeiroDia = new Date(anoAtual, mesAtual, 1);
    const ultimoDia = new Date(anoAtual, mesAtual + 1, 0);
    const diaInicio = primeiroDia.getDay();
    const totalDias = ultimoDia.getDate();
    const hoje = new Date();
    
    const diasComEventos = new Set();
    todosEventos.forEach(e => {
        const dataStr = e.Data || e['DATA EVENTO'];
        const d = parseDataLocal(dataStr);
        if (d) {
            if (d.getMonth() === mesAtual && d.getFullYear() === anoAtual) {
                diasComEventos.add(d.getDate());
            }
        }
    });
    
    let html = '';
    
    for (let i = 0; i < diaInicio; i++) {
        html += `<div class="calendario-dia outro-mes"></div>`;
    }
    
    for (let dia = 1; dia <= totalDias; dia++) {
        let classes = ['calendario-dia'];
        
        const dataDia = new Date(anoAtual, mesAtual, dia);
        
        if (dataDia.toDateString() === hoje.toDateString()) {
            classes.push('hoje');
        }
        
        if (dataSelecionada && 
            dataDia.getDate() === dataSelecionada.getDate() &&
            dataDia.getMonth() === dataSelecionada.getMonth() &&
            dataDia.getFullYear() === dataSelecionada.getFullYear()) {
            classes.push('selecionado');
        }
        
        if (diasComEventos.has(dia)) {
            classes.push('tem-evento');
        }
        
        html += `
            <div class="${classes.join(' ')}" onclick="selecionarData(${anoAtual}, ${mesAtual}, ${dia})">
                ${dia}
            </div>
        `;
    }
    
    container.innerHTML = html;
}

function selecionarData(ano, mes, dia) {
    dataSelecionada = new Date(ano, mes, dia);
    renderizarCalendario();
    mostrarEventosDoDia(dataSelecionada);
}

// ==================== MARCAR COMO REALIZADO ====================
async function marcarEventoComoRealizado(row) {
    if (!confirm('Marcar este evento como REALIZADO?')) return;
    
    try {
        await apiUpdate('AGENDA', parseInt(row), { Status: 'REALIZADO' });
        invalidarCacheAposEscrita('AGENDA');
        notificar('✅ Evento marcado como realizado!', 'success');
        await carregarEventos();
        renderizarCalendario();
        mostrarEventosDoDia(dataSelecionada);
    } catch (error) {
        console.error('Erro ao marcar evento:', error);
        notificar('Erro ao marcar evento: ' + error.message, 'error');
    }
}

// ==================== EVENTOS DO DIA ====================
function mostrarEventosDoDia(data) {
    const tbody = document.getElementById('tbodyEventosDia');
    const titulo = document.getElementById('tituloEventosDia');
    if (!tbody || !titulo) return;
    
    const dataAlvoStr = formatarDataISO(data);
    
    const eventosDoDia = todosEventos.filter(e => {
        const dataEventoStr = e.Data || e['DATA EVENTO'];
        const d = parseDataLocal(dataEventoStr);
        return d && formatarDataISO(d) === dataAlvoStr;
    });
    
    titulo.textContent = `Eventos de ${data.toLocaleDateString('pt-BR')}`;
    
    if (!eventosDoDia.length) {
        tbody.innerHTML = `
            <tr class="row-empty">
                <td colspan="8">
                    <i class="fas fa-calendar-check"></i> Nenhum evento nesta data
                    <br><button class="btn-primary" style="margin-top: 0.5rem;" onclick="abrirModalEvento('novo', '${dataAlvoStr}')">
                        <i class="fas fa-plus"></i> Criar evento
                    </button>
                </td>
            </tr>`;
        return;
    }
    
    tbody.innerHTML = eventosDoDia.map(e => {
        const tipo = e['Tipo de Evento'] || e.TIPO || '';
        const tipoClass = tipo.toLowerCase()
            .replace('audiência', 'audiencia')
            .replace('perícia', 'pericia')
            .replace('reunião', 'reuniao') || 'outro';
        
        const status = e.Status || e.STATUS || '';
        const isRealizado = status.toUpperCase() === 'REALIZADO';
        const isCancelado = status.toUpperCase() === 'CANCELADO';
        const temLink = (e['Link (videoconferência)'] || e.LINK || '').trim();
        
        let botaoRealizar = '';
        if (!isRealizado && !isCancelado) {
            botaoRealizar = `
                <button class="btn-icon-small" onclick="marcarEventoComoRealizado(${e._row})" title="Marcar como realizado" style="color: var(--success);">
                    <i class="fas fa-check-circle"></i>
                </button>
            `;
        }
        
        const indicadorLink = temLink 
            ? `<i class="fas fa-video" style="color: #4a9eff; margin-left: 0.3rem;" title="Tem videoconferência"></i>` 
            : '';
        
        return `
            <tr>
                <td><strong>${esc(e.Horário || e.HORARIO || '—')}</strong></td>
                <td><span class="badge-evento ${tipoClass}">${esc(tipo)}</span></td>
                <td><span class="mono-text">${esc(e['Nº Processo'] || e['N PROCESSO'] || e.PROCESSO || '')}</span></td>
                <td>${esc(e['Cliente/Parte'] || e.CLIENTE || '')} ${indicadorLink}</td>
                <td>${esc(e['Descrição / Observações'] || e.DESCRICAO || e.OBS || '')}</td>
                <td>${esc(e.Local || e.LOCAL || '')}</td>
                <td>
                    <span class="status ${isRealizado ? 'completed' : isCancelado ? 'urgent' : 'active'}">${esc(status)}</span>
                </td>
                <td>
                    <div class="acoes" style="display: flex; gap: 0.3rem;">
                        ${botaoRealizar}
                        <button class="btn-icon-small" onclick="verDetalhesEvento(${e._row})" title="Visualizar">
                            <i class="fas fa-eye"></i>
                        </button>
                        <button class="btn-icon-small" onclick="abrirModalEvento('editar', ${e._row})" title="Editar">
                            <i class="fas fa-edit"></i>
                        </button>
                    </div>
                </td>
            </tr>
        `;
    }).join('');
}

// ==================== PRÓXIMOS EVENTOS ====================
function aplicarFiltrosAgenda() {
    let filtrados = [...todosEventos];
    
    filtrados = filtrados.filter(e => {
        const status = (e.Status || e.STATUS || '').toUpperCase();
        return status !== 'REALIZADO' && status !== 'CANCELADO';
    });
    
    if (filtroAtualAgenda !== 'todos') {
        filtrados = filtrados.filter(e => {
            const tipo = String(e['Tipo de Evento'] || e.TIPO || '').toUpperCase();
            return tipo.includes(filtroAtualAgenda.toUpperCase());
        });
    }
    
    const busca = (document.getElementById('buscaAgenda')?.value || '').toLowerCase().trim();
    if (busca) {
        filtrados = filtrados.filter(e =>
            String(e['Cliente/Parte'] || e.CLIENTE || '').toLowerCase().includes(busca) ||
            String(e['Nº Processo'] || e['N PROCESSO'] || '').toLowerCase().includes(busca) ||
            String(e['Descrição / Observações'] || e.DESCRICAO || '').toLowerCase().includes(busca)
        );
    }
    
    filtrados.sort((a, b) => {
        const da = parseDataLocal(a.Data || a['DATA EVENTO']) || new Date(0);
        const db = parseDataLocal(b.Data || b['DATA EVENTO']) || new Date(0);
        return da - db;
    });
    
    const proximos = filtrados.slice(0, 5);
    
    renderizarTimeline(proximos);
    setText('contagemEventos', `${filtrados.length} eventos`);
}

function renderizarTimeline(eventos) {
    const timeline = document.getElementById('timelineEventos');
    if (!timeline) return;
    
    if (!eventos.length) {
        timeline.innerHTML = `
            <div class="timeline-item">
                <div class="timeline-date"><span class="day">—</span><span class="month">—</span></div>
                <div class="timeline-content"><h4>Nenhum evento</h4></div>
            </div>`;
        return;
    }
    
    timeline.innerHTML = eventos.map(e => {
        const data = parseDataLocal(e.Data || e['DATA EVENTO']);
        const dia = data ? String(data.getDate()).padStart(2, '0') : '—';
        const mes = data ? data.toLocaleDateString('pt-BR', { month: 'short' }).replace('.', '') : '—';
        
        const tipo = e['Tipo de Evento'] || e.TIPO || '';
        const cliente = e['Cliente/Parte'] || e.CLIENTE || '';
        const temLink = (e['Link (videoconferência)'] || e.LINK || '').trim();
        
        return `
            <div class="timeline-item">
                <div class="timeline-date">
                    <span class="day">${dia}</span>
                    <span class="month">${mes}</span>
                </div>
                <div class="timeline-content">
                    <h4>${esc(tipo)} - ${esc(cliente)} ${temLink ? '🎥' : ''}</h4>
                    <p>${esc(e['Descrição / Observações'] || e.DESCRICAO || '')}</p>
                    ${e.Horário || e.HORARIO ? `<small><i class="fas fa-clock"></i> ${e.Horário || e.HORARIO}</small>` : ''}
                    ${e.Local || e.LOCAL ? `<small style="margin-left: 0.5rem;"><i class="fas fa-map-marker-alt"></i> ${esc(e.Local || e.LOCAL)}</small>` : ''}
                </div>
            </div>
        `;
    }).join('');
}

// ==================== MODAL CADASTRO/EDIÇÃO ====================
function abrirModalEvento(modo, dataPredefinida) {
    const modal = document.getElementById('modalEvento');
    const titulo = document.getElementById('modalTituloEvento');
    const form = document.getElementById('formEvento');
    if (!modal || !form) return;
    
    form.reset();
    document.getElementById('eventoRow').value = '';
    
    const btnSalvar = document.getElementById('salvarEvento');
    if (btnSalvar) {
        btnSalvar.disabled = false;
        btnSalvar.innerHTML = '<i class="fas fa-save"></i> Salvar';
    }
    
    if (modo === 'editar' && dataPredefinida) {
        const evento = todosEventos.find(e => e._row === dataPredefinida);
        if (evento) {
            titulo.textContent = 'Editar Evento';
            document.getElementById('eventoRow').value = evento._row || '';
            document.getElementById('eventoTipo').value = evento['Tipo de Evento'] || evento.TIPO || 'OUTRO';
            document.getElementById('eventoProcesso').value = evento['Nº Processo'] || evento['N PROCESSO'] || '';
            document.getElementById('eventoCliente').value = evento['Cliente/Parte'] || evento.CLIENTE || '';
            document.getElementById('eventoData').value = converterDataISO(evento.Data || evento['DATA EVENTO']) || '';
            document.getElementById('eventoHorario').value = evento.Horário || evento.HORARIO || '';
            document.getElementById('eventoDuracao').value = evento.Duração || evento.DURACAO || '60';
            document.getElementById('eventoLocal').value = evento.Local || evento.LOCAL || '';
            document.getElementById('eventoResponsavel').value = evento.Responsável || evento.RESPONSÁVEL || '';
            document.getElementById('eventoStatus').value = evento.Status || evento.STATUS || 'AGENDADO';
            document.getElementById('eventoLink').value = evento['Link (videoconferência)'] || evento.LINK || '';
            document.getElementById('eventoDescricao').value = evento['Descrição / Observações'] || evento.DESCRICAO || evento.OBS || '';
        }
    } else {
        titulo.textContent = 'Novo Evento';
        document.getElementById('eventoRow').value = '';
        if (dataPredefinida) {
            document.getElementById('eventoData').value = dataPredefinida;
        } else {
            document.getElementById('eventoData').value = formatarDataISO(new Date());
        }
    }
    
    modal.classList.add('active');
}

function fecharModalEvento() {
    document.getElementById('modalEvento')?.classList.remove('active');
    
    const btnSalvar = document.getElementById('salvarEvento');
    if (btnSalvar) {
        btnSalvar.disabled = false;
        btnSalvar.innerHTML = '<i class="fas fa-save"></i> Salvar';
    }
    salvandoEvento = false;
}

// ==================== SALVAR ====================
async function salvarEvento() {
    if (salvandoEvento) {
        notificar('Aguarde, salvando...', 'warning');
        return;
    }
    
    const row = document.getElementById('eventoRow')?.value;
    
    const dados = {
        'Tipo de Evento': document.getElementById('eventoTipo')?.value || 'OUTRO',
        'Cliente/Parte': document.getElementById('eventoCliente')?.value?.trim() || '',
        'Nº Processo': document.getElementById('eventoProcesso')?.value?.trim() || '',
        'Data': document.getElementById('eventoData')?.value || '',
        'Horário': document.getElementById('eventoHorario')?.value || '',
        'Duração': document.getElementById('eventoDuracao')?.value || '60',
        'Local': document.getElementById('eventoLocal')?.value?.trim() || '',
        'Responsável': document.getElementById('eventoResponsavel')?.value?.trim() || '',
        'Status': document.getElementById('eventoStatus')?.value || 'AGENDADO',
        'Link (videoconferência)': document.getElementById('eventoLink')?.value?.trim() || '',
        'Descrição / Observações': document.getElementById('eventoDescricao')?.value?.trim() || ''
    };
    
    if (!dados['Data']) {
        notificar('Preencha a Data!', 'warning');
        return;
    }
    
    //console.log('📝 Salvando evento:', dados);
    
    salvandoEvento = true;
    const btnSalvar = document.getElementById('salvarEvento');
    if (btnSalvar) {
        btnSalvar.disabled = true;
        btnSalvar.innerHTML = '<i class="fas fa-spinner fa-pulse"></i> Salvando...';
    }
    
    try {
        if (row) {
            await apiUpdate('AGENDA', parseInt(row), dados);
            notificar('Evento atualizado!', 'success');
        } else {
            await apiCreate('AGENDA', dados);
            notificar('Evento criado!', 'success');
        }
        
        invalidarCacheAposEscrita('AGENDA');
        
        fecharModalEvento();
        await carregarEventos();
        renderizarCalendario();
        mostrarEventosDoDia(dataSelecionada);
    } catch (error) {
        console.error('Erro ao salvar:', error);
        notificar('Erro: ' + error.message, 'error');
    } finally {
        salvandoEvento = false;
        if (btnSalvar) {
            btnSalvar.disabled = false;
            btnSalvar.innerHTML = '<i class="fas fa-save"></i> Salvar';
        }
    }
}

// ==================== VISUALIZAR EVENTO ====================
function verDetalhesEvento(row) {
    const e = todosEventos.find(x => x._row === row);
    if (!e) {
        notificar('Evento não encontrado', 'error');
        return;
    }
    
    const modal = document.getElementById('modalVisualizarEvento');
    if (!modal) return;
    
    const tipo = e['Tipo de Evento'] || e.TIPO || 'OUTRO';
    const cliente = e['Cliente/Parte'] || e.CLIENTE || '—';
    const processo = e['Nº Processo'] || e['N PROCESSO'] || e.PROCESSO || '—';
    const data = parseDataLocal(e.Data || e['DATA EVENTO']);
    const horario = e.Horário || e.HORARIO || '';
    const duracao = e.Duração || e.DURACAO || '60';
    const local = e.Local || e.LOCAL || '—';
    const responsavel = e.Responsável || e.RESPONSÁVEL || '—';
    const status = (e.Status || e.STATUS || 'AGENDADO').toUpperCase();
    const link = e['Link (videoconferência)'] || e.LINK || '';
    const descricao = e['Descrição / Observações'] || e.DESCRICAO || e.OBS || '';
    
    // Ícone dinâmico
    const icone = document.getElementById('vizEventoIcone');
    if (icone) {
        let iconClass = 'fa-calendar-day';
        const tipoUpper = tipo.toUpperCase();
        if (tipoUpper.includes('AUDIÊNCIA') || tipoUpper.includes('AUDIENCIA')) iconClass = 'fa-gavel';
        else if (tipoUpper.includes('PERÍCIA') || tipoUpper.includes('PERICIA')) iconClass = 'fa-stethoscope';
        else if (tipoUpper.includes('PRAZO')) iconClass = 'fa-hourglass-half';
        else if (tipoUpper.includes('REUNIÃO') || tipoUpper.includes('REUNIAO')) iconClass = 'fa-users';
        icone.innerHTML = `<i class="fas ${iconClass}"></i>`;
    }
    
    // Cabeçalho
    document.getElementById('vizEventoTipo').textContent = tipo;
    
    let dataHoraTexto = '';
    if (data) {
        dataHoraTexto = data.toLocaleDateString('pt-BR', {
            weekday: 'long',
            day: '2-digit',
            month: 'long',
            year: 'numeric'
        });
    }
    if (horario) dataHoraTexto += ` às ${horario}`;
    if (duracao) dataHoraTexto += ` (${formatarDuracao(duracao)})`;
    document.getElementById('vizEventoDataHora').textContent = dataHoraTexto || '—';
    
    // Status
    const statusEl = document.getElementById('vizEventoStatus');
    if (statusEl) {
        statusEl.textContent = status;
        let statusClass = 'active';
        if (status === 'REALIZADO') statusClass = 'completed';
        else if (status === 'CANCELADO') statusClass = 'urgent';
        else if (status === 'ADIADO') statusClass = 'pending';
        statusEl.className = 'status ' + statusClass;
    }
    
    // Link de videoconferência
    const linkBox = document.getElementById('vizEventoLinkBox');
    const linkInput = document.getElementById('vizEventoLink');
    const linkAbrir = document.getElementById('vizEventoLinkAbrir');
    
    if (link && link.trim()) {
        if (linkBox) linkBox.style.display = 'block';
        if (linkInput) linkInput.value = link;
        if (linkAbrir) linkAbrir.href = link;
    } else {
        if (linkBox) linkBox.style.display = 'none';
    }
    
    // Detalhes
    document.getElementById('vizEventoCliente').textContent = cliente;
    document.getElementById('vizEventoProcesso').textContent = processo;
    document.getElementById('vizEventoDuracao').textContent = formatarDuracao(duracao);
    document.getElementById('vizEventoLocal').textContent = local;
    document.getElementById('vizEventoResponsavel').textContent = responsavel;
    
    // Descrição
    const descBox = document.getElementById('vizEventoDescricaoBox');
    if (descricao && descricao.trim()) {
        if (descBox) descBox.style.display = 'block';
        document.getElementById('vizEventoDescricao').textContent = descricao;
    } else {
        if (descBox) descBox.style.display = 'none';
    }
    
    modal.dataset.eventoRow = row;
    modal.classList.add('active');
}

function fecharModalVisualizarEvento() {
    document.getElementById('modalVisualizarEvento')?.classList.remove('active');
}

function editarDoVisualizarEvento() {
    const row = document.getElementById('modalVisualizarEvento')?.dataset.eventoRow;
    if (row) {
        fecharModalVisualizarEvento();
        abrirModalEvento('editar', parseInt(row));
    }
}

// ==================== COPIAR LINK ====================
async function copiarLinkEvento() {
    const input = document.getElementById('vizEventoLink');
    if (!input || !input.value) {
        notificar('Nenhum link para copiar', 'warning');
        return;
    }
    
    const link = input.value;
    
    try {
        // Método moderno (Chrome 66+, Firefox 63+, Safari 13.1+, Edge 79+)
        if (navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
            await navigator.clipboard.writeText(link);
            notificar('✅ Link copiado para a área de transferência!', 'success');
            return;
        }
        
        // Fallback: seleciona o texto e orienta o usuário
        input.select();
        input.setSelectionRange(0, link.length);
        notificar('Link selecionado — pressione Ctrl+C para copiar', 'info');
        
    } catch (error) {
        console.error('Erro ao copiar link:', error);
        
        // Fallback silencioso: seleciona o texto
        input.select();
        input.setSelectionRange(0, link.length);
        notificar('Selecione o link e use Ctrl+C', 'warning');
    }
}

// ==================== EXPORTAÇÃO GLOBAL ====================
window.inicializarAgenda = inicializarAgenda;
window.marcarEventoComoRealizado = marcarEventoComoRealizado;
window.abrirModalEvento = abrirModalEvento;
window.selecionarData = selecionarData;
window.verDetalhesEvento = verDetalhesEvento;
window.fecharModalVisualizarEvento = fecharModalVisualizarEvento;
window.editarDoVisualizarEvento = editarDoVisualizarEvento;
window.copiarLinkEvento = copiarLinkEvento;

//console.log('📅 Módulo agenda carregado (v3.1 — visualização + copiar link)');