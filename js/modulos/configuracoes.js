// ==================== ESTADO ====================
let usuariosConfig = [];
let configDadosCarregados = false;
let dadosEscritorio = {};
let preferenciasUsuario = {};
let definicoesConfig = {}; // { 'TIPO PROCESSO': [...], 'TIPO DE PRAZO': [...], ... }
let categoriasDefinicoes = [
    'TIPO PROCESSO',
    'TIPO DE PRAZO',
    'TIPO DE ACAO',
    'LOCAL DO PROCESSO',
    'TIPO DE BENEFICIO',
    'TIPO DE PERICIA',
    'LOCAL DA PERICIA'
];

// ==================== CHAVES DO LOCALSTORAGE (FALLBACK) ====================
const STORAGE_KEYS = {
    ESCRITORIO: 'tavares_dados_escritorio',
    PREFERENCIAS: 'tavares_preferencias',
    WEBAPP_URL: 'tavares_webapp_url',
    ULTIMA_SINC: 'tavares_ultima_sinc'
};

// ==================== INICIALIZAÇÃO ====================
async function inicializarConfiguracoes() {
    //console.log('⚙️ Inicializando configurações...');
    
    const usuario = auth.getUsuario();
    if (!usuario || (!usuario.permissoes.includes('*') && !usuario.permissoes.includes('configuracoes'))) {
        document.getElementById('pageContent').innerHTML = `
            <div class="empty-state" style="margin-top: 3rem;">
                <i class="fas fa-lock" style="font-size: 3rem; color: var(--warning);"></i>
                <h3>Acesso restrito</h3>
                <p>Você não tem permissão para acessar as configurações.</p>
                <button class="btn-primary" style="margin-top: 1rem;" onclick="navegarPara('painel')">
                    <i class="fas fa-home"></i> Voltar ao painel
                </button>
            </div>
        `;
        return;
    }
    
    await aguardarElementosConfig();
    await carregarDadosDaPlanilha();
    await carregarDefinicoes();
    carregarConfiguracoes();
    await carregarUsuariosConfig();
    initEventosConfig();
}

function aguardarElementosConfig() {
    return new Promise((resolve) => {
        const check = () => {
            if (document.getElementById('configNomeEscritorio')) {
                resolve();
            } else {
                setTimeout(check, 100);
            }
        };
        check();
    });
}

function initEventosConfig() {
    const urlSalva = localStorage.getItem(STORAGE_KEYS.WEBAPP_URL);
    if (urlSalva) {
        document.getElementById('configWebAppUrl').value = urlSalva;
    }
}

// ==================== FUNÇÃO ATUALIZAR STATUS CONEXÃO ====================
function atualizarStatusConexao(status) {
    const el = document.getElementById('statusConexao');
    if (!el) return;
    
    if (status === undefined) {
        el.textContent = 'Verificando...';
        el.className = 'status pending';
        return;
    }
    
    if (status) {
        el.textContent = 'Conectado';
        el.className = 'status completed';
    } else {
        el.textContent = 'Desconectado';
        el.className = 'status urgent';
    }
}

// ==================== CARREGAR DEFINIÇÕES ====================
async function carregarDefinicoes() {
    try {
        const dados = await carregarComCache('DEFINICOES').catch(() => []);
        //console.log('📋 Definições carregadas:', dados);
        
        // Inicializa as categorias
        categoriasDefinicoes.forEach(cat => {
            definicoesConfig[cat] = [];
        });
        
        // Popula os dados
        dados.forEach(item => {
            categoriasDefinicoes.forEach(cat => {
                if (item[cat] && item[cat].trim()) {
                    definicoesConfig[cat].push({
                        valor: item[cat].trim(),
                        _row: item._row
                    });
                }
            });
        });
        
        // Remove duplicatas (mantém a primeira ocorrência)
        categoriasDefinicoes.forEach(cat => {
            const seen = new Set();
            definicoesConfig[cat] = definicoesConfig[cat].filter(item => {
                const key = item.valor.toUpperCase();
                if (seen.has(key)) return false;
                seen.add(key);
                return true;
            });
        });
        
        //console.log('📋 Definições organizadas:', definicoesConfig);
        renderizarDefinicoes();
        
    } catch (error) {
        console.error('❌ Erro ao carregar definições:', error);
        definicoesConfig = {};
        categoriasDefinicoes.forEach(cat => {
            definicoesConfig[cat] = [];
        });
    }
}

