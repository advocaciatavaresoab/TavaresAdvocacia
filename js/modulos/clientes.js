
(function () {
'use strict';

// ==================== ESTADO ====================
let todosClientes = [];
let todosClientesRemovidos = [];
let todosProcessosParaRendimento = [];
let filtroAtualClientes = 'todos';
let filtroAtualClientesRemovidos = 'todos';
let salvandoCliente = false;
let atualizandoDados = false;
let abaClientesAtual = 'ativos';

const CAMPO_RENDIMENTO = 'REDIMENTO PARA O ESCRITORIO';

// ==================== PERMISSÕES ====================
function isTitular() {
    const u = auth.getUsuario();
    return !!u && (u.role === 'ADM' || u.role === 'ADVOGADO TITULAR');
}

function isEstagiario() {
    const u = auth.getUsuario();
    return !!u && u.role === 'ESTAGIARIO';
}

function totalColunas() {
    return isTitular() ? 13 : 12;
}

// ==================== HELPERS DOM ====================
function _setText(id, valor) {
    const el = document.getElementById(id);
    if (el) el.textContent = valor ?? '—';
}

function _setHTML(id, html) {
    const el = document.getElementById(id);
    if (el) el.innerHTML = html;
}

function _toggle(id, mostrar) {
    const el = document.getElementById(id);
    if (el) el.hidden = !mostrar;
}

function _val(id) {
    return document.getElementById(id)?.value?.trim() ?? '';
}

function _setVal(id, valor) {
    const el = document.getElementById(id);
    if (el) el.value = valor ?? '';
}

function _bind(el, evento, fn) {
    if (!el) return;
    const chave = 'bound' + evento;
    if (el.dataset[chave]) return;
    el.dataset[chave] = '1';
    el.addEventListener(evento, fn);
}

function _limparPayload(obj) {
    const { _row, IDADE_CALCULADA, RENDIMENTO_CALCULADO, ...resto } = obj;
    return resto;
}

// ==================== VALOR MONETÁRIO ====================
function converterValorMonetario(valor) {
    if (!valor) return 0;
    if (typeof valor === 'number') return valor;

    let s = String(valor).trim()
        .replace(/R\$\s*/gi, '')
        .replace(/\s/g, '')
        .replace(/\./g, '')
        .replace(/,/g, '.');

    let n = parseFloat(s);
    if (isNaN(n)) {
        const nums = String(valor).match(/\d+[,.]?\d*/g);
        if (nums) n = parseFloat(nums[nums.length - 1].replace(',', '.'));
    }
    return isNaN(n) ? 0 : n;
}

// ==================== PERMISSÕES VISUAIS ====================
function aplicarPermissoes() {
    const titular = isTitular();

    ['colunaRendimentos', 'colunaRendimentosRemovidos'].forEach(id => {
        const th = document.getElementById(id);
        if (th) th.hidden = !titular;
    });

    document.body.classList.toggle('titular-logado', titular);
}

// ==================== ABAS ====================
function trocarAbaClientes(aba) {
    abaClientesAtual = aba;

    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.tab === aba);
    });

    const tabAtivos = document.getElementById('tabClientesAtivos');
    const tabRemovidos = document.getElementById('tabClientesRemovidos');
    if (tabAtivos) tabAtivos.style.display = aba === 'ativos' ? 'block' : 'none';
    if (tabRemovidos) tabRemovidos.style.display = aba === 'removidos' ? 'block' : 'none';

    if (aba === 'ativos') aplicarFiltrosClientes();
    else aplicarFiltrosClientesRemovidos();
}

// ==================== INICIALIZAÇÃO ====================
async function inicializarClientes() {
    //console.log('👥 Inicializando clientes...');

    await aguardarElementosClientes();

    initEventosClientes();
    aplicarPermissoes();

    if (isTitular()) await carregarProcessosParaCalculo();

    await carregarClientes();
    await carregarClientesRemovidos();

    aplicarPermissoes();
    setTimeout(aplicarPermissoes, 500);

    trocarAbaClientes('ativos');
}

function aguardarElementosClientes() {
    return new Promise(resolve => {
        const check = () => {
            if (document.getElementById('tbodyClientes') && document.getElementById('buscaCliente')) {
                resolve();
            } else {
                setTimeout(check, 100);
            }
        };
        check();
    });
}

// ==================== PROCESSOS / RENDIMENTO (SOMENTE TITULAR) ====================
async function carregarProcessosParaCalculo() {
    if (!isTitular()) {
        todosProcessosParaRendimento = [];
        return;
    }
    try {
        const ativos = await carregarComCache('PROCESSOS').catch(() => []);
        const removidos = await carregarComCache('PROCESSOS_REMOVIDOS').catch(() => []);
        const todos = [...ativos, ...removidos];
        todosProcessosParaRendimento = todos.filter(p => p.CLIENTE && String(p.CLIENTE).trim());
        //console.log(`📋 ${todosProcessosParaRendimento.length} processos carregados.`);
    } catch (e) {
        console.error('Erro ao carregar processos:', e);
        todosProcessosParaRendimento = [];
    }
}

