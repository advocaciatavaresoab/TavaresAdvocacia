// ==================== FORMATAÇÃO DE DADOS ====================

/**
 * Formata data de YYYY-MM-DD para DD/MM/YYYY
 * @param {string|Date} data - Data em qualquer formato
 * @returns {string} Data formatada ou '—' se inválida
 */
function formatarData(data) {
    if (!data) return '—';
    
    try {
        // Se for string no formato ISO (YYYY-MM-DD)
        if (typeof data === 'string' && data.includes('-') && data.length >= 10) {
            const partes = data.substring(0, 10).split('-');
            return `${partes[2]}/${partes[1]}/${partes[0]}`;
        }
        
        // Se for objeto Date
        if (data instanceof Date && !isNaN(data)) {
            return data.toLocaleDateString('pt-BR');
        }
        
        // Se já estiver no formato brasileiro
        if (typeof data === 'string' && data.includes('/')) {
            return data;
        }
        
        return String(data);
    } catch (e) {
        return String(data);
    }
}
// ==================== IDADE ====================

/**
 * Calcula idade a partir da data de nascimento
 * @param {string|Date} dataNascimento - Data de nascimento (formato YYYY-MM-DD ou Date)
 * @returns {number|null} Idade calculada ou null se inválida
 */
function calcularIdade(dataNascimento) {
    if (!dataNascimento) return null;
    
    let dataNasc;
    
    // Se for string
    if (typeof dataNascimento === 'string') {
        // Tenta YYYY-MM-DD
        const partes = dataNascimento.split('-');
        if (partes.length === 3) {
            dataNasc = new Date(parseInt(partes[0]), parseInt(partes[1]) - 1, parseInt(partes[2]));
        } else {
            dataNasc = new Date(dataNascimento);
        }
    } else if (dataNascimento instanceof Date) {
        dataNasc = dataNascimento;
    } else {
        return null;
    }
    
    // Verifica se a data é válida
    if (isNaN(dataNasc.getTime())) return null;
    
    const hoje = new Date();
    let idade = hoje.getFullYear() - dataNasc.getFullYear();
    const mes = hoje.getMonth() - dataNasc.getMonth();
    
    // Ajusta se ainda não fez aniversário este ano
    if (mes < 0 || (mes === 0 && hoje.getDate() < dataNasc.getDate())) {
        idade--;
    }
    
    return idade;
}

/**
 * Formata data de nascimento para exibição
 * @param {string|Date} dataNascimento - Data de nascimento
 * @returns {string} Data formatada ou '—'
 */
function formatarDataNascimento(dataNascimento) {
    if (!dataNascimento) return '—';
    
    const data = new Date(dataNascimento);
    if (isNaN(data.getTime())) return '—';
    
    return data.toLocaleDateString('pt-BR');
}

/**
 * Converte data do formato brasileiro para ISO (YYYY-MM-DD)
 * @param {string} data - Data no formato DD/MM/YYYY
 * @returns {string} Data ISO ou string vazia
 */
function converterDataISO(data) {
    if (!data) return '';
    
    try {
        // Se já for ISO
        if (typeof data === 'string' && data.includes('-') && data.length >= 10) {
            return data.substring(0, 10);
        }
        
        // Se for formato brasileiro
        if (typeof data === 'string' && data.includes('/')) {
            const partes = data.split('/');
            if (partes.length === 3) {
                return `${partes[2]}-${partes[1].padStart(2, '0')}-${partes[0].padStart(2, '0')}`;
            }
        }
        
        return data;
    } catch (e) {
        return data;
    }
}
// ==================== VALIDAÇÃO CPF/CNPJ ====================

/**
 * Valida CPF
 * @param {string} cpf - CPF a ser validado (com ou sem formatação)
 * @returns {boolean} true se válido
 */
