// ==================== CONFIGURAÇÃO ====================
const CONFIG = {
    paginas: {
        'login': {
            arquivo: 'pages/login.html',
            css: 'css/login.css',
            iniciar: 'inicializarLogin'
        },
        'painel': {
            arquivo: 'pages/painel.html',
            css: 'css/painel.css',
            iniciar: 'inicializarPainel'
        },
        'clientes': {
            arquivo: 'pages/clientes.html',
            css: 'css/clientes.css',
            iniciar: 'inicializarClientes'
        },
        'processos': {
            arquivo: 'pages/processos.html',
            css: 'css/processos.css',
            iniciar: 'inicializarProcessos'
        },
        'pericias': {
            arquivo: 'pages/pericias.html',
            css: 'css/pericias.css',
            iniciar: 'inicializarPericias'
        },
        'parceiros': {
            arquivo: 'pages/parceiros.html',
            css: 'css/parceiros.css',
            iniciar: 'inicializarParceiros'
        },
        'agenda': {
            arquivo: 'pages/agenda.html',
            css: 'css/agenda.css',
            iniciar: 'inicializarAgenda'
        },
        'atividades': {
            arquivo: 'pages/atividades.html',
            css: 'css/atividades.css',
            iniciar: 'inicializarAtividades'
        },
        'documentos': {
            arquivo: 'pages/documentos.html',
            css: 'css/documentos.css',
            iniciar: 'inicializarDocumentos'
        },
        'financeiro': {
            arquivo: 'pages/financeiro.html',
            css: 'css/financeiro.css',
            iniciar: 'inicializarFinanceiro'
        },
        'relatorios': {
            arquivo: 'pages/relatorios.html',
            css: 'css/relatorios.css',
            iniciar: 'inicializarRelatorios'
        },
        'configuracoes': {
            arquivo: 'pages/configuracoes.html',
            css: 'css/configuracoes.css',
            iniciar: 'inicializarConfiguracoes'
        },
    },
    paginaInicial: 'painel',
    paginaLogin: 'login'
};

// ==================== ESTADO ====================
let paginaAtual = null;
let paginaCarregando = false;
let cssCarregados = {};
let notificacoesInicializadas = false;

// ==================== SIDEBAR (MOBILE) ====================
function initSidebar() {
    const sidebar = document.getElementById('sidebar');
    const openBtn = document.getElementById('openSidebar');
    const closeBtn = document.getElementById('closeSidebar');
    const overlay = document.getElementById('overlay');

    if (!sidebar || !openBtn || !closeBtn || !overlay) {
        console.warn('⚠️ Elementos da sidebar não encontrados');
        return { close: () => {} };
    }

    const open = () => {
        sidebar.classList.add('active');
        overlay.classList.add('active');
        document.body.style.overflow = 'hidden';
    };

    const close = () => {
        sidebar.classList.remove('active');
        overlay.classList.remove('active');
        document.body.style.overflow = '';
    };

    openBtn.addEventListener('click', open);
    closeBtn.addEventListener('click', close);
    overlay.addEventListener('click', close);

    window.addEventListener('resize', () => {
        if (window.innerWidth > 768) {
            close();
        }
    });

    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && sidebar.classList.contains('active')) {
            close();
        }
    });

    return { close };
}

// ==================== CARREGAMENTO DE PÁGINAS ====================

function carregarCSS(url) {
    if (!url) return;

    const nomeArquivo = url.split('/').pop();
    if (cssCarregados[nomeArquivo]) {
        //console.log(`📄 CSS já está carregado: ${nomeArquivo}`);
        return;
    }

    const existe = document.querySelector(`link[href$="${nomeArquivo}"]`);
    if (existe) {
        cssCarregados[nomeArquivo] = true;
        //console.log(`📄 CSS encontrado no DOM: ${nomeArquivo}`);
        return;
    }

    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = url;
    link.onload = () => {
        cssCarregados[nomeArquivo] = true;
        //console.log(`✅ CSS carregado: ${nomeArquivo}`);
    };
    link.onerror = () => {
        console.warn(`⚠️ Falha ao carregar CSS: ${nomeArquivo}`);
    };
    document.head.appendChild(link);
}