function calcularRendimentoCliente(nomeCliente) {
    if (!isTitular()) return 0;
    if (!nomeCliente || !todosProcessosParaRendimento.length) return 0;
    const nome = String(nomeCliente).trim().toUpperCase();

    return todosProcessosParaRendimento
        .filter(p => String(p.CLIENTE || '').trim().toUpperCase() === nome)
        .reduce((acc, p) => {
            const valor = p['VALOR DA CAUSA'] || p['Valor da Causa'] || '';
            return acc + converterValorMonetario(valor);
        }, 0);
}

function contarProcessosCliente(nomeCliente) {
    if (!isTitular()) return 0;
    if (!nomeCliente || !todosProcessosParaRendimento.length) return 0;
    const nome = String(nomeCliente).trim().toUpperCase();

    return todosProcessosParaRendimento.filter(p =>
        String(p.CLIENTE || '').trim().toUpperCase() === nome
    ).length;
}

async function atualizarRendimentoNaPlanilha(cliente) {
    if (!isTitular()) return false;
    if (!cliente || !cliente._row) return false;

    const novoRendimento = calcularRendimentoCliente(cliente.NOME);
    const rendimentoFormatado = formatarMoeda(novoRendimento);

    const novaContagem = contarProcessosCliente(cliente.NOME);

    const rendAtual = cliente[CAMPO_RENDIMENTO] || 'R$ 0,00';
    const rendAtualNum = converterValorMonetario(rendAtual);

    const countAtual = parseInt(cliente['N PROCESSOS'] || 0, 10);

    const rendimentoMudou = Math.abs(novoRendimento - rendAtualNum) > 0.01;
    const contagemMudou = novaContagem !== countAtual;

    if (!rendimentoMudou && !contagemMudou) {
        cliente.RENDIMENTO_CALCULADO = novoRendimento;
        return true;
    }

    try {
        const payload = _limparPayload({
            ...cliente,
            [CAMPO_RENDIMENTO]: rendimentoFormatado,
            'N PROCESSOS': String(novaContagem)
        });

        await apiUpdate('CLIENTES', parseInt(cliente._row), payload);

        cliente[CAMPO_RENDIMENTO] = rendimentoFormatado;
        cliente.RENDIMENTO_CALCULADO = novoRendimento;
        cliente['N PROCESSOS'] = String(novaContagem);

        return true;
    } catch (e) {
        console.error(`Erro ao atualizar dados de ${cliente.NOME}:`, e);
        return false;
    }
}

async function verificarECorrigirTodosRendimentos() {
    if (!isTitular()) return 0;
    let processados = 0;
    for (const c of todosClientes) {
        const ok = await atualizarRendimentoNaPlanilha(c);
        if (ok) processados++;
    }
    //console.log(`✅ ${processados}/${todosClientes.length} clientes atualizados.`);
    return processados;
}

async function atualizarDadosClientes() {
    if (!isTitular()) return notificar('Sem permissão.', 'warning');
    if (atualizandoDados) return notificar('Já está atualizando...', 'warning');

    const btn = document.getElementById('btnAtualizarDados');
    const conteudoOriginal = btn ? btn.innerHTML : '';

    atualizandoDados = true;

    if (btn) {
        btn.disabled = true;
        btn.innerHTML = '<i class="fas fa-sync-alt"></i> Atualizando...';
    }

    try {
        cacheGlobal.invalidarVarias(['PROCESSOS', 'PROCESSOS_REMOVIDOS', 'CLIENTES', 'CLIENTES_REMOVIDOS']);

        await carregarProcessosParaCalculo();

        const processados = await verificarECorrigirTodosRendimentos();

        await carregarClientes();
        await carregarClientesRemovidos();

        notificar(`✅ ${processados} clientes verificados.`, 'success');
    } catch (e) {
        console.error('Erro ao atualizar dados:', e);
        notificar('Erro ao atualizar: ' + e.message, 'error');
    } finally {
        atualizandoDados = false;
        if (btn) {
            btn.disabled = false;
            btn.innerHTML = conteudoOriginal;
        }
    }
}

async function recalcularRendimentos() {
    if (!isTitular()) return notificar('Sem permissão.', 'warning');
    await atualizarDadosClientes();
}

// ==================== CARREGAR CLIENTES ====================
async function carregarClientes() {
    try {
        const titular = isTitular();
        const dados = await carregarComCache('CLIENTES');

        todosClientes = dados
            .filter(c => c.NOME && String(c.NOME).trim())
            .map(c => {
                const dn = c['Data de Nascimento'];
                if (dn) c.IDADE_CALCULADA = calcularIdade(dn);

                if (titular) {
                    c.RENDIMENTO_CALCULADO = calcularRendimentoCliente(c.NOME);
                } else {
                    delete c[CAMPO_RENDIMENTO];
                }
                return c;
            });

        //console.log(`📋 Clientes ativos: ${todosClientes.length}`);

        atualizarStatsClientes();
        if (abaClientesAtual === 'ativos') aplicarFiltrosClientes();
        _setText('badgeClientesAtivos', todosClientes.length);

    } catch (e) {
        console.error('Erro ao carregar clientes:', e);
    }
}

