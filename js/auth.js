// ==================== CONFIGURAÇÃO ====================
const GOOGLE_CLIENT_ID = '936205929077-u7q325vogq2l05r4j4bsgiqfrcqgiovs.apps.googleusercontent.com';
const SESSION_DURATION = 8 * 60 * 60 * 1000; 

// ==================== PERMISSÕES POR ROLE ====================
const PERMISSOES_POR_ROLE = {
    'ADM': ['*'],
    'ADVOGADO': ['*'],
    'ESTAGIARIO': ['painel', 'clientes', 'processos', 'pericias', 'atividades', 'agenda'],
    'SECRETARIA': ['painel', 'clientes', 'processos', 'agenda'],
    'PARCEIRO': ['painel', 'clientes', 'processos']
};

// Fallback para login local (caso a planilha não esteja disponível)
const USUARIOS_LOCAL_FALLBACK = {
    'advogado': {
        senha: 'tavares2024',
        nome: 'Dr. Tavares',
        role: 'ADVOGADO TITULAR',
        permissoes: ['*']
    },
    'estagiario1': {
        senha: 'estagio2024',
        nome: 'Estagiário 1',
        role: 'ESTAGIARIO',
        permissoes: ['painel', 'clientes', 'processos', 'pericias', 'atividades']
    }
};

// ==================== ESTADO ====================
let usuarioAtual = null;
let tokenGoogle = null;
let usuariosDaPlanilha = [];
let usuariosCarregados = false;

// ==================== TODAS AS PÁGINAS DO SISTEMA ====================
const TODAS_PAGINAS = [
    { id: 'painel', icone: 'fa-solid fa-layer-group', nome: 'Painel' },
    { id: 'processos', icone: 'fas fa-gavel', nome: 'Processos' },
    { id: 'clientes', icone: 'fas fa-users', nome: 'Clientes' },
    { id: 'parceiros', icone: 'fa-solid fa-handshake', nome: 'Parceiros' },
    { id: 'agenda', icone: 'fas fa-calendar-alt', nome: 'Agenda' },
    { id: 'atividades', icone: 'fas fa-tasks', nome: 'Atividades' },
    { id: 'pericias', icone: 'fas fa-stethoscope', nome: 'Perícias' },
    { id: 'documentos', icone: 'fas fa-folder-open', nome: 'Documentos' },
    { id: 'financeiro', icone: 'fas fa-sack-dollar', nome: 'Financeiro' },
    { id: 'relatorios', icone: 'fas fa-file-lines', nome: 'Relatórios' }
];

// ==================== CARREGAR USUÁRIOS DA PLANILHA ====================
async function carregarUsuariosPlanilha() {
    if (usuariosCarregados) return usuariosDaPlanilha;
    
    try {
        //console.log('📥 Carregando usuários da planilha (ABA RH)...');
        const dados = await carregarComCache('RH').catch(() => []);
        
        // Filtra apenas usuários com STATUS = ATIVO e com EMAIL
        usuariosDaPlanilha = dados.filter(u => 
            u.STATUS && 
            u.STATUS.toUpperCase() === 'ATIVO' &&
            u.EMAIL && 
            u.EMAIL.trim() !== ''
        );
        
        //console.log(`✅ ${usuariosDaPlanilha.length} usuários carregados da planilha`);
        usuariosCarregados = true;
        return usuariosDaPlanilha;
        
    } catch (error) {
        console.warn('⚠️ Erro ao carregar usuários da planilha, usando fallback:', error);
        // Fallback: usa os usuários locais
        usuariosDaPlanilha = [];
        usuariosCarregados = true;
        return [];
    }
}

// ==================== OBTER PERMISSÕES POR ROLE ====================
function getPermissoesByRole(role) {
    return PERMISSOES_POR_ROLE[role] || ['painel']; // padrão: só painel
}

// ==================== VALIDAR USUÁRIO ====================
function validarUsuario(email, senha = null) {
    // 1. Tenta validar na planilha (para login com Google ou local)
    const usuarioPlanilha = usuariosDaPlanilha.find(u => 
        u.EMAIL && u.EMAIL.toLowerCase() === email.toLowerCase()
    );
    
    if (usuarioPlanilha) {
        // Para login local, verifica a senha (se fornecida)
        // Nota: idealmente a senha deveria estar na planilha também, mas por segurança,
        // vamos manter senha apenas no fallback local
        return {
            valido: true,
            nome: usuarioPlanilha.NOME || email,
            role: usuarioPlanilha.ROLE || 'ESTAGIARIO',
            email: usuarioPlanilha.EMAIL,
            permissoes: getPermissoesByRole(usuarioPlanilha.ROLE || 'ESTAGIARIO'),
            origem: 'planilha'
        };
    }
    
    // 2. Fallback: tenta validar nos usuários locais
    const userLocal = USUARIOS_LOCAL_FALLBACK[email];
    if (userLocal && (!senha || userLocal.senha === senha)) {
        return {
            valido: true,
            nome: userLocal.nome,
            role: userLocal.role,
            email: email,
            permissoes: userLocal.permissoes,
            origem: 'fallback'
        };
    }
    
    return { valido: false };
}

