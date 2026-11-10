# Questões para discussão em sala

## 1. Qual é a diferença entre consumir uma API diretamente no frontend e consumi-la por meio de um backend?

No consumo direto, o navegador chama a API externa: é mais simples, mas o frontend fica acoplado ao formato da API, expõe chaves (quando existem), depende de CORS e não tem um lugar central para validar, padronizar erros, aplicar cache ou limitar requisições.
Passando por um backend (o gateway), o frontend conversa com um contrato próprio (`/api/clima`). O backend esconde a API externa, valida a entrada, trata erros com códigos HTTP padronizados (400, 404, 502), pode guardar histórico e cache, e a API externa pode ser trocada sem mudar o frontend. O custo é mais um componente para hospedar e um pequeno aumento de latência.

## 2. Por que as consultas meteorológicas utilizam latitude e longitude em vez de apenas o nome da cidade?

Nomes são ambíguos (existem várias "Salvador", "São José", "Santa Maria"), mudam de idioma e grafia, e os modelos meteorológicos trabalham em uma grade geográfica: a previsão é calculada para um ponto. Coordenadas identificam esse ponto sem ambiguidade. Por isso o fluxo tem duas etapas: o Geocoding transforma o nome em coordenadas (e permite escolher entre homônimas), e o Forecast usa as coordenadas.

## 3. Qual é a diferença entre dados meteorológicos atuais e uma previsão?

Os dados atuais (`current`) descrevem as condições do momento mais recente (temperatura, sensação térmica, umidade, vento, UV), com um horário de observação. A previsão (`daily`) é uma estimativa de modelos numéricos para os próximos dias (máximas, mínimas, condição predominante) e tem incerteza que cresce com o tempo: o dia seguinte é bem mais confiável que o quinto dia.

## 4. O que deve acontecer quando a Open-Meteo deixa de responder ou excede o tempo limite?

A aplicação não pode travar nem mostrar um erro técnico. Cada chamada externa tem tempo limite (`AbortSignal.timeout`, 8 s por padrão). Se a API falhar ou estourar o tempo, o microsserviço responde 502 e o gateway repassa **502 · falha de serviço externo**. O frontend mostra uma mensagem amigável ("serviço indisponível, tente novamente") e o usuário pode tentar de novo com o botão Atualizar. Melhorias possíveis: novas tentativas com espera crescente (*retry com backoff*), cache da última resposta válida e *circuit breaker* para não sobrecarregar um serviço fora do ar.

## 5. Quais são as vantagens de separar os serviços de localização e meteorologia?

- **Responsabilidade única:** cada serviço faz uma coisa e é mais fácil de entender e testar.
- **Escala e implantação independentes:** cada um pode ser atualizado, reiniciado ou escalado sem derrubar o outro.
- **Isolamento de falhas:** se o Geocoding cair, o serviço de meteorologia continua funcionando para coordenadas já conhecidas.
- **Reuso e troca de fornecedor:** o serviço de localização pode servir outros sistemas, e a fonte de dados de qualquer um deles pode ser trocada sem mexer no restante.
- **Cache específico:** localizações mudam raramente (cache longo); clima muda a cada hora (cache curto).

Como desvantagem, há mais processos para gerenciar e mais chamadas de rede, e é por isso que o gateway centraliza a orquestração.
