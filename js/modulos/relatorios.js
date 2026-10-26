
// ==================== INICIALIZAÇÃO ====================
async function inicializarRelatorios() {
    //console.log('📈 Inicializando relatórios...');
    await aguardarElementosRelatorios();
    await carregarDadosRelatorios();
    initEventosRelatorios();
    //console.log('✅ Módulo relatórios inicializado');
}

function aguardarElementosRelatorios() {
    return new Promise((resolve) => {
        const check = () => {
            if (document.getElementById('relTotalProcessos')) {
                resolve();
            } else {
                setTimeout(check, 100);
            }
        };
        check();
    });
}

function initEventosRelatorios() {
    document.getElementById('btnGerarRelatorio')?.addEventListener('click', gerarRelatorioPDF);
    document.getElementById('btnExportarExcel')?.addEventListener('click', exportarExcel);
    document.getElementById('btnFiltrarPeriodo')?.addEventListener('click', () => carregarDadosRelatorios());
}

// ==================== FUNÇÃO AUXILIAR: PARSEAR VALOR ====================
function parseValorRelatorio(valor) {
    if (!valor) return 0;
    if (typeof valor === 'number') return valor;
    
    let str = String(valor).trim();
    if (!str) return 0;
    
    str = str.replace(/R\$/g, '').trim();
    str = str.replace(/[^\d,.]/g, '');
    if (!str) return 0;
    
    if (str.includes(',')) {
        str = str.replace(/\./g, '');
        str = str.replace(',', '.');
    } else {
        const partes = str.split('.');
        if (partes.length > 1) {
            const ultimo = partes.pop();
            const inteiro = partes.join('');
            str = inteiro + '.' + ultimo;
        }
    }
    
    return parseFloat(str) || 0;
}

// ==================== CARREGAMENTO ====================
async function carregarDadosRelatorios() {
    try {
        // Cache centralizado; falha em uma aba não derruba o relatório inteiro
        const carregar = (aba) => carregarComCache(aba).catch(() => []);
        
        const [processos, clientes, pericias, parceiros, financeiro] = await Promise.all([
            carregar('PROCESSOS'),
            carregar('CLIENTES'),
            carregar('PERICIAS'),
            carregar('PARCEIROS'),
            carregar('FINANCEIRO')
        ]);

        preencherRelatorioProcessos(processos);
        preencherRelatorioClientes(clientes);
        preencherRelatorioFinanceiro(financeiro, processos);
        preencherRelatorioPericias(pericias);
        preencherRelatorioPrazos(processos);
        preencherRelatorioParceiros(parceiros, financeiro);

        //console.log('✅ Relatórios atualizados');
    } catch (error) {
        console.error('Erro ao carregar relatórios:', error);
    }
}

// ==================== PROCESSOS ====================
function preencherRelatorioProcessos(processos) {
    const validos = processos.filter(p => p['N PROCESSO'] || p.CLIENTE);
    const total = validos.length;
    const andamento = validos.filter(p => p.STATUS === 'EM ANDAMENTO').length;
    const aprovados = validos.filter(p => p.RESULTADO === 'APROVADO').length;
    const negados = validos.filter(p => p.RESULTADO === 'NEGADO').length;
    const arquivados = validos.filter(p => p.STATUS === 'ARQUIVADO').length;

    setText('relTotalProcessos', total);
    
    if (total > 0) {
        setText('percAndamento', Math.round((andamento / total) * 100) + '%');
        setText('percAprovados', Math.round((aprovados / total) * 100) + '%');
        setText('percNegados', Math.round((negados / total) * 100) + '%');
        setText('percArquivados', Math.round((arquivados / total) * 100) + '%');
        
        const barraAndamento = document.getElementById('barraAndamento');
        const barraAprovados = document.getElementById('barraAprovados');
        const barraNegados = document.getElementById('barraNegados');
        const barraArquivados = document.getElementById('barraArquivados');
        
        if (barraAndamento) barraAndamento.style.width = (andamento / total * 100) + '%';
        if (barraAprovados) barraAprovados.style.width = (aprovados / total * 100) + '%';
        if (barraNegados) barraNegados.style.width = (negados / total * 100) + '%';
        if (barraArquivados) barraArquivados.style.width = (arquivados / total * 100) + '%';
    }
}