// ==================== RENDERIZAR DEFINIÇÕES ====================
function renderizarDefinicoes() {
    const container = document.getElementById('definicoesAccordion');
    if (!container) return;
    
    let totalItens = 0;
    categoriasDefinicoes.forEach(cat => {
        totalItens += definicoesConfig[cat]?.length || 0;
    });
    document.getElementById('contagemDefinicoes').textContent = `${totalItens} itens`;
    
    container.innerHTML = categoriasDefinicoes.map(cat => {
        const itens = definicoesConfig[cat] || [];
        const count = itens.length;
        
        return `
            <div class="definicao-grupo">
                <div class="definicao-header" onclick="toggleDefinicaoGrupo('${cat}')">
                    <div class="titulo">
                        <i class="fas fa-folder-open"></i>
                        ${cat.replace('_', ' ')}
                        <span class="badge-count">${count}</span>
                    </div>
                    <div>
                        <span class="icone-seta" id="icone-${cat}">▼</span>
                    </div>
                </div>
                <div class="definicao-body" id="body-${cat}">
                    ${itens.length === 0 ? `
                        <div style="text-align: center; padding: 0.5rem; color: var(--text-faint); font-size: 0.85rem;">
                            <i class="fas fa-inbox"></i> Nenhuma opção cadastrada
                        </div>
                    ` : `
                        ${itens.map(item => `
                            <div class="definicao-item">
                                <span class="valor">${esc(item.valor)}</span>
                                <div class="acoes-definicao">
                                    <button class="btn-remover-definicao" onclick="abrirModalExcluirDefinicao('${cat}', '${esc(item.valor)}', ${item._row})" title="Remover">
                                        <i class="fas fa-trash-alt"></i>
                                    </button>
                                </div>
                            </div>
                        `).join('')}
                    `}
                    <button class="btn-adicionar-definicao" onclick="abrirModalAdicionarDefinicao('${cat}')">
                        <i class="fas fa-plus"></i> Adicionar nova opção
                    </button>
                </div>
            </div>
        `;
    }).join('');
}

// ==================== TOGGLE DEFINIÇÃO ====================
function toggleDefinicaoGrupo(categoria) {
    const body = document.getElementById(`body-${categoria}`);
    const icone = document.getElementById(`icone-${categoria}`);
    if (body) {
        body.classList.toggle('aberto');
        if (icone) {
            icone.classList.toggle('aberto');
        }
    }
}

// ==================== MODAL ADICIONAR DEFINIÇÃO ====================
function abrirModalAdicionarDefinicao(categoria) {
    const modal = document.getElementById('modalAdicionarDefinicao');
    const titulo = document.getElementById('modalDefinicaoTitulo');
    const label = document.getElementById('definicaoLabel');
    const input = document.getElementById('definicaoValor');
    const categoriaInput = document.getElementById('definicaoCategoria');
    const btnSalvar = document.querySelector('#modalAdicionarDefinicao .btn-salvar');
    
    // Reseta o botão
    btnSalvar.disabled = false;
    btnSalvar.innerHTML = '<i class="fas fa-plus"></i> Adicionar';
    
    titulo.textContent = `Adicionar ${categoria.replace('_', ' ')}`;
    label.textContent = `Nova opção para ${categoria.replace('_', ' ')}`;
    categoriaInput.value = categoria;
    input.value = '';
    input.placeholder = `Digite a nova opção...`;
    
    modal.classList.add('active');
    setTimeout(() => input.focus(), 100);
}

function fecharModalAdicionarDefinicao() {
    document.getElementById('modalAdicionarDefinicao').classList.remove('active');
    document.getElementById('definicaoValor').value = '';
}

