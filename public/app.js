// Frontend: conversa apenas com o API Gateway (/api/...).
const $ = (id) => document.getElementById(id);

const estado = {
  localidades: [],
  atual: null, // { cidade, id } da última consulta
  consultas: new Map(), // id -> resposta completa de /api/clima (usado na comparação)
};

const MENSAGENS_STATUS = {
  400: 'Digite o nome de uma cidade com 2 a 100 caracteres.',
  404: 'Não encontramos essa cidade. Confira a grafia e tente novamente.',
  502: 'O serviço de meteorologia está indisponível no momento. Tente novamente em instantes.',
};

async function chamarApi(caminho) {
  let resposta;
  try {
    resposta = await fetch(caminho);
  } catch {
    throw new Error('Não foi possível falar com o servidor. Verifique se o gateway está rodando.');
  }
  const corpo = await resposta.json().catch(() => ({}));
  if (!resposta.ok) throw new Error(MENSAGENS_STATUS[resposta.status] || corpo.erro || 'Erro inesperado.');
  return corpo;
}

function mostrarMensagem(texto, tipo = 'info') {
  const el = $('mensagem');
  el.textContent = texto;
  el.className = `mensagem ${tipo}`;
}

const fmt = (n, casas = 1) => (n === null || n === undefined ? '—' : Number(n).toFixed(casas).replace('.', ','));

function rotuloCurto(l) {
  return l.estado && l.estado !== l.nome ? `${l.nome} – ${l.estado}` : `${l.nome} – ${l.pais ?? ''}`;
}

function nomeLocal(l) {
  return [l.nome, l.estado, l.pais].filter(Boolean).join(', ');
}

// O Open-Meteo devolve o horário local da cidade ("2026-11-09T23:00"); formatamos sem converter fuso.
function formatarHorario(iso) {
  if (!iso) return '—';
  const [data, hora] = iso.split('T');
  const [a, m, d] = data.split('-');
  return `${d}/${m}/${a} às ${hora}`;
}

function formatarDia(dataIso) {
  const [a, m, d] = dataIso.split('-').map(Number);
  const dt = new Date(a, m - 1, d);
  const semana = dt.toLocaleDateString('pt-BR', { weekday: 'short' }).replace('.', '');
  return `${semana} ${String(d).padStart(2, '0')}/${String(m).padStart(2, '0')}`;
}

function direcaoVento(graus) {
  if (graus === null || graus === undefined) return '';
  const pontos = ['N', 'NE', 'L', 'SE', 'S', 'SO', 'O', 'NO'];
  return pontos[Math.round(graus / 45) % 8];
}

function classificarUv(uv) {
  if (uv === null || uv === undefined) return '';
  if (uv < 3) return 'baixo';
  if (uv < 6) return 'moderado';
  if (uv < 8) return 'alto';
  if (uv < 11) return 'muito alto';
  return 'extremo';
}

// ---------- Busca de localidades (cidades homônimas) ----------
$('form-busca').addEventListener('submit', async (e) => {
  e.preventDefault();
  const cidade = $('cidade').value.trim();
  $('escolha').hidden = true;

  if (cidade.length < 2 || cidade.length > 100) {
    mostrarMensagem(MENSAGENS_STATUS[400], 'erro');
    return;
  }

  mostrarMensagem('Buscando localidades…');
  try {
    const { resultados } = await chamarApi(`/api/localidades?cidade=${encodeURIComponent(cidade)}`);
    estado.localidades = resultados;
    $('localidades').innerHTML = resultados
      .map((l, i) => `<option value="${i}">${nomeLocal(l)}</option>`)
      .join('');
    $('total-localidades').textContent =
      resultados.length === 1
        ? 'Encontramos 1 localidade.'
        : `Encontramos ${resultados.length} localidades. Escolha a cidade correta.`;
    $('escolha').hidden = false;
    mostrarMensagem('');
  } catch (erro) {
    mostrarMensagem(erro.message, 'erro');
  }
});