function validarCPF(cpf) {
    if (!cpf) return false;
    
    // Remove formatação
    const numeros = cpf.replace(/\D/g, '');
    
    // Verifica se tem 11 dígitos
    if (numeros.length !== 11) return false;
    
    // Verifica se todos os dígitos são iguais
    if (/^(\d)\1+$/.test(numeros)) return false;
    
    // Calcula primeiro dígito verificador
    let soma = 0;
    for (let i = 0; i < 9; i++) {
        soma += parseInt(numeros.charAt(i)) * (10 - i);
    }
    let resto = 11 - (soma % 11);
    let digitoVerificador1 = resto >= 10 ? 0 : resto;
    
    if (parseInt(numeros.charAt(9)) !== digitoVerificador1) return false;
    
    // Calcula segundo dígito verificador
    soma = 0;
    for (let i = 0; i < 10; i++) {
        soma += parseInt(numeros.charAt(i)) * (11 - i);
    }
    resto = 11 - (soma % 11);
    let digitoVerificador2 = resto >= 10 ? 0 : resto;
    
    if (parseInt(numeros.charAt(10)) !== digitoVerificador2) return false;
    
    return true;
}

/**
 * Valida CNPJ
 * @param {string} cnpj - CNPJ a ser validado (com ou sem formatação)
 * @returns {boolean} true se válido
 */
function validarCNPJ(cnpj) {
    if (!cnpj) return false;
    
    // Remove formatação
    const numeros = cnpj.replace(/\D/g, '');
    
    // Verifica se tem 14 dígitos
    if (numeros.length !== 14) return false;
    
    // Verifica se todos os dígitos são iguais
    if (/^(\d)\1+$/.test(numeros)) return false;
    
    // Calcula primeiro dígito verificador
    let soma = 0;
    const pesos1 = [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
    for (let i = 0; i < 12; i++) {
        soma += parseInt(numeros.charAt(i)) * pesos1[i];
    }
    let resto = soma % 11;
    let digitoVerificador1 = resto < 2 ? 0 : 11 - resto;
    
    if (parseInt(numeros.charAt(12)) !== digitoVerificador1) return false;
    
    // Calcula segundo dígito verificador
    soma = 0;
    const pesos2 = [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
    for (let i = 0; i < 13; i++) {
        soma += parseInt(numeros.charAt(i)) * pesos2[i];
    }
    resto = soma % 11;
    let digitoVerificador2 = resto < 2 ? 0 : 11 - resto;
    
    if (parseInt(numeros.charAt(13)) !== digitoVerificador2) return false;
    
    return true;
}

/**
 * Detecta se é CPF ou CNPJ e valida
 * @param {string} documento - Documento a ser validado
 * @returns {Object} { valido: boolean, tipo: 'CPF'|'CNPJ'|null, mensagem: string }
 */
function validarDocumento(documento) {
    if (!documento) {
        return { valido: false, tipo: null, mensagem: 'Documento não informado' };
    }
    
    const numeros = documento.replace(/\D/g, '');
    
    if (numeros.length === 11) {
        const valido = validarCPF(numeros);
        return {
            valido: valido,
            tipo: 'CPF',
            mensagem: valido ? 'CPF válido' : 'CPF inválido'
        };
    } else if (numeros.length === 14) {
        const valido = validarCNPJ(numeros);
        return {
            valido: valido,
            tipo: 'CNPJ',
            mensagem: valido ? 'CNPJ válido' : 'CNPJ inválido'
        };
    } else {
        return {
            valido: false,
            tipo: null,
            mensagem: 'Documento deve ter 11 (CPF) ou 14 (CNPJ) dígitos'
        };
    }
}

/**
 * Formata CPF ou CNPJ automaticamente
 * @param {string} documento - Documento a ser formatado
 * @returns {string} Documento formatado
 */
function formatarDocumentoAuto(documento) {
    if (!documento) return '';
    
    const numeros = documento.replace(/\D/g, '');
    
    if (numeros.length === 11) {
        return numeros.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4');
    } else if (numeros.length === 14) {
        return numeros.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, '$1.$2.$3/$4-$5');
    }
    
    return documento;
}

/**
 * Máscara para CPF/CNPJ enquanto digita
 * @param {string} valor - Valor atual do input
 * @returns {string} Valor com máscara aplicada
 */
function mascaraDocumento(valor) {
    if (!valor) return '';
    
    const numeros = valor.replace(/\D/g, '');
    
    if (numeros.length <= 11) {
        // CPF: 000.000.000-00
        let resultado = numeros;
        if (resultado.length > 3) resultado = resultado.replace(/^(\d{3})(\d)/, '$1.$2');
        if (resultado.length > 6) resultado = resultado.replace(/^(\d{3})\.(\d{3})(\d)/, '$1.$2.$3');
        if (resultado.length > 9) resultado = resultado.replace(/^(\d{3})\.(\d{3})\.(\d{3})(\d)/, '$1.$2.$3-$4');
        return resultado;
    } else {
        // CNPJ: 00.000.000/0000-00
        let resultado = numeros;
        if (resultado.length > 2) resultado = resultado.replace(/^(\d{2})(\d)/, '$1.$2');
        if (resultado.length > 5) resultado = resultado.replace(/^(\d{2})\.(\d{3})(\d)/, '$1.$2.$3');
        if (resultado.length > 8) resultado = resultado.replace(/^(\d{2})\.(\d{3})\.(\d{3})(\d)/, '$1.$2.$3/$4');
        if (resultado.length > 12) resultado = resultado.replace(/^(\d{2})\.(\d{3})\.(\d{3})\/(\d{4})(\d)/, '$1.$2.$3/$4-$5');
        return resultado;
    }
}
/**
 * Formata valor monetário
 * @param {number} valor - Valor numérico
 * @returns {string} Valor formatado em reais
 */
function formatarMoeda(valor) {
    if (valor === null || valor === undefined || isNaN(valor)) return 'R$ 0,00';
    
    return 'R$ ' + valor.toLocaleString('pt-BR', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
    });
}

