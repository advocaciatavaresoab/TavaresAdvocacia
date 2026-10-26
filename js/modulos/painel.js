// ==================== HELPERS GERAIS ====================

function esc(valor) {
    if (valor === null || valor === undefined) return '';
    return String(valor)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

function setText(id, valor) {
    const el = document.getElementById(id);
    if (el) el.textContent = valor;
}

function parseValor(valor) {
    if (valor === null || valor === undefined || valor === '') return 0;
    if (typeof valor === 'number') return valor;

    const limpo = String(valor)
        .replace(/[^\d,.-]/g, '')
        .replace(/\.(?=\d{3}(,|$))/g, '')
        .replace(',', '.');

    const num = parseFloat(limpo);
    return isNaN(num) ? 0 : num;
}

function formatarMoeda(valor) {
    return (valor || 0).toLocaleString('pt-BR', {
        style: 'currency',
        currency: 'BRL'
    });
}

function parseData(valor) {
    if (!valor) return null;
    if (valor instanceof Date) return isNaN(valor) ? null : valor;

    const str = String(valor).trim();
    
    const br = str.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
    if (br) {
        return new Date(Number(br[3]), Number(br[2]) - 1, Number(br[1]));
    }
    
    const iso = str.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
    if (iso) {
        return new Date(Number(iso[1]), Number(iso[2]) - 1, Number(iso[3]));
    }

    const data = new Date(str);
    return isNaN(data) ? null : data;
}

function formatarData(valor) {
    const data = parseData(valor);
    if (!data) return '—';
    return data.toLocaleDateString('pt-BR');
}

function diasRestantes(valor) {
    const data = parseData(valor);
    if (!data) return null;

    const hoje = new Date();
    hoje.setHours(0, 0, 0, 0);
    data.setHours(0, 0, 0, 0);

    const diffMs = data - hoje;
    return Math.round(diffMs / (1000 * 60 * 60 * 24));
}

function classeDiasRestantes(dias) {
    if (dias === null) return '';
    if (dias < 0) return 'tipo-vencido';
    if (dias === 0) return 'tipo-hoje';
    if (dias <= 7) return 'tipo-proximo';
    return '';
}

function textoDiasRestantes(dias) {
    if (dias === null) return '';
    if (dias < 0) return `${Math.abs(dias)}d atrasado`;
    if (dias === 0) return 'Vence hoje';
    if (dias === 1) return 'Vence amanhã';
    if (dias <= 7) return `Em ${dias} dias`;
    return '';
}

function getStatusClass(status) {
    const s = String(status || '').toUpperCase();
    if (s.includes('URGENTE')) return 'urgent';
    if (s.includes('CONCLU') || s.includes('FINALIZADO')) return 'completed';
    if (s.includes('PENDENTE') || s.includes('VENCIDO')) return 'pending';
    return 'active';
}

function navegar(pagina) {
    if (typeof navegarPara === 'function') {
        navegarPara(pagina);
    } else if (typeof goToPage === 'function') {
        goToPage(pagina);
    } else {
        console.warn('Nenhuma função de navegação encontrada (navegarPara/goToPage).');
    }
}

// ==================== INICIALIZAÇÃO ====================

async function inicializarPainel() {
    //console.log('📊 Inicializando painel...');

    await aguardarElementos();
    mostrarDataAtual();
    await carregarDadosPainel();
}

function aguardarElementos() {
    return new Promise((resolve) => {
        const check = () => {
            const agenda = document.getElementById('agendaHojeList');
            const tabela = document.getElementById('tabelaProcessosRecentes');
            const timeline = document.getElementById('timelinePericias');

            if (agenda && tabela && timeline) {
                resolve();
            } else {
                setTimeout(check, 100);
            }
        };
        check();
    });
}

function mostrarDataAtual() {
    const agora = new Date();
    const opcoes = {
        weekday: 'long',
        day: 'numeric',
        month: 'long',
        year: 'numeric'
    };
    const el = document.getElementById('dataAtual');
    if (el) el.textContent = agora.toLocaleDateString('pt-BR', opcoes);
}

// ==================== CARREGAMENTO DE DADOS ====================

async function carregarDadosPainel() {
    try {
        //console.log('📥 Carregando dados do painel...');

        const clientes = await carregarComCache('CLIENTES').catch(() => []);
        await new Promise(r => setTimeout(r, 300));

        const processos = await carregarComCache('PROCESSOS').catch(() => []);
        await new Promise(r => setTimeout(r, 300));

        const pericias = await carregarComCache('PERICIAS').catch(() => []);
        await new Promise(r => setTimeout(r, 300));

        let eventosAgenda = [];
        try {
            eventosAgenda = await carregarComCache('AGENDA').catch(() => []);
            //console.log(`📋 Eventos da AGENDA: ${eventosAgenda.length}`);
        } catch (e) {
            //console.log('⚠️ Aba AGENDA não encontrada');
        }

        // --- NOVO: Carrega atividades ---
        let atividades = [];
        try {
            atividades = await carregarComCache('ATIVIDADES').catch(() => []);
            //console.log(`📋 Atividades: ${atividades.length}`);
        } catch (e) {
            //console.log('⚠️ Aba ATIVIDADES não encontrada');
        }

        const clientesValidos = clientes.filter(c => c.NOME && String(c.NOME).trim());
        const processosValidos = processos.filter(p => p['N PROCESSO'] || p.CLIENTE);
        const periciasValidas = pericias.filter(p => p.PROCESSO || p.CLIENTE);
        const atividadesValidas = atividades.filter(a => a.CLIENTE || a.PROCESSO);

       /* console.log('✅ Dados carregados:', {
            clientes: clientesValidos.length,
            processos: processosValidos.length,
            pericias: periciasValidas.length,
            agenda: eventosAgenda.length,
            atividades: atividadesValidas.length
        });*/

        preencherAgendaRapida(processosValidos, periciasValidas, eventosAgenda);
        preencherTabelaProcessosUrgentes(processosValidos);
        preencherTimelinePericias(periciasValidas);
        preencherResumo(clientesValidos, processosValidos, periciasValidas);
        preencherAtividadesPendentes(atividadesValidas); // NOVO

        setText('badgeProcessos', processosValidos.length);

    } catch (error) {
        console.error('❌ Erro ao carregar painel:', error);
        mostrarErroPainel();
    }
}

function mostrarErroPainel() {
    const tbody = document.getElementById('tabelaProcessosRecentes');
    if (tbody) {
        tbody.innerHTML = `<tr class="row-empty"><td colspan="5">Não foi possível carregar os dados. Verifique a conexão com a API.</td></tr>`;
    }
}
// ==================== ATIVIDADES PENDENTES ====================

function preencherAtividadesPendentes(atividades) {
    const tbody = document.getElementById('tabelaAtividadesPendentes');
    if (!tbody) return;

    // Filtra apenas EM ANÁLISE e CORRIGIR
    const pendentes = atividades.filter(a => 
        a.STATUS === 'EM ANÁLISE' || a.STATUS === 'CORRIGIR'
    );

    const emAnalise = pendentes.filter(a => a.STATUS === 'EM ANÁLISE');
    const corrigir = pendentes.filter(a => a.STATUS === 'CORRIGIR');

    setText('countEmAnalise', emAnalise.length);
    setText('countCorrigir', corrigir.length);

    if (!pendentes.length) {
        tbody.innerHTML = `
            <tr class="row-empty">
                <td colspan="7">
                    <i class="fas fa-check-circle" style="color: var(--success);"></i>
                    Nenhuma atividade pendente
                </td>
            </tr>`;
        return;
    }

    // Ordena por prazo (mais próximo primeiro)
    pendentes.sort((a, b) => {
        const da = new Date(a.PRAZO || 0);
        const db = new Date(b.PRAZO || 0);
        return da - db;
    });

    // Limita a 6 itens
    const exibir = pendentes.slice(0, 6);

    tbody.innerHTML = exibir.map(a => {
        const statusClass = a.STATUS === 'EM ANÁLISE' ? 'pending' : 'urgent';
        const situacaoClass = a.SITUAÇÃO === 'AGUARDANDO' ? 'pending' : 'completed';
        const prazoClass = getPrazoClass(a.PRAZO);

        return `
            <tr class="atividade-clickable" data-row="${a._row}" style="cursor: pointer;">
                <td><strong>${esc(a.CLIENTE)}</strong></td>
                <td><span class="mono-text">${esc(a.PROCESSO)}</span></td>
                <td><span class="badge-tipo-prazo">${esc(a['TIPO DE PRAZO'])}</span></td>
                <td><span class="data-prazo ${prazoClass}">${formatarData(a.PRAZO)}</span></td>
                <td>${esc(a.RESPONSAVEL)}</td>
                <td><span class="status ${statusClass}">${esc(a.STATUS)}</span></td>
                <td><span class="status ${situacaoClass}">${esc(a.SITUAÇÃO)}</span></td>
            </tr>
        `;
    }).join('');

    if (pendentes.length > 6) {
        tbody.innerHTML += `
            <tr class="row-empty">
                <td colspan="7" style="padding: 0.5rem;">
                    <a href="#" data-page="atividades" style="color: var(--gold-500); text-decoration: none; font-weight: 500;">
                        + ${pendentes.length - 6} outra(s) atividade(s) pendente(s) → Ver todas
                    </a>
                </td>
            </tr>`;
    }

    // Adiciona evento de clique nas linhas
    document.querySelectorAll('.atividade-clickable').forEach(row => {
        row.addEventListener('click', function() {
            const rowData = this.getAttribute('data-row');
            const atividade = pendentes.find(a => String(a._row) === String(rowData));
            if (atividade) {
                // Navega para atividades e aplica filtro pelo status
                navegarPara('atividades');
                // Pequeno delay para garantir que a página carregou
                setTimeout(() => {
                    aplicarFiltroAtividades(atividade.STATUS);
                }, 500);
            }
        });
    });
}

function getPrazoClass(data) {
    const dias = diasRestantes(data);
    if (dias === null) return '';
    if (dias < 0) return 'tipo-vencido';
    if (dias === 0) return 'tipo-hoje';
    if (dias <= 7) return 'tipo-proximo';
    return '';
}
// ==================== AGENDA RÁPIDA (CORRIGIDA) ====================

function preencherAgendaRapida(processos, pericias, eventosAgenda) {
    const itens = [];

    // --- ADICIONA EVENTOS DA AGENDA ---
    if (eventosAgenda && eventosAgenda.length) {
        eventosAgenda.forEach(e => {
            const data = e.Data || e['DATA EVENTO'] || e['Data'] || e['data'];
            if (!data) return;
            
            const cliente = e['Cliente/Parte'] || e.CLIENTE || e['Cliente'] || 'Cliente não informado';
            const tipo = e['Tipo de Evento'] || e.TIPO || e['Tipo'] || 'Evento';
            const processo = e['Nº Processo'] || e['N PROCESSO'] || e['Processo'] || '';
            const horario = e.Horário || e.HORARIO || e['Horário'] || '';
            const local = e.Local || e.LOCAL || '';
            
            const dias = diasRestantes(data);
            
            itens.push({
                tipo: 'evento',
                data: data,
                dias: dias,
                titulo: cliente,
                subtitulo: `${tipo}${processo ? ' · ' + processo : ''}`,
                horario: horario,
                local: local,
                status: e.Status || e.STATUS || 'AGENDADO',
                origem: '📅 AGENDA'
            });
        });
    }

    // --- ADICIONA PRAZOS DE PROCESSOS ---
    processos.forEach(p => {
        const data = p['DATA FINAL'] || p.PRAZO || p['DATA DA INTIMAÇÃO'];
        if (!data) return;
        const dias = diasRestantes(data);
        itens.push({
            tipo: 'prazo',
            data: data,
            dias: dias,
            titulo: p.CLIENTE || 'Cliente não informado',
            subtitulo: `Prazo · ${p['N PROCESSO'] || p['Nº PROCESSO'] || 'processo s/ número'}`,
            origem: '⚖️ PROCESSO'
        });
    });

    // --- ADICIONA PERÍCIAS ---
    pericias.forEach(p => {
        const data = p['DATA DA PERICIA MEDICA'] || p['DATA DA PERICIA SOCIAL'];
        if (!data) return;
        const dias = diasRestantes(data);
        itens.push({
            tipo: 'pericia',
            data: data,
            dias: dias,
            titulo: p.CLIENTE || 'Cliente não informado',
            subtitulo: `Perícia${p['TIPO DE BENEFICIO'] ? ' · ' + p['TIPO DE BENEFICIO'] : ''}`,
            origem: '🩺 PERÍCIA'
        });
    });

    // Remove itens sem data
    const itensComData = itens.filter(item => item.dias !== null);
    //console.log(`📋 Total de itens com data: ${itensComData.length}`);
    //console.log(`   📅 AGENDA: ${itensComData.filter(i => i.origem === '📅 AGENDA').length}`);
    //console.log(`   ⚖️ PROCESSOS: ${itensComData.filter(i => i.origem === '⚖️ PROCESSO').length}`);
    //console.log(`   🩺 PERÍCIAS: ${itensComData.filter(i => i.origem === '🩺 PERÍCIA').length}`);

    // --- CORREÇÃO 1: HOJE = APENAS dias === 0 ---
    const hoje = itensComData.filter(item => item.dias === 0);

    // --- CORREÇÃO 2: PRÓXIMOS = dias > 0 E dias <= 7 (semana) ---
    const proximos = itensComData.filter(item => item.dias > 0 && item.dias <= 7);

    // Ordena por data
    hoje.sort((a, b) => a.dias - b.dias);
    proximos.sort((a, b) => a.dias - b.dias);

    //console.log(`📊 Hoje (apenas hoje): ${hoje.length} itens`);
    //console.log(`📊 Próximos (semana): ${proximos.length} itens`);

    renderAgendaLista('agendaHojeList', hoje);
    renderAgendaLista('agendaSemanaList', proximos);
    setText('countHojeTotal', hoje.length);
    setText('countSemanaTotal', proximos.length);
}

function renderAgendaLista(containerId, itens) {
    const el = document.getElementById(containerId);
    if (!el) return;

    if (!itens.length) {
        el.innerHTML = `<p class="agenda-empty"><i class="fas fa-check-circle" style="color: var(--success);"></i> Nada por aqui.</p>`;
        return;
    }

    // Limita a 5 itens
    const exibir = itens.slice(0, 5);

    el.innerHTML = exibir.map(item => {
        const classeTipo = item.dias < 0 ? 'tipo-vencido' : (item.tipo === 'pericia' ? 'tipo-pericia' : '');
        let icone = 'fa-calendar-check';
        if (item.tipo === 'prazo') icone = 'fa-gavel';
        else if (item.tipo === 'pericia') icone = 'fa-stethoscope';
        else if (item.tipo === 'evento') icone = 'fa-calendar-plus';
        
        const tempo = item.dias < 0
            ? `${Math.abs(item.dias)}d atrás`
            : item.dias === 0
                ? 'Hoje'
                : `em ${item.dias}d`;

        const horario = item.horario ? ` · ${item.horario}` : '';

        return `
            <div class="agenda-item ${classeTipo}">
                <div class="agenda-icon"><i class="fas ${icone}"></i></div>
                <div class="agenda-item-info">
                    <strong>${esc(item.titulo)}</strong>
                    <span>${esc(item.subtitulo)} · ${formatarData(item.data)}${horario}</span>
                    <small style="display: block; font-size: 0.6rem; color: var(--text-muted); margin-top: 0.1rem;">${item.origem}</small>
                </div>
                <div class="agenda-item-time">${tempo}</div>
            </div>
        `;
    }).join('');

    if (itens.length > 5) {
        el.innerHTML += `<p class="agenda-mais" style="text-align: center; margin-top: 0.5rem; font-size: 0.85rem; color: var(--text-muted);">+ ${itens.length - 5} outro(s) item(ns)</p>`;
    }
}

// ==================== TABELA DE PROCESSOS URGENTES ====================

function preencherTabelaProcessosUrgentes(processos) {
    const tbody = document.getElementById('tabelaProcessosRecentes');
    if (!tbody) {
        console.warn('Elemento tabelaProcessosRecentes não encontrado');
        return;
    }

    if (!processos.length) {
        tbody.innerHTML = `<tr class="row-empty"><td colspan="5"><i class="fas fa-info-circle"></i> Nenhum processo cadastrado</td></tr>`;
        return;
    }

    const ordenados = processos
        .filter(p => p['DATA FINAL'] || p.PRAZO || p['DATA DA INTIMAÇÃO'])
        .sort((a, b) => {
            const dataA = parseData(a['DATA FINAL'] || a.PRAZO || a['DATA DA INTIMAÇÃO']) || new Date(8640000000000000);
            const dataB = parseData(b['DATA FINAL'] || b.PRAZO || b['DATA DA INTIMAÇÃO']) || new Date(8640000000000000);
            return dataA - dataB;
        })
        .slice(0, 6);

    if (!ordenados.length) {
        tbody.innerHTML = `<tr class="row-empty"><td colspan="5">Nenhum processo com prazo</td></tr>`;
        return;
    }

    let countVencidos = 0, countHoje = 0, countProximos = 0;

    tbody.innerHTML = ordenados.map(p => {
        const dataFinal = p['DATA FINAL'] || p.PRAZO || p['DATA DA INTIMAÇÃO'];
        const dias = diasRestantes(dataFinal);
        const classeDias = classeDiasRestantes(dias);
        const textoDias = textoDiasRestantes(dias);

        if (dias !== null) {
            if (dias < 0) countVencidos++;
            else if (dias === 0) countHoje++;
            else if (dias <= 7) countProximos++;
        }

        const statusPrazo = p['SITUAÇÃO DO PRAZO'] || '';
        const prazoClass = statusPrazo.includes('VENCIDO') ? 'urgent' :
                          statusPrazo.includes('PRÓXIMO') ? 'pending' : 'active';

        return `
            <tr>
                <td><span class="mono-text">${esc(p['N PROCESSO'] || p['Nº PROCESSO'] || '—')}</span></td>
                <td>${esc(p.CLIENTE)}</td>
                <td><span class="status ${getStatusClass(p.STATUS)}">${esc(p.STATUS)}</span></td>
                <td>
                    <span class="data-prazo ${classeDias}">
                        ${formatarData(dataFinal)}
                        ${textoDias ? `<br><small>${textoDias}</small>` : ''}
                    </span>
                </td>
                <td><span class="status ${prazoClass}">${esc(statusPrazo) || '—'}</span></td>
            </tr>
        `;
    }).join('');

    setText('countVencidos', countVencidos);
    setText('countHoje', countHoje);
    setText('countProximos', countProximos);
}

// ==================== TIMELINE DE PERÍCIAS ====================

function preencherTimelinePericias(pericias) {
    const timeline = document.getElementById('timelinePericias');
    if (!timeline) return;

    if (!pericias.length) {
        timeline.innerHTML = `
            <div class="timeline-item">
                <div class="timeline-date"><span class="day">—</span><span class="month">—</span></div>
                <div class="timeline-content"><h4>Nenhuma perícia</h4><p>Não há perícias cadastradas</p></div>
            </div>`;
        return;
    }

    const proximas = pericias
        .filter(p => p['DATA DA PERICIA MEDICA'] || p['DATA DA PERICIA SOCIAL'])
        .sort((a, b) => {
            const dataA = parseData(a['DATA DA PERICIA MEDICA'] || a['DATA DA PERICIA SOCIAL']) || new Date(8640000000000000);
            const dataB = parseData(b['DATA DA PERICIA MEDICA'] || b['DATA DA PERICIA SOCIAL']) || new Date(8640000000000000);
            return dataA - dataB;
        })
        .slice(0, 4);

    if (!proximas.length) {
        timeline.innerHTML = `
            <div class="timeline-item">
                <div class="timeline-date"><span class="day">—</span><span class="month">—</span></div>
                <div class="timeline-content"><h4>Sem datas definidas</h4></div>
            </div>`;
        return;
    }

    timeline.innerHTML = proximas.map(p => {
        const dataPericia = p['DATA DA PERICIA MEDICA'] || p['DATA DA PERICIA SOCIAL'];
        const data = parseData(dataPericia);
        const dia = data ? String(data.getDate()).padStart(2, '0') : '—';
        const mes = data ? data.toLocaleDateString('pt-BR', { month: 'short' }).replace('.', '') : '—';
        const dias = diasRestantes(dataPericia);
        const classeDias = classeDiasRestantes(dias);
        const textoDias = textoDiasRestantes(dias);

        return `
            <div class="timeline-item">
                <div class="timeline-date"><span class="day">${dia}</span><span class="month">${mes}</span></div>
                <div class="timeline-content">
                    <h4>${esc(p.CLIENTE)}</h4>
                    <p>${esc(p.PERICIA || 'Perícia')} ${p['TIPO DE BENEFICIO'] ? '· ' + esc(p['TIPO DE BENEFICIO']) : ''}</p>
                    ${textoDias ? `<small class="${classeDias}" style="font-weight: 600;">${textoDias}</small>` : ''}
                </div>
            </div>
        `;
    }).join('');
}

// ==================== RESUMO DO ESCRITÓRIO ====================

function preencherResumo(clientes, processos, pericias) {
    const clientesAtivos = clientes.filter(c => String(c.STATUS || '').toUpperCase() === 'ATIVO').length;
    const periciasAgendadas = pericias.filter(p => String(p.STATUS || '').toUpperCase() === 'AGENDADA').length;

    let honorariosTotal = 0;
    processos.forEach(p => { honorariosTotal += parseValor(p.HONORARIOS); });

    setText('resumoTotalClientes', clientesAtivos);
    setText('resumoTotalProcessos', processos.length);
    setText('resumoTotalPericias', periciasAgendadas);
    setText('resumoHonorarios', formatarMoeda(honorariosTotal));
}

// ==================== AÇÕES RÁPIDAS ====================

document.addEventListener('click', function (e) {
    const btn = e.target.closest('.action-btn[data-action]');
    if (!btn) return;

    const action = btn.getAttribute('data-action');
    const rotas = {
        'novo-processo': 'processos',
        'novo-cliente': 'clientes',
        'nova-pericia': 'pericias',
        'ver-processos': 'processos'
    };

    const pagina = rotas[action];
    if (pagina) navegar(pagina);
});

// ==================== START ====================

document.addEventListener('DOMContentLoaded', inicializarPainel);

//console.log('📋 Módulo painel carregado (MISTURA AGENDA + PROCESSOS + PERÍCIAS)');