$('ver-clima').addEventListener('click', () => {
  const local = estado.localidades[Number($('localidades').value)];
  if (local) consultarClima(local.nome, local.id);
});

$('atualizar').addEventListener('click', () => {
  if (estado.atual) consultarClima(estado.atual.cidade, estado.atual.id);
});

// ---------- Consulta do clima ----------
async function consultarClima(cidade, id) {
  mostrarMensagem('Consultando as condições meteorológicas…');
  $('atualizar').disabled = true;
  try {
    const query = `cidade=${encodeURIComponent(cidade)}${id !== undefined ? `&id=${id}` : ''}`;
    const dados = await chamarApi(`/api/clima?${query}`);
    estado.atual = { cidade, id: dados.local.id };
    estado.consultas.set(dados.local.id, dados);
    renderizarResultado(dados);
    mostrarMensagem(`Dados atualizados para ${nomeLocal(dados.local)}.`, 'ok');
    await carregarHistorico();
    atualizarSelectsComparacao();
  } catch (erro) {
    mostrarMensagem(erro.message, 'erro');
  } finally {
    $('atualizar').disabled = false;
  }
}

function renderizarResultado({ local, atual, previsao, unidades }) {
  const wmo = descreverWmo(atual.codigoWmo, atual.dia);
  $('r-local').textContent = nomeLocal(local);
  $('r-coordenadas').textContent = `Latitude ${fmt(local.latitude, 4)} · Longitude ${fmt(local.longitude, 4)}`;
  $('r-horario').textContent = `Observação: ${formatarHorario(atual.horario)} (horário local)`;
  $('r-icone').textContent = wmo.icone;
  $('r-temperatura').textContent = `${fmt(atual.temperatura)} ${unidades.temperatura}`;
  $('r-descricao').textContent = wmo.descricao;
  $('r-sensacao').textContent = `${fmt(atual.sensacaoTermica)} ${unidades.temperatura}`;
  $('r-umidade').textContent = `${fmt(atual.umidade, 0)}%`;
  $('r-vento').innerHTML =
    `${fmt(atual.ventoVelocidade)} ${unidades.vento} · ${direcaoVento(atual.ventoDirecao)} ` +
    `<span class="seta" style="transform: rotate(${(atual.ventoDirecao ?? 0) + 180}deg)" title="${atual.ventoDirecao}°">↑</span>`;
  $('r-uv').textContent = `${fmt(atual.indiceUv)} (${classificarUv(atual.indiceUv)})`;

  $('r-previsao').innerHTML = previsao
    .map((p) => {
      const w = descreverWmo(p.codigoWmo);
      return `<li>
        <span class="dia">${formatarDia(p.data)}</span>
        <span class="icone" title="${w.descricao}">${w.icone}</span>
        <span class="max">${fmt(p.maxima, 0)}°</span>
        <span class="min">${fmt(p.minima, 0)}°</span>
      </li>`;
    })
    .join('');

  desenharGrafico(previsao);
  $('resultado').hidden = false;
}

// ---------- Gráfico SVG (máximas e mínimas) ----------
function desenharGrafico(previsao) {
  const L = 560, A = 220, mx = 40, my = 28;
  const valores = previsao.flatMap((p) => [p.maxima, p.minima]);
  const vMin = Math.floor(Math.min(...valores) - 2);
  const vMax = Math.ceil(Math.max(...valores) + 2);
  const x = (i) => mx + (i * (L - 2 * mx)) / Math.max(previsao.length - 1, 1);
  const y = (v) => A - my - ((v - vMin) / (vMax - vMin)) * (A - 2 * my);
  const linha = (campo) => previsao.map((p, i) => `${i ? 'L' : 'M'}${x(i)},${y(p[campo])}`).join(' ');
  const pontos = (campo, classe) =>
    previsao
      .map((p, i) => `<circle class="${classe}" cx="${x(i)}" cy="${y(p[campo])}" r="4"></circle>
        <text class="rotulo ${classe}" x="${x(i)}" y="${y(p[campo]) + (campo === 'maxima' ? -10 : 18)}">${fmt(p[campo], 0)}°</text>`)
      .join('');
  const eixoX = previsao
    .map((p, i) => `<text class="eixo" x="${x(i)}" y="${A - 4}">${formatarDia(p.data)}</text>`)
    .join('');

  $('grafico').innerHTML = `
    <svg viewBox="0 0 ${L} ${A}" role="img" aria-label="Gráfico de temperaturas máximas e mínimas por dia">
      <path class="linha max" d="${linha('maxima')}"></path>
      <path class="linha min" d="${linha('minima')}"></path>
      ${pontos('maxima', 'max')}${pontos('minima', 'min')}${eixoX}
    </svg>
    <p class="legenda"><span class="max">● Máxima</span> <span class="min">● Mínima</span></p>`;
}