async function carregarPaginaHTML(pageName) {
    const config = CONFIG.paginas[pageName];
    
    if (!config) {
        console.error(`❌ Página "${pageName}" não encontrada na configuração`);
        return null;
    }

    try {
        //console.log(`📥 Carregando: ${config.arquivo}`);
        const response = await fetch(config.arquivo);
        
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }
        
        const html = await response.text();
        //console.log(`✅ HTML carregado: ${config.arquivo} (${html.length} bytes)`);
        return html;
        
    } catch (error) {
        console.error(`❌ Erro ao carregar ${config.arquivo}:`, error);
        return null;
    }
}

function mostrarErroPagina(pageName, mensagem) {
    const container = document.getElementById('pageContent');
    if (!container) return;

    container.innerHTML = `
        <div class="empty-state" style="margin-top: 3rem;">
            <i class="fas fa-exclamation-triangle" style="font-size: 3rem; color: var(--warning);"></i>
            <h3>Erro ao carregar página</h3>
            <p>Não foi possível carregar "<strong>${pageName}</strong>".</p>
            <p style="font-size: 0.85rem; color: var(--text-faint); margin-top: 0.5rem;">${mensagem || 'Tente novamente.'}</p>
            <button class="btn-primary" style="margin-top: 1.5rem;" onclick="navegarPara('${CONFIG.paginaInicial}')">
                <i class="fas fa-home"></i> Voltar ao painel
            </button>
        </div>
    `;
}

function mostrarCarregando() {
    const container = document.getElementById('pageContent');
    if (!container) return;

    container.innerHTML = `
        <div style="display: flex; justify-content: center; align-items: center; min-height: 400px;">
            <div style="text-align: center;">
                <div class="spinner"></div>
                <p style="margin-top: 1rem; color: var(--text-muted); font-size: 0.9rem;">Carregando...</p>
            </div>
        </div>
    `;
}

async function navegarPara(pageName) {
    if (!CONFIG.paginas[pageName]) {
        console.error(`❌ Página "${pageName}" não configurada`);
        return;
    }

    if (pageName !== 'login' && !auth.logado()) {
        //console.log('🔐 Usuário não autenticado, redirecionando para login');
        if (paginaAtual !== 'login') {
            await navegarPara('login');
        }
        return;
    }

    if (pageName === 'login' && auth.logado()) {
        //console.log('🔐 Usuário já logado, redirecionando para painel');
        await navegarPara('painel');
        return;
    }

    if (pageName !== 'login' && !auth.temPermissao(pageName)) {
        console.warn(`⛔ Acesso negado à página: ${pageName}`);
        if (typeof notificar === 'function') {
            notificar('Você não tem permissão para acessar esta página.', 'warning');
        }
        return;
    }

    if (paginaAtual === pageName) {
        //console.log(`ℹ️ Já está na página: ${pageName}`);
        return;
    }
    
    if (paginaCarregando) {
        console.warn('⚠️ Já existe um carregamento em andamento');
        return;
    }

    paginaCarregando = true;
    //console.log(`🚀 Navegando para: ${pageName}`);

    try {
        document.querySelectorAll('.sidebar-nav a[data-page]').forEach(link => {
            const isActive = link.getAttribute('data-page') === pageName;
            link.classList.toggle('active', isActive);
        });

        mostrarCarregando();

        const config = CONFIG.paginas[pageName];

        if (config.css) {
            carregarCSS(config.css);
        }

        await new Promise(resolve => setTimeout(resolve, 200));

        const html = await carregarPaginaHTML(pageName);
        
        if (!html) {
            mostrarErroPagina(pageName, 'Arquivo não encontrado ou inacessível.');
            return;
        }

        const container = document.getElementById('pageContent');
        if (container) {
            container.innerHTML = html;
        }

        container?.scrollTo({ top: 0, behavior: 'smooth' });

        await new Promise(resolve => setTimeout(resolve, 100));

        if (config.iniciar) {
            const funcIniciar = window[config.iniciar];
            if (typeof funcIniciar === 'function') {
                //console.log(`🔧 Inicializando módulo: ${config.iniciar}`);
                await funcIniciar();
            } else {
                console.warn(`⚠️ Função "${config.iniciar}" não encontrada no escopo global`);
            }
        }

        paginaAtual = pageName;
        //console.log(`✅ Página carregada: ${pageName}`);

        if (pageName !== CONFIG.paginaInicial && pageName !== 'login') {
            history.pushState({ page: pageName }, '', `#${pageName}`);
        } else if (pageName === 'login') {
            history.replaceState({ page: pageName }, '', `#login`);
        } else {
            history.replaceState({ page: pageName }, '', window.location.pathname);
        }

    } catch (error) {
        console.error('❌ Erro na navegação:', error);
        mostrarErroPagina(pageName, error.message);
    } finally {
        paginaCarregando = false;
    }
}