// ==================== SALVAR NOVA DEFINIÇÃO (CORRIGIDO) ====================
async function salvarNovaDefinicao() {
    const categoria = document.getElementById('definicaoCategoria').value;
    const valor = document.getElementById('definicaoValor').value.trim();
    const btnSalvar = document.querySelector('#modalAdicionarDefinicao .btn-salvar');
    
    if (!valor) {
        notificar('Digite um valor válido!', 'warning');
        return;
    }
    
    // Verifica se já existe
    const existe = definicoesConfig[categoria]?.some(item => 
        item.valor.toUpperCase() === valor.toUpperCase()
    );
    
    if (existe) {
        notificar(`"${valor}" já existe em ${categoria.replace('_', ' ')}!`, 'warning');
        return;
    }
    
    // Desabilita o botão para evitar múltiplos cliques
    btnSalvar.disabled = true;
    btnSalvar.innerHTML = '<i class="fas fa-spinner fa-pulse"></i> Salvando...';
    
    try {
        // 1. Busca TODOS os registros da aba DEFINICOES
        const todosRegistros = await carregarComCache('DEFINICOES').catch(() => []);
        //console.log('📋 Registros existentes:', todosRegistros);
        
        // 2. Procura a primeira linha vazia (que não tem nenhum valor nas colunas)
        let linhaVazia = null;
        let linhaExistente = null;
        
        // Primeiro, verifica se já existe um registro com esta categoria vazia
        for (const registro of todosRegistros) {
            // Verifica se todas as colunas estão vazias
            const temValor = categoriasDefinicoes.some(cat => {
                return registro[cat] && registro[cat].trim() !== '';
            });
            
            if (!temValor) {
                linhaVazia = registro;
                break;
            }
            
            // Verifica se já existe um registro com esta categoria preenchida (para atualizar)
            if (registro[categoria] && registro[categoria].trim() !== '') {
                linhaExistente = registro;
            }
        }
        
        let result;
        
        if (linhaVazia) {
            // Se encontrou uma linha vazia, atualiza ela
            const dadosAtualizados = { ...linhaVazia };
            dadosAtualizados[categoria] = valor;
            
            // Remove _row para enviar
            const { _row, ...dadosParaEnviar } = dadosAtualizados;
            
            result = await apiUpdate('DEFINICOES', linhaVazia._row, dadosParaEnviar);
            //console.log('✅ Definição adicionada na linha vazia:', linhaVazia._row);
        } else if (linhaExistente) {
            // Se já existe um registro com esta categoria, adiciona uma nova linha
            const dados = {};
            dados[categoria] = valor;
            result = await apiCreate('DEFINICOES', dados);
            //console.log('✅ Definição criada em nova linha');
        } else {
            // Caso contrário, cria um novo registro
            const dados = {};
            dados[categoria] = valor;
            result = await apiCreate('DEFINICOES', dados);
            //console.log('✅ Definição criada em nova linha');
        }
        
        notificar(`"${valor}" adicionado com sucesso!`, 'success');
        fecharModalAdicionarDefinicao();
        await carregarDefinicoes();
        
    } catch (error) {
        console.error('❌ Erro ao adicionar definição:', error);
        notificar('Erro ao adicionar: ' + error.message, 'error');
    } finally {
        // Reabilita o botão
        btnSalvar.disabled = false;
        btnSalvar.innerHTML = '<i class="fas fa-plus"></i> Adicionar';
    }
}

// ==================== MODAL EXCLUIR DEFINIÇÃO ====================
function abrirModalExcluirDefinicao(categoria, valor, row) {
    const modal = document.getElementById('modalConfirmarExclusaoDefinicao');
    document.getElementById('definicaoExcluirValor').textContent = valor;
    document.getElementById('definicaoExcluirCategoria').value = categoria;
    document.getElementById('definicaoExcluirRow').value = row;
    modal.classList.add('active');
}

function fecharModalConfirmarExclusaoDefinicao() {
    document.getElementById('modalConfirmarExclusaoDefinicao').classList.remove('active');
}

// ==================== CONFIRMAR EXCLUIR DEFINIÇÃO ====================
async function confirmarExcluirDefinicao() {
    const categoria = document.getElementById('definicaoExcluirCategoria').value;
    const valor = document.getElementById('definicaoExcluirValor').textContent;
    const row = parseInt(document.getElementById('definicaoExcluirRow').value);
    const btnExcluir = document.querySelector('#modalConfirmarExclusaoDefinicao .btn-danger');
    
    // Desabilita o botão para evitar múltiplos cliques
    btnExcluir.disabled = true;
    btnExcluir.innerHTML = '<i class="fas fa-spinner fa-pulse"></i> Excluindo...';
    
    try {
        await apiDelete('DEFINICOES', row);
        //console.log(`🗑️ Definição "${valor}" removida`);
        
        notificar(`"${valor}" removido com sucesso!`, 'success');
        fecharModalConfirmarExclusaoDefinicao();
        await carregarDefinicoes();
        
    } catch (error) {
        console.error('❌ Erro ao excluir definição:', error);
        notificar('Erro ao excluir: ' + error.message, 'error');
    } finally {
        btnExcluir.disabled = false;
        btnExcluir.innerHTML = '<i class="fas fa-trash-alt"></i> Excluir';
    }
}

