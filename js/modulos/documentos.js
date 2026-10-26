// ==================== ESTADO ====================
let todasPastas = [];
let todasPastasProcessos = [];
let corSelecionadaPasta = '#3568c9';
let pastaFiltroAtual = 'todos';

// ==================== INICIALIZAÇÃO ====================
async function inicializarDocumentos() {
    //console.log('📁 Inicializando documentos...');
    await aguardarElementosDocumentos();
    await carregarDadosDocumentos();
    initEventosDocumentos();
}

function aguardarElementosDocumentos() {
    return new Promise((resolve) => {
        const check = () => {
            if (document.getElementById('pastasGrid')) {
                resolve();
            } else {
                setTimeout(check, 100);
            }
        };
        check();
    });
}

// ==================== CARREGAR PASTAS DOS PROCESSOS ====================
async function carregarPastasDosProcessos() {
    try {
        let processos = [];
        try {
            const resultado = await carregarComCache('PROCESSOS').catch(() => []);
            processos = Array.isArray(resultado) ? resultado : [];
        } catch (e) {
            console.warn('⚠️ Erro ao carregar PROCESSOS:', e);
            processos = [];
        }
        
        todasPastasProcessos = processos
            .filter(p => p.PASTA && p.PASTA.trim() && p.PASTA.includes('drive.google.com'))
            .map(p => {
                const numProcesso = p['N PROCESSO'] || 'Sem processo';
                const nomeCliente = p.CLIENTE || 'Sem cliente';
                
                return {
                    nome: `${numProcesso} - ${nomeCliente}`,
                    link: p.PASTA,
                    cor: '#3568c9',
                    processo: numProcesso,
                    cliente: nomeCliente,
                    tipo: 'processo'
                };
            });
        
        //console.log(`📂 Pastas de processos carregadas: ${todasPastasProcessos.length}`);
        return todasPastasProcessos;
    } catch (error) {
        console.error('Erro ao carregar pastas dos processos:', error);
        todasPastasProcessos = [];
        return [];
    }
}

// ==================== CARREGAR DADOS ====================
async function carregarDadosDocumentos() {
    try {
        let pastas = [];
        try {
            const resultado = await carregarComCache('PASTAS').catch(() => []);
            pastas = Array.isArray(resultado) ? resultado : [];
        } catch (e) {
            console.warn('⚠️ Aba PASTAS não encontrada');
            pastas = [];
        }
        todasPastas = pastas.filter(p => p.NOME);

        await carregarPastasDosProcessos();
        
        //console.log(`📋 Pastas: ${todasPastas.length} organizacionais + ${todasPastasProcessos.length} processos`);
        
        atualizarStatsDocumentos();
        renderizarPastas();
    } catch (error) {
        console.error('Erro ao carregar:', error);
    }
}

// ==================== STATS ====================
function atualizarStatsDocumentos() {
    const total = todasPastas.length + todasPastasProcessos.length;
    const processos = todasPastasProcessos.length;
    const organizacionais = todasPastas.length;
    const links = todasPastas.filter(p => p.LINK).length + todasPastasProcessos.length;
    
    setText('totalPastas', total);
    setText('totalPastasProcessos', processos);
    setText('totalPastasOrganizacionais', organizacionais);
    setText('totalLinks', links);
    setText('contagemPastas', `${total} pastas`);
}

// ==================== RENDERIZAR PASTAS ====================
function renderizarPastas() {
    const grid = document.getElementById('pastasGrid');
    if (!grid) return;
    
    let html = '';
    
    // Pastas organizacionais
    todasPastas.forEach(p => {
        const cor = p.COR || '#3568c9';
        const link = p.LINK || '#';
        html += `
            <div class="pasta-card" style="color: ${cor};" onclick="window.open('${esc(link)}', '_blank')">
                <i class="fas fa-folder" style="color: ${cor};"></i>
                <span>${esc(p.NOME)}</span>
                <span class="pasta-badge" style="font-size: 0.55rem; opacity: 0.6;">📁</span>
            </div>
        `;
    });
    
    // Pastas dos processos (Google Drive)
    todasPastasProcessos.forEach(p => {
        const cor = p.cor || '#3568c9';
        html += `
            <div class="pasta-card pasta-drive" 
                 style="color: ${cor}; border-left: 3px solid #fbbf24;" 
                 onclick="window.open('${esc(p.link)}', '_blank')">
                <i class="fas fa-folder-open" style="color: #fbbf24;"></i>
                <span>${esc(p.nome)}</span>
                <span class="pasta-badge" style="font-size: 0.45rem; background: #fbbf24; color: #1a1a1a; padding: 0.05rem 0.3rem; border-radius: 8px;">📂 Drive</span>
                <span class="pasta-sub" style="font-size: 0.55rem; opacity: 0.7; margin-top: 0.1rem;">${esc(p.cliente)}</span>
            </div>
        `;
    });
    
    // Botão nova pasta
    html += `
        <div class="pasta-card pasta-add" onclick="abrirModalPasta()">
            <i class="fas fa-folder-plus"></i>
            <span>Nova</span>
        </div>
    `;
    
    grid.innerHTML = html;
}

