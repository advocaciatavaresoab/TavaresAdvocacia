// ==================== ESTADO ====================
let notificacoes = [];
let notificacoesLidas = 0;

// ==================== INICIALIZAÇÃO ====================
function inicializarNotificacoes() {
    //console.log('🔔 Inicializando notificações...');
    
    const salvas = localStorage.getItem('tavares_notificacoes');
    if (salvas) {
        try {
            notificacoes = JSON.parse(salvas);
            notificacoesLidas = notificacoes.filter(n => n.lida).length;
        } catch (e) {
            notificacoes = [];
        }
    }
    
    setInterval(verificarNotificacoes, 5 * 60 * 1000);
    setTimeout(verificarNotificacoes, 3000);
    
    atualizarBadge();
}

// ==================== CALCULAR DIAS RESTANTES ====================
function calcularDiasRestantes(dataFinal) {
    if (!dataFinal) return null;
    
    let dataStr = String(dataFinal);
    if (dataStr.includes('T')) {
        dataStr = dataStr.split('T')[0];
    }
    
    const partes = dataStr.split('-');
    if (partes.length !== 3) return null;
    
    const data = new Date(Date.UTC(
        parseInt(partes[0]),
        parseInt(partes[1]) - 1,
        parseInt(partes[2]),
        12, 0, 0
    ));
    
    const hoje = new Date();
    const hojeUTC = Date.UTC(
        hoje.getFullYear(),
        hoje.getMonth(),
        hoje.getDate(),
        12, 0, 0
    );
    
    const diffMs = data.getTime() - hojeUTC;
    const diffDias = Math.round(diffMs / (1000 * 60 * 60 * 24));
    
    return diffDias;
}

// ==================== VERIFICAR SE STATUS DEVE GERAR NOTIFICAÇÃO ====================
function statusDeveNotificar(tipo, status) {
    const statusUpper = (status || '').toUpperCase();
    
    // Status que NÃO devem gerar notificação
    const statusIgnorar = {
        'AGENDA': ['REALIZADO', 'CANCELADO'],
        'PERICIA': ['REALIZADA', 'CANCELADA', 'CONCLUÍDA', 'CONCLUIDA'],
        'ATIVIDADE': ['CONFERIDO', 'PROTOCOLADO', 'FINALIZADO'],
        'PROCESSO': ['FINALIZADO', 'ARQUIVADO', 'CONCLUÍDO', 'CONCLUIDO']
    };
    
    const ignorar = statusIgnorar[tipo] || [];
    return !ignorar.includes(statusUpper);
}