async function carregarClientesRemovidos() {
    try {
        const titular = isTitular();
        const dados = await carregarComCache('CLIENTES_REMOVIDOS').catch(() => []);

        todosClientesRemovidos = dados
            .filter(c => c.NOME && String(c.NOME).trim())
            .map(c => {
                const dn = c['Data de Nascimento'];
                if (dn) c.IDADE_CALCULADA = calcularIdade(dn);
                if (!titular) delete c[CAMPO_RENDIMENTO];
                return c;
            });

        //console.log(`🗑️ Clientes removidos: ${todosClientesRemovidos.length}`);

        if (abaClientesAtual === 'removidos') aplicarFiltrosClientesRemovidos();
        _setText('badgeClientesRemovidos', todosClientesRemovidos.length);
    } catch (e) {
        console.error('Erro ao carregar clientes removidos:', e);
    }
}

// ==================== STATS ====================
function atualizarStatsClientes() {
    const total = todosClientes.length;
    const ativos = todosClientes.filter(c => c.STATUS === 'ATIVO').length;
    const inativos = todosClientes.filter(c => c.STATUS === 'INATIVO').length;
    const masc = todosClientes.filter(c => c.SEXO === 'MASCULINO').length;
    const fem = todosClientes.filter(c => c.SEXO === 'FEMININO').length;
    const pf = todosClientes.filter(c => c['TIPO DE CLIENTE'] === 'PF').length;
    const pj = todosClientes.filter(c => c['TIPO DE CLIENTE'] === 'PJ').length;

    _setText('totalClientes', total);
    _setText('clientesAtivos', ativos);
    _setText('clientesInativos', inativos);
    _setText('clientesSexo', `${masc}/${fem}`);
    _setText('clientesTipo', `${pf}/${pj}`);
}

// ==================== FILTROS ====================
function _filtrarPorBusca(lista) {
    const busca = (_val('buscaCliente') || '').toLowerCase();
    if (!busca) return lista;
    return lista.filter(c =>
        String(c.NOME || '').toLowerCase().includes(busca) ||
        String(c.CPF || '').toLowerCase().includes(busca) ||
        String(c.CIDADE || '').toLowerCase().includes(busca) ||
        String(c.CONTATO || '').toLowerCase().includes(busca)
    );
}

function aplicarFiltrosClientes() {
    let lista = [...todosClientes];

    if (filtroAtualClientes === 'todos') {
        lista = lista.filter(c => c.STATUS === 'ATIVO' || c.STATUS === 'PENDENTE');
    } else if (['ATIVO', 'INATIVO', 'PENDENTE'].includes(filtroAtualClientes)) {
        lista = lista.filter(c => c.STATUS === filtroAtualClientes);
    } else if (['PF', 'PJ'].includes(filtroAtualClientes)) {
        lista = lista.filter(c => c['TIPO DE CLIENTE'] === filtroAtualClientes);
    }

    lista = _filtrarPorBusca(lista);

    renderizarTabelaClientes(lista);
    _setText('contagemClientes', `${lista.length} de ${todosClientes.length} registros`);
}

function aplicarFiltrosClientesRemovidos() {
    let lista = [...todosClientesRemovidos];

    if (['ATIVO', 'INATIVO', 'PENDENTE'].includes(filtroAtualClientesRemovidos)) {
        lista = lista.filter(c => c.STATUS === filtroAtualClientesRemovidos);
    } else if (['PF', 'PJ'].includes(filtroAtualClientesRemovidos)) {
        lista = lista.filter(c => c['TIPO DE CLIENTE'] === filtroAtualClientesRemovidos);
    }

    lista = _filtrarPorBusca(lista);

    renderizarTabelaClientesRemovidos(lista);
    _setText('contagemClientesRemovidos', `${lista.length} de ${todosClientesRemovidos.length} registros`);
}

