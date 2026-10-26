// ==================== ESTADO ====================
let resultadosBusca = [];
let buscaAtiva = false;
let buscaTimeout = null;

// ==================== INICIALIZAR BUSCA ====================
function inicializarBuscaGlobal() {
    //console.log('🔍 Inicializando busca global...');
    
    const input = document.getElementById('buscaGlobal');
    if (!input) {
        console.warn('⚠️ Elemento buscaGlobal não encontrado');
        return;
    }
    
    //console.log('✅ Input de busca encontrado');
    
    // Cria o container de resultados
    criarContainerResultados();
    
    // Evento de input
    input.addEventListener('input', function(e) {
        const termo = this.value.trim();
        //console.log(`⌨️ Digitando: "${termo}" (${termo.length} caracteres)`);
        
        clearTimeout(buscaTimeout);
        
        if (termo.length < 2) {
            fecharResultadosBusca();
            return;
        }
        
        // Mostra loading imediatamente
        const container = document.getElementById('buscaResultados');
        if (container) {
            container.style.display = 'block';
            container.innerHTML = `
                <div style="padding: 1rem; text-align: center; color: #64708a;">
                    <i class="fas fa-spinner fa-pulse"></i> Buscando...
                </div>
            `;
        }
        
        buscaTimeout = setTimeout(() => {
            realizarBusca(termo);
        }, 500);
    });
    
    // Enter para buscar
    input.addEventListener('keydown', function(e) {
        if (e.key === 'Enter') {
            const termo = this.value.trim();
            //console.log(`⏎ Enter pressionado: "${termo}"`);
            if (termo.length >= 2) {
                clearTimeout(buscaTimeout);
                realizarBusca(termo);
            }
        }
        if (e.key === 'Escape') {
            fecharResultadosBusca();
        }
    });
    
    // Fecha ao clicar fora
    document.addEventListener('click', function(e) {
        const container = document.getElementById('buscaResultados');
        const input = document.getElementById('buscaGlobal');
        if (container && input && !container.contains(e.target) && e.target !== input) {
            fecharResultadosBusca();
        }
    });
    
    //console.log('🔍 Busca global inicializada com sucesso!');
}

// ==================== CRIAR CONTAINER ====================
function criarContainerResultados() {
    let container = document.getElementById('buscaResultados');
    if (container) {
        //console.log('📦 Container de busca já existe');
        return;
    }
    
    container = document.createElement('div');
    container.id = 'buscaResultados';
    container.style.cssText = `
        position: absolute;
        top: calc(100% + 4px);
        left: 0;
        right: 0;
        background: white;
        border: 1px solid #e4e6eb;
        border-radius: 10px;
        box-shadow: 0 8px 30px rgba(0,0,0,0.12);
        max-height: 400px;
        overflow-y: auto;
        z-index: 9999;
        display: none;
        margin-top: 0;
        min-width: 300px;
    `;
    
    const searchBar = document.querySelector('.search-bar');
    if (searchBar) {
        searchBar.style.position = 'relative';
        searchBar.appendChild(container);
        //console.log('✅ Container de resultados criado');
    } else {
        console.warn('⚠️ .search-bar não encontrado');
        document.body.appendChild(container);
        container.style.position = 'fixed';
        container.style.top = '60px';
        container.style.left = '50%';
        container.style.transform = 'translateX(-50%)';
        container.style.maxWidth = '460px';
        container.style.width = '90%';
    }
}

// ==================== FUNÇÃO DE SEGURANÇA PARA STRINGS ====================
function safeString(valor) {
    if (valor === null || valor === undefined) return '';
    return String(valor);
}