// ==================== CLIENTES ====================
function preencherRelatorioClientes(clientes) {
    const validos = clientes.filter(c => c.NOME && String(c.NOME).trim());
    setText('relTotalClientes', validos.length);
    setText('relClientesAtivos', validos.filter(c => c.STATUS === 'ATIVO').length);
    setText('relClientesInativos', validos.filter(c => c.STATUS === 'INATIVO').length);
    setText('relClientesMasculinos', validos.filter(c => c.SEXO === 'MASCULINO').length);
    setText('relClientesFemininos', validos.filter(c => c.SEXO === 'FEMININO').length);
}

// ==================== FINANCEIRO (CORRIGIDO) ====================
function preencherRelatorioFinanceiro(financeiro, processos) {
    // ===== CATEGORIAS PARA RECEITA (ENTRADA) =====
    const CATEGORIAS_RECEITA = ['HONORARIOS', 'ACORDO', 'RETROATIVO', 'COMISSAO PARCEIRO'];
    
    // ===== CATEGORIAS PARA DESPESA (SAIDA) =====
    const CATEGORIAS_DESPESA = ['CUSTAS', 'TAXAS', 'MATERIAL'];
    
    let recebimentos = 0;      // Honorários + Acordo + Retroativo
    let comissoesEntrada = 0;  // Comissão parceiro (entrada)
    let comissoesSaida = 0;    // Comissão parceiro (saída)
    let despesas = 0;          // Custas + Taxas + Material
    let outros = 0;
    let pendente = 0;
    let vencido = 0;
    
    let totalLancamentos = 0;
    let lancamentosPagos = 0;
    let processosComReceita = new Set();
    
    financeiro.forEach(t => {
        const valor = parseValorRelatorio(t.VALOR);
        if (valor <= 0) return;
        
        totalLancamentos++;
        
        const categoria = String(t.CATEGORIA || '').toUpperCase().trim();
        const fluxo = String(t.FLUXO || 'ENTRADA').toUpperCase().trim();
        const status = String(t.STATUS || 'PENDENTE').toUpperCase().trim();
        
        // Contabiliza apenas status PAGO ou RECEBIDO como "efetivado"
        const isPago = (status === 'PAGO' || status === 'RECEBIDO');
        
        // Status pendente/vencido (para mostrar quanto está em aberto)
        if (status === 'PENDENTE' || status === 'AGUARDANDO') {
            pendente += valor;
        } else if (status === 'VENCIDO') {
            vencido += valor;
        }
        
        if (isPago) {
            lancamentosPagos++;
        }
        
        // ===== ENTRADAS =====
        if (fluxo === 'ENTRADA') {
            if (categoria.includes('COMISSAO')) {
                // Comissão de parceiro (ENTRADA)
                if (isPago) comissoesEntrada += valor;
            } else if (CATEGORIAS_RECEITA.some(c => categoria.includes(c))) {
                // Honorários, Acordo, Retroativo
                if (isPago) {
                    recebimentos += valor;
                    
                    // Conta processo único para ticket médio
                    const proc = String(t.PROCESSO_REF || '').trim();
                    if (proc) processosComReceita.add(proc);
                }
            } else {
                // Outros tipos de entrada
                if (isPago) outros += valor;
            }
        }
        
        // ===== SAÍDAS =====
        else if (fluxo === 'SAIDA') {
            if (categoria.includes('COMISSAO')) {
                // Comissão de parceiro (SAIDA) — pagamento ao parceiro
                if (isPago) comissoesSaida += valor;
            } else if (CATEGORIAS_DESPESA.some(c => categoria.includes(c))) {
                // Custas, Taxas, Material
                if (isPago) despesas += valor;
            } else {
                // Outros tipos de saída
                if (isPago) outros += valor;
            }
        }
    });
    
    // ===== CÁLCULOS FINAIS =====
    const faturamentoTotal = recebimentos + comissoesEntrada;  // Tudo que entrou
    const totalDespesas = despesas + comissoesSaida;           // Tudo que saiu
    const lucroLiquido = faturamentoTotal - totalDespesas;
    
    // Ticket médio: faturamento / processos únicos com receita
    const totalProcessos = processosComReceita.size || processos.length;
    const ticketMedio = totalProcessos > 0 ? faturamentoTotal / totalProcessos : 0;
    
    // ===== PREENCHE NA TELA =====
    setText('relFaturamentoTotal', formatarMoeda(faturamentoTotal));
    setText('relRecebimentos', formatarMoeda(recebimentos));
    setText('relDespesas', formatarMoeda(totalDespesas));
    setText('relComissoes', formatarMoeda(comissoesEntrada + comissoesSaida));
    setText('relTicketMedio', formatarMoeda(ticketMedio));
    
    // Campos extras (se existirem no HTML)
    setText('relComissoesEntrada', formatarMoeda(comissoesEntrada));
    setText('relComissoesSaida', formatarMoeda(comissoesSaida));
    setText('relLucroLiquido', formatarMoeda(lucroLiquido));
    setText('relFinanceiroPendente', formatarMoeda(pendente));
    setText('relFinanceiroVencido', formatarMoeda(vencido));
    setText('relTotalLancamentos', totalLancamentos);
    setText('relLancamentosPagos', lancamentosPagos);
    
    /*console.log(`💰 Financeiro:
        • Faturamento: ${formatarMoeda(faturamentoTotal)}
        • Recebimentos: ${formatarMoeda(recebimentos)}
        • Comissões (entrada): ${formatarMoeda(comissoesEntrada)}
        • Comissões (saída): ${formatarMoeda(comissoesSaida)}
        • Despesas: ${formatarMoeda(despesas)}
        • Lucro líquido: ${formatarMoeda(lucroLiquido)}
        • Pendente: ${formatarMoeda(pendente)}
        • Vencido: ${formatarMoeda(vencido)}
    `);*/
}