/**
 * Converte string de valor monetário para número
 * @param {string|number} valor - String como "R$ 5.000,00" ou número
 * @returns {number} Valor numérico
 */
function parseValor(valor) {
    if (valor === undefined || valor === null || valor === '') return 0;
    if (typeof valor === 'number') return valor;
    if (typeof valor === 'string') {
        const limpo = valor
            .replace('R$', '')
            .replace(/\s/g, '')
            .replace(/\./g, '')
            .replace(',', '.');
        return parseFloat(limpo) || 0;
    }
    return 0;
}

/**
 * Formata CPF/CNPJ
 * @param {string} documento - Número do documento
 * @returns {string} Documento formatado
 */
function formatarDocumento(doc) {
    if (!doc) return '—';
    
    const numeros = doc.replace(/\D/g, '');
    
    if (numeros.length === 11) {
        return numeros.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4');
    } else if (numeros.length === 14) {
        return numeros.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, '$1.$2.$3/$4-$5');
    }
    
    return doc;
}

/**
 * Formata número de telefone
 * @param {string} telefone - Número do telefone
 * @returns {string} Telefone formatado
 */
function formatarTelefone(tel) {
    if (!tel) return '—';
    
    const numeros = tel.replace(/\D/g, '');
    
    if (numeros.length === 11) {
        return numeros.replace(/(\d{2})(\d{5})(\d{4})/, '($1) $2-$3');
    } else if (numeros.length === 10) {
        return numeros.replace(/(\d{2})(\d{4})(\d{4})/, '($1) $2-$3');
    }
    
    return tel;
}
function mascaraTelefone(valor) {
    if (!valor) return '';

    const numeros = valor.replace(/\D/g, '').slice(0, 11);
    if (!numeros) return '';

    // (XX
    if (numeros.length <= 2) return `(${numeros}`;
    // (XX) X
    if (numeros.length <= 6) return `(${numeros.slice(0, 2)}) ${numeros.slice(2)}`;
    // (XX) XXXX-X (fixo parcial)
    if (numeros.length <= 10) return `(${numeros.slice(0, 2)}) ${numeros.slice(2, 6)}-${numeros.slice(6)}`;
    // (XX) XXXXX-XXXX (celular completo)
    return `(${numeros.slice(0, 2)}) ${numeros.slice(2, 7)}-${numeros.slice(7)}`;
}
// ==================== MANIPULAÇÃO DE TEXTO ====================

/**
 * Escapa HTML para prevenir XSS
 * @param {*} valor - Qualquer valor
 * @returns {string} Texto escapado
 */
function esc(valor) {
    if (valor === undefined || valor === null) return '—';
    
    const div = document.createElement('div');
    div.textContent = String(valor);
    return div.innerHTML;
}

