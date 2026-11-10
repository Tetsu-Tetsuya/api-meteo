// Microsserviço de localização: converte o nome de uma cidade em coordenadas
// usando a API de Geocoding do Open-Meteo.
const express = require('express');

const GEOCODING_URL = 'https://geocoding-api.open-meteo.com/v1/search';

function criarApp({ timeoutMs = 8000, fetchFn = fetch } = {}) {
  const app = express();

  app.get('/saude', (_req, res) => res.json({ servico: 'localizacao', status: 'ok' }));

  // GET /localizacoes?nome=Salvador
  app.get('/localizacoes', async (req, res) => {
    const nome = String(req.query.nome ?? '').trim();
    if (nome.length < 2 || nome.length > 100) {
      return res.status(400).json({ erro: 'O nome da cidade deve ter entre 2 e 100 caracteres.' });
    }

    const url = `${GEOCODING_URL}?name=${encodeURIComponent(nome)}&count=10&language=pt&format=json`;

    let dados;
    try {
      const resposta = await fetchFn(url, { signal: AbortSignal.timeout(timeoutMs) });
      if (!resposta.ok) throw new Error(`Geocoding respondeu ${resposta.status}`);
      dados = await resposta.json();
    } catch (erro) {
      return res.status(502).json({ erro: 'Serviço de geocodificação indisponível.', detalhe: erro.message });
    }

    const resultados = (dados.results ?? []).map((r) => ({
      id: r.id,
      nome: r.name,
      estado: r.admin1 ?? null,
      pais: r.country ?? null,
      codigoPais: r.country_code ?? null,
      latitude: r.latitude,
      longitude: r.longitude,
      fusoHorario: r.timezone ?? null,
    }));

    if (resultados.length === 0) {
      return res.status(404).json({ erro: `Nenhuma localidade encontrada para "${nome}".` });
    }

    res.json({ total: resultados.length, resultados });
  });

  return app;
}

module.exports = { criarApp };