// ==================== VERIFICAR NOTIFICAÇÕES ====================
async function verificarNotificacoes() {
    try {
        //console.log('🔍 Verificando notificações...');
        
        const usuario = auth.getUsuario();
        const isTitular = usuario && (usuario.role === 'ADM' || usuario.role === 'ADVOGADO TITULAR');
        
        const novasNotificacoes = [];
        
        // 1. PROCESSOS (para todos) - Ignora FINALIZADO, ARQUIVADO, CONCLUÍDO
        const processos = await carregarComCache('PROCESSOS').catch(() => []);
        processos.forEach(p => {
            // Verifica se o status deve ser ignorado
            if (!statusDeveNotificar('PROCESSO', p.STATUS)) return;
            
            const dataFinal = p['DATA FINAL'] || p.PRAZO || p['DATA DA INTIMAÇÃO'];
            if (!dataFinal) return;
            
            const diff = calcularDiasRestantes(dataFinal);
            if (diff === null) return;
            
            if ((diff < 0 && diff >= -7) || (diff >= 0 && diff <= 3)) {
                let mensagem = '';
                let tipo = '';
                
                if (diff < 0) {
                    mensagem = `⚠️ Prazo VENCIDO há ${Math.abs(diff)} dia(s)`;
                    tipo = 'urgent';
                } else if (diff === 0) {
                    mensagem = '🔴 Prazo VENCE HOJE';
                    tipo = 'urgent';
                } else if (diff === 1) {
                    mensagem = '🟡 Prazo vence AMANHÃ';
                    tipo = 'warning';
                } else if (diff <= 3) {
                    mensagem = `🟢 Prazo vence em ${diff} dias`;
                    tipo = 'info';
                }
                
                novasNotificacoes.push({
                    id: `prazo_${p._row}`,
                    titulo: '📋 Prazo Processual',
                    mensagem: `${mensagem} - ${p.CLIENTE || 'Cliente'} (${p['N PROCESSO'] || 's/n'})`,
                    tipo: tipo,
                    data: new Date().toISOString(),
                    lida: false,
                    link: 'processos',
                    processo: p['N PROCESSO'] || '',
                    dias: diff
                });
            }
        });
        
        // 2. PERÍCIAS (para todos) - Ignora REALIZADA, CANCELADA, CONCLUÍDA
        const pericias = await carregarComCache('PERICIAS').catch(() => []);
        pericias.forEach(p => {
            if (!statusDeveNotificar('PERICIA', p.STATUS)) return;
            
            const dataPericia = p['DATA DA PERICIA MEDICA'] || p['DATA DA PERICIA SOCIAL'];
            if (!dataPericia) return;
            
            const diff = calcularDiasRestantes(dataPericia);
            if (diff === null) return;
            
            if ((diff < 0 && diff >= -3) || (diff >= 0 && diff <= 7)) {
                let mensagem = '';
                let tipo = '';
                
                if (diff < 0) {
                    mensagem = `⚠️ Perícia VENCIDA há ${Math.abs(diff)} dia(s)`;
                    tipo = 'urgent';
                } else if (diff === 0) {
                    mensagem = '🔴 Perícia é HOJE';
                    tipo = 'urgent';
                } else if (diff === 1) {
                    mensagem = '🟡 Perícia é AMANHÃ';
                    tipo = 'warning';
                } else if (diff <= 7) {
                    mensagem = `🟢 Perícia em ${diff} dias`;
                    tipo = 'info';
                }
                
                const cliente = p.CLIENTE || 'Cliente não informado';
                const beneficio = p['TIPO DE BENEFICIO'] ? ` · ${p['TIPO DE BENEFICIO']}` : '';
                
                novasNotificacoes.push({
                    id: `pericia_${p._row}`,
                    titulo: '🩺 Perícia Agendada',
                    mensagem: `${mensagem} - ${cliente}${beneficio}`,
                    tipo: tipo,
                    data: new Date().toISOString(),
                    lida: false,
                    link: 'pericias',
                    processo: p.PROCESSO || '',
                    dias: diff
                });
            }
        });
        
        // 3. AGENDA (para todos) - Ignora REALIZADO, CANCELADO
        const agenda = await carregarComCache('AGENDA').catch(() => []);
        agenda.forEach(e => {
            if (!statusDeveNotificar('AGENDA', e.Status || e.STATUS)) return;
            
            const dataEvento = e.Data || e['DATA EVENTO'];
            if (!dataEvento) return;
            
            const diff = calcularDiasRestantes(dataEvento);
            if (diff === null) return;
            
            if ((diff < 0 && diff >= -3) || (diff >= 0 && diff <= 7)) {
                let mensagem = '';
                let tipo = '';
                
                if (diff < 0) {
                    mensagem = `⚠️ Evento VENCIDO há ${Math.abs(diff)} dia(s)`;
                    tipo = 'urgent';
                } else if (diff === 0) {
                    mensagem = '🔴 Evento é HOJE';
                    tipo = 'urgent';
                } else if (diff === 1) {
                    mensagem = '🟡 Evento é AMANHÃ';
                    tipo = 'warning';
                } else if (diff <= 7) {
                    mensagem = `🟢 Evento em ${diff} dias`;
                    tipo = 'info';
                }
                
                const cliente = e['Cliente/Parte'] || e.CLIENTE || 'Cliente não informado';
                const tipoEvento = e['Tipo de Evento'] || e.TIPO || 'Evento';
                const horario = e.Horário || e.HORARIO ? ` às ${e.Horário || e.HORARIO}` : '';
                
                novasNotificacoes.push({
                    id: `agenda_${e._row}`,
                    titulo: `📅 ${tipoEvento}`,
                    mensagem: `${mensagem} - ${cliente}${horario}`,
                    tipo: tipo,
                    data: new Date().toISOString(),
                    lida: false,
                    link: 'agenda',
                    processo: e['Nº Processo'] || e['N PROCESSO'] || '',
                    dias: diff
                });
            }
        });
        
        // 4. ATIVIDADES (por perfil) - Ignora CONFERIDO, PROTOCOLADO, FINALIZADO
        const atividades = await carregarComCache('ATIVIDADES').catch(() => []);
        let atividadesFiltradas = [];
        
        if (isTitular) {
            atividadesFiltradas = atividades.filter(a => 
                (a.STATUS === 'EM ANÁLISE' || a.STATUS === 'CORRIGIR') &&
                statusDeveNotificar('ATIVIDADE', a.STATUS)
            );
        } else {
            atividadesFiltradas = atividades.filter(a => 
                a.STATUS === 'CORRIGIR' &&
                statusDeveNotificar('ATIVIDADE', a.STATUS)
            );
        }
        
        atividadesFiltradas.forEach(a => {
            const dataPrazo = a.PRAZO;
            if (!dataPrazo) return;
            
            const diff = calcularDiasRestantes(dataPrazo);
            if (diff === null) return;
            
            if ((diff < 0 && diff >= -7) || (diff >= 0 && diff <= 7)) {
                let mensagem = '';
                let tipo = '';
                
                if (a.STATUS === 'CORRIGIR') {
                    mensagem = `📝 Atividade para CORRIGIR - ${a.CLIENTE}`;
                    tipo = 'urgent';
                } else {
                    mensagem = `📋 Atividade em ANÁLISE - ${a.CLIENTE}`;
                    tipo = 'warning';
                }
                
                if (diff < 0) {
                    mensagem += ` (Vencida há ${Math.abs(diff)} dias)`;
                    tipo = 'urgent';
                } else if (diff === 0) {
                    mensagem += ` (Vence HOJE)`;
                    tipo = 'urgent';
                } else if (diff <= 3) {
                    mensagem += ` (Faltam ${diff} dias)`;
                }
                
                novasNotificacoes.push({
                    id: `atividade_${a._row}`,
                    titulo: a.STATUS === 'CORRIGIR' ? '⚠️ Corrigir Atividade' : '📋 Atividade em Análise',
                    mensagem: `${mensagem} (${a['TIPO DE PRAZO'] || 'Prazo'})`,
                    tipo: tipo,
                    data: new Date().toISOString(),
                    lida: false,
                    link: 'atividades',
                    processo: a.PROCESSO || '',
                    dias: diff,
                    status: a.STATUS
                });
            }
        });
        
        // Adiciona notificações novas (evita duplicatas)
        let adicionadas = 0;
        novasNotificacoes.forEach(nova => {
            const existe = notificacoes.some(n => n.id === nova.id);
            if (!existe) {
                notificacoes.unshift(nova);
                adicionadas++;
            }
        });
        
        if (notificacoes.length > 50) {
            notificacoes = notificacoes.slice(0, 50);
        }
        
        salvarNotificacoes();
        atualizarBadge();
        
        //console.log(`🔔 ${adicionadas} novas notificações (${isTitular ? 'TITULAR' : 'ESTAGIARIO'})`);
        
    } catch (error) {
        console.error('❌ Erro ao verificar notificações:', error);
    }
}