// ==================== RENDER — ATIVOS ====================
function renderizarTabelaClientes(clientes) {
    const tbody = document.getElementById('tbodyClientes');
    if (!tbody) return;

    if (!clientes.length) {
        tbody.innerHTML = `<tr class="row-empty"><td colspan="${totalColunas()}"><i class="fas fa-search"></i> Nenhum cliente encontrado</td></tr>`;
        aplicarPermissoes();
        return;
    }

    const titular = isTitular();

    tbody.innerHTML = clientes.map(c => {
        const statusClass = c.STATUS === 'ATIVO' ? 'active'
            : c.STATUS === 'INATIVO' ? 'pending' : 'completed';
        const tipoClass = c['TIPO DE CLIENTE'] === 'PJ' ? 'pj' : 'pf';
        const nome = esc(c.NOME);
        const idade = c.IDADE_CALCULADA ?? '—';

        let acoes = `
            <button class="btn-icon-small" title="Visualizar" onclick="verDetalhesCliente(${c._row})">
                <i class="fas fa-eye"></i>
            </button>
        `;

        if (titular) {
            acoes += `
                <button class="btn-icon-small" title="Editar" onclick="abrirEdicaoCliente(${c._row})">
                    <i class="fas fa-edit"></i>
                </button>
                ${c.STATUS === 'INATIVO'
                    ? `<button class="btn-icon-small" title="Reativar" onclick="reativarCliente(${c._row})" style="color:var(--success);border-color:var(--success);"><i class="fas fa-undo"></i></button>`
                    : `<button class="btn-icon-small" title="Tornar Inativo" onclick="tornarClienteInativo(${c._row})" style="color:var(--warning);border-color:var(--warning);"><i class="fas fa-user-slash"></i></button>`
                }
                <button class="btn-icon-small danger" title="Excluir" onclick="confirmarExclusaoCliente(${c._row})">
                    <i class="fas fa-trash"></i>
                </button>
            `;
        }

        let rendimentoCell = '';
        if (titular) {
            const rendimentoExibicao = c[CAMPO_RENDIMENTO]
                || formatarMoeda(c.RENDIMENTO_CALCULADO || 0);
            rendimentoCell = `
                <td class="rendimento-cell">
                    <strong class="text-success">${rendimentoExibicao}</strong>
                </td>
            `;
        }

        return `
            <tr>
                <td>
                    <div class="cliente-nome">
                        <div class="avatar-small"><i class="fas fa-user"></i></div>
                        <div>
                            <strong>${nome}</strong>
                            ${idade !== '—' ? `<br><small>${idade} anos</small>` : ''}
                            ${c.STATUS === 'INATIVO' ? `<span class="badge-inativo-inline">INATIVO</span>` : ''}
                        </div>
                    </div>
                </td>
                <td><i class="fas fa-phone"></i> ${esc(c.CONTATO)}</td>
                <td><span class="mono-text">${esc(c.CPF)}</span></td>
                <td><i class="fas fa-map-marker-alt"></i> ${esc(c.CIDADE)}</td>
                <td>${idade}</td>
                <td><span class="badge-tipo ${tipoClass}">${esc(c['TIPO DE CLIENTE']) || 'PF'}</span></td>
                <td>${esc(c.SEXO)}</td>
                <td><span class="badge-processos">${c['N PROCESSOS'] || 0}</span></td>
                <td><span class="status ${statusClass}">${esc(c.STATUS)}</span></td>
                <td><span class="mono-text">${formatarData(c['DATA ENTRADA'])}</span></td>
                ${rendimentoCell}
                <td>${esc(c.OBS || '')}</td>
                <td><div class="acoes">${acoes}</div></td>
            </tr>
        `;
    }).join('');

    aplicarPermissoes();
}

// ==================== RENDER — REMOVIDOS ====================
function renderizarTabelaClientesRemovidos(clientes) {
    const tbody = document.getElementById('tbodyClientesRemovidos');
    if (!tbody) return;

    if (!clientes.length) {
        tbody.innerHTML = `<tr class="row-empty"><td colspan="${totalColunas()}"><i class="fas fa-search"></i> Nenhum cliente excluído encontrado</td></tr>`;
        aplicarPermissoes();
        return;
    }

    const titular = isTitular();

    tbody.innerHTML = clientes.map(c => {
        const statusClass = c.STATUS === 'ATIVO' ? 'active'
            : c.STATUS === 'INATIVO' ? 'pending' : 'completed';
        const tipoClass = c['TIPO DE CLIENTE'] === 'PJ' ? 'pj' : 'pf';
        const nome = esc(c.NOME);
        const idade = c.IDADE_CALCULADA ?? '—';

        let acoes = `
            <button class="btn-icon-small" title="Visualizar" onclick="verDetalhesClienteRemovido(${c._row})">
                <i class="fas fa-eye"></i>
            </button>
        `;

        if (titular) {
            acoes += `
                <button class="btn-restaurar" onclick="restaurarCliente(${c._row})">
                    <i class="fas fa-undo"></i> Restaurar
                </button>
            `;
        }

        let rendimentoCell = '';
        if (titular) {
            rendimentoCell = `
                <td class="rendimento-cell">
                    <strong class="text-success">${c[CAMPO_RENDIMENTO] || 'R$ 0,00'}</strong>
                </td>
            `;
        }

        return `
            <tr>
                <td>
                    <div class="cliente-nome">
                        <div class="avatar-small"><i class="fas fa-user"></i></div>
                        <div>
                            <strong>${nome}</strong>
                            ${idade !== '—' ? `<br><small>${idade} anos</small>` : ''}
                            <span class="badge-excluido-inline">EXCLUÍDO</span>
                        </div>
                    </div>
                </td>
                <td><i class="fas fa-phone"></i> ${esc(c.CONTATO)}</td>
                <td><span class="mono-text">${esc(c.CPF)}</span></td>
                <td><i class="fas fa-map-marker-alt"></i> ${esc(c.CIDADE)}</td>
                <td>${idade}</td>
                <td><span class="badge-tipo ${tipoClass}">${esc(c['TIPO DE CLIENTE']) || 'PF'}</span></td>
                <td>${esc(c.SEXO)}</td>
                <td><span class="badge-processos">${c['N PROCESSOS'] || 0}</span></td>
                <td><span class="status ${statusClass}">${esc(c.STATUS)}</span></td>
                <td><span class="mono-text">${formatarData(c['DATA ENTRADA'])}</span></td>
                ${rendimentoCell}
                <td>${esc(c.OBS || '')}</td>
                <td><div class="acoes">${acoes}</div></td>
            </tr>
        `;
    }).join('');

    aplicarPermissoes();
}

