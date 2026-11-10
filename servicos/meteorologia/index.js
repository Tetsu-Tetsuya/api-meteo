const { criarApp } = require('./app');

const PORT = Number(process.env.PORT_METEOROLOGIA || process.env.PORT || 3002);
const TIMEOUT_MS = Number(process.env.TIMEOUT_MS || 8000);

criarApp({ timeoutMs: TIMEOUT_MS }).listen(PORT, () => {
  console.log(`Microsserviço de meteorologia em http://localhost:${PORT}`);
});