// ==================== SINCRONIZAR DEFINIÇÕES ====================
async function sincronizarDefinicoes() {
    notificar('Sincronizando definições...', 'info');
    await carregarDefinicoes();
    notificar('Definições sincronizadas!', 'success');
}

// ==================== CARREGAR DADOS DA PLANILHA ====================
async function carregarDadosDaPlanilha() {
    try {
        //console.log('📥 Carregando configurações da planilha...');
        
        const escritorioData = await carregarComCache('CONFIG_ESCRITORIO').catch(() => []);
        //console.log('📋 Dados brutos CONFIG_ESCRITORIO:', escritorioData);
        
        if (escritorioData && escritorioData.length > 0) {
            const data = escritorioData[0];
            dadosEscritorio = {
                nome: data.NOME || data.nome || '',
                oab: data.OAB || data.oab || '',
                cnpj: data.CNPJ || data.cnpj || '',
                telefone: data.TELEFONE || data.telefone || '',
                email: data.EMAIL || data.email || '',
                endereco: data.ENDERECO || data.endereco || '',
                cidade: data.CIDADE || data.cidade || '',
                estado: data.ESTADO || data.estado || '',
                site: data.SITE || data.site || '',
                _row: data._row
            };
            //console.log('✅ Dados do escritório carregados da planilha:', dadosEscritorio);
        } else {
            //console.log('📋 Nenhum dado encontrado em CONFIG_ESCRITORIO, usando fallback');
            const local = JSON.parse(localStorage.getItem(STORAGE_KEYS.ESCRITORIO) || '{}');
            if (local.nome) {
                dadosEscritorio = local;
                //console.log('📋 Dados do escritório carregados do localStorage (fallback)');
            }
        }
        
        const usuario = auth.getUsuario();
        //console.log('👤 Usuário atual:', usuario);
        
        if (usuario && usuario.email) {
            const prefData = await carregarComCache('CONFIG_PREFERENCIAS').catch(() => []);
            //console.log('📋 Dados brutos CONFIG_PREFERENCIAS:', prefData);
            
            const userPref = prefData.find(p => p.USUARIO === usuario.email || p.usuario === usuario.email);
            //console.log('📋 Preferência do usuário encontrada:', userPref);
            
            if (userPref) {
                preferenciasUsuario = {
                    temaEscuro: userPref.TEMA_ESCURO === 'SIM' || userPref.tema_escuro === 'SIM',
                    notificacoes: userPref.NOTIFICACOES === 'SIM' || userPref.notificacoes === 'SIM',
                    itensPagina: userPref.ITENS_PAGINA || userPref.itens_pagina || '25',
                    autoRefresh: userPref.AUTO_REFRESH || userPref.auto_refresh || '5',
                    _row: userPref._row
                };
                //console.log('✅ Preferências do usuário carregadas da planilha:', preferenciasUsuario);
            } else {
                //console.log('📋 Nenhuma preferência encontrada para o usuário, usando fallback');
                const local = JSON.parse(localStorage.getItem(STORAGE_KEYS.PREFERENCIAS) || '{}');
                preferenciasUsuario = {
                    temaEscuro: local.temaEscuro || false,
                    notificacoes: local.notificacoes !== undefined ? local.notificacoes : true,
                    itensPagina: local.itensPagina || '25',
                    autoRefresh: local.autoRefresh || '5'
                };
                //console.log('📋 Preferências carregadas do localStorage (fallback)');
            }
        }
        
    } catch (error) {
        console.error('❌ Erro ao carregar dados da planilha:', error);
        const localEscritorio = JSON.parse(localStorage.getItem(STORAGE_KEYS.ESCRITORIO) || '{}');
        if (localEscritorio.nome) dadosEscritorio = localEscritorio;
        
        const localPref = JSON.parse(localStorage.getItem(STORAGE_KEYS.PREFERENCIAS) || '{}');
        preferenciasUsuario = {
            temaEscuro: localPref.temaEscuro || false,
            notificacoes: localPref.notificacoes !== undefined ? localPref.notificacoes : true,
            itensPagina: localPref.itensPagina || '25',
            autoRefresh: localPref.autoRefresh || '5'
        };
    }
}

