
// ==================== CONFIGURAÇÃO ====================
const WEB_APP_URL = 'https://script.google.com/macros/s/AKfycbxpZpmW5PlSEh_4UJsaWJPn9W2vzryHUQlXGuaV7i9UF-wC9QcZl5Fict5xkuzVXv-N3g/exec';

const DEBUG = true;
const MAX_RETRIES = 3;
const RETRY_DELAY = 1500;

// ==================== CACHE ÚNICO ====================
// Esta é a ÚNICA camada de cache do sistema. O cache.js é apenas uma
// fachada (carregarComCache, cacheGlobal) em cima dela.
//  - TTL de 60s por aba
//  - Requisições simultâneas da mesma aba compartilham UMA só chamada
//  - Escrita (create/update/delete) invalida automaticamente só a aba afetada
//  - Falhas NUNCA são guardadas no cache
//  - Quem lê recebe uma CÓPIA, então um módulo que altera os objetos
//    não contamina os outros
const CACHE_TTL_MS = 60 * 1000;

const cache = {
    timeout: CACHE_TTL_MS,
    dados: {},       
    timestamps: {},  
    pendentes: {},   
    versoes: {},     
    geracao: 0,      

    get(chave) {
        if (!(chave in this.dados)) return undefined;
        if (Date.now() - this.timestamps[chave] > this.timeout) {
            delete this.dados[chave];
            delete this.timestamps[chave];
            return undefined;
        }
        return this.dados[chave];
    },

    set(chave, valor) {
        this.dados[chave] = valor;
        this.timestamps[chave] = Date.now();
    },

    versao(chave) {
        return this.geracao + ':' + (this.versoes[chave] || 0);
    },

    invalidar(chave) {
        const tinha = chave in this.dados;
        delete this.dados[chave];
        delete this.timestamps[chave];
        delete this.pendentes[chave];
        this.versoes[chave] = (this.versoes[chave] || 0) + 1;
        return tinha;
    },

    clear() {
        this.dados = {};
        this.timestamps = {};
        this.pendentes = {};
        this.geracao++;
    }
};

function clonar(valor) {
    return typeof structuredClone === 'function'
        ? structuredClone(valor)
        : JSON.parse(JSON.stringify(valor));
}

// ==================== LOGS ====================
function log(...args) {
    if (DEBUG) console.log('[API]', ...args);
}

function logError(...args) {
    console.error('[API ERROR]', ...args);
}

// ==================== UTILITÁRIOS ====================
function buildUrl(params = {}) {
    const url = new URL(WEB_APP_URL);
    params._t = Date.now();
    Object.keys(params).forEach(key => {
        if (params[key] !== undefined && params[key] !== null) {
            url.searchParams.append(key, params[key]);
        }
    });
    return url.toString();
}

function delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

// ==================== REQUISIÇÕES ====================

/**
 * GET com retry automático
 */
async function fetchGet(url, tentativas = MAX_RETRIES) {
    for (let i = 0; i < tentativas; i++) {
        try {
            log(`GET (${i + 1}/${tentativas})`, url.substring(0, 120) + '...');
            
            const response = await fetch(url, {
                method: 'GET',
                headers: { 'Accept': 'application/json' },
                mode: 'cors'
            });
            
            if (response.ok) {
                const data = await response.json();
                log('✅ Resposta:', Array.isArray(data) ? `Array(${data.length})` : typeof data);
                return data;
            }
            
            if ((response.status === 404 || response.status === 429) && i < tentativas - 1) {
                const wait = RETRY_DELAY * (i + 1);
                log(`⏳ Status ${response.status} — Aguardando ${wait}ms...`);
                await delay(wait);
                continue;
            }
            
            const errorText = await response.text();
            logError('Resposta do erro:', errorText.substring(0, 200));
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            
        } catch (error) {
            if (i === tentativas - 1) {
                logError('❌ Falha definitiva:', error.message);
                throw error;
            }
            const wait = RETRY_DELAY * (i + 1);
            log(`⏳ ${error.message} — Retry em ${wait}ms...`);
            await delay(wait);
        }
    }
}