// ==================== EVENTOS ====================
function initEventosDocumentos() {
    document.getElementById('btnNovaPasta')?.addEventListener('click', () => abrirModalPasta());
    
    document.getElementById('fecharModalPasta')?.addEventListener('click', fecharModalPasta);
    document.getElementById('cancelarPasta')?.addEventListener('click', fecharModalPasta);
    document.getElementById('salvarPasta')?.addEventListener('click', salvarPasta);
    document.getElementById('modalPasta')?.addEventListener('click', function(e) {
        if (e.target === this) fecharModalPasta();
    });
    
    // Busca (filtra pastas pelo nome)
    document.getElementById('buscaDocumento')?.addEventListener('input', debounce(() => {
        filtrarPastas();
    }, 300));
}

// ==================== FILTRAR PASTAS ====================
function filtrarPastas() {
    const busca = (document.getElementById('buscaDocumento')?.value || '').toLowerCase().trim();
    
    const todas = [...todasPastas, ...todasPastasProcessos];
    
    if (!busca) {
        renderizarPastas();
        return;
    }
    
    const filtradas = todas.filter(p => 
        String(p.nome || p.NOME || '').toLowerCase().includes(busca) ||
        String(p.cliente || '').toLowerCase().includes(busca) ||
        String(p.processo || '').toLowerCase().includes(busca)
    );
    
    // Renderiza apenas as pastas filtradas
    const grid = document.getElementById('pastasGrid');
    if (!grid) return;
    
    let html = '';
    
    filtradas.forEach(p => {
        if (p.tipo === 'processo') {
            html += `
                <div class="pasta-card pasta-drive" 
                     style="color: ${p.cor || '#3568c9'}; border-left: 3px solid #fbbf24;" 
                     onclick="window.open('${esc(p.link)}', '_blank')">
                    <i class="fas fa-folder-open" style="color: #fbbf24;"></i>
                    <span>${esc(p.nome)}</span>
                    <span class="pasta-badge" style="font-size: 0.45rem; background: #fbbf24; color: #1a1a1a; padding: 0.05rem 0.3rem; border-radius: 8px;">📂 Drive</span>
                    <span class="pasta-sub" style="font-size: 0.55rem; opacity: 0.7; margin-top: 0.1rem;">${esc(p.cliente)}</span>
                </div>
            `;
        } else {
            const cor = p.COR || '#3568c9';
            const link = p.LINK || '#';
            html += `
                <div class="pasta-card" style="color: ${cor};" onclick="window.open('${esc(link)}', '_blank')">
                    <i class="fas fa-folder" style="color: ${cor};"></i>
                    <span>${esc(p.NOME)}</span>
                    <span class="pasta-badge" style="font-size: 0.55rem; opacity: 0.6;">📁</span>
                </div>
            `;
        }
    });
    
    if (filtradas.length === 0) {
        html = `
            <div style="text-align: center; padding: 2rem; color: var(--text-muted); width: 100%;">
                <i class="fas fa-search" style="font-size: 2rem; display: block; margin-bottom: 0.5rem;"></i>
                <p>Nenhuma pasta encontrada para "<strong>${busca}</strong>"</p>
            </div>
        `;
    }
    
    // Botão nova pasta
    html += `
        <div class="pasta-card pasta-add" onclick="abrirModalPasta()">
            <i class="fas fa-folder-plus"></i>
            <span>Nova</span>
        </div>
    `;
    
    grid.innerHTML = html;
}

// ==================== MODAL PASTA ====================
function abrirModalPasta() {
    document.getElementById('formPasta')?.reset();
    document.getElementById('pastaLink').value = '';
    document.getElementById('modalPasta')?.classList.add('active');
}

function fecharModalPasta() {
    document.getElementById('modalPasta')?.classList.remove('active');
}

function selecionarCorPasta(el) {
    document.querySelectorAll('.cor-pasta').forEach(c => c.classList.remove('selected'));
    el.classList.add('selected');
    corSelecionadaPasta = el.getAttribute('data-cor');
}

// ==================== SALVAR PASTA ====================
async function salvarPasta() {
    const nome = document.getElementById('pastaNome')?.value?.trim();
    const link = document.getElementById('pastaLink')?.value?.trim();
    
    if (!nome) {
        notificar('Digite o nome da pasta!', 'warning');
        return;
    }
    
    try {
        const dados = { 
            NOME: nome, 
            COR: corSelecionadaPasta,
            LINK: link || ''
        };
        
        await apiCreate('PASTAS', dados);
        notificar('Pasta criada!', 'success');
        fecharModalPasta();
        await carregarDadosDocumentos();
    } catch (error) {
        notificar('Erro: ' + error.message, 'error');
    }
}

// ==================== ATALHOS ====================
document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
        fecharModalPasta();
    }
});

// ==================== EXPORTAÇÃO GLOBAL ====================
window.inicializarDocumentos = inicializarDocumentos;
window.abrirModalPasta = abrirModalPasta;
window.fecharModalPasta = fecharModalPasta;
window.salvarPasta = salvarPasta;
window.selecionarCorPasta = selecionarCorPasta;

//console.log('📋 Módulo documentos carregado');