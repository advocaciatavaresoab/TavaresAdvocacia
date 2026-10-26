// ==================== OBJETO DE CONTROLE ====================
const cacheGlobal = {
    /** Valor em cache (ou undefined se não existir/expirou). */
    obter(aba) {
        const valor = apiCache.get(aba);
        return valor === undefined ? undefined : apiClonar(valor);
    },

    /** Guarda um valor manualmente (raramente necessário). */
    guardar(aba, valor) {
        apiCache.set(aba, apiClonar(valor));
    },

    /** Invalida uma aba (será recarregada na próxima chamada). */
    invalidar(aba) {
        if (apiCache.invalidar(aba)) console.log(`🗑️ [cache] ${aba} invalidado`);
    },

    /** Invalida várias abas de uma vez. */
    invalidarVarias(abas) {
        abas.forEach(aba => this.invalidar(aba));
    },

    /** Limpa todo o cache. */
    limpar() {
        apiCache.clear();
        //console.log('🗑️ [cache] cache completo limpo');
    },

    /** Debug: mostra o que está em cache. */
    debug() {
        const agora = Date.now();
        const linhas = Object.keys(apiCache.dados).map(aba => ({
            aba,
            registros: Array.isArray(apiCache.dados[aba]) ? apiCache.dados[aba].length : '—',
            idade: `${Math.round((agora - apiCache.timestamps[aba]) / 1000)}s`,
            expira_em: `${Math.max(0, Math.round((apiCache.timeout - (agora - apiCache.timestamps[aba])) / 1000))}s`
        }));
        Object.keys(apiCache.pendentes).forEach(aba => linhas.push({
            aba, registros: '…', idade: '—', expira_em: 'carregando'
        }));
        if (linhas.length) console.table(linhas);
        else console.log('📦 [cache] vazio');
    }
};

// ==================== ATALHOS ====================
/**
 * Carrega uma aba usando o cache.
 * Em caso de erro da API a exceção é propagada (nada é guardado no cache).
 * Use .catch(() => []) onde uma lista vazia for aceitável.
 *
 * @param {string}  aba    Nome da aba (ex: 'PARCEIROS')
 * @param {boolean} forcar true = ignora o cache e busca na API
 * @returns {Promise<Array>}
 */
function carregarComCache(aba, forcar = false) {
    return apiList(aba, !forcar);
}

/**
 * Carrega várias abas em paralelo.
 * @param {string[]} abas
 * @param {boolean}  forcar
 * @returns {Promise<Object>} { PARCEIROS: [...], FINANCEIRO: [...] }
 */
async function carregarVariasComCache(abas, forcar = false) {
    const resultados = await Promise.all(abas.map(aba => carregarComCache(aba, forcar)));
    const obj = {};
    abas.forEach((aba, i) => { obj[aba] = resultados[i]; });
    return obj;
}

/**
 * Mantida por compatibilidade. Desde a v5 o api.js já invalida a aba
 * automaticamente em apiCreate / apiUpdate / apiDelete.
 */
function invalidarCacheAposEscrita(aba) {
    cacheGlobal.invalidar(aba);
}

// ==================== EXPORTAÇÃO ====================
window.cacheGlobal = cacheGlobal;
window.carregarComCache = carregarComCache;
window.carregarVariasComCache = carregarVariasComCache;
window.invalidarCacheAposEscrita = invalidarCacheAposEscrita;

//console.log('📦 Cache centralizado carregado (TTL: ' + (apiCache.timeout / 1000) + 's)');
//console.log('💡 Debug: cacheGlobal.debug()  |  Limpar: cacheGlobal.limpar()');