function carregarConfiguracoes() {
    //console.log('📋 Carregando configurações na tela...');
    //console.log('📋 dadosEscritorio:', dadosEscritorio);
    //console.log('📋 preferenciasUsuario:', preferenciasUsuario);
    
    document.getElementById('configNomeEscritorio').value = dadosEscritorio.nome || '';
    document.getElementById('configOAB').value = dadosEscritorio.oab || '';
    document.getElementById('configCNPJ').value = dadosEscritorio.cnpj || '';
    document.getElementById('configTelefone').value = dadosEscritorio.telefone || '';
    document.getElementById('configEmail').value = dadosEscritorio.email || '';
    document.getElementById('configEndereco').value = dadosEscritorio.endereco || '';
    document.getElementById('configCidade').value = dadosEscritorio.cidade || '';
    document.getElementById('configEstado').value = dadosEscritorio.estado || '';
    document.getElementById('configSite').value = dadosEscritorio.site || '';
    
    if (preferenciasUsuario.temaEscuro) {
        document.getElementById('configTemaEscuro').checked = true;
        document.body.classList.add('tema-escuro');
    }
    
    if (preferenciasUsuario.notificacoes !== undefined) {
        document.getElementById('configNotificacoes').checked = preferenciasUsuario.notificacoes;
    }
    
    if (preferenciasUsuario.itensPagina) {
        document.getElementById('configItensPagina').value = preferenciasUsuario.itensPagina;
    }
    
    if (preferenciasUsuario.autoRefresh) {
        document.getElementById('configAutoRefresh').value = preferenciasUsuario.autoRefresh;
    }
    
    const ultimaSinc = localStorage.getItem(STORAGE_KEYS.ULTIMA_SINC);
    if (ultimaSinc) {
        document.getElementById('configUltimaSinc').textContent = ultimaSinc;
    }
    
    atualizarStatusConexao();
}

// ==================== USUÁRIOS ====================
async function carregarUsuariosConfig() {
    const container = document.getElementById('usuariosLista');
    if (!container) return;
    
    try {
        //console.log('📥 Carregando usuários da planilha (ABA RH)...');
        
        container.innerHTML = `
            <div style="text-align: center; padding: 2rem; color: var(--text-faint);">
                <i class="fas fa-spinner fa-pulse" style="font-size: 1.5rem; margin-bottom: 0.5rem; display: block;"></i>
                Carregando usuários...
            </div>
        `;
        
        let usuarios = [];
        
        if (typeof auth !== 'undefined' && auth.getUsuarios) {
            usuarios = auth.getUsuarios();
            //console.log(`📋 ${usuarios.length} usuários do auth`);
        }
        
        if (!usuarios || usuarios.length === 0) {
            //console.log('📥 Buscando da API...');
            const dados = await carregarComCache('RH').catch(() => {
                console.warn('⚠️ Aba RH não encontrada');
                return [];
            });
            
            usuarios = dados.filter(u => u.EMAIL && u.EMAIL.trim() !== '');
            //console.log(`📋 ${usuarios.length} usuários da API`);
        }
        
        usuariosConfig = usuarios;
        configDadosCarregados = true;
        
        renderizarUsuarios();
        
    } catch (error) {
        console.error('❌ Erro ao carregar usuários:', error);
        container.innerHTML = `
            <div style="text-align: center; padding: 2rem; color: var(--danger);">
                <i class="fas fa-exclamation-circle" style="font-size: 1.5rem; margin-bottom: 0.5rem; display: block;"></i>
                <p>Erro ao carregar usuários</p>
                <small style="color: var(--text-muted);">${error.message || 'Tente novamente'}</small>
                <br><button class="btn-primary" style="margin-top: 0.5rem; padding: 0.3rem 1rem; font-size: 0.8rem;" onclick="carregarUsuariosConfig()">
                    <i class="fas fa-sync-alt"></i> Tentar novamente
                </button>
            </div>
        `;
    }
}

