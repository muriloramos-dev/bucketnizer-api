# Testes de carga com k6

Os scripts reproduzem fluxos autenticados da API atual:

- `realistic_users.js`: modelo de usuários virtuais com uma ação sorteada a cada iteração: listar pastas (10%), navegar miniaturas (32%), abrir e baixar uma foto (25%), enviar uma foto (20%) ou consultar um upload pendente (13%). Cada VU mantém sua própria lista de uploads pendentes e consulta um deles em iterações posteriores; entre as ações, espera um tempo aleatório de 3 a 8 segundos.
- `upload_journey.js`: cria um ticket em `POST /files/upload`, envia os bytes ao S3, aguarda o processamento assíncrono chegar a `READY`, pede a URL original e baixa o objeto do S3.
- `browse_journey.js`: lista miniaturas em uma pasta, abre uma foto aleatória, pede a URL original e baixa os bytes do S3.

O backend valida um Cognito **access token**. Use uma conta descartável/de teste. `K6_TOKEN` aceita um token; `K6_TOKENS_JSON` aceita um array JSON de tokens, selecionados em rodízio por VU. Cada token precisa ter acesso aos seus próprios dados. Não coloque tokens no repositório.

## Preparação

1. Inicie a API apontada por `K6_BASE_URL` e confirme que ela usa a configuração de teste desejada (MongoDB, bucket, SQS e worker/processador reais ou isolados).
2. Exporte um access token de teste sem salvá-lo em arquivo versionado.
3. Para navegação, crie previamente uma pasta com pelo menos uma imagem processada como `READY` em cada conta usada; passe esse caminho em `K6_PATH`.
4. Instale o k6 conforme a documentação oficial e rode primeiro com um VU e duração curta. Execute os comandos a partir da raiz `bucketnizer-api` como nos exemplos abaixo. Se já estiver dentro de `k6/`, use `k6 run realistic_users.js` (sem repetir o prefixo `k6/`).

Exemplo de navegação:

```bash
K6_BASE_URL=http://127.0.0.1:3000 \
K6_TOKEN="$COGNITO_ACCESS_TOKEN" \
K6_PATH="fotos-de-teste" \
K6_START_VUS=1 K6_PEAK_VUS=1 K6_RAMP_UP=10s K6_HOLD=30s K6_RAMP_DOWN=10s \
k6 run k6/browse_journey.js
```

Exemplo ponta a ponta de upload e leitura:

```bash
K6_BASE_URL=http://127.0.0.1:3000 \
K6_TOKEN="$COGNITO_ACCESS_TOKEN" \
K6_START_VUS=1 K6_PEAK_VUS=1 K6_RAMP_UP=10s K6_HOLD=30s K6_RAMP_DOWN=10s \
k6 run k6/upload_journey.js
```

Exemplo de usuários com ações variadas:

```bash
K6_BASE_URL=http://127.0.0.1:3000 \
K6_TOKEN="$COGNITO_ACCESS_TOKEN" \
K6_PATH="k6-carga-outubro" \
K6_START_VUS=1 K6_PEAK_VUS=20 K6_RAMP_UP=2m K6_HOLD=10m K6_RAMP_DOWN=1m \
k6 run k6/realistic_users.js
```

## Configuração

| Variável | Padrão | Uso |
| --- | --- | --- |
| `K6_BASE_URL` | `http://127.0.0.1:3000` | URL base da API |
| `K6_TOKEN` | — | Cognito access token para uma conta |
| `K6_TOKENS_JSON` | — | Array JSON de access tokens, usado em rodízio por VU |
| `K6_PATH` | `k6-<run id>` | Pasta de leitura; o script de upload grava nesta pasta |
| `K6_RUN_ID` | `load-test` | Identificador usado para nomear a pasta do teste, caso `K6_PATH` não seja informado |
| `K6_START_VUS` | `1` | VUs iniciais |
| `K6_PEAK_VUS` | `10` | Pico de usuários virtuais |
| `K6_RAMP_UP` | `2m` | Duração da subida |
| `K6_HOLD` | `5m` | Duração no pico |
| `K6_RAMP_DOWN` | `1m` | Duração da descida |
| `K6_THINK_TIME_SECONDS` | `1` | Pausa dos dois fluxos focados; `realistic_users.js` usa pausas aleatórias de 3 a 8 segundos |
| `K6_READY_TIMEOUT_MS` | `120000` | Tempo máximo esperando processamento |
| `K6_POLL_INTERVAL_SECONDS` | `2` | Intervalo de consulta do estado |
| `K6_UPLOAD_FILE` | `./fixtures/sample.svg` relativo a `k6/` | Fixture enviado pelo fluxo de upload |
| `K6_UPLOAD_CONTENT_TYPE` | `image/svg+xml` | MIME correspondente à fixture |
| `K6_UPLOAD_FILENAME` | `k6-sample.svg` | Nome enviado à API |

Substitua a fixture SVG por imagens de teste representativas para medir tamanhos e custos próximos dos reais. Altere em conjunto o arquivo, MIME e nome.

## Leitura dos resultados

Os limites iniciais exigem menos de 5% de requests HTTP com falha, pelo menos 95% de checks aprovados e p95 abaixo de 1,5 s para endpoints da API usados nos fluxos. O fluxo de upload também mede `upload_to_ready_ms` e exige p95 abaixo de 120 s. São referências iniciais, não SLOs definidos para o produto. Examine também `http_req_duration`, taxa de iterações, falhas, throughput e duração até `READY`.

As requisições ao S3 usam as tags `s3_download_thumbnail`, `s3_upload_original` e `s3_download_original`; latência da API e latência do S3 ficam assim separadas. O tempo de processamento de imagem depende do S3/SQS/worker e é verificado por polling de status. Para diagnosticar gargalos, correlacione os horários com CPU/memória da API, pool/conexões e consultas/índices do MongoDB, idade e profundidade da fila, concorrência do worker, throttling/erros e métricas de requisição do S3.

## Efeitos do teste

O fluxo de upload cria registros, pastas e objetos de forma persistente e os downloads geram tráfego/custo no S3. Os scripts não removem dados automaticamente. Rode primeiro em infraestrutura e contas de teste, use uma pasta `k6-*` dedicada e limite VUs/duração inicialmente; remova os dados de teste pela política operacional da sua instalação depois da análise. Aumente a carga gradualmente e acompanhe limites e custos dos serviços externos.
