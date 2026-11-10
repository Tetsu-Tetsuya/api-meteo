// Testes obrigatórios do gateway (cenários da tabela da atividade).
// Os microsserviços são simulados por um fetch falso, então os testes
// rodam sem internet e de forma determinística.
const { test, before, after } = require('node:test');
const assert = require('node:assert');
const { criarApp } = require('../gateway/app');

const CIDADES = {
  salvador: { id: 3450554, nome: 'Salvador', estado: 'Bahia', pais: 'Brasil', latitude: -12.97, longitude: -38.51 },
  recife: { id: 3390760, nome: 'Recife', estado: 'Pernambuco', pais: 'Brasil', latitude: -8.05, longitude: -34.88 },
  'são paulo': { id: 3448439, nome: 'São Paulo', estado: 'São Paulo', pais: 'Brasil', latitude: -23.55, longitude: -46.63 },
};

const PREVISAO = {
  fusoHorario: 'America/Bahia',
  atual: { horario: '2026-11-09T23:00', temperatura: 26.1, sensacaoTermica: 28.4, umidade: 80, codigoWmo: 2, ventoVelocidade: 12, ventoDirecao: 90, indiceUv: 0, dia: false },
  unidades: { temperatura: '°C', vento: 'km/h' },
  previsao: [{ data: '2026-11-10', codigoWmo: 3, maxima: 30, minima: 24, uvMaximo: 9 }],
};

const json = (status, corpo) => new Response(JSON.stringify(corpo), { status, headers: { 'content-type': 'application/json' } });

let modo = 'normal';
async function fetchFalso(url) {
  if (modo === 'timeout') throw new DOMException('The operation was aborted due to timeout', 'TimeoutError');
  const u = new URL(url);
  if (u.pathname === '/localizacoes') {
    const local = CIDADES[u.searchParams.get('nome').toLowerCase()];
    return local ? json(200, { total: 1, resultados: [local] }) : json(404, { erro: 'Nenhuma localidade encontrada.' });
  }
  if (u.pathname === '/previsao') {
    if (modo === 'meteo-fora') return json(502, { erro: 'Serviço de previsão do tempo indisponível.' });
    return json(200, PREVISAO);
  }
  return json(404, {});
}

let servidor;
let base;
before(async () => {
  const app = criarApp({ localizacaoUrl: 'http://loc.test', meteorologiaUrl: 'http://met.test', fetchFn: fetchFalso });
  servidor = app.listen(0);
  await new Promise((r) => servidor.once('listening', r));
  base = `http://127.0.0.1:${servidor.address().port}`;
});
after(() => servidor.close());

const get = (caminho) => fetch(base + caminho);

for (const cidade of ['Salvador', 'Recife', 'São Paulo']) {
  test(`cidade=${cidade} → 200 consulta válida`, async () => {
    modo = 'normal';
    const r = await get(`/api/clima?cidade=${encodeURIComponent(cidade)}`);
    assert.strictEqual(r.status, 200);
    const corpo = await r.json();
    assert.strictEqual(corpo.local.nome, cidade);
    assert.ok(corpo.atual && Array.isArray(corpo.previsao));
  });
}

test('cidade vazia → 400 campo inválido', async () => {
  modo = 'normal';
  assert.strictEqual((await get('/api/clima?cidade=')).status, 400);
  assert.strictEqual((await get('/api/clima')).status, 400);
  assert.strictEqual((await get('/api/clima?cidade=%20%20')).status, 400);
});

test('cidade com 1 ou mais de 100 caracteres → 400', async () => {
  assert.strictEqual((await get('/api/clima?cidade=A')).status, 400);
  assert.strictEqual((await get(`/api/clima?cidade=${'a'.repeat(101)}`)).status, 400);
});

test('cidade inexistente → 404 local não encontrado', async () => {
  modo = 'normal';
  const r = await get('/api/clima?cidade=Cidadeinexistentexyz');
  assert.strictEqual(r.status, 404);
});

test('API externa indisponível → 502 falha de serviço externo', async () => {
  modo = 'meteo-fora';
  assert.strictEqual((await get('/api/clima?cidade=Salvador')).status, 502);
});

test('timeout ao chamar microsserviço → 502', async () => {
  modo = 'timeout';
  assert.strictEqual((await get('/api/clima?cidade=Salvador')).status, 502);
});

test('histórico guarda no máximo 5 cidades, sem repetição, mais recente primeiro', async () => {
  modo = 'normal';
  for (const c of ['Salvador', 'Recife', 'São Paulo', 'Salvador']) await get(`/api/clima?cidade=${encodeURIComponent(c)}`);
  const { historico } = await (await get('/api/historico')).json();
  assert.ok(historico.length <= 5);
  assert.strictEqual(historico[0].nome, 'Salvador');
  assert.strictEqual(new Set(historico.map((h) => h.id)).size, historico.length);
});