// ==================== MODAL VISUALIZAR — ATIVO ====================
function verDetalhesCliente(row) {
    const c = todosClientes.find(x => x._row === row);
    if (!c) return notificar('Cliente não encontrado', 'error');

    const modal = document.getElementById('modalVisualizarCliente');
    if (!modal) return;

    const titular = isTitular();

    _setText('viewClienteNome', c.NOME || '—');

    const statusEl = document.getElementById('viewClienteStatus');
    if (statusEl) {
        const s = c.STATUS || 'ATIVO';
        statusEl.textContent = s;
        statusEl.className = 'status ' + (
            s === 'ATIVO' ? 'active' : s === 'INATIVO' ? 'pending' : 'completed'
        );
    }

    const tipoEl = document.getElementById('viewClienteTipo');
    if (tipoEl) {
        const t = c['TIPO DE CLIENTE'] || 'PF';
        tipoEl.textContent = t;
        tipoEl.className = 'badge-tipo ' + (t === 'PJ' ? 'pj' : 'pf');
    }

    const idade = (c.IDADE_CALCULADA !== undefined && c.IDADE_CALCULADA !== null) ? c.IDADE_CALCULADA : null;
    const dataNascFmt = c['Data de Nascimento'] ? formatarData(c['Data de Nascimento']) : null;

    _setText('viewClienteContato', c.CONTATO || '—');
    _setText('viewClienteCpf', c.CPF || '—');
    _setText('viewClienteCidade', c.CIDADE || '—');
    _setText('viewClienteIdade',
        idade !== null
            ? `${idade} anos${dataNascFmt ? ` (${dataNascFmt})` : ''}`
            : (dataNascFmt || '—')
    );
    _setText('viewClienteSexo', c.SEXO || '—');
    _setText('viewClienteDataEntrada', formatarData(c['DATA ENTRADA']) || '—');

    _setText('viewClienteNProcessos', c['N PROCESSOS'] || 0);

    const nomeNorm = String(c.NOME || '').trim().toUpperCase();
    const processos = titular
        ? todosProcessosParaRendimento.filter(p =>
            String(p.CLIENTE || '').trim().toUpperCase() === nomeNorm)
        : [];

    _toggle('viewClienteRendimentoBox', titular);

    if (titular) {
        const rend = c[CAMPO_RENDIMENTO] || formatarMoeda(c.RENDIMENTO_CALCULADO || 0);
        _setText('viewClienteRendimento', rend);
        _setText('viewClienteRendimentoInfo',
            processos.length > 0
                ? `* Baseado em ${processos.length} processo(s) vinculado(s)`
                : '* Nenhum processo vinculado'
        );
    } else {
        _setText('viewClienteRendimento', '—');
        _setText('viewClienteRendimentoInfo', '');
    }

    if (titular && processos.length > 0) {
        _toggle('viewClienteProcessosBox', true);
        _setText('viewClienteProcessosCount', processos.length);
        _setHTML('viewClienteProcessosLista', processos.map(p => `
            <div class="processo-linha">
                <span class="processo-num">${esc(p['N PROCESSO'] || '—')}</span>
                <span class="processo-valor">${formatarMoeda(converterValorMonetario(p['VALOR DA CAUSA']))}</span>
            </div>
        `).join(''));
    } else {
        _toggle('viewClienteProcessosBox', false);
        _setHTML('viewClienteProcessosLista', '');
    }

    const senha = c['SENHA GOV'];
    _toggle('viewClienteSenhaGovBox', Boolean(senha));
    if (senha) _setText('viewClienteSenhaGov', senha);

    const obs = c.OBS;
    _toggle('viewClienteObsBox', Boolean(obs));
    if (obs) _setText('viewClienteObs', obs);

    modal.classList.add('active');
}

function fecharModalVisualizar() {
    document.getElementById('modalVisualizarCliente')?.classList.remove('active');
}

