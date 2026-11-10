// Microsserviço de meteorologia: consulta condições atuais e previsão de
// 5 dias na API Forecast do Open-Meteo a partir de latitude e longitude.
const express = require('express');

const FORECAST_URL = 'https://api.open-meteo.com/v1/forecast';

const VARIAVEIS_ATUAIS = [
  'temperature_2m',
  'apparent_temperature',
  'relative_humidity_2m',
  'weather_code',
  'wind_speed_10m',
  'wind_direction_10m',
  'uv_index',
  'is_day',
].join(',');

const VARIAVEIS_DIARIAS = ['weather_code', 'temperature_2m_max', 'temperature_2m_min', 'uv_index_max'].join(',');

function coordenadaValida(valor, limite) {
  const n = Number(valor);
  return valor !== undefined && valor !== '' && Number.isFinite(n) && Math.abs(n) <= limite ? n : null;
}

function criarApp({ timeoutMs = 8000, fetchFn = fetch } = {}) {
  const app = express();

  app.get('/saude', (_req, res) => res.json({ servico: 'meteorologia', status: 'ok' }));

  // GET /previsao?lat=-12.97&lon=-38.51
  app.get('/previsao', async (req, res) => {
    const lat = coordenadaValida(req.query.lat, 90);
    const lon = coordenadaValida(req.query.lon, 180);
    if (lat === null || lon === null) {
      return res.status(400).json({ erro: 'Informe lat (-90 a 90) e lon (-180 a 180) válidos.' });
    }

    const url =
      `${FORECAST_URL}?latitude=${lat}&longitude=${lon}` +
      `&current=${VARIAVEIS_ATUAIS}&daily=${VARIAVEIS_DIARIAS}` +
      `&forecast_days=5&timezone=auto&wind_speed_unit=kmh`;

    let d;
    try {
      const resposta = await fetchFn(url, { signal: AbortSignal.timeout(timeoutMs) });
      if (!resposta.ok) throw new Error(`Forecast respondeu ${resposta.status}`);
      d = await resposta.json();
    } catch (erro) {
      return res.status(502).json({ erro: 'Serviço de previsão do tempo indisponível.', detalhe: erro.message });
    }

    const c = d.current ?? {};
    const daily = d.daily ?? { time: [] };

    res.json({
      fusoHorario: d.timezone,
      atual: {
        horario: c.time,
        temperatura: c.temperature_2m,
        sensacaoTermica: c.apparent_temperature,
        umidade: c.relative_humidity_2m,
        codigoWmo: c.weather_code,
        ventoVelocidade: c.wind_speed_10m,
        ventoDirecao: c.wind_direction_10m,
        indiceUv: c.uv_index,
        dia: c.is_day === 1,
      },
      unidades: {
        temperatura: d.current_units?.temperature_2m ?? '°C',
        vento: d.current_units?.wind_speed_10m ?? 'km/h',
      },
      previsao: daily.time.map((data, i) => ({
        data,
        codigoWmo: daily.weather_code?.[i],
        maxima: daily.temperature_2m_max?.[i],
        minima: daily.temperature_2m_min?.[i],
        uvMaximo: daily.uv_index_max?.[i],
      })),
    });
  });

  return app;
}

module.exports = { criarApp };