// ==================== REALIZAR BUSCA ====================
async function realizarBusca(termo) {
    //console.log(`🔍 Buscando por: "${termo}"`);
    
    const container = document.getElementById('buscaResultados');
    if (!container) {
        console.warn('⚠️ Container de resultados não encontrado');
        return;
    }
    
    container.style.display = 'block';
    container.innerHTML = `
        <div style="padding: 1rem; text-align: center; color: #64708a;">
            <i class="fas fa-spinner fa-pulse"></i> Buscando "${esc(termo)}"...
        </div>
    `;
    
    try {
        const termoLower = termo.toLowerCase();
        const resultados = [];
        
        // 1. Busca em PROCESSOS
        const processos = await carregarComCache('PROCESSOS').catch(() => []);
        if (Array.isArray(processos) && processos.length) {
            processos.forEach(p => {
                const num = safeString(p['N PROCESSO'] || p['Nº PROCESSO'] || '');
                const cliente = safeString(p.CLIENTE || '');
                const responsavel = safeString(p.RESPONSÁVEL || '');
                
                if (num.toLowerCase().includes(termoLower) || 
                    cliente.toLowerCase().includes(termoLower) ||
                    responsavel.toLowerCase().includes(termoLower)) {
                    resultados.push({
                        titulo: num || 'Processo',
                        subtitulo: `${cliente} · ${responsavel || 'Sem responsável'}`,
                        pagina: 'processos',
                        icone: 'fa-gavel',
                        tipo: 'Processo',
                        cor: '#3568c9'
                    });
                }
            });
        }
        
        // 2. Busca em CLIENTES (incluindo CPF)
        const clientes = await carregarComCache('CLIENTES').catch(() => []);
        if (Array.isArray(clientes) && clientes.length) {
            clientes.forEach(c => {
                const nome = safeString(c.NOME || '');
                const contato = safeString(c.CONTATO || '');
                const cidade = safeString(c.CIDADE || '');
                const cpf = safeString(c.CPF || '');  // <-- ADICIONADO CPF
                
                // Remove formatação do CPF para busca (ex: 000.000.000-00 -> 00000000000)
                const cpfLimpo = cpf.replace(/\D/g, '');
                const termoLimpo = termo.replace(/\D/g, '');
                
                if (nome.toLowerCase().includes(termoLower) || 
                    contato.toLowerCase().includes(termoLower) ||
                    cidade.toLowerCase().includes(termoLower) ||
                    cpf.toLowerCase().includes(termoLower) ||
                    (termoLimpo.length > 0 && cpfLimpo.includes(termoLimpo))) {
                    resultados.push({
                        titulo: nome || 'Cliente',
                        subtitulo: `${cpf || 'Sem CPF'} · ${contato || 'Sem contato'} · ${cidade || 'Sem cidade'}`,
                        pagina: 'clientes',
                        icone: 'fa-user',
                        tipo: 'Cliente',
                        cor: '#2f9e5b'
                    });
                }
            });
        }
        
        // 3. Busca em PERÍCIAS
        const pericias = await carregarComCache('PERICIAS').catch(() => []);
        if (Array.isArray(pericias) && pericias.length) {
            pericias.forEach(p => {
                const cliente = safeString(p.CLIENTE || '');
                const processo = safeString(p.PROCESSO || '');
                
                if (cliente.toLowerCase().includes(termoLower) || 
                    processo.toLowerCase().includes(termoLower)) {
                    resultados.push({
                        titulo: cliente || 'Perícia',
                        subtitulo: `${processo} · ${safeString(p['TIPO DE BENEFICIO'] || '')}`,
                        pagina: 'pericias',
                        icone: 'fa-stethoscope',
                        tipo: 'Perícia',
                        cor: '#8b5cf6'
                    });
                }
            });
        }
        
        // 4. Busca em AGENDA
        const agenda = await carregarComCache('AGENDA').catch(() => []);
        if (Array.isArray(agenda) && agenda.length) {
            agenda.forEach(e => {
                const cliente = safeString(e['Cliente/Parte'] || e.CLIENTE || '');
                const tipo = safeString(e['Tipo de Evento'] || e.TIPO || '');
                const processo = safeString(e['Nº Processo'] || e['N PROCESSO'] || '');
                
                if (cliente.toLowerCase().includes(termoLower) || 
                    tipo.toLowerCase().includes(termoLower) ||
                    processo.toLowerCase().includes(termoLower)) {
                    resultados.push({
                        titulo: tipo || 'Evento',
                        subtitulo: `${cliente} · ${processo || ''}`,
                        pagina: 'agenda',
                        icone: 'fa-calendar-alt',
                        tipo: 'Evento',
                        cor: '#c98a1f'
                    });
                }
            });
        }
        
        // 5. Busca em ATIVIDADES
        const atividades = await carregarComCache('ATIVIDADES').catch(() => []);
        if (Array.isArray(atividades) && atividades.length) {
            atividades.forEach(a => {
                const cliente = safeString(a.CLIENTE || '');
                const processo = safeString(a.PROCESSO || '');
                const tipo = safeString(a['TIPO DE PRAZO'] || '');
                
                if (cliente.toLowerCase().includes(termoLower) || 
                    processo.toLowerCase().includes(termoLower) ||
                    tipo.toLowerCase().includes(termoLower)) {
                    resultados.push({
                        titulo: tipo || 'Atividade',
                        subtitulo: `${cliente} · ${processo || ''}`,
                        pagina: 'atividades',
                        icone: 'fa-tasks',
                        tipo: 'Atividade',
                        cor: '#c94b3f'
                    });
                }
            });
        }
        
        // 6. Busca em DOCUMENTOS
        const documentos = await carregarComCache('DOCUMENTOS').catch(() => []);
        if (Array.isArray(documentos) && documentos.length) {
            documentos.forEach(d => {
                const nome = safeString(d.NOME || '');
                const cliente = safeString(d.CLIENTE || '');
                const processo = safeString(d.PROCESSO || '');
                
                if (nome.toLowerCase().includes(termoLower) || 
                    cliente.toLowerCase().includes(termoLower) ||
                    processo.toLowerCase().includes(termoLower)) {
                    resultados.push({
                        titulo: nome || 'Documento',
                        subtitulo: `${cliente} · ${processo || ''}`,
                        pagina: 'documentos',
                        icone: 'fa-file-alt',
                        tipo: 'Documento',
                        cor: '#f59e0b'
                    });
                }
            });
        }
        
        //console.log(`📊 ${resultados.length} resultados encontrados para "${termo}"`);
        
        mostrarResultadosBusca(container, resultados, termo);
        
    } catch (error) {
        console.error('❌ Erro na busca:', error);
        container.innerHTML = `
            <div style="padding: 1rem; text-align: center; color: #c94b3f;">
                <i class="fas fa-exclamation-circle"></i> Erro ao buscar: ${error.message}
            </div>
        `;
    }
}

