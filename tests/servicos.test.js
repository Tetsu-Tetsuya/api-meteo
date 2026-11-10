// Testes dos microsserviços com o Open-Meteo simulado.
const { test } = require('node:test');
const assert = require('node:assert');
const localizacao = require('../servicos/localizacao/app');
const meteorologia = require('../servicos/meteorologia/app');

const json = (status, corpo) => new Response(JSON.stringify(corpo), { status });

async function comServidor(app, fn) {
  const s = app.listen(0);
  await new Promise((r) => s.once('listening', r));
  try {
    await fn(`http://127.0.0.1:${s.address().port}`);
  } finally {
    s.close();
  }
}

test('localização: converte resposta do Geocoding', async () => {
  const fetchFn = async () =>
    json(200, { results: [{ id: 1, name: 'Salvador', admin1: 'Bahia', country: 'Brasil', country_code: 'BR', latitude: -12.97, longitude: -38.51 }] });
  await comServidor(localizacao.criarApp({ fetchFn }), async (base) => {
    const r = await fetch(`${base}/localizacoes?nome=Salvador`);
    assert.strictEqual(r.status, 200);
    const { resultados } = await r.json();
    assert.deepStrictEqual(resultados[0].estado, 'Bahia');
  });
});

test('localização: sem resultados → 404; entrada inválida → 400; falha → 502', async () => {
  let resposta = json(200, {});
  const fetchFn = async () => {
    if (resposta instanceof Error) throw resposta;
    return resposta;
  };
  await comServidor(localizacao.criarApp({ fetchFn }), async (base) => {
    assert.strictEqual((await fetch(`${base}/localizacoes?nome=Xyzxyz`)).status, 404);
    assert.strictEqual((await fetch(`${base}/localizacoes?nome=`)).status, 400);
    resposta = new Error('rede fora');
    assert.strictEqual((await fetch(`${base}/localizacoes?nome=Salvador`)).status, 502);
  });
});

test('meteorologia: monta condições atuais e 5 dias', async () => {
  const fetchFn = async (url) => {
    assert.match(url, /forecast_days=5/);
    return json(200, {
      timezone: 'America/Bahia',
      current: { time: '2026-11-09T23:00', temperature_2m: 26, apparent_temperature: 28, relative_humidity_2m: 80, weather_code: 1, wind_speed_10m: 10, wind_direction_10m: 90, uv_index: 0, is_day: 0 },
      current_units: { temperature_2m: '°C', wind_speed_10m: 'km/h' },
      daily: { time: ['2026-11-10', '2026-11-11'], weather_code: [1, 61], temperature_2m_max: [30, 29], temperature_2m_min: [24, 23], uv_index_max: [9, 8] },
    });
  };
  await comServidor(meteorologia.criarApp({ fetchFn }), async (base) => {
    const r = await fetch(`${base}/previsao?lat=-12.97&lon=-38.51`);
    assert.strictEqual(r.status, 200);
    const d = await r.json();
    assert.strictEqual(d.atual.sensacaoTermica, 28);
    assert.strictEqual(d.previsao.length, 2);
    assert.strictEqual(d.previsao[1].codigoWmo, 61);
  });
});

test('meteorologia: coordenadas inválidas → 400; Open-Meteo fora → 502', async () => {
  const fetchFn = async () => json(503, {});
  await comServidor(meteorologia.criarApp({ fetchFn }), async (base) => {
    assert.strictEqual((await fetch(`${base}/previsao?lat=abc&lon=1`)).status, 400);
    assert.strictEqual((await fetch(`${base}/previsao?lat=95&lon=1`)).status, 400);
    assert.strictEqual((await fetch(`${base}/previsao?lat=1&lon=1`)).status, 502);
  });
});