// ==================== MODAL VISUALIZAR — EXCLUÍDO ====================
function verDetalhesClienteRemovido(row) {
    const c = todosClientesRemovidos.find(x => x._row === row);
    if (!c) return notificar('Cliente não encontrado', 'error');

    const modal = document.getElementById('modalVisualizarClienteRemovido');
    if (!modal) return;

    const titular = isTitular();

    _setText('viewRemovidoNome', c.NOME || '—');

    const statusEl = document.getElementById('viewRemovidoStatus');
    if (statusEl) {
        const s = c.STATUS || 'INATIVO';
        statusEl.textContent = s;
        statusEl.className = 'status ' + (
            s === 'ATIVO' ? 'active' : s === 'INATIVO' ? 'pending' : 'completed'
        );
    }

    const tipoEl = document.getElementById('viewRemovidoTipo');
    if (tipoEl) {
        const t = c['TIPO DE CLIENTE'] || 'PF';
        tipoEl.textContent = t;
        tipoEl.className = 'badge-tipo ' + (t === 'PJ' ? 'pj' : 'pf');
    }

    const idade = (c.IDADE_CALCULADA !== undefined && c.IDADE_CALCULADA !== null) ? c.IDADE_CALCULADA : null;
    const dataNascFmt = c['Data de Nascimento'] ? formatarData(c['Data de Nascimento']) : null;

    _setText('viewRemovidoContato', c.CONTATO || '—');
    _setText('viewRemovidoCpf', c.CPF || '—');
    _setText('viewRemovidoCidade', c.CIDADE || '—');
    _setText('viewRemovidoIdade',
        idade !== null
            ? `${idade} anos${dataNascFmt ? ` (${dataNascFmt})` : ''}`
            : (dataNascFmt || '—')
    );
    _setText('viewRemovidoSexo', c.SEXO || '—');
    _setText('viewRemovidoDataEntrada', formatarData(c['DATA ENTRADA']) || '—');

    _setText('viewRemovidoNProcessos', c['N PROCESSOS'] || 0);

    _toggle('viewRemovidoRendimentoBox', titular);
    _setText('viewRemovidoRendimento', titular ? (c[CAMPO_RENDIMENTO] || 'R$ 0,00') : '—');

    const senha = c['SENHA GOV'];
    _toggle('viewRemovidoSenhaGovBox', Boolean(senha));
    if (senha) _setText('viewRemovidoSenhaGov', senha);

    const obs = c.OBS;
    _toggle('viewRemovidoObsBox', Boolean(obs));
    if (obs) _setText('viewRemovidoObs', obs);

    modal.classList.add('active');
}

function fecharModalVisualizarRemovido() {
    document.getElementById('modalVisualizarClienteRemovido')?.classList.remove('active');
}

// ==================== MODAL CADASTRO / EDIÇÃO ====================
function abrirModalCliente(modo, dados) {
    const modal = document.getElementById('modalCliente');
    const titulo = document.getElementById('modalTituloCliente');
    const form = document.getElementById('formCliente');
    if (!modal || !form) return;

    form.reset();
    _setVal('clienteRow', '');
    const btn = document.getElementById('salvarCliente');
    if (btn) {
        btn.disabled = false;
        btn.innerHTML = '<i class="fas fa-save"></i> Salvar';
    }

    if (modo === 'edicao' && dados) {
        titulo.textContent = 'Editar Cliente';
        _setVal('clienteRow', dados._row || '');
        _setVal('clienteNome', dados.NOME || '');
        _setVal('clienteContato', dados.CONTATO || '');
        _setVal('clienteCPF', dados.CPF || '');
        _setVal('clienteCidade', dados.CIDADE || '');
        _setVal('clienteDataNascimento', converterDataISO(dados['Data de Nascimento'] || ''));
        _setVal('clienteTipo', dados['TIPO DE CLIENTE'] || 'PF');
        _setVal('clienteSexo', dados.SEXO || 'MASCULINO');
        _setVal('clienteStatus', dados.STATUS || 'ATIVO');
        _setVal('clienteDataEntrada', converterDataISO(dados['DATA ENTRADA']));
        _setVal('clienteNProcessos', dados['N PROCESSOS'] || 0);
        _setVal('clienteSenhaGov', dados['SENHA GOV'] || '');
        _setVal('clienteObs', dados.OBS || '');
    } else {
        titulo.textContent = 'Novo Cliente';
        _setVal('clienteDataEntrada', new Date().toISOString().split('T')[0]);
        _setVal('clienteDataNascimento', '');
    }

    modal.classList.add('active');
}

function fecharModalCliente() {
    document.getElementById('modalCliente')?.classList.remove('active');
    const btn = document.getElementById('salvarCliente');
    if (btn) {
        btn.disabled = false;
        btn.innerHTML = '<i class="fas fa-save"></i> Salvar';
    }
}

async function abrirEdicaoCliente(row) {
    if (!isTitular()) return notificar('Sem permissão.', 'warning');
    if (salvandoCliente) {
        notificar('Aguarde a operação atual', 'warning');
        return;
    }
    try {
        const c = await apiGet('CLIENTES', row);
        abrirModalCliente('edicao', c);
    } catch (e) {
        console.error('Erro ao carregar cliente:', e);
        notificar('Erro ao carregar dados', 'error');
    }
}

