const { criarApp } = require('./app');

const PORT = Number(process.env.PORT_LOCALIZACAO || process.env.PORT || 3001);
const TIMEOUT_MS = Number(process.env.TIMEOUT_MS || 8000);

criarApp({ timeoutMs: TIMEOUT_MS }).listen(PORT, () => {
  console.log(`Microsserviço de localização em http://localhost:${PORT}`);
});
