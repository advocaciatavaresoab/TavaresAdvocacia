
function inicializarLogin() {
    //console.log('🔐 Inicializando página de login...');
    
    const form = document.getElementById('formLogin');
    const usuarioInput = document.getElementById('loginUsuario');
    const senhaInput = document.getElementById('loginSenha');
    const btnLogin = form?.querySelector('.btn-login');
    const errorDiv = document.getElementById('loginError');
    
    if (!form) return;
    
    // Se já estiver logado, redireciona para o painel
    if (auth.logado()) {
        window.location.hash = 'painel';
        window.location.reload();
        return;
    }
    
    // === ESCONDE OS ITENS DO MENU ===
    const menuNav = document.querySelector('.sidebar-nav ul');
    const btnLogout = document.querySelector('.btn-logout');
    const buscaGlobal = document.querySelector('.search-bar');

    if (menuNav) {
        menuNav.style.display = 'none';
        btnLogout.style.display = 'none';
        buscaGlobal.style.display = 'none';
    }
    
    // Adiciona mensagem no lugar do menu
    const sidebarNav = document.querySelector('.sidebar-nav');
    if (sidebarNav) {
        // Remove mensagem antiga se existir
        const oldMsg = sidebarNav.querySelector('.login-menu-message');
        if (oldMsg) oldMsg.remove();
        
        // Cria nova mensagem
        const msg = document.createElement('div');
        msg.className = 'login-menu-message';
        msg.innerHTML = `
            <div style="display: flex; flex-direction: column; align-items: center; gap: 0.5rem; padding: 1.5rem 1rem; color: rgba(255,255,255,0.25);">
                <i class="fas fa-lock" style="font-size: 1.5rem; color: rgba(201, 162, 76, 0.3);"></i>
                <span style="font-size: 0.8rem; text-align: center;">Faça login para acessar o sistema</span>
            </div>
        `;
        sidebarNav.style.display = 'flex';
        sidebarNav.style.alignItems = 'center';
        sidebarNav.style.justifyContent = 'center';
        sidebarNav.style.minHeight = '300px';
        sidebarNav.appendChild(msg);
    }
    
    // === INICIALIZA LOGIN COM GOOGLE ===
    if (typeof google !== 'undefined' && document.getElementById('btnGoogleLogin')) {
        auth.initGoogle();
    }
    
    // === EVENTO DE SUBMIT DO FORMULÁRIO ===
    form.addEventListener('submit', function(e) {
        e.preventDefault();
        
        const usuario = usuarioInput.value.trim();
        const senha = senhaInput.value;
        
        // Valida campos
        if (!usuario || !senha) {
            mostrarErro('Preencha usuário e senha!');
            return;
        }
        
        // Desabilita botão durante o login
        if (btnLogin) {
            btnLogin.disabled = true;
            btnLogin.innerHTML = '<i class="fas fa-spinner fa-pulse"></i> Entrando...';
        }
        
        // Tenta fazer login local
        const resultado = auth.login(usuario, senha);
        
        if (resultado.sucesso) {
            //console.log(`✅ Login realizado: ${resultado.usuario.nome} (${resultado.usuario.role})`);
            
            // Restaura o menu antes de recarregar
            restaurarMenu();
            
            window.location.hash = 'painel';
            window.location.reload();
        } else {
            mostrarErro(resultado.mensagem || 'Usuário ou senha inválidos!');
            
            // Reabilita o botão
            if (btnLogin) {
                btnLogin.disabled = false;
                btnLogin.innerHTML = '<i class="fas fa-sign-in-alt"></i> Entrar';
            }
            
            // Limpa o campo de senha
            senhaInput.value = '';
            senhaInput.focus();
        }
    });
    
    // === ENTER NO CAMPO SENHA DISPARA SUBMIT ===
    senhaInput?.addEventListener('keydown', function(e) {
        if (e.key === 'Enter') {
            form.dispatchEvent(new Event('submit'));
        }
    });
    
    // === ENTER NO CAMPO USUÁRIO VAI PARA SENHA ===
    usuarioInput?.addEventListener('keydown', function(e) {
        if (e.key === 'Enter') {
            e.preventDefault();
            senhaInput?.focus();
        }
    });
}

/**
 * Mostra mensagem de erro no login
 */
function mostrarErro(mensagem) {
    const errorDiv = document.getElementById('loginError');
    if (!errorDiv) return;
    
    const span = errorDiv.querySelector('#errorMessage') || errorDiv.querySelector('span');
    if (span) span.textContent = mensagem;
    
    errorDiv.style.display = 'flex';
    errorDiv.style.animation = 'none';
    
    // Força reflow para reiniciar animação
    void errorDiv.offsetHeight;
    errorDiv.style.animation = 'shake 0.4s ease';
    
    // Esconde após 5 segundos
    clearTimeout(window.loginErrorTimeout);
    window.loginErrorTimeout = setTimeout(() => {
        errorDiv.style.display = 'none';
    }, 5000);
}

/**
 * Restaura o menu lateral (chamado após login)
 */
function restaurarMenu() {
    const menuNav = document.querySelector('.sidebar-nav ul');
    if (menuNav) {
        menuNav.style.display = '';
    }
    
    const sidebarNav = document.querySelector('.sidebar-nav');
    if (sidebarNav) {
        const msg = sidebarNav.querySelector('.login-menu-message');
        if (msg) msg.remove();
        sidebarNav.style.display = '';
        sidebarNav.style.alignItems = '';
        sidebarNav.style.justifyContent = '';
        sidebarNav.style.minHeight = '';
    }
}

// ==================== EXPORTAÇÃO GLOBAL ====================
window.inicializarLogin = inicializarLogin;
window.mostrarErroLogin = mostrarErro;

//console.log('🔐 Módulo login carregado');