// ==================== NAVEGAÇÃO POR LINKS ====================
function initNavigation(sidebarControls) {
    document.addEventListener('click', (e) => {
        const link = e.target.closest('[data-page]');
        if (!link) return;

        e.preventDefault();
        const page = link.getAttribute('data-page');
        
        if (page) {
            navegarPara(page);
            
            if (window.innerWidth <= 768 && sidebarControls) {
                sidebarControls.close();
            }
        }
    });

    window.addEventListener('popstate', (e) => {
        if (e.state && e.state.page) {
            navegarPara(e.state.page);
        }
    });
}


// ==================== INICIALIZAR NOTIFICAÇÕES POR ÚLTIMO ====================
/**
 * CORREÇÃO: esta função rodava independentemente do usuário estar
 * logado ou não. Como inicializarApp() chamava
 * iniciarNotificacoesAposCarregamento() sem checar `logado`, o
 * setTimeout de 2s disparava mesmo na tela de login e chamava
 * inicializarNotificacoes() sem um usuário válido.
 *
 * Agora a função:
 *  1) sai cedo se não houver usuário logado no momento em que é chamada;
 *  2) checa de novo dentro do próprio setTimeout, pois a sessão pode
 *     mudar (expirar, logout, etc.) durante os 2s de espera.
 */
function iniciarNotificacoesAposCarregamento() {
    // Não inicializa notificações se o usuário não estiver logado
    if (!auth.logado()) {
        //console.log('🔕 Usuário não logado — notificações não serão inicializadas');
        return;
    }

    // Verifica se já foram inicializadas
    if (notificacoesInicializadas) {
        //console.log('ℹ️ Notificações já inicializadas');
        return;
    }
    
    // Aguarda o DOM estar totalmente carregado
    if (document.readyState === 'complete') {
        // Se já carregou, inicia após 2 segundos
        setTimeout(() => {
            // Checa novamente: a sessão pode ter mudado durante a espera
            if (typeof inicializarNotificacoes === 'function' && auth.logado()) {
                //console.log('🔔 Inicializando notificações (após carregamento completo)...');
                inicializarNotificacoes();
                notificacoesInicializadas = true;
            } else if (!auth.logado()) {
                //console.log('🔕 Sessão não está mais ativa — notificações canceladas');
            }
        }, 2000);
    } else {
        // Se ainda não carregou, aguarda o evento load
        window.addEventListener('load', function() {
            setTimeout(() => {
                if (typeof inicializarNotificacoes === 'function' && auth.logado()) {
                    //console.log('🔔 Inicializando notificações (após load)...');
                    inicializarNotificacoes();
                    notificacoesInicializadas = true;
                } else if (!auth.logado()) {
                    //console.log('🔕 Sessão não está mais ativa — notificações canceladas');
                }
            }, 2000);
        });
    }
}

