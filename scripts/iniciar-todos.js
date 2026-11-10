// Sobe os três processos (2 microsserviços + gateway) com um único comando.
const { spawn } = require('child_process');
const path = require('path');

const raiz = path.join(__dirname, '..');
const processos = [
  { nome: 'localizacao', arquivo: 'servicos/localizacao/index.js', env: { PORT_LOCALIZACAO: '3001' } },
  { nome: 'meteorologia', arquivo: 'servicos/meteorologia/index.js', env: { PORT_METEOROLOGIA: '3002' } },
  { nome: 'gateway', arquivo: 'gateway/index.js', env: { PORT: process.env.PORT || '3000' } },
];

const filhos = processos.map(({ nome, arquivo, env }) => {
  const ambiente = { ...process.env };
  delete ambiente.PORT;
  const filho = spawn(process.execPath, [path.join(raiz, arquivo)], {
    env: { ...ambiente, ...env },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  const prefixar = (dados) =>
    dados.toString().trimEnd().split('\n').forEach((linha) => console.log(`[${nome}] ${linha}`));
  filho.stdout.on('data', prefixar);
  filho.stderr.on('data', prefixar);
  filho.on('exit', (codigo) => console.log(`[${nome}] encerrado (código ${codigo})`));
  return filho;
});

const encerrar = () => {
  filhos.forEach((f) => f.kill());
  process.exit(0);
};
process.on('SIGINT', encerrar);
process.on('SIGTERM', encerrar);