/**
 * POST com retry automático
 */
async function fetchPost(body, tentativas = MAX_RETRIES) {
    for (let i = 0; i < tentativas; i++) {
        try {
            log(`POST (${i + 1}/${tentativas})`, { action: body.action, sheet: body.sheet });
            
            const response = await fetch(WEB_APP_URL, {
                method: 'POST',
                headers: { 'Content-Type': 'text/plain;charset=utf-8' },
                body: JSON.stringify(body),
                mode: 'cors'
            });
            
            if (response.ok) {
                const data = await response.json();
                log('✅ Criado/Atualizado:', data);
                // Invalida somente a aba afetada
                cache.invalidar(body.sheet);
                return data;
            }
            
            if ((response.status === 404 || response.status === 429) && i < tentativas - 1) {
                const wait = RETRY_DELAY * (i + 1);
                log(`⏳ Status ${response.status} — Aguardando ${wait}ms...`);
                await delay(wait);
                continue;
            }
            
            const errorText = await response.text();
            logError('Resposta do erro:', errorText.substring(0, 200));
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            
        } catch (error) {
            if (i === tentativas - 1) {
                logError('❌ Falha definitiva:', error.message);
                // A escrita pode ter chegado à planilha mesmo com erro de rede
                cache.invalidar(body.sheet);
                throw error;
            }
            const wait = RETRY_DELAY * (i + 1);
            log(`⏳ ${error.message} — Retry em ${wait}ms...`);
            await delay(wait);
        }
    }
}

// ==================== API PÚBLICA ====================

/**
 * Lista todos os registros de uma aba (com cache único + dedup)
 * @param {string} sheet 
 * @param {boolean} usarCache 
 * @returns {Promise<Array>} 
 */
async function apiList(sheet, usarCache = true) {
    if (usarCache) {
        const emCache = cache.get(sheet);
        if (emCache !== undefined) {
            log(`📦 ${sheet}: ${emCache.length} registros (cache)`);
            return clonar(emCache);
        }

        const pendente = cache.pendentes[sheet];
        if (pendente) {
            log(`⏳ ${sheet}: aguardando requisição já em andamento`);
            return clonar(await pendente);
        }
    }

    log(`📋 Listando ${sheet}...`);
    const versao = cache.versao(sheet);

    const promessa = fetchGet(buildUrl({ action: 'list', sheet }))
        .then(data => {
            if (!Array.isArray(data)) {
                throw new Error(`Resposta inválida para ${sheet}`);
            }
            // Só guarda se ninguém invalidou a aba enquanto a requisição rodava
            if (cache.versao(sheet) === versao) cache.set(sheet, data);
            log(`✅ ${sheet}: ${data.length} registros`);
            return data;
        })
        .finally(() => {
            if (cache.pendentes[sheet] === promessa) delete cache.pendentes[sheet];
        });

    cache.pendentes[sheet] = promessa;
    return clonar(await promessa);
}

/**
 * Obtém um registro específico
 */
async function apiGet(sheet, row) {
    log(`🔍 Obtendo ${sheet} linha ${row}...`);
    const url = buildUrl({ action: 'get', sheet, row });
    return await fetchGet(url);
}

/**
 * Cria um novo registro
 */
async function apiCreate(sheet, data) {
    log(`➕ Criando em ${sheet}:`, data);
    const result = await fetchPost({ action: 'create', sheet, data });
    return result;
}

/**
 * Atualiza um registro existente
 */
async function apiUpdate(sheet, row, data) {
    log(`✏️ Atualizando ${sheet} linha ${row}:`, data);
    const result = await fetchPost({ action: 'update', sheet, row, data });
    return result;
}

/**
 * Exclui um registro
 */