function renderizarUsuarios() {
    const container = document.getElementById('usuariosLista');
    if (!container) return;
    
    if (!usuariosConfig || usuariosConfig.length === 0) {
        container.innerHTML = `
            <div style="text-align: center; padding: 2rem; color: var(--text-faint);">
                <i class="fas fa-users" style="font-size: 1.5rem; margin-bottom: 0.5rem; display: block;"></i>
                Nenhum usuário cadastrado na planilha
                <br><small style="color: var(--text-faint);">Adicione na aba RH da planilha</small>
                <br><small style="color: var(--text-faint); font-size: 0.7rem;">Colunas: NOME, ROLE, CONTATO, EMAIL, CIDADE, STATUS</small>
            </div>
        `;
        return;
    }
    
    const ativos = usuariosConfig.filter(u => u.STATUS && u.STATUS.toUpperCase() === 'ATIVO');
    const inativos = usuariosConfig.filter(u => u.STATUS && u.STATUS.toUpperCase() === 'INATIVO');
    const semStatus = usuariosConfig.filter(u => !u.STATUS || u.STATUS.trim() === '');
    const ordenados = [...ativos, ...semStatus, ...inativos];
    
    document.getElementById('contagemUsuarios').textContent = `${ativos.length} ativos · ${usuariosConfig.length} total`;
    
    container.innerHTML = ordenados.map(u => {
        const isAtivo = u.STATUS && u.STATUS.toUpperCase() === 'ATIVO';
        const role = u.ROLE || 'ESTAGIARIO';
        const roleLabel = getRoleLabel(role);
        const statusClass = isAtivo ? 'completed' : (u.STATUS && u.STATUS.toUpperCase() === 'INATIVO' ? 'pending' : 'active');
        const statusLabel = isAtivo ? 'Ativo' : (u.STATUS && u.STATUS.toUpperCase() === 'INATIVO' ? 'Inativo' : 'Sem status');
        
        return `
            <div class="usuario-item ${!isAtivo ? 'inativo' : ''}">
                <div class="avatar-small" style="background: linear-gradient(135deg, var(--navy-800), var(--navy-700));">
                    <i class="fas fa-user"></i>
                </div>
                <div class="usuario-info">
                    <strong>${esc(u.NOME || u.EMAIL || 'Sem nome')}</strong>
                    <span>${esc(u.EMAIL || 'Sem email')}</span>
                    ${u.CIDADE ? `<small style="color: var(--text-faint);">📍 ${esc(u.CIDADE)}</small>` : ''}
                    ${u.CONTATO ? `<small style="color: var(--text-faint); margin-left: 0.5rem;">📞 ${esc(u.CONTATO)}</small>` : ''}
                </div>
                <div style="display: flex; gap: 0.3rem; align-items: center; flex-wrap: wrap;">
                    <span class="badge-tipo ${role === 'ADVOGADO TITULAR' || role === 'ADM' ? 'pj' : 'pf'}">${roleLabel}</span>
                    <span class="status ${statusClass}" style="font-size: 0.65rem;">${statusLabel}</span>
                    <button class="btn-icon-small" onclick="toggleStatusUsuario('${u.EMAIL}')" title="${isAtivo ? 'Inativar' : 'Ativar'}">
                        <i class="fas ${isAtivo ? 'fa-pause' : 'fa-play'}"></i>
                    </button>
                </div>
            </div>
        `;
    }).join('');
}

function getRoleLabel(role) {
    const labels = {
        'ADM': 'Admin',
        'ADVOGADO TITULAR': 'Titular',
        'ADVOGADO': 'Advogado',
        'ESTAGIARIO': 'Estagiário',
        'SECRETARIA': 'Secretaria',
        'PARCEIRO': 'Parceiro'
    };
    return labels[role] || role;
}

async function toggleStatusUsuario(email) {
    if (!email) {
        notificar('Email inválido', 'error');
        return;
    }
    
    if (!confirm(`Deseja alterar o status do usuário ${email}?`)) return;
    
    try {
        const usuario = usuariosConfig.find(u => u.EMAIL === email);
        if (!usuario) {
            notificar('Usuário não encontrado', 'error');
            return;
        }
        
        const novoStatus = usuario.STATUS === 'ATIVO' ? 'INATIVO' : 'ATIVO';
        
        await apiUpdate('RH', usuario._row, { STATUS: novoStatus });
        
        notificar(`Usuário ${novoStatus === 'ATIVO' ? 'ativado' : 'inativado'}!`, 'success');
        
        await carregarUsuariosConfig();
        
        if (typeof auth !== 'undefined' && auth.carregarUsuarios) {
            auth.carregarUsuarios();
        }
        
    } catch (error) {
        console.error('❌ Erro ao alterar status:', error);
        notificar('Erro ao alterar status: ' + error.message, 'error');
    }
}

