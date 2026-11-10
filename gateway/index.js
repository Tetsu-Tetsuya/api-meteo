const { criarApp } = require('./app');

const PORT = Number(process.env.PORT || 3000);

const app = criarApp({
  localizacaoUrl: process.env.LOCALIZACAO_URL || 'http://localhost:3001',
  meteorologiaUrl: process.env.METEOROLOGIA_URL || 'http://localhost:3002',
  timeoutMs: Number(process.env.TIMEOUT_MS || 8000),
});

app.listen(PORT, () => {
  console.log(`API Gateway + frontend em http://localhost:${PORT}`);
});