/**
 * Trunca texto com reticências
 * @param {string} texto - Texto original
 * @param {number} max - Tamanho máximo
 * @returns {string} Texto truncado
 */
function truncar(texto, max = 30) {
    if (!texto) return '—';
    if (texto.length <= max) return texto;
    return texto.substring(0, max) + '...';
}

/**
 * Capitaliza primeira letra
 * @param {string} texto - Texto original
 * @returns {string} Texto capitalizado
 */
function capitalizar(texto) {
    if (!texto) return '';
    return texto.charAt(0).toUpperCase() + texto.slice(1).toLowerCase();
}

// ==================== STATUS E CLASSES ====================

/**
 * Retorna classe CSS para status
 * @param {string} status - Texto do status
 * @returns {string} Classe CSS
 */
function getStatusClass(status) {
    if (!status) return 'active';
    
    const s = status.toUpperCase();
    
    // Urgente / Vencido
    if (s.includes('VENCIDO') || s.includes('URGENTE')) return 'urgent';
    
    // Concluído / Sucesso
    if (s.includes('CONCLU') || s.includes('APROVADO') || 
        s.includes('REALIZADA') || s.includes('FINALIZADO')) return 'completed';
    
    // Pendente / Aguardando
    if (s.includes('PENDENTE') || s.includes('AGUARDANDO') || 
        s.includes('NEGADO') || s.includes('INATIVO')) return 'pending';
    
    // Ativo / Em andamento
    if (s.includes('ANDAMENTO') || s.includes('ATIVO') || 
        s.includes('AGENDADA') || s.includes('PRÓXIMO')) return 'active';
    
    return 'active';
}

/**
 * Retorna ícone para status
 * @param {string} status - Texto do status
 * @returns {string} Ícone FontAwesome
 */
function getStatusIcon(status) {
    const s = (status || '').toUpperCase();
    
    if (s.includes('VENCIDO') || s.includes('URGENTE')) return 'fa-circle-exclamation';
    if (s.includes('CONCLU') || s.includes('APROVADO')) return 'fa-circle-check';
    if (s.includes('PENDENTE') || s.includes('AGUARDANDO')) return 'fa-clock';
    if (s.includes('ANDAMENTO') || s.includes('ATIVO')) return 'fa-circle-play';
    if (s.includes('NEGADO') || s.includes('CANCELADA')) return 'fa-circle-xmark';
    
    return 'fa-circle';
}

/**
 * Retorna cor hexadecimal para status
 * @param {string} status - Texto do status
 * @returns {string} Cor em hex
 */
function getStatusColor(status) {
    const classe = getStatusClass(status);
    
    const cores = {
        'urgent': '#c98a1f',
        'completed': '#2f9e5b',
        'pending': '#c94b3f',
        'active': '#3568c9'
    };
    
    return cores[classe] || '#64708a';
}

// ==================== MANIPULAÇÃO DO DOM ====================

/**
 * Define texto em um elemento
 * @param {string} id - ID do elemento
 * @param {*} valor - Valor a ser exibido
 */
function setText(id, valor) {
    const el = document.getElementById(id);
    if (el) {
        el.textContent = valor ?? '—';
    }
}

/**
 * Define HTML em um elemento
 * @param {string} id - ID do elemento
 * @param {string} html - Conteúdo HTML
 */
function setHTML(id, html) {
    const el = document.getElementById(id);
    if (el) {
        el.innerHTML = html;
    }
}

/**
 * Mostra ou esconde um elemento
 * @param {string} id - ID do elemento
 * @param {boolean} mostrar - true = mostrar, false = esconder
 */
function toggleElemento(id, mostrar) {
    const el = document.getElementById(id);
    if (el) {
        el.style.display = mostrar ? '' : 'none';
    }
}

// ==================== DATAS ====================

/**
 * Calcula dias restantes até uma data
 * @param {string|Date} data - Data alvo
 * @returns {number} Dias restantes (negativo = vencido)
 */