// ==================== ESCRITÓRIO ====================
async function salvarConfigEscritorio() {
    const dados = {
        NOME: document.getElementById('configNomeEscritorio')?.value || '',
        OAB: document.getElementById('configOAB')?.value || '',
        CNPJ: document.getElementById('configCNPJ')?.value || '',
        TELEFONE: document.getElementById('configTelefone')?.value || '',
        EMAIL: document.getElementById('configEmail')?.value || '',
        ENDERECO: document.getElementById('configEndereco')?.value || '',
        CIDADE: document.getElementById('configCidade')?.value || '',
        ESTADO: document.getElementById('configEstado')?.value || '',
        SITE: document.getElementById('configSite')?.value || ''
    };
    
    //console.log('📝 Salvando dados do escritório:', dados);
    
    try {
        if (dadosEscritorio._row) {
            await apiUpdate('CONFIG_ESCRITORIO', dadosEscritorio._row, dados);
            //console.log('✅ Dados do escritório atualizados na planilha');
        } else {
            const result = await apiCreate('CONFIG_ESCRITORIO', dados);
            dadosEscritorio._row = result._row;
            //console.log('✅ Dados do escritório criados na planilha');
        }
        
        dadosEscritorio = {
            nome: dados.NOME,
            oab: dados.OAB,
            cnpj: dados.CNPJ,
            telefone: dados.TELEFONE,
            email: dados.EMAIL,
            endereco: dados.ENDERECO,
            cidade: dados.CIDADE,
            estado: dados.ESTADO,
            site: dados.SITE,
            _row: dadosEscritorio._row
        };
        
        localStorage.setItem(STORAGE_KEYS.ESCRITORIO, JSON.stringify(dadosEscritorio));
        notificar('Dados do escritório salvos com sucesso!', 'success');
        
    } catch (error) {
        console.error('❌ Erro ao salvar dados do escritório:', error);
        localStorage.setItem(STORAGE_KEYS.ESCRITORIO, JSON.stringify(dados));
        notificar('Dados salvos localmente (fallback).', 'warning');
    }
}

// ==================== CONEXÃO ====================
async function testarConexaoConfig() {
    const url = document.getElementById('configWebAppUrl')?.value?.trim();
    
    if (url) {
        localStorage.setItem(STORAGE_KEYS.WEBAPP_URL, url);
    }
    
    notificar('Testando conexão...', 'info');
    
    try {
        if (typeof testarConexao === 'function') {
            const ok = await testarConexao();
            if (ok) {
                atualizarStatusConexao(true);
                notificar('Conexão estabelecida!', 'success');
            } else {
                atualizarStatusConexao(false);
                notificar('Falha na conexão', 'error');
            }
        }
    } catch (error) {
        atualizarStatusConexao(false);
        notificar('Erro: ' + error.message, 'error');
    }
}

async function sincronizarAgora() {
    notificar('Sincronizando...', 'info');
    document.getElementById('configUltimaSinc').textContent = 'Sincronizando...';
    
    try {
        if (typeof apiListSheets === 'function') {
            const abas = await apiListSheets();
            document.getElementById('configTotalAbas').textContent = abas.length;
        }
        
        await carregarDadosDaPlanilha();
        await carregarDefinicoes();
        carregarConfiguracoes();
        await carregarUsuariosConfig();
        
        const agora = new Date().toLocaleString('pt-BR');
        document.getElementById('configUltimaSinc').textContent = agora;
        localStorage.setItem(STORAGE_KEYS.ULTIMA_SINC, agora);
        
        notificar('Sincronização concluída!', 'success');
    } catch (error) {
        document.getElementById('configUltimaSinc').textContent = 'Falhou';
        notificar('Erro na sincronização', 'error');
    }
}

// ==================== PREFERÊNCIAS ====================
function toggleTema() {
    const checked = document.getElementById('configTemaEscuro')?.checked;
    if (checked) {
        document.body.classList.add('tema-escuro');
    } else {
        document.body.classList.remove('tema-escuro');
    }
    salvarPreferencias();
}