// ==================== PERÍCIAS ====================
function preencherRelatorioPericias(pericias) {
    const validas = pericias.filter(p => p.PROCESSO || p.CLIENTE);
    setText('relTotalPericias', validas.length);
    setText('relPericiasRealizadas', validas.filter(p => p.STATUS === 'REALIZADA').length);
    setText('relPericiasAgendadas', validas.filter(p => p.STATUS === 'AGENDADA').length);
    setText('relPericiasCanceladas', validas.filter(p => p.STATUS === 'CANCELADA').length);
    setText('relPericiasFavoraveis', validas.filter(p => p.RESULTADO === 'FAVORÁVEL').length);
}

// ==================== PRAZOS ====================
function preencherRelatorioPrazos(processos) {
    const comPrazo = processos.filter(p => p['DATA FINAL'] || p.PRAZO);
    const hoje = new Date();
    hoje.setHours(0, 0, 0, 0);
    
    let vencidos = 0, urgentes = 0, ok = 0, proximos = 0;
    const semData = processos.length - comPrazo.length;
    
    comPrazo.forEach(p => {
        const dataStr = p['DATA FINAL'] || p.PRAZO;
        let data;
        
        // Trata diferentes formatos de data
        if (typeof dataStr === 'string' && dataStr.includes('/')) {
            const [d, m, a] = dataStr.split('/');
            data = new Date(parseInt(a), parseInt(m) - 1, parseInt(d));
        } else {
            data = new Date(dataStr);
        }
        
        if (isNaN(data.getTime())) return;
        
        const dias = Math.ceil((data - hoje) / (1000 * 60 * 60 * 24));
        
        if (dias < 0) vencidos++;
        else if (dias <= 7) urgentes++;
        else if (dias <= 30) proximos++;
        else ok++;
    });
    
    setText('relPrazosVencidos', vencidos);
    setText('relPrazosUrgentes', urgentes);
    setText('relPrazosOk', ok);
    setText('relPrazosProximos', proximos);
    setText('relPrazosSemData', semData);
}

