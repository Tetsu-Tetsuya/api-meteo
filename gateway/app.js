// API Gateway: ponto único de entrada do frontend. Valida a entrada,
// orquestra os microsserviços de localização e meteorologia, padroniza
// os códigos HTTP e guarda o histórico das últimas 5 cidades.
const path = require('path');
const express = require('express');

const LIMITE_HISTORICO = 5;

class ErroHttp extends Error {
  constructor(status, mensagem) {
    super(mensagem);
    this.status = status;
  }
}

function validarCidade(valor) {
  const cidade = String(valor ?? '').trim();
  if (cidade.length < 2 || cidade.length > 100) {
    throw new ErroHttp(400, 'Campo "cidade" inválido: informe entre 2 e 100 caracteres.');
  }
  return cidade;
}

function criarApp({
  localizacaoUrl = 'http://localhost:3001',
  meteorologiaUrl = 'http://localhost:3002',
  timeoutMs = 8000,
  fetchFn = fetch,
} = {}) {
  const app = express();
  const historico = [];

  // Chama um microsserviço e converte falhas em erros HTTP padronizados.
  async function chamarServico(url, { repassar404 = false } = {}) {
    let resposta;
    try {
      resposta = await fetchFn(url, { signal: AbortSignal.timeout(timeoutMs) });
    } catch {
      throw new ErroHttp(502, 'Falha de serviço externo: tempo esgotado ou serviço indisponível.');
    }
    const corpo = await resposta.json().catch(() => ({}));
    if (resposta.ok) return corpo;
    if (resposta.status === 404 && repassar404) throw new ErroHttp(404, corpo.erro || 'Local não encontrado.');
    if (resposta.status === 400) throw new ErroHttp(400, corpo.erro || 'Requisição inválida.');
    throw new ErroHttp(502, corpo.erro || 'Falha de serviço externo.');
  }

  function buscarLocalidades(cidade) {
    return chamarServico(`${localizacaoUrl}/localizacoes?nome=${encodeURIComponent(cidade)}`, { repassar404: true });
  }

  function registrarHistorico(local) {
    const indice = historico.findIndex((h) => h.id === local.id);
    if (indice !== -1) historico.splice(indice, 1);
    historico.unshift({ ...local, consultadoEm: new Date().toISOString() });
    historico.length = Math.min(historico.length, LIMITE_HISTORICO);
  }

  app.use(express.static(path.join(__dirname, '..', 'public')));

  app.get('/api/saude', (_req, res) => res.json({ servico: 'gateway', status: 'ok' }));

  // Lista as localidades homônimas para o usuário escolher a correta.
  app.get('/api/localidades', async (req, res, next) => {
    try {
      const cidade = validarCidade(req.query.cidade);
      res.json(await buscarLocalidades(cidade));
    } catch (erro) {
      next(erro);
    }
  });

  // Consulta completa: localização + condições atuais + previsão de 5 dias.
  // ?id= escolhe uma localidade específica entre as homônimas.
  app.get('/api/clima', async (req, res, next) => {
    try {
      const cidade = validarCidade(req.query.cidade);
      const { resultados } = await buscarLocalidades(cidade);

      const id = req.query.id !== undefined ? Number(req.query.id) : null;
      const local = id === null ? resultados[0] : resultados.find((r) => r.id === id);
      if (!local) throw new ErroHttp(404, 'A localidade escolhida não foi encontrada.');

      const clima = await chamarServico(`${meteorologiaUrl}/previsao?lat=${local.latitude}&lon=${local.longitude}`);

      registrarHistorico(local);
      res.json({ local, ...clima });
    } catch (erro) {
      next(erro);
    }
  });

  app.get('/api/historico', (_req, res) => res.json({ historico }));

  app.use('/api', (_req, res) => res.status(404).json({ erro: 'Rota não encontrada.' }));

  // eslint-disable-next-line no-unused-vars
  app.use((erro, _req, res, _next) => {
    const status = erro.status || 500;
    if (status === 500) console.error(erro);
    res.status(status).json({ status, erro: erro.message || 'Erro interno.' });
  });

  return app;
}

module.exports = { criarApp, validarCidade };