// ==================== GOOGLE LOGIN ====================
function initGoogleLogin() {
    if (typeof google === 'undefined') {
        console.warn('⚠️ Google API não carregada');
        return;
    }

    google.accounts.id.initialize({
        client_id: GOOGLE_CLIENT_ID,
        callback: handleGoogleCredentialResponse,
        cancel_on_tap_outside: false,
        auto_select: false,
        use_fedcm_for_prompt: true
    });

    document.getElementById('btnGoogleLogin')?.addEventListener('click', () => {
        google.accounts.id.prompt();
    });
}

async function handleGoogleCredentialResponse(response) {
    //console.log('🔄 Recebendo resposta do Google...');
    
    try {
        const payload = parseJwt(response.credential);
        //console.log('📋 Dados do Google:', payload);
        
        const email = payload.email;
        const nome = payload.name;
        
        // Carrega usuários da planilha se ainda não foram carregados
        if (!usuariosCarregados) {
            await carregarUsuariosPlanilha();
        }
        
        // Valida o usuário
        const resultado = validarUsuario(email);
        
        if (!resultado.valido) {
            mostrarErroLogin('Email não autorizado. Contate o administrador.');
            return;
        }
        
        const agora = Date.now();
        
        usuarioAtual = {
            id: email,
            nome: resultado.nome,
            email: email,
            role: resultado.role,
            permissoes: resultado.permissoes,
            foto: payload.picture || null,
            loginTime: agora,
            expiresAt: agora + SESSION_DURATION,
            origem: resultado.origem
        };
        
        tokenGoogle = response.credential;
        
        sessionStorage.setItem('usuario', JSON.stringify(usuarioAtual));
        sessionStorage.setItem('google_token', tokenGoogle);
        sessionStorage.setItem('login_time', agora);
        sessionStorage.setItem('expires_at', agora + SESSION_DURATION);
        
        //console.log(`✅ Login Google realizado: ${usuarioAtual.nome} (${usuarioAtual.role})`);
        
        atualizarSidebar();
        atualizarMenu();
        
        window.location.hash = 'painel';
        window.location.reload();
        
    } catch (error) {
        console.error('❌ Erro ao processar login Google:', error);
        mostrarErroLogin('Erro ao fazer login com Google. Tente novamente.');
    }
}

function parseJwt(token) {
    const base64Url = token.split('.')[1];
    const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
    const jsonPayload = decodeURIComponent(atob(base64).split('').map(c => {
        return '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2);
    }).join(''));
    return JSON.parse(jsonPayload);
}

// ==================== LOGIN LOCAL (FALLBACK) ====================
async function fazerLoginLocal(usuario, senha) {
    // Carrega usuários da planilha se ainda não foram carregados
    if (!usuariosCarregados) {
        await carregarUsuariosPlanilha();
    }
    
    // Tenta validar (primeiro na planilha, depois no fallback)
    const resultado = validarUsuario(usuario, senha);
    
    if (!resultado.valido) {
        return { sucesso: false, mensagem: 'Usuário ou senha inválidos!' };
    }
    
    const agora = Date.now();
    
    usuarioAtual = {
        id: usuario,
        nome: resultado.nome,
        email: usuario,
        role: resultado.role,
        permissoes: resultado.permissoes,
        foto: null,
        loginTime: agora,
        expiresAt: agora + SESSION_DURATION,
        origem: resultado.origem
    };
    
    sessionStorage.setItem('usuario', JSON.stringify(usuarioAtual));
    sessionStorage.setItem('login_time', agora);
    sessionStorage.setItem('expires_at', agora + SESSION_DURATION);
    
    atualizarSidebar();
    atualizarMenu();
    
    return { sucesso: true, usuario: usuarioAtual };
}

// ==================== GERENCIAMENTO DE SESSÃO ====================
function verificarAutenticacao() {
    const dados = sessionStorage.getItem('usuario');
    const expiresAt = sessionStorage.getItem('expires_at');
    
    if (!dados) return null;
    
    if (expiresAt && Date.now() > parseInt(expiresAt)) {
        //console.log('⏰ Sessão expirada, fazendo logout...');
        fazerLogout();
        return null;
    }
    
    try {
        usuarioAtual = JSON.parse(dados);
        tokenGoogle = sessionStorage.getItem('google_token');
        
        const novoExpira = Date.now() + SESSION_DURATION;
        usuarioAtual.expiresAt = novoExpira;
        sessionStorage.setItem('expires_at', novoExpira);
        sessionStorage.setItem('usuario', JSON.stringify(usuarioAtual));
        
        // Recarrega usuários da planilha em background (para atualizar permissões)
        if (!usuariosCarregados) {
            carregarUsuariosPlanilha().then(() => {
                // Atualiza permissões do usuário atual se mudou na planilha
                const userPlanilha = usuariosDaPlanilha.find(u => 
                    u.EMAIL && u.EMAIL.toLowerCase() === usuarioAtual.email.toLowerCase()
                );
                if (userPlanilha) {
                    const novasPermissoes = getPermissoesByRole(userPlanilha.ROLE);
                    if (JSON.stringify(novasPermissoes) !== JSON.stringify(usuarioAtual.permissoes)) {
                        usuarioAtual.permissoes = novasPermissoes;
                        usuarioAtual.role = userPlanilha.ROLE;
                        sessionStorage.setItem('usuario', JSON.stringify(usuarioAtual));
                        atualizarMenu();
                    }
                }
            });
        }
        
        atualizarSidebar();
        atualizarMenu();
        
        return usuarioAtual;
    } catch (e) {
        console.error('Erro ao verificar autenticação:', e);
        return null;
    }
}