// ==================== PARCEIROS (CORRIGIDO) ====================
function preencherRelatorioParceiros(parceiros, financeiro) {
    const validos = parceiros.filter(p => p.NOME && String(p.NOME).trim());
    const destaques = validos.filter(p => p.DESTAQUE === 'SIM').length;
    const ativos = validos.filter(p => p.STATUS === 'ATIVO').length;
    
    // ===== Conta indicações reais (do FINANCEIRO) =====
    const metricas = {};
    validos.forEach(p => {
        const chave = String(p.NOME || '').trim().toLowerCase();
        metricas[chave] = { indicacoes: new Set(), comissao: 0 };
    });
    
    (financeiro || []).forEach(lanc => {
        const parceiro = String(lanc.PARCEIRO || '').trim().toLowerCase();
        if (!parceiro || !metricas[parceiro]) return;
        
        const categoria = String(lanc.CATEGORIA || '').toUpperCase();
        if (!categoria.includes('COMISSAO')) return;
        
        // Conta indicações únicas (por processo + cliente)
        const processo = String(lanc.PROCESSO_REF || '').trim();
        const cliente = String(lanc.CLIENTE || '').trim();
        if (processo) metricas[parceiro].indicacoes.add(processo);
        else if (cliente) metricas[parceiro].indicacoes.add(cliente);
        
        // Comissões (entrada)
        const fluxo = String(lanc.FLUXO || '').toUpperCase();
        if (fluxo === 'ENTRADA') {
            metricas[parceiro].comissao += parseValorRelatorio(lanc.VALOR);
        }
    });
    
    // ===== Aplica no top parceiro =====
    let top = null;
    let maiorIndicacoes = -1;
    
    validos.forEach(p => {
        const chave = String(p.NOME || '').trim().toLowerCase();
        const indic = metricas[chave]?.indicacoes?.size || 0;
        if (indic > maiorIndicacoes) {
            maiorIndicacoes = indic;
            top = p;
        }
    });
    
    setText('relTotalParceiros', validos.length);
    setText('relParceirosDestaque', destaques);
    setText('relParceirosAtivos', ativos);
    setText('relTopParceiro', top ? (top.NOME || '—') : '—');
    
    // Comissão média baseada em dados reais
    const comissoes = Object.values(metricas).map(m => m.comissao).filter(v => v > 0);
    const comissaoMedia = comissoes.length > 0
        ? comissoes.reduce((a, b) => a + b, 0) / comissoes.length
        : 0;
    
    setText('relComissaoMedia', formatarMoeda(comissaoMedia));
}

// ==================== EXPORTAÇÃO ====================
function gerarRelatorioPDF() {
    notificar('Gerando relatório PDF...', 'info');
    setTimeout(() => {
        window.print();
        notificar('Relatório enviado para impressão!', 'success');
    }, 500);
}

function exportarExcel() {
    notificar('Funcionalidade em desenvolvimento', 'info');
}

document.addEventListener('keydown', (e) => {
    if (e.ctrlKey && e.key === 'p') {
        e.preventDefault();
        gerarRelatorioPDF();
    }
});

// ==================== EXPORTAÇÃO GLOBAL ====================
window.inicializarRelatorios = inicializarRelatorios;
window.carregarDadosRelatorios = carregarDadosRelatorios;
window.gerarRelatorioPDF = gerarRelatorioPDF;

//console.log('📈 Módulo relatórios carregado (v2.0)');