// ==================== INICIALIZAÇÃO ====================
async function inicializarApp() {
    //console.log('🚀 Iniciando Tavares Advocacia · GestãoPro...');
    //console.log(`📅 ${new Date().toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}`);

    // 1. INICIALIZA AUTENTICAÇÃO
    const logado = auth.init();

    // 2. INICIALIZA SIDEBAR E NAVEGAÇÃO
    const sidebarControls = initSidebar();
    initNavigation(sidebarControls);
    inicializarBuscaGlobal();
    // 3. ATUALIZA MENU
    if (logado) {
        auth.atualizarMenu();
        auth.atualizarSidebar();
    }

    // 4. DEFINE PÁGINA INICIAL
    let paginaInicial;
    
    if (!logado) {
        //console.log('🔐 Usuário não logado, indo para login');
        paginaInicial = 'login';
    } else {
        const hash = window.location.hash.replace('#', '');
        paginaInicial = hash && CONFIG.paginas[hash] ? hash : CONFIG.paginaInicial;
        
        if (paginaInicial !== 'login' && !auth.temPermissao(paginaInicial)) {
            console.warn(`⛔ Acesso negado à página: ${paginaInicial}`);
            paginaInicial = 'painel';
        }
    }

    // 5. CARREGA PÁGINA INICIAL
    await navegarPara(paginaInicial);

    // 6. INICIALIZA NOTIFICAÇÕES POR ÚLTIMO (após tudo carregar) — apenas se logado
    if (logado) {
        iniciarNotificacoesAposCarregamento();
    } else {
        console.log('🔕 Usuário não logado — pulando inicialização de notificações');
    }

    //console.log('✅ Sistema carregado com sucesso!');
    //console.log('💡 Dica: Use as teclas de atalho para navegar');
    //console.log(`👤 Usuário: ${auth.getUsuario()?.nome || 'Não logado'}`);
    //console.log(`⏰ Sessão expira em: ${new Date(auth.getUsuario()?.expiresAt || Date.now()).toLocaleTimeString()}`);
    //console.log('🔔 Notificações serão inicializadas em breve...');
}

// ==================== BOTÃO DE NOTIFICAÇÕES ====================
document.addEventListener('DOMContentLoaded', function() {
    const notifBtn = document.querySelector('.btn-icon[title="Notificações"]');
    if (notifBtn) {
        notifBtn.addEventListener('click', function(e) {
            e.preventDefault();
            if (typeof abrirPainelNotificacoes === 'function') {
                abrirPainelNotificacoes();
            } else {
                console.warn('⚠️ Função abrirPainelNotificacoes não disponível ainda');
            }
        });
    }
});

// ==================== ATALHOS DE TECLADO ====================
document.addEventListener('keydown', (e) => {
    if (e.ctrlKey) {
        const teclas = {
            '1': 'painel',
            '2': 'processos',
            '3': 'clientes',
            '4': 'parceiros',
            '5': 'agenda',
            '6': 'atividades',
            '7': 'pericias',
            '8': 'documentos',
            '9': 'financeiro'
        };
        
        if (teclas[e.key]) {
            e.preventDefault();
            navegarPara(teclas[e.key]);
        }
    }
});

// ==================== EXPORTAÇÃO GLOBAL ====================
window.navegarPara = navegarPara;
window.app = {
    navegar: navegarPara,
    paginaAtual: () => paginaAtual,
    recarregar: () => {
        if (window.cacheGlobal) cacheGlobal.limpar();
        return paginaAtual ? navegarPara(paginaAtual) : null;
    },
    paginas: () => Object.keys(CONFIG.paginas)
};

// ==================== INICIALIZAÇÃO ====================
document.addEventListener('DOMContentLoaded', inicializarApp);

//console.log('📋 app.js carregado');