// ---------- Histórico (guardado no gateway) ----------
async function carregarHistorico() {
  try {
    const { historico } = await chamarApi('/api/historico');
    const lista = $('lista-historico');
    if (historico.length === 0) {
      lista.innerHTML = '<li class="sutil">Nenhuma cidade consultada ainda.</li>';
      return;
    }
    lista.innerHTML = historico
      .map((h) => `<li><button type="button" class="link" data-cidade="${h.nome}" data-id="${h.id}">${nomeLocal(h)}</button></li>`)
      .join('');
  } catch {
    /* histórico é opcional para a tela */
  }
}

$('lista-historico').addEventListener('click', (e) => {
  const botao = e.target.closest('button[data-id]');
  if (botao) consultarClima(botao.dataset.cidade, Number(botao.dataset.id));
});

// ---------- Comparação de duas cidades ----------
function atualizarSelectsComparacao() {
  const opcoes = [...estado.consultas.values()]
    .map((d) => `<option value="${d.local.id}">${nomeLocal(d.local)}</option>`)
    .join('');
  ['comp-a', 'comp-b'].forEach((id, i) => {
    const sel = $(id);
    const anterior = sel.value;
    sel.innerHTML = `<option value="">Selecione…</option>${opcoes}`;
    if (anterior && estado.consultas.has(Number(anterior))) sel.value = anterior;
    else if (estado.consultas.size >= 2) sel.value = [...estado.consultas.keys()][i];
  });
  renderizarComparacao();
}

function renderizarComparacao() {
  const a = estado.consultas.get(Number($('comp-a').value));
  const b = estado.consultas.get(Number($('comp-b').value));
  const alvo = $('tabela-comparacao');
  if (estado.consultas.size < 2) {
    alvo.innerHTML = '<p class="sutil">Consulte pelo menos duas cidades para comparar.</p>';
    return;
  }
  if (!a || !b || a === b) {
    alvo.innerHTML = '<p class="sutil">Escolha duas cidades diferentes.</p>';
    return;
  }
  const linhas = a.previsao
    .map((pa, i) => {
      const pb = b.previsao[i] ?? {};
      return `<tr><td>${formatarDia(pa.data)}</td>
        <td>${fmt(pa.minima, 0)}° / ${fmt(pa.maxima, 0)}°</td>
        <td>${fmt(pb.minima, 0)}° / ${fmt(pb.maxima, 0)}°</td>
        <td>${fmt(pa.maxima - pb.maxima, 1)}°</td></tr>`;
    })
    .join('');
  alvo.innerHTML = `<div class="rolagem"><table>
    <thead><tr><th>Dia</th><th>${rotuloCurto(a.local)} (mín/máx)</th><th>${rotuloCurto(b.local)} (mín/máx)</th><th>Diferença máx.</th></tr></thead>
    <tbody>${linhas}</tbody></table></div>`;
}

$('comp-a').addEventListener('change', renderizarComparacao);
$('comp-b').addEventListener('change', renderizarComparacao);

carregarHistorico();
atualizarSelectsComparacao();