// ==================== BADGE COM NÚMERO ====================
function atualizarBadge() {
    const naoLidas = notificacoes.filter(n => !n.lida).length;
    const badge = document.querySelector('.notification-dot');
    
    if (badge) {
        if (naoLidas > 0) {
            badge.style.display = 'flex';
            badge.textContent = naoLidas > 99 ? '99+' : naoLidas;
            badge.style.alignItems = 'center';
            badge.style.justifyContent = 'center';
            badge.style.fontSize = '0.6rem';
            badge.style.fontWeight = '700';
            badge.style.fontFamily = 'var(--font-mono)';
            badge.style.minWidth = '18px';
            badge.style.height = '18px';
            badge.style.borderRadius = '50%';
            badge.style.background = 'var(--danger)';
            badge.style.color = 'white';
            badge.style.border = '2px solid white';
            badge.style.position = 'absolute';
            badge.style.top = '-4px';
            badge.style.right = '-4px';
            badge.style.padding = '0 4px';
            badge.style.boxShadow = '0 2px 6px rgba(201, 75, 63, 0.3)';
        } else {
            badge.style.display = 'none';
        }
    }
}

// ==================== GERENCIAR NOTIFICAÇÕES ====================
function salvarNotificacoes() {
    localStorage.setItem('tavares_notificacoes', JSON.stringify(notificacoes));
}

