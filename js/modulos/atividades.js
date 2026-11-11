// ==================== ESTADO ====================
let todasAtividades = [];
let filtroAtualAtividades = 'todos';
let atividadeEditando = null;
let clientesCarregados = [];
let processosCarregados = [];
let dadosCarregados = false;
let listaNomesClientes = [];
let salvandoAtividade = false;
let processandoAcao = false;
let tiposPrazo = [];
let tiposPrazoCarregados = false;

// ==================== INFERÊNCIA DE CRIADOR ====================
// Ajuste conforme quem é titular. Quem NÃO estiver aqui é tratado como ESTAGIARIO.
const TITULARES_ATIVIDADES = [
    'IZAAC MANGUEIRA TAVARES'
    // 'LARISSA DO NASCIMENTO OLIVEIRA'  ← descomente se ela for titular
];

function inferirCriadoPor(a) {
    const direto = String(a['CRIADO_POR_ROLE'] || '').toUpperCase().trim();
    if (direto === 'TITULAR' || direto === 'ESTAGIARIO') return direto;

    const resp = String(a.RESPONSAVEL || '').toUpperCase().trim();
    if (!resp) return 'ESTAGIARIO';

    return TITULARES_ATIVIDADES.some(t => resp === t.toUpperCase())
        ? 'TITULAR'
        : 'ESTAGIARIO';
}

// ==================== HELPERS DE STATUS ====================
function isEmProducao(status) {
    const s = String(status || '').toUpperCase()
        .normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();
    return s === 'EM PRODUCAO';
}

function isEmAnalise(status) {
    const s = String(status || '').toUpperCase()
        .normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();
    return s === 'EM ANALISE';
}