// ==================== SALVAR ====================
async function salvarCliente() {
    if (salvandoCliente) {
        notificar('Aguarde, salvando...', 'warning');
        return;
    }

    const titular = isTitular();
    const row = _val('clienteRow');

    if (row && !titular) {
        return notificar('Sem permissão para editar.', 'warning');
    }

    const nomeCliente = _val('clienteNome');

    const dados = {
        'NOME': nomeCliente,
        'CONTATO': _val('clienteContato'),
        'CPF': _val('clienteCPF'),
        'CIDADE': _val('clienteCidade'),
        'Data de Nascimento': _val('clienteDataNascimento'),
        'TIPO DE CLIENTE': _val('clienteTipo') || 'PF',
        'SEXO': _val('clienteSexo') || 'MASCULINO',
        'STATUS': _val('clienteStatus') || 'ATIVO',
        'DATA ENTRADA': _val('clienteDataEntrada'),
        'N PROCESSOS': _val('clienteNProcessos') || '0',
        'SENHA GOV': _val('clienteSenhaGov'),
        'OBS': _val('clienteObs')
    };

    dados[CAMPO_RENDIMENTO] = titular
        ? formatarMoeda(calcularRendimentoCliente(nomeCliente))
        : 'R$ 0,00';

    if (!dados['NOME'] || !dados['CONTATO']) {
        notificar('Preencha Nome e Contato!', 'warning');
        return;
    }

    if (dados['CPF']) {
        const v = validarDocumento(dados['CPF']);
        if (!v.valido) {
            notificar(v.mensagem, 'warning');
            document.getElementById('clienteCPF')?.focus();
            return;
        }
    }

    salvandoCliente = true;
    const btn = document.getElementById('salvarCliente');
    if (btn) {
        btn.disabled = true;
        btn.innerHTML = '<i class="fas fa-spinner fa-pulse"></i> Salvando...';
    }

    try {
        if (row) {
            await apiUpdate('CLIENTES', parseInt(row), dados);
            notificar('Cliente atualizado com sucesso!', 'success');
        } else {
            await apiCreate('CLIENTES', dados);
            notificar('Cliente cadastrado com sucesso!', 'success');
        }
        fecharModalCliente();
        if (titular) await carregarProcessosParaCalculo();
        await carregarClientes();
    } catch (e) {
        console.error('Erro ao salvar cliente:', e);
        notificar('Erro ao salvar: ' + e.message, 'error');
    } finally {
        salvandoCliente = false;
        if (btn) {
            btn.disabled = false;
            btn.innerHTML = '<i class="fas fa-save"></i> Salvar';
        }
    }
}

// ==================== AÇÕES ====================
async function tornarClienteInativo(row) {
    if (!isTitular()) return notificar('Sem permissão.', 'warning');

    const c = todosClientes.find(x => x._row === row);
    if (!c) return notificar('Cliente não encontrado', 'error');
    if (c.STATUS === 'INATIVO') return notificar('Já está inativo.', 'warning');
    if (!confirm(`Tornar "${c.NOME}" inativo?`)) return;

    try {
        const payload = _limparPayload({ ...c, 'STATUS': 'INATIVO' });
        await apiUpdate('CLIENTES', parseInt(row), payload);
        notificar(`Cliente "${c.NOME}" marcado como INATIVO!`, 'success');
        await carregarClientes();
        await carregarClientesRemovidos();
    } catch (e) {
        console.error(e);
        notificar('Erro: ' + e.message, 'error');
    }
}

async function reativarCliente(row) {
    if (!isTitular()) return notificar('Sem permissão.', 'warning');

    const c = todosClientes.find(x => x._row === row);
    if (!c) return notificar('Cliente não encontrado', 'error');
    if (c.STATUS !== 'INATIVO') return notificar('Já está ativo.', 'warning');

    try {
        const payload = _limparPayload({ ...c, 'STATUS': 'ATIVO' });
        await apiUpdate('CLIENTES', parseInt(row), payload);
        notificar(`Cliente "${c.NOME}" reativado!`, 'success');
        await carregarClientes();
        await carregarClientesRemovidos();
    } catch (e) {
        console.error(e);
        notificar('Erro: ' + e.message, 'error');
    }
}

async function restaurarCliente(row) {
    if (!isTitular()) return notificar('Sem permissão.', 'warning');

    const c = todosClientesRemovidos.find(x => x._row === row);
    if (!c) return notificar('Cliente não encontrado', 'error');
    if (!confirm(`Restaurar o cliente "${c.NOME}"?`)) return;

    try {
        const payload = _limparPayload(c);
        await apiCreate('CLIENTES', payload);
        await apiDelete('CLIENTES_REMOVIDOS', row);

        notificar('Cliente restaurado com sucesso!', 'success');
        await carregarClientes();
        await carregarClientesRemovidos();
    } catch (e) {
        console.error(e);
        notificar('Erro: ' + e.message, 'error');
    }
}

async function confirmarExclusaoCliente(row) {
    if (!isTitular()) return notificar('Sem permissão.', 'warning');

    const c = todosClientes.find(x => x._row === row);
    if (!c) return notificar('Cliente não encontrado', 'error');
    if (!confirm(`Excluir cliente:\n\n${c.NOME}?`)) return;

    try {
        const payload = _limparPayload({ ...c, 'STATUS': 'INATIVO' });

        await apiCreate('CLIENTES_REMOVIDOS', payload);
        await apiDelete('CLIENTES', row);

        notificar('Cliente movido para CLIENTES_REMOVIDOS!', 'success');
        await carregarClientes();
        await carregarClientesRemovidos();
    } catch (e) {
        console.error(e);
        notificar('Erro: ' + e.message, 'error');
    }
}