async function salvarPreferencias() {
    const usuario = auth.getUsuario();
    if (!usuario || !usuario.email) {
        notificar('Usuário não identificado', 'error');
        return;
    }
    
    const dados = {
        USUARIO: usuario.email,
        TEMA_ESCURO: document.getElementById('configTemaEscuro')?.checked ? 'SIM' : 'NAO',
        NOTIFICACOES: document.getElementById('configNotificacoes')?.checked ? 'SIM' : 'NAO',
        ITENS_PAGINA: document.getElementById('configItensPagina')?.value || '25',
        AUTO_REFRESH: document.getElementById('configAutoRefresh')?.value || '5'
    };
    
    //console.log('📝 Salvando preferências:', dados);
    
    try {
        if (preferenciasUsuario._row) {
            await apiUpdate('CONFIG_PREFERENCIAS', preferenciasUsuario._row, dados);
            //console.log('✅ Preferências atualizadas na planilha');
        } else {
            const result = await apiCreate('CONFIG_PREFERENCIAS', dados);
            preferenciasUsuario._row = result._row;
            //console.log('✅ Preferências criadas na planilha');
        }
        
        preferenciasUsuario = {
            temaEscuro: dados.TEMA_ESCURO === 'SIM',
            notificacoes: dados.NOTIFICACOES === 'SIM',
            itensPagina: dados.ITENS_PAGINA,
            autoRefresh: dados.AUTO_REFRESH,
            _row: preferenciasUsuario._row
        };
        
        const localPref = {
            temaEscuro: dados.TEMA_ESCURO === 'SIM',
            notificacoes: dados.NOTIFICACOES === 'SIM',
            itensPagina: dados.ITENS_PAGINA,
            autoRefresh: dados.AUTO_REFRESH
        };
        localStorage.setItem(STORAGE_KEYS.PREFERENCIAS, JSON.stringify(localPref));
        
        configurarAutoRefresh(parseInt(dados.AUTO_REFRESH));
        
        notificar('Preferências salvas com sucesso!', 'success');
        
    } catch (error) {
        console.error('❌ Erro ao salvar preferências:', error);
        const localPref = {
            temaEscuro: dados.TEMA_ESCURO === 'SIM',
            notificacoes: dados.NOTIFICACOES === 'SIM',
            itensPagina: dados.ITENS_PAGINA,
            autoRefresh: dados.AUTO_REFRESH
        };
        localStorage.setItem(STORAGE_KEYS.PREFERENCIAS, JSON.stringify(localPref));
        notificar('Preferências salvas localmente (fallback).', 'warning');
    }
}

function configurarAutoRefresh(minutos) {
    if (window._autoRefreshTimer) {
        clearInterval(window._autoRefreshTimer);
        window._autoRefreshTimer = null;
    }
    
    if (minutos > 0) {
        window._autoRefreshTimer = setInterval(() => {
            //console.log('🔄 Auto refresh automático...');
            if (typeof window.app?.recarregar === 'function') {
                window.app.recarregar();
            }
        }, minutos * 60 * 1000);
        
        //console.log(`⏰ Auto refresh configurado para ${minutos} minutos`);
    } else {
        //console.log('⏰ Auto refresh desligado');
    }
}

// ==================== BACKUP ====================
function fazerBackup() {
    notificar('Redirecionando para planilha...', 'info');
    setTimeout(() => {
        window.open('https://docs.google.com/spreadsheets/d/18f9QUOg3Wjc_2OCTncFC-uAL0gTCqWoeUdzUPJkxyLo/edit?usp=sharing', '_blank');
    }, 500);
}

// ==================== EXPORTAÇÕES GLOBAIS ====================
window.inicializarConfiguracoes = inicializarConfiguracoes;
window.carregarUsuariosConfig = carregarUsuariosConfig;
window.toggleStatusUsuario = toggleStatusUsuario;
window.salvarConfigEscritorio = salvarConfigEscritorio;
window.testarConexaoConfig = testarConexaoConfig;
window.sincronizarAgora = sincronizarAgora;
window.toggleTema = toggleTema;
window.salvarPreferencias = salvarPreferencias;
window.fazerBackup = fazerBackup;

// Definições
window.toggleDefinicaoGrupo = toggleDefinicaoGrupo;
window.abrirModalAdicionarDefinicao = abrirModalAdicionarDefinicao;
window.fecharModalAdicionarDefinicao = fecharModalAdicionarDefinicao;
window.salvarNovaDefinicao = salvarNovaDefinicao;
window.abrirModalExcluirDefinicao = abrirModalExcluirDefinicao;
window.fecharModalConfirmarExclusaoDefinicao = fecharModalConfirmarExclusaoDefinicao;
window.confirmarExcluirDefinicao = confirmarExcluirDefinicao;
window.sincronizarDefinicoes = sincronizarDefinicoes;

//console.log('📋 Módulo configurações carregado (com sincronização na planilha e gestão de definições)');