function getNotificacoes() {
    return notificacoes;
}

function getNotificacoesNaoLidas() {
    return notificacoes.filter(n => !n.lida);
}

function marcarComoLida(id) {
    const notificacao = notificacoes.find(n => n.id === id);
    if (notificacao) {
        notificacao.lida = true;
        salvarNotificacoes();
        atualizarBadge();
    }
}

function marcarTodasComoLidas() {
    notificacoes.forEach(n => n.lida = true);
    salvarNotificacoes();
    atualizarBadge();
}

function limparNotificacoes() {
    notificacoes = [];
    salvarNotificacoes();
    atualizarBadge();
}

// ==================== PAINEL DE NOTIFICAÇÕES ====================
function abrirPainelNotificacoes() {
    let modal = document.getElementById('modalNotificacoes');
    
    if (!modal) {
        modal = document.createElement('div');
        modal.id = 'modalNotificacoes';
        modal.className = 'modal-overlay';
        modal.innerHTML = `
            <div class="modal" style="max-width: 550px;">
                <div class="modal-header">
                    <h2><i class="fas fa-bell"></i> Notificações</h2>
                    <button class="modal-close" onclick="fecharPainelNotificacoes()">
                        <i class="fas fa-times"></i>
                    </button>
                </div>
                <div class="modal-body" id="notificacoesLista" style="max-height: 450px; overflow-y: auto;">
                    <div style="text-align: center; padding: 2rem; color: var(--text-faint);">
                        Carregando...
                    </div>
                </div>
                <div class="modal-footer" style="justify-content: space-between;">
                    <div style="display: flex; gap: 0.5rem;">
                        <button class="btn-secondary" style="padding: 0.3rem 0.8rem; font-size: 0.8rem;" onclick="marcarTodasComoLidas(); renderizarNotificacoes();">
                            <i class="fas fa-check-double"></i> Ler todas
                        </button>
                        <button class="btn-secondary" style="padding: 0.3rem 0.8rem; font-size: 0.8rem; color: var(--danger);" onclick="limparNotificacoes(); renderizarNotificacoes();">
                            <i class="fas fa-trash"></i> Limpar
                        </button>
                    </div>
                    <button class="btn-primary" style="padding: 0.3rem 0.8rem; font-size: 0.8rem;" onclick="fecharPainelNotificacoes()">
                        Fechar
                    </button>
                </div>
            </div>
        `;
        document.body.appendChild(modal);
        
        modal.addEventListener('click', function(e) {
            if (e.target === this) fecharPainelNotificacoes();
        });
    }
    
    renderizarNotificacoes();
    modal.classList.add('active');
}