async function apiDelete(sheet, row) {
    log(`🗑️ Excluindo ${sheet} linha ${row}...`);
    const result = await fetchPost({ action: 'delete', sheet, row });
    return result;
}

/**
 * Lista todas as abas da planilha
 */
async function apiListSheets() {
    log('📊 Listando abas...');
    const url = buildUrl({ action: 'sheets' });
    return await fetchGet(url);
}

/**
 * Busca registros em qualquer aba
 * @param {string} sheet - Nome da aba
 * @param {string} campo - Campo para buscar
 * @param {string} valor - Valor a buscar
 */
async function apiSearch(sheet, campo, valor) {
    log(`🔍 Buscando em ${sheet} por ${campo}="${valor}"...`);
    const todos = await apiList(sheet);
    return todos.filter(item => 
        String(item[campo] || '').toLowerCase().includes(String(valor).toLowerCase())
    );
}

/**
 * Carrega múltiplas abas de uma vez
 * @param {string[]} sheets - Array com nomes das abas
 */
async function apiLoadAll(sheets) {
    log(`📥 Carregando ${sheets.length} abas...`);
    
    const resultados = {};
    
    for (const sheet of sheets) {
        try {
            await delay(300);
            resultados[sheet] = await apiList(sheet);
        } catch (error) {
            logError(`Erro ao carregar ${sheet}:`, error.message);
            resultados[sheet] = [];
        }
    }
    
    return resultados;
}

// ==================== INICIALIZAÇÃO ====================

/**
 * Testa a conexão com a API
 */
async function testarConexao() {
    log('🔌 Testando conexão...');
    
    try {
        const abas = await apiListSheets();
        //console.log('✅ Conectado! Abas disponíveis:', abas);
        //console.log(`   Total: ${abas.length} abas`);
        return { sucesso: true, abas };
    } catch (error) {
        console.error('❌ Falha na conexão:', error.message);
        //console.log('💡 Verifique:');
        //console.log('   1. URL do Web App está correta?');
        //console.log('   2. Deploy está como "Qualquer pessoa"?');
        //console.log('   3. Planilha está acessível?');
        return { sucesso: false, erro: error.message };
    }
}

/**
 * Inicializa a API e testa conexão
 */
async function inicializarAPI() {
    log('🚀 Inicializando API Tavares Advocacia...');
    
    const resultado = await testarConexao();
    
    if (resultado.sucesso) {
        log('✅ API pronta para uso!');
        log('📋 Abas encontradas:', resultado.abas.join(', '));
    } else {
        logError('⚠️ API iniciada com problemas de conexão');
    }
    
    return resultado;
}

// ==================== EXPORTAÇÃO GLOBAL ====================
window.apiCache = cache;
window.apiClonar = clonar;
window.api = {
    // CRUD básico
    list: apiList,
    get: apiGet,
    create: apiCreate,
    update: apiUpdate,
    delete: apiDelete,
    
    // Utilitários
    sheets: apiListSheets,
    search: apiSearch,
    loadAll: apiLoadAll,
    
    // Conexão
    testar: testarConexao,
    iniciar: inicializarAPI,
    
    // Cache
    limparCache: () => cache.clear(),
    invalidar: (aba) => cache.invalidar(aba),
    
    // Configuração
    config: {
        get url() { return WEB_APP_URL; },
        set url(novaUrl) { /* somente leitura */ }
    }
};

// ==================== AUTO-INICIALIZAÇÃO ====================
document.addEventListener('DOMContentLoaded', async () => {
    await inicializarAPI();
});

console.log('📋 API Tavares Advocacia v1.0 carregada!');
//console.log('💡 Comandos úteis:');
//console.log('   await api.testar()       — Testar conexão');
//console.log('   await api.list("ABA")    — Listar registros');
//console.log('   await api.loadAll([...]) — Carregar várias abas');
//console.log('   await api.search("ABA", "campo", "valor") — Buscar');
//console.log('   api.limparCache()        — Limpar cache');