// ==================== MOSTRAR RESULTADOS ====================
function mostrarResultadosBusca(container, resultados, termo) {
    if (!resultados.length) {
        container.innerHTML = `
            <div style="padding: 1.5rem; text-align: center; color: #98a2b8;">
                <i class="fas fa-search" style="font-size: 1.5rem; display: block; margin-bottom: 0.5rem;"></i>
                Nenhum resultado encontrado para "<strong>${esc(termo)}</strong>"
            </div>
        `;
        return;
    }
    
    const exibir = resultados.slice(0, 20);
    
    let html = `
        <div style="padding: 0.5rem 0.75rem; background: #f4f5f7; border-bottom: 1px solid #e4e6eb; font-size: 0.75rem; color: #64708a;">
            ${resultados.length} resultado(s) encontrado(s)
        </div>
    `;
    
    exibir.forEach(r => {
        html += `
            <div class="busca-resultado-item" onclick="navegarPara('${r.pagina}'); fecharResultadosBusca();" 
                 style="padding: 0.6rem 0.75rem; cursor: pointer; display: flex; align-items: center; gap: 0.75rem; border-bottom: 1px solid #e4e6eb; transition: background 0.15s ease;"
                 onmouseover="this.style.background='#f3f4f6'" 
                 onmouseout="this.style.background='transparent'">
                <div style="width: 32px; height: 32px; border-radius: 8px; background: ${r.cor}22; display: flex; align-items: center; justify-content: center; flex-shrink: 0; color: ${r.cor};">
                    <i class="fas ${r.icone}"></i>
                </div>
                <div style="flex: 1; min-width: 0;">
                    <div style="font-weight: 600; font-size: 0.85rem; color: #1c2333;">${esc(r.titulo)}</div>
                    <div style="font-size: 0.75rem; color: #64708a; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${esc(r.subtitulo)}</div>
                </div>
                <div style="font-size: 0.6rem; color: #98a2b8; background: #f4f5f7; padding: 0.15rem 0.5rem; border-radius: 10px; flex-shrink: 0;">
                    ${r.tipo}
                </div>
            </div>
        `;
    });
    
    if (resultados.length > 20) {
        html += `
            <div style="padding: 0.5rem; text-align: center; font-size: 0.75rem; color: #64708a; border-top: 1px solid #e4e6eb;">
                + ${resultados.length - 20} outro(s) resultado(s)
            </div>
        `;
    }
    
    container.innerHTML = html;
    container.style.display = 'block';
}

// ==================== FECHAR RESULTADOS ====================
function fecharResultadosBusca() {
    const container = document.getElementById('buscaResultados');
    if (container) {
        container.style.display = 'none';
        container.innerHTML = '';
    }
}

// ==================== EXPORTAÇÃO GLOBAL ====================
window.inicializarBuscaGlobal = inicializarBuscaGlobal;
window.fecharResultadosBusca = fecharResultadosBusca;
window.realizarBusca = realizarBusca;

//console.log('🔍 Módulo de busca global carregado');