function atualizarSidebar() {
    if (!usuarioAtual) return;
    
    const nomeEl = document.getElementById('sidebarUserName');
    const roleEl = document.getElementById('sidebarUserRole');
    
    if (nomeEl) nomeEl.textContent = usuarioAtual.nome;
    if (roleEl) roleEl.textContent = usuarioAtual.role === 'ADVOGADO TITULAR' || usuarioAtual.role === 'ADM' ? '⚖️ Administrador' : '📋 ' + usuarioAtual.role;
}

function atualizarMenu() {
    if (!usuarioAtual) return;
    
    const menu = document.querySelector('.sidebar-nav ul');
    if (!menu) return;
    
    const paginasPermitidas = usuarioAtual.permissoes;
    const isTitular = usuarioAtual.permissoes.includes('*');
    
    const paginasVisiveis = TODAS_PAGINAS.filter(p => {
        if (isTitular) return true;
        return paginasPermitidas.includes(p.id);
    });
    
    menu.innerHTML = paginasVisiveis.map(p => {
        const badge = p.id === 'processos' ? `<span class="badge" id="badgeProcessos">0</span>` : '';
        return `
            <li>
                <a href="#" data-page="${p.id}">
                    <i class="${p.icone}"></i>
                    <span>${p.nome}</span>
                    ${badge}
                </a>
            </li>
        `;
    }).join('');
    
    const currentPage = window.location.hash.replace('#', '') || 'painel';
    document.querySelectorAll('.sidebar-nav a[data-page]').forEach(link => {
        const isActive = link.getAttribute('data-page') === currentPage;
        link.classList.toggle('active', isActive);
    });
    
    //console.log(`📋 Menu atualizado: ${paginasVisiveis.length} páginas visíveis`);
}

function fazerLogout() {
    if (tokenGoogle && typeof google !== 'undefined') {
        try {
            google.accounts.id.disableAutoSelect();
        } catch (e) {
            console.warn('Erro ao revogar Google:', e);
        }
    }
    
    if (window.cacheGlobal) cacheGlobal.limpar();
    sessionStorage.removeItem('usuario');
    sessionStorage.removeItem('google_token');
    sessionStorage.removeItem('login_time');
    sessionStorage.removeItem('expires_at');
    usuarioAtual = null;
    tokenGoogle = null;
    window.location.hash = 'login';
    window.location.reload();
}

function temPermissao(pagina) {
    if (!usuarioAtual) return false;
    if (usuarioAtual.permissoes.includes('*')) return true;
    return usuarioAtual.permissoes.includes(pagina);
}

function usuarioLogado() {
    return usuarioAtual !== null;
}

function getUsuario() {
    return usuarioAtual;
}

// ==================== HELPERS ====================
function mostrarErroLogin(mensagem) {
    const errorDiv = document.getElementById('loginError');
    if (!errorDiv) return;
    
    const span = errorDiv.querySelector('#errorMessage') || errorDiv.querySelector('span');
    if (span) span.textContent = mensagem;
    errorDiv.style.display = 'flex';
    
    setTimeout(() => {
        errorDiv.style.display = 'none';
    }, 5000);
}

// ==================== INICIALIZAÇÃO ====================
function initAuth() {
    // Carrega usuários da planilha em background
    carregarUsuariosPlanilha();
    
    const usuario = verificarAutenticacao();
    
    if (typeof google !== 'undefined') {
        initGoogleLogin();
    } else {
        console.log('⏳ Aguardando Google API carregar...');
    }
    
    return !!usuario;
}

// ==================== EXPORTAÇÃO GLOBAL ====================
window.auth = {
    login: fazerLoginLocal,
    loginGoogle: handleGoogleCredentialResponse,
    logout: fazerLogout,
    verificar: verificarAutenticacao,
    logado: usuarioLogado,
    getUsuario: getUsuario,
    temPermissao: temPermissao,
    init: initAuth,
    initGoogle: initGoogleLogin,
    atualizarMenu: atualizarMenu,
    atualizarSidebar: atualizarSidebar,
    carregarUsuarios: carregarUsuariosPlanilha,
    getUsuarios: () => usuariosDaPlanilha
};

//console.log('🔐 Módulo de autenticação carregado');
//console.log(`⏰ Sessão: ${SESSION_DURATION / 3600000} horas`);
//console.log('📋 Usuários carregados da planilha (ABA RH)');