// ==================== RENDERIZAR NOTIFICAÇÕES ====================
function renderizarNotificacoes() {
    const container = document.getElementById('notificacoesLista');
    if (!container) return;
    
    const todas = notificacoes;
    
    if (todas.length === 0) {
        container.innerHTML = `
            <div style="text-align: center; padding: 2rem; color: var(--text-faint);">
                <i class="fas fa-bell-slash" style="font-size: 2rem; margin-bottom: 0.5rem; display: block;"></i>
                Nenhuma notificação
            </div>
        `;
        return;
    }
    
    const ordenadas = [...todas].sort((a, b) => {
        if (a.lida !== b.lida) return a.lida ? 1 : -1;
        
        if (!a.lida && !b.lida) {
            const diasA = a.dias !== undefined && a.dias !== null ? a.dias : 999;
            const diasB = b.dias !== undefined && b.dias !== null ? b.dias : 999;
            
            if (diasA < 0 && diasB >= 0) return -1;
            if (diasB < 0 && diasA >= 0) return 1;
            if (diasA === 0 && diasB !== 0) return -1;
            if (diasB === 0 && diasA !== 0) return 1;
            return diasA - diasB;
        }
        
        return new Date(b.data) - new Date(a.data);
    });
    
    container.innerHTML = ordenadas.map(n => {
        const classes = n.lida ? 'notificacao-item lida' : 'notificacao-item';
        
        let badgeDias = '';
        if (n.dias !== undefined && n.dias !== null) {
            if (n.dias < 0) {
                badgeDias = `<span style="background: var(--danger); color: white; padding: 0.1rem 0.4rem; border-radius: 10px; font-size: 0.6rem; margin-left: 0.3rem;">${Math.abs(n.dias)}d atrasado</span>`;
            } else if (n.dias === 0) {
                badgeDias = `<span style="background: var(--warning); color: white; padding: 0.1rem 0.4rem; border-radius: 10px; font-size: 0.6rem; margin-left: 0.3rem;">Hoje!</span>`;
            } else if (n.dias <= 3) {
                badgeDias = `<span style="background: var(--gold-500); color: white; padding: 0.1rem 0.4rem; border-radius: 10px; font-size: 0.6rem; margin-left: 0.3rem;">${n.dias}d</span>`;
            }
        }
        
        let icone = '';
        if (n.titulo.includes('Prazo')) icone = '📋';
        else if (n.titulo.includes('Perícia')) icone = '🩺';
        else if (n.titulo.includes('Agenda') || n.titulo.includes('Evento')) icone = '📅';
        else if (n.titulo.includes('Corrigir')) icone = '⚠️';
        else if (n.titulo.includes('Análise')) icone = '📋';
        else icone = '🔔';
        
        return `
            <div class="${classes}" style="padding: 0.75rem; border-bottom: 1px solid var(--border); ${!n.lida ? 'background: var(--gold-50);' : ''}">
                <div style="display: flex; justify-content: space-between; align-items: flex-start; gap: 0.5rem;">
                    <div style="flex: 1;">
                        <div style="font-weight: 600; font-size: 0.85rem;">
                            ${icone} ${n.titulo}
                            ${badgeDias}
                        </div>
                        <div style="font-size: 0.85rem; color: var(--text-muted);">${n.mensagem}</div>
                        <div style="font-size: 0.7rem; color: var(--text-faint); margin-top: 0.2rem;">
                            ${new Date(n.data).toLocaleString('pt-BR')}
                            ${n.processo ? ` · ${n.processo}` : ''}
                            ${n.status ? ` · ${n.status}` : ''}
                        </div>
                    </div>
                    <div style="display: flex; gap: 0.3rem; align-items: center; flex-shrink: 0;">
                        ${!n.lida ? `<button class="btn-icon-small" onclick="marcarComoLida('${n.id}'); renderizarNotificacoes();" title="Marcar como lida" style="font-size: 0.7rem;">
                            <i class="fas fa-check"></i>
                        </button>` : ''}
                        ${n.link ? `<button class="btn-icon-small" onclick="fecharPainelNotificacoes(); navegarPara('${n.link}');" title="Ir para" style="font-size: 0.7rem;">
                            <i class="fas fa-arrow-right"></i>
                        </button>` : ''}
                    </div>
                </div>
            </div>
        `;
    }).join('');
    
    const header = document.querySelector('#modalNotificacoes .modal-header h2');
    if (header) {
        const naoLidasCount = notificacoes.filter(n => !n.lida).length;
        header.innerHTML = `<i class="fas fa-bell"></i> Notificações ${naoLidasCount > 0 ? `<span style="background: var(--danger); color: white; padding: 0.1rem 0.5rem; border-radius: 12px; font-size: 0.7rem; margin-left: 0.5rem;">${naoLidasCount}</span>` : ''}`;
    }
}

function fecharPainelNotificacoes() {
    const modal = document.getElementById('modalNotificacoes');
    if (modal) modal.classList.remove('active');
}

// ==================== EXPORTAÇÃO GLOBAL ====================
window.inicializarNotificacoes = inicializarNotificacoes;
window.abrirPainelNotificacoes = abrirPainelNotificacoes;
window.fecharPainelNotificacoes = fecharPainelNotificacoes;
window.renderizarNotificacoes = renderizarNotificacoes;
window.marcarComoLida = marcarComoLida;
window.marcarTodasComoLidas = marcarTodasComoLidas;
window.limparNotificacoes = limparNotificacoes;
window.getNotificacoes = getNotificacoes;
window.getNotificacoesNaoLidas = getNotificacoesNaoLidas;

//console.log('🔔 Módulo de notificações carregado (com filtros de status concluídos)');