// ==================== HELPERS DE PRAZO ====================
function hojeISOLocal() {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** Data da intimação + N dias úteis (não conta o dia da intimação). Retorna 'YYYY-MM-DD' ou ''. */
function calcularDataVencimento(dataInicioISO, dias) {
    if (!dataInicioISO || !(dias > 0)) return '';
    const [ano, mes, dia] = String(dataInicioISO).substring(0, 10).split('-').map(Number);
    if (!ano || !mes || !dia) return '';

    const data = new Date(ano, mes - 1, dia);
    let contados = 0;
    while (contados < dias) {
        data.setDate(data.getDate() + 1);
        const dow = data.getDay();
        if (dow !== 0 && dow !== 6) contados++;
    }
    return `${data.getFullYear()}-${String(data.getMonth() + 1).padStart(2, '0')}-${String(data.getDate()).padStart(2, '0')}`;
}

function getDataIntimacaoAtividade(a) {
    return converterDataISO(a['DATA DA INTIMACAO'] || a['DATA DA INTIMAÇÃO'] || '');
}

/** Vencimento = intimação + prazo (dias úteis). Em linhas antigas (só PRAZO) usa o PRAZO. */
function getVencimentoAtividade(a) {
    const intimacao = getDataIntimacaoAtividade(a);
    const dias = parseInt(a['PRAZO (DIAS)'], 10) || 0;
    if (intimacao && dias > 0) return calcularDataVencimento(intimacao, dias);
    return converterDataISO(a.PRAZO || '');
}

// ==================== HELPERS DE PROCESSO / PASTA ====================
const REGEX_URL_HTTP = /^https?:\/\//i;

function processosDoCliente(cliente) {
    if (!cliente) return [];
    return processosCarregados.filter(p => p.CLIENTE === cliente);
}

function rotuloProcesso(p, lista) {
    const numero = String(p['N PROCESSO'] || '').trim();
    if (numero) return numero;

    const base = String(p['TIPO DE ACAO'] || p['TIPO PROCESSO'] || 'sem ação').trim();
    const semNumero = lista.filter(x => !String(x['N PROCESSO'] || '').trim());
    const rotulo = `Sem nº · ${base}`;
    return semNumero.length > 1 ? `${rotulo} (${semNumero.indexOf(p) + 1})` : rotulo;
}

/** Monta o select de processos com os processos do cliente. O value é a linha (_row), não o número. */
function preencherProcessosDoCliente(cliente) {
    const select = document.getElementById('atividadeProcesso');
    if (!select) return [];

    const lista = processosDoCliente(cliente);

    if (!cliente) {
        select.innerHTML = '<option value="">Selecione um cliente primeiro...</option>';
        select.disabled = true;
        return lista;
    }
    if (!lista.length) {
        select.innerHTML = '<option value="">Cliente sem processos cadastrados</option>';
        select.disabled = true;
        return lista;
    }

    select.innerHTML = '<option value="">Selecione um processo...</option>';
    lista.forEach(p => {
        const option = document.createElement('option');
        option.value = String(p._row);
        option.textContent = rotuloProcesso(p, lista);
        select.appendChild(option);
    });
    select.disabled = false;
    return lista;
}

/** Descobre qual processo do cliente corresponde a uma atividade já salva (ao editar). */
function localizarProcessoDaAtividade(a, lista) {
    const numero = String(a.PROCESSO || '').trim();

    if (numero) {
        const porNumero = lista.find(p => String(p['N PROCESSO'] || '').trim() === numero);
        if (porNumero) return porNumero;
    }

    const link = String(a.LINK || '').trim();
    if (link) {
        const porPasta = lista.filter(p => String(p.PASTA || '').trim() === link);
        if (porPasta.length === 1) return porPasta[0];
    }

    if (!numero) {
        const semNumero = lista.filter(p => !String(p['N PROCESSO'] || '').trim());
        if (semNumero.length === 1) return semNumero[0];
        if (lista.length === 1) return lista[0];
    }
    return null;
}

// ==================== TIPOS DE PRAZO (ABA DEFINICOES) ====================
async function carregarTiposPrazo() {
    if (tiposPrazoCarregados) return;

    try {
        await new Promise(r => setTimeout(r, 400));
        const dados = await carregarComCache('DEFINICOES');
        const lista = [];
        (dados || []).forEach(item => {
            const valor = String(item['TIPO DE PRAZO'] || '').trim();
            if (valor) lista.push(valor);
        });
        tiposPrazo = [...new Set(lista)];
        tiposPrazoCarregados = true;
    } catch (error) {
        console.error('❌ Erro ao carregar tipos de prazo:', error);
        notificar('Não foi possível carregar os tipos de prazo (aba DEFINICOES).', 'warning');
    }

    popularTiposPrazo();
}

function popularTiposPrazo() {
    const select = document.getElementById('atividadeTipoPrazo');
    if (!select) return;

    const atual = select.value;
    select.innerHTML = '<option value="">Selecione...</option>';
    tiposPrazo.forEach(tipo => {
        const option = document.createElement('option');
        option.value = tipo;
        option.textContent = tipo;
        select.appendChild(option);
    });
    if (atual) definirTipoPrazoNoSelect(atual);
}

/** Seleciona o tipo; se for um valor antigo que não está mais em DEFINICOES, mantém como opção. */
function definirTipoPrazoNoSelect(valor) {
    const select = document.getElementById('atividadeTipoPrazo');
    if (!select) return;

    const v = String(valor || '').trim();
    if (v && ![...select.options].some(o => o.value === v)) {
        select.appendChild(new Option(v, v));
    }
    select.value = v;
}

// ==================== INICIALIZAÇÃO ====================
async function inicializarAtividades() {
    await aguardarElementosAtividades();

    const btnNova = document.getElementById('btnNovaAtividade');
    if (btnNova) {
        btnNova.disabled = true;
        btnNova.innerHTML = '<i class="fas fa-spinner fa-pulse"></i> Carregando...';
    }

    await carregarDadosAtividades();

    if (btnNova) {
        btnNova.disabled = false;
        btnNova.innerHTML = '<i class="fas fa-plus"></i> Nova atividade';
    }

    initEventosAtividades();
}

function aguardarElementosAtividades() {
    return new Promise((resolve) => {
        const check = () => {
            const tbody = document.getElementById('tbodyAtividades');
            if (tbody) {
                resolve();
            } else {
                setTimeout(check, 100);
            }
        };
        check();
    });
}

function initEventosAtividades() {
    document.getElementById('btnNovaAtividade')?.addEventListener('click', () => abrirModalAtividade('novo'));

    document.getElementById('fecharModalAtividade')?.addEventListener('click', fecharModalAtividade);
    document.getElementById('cancelarAtividade')?.addEventListener('click', fecharModalAtividade);
    document.getElementById('modalAtividade')?.addEventListener('click', function (e) {
        if (e.target === this) fecharModalAtividade();
    });

    document.getElementById('salvarAtividade')?.addEventListener('click', salvarAtividade);

    document.getElementById('buscaAtividades')?.addEventListener('input', debounce(() => {
        aplicarFiltrosAtividades();
    }, 300));

    document.querySelectorAll('.filtros-rapidos .filtro-btn').forEach(btn => {
        btn.addEventListener('click', function () {
            document.querySelectorAll('.filtros-rapidos .filtro-btn').forEach(b => b.classList.remove('active'));
            this.classList.add('active');
            filtroAtualAtividades = this.getAttribute('data-filtro');
            aplicarFiltrosAtividades();
        });
    });

    document.getElementById('atividadeCliente')?.addEventListener('change', function () {
        preencherProcessosDoCliente(this.value);
    });
}

// ==================== CARREGAMENTO ====================
async function carregarDadosAtividades() {
    try {
        const clientes = await carregarComCache('CLIENTES');
        clientesCarregados = clientes.filter(c => c.NOME && String(c.NOME).trim());
        listaNomesClientes = clientesCarregados.map(c => c.NOME);
        await new Promise(r => setTimeout(r, 400));

        const processos = await carregarComCache('PROCESSOS');
        processosCarregados = processos.filter(p => p['N PROCESSO'] || p.CLIENTE);
        await new Promise(r => setTimeout(r, 400));

        const atividades = await carregarComCache('ATIVIDADES');
        todasAtividades = atividades.filter(a => a.CLIENTE || a.PROCESSO);

        dadosCarregados = true;

        preencherSelectClientes();
        preencherSelectProcessos();
        aplicarFiltrosAtividades();

        await carregarTiposPrazo();

    } catch (error) {
        console.error('❌ Erro ao carregar atividades:', error);
        mostrarErroAtividades();
    }
}

function preencherSelectClientes() {
    const select = document.getElementById('atividadeCliente');
    if (!select) return;

    select.innerHTML = '<option value="">Selecione um cliente...</option>';

    if (listaNomesClientes.length === 0) {
        select.innerHTML = '<option value="">Nenhum cliente cadastrado</option>';
        select.disabled = true;
        return;
    }

    listaNomesClientes.forEach(nome => {
        const option = document.createElement('option');
        option.value = nome;
        option.textContent = nome;
        select.appendChild(option);
    });

    select.disabled = false;
}

function preencherSelectProcessos() {
    const select = document.getElementById('atividadeProcesso');
    if (!select) return;

    select.innerHTML = '<option value="">Selecione um cliente primeiro...</option>';
    select.disabled = true;
}

function mostrarErroAtividades() {
    const tbody = document.getElementById('tbodyAtividades');
    if (tbody) {
        tbody.innerHTML = `<tr class="row-empty"><td colspan="8">Não foi possível carregar os dados. Verifique a conexão com a API.</td></tr>`;
    }
}

// ==================== FILTROS ====================
function aplicarFiltrosAtividades() {
    let filtrados = [...todasAtividades];

    if (filtroAtualAtividades !== 'todos') {
        const alvo = filtroAtualAtividades.toUpperCase()
            .normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();

        filtrados = filtrados.filter(a => {
            const st = String(a.STATUS || '').toUpperCase()
                .normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();
            const si = String(a.SITUACAO || a.SITUAÇÃO || '').toUpperCase()
                .normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();
            return st === alvo || si === alvo;
        });
    }

    const busca = (document.getElementById('buscaAtividades')?.value || '').toLowerCase().trim();
    if (busca) {
        filtrados = filtrados.filter(a =>
            String(a.CLIENTE || '').toLowerCase().includes(busca) ||
            String(a.PROCESSO || '').toLowerCase().includes(busca) ||
            String(a['TIPO DE PRAZO'] || '').toLowerCase().includes(busca) ||
            String(a.RESPONSAVEL || '').toLowerCase().includes(busca)
        );
    }

    filtrados.sort((a, b) => {
        const da = new Date(getVencimentoAtividade(a) || 0);
        const db = new Date(getVencimentoAtividade(b) || 0);
        return da - db;
    });

    renderizarTabelaAtividades(filtrados);
    setText('contagemAtividades', `${filtrados.length} atividades`);
}

// ==================== VERIFICAR PERFIL DO USUÁRIO ====================
function isTitular() {
    const u = auth.getUsuario();
    if (!u) return false;
    const r = String(u.role || '').toUpperCase()
        .normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();
    return r === 'ADM' || r === 'ADVOGADO TITULAR';
}

function isEstagiario() {
    const u = auth.getUsuario();
    if (!u) return false;
    const r = String(u.role || '').toUpperCase()
        .normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();
    return r === 'ESTAGIARIO';
}

// ==================== RENDERIZAÇÃO ====================
function renderizarTabelaAtividades(atividades) {
    const tbody = document.getElementById('tbodyAtividades');
    if (!tbody) return;

    if (!atividades.length) {
        tbody.innerHTML = `
            <tr class="row-empty">
                <td colspan="8">
                    <i class="fas fa-check-circle" style="color: var(--success);"></i>
                    Nenhuma atividade encontrada
                    <br><button class="btn-primary" style="margin-top: 0.5rem;" onclick="abrirModalAtividade('novo')">
                        <i class="fas fa-plus"></i> Criar atividade
                    </button>
                </td>
            </tr>`;
        return;
    }

    const titular = isTitular();
    const estagiario = isEstagiario();

    tbody.innerHTML = atividades.map(a => {
        const norm = s => String(s || '').trim().toUpperCase();
        const statusUp = norm(a.STATUS);
        const situacaoRaw = a.SITUACAO || a.SITUAÇÃO || '';
        const situacaoUp = norm(situacaoRaw);
        const jaProtocolado = situacaoUp === 'PROTOCOLADO';

        const criadoPor = inferirCriadoPor(a);
        const emProducao = isEmProducao(a.STATUS);
        const emAnalise = isEmAnalise(a.STATUS);

        const statusClass = getStatusAtividadeClass(a.STATUS);
        const situacaoClass = getSituacaoAtividadeClass(situacaoRaw);
        const intimacaoISO = getDataIntimacaoAtividade(a);
        const vencimento = getVencimentoAtividade(a);
        const prazoClass = getPrazoClass(vencimento);
        const tituloVencimento = vencimento ? `Vence em ${formatarData(vencimento)}` : '';

        const pastaUrl = String(a.LINK || '').trim();
        const pastaHtml = REGEX_URL_HTTP.test(pastaUrl)
            ? `<a class="link-pasta" href="${esc(pastaUrl).replace(/"/g, '&quot;')}" target="_blank" rel="noopener noreferrer" title="Abrir pasta no Drive"><i class="fas fa-folder-open"></i></a>`
            : '';

        let botoesAcao = '';

        if (titular) {
            const emProducaoDoEstagiario = emProducao && criadoPor === 'ESTAGIARIO';
            const emProducaoDoTitular    = emProducao && criadoPor === 'TITULAR';

            if (emAnalise || emProducaoDoEstagiario) {
                botoesAcao = `
                    <button class="btn-icon-small" onclick="aprovarAtividade('${a._row}')" title="Aprovar (CONFERIDO)" style="color: var(--success);">
                        <i class="fas fa-check-circle"></i>
                    </button>
                    <button class="btn-icon-small" onclick="corrigirAtividade('${a._row}')" title="Solicitar correção (CORRIGIR)" style="color: var(--warning);">
                        <i class="fas fa-undo-alt"></i>
                    </button>
                `;
            } else if (emProducaoDoTitular) {
                botoesAcao = `<span style="font-size: 0.7rem; color: var(--warning);">⏳ Aguardando estagiário</span>`;
            } else if (statusUp === 'CORRIGIR') {
                botoesAcao = `<span style="font-size: 0.7rem; color: var(--warning);">⏳ Aguardando estagiário</span>`;
            } else if (statusUp === 'CONFERIDO') {
                botoesAcao = jaProtocolado
                    ? `<span style="font-size: 0.7rem; color: var(--success);">✅ Protocolado</span>`
                    : `<span style="font-size: 0.7rem; color: var(--warning);">⏳ Aguardando protocolo</span>`;
            }
        } else if (estagiario) {
            const emProducaoDoTitular    = emProducao && criadoPor === 'TITULAR';
            const emProducaoDoEstagiario = emProducao && criadoPor === 'ESTAGIARIO';

            if (statusUp === 'CORRIGIR' || emProducaoDoTitular) {
                botoesAcao = `
                    <button class="btn-icon-small" onclick="enviarParaAnalise('${a._row}')" title="Enviar para análise (EM ANÁLISE)" style="color: var(--info);">
                        <i class="fas fa-paper-plane"></i>
                    </button>
                `;
            } else if (emProducaoDoEstagiario) {
                botoesAcao = `<span style="font-size: 0.7rem; color: var(--warning);">⏳ Aguardando análise</span>`;
            } else if (emAnalise) {
                botoesAcao = `<span style="font-size: 0.7rem; color: var(--warning);">⏳ Aguardando análise</span>`;
            } else if (statusUp === 'CONFERIDO') {
                botoesAcao = jaProtocolado
                    ? `<span style="font-size: 0.7rem; color: var(--success);">✅ Protocolado</span>`
                    : `<button class="btn-icon-small" onclick="protocolarAtividade('${a._row}')" title="Marcar como PROTOCOLADO" style="color: var(--success);">
                           <i class="fas fa-file-signature"></i>
                       </button>`;
            }
        }

        return `
            <tr>
                <td><strong>${esc(a.CLIENTE)}</strong></td>
                <td><span class="mono-text">${esc(a.PROCESSO)}</span></td>
                <td><span class="data-prazo ${prazoClass}" title="${tituloVencimento}">${formatarData(intimacaoISO || a.PRAZO)}</span></td>
                <td><span class="badge-tipo-prazo">${esc(a['TIPO DE PRAZO'])}</span></td>
                <td>${esc(a.RESPONSAVEL)}</td>
                <td><span class="status-com-pasta"><span class="status ${statusClass}">${esc(a.STATUS)}</span>${pastaHtml}</span></td>
                <td><span class="status ${situacaoClass}">${esc(situacaoRaw)}</span></td>
                <td>
                    <div style="display: flex; gap: 0.3rem; align-items: center; flex-wrap: wrap;">
                        <button class="btn-icon-small" onclick="editarAtividade('${a._row}')" title="Editar">
                            <i class="fas fa-edit"></i>
                        </button>
                        ${botoesAcao}
                        <button class="btn-icon-small" onclick="excluirAtividade('${a._row}')" title="Excluir" style="color: var(--danger);">
                            <i class="fas fa-trash"></i>
                        </button>
                    </div>
                </td>
            </tr>
        `;
    }).join('');
}

function getStatusAtividadeClass(status) {
    const s = String(status || '').toUpperCase()
        .normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    if (s.includes('EM PRODUCAO')) return 'pending';
    if (s.includes('EM ANALISE')) return 'pending';
    if (s.includes('CONFERIDO')) return 'completed';
    if (s.includes('CORRIGIR')) return 'urgent';
    return 'active';
}

function getSituacaoAtividadeClass(situacao) {
    const s = String(situacao || '').toUpperCase();
    if (s.includes('AGUARDANDO')) return 'pending';
    if (s.includes('PROTOCOLADO')) return 'completed';
    return 'active';
}

function getPrazoClass(data) {
    const dias = diasRestantes(data);
    if (dias === null) return '';
    if (dias < 0) return 'tipo-vencido';
    if (dias === 0) return 'tipo-hoje';
    if (dias <= 7) return 'tipo-proximo';
    return '';
}

// ==================== AÇÕES ====================

async function enviarParaAnalise(row) {
    if (processandoAcao) {
        notificar('Aguarde, processando...', 'warning');
        return;
    }

    if (!confirm('Enviar esta atividade para análise? O status será alterado para EM ANÁLISE.')) return;

    processandoAcao = true;

    try {
        const atividade = todasAtividades.find(a => String(a._row) === String(row));
        if (!atividade) {
            notificar('Atividade não encontrada', 'error');
            return;
        }

        await apiUpdate('ATIVIDADES', parseInt(row), { STATUS: 'EM ANÁLISE' });
        invalidarCacheAposEscrita('ATIVIDADES');
        notificar('📤 Atividade enviada para análise!', 'success');

        await carregarDadosAtividades();

    } catch (error) {
        console.error('❌ Erro ao enviar para análise:', error);
        notificar('Erro: ' + error.message, 'error');
    } finally {
        processandoAcao = false;
    }
}

async function aprovarAtividade(row) {
    if (processandoAcao) {
        notificar('Aguarde, processando...', 'warning');
        return;
    }

    if (!confirm('Aprovar esta atividade? O status será alterado para CONFERIDO.')) return;

    processandoAcao = true;

    try {
        const atividade = todasAtividades.find(a => String(a._row) === String(row));
        if (!atividade) {
            notificar('Atividade não encontrada', 'error');
            return;
        }

        await apiUpdate('ATIVIDADES', parseInt(row), { STATUS: 'CONFERIDO' });
        invalidarCacheAposEscrita('ATIVIDADES');
        notificar('✅ Atividade aprovada com sucesso!', 'success');

        await carregarDadosAtividades();

    } catch (error) {
        console.error('❌ Erro ao aprovar:', error);
        notificar('Erro: ' + error.message, 'error');
    } finally {
        processandoAcao = false;
    }
}

async function corrigirAtividade(row) {
    if (processandoAcao) {
        notificar('Aguarde, processando...', 'warning');
        return;
    }

    if (!confirm('Solicitar correção desta atividade? O status será alterado para CORRIGIR.')) return;

    processandoAcao = true;

    try {
        const atividade = todasAtividades.find(a => String(a._row) === String(row));
        if (!atividade) {
            notificar('Atividade não encontrada', 'error');
            return;
        }

        await apiUpdate('ATIVIDADES', parseInt(row), { STATUS: 'CORRIGIR' });
        invalidarCacheAposEscrita('ATIVIDADES');
        notificar('🔄 Correção solicitada!', 'success');

        await carregarDadosAtividades();

    } catch (error) {
        console.error('❌ Erro ao solicitar correção:', error);
        notificar('Erro: ' + error.message, 'error');
    } finally {
        processandoAcao = false;
    }
}

async function protocolarAtividade(row) {
    if (processandoAcao) {
        notificar('Aguarde, processando...', 'warning');
        return;
    }

    if (!isEstagiario()) {
        notificar('Apenas estagiários podem protocolar.', 'warning');
        return;
    }

    if (!confirm('Marcar esta atividade como PROTOCOLADA? Ela sairá do painel.')) return;

    processandoAcao = true;

    try {
        const atividade = todasAtividades.find(a => String(a._row) === String(row));
        if (!atividade) {
            notificar('Atividade não encontrada', 'error');
            return;
        }

        await apiUpdate('ATIVIDADES', parseInt(row), { SITUACAO: 'PROTOCOLADO' });
        invalidarCacheAposEscrita('ATIVIDADES');
        notificar('📄 Atividade protocolada!', 'success');

        await carregarDadosAtividades();

    } catch (error) {
        console.error('❌ Erro ao protocolar:', error);
        notificar('Erro: ' + error.message, 'error');
    } finally {
        processandoAcao = false;
    }
}

// ==================== MODAL ====================
function abrirModalAtividade(modo, row) {
    const modal = document.getElementById('modalAtividade');
    const titulo = document.getElementById('modalTituloAtividade');
    const form = document.getElementById('formAtividade');
    if (!modal || !form) return;

    form.reset();
    popularTiposPrazo();
    document.getElementById('atividadeRow').value = '';

    const btnSalvar = document.getElementById('salvarAtividade');
    if (btnSalvar) {
        btnSalvar.disabled = false;
        btnSalvar.innerHTML = '<i class="fas fa-save"></i> Salvar';
    }
    salvandoAtividade = false;

    const selectCliente = document.getElementById('atividadeCliente');
    const selectProcesso = document.getElementById('atividadeProcesso');

    if (selectCliente) {
        selectCliente.innerHTML = '<option value="">Selecione um cliente...</option>';

        if (listaNomesClientes.length === 0) {
            selectCliente.innerHTML = '<option value="">Nenhum cliente cadastrado</option>';
            selectCliente.disabled = true;
        } else {
            listaNomesClientes.forEach(nome => {
                const option = document.createElement('option');
                option.value = nome;
                option.textContent = nome;
                selectCliente.appendChild(option);
            });
            selectCliente.disabled = false;
        }
    }

    if (selectProcesso) {
        selectProcesso.innerHTML = '<option value="">Selecione um cliente primeiro...</option>';
        selectProcesso.disabled = true;
    }

    if (modo === 'editar' && row) {
        titulo.textContent = 'Editar Atividade';
        setTimeout(() => {
            carregarAtividadeParaEdicao(row);
        }, 100);
    } else {
        titulo.textContent = 'Nova Atividade';
        document.getElementById('atividadeDataIntimacao').value = hojeISOLocal();
        document.getElementById('atividadePrazoDias').value = 15;

        const selSit = document.getElementById('atividadeSituacao');
        if (selSit) selSit.value = 'AGUARDANDO';
    }

    modal.classList.add('active');
}

function fecharModalAtividade() {
    document.getElementById('modalAtividade')?.classList.remove('active');
    atividadeEditando = null;

    const btnSalvar = document.getElementById('salvarAtividade');
    if (btnSalvar) {
        btnSalvar.disabled = false;
        btnSalvar.innerHTML = '<i class="fas fa-save"></i> Salvar';
    }
    salvandoAtividade = false;
}

function carregarAtividadeParaEdicao(row) {
    const atividade = todasAtividades.find(a => String(a._row) === String(row));
    if (!atividade) return;

    document.getElementById('atividadeRow').value = row;
    document.getElementById('atividadeCliente').value = atividade.CLIENTE || '';

    const lista = preencherProcessosDoCliente(atividade.CLIENTE);
    const processo = localizarProcessoDaAtividade(atividade, lista);
    if (processo) {
        document.getElementById('atividadeProcesso').value = String(processo._row);
    }

    document.getElementById('atividadeDataIntimacao').value = getDataIntimacaoAtividade(atividade);
    definirTipoPrazoNoSelect(atividade['TIPO DE PRAZO']);
    document.getElementById('atividadePrazoDias').value = atividade['PRAZO (DIAS)'] || '';
    document.getElementById('atividadeResponsavel').value = atividade.RESPONSAVEL || '';

    const selSit = document.getElementById('atividadeSituacao');
    if (selSit) selSit.value = atividade.SITUACAO || atividade.SITUAÇÃO || 'AGUARDANDO';
}

// ==================== CRUD ====================
async function salvarAtividade() {
    if (salvandoAtividade) {
        notificar('Aguarde, salvando...', 'warning');
        return;
    }

    const row = document.getElementById('atividadeRow').value;
    const roleUsuario = isTitular() ? 'TITULAR' : 'ESTAGIARIO';

    let statusFinal;
    if (row) {
        const atual = todasAtividades.find(a => String(a._row) === String(row));
        statusFinal = atual?.STATUS || 'EM PRODUÇÃO';
    } else {
        statusFinal = 'EM PRODUÇÃO';
    }

    // O processo é identificado pela linha (_row) dentro dos processos do cliente escolhido,
    // porque o processo pode ainda não ter número.
    const clienteSel = document.getElementById('atividadeCliente')?.value || '';
    const processoRow = document.getElementById('atividadeProcesso')?.value || '';
    const processo = processosDoCliente(clienteSel).find(p => String(p._row) === String(processoRow));

    const dataIntimacao = document.getElementById('atividadeDataIntimacao')?.value || '';
    const tipoPrazo = document.getElementById('atividadeTipoPrazo')?.value || '';
    const prazoDias = parseInt(document.getElementById('atividadePrazoDias')?.value, 10) || 0;
    const responsavel = document.getElementById('atividadeResponsavel')?.value || '';

    if (!clienteSel || !processo || !dataIntimacao || !tipoPrazo || prazoDias < 1 || !responsavel) {
        notificar('Preencha todos os campos obrigatórios!', 'warning');
        return;
    }

    const dados = {
        'CLIENTE': clienteSel,
        'PROCESSO': String(processo['N PROCESSO'] || '').trim(),
        'DATA DA INTIMACAO': dataIntimacao,
        'TIPO DE PRAZO': tipoPrazo,
        'PRAZO (DIAS)': prazoDias,
        'RESPONSAVEL': responsavel,
        'STATUS': statusFinal,
        'SITUACAO': document.getElementById('atividadeSituacao')?.value || 'AGUARDANDO'
    };

    // Link da pasta vem da aba PROCESSOS (coluna PASTA). Se o processo ainda não tem pasta,
    // não mexe no LINK (não apaga um link que já exista na atividade).
    const pasta = String(processo.PASTA || '').trim();
    if (pasta) dados['LINK'] = pasta;

    if (!row) {
        dados['CRIADO_POR_ROLE'] = roleUsuario;
    }

    salvandoAtividade = true;
    const btnSalvar = document.getElementById('salvarAtividade');
    if (btnSalvar) {
        btnSalvar.disabled = true;
        btnSalvar.innerHTML = '<i class="fas fa-spinner fa-pulse"></i> Salvando...';
    }

    try {
        if (row) {
            await apiUpdate('ATIVIDADES', parseInt(row), dados);
            notificar('Atividade atualizada!', 'success');
        } else {
            await apiCreate('ATIVIDADES', dados);
            notificar('Atividade criada!', 'success');

            // Cada nova atividade sobrescreve esses 3 dados no processo correspondente.
            try {
                await apiUpdate('PROCESSOS', parseInt(processo._row, 10), {
                    // Cabeçalho da aba PROCESSOS pode estar com ou sem acento; a chave que
                    // não existir na planilha é ignorada pela API.
                    'DATA DA INTIMACAO': dataIntimacao,
                    'DATA DA INTIMAÇÃO': dataIntimacao,
                    'TIPO DE PRAZO': tipoPrazo,
                    'PRAZO (DIAS)': prazoDias
                });
                invalidarCacheAposEscrita('PROCESSOS');
            } catch (erroProcesso) {
                console.error('Erro ao atualizar o processo:', erroProcesso);
                notificar('A atividade foi criada, mas não foi possível atualizar os dados no processo: ' + erroProcesso.message, 'warning', 8000);
            }
        }

        invalidarCacheAposEscrita('ATIVIDADES');

        fecharModalAtividade();
        await carregarDadosAtividades();

    } catch (error) {
        console.error('Erro ao salvar:', error);
        notificar('Erro: ' + error.message, 'error');
    } finally {
        salvandoAtividade = false;
        if (btnSalvar) {
            btnSalvar.disabled = false;
            btnSalvar.innerHTML = '<i class="fas fa-save"></i> Salvar';
        }
    }
}

function editarAtividade(row) {
    abrirModalAtividade('editar', row);
}

async function excluirAtividade(row) {
    if (!confirm('Tem certeza que deseja excluir esta atividade?')) return;

    try {
        await apiDelete('ATIVIDADES', parseInt(row));
        invalidarCacheAposEscrita('ATIVIDADES');
        notificar('Atividade excluída!', 'success');
        await carregarDadosAtividades();
    } catch (error) {
        console.error('Erro ao excluir:', error);
        notificar('Erro: ' + error.message, 'error');
    }
}

// ==================== KEYBOARD SHORTCUTS ====================
document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') fecharModalAtividade();
});

// ==================== EXPORTAÇÃO GLOBAL ====================
window.inicializarAtividades = inicializarAtividades;
window.abrirModalAtividade = abrirModalAtividade;
window.fecharModalAtividade = fecharModalAtividade;
window.editarAtividade = editarAtividade;
window.excluirAtividade = excluirAtividade;
window.salvarAtividade = salvarAtividade;
window.enviarParaAnalise = enviarParaAnalise;
window.aprovarAtividade = aprovarAtividade;
window.corrigirAtividade = corrigirAtividade;
window.protocolarAtividade = protocolarAtividade;
window.inferirCriadoPor = inferirCriadoPor;