function diasRestantes(data) {
    if (!data) return null;
    
    const hoje = new Date();
    hoje.setHours(0, 0, 0, 0);
    
    const alvo = new Date(data);
    alvo.setHours(0, 0, 0, 0);
    
    return Math.ceil((alvo - hoje) / (1000 * 60 * 60 * 24));
}

/**
 * Retorna texto descritivo dos dias restantes
 * @param {number} dias - Quantidade de dias
 * @returns {string} Texto descritivo
 */
function textoDiasRestantes(dias) {
    if (dias === null || dias === undefined) return '';
    
    if (dias < 0) {
        const vencido = Math.abs(dias);
        return vencido === 1 ? 'Vencido há 1 dia' : `Vencido há ${vencido} dias`;
    }
    
    if (dias === 0) return 'Vence hoje';
    if (dias === 1) return '1 dia restante';
    if (dias <= 7) return `${dias} dias restantes`;
    return `${dias} dias`;
}

/**
 * Retorna classe CSS baseada nos dias restantes
 * @param {number} dias - Dias restantes
 * @returns {string} Classe CSS
 */
function classeDiasRestantes(dias) {
    if (dias === null || dias === undefined) return '';
    if (dias < 0) return 'prazo-vencido';
    if (dias === 0) return 'prazo-hoje';
    if (dias <= 7) return 'prazo-urgente';
    return '';
}

// ==================== NOTIFICAÇÕES ====================

/**
 * Exibe notificação toast
 * @param {string} mensagem - Texto da notificação
 * @param {string} tipo - 'success', 'error', 'warning', 'info'
 * @param {number} duracao - Duração em ms
 */
function notificar(mensagem, tipo = 'info', duracao = 4000) {
    // Cria container se não existir
    let container = document.getElementById('toast-container');
    if (!container) {
        container = document.createElement('div');
        container.id = 'toast-container';
        container.style.cssText = `
            position: fixed;
            top: 20px;
            right: 20px;
            z-index: 9999;
            display: flex;
            flex-direction: column;
            gap: 10px;
        `;
        document.body.appendChild(container);
    }
    
    const cores = {
        success: '#2f9e5b',
        error: '#c94b3f',
        warning: '#c98a1f',
        info: '#3568c9'
    };
    
    const icones = {
        success: 'fa-circle-check',
        error: 'fa-circle-xmark',
        warning: 'fa-triangle-exclamation',
        info: 'fa-circle-info'
    };
    
    const toast = document.createElement('div');
    toast.style.cssText = `
        background: white;
        border-left: 4px solid ${cores[tipo] || cores.info};
        padding: 1rem 1.5rem;
        border-radius: 8px;
        box-shadow: 0 4px 20px rgba(0,0,0,0.15);
        display: flex;
        align-items: center;
        gap: 0.8rem;
        font-family: var(--font-body);
        font-size: 0.9rem;
        min-width: 300px;
        animation: slideIn 0.3s ease;
    `;
    
    toast.innerHTML = `
        <i class="fas ${icones[tipo]}" style="color: ${cores[tipo]}; font-size: 1.2rem;"></i>
        <span style="flex: 1;">${mensagem}</span>
        <button onclick="this.parentElement.remove()" style="background: none; border: none; cursor: pointer; color: var(--text-faint);">
            <i class="fas fa-times"></i>
        </button>
    `;
    
    container.appendChild(toast);
    
    // Remove após a duração
    setTimeout(() => {
        toast.style.opacity = '0';
        toast.style.transition = 'opacity 0.3s ease';
        setTimeout(() => toast.remove(), 300);
    }, duracao);
}

/**
 * Exibe confirmação
 * @param {string} mensagem - Texto da confirmação
 * @returns {boolean} true se confirmado
 */
function confirmar(mensagem) {
    return confirm(mensagem);
}

// ==================== DEBOUNCE ====================

/**
 * Debounce para inputs de busca
 * @param {Function} func - Função a ser executada
 * @param {number} delay - Atraso em ms
 * @returns {Function} Função com debounce
 */
function debounce(func, delay = 300) {
    let timeout;
    return function (...args) {
        clearTimeout(timeout);
        timeout = setTimeout(() => func.apply(this, args), delay);
    };
}

// ==================== EXPORTAÇÃO ====================
// Todas as funções já são globais (declaradas sem const/let no escopo global)