// ==================== EVENTOS ====================
function initEventosClientes() {
    // Busca
    _bind(document.getElementById('buscaCliente'), 'input', debounce(() => {
        if (abaClientesAtual === 'ativos') aplicarFiltrosClientes();
        else aplicarFiltrosClientesRemovidos();
    }, 300));

    document.querySelectorAll('#tabClientesAtivos .filtro-btn').forEach(btn => {
        _bind(btn, 'click', function () {
            document.querySelectorAll('#tabClientesAtivos .filtro-btn').forEach(b => b.classList.remove('active'));
            this.classList.add('active');
            filtroAtualClientes = this.dataset.filtro;
            if (abaClientesAtual === 'ativos') aplicarFiltrosClientes();
        });
    });

    document.querySelectorAll('#tabClientesRemovidos .filtro-btn').forEach(btn => {
        _bind(btn, 'click', function () {
            document.querySelectorAll('#tabClientesRemovidos .filtro-btn').forEach(b => b.classList.remove('active'));
            this.classList.add('active');
            filtroAtualClientesRemovidos = this.dataset.filtro;
            if (abaClientesAtual === 'removidos') aplicarFiltrosClientesRemovidos();
        });
    });

    _bind(document.getElementById('btnAtualizarDados'), 'click', atualizarDadosClientes);

    // Modal cadastro
    _bind(document.getElementById('btnNovoCliente'), 'click', () => abrirModalCliente('novo'));
    _bind(document.getElementById('fecharModalCliente'), 'click', fecharModalCliente);
    _bind(document.getElementById('cancelarCliente'), 'click', fecharModalCliente);
    _bind(document.getElementById('salvarCliente'), 'click', salvarCliente);
    _bind(document.getElementById('modalCliente'), 'click', function (e) {
        if (e.target === this) fecharModalCliente();
    });

    // Modal visualizar ATIVO
    _bind(document.getElementById('fecharModalVisualizar'), 'click', fecharModalVisualizar);
    _bind(document.getElementById('fecharModalVisualizarBtn'), 'click', fecharModalVisualizar);
    _bind(document.getElementById('modalVisualizarCliente'), 'click', function (e) {
        if (e.target === this) fecharModalVisualizar();
    });

    // Modal visualizar EXCLUÍDO
    _bind(document.getElementById('fecharModalVisualizarRemovido'), 'click', fecharModalVisualizarRemovido);
    _bind(document.getElementById('fecharModalVisualizarRemovidoBtn'), 'click', fecharModalVisualizarRemovido);
    _bind(document.getElementById('modalVisualizarClienteRemovido'), 'click', function (e) {
        if (e.target === this) fecharModalVisualizarRemovido();
    });

    // Máscara CPF
    _bind(document.getElementById('clienteCPF'), 'input', function () {
        this.value = mascaraDocumento(this.value);
    });
    // Máscara TELEFONE
    _bind(document.getElementById('clienteContato'), 'input', function () {
    this.value = mascaraTelefone(this.value);
});
}

// ==================== ATALHOS ====================
if (window.__clientesKeydownHandler) {
    document.removeEventListener('keydown', window.__clientesKeydownHandler);
}
window.__clientesKeydownHandler = function (e) {
    if (e.key === 'Escape') {
        fecharModalCliente();
        fecharModalVisualizar();
        fecharModalVisualizarRemovido();
    }
};
document.addEventListener('keydown', window.__clientesKeydownHandler);

// ==================== DEBUG ====================
function debugProcessosCliente(nomeCliente) {
    if (!isTitular()) return console.log('⛔ Apenas titular.');
    if (!nomeCliente) return console.log('Use: debugProcessosCliente("Nome")');

    const nome = String(nomeCliente).trim().toUpperCase();
    const lista = todosProcessosParaRendimento.filter(p =>
        String(p.CLIENTE || '').trim().toUpperCase() === nome
    );

    if (!lista.length) return console.log(`❌ Nenhum processo para "${nomeCliente}"`);

    let total = 0;
    lista.forEach((p, i) => {
        const v = converterValorMonetario(p['VALOR DA CAUSA']);
        total += v;
        //console.log(`${i + 1}. ${p['N PROCESSO']} → ${formatarMoeda(v)}`);
    });
    console.log(`💰 Total: ${formatarMoeda(total)}`);
    return total;
}

// ==================== EXPORTAÇÃO GLOBAL ====================
window.inicializarClientes = inicializarClientes;
window.abrirModalCliente = abrirModalCliente;
window.fecharModalCliente = fecharModalCliente;
window.salvarCliente = salvarCliente;
window.verDetalhesCliente = verDetalhesCliente;
window.verDetalhesClienteRemovido = verDetalhesClienteRemovido;
window.fecharModalVisualizar = fecharModalVisualizar;
window.fecharModalVisualizarRemovido = fecharModalVisualizarRemovido;
window.abrirEdicaoCliente = abrirEdicaoCliente;
window.confirmarExclusaoCliente = confirmarExclusaoCliente;
window.tornarClienteInativo = tornarClienteInativo;
window.reativarCliente = reativarCliente;
window.restaurarCliente = restaurarCliente;
window.recalcularRendimentos = recalcularRendimentos;
window.atualizarDadosClientes = atualizarDadosClientes;
window.trocarAbaClientes = trocarAbaClientes;
window.debugProcessosCliente = debugProcessosCliente;
window.debugVerUsuario = () => {
    console.log('👤 Usuário:', auth.getUsuario());
    console.log('🔑 É titular?', isTitular());
    console.log('🎓 É estagiário?', isEstagiario());
};

//console.log('📋 Módulo clientes carregado.');
//console.log('🐛 Debug: debugVerUsuario()');
//console.log('🔄 Atualizar dados: clique no botão "Atualizar dados" ou chame atualizarDadosClientes()');
})();