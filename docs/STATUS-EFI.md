# Status: migração de pagamento (Mercado Pago → Efí Bank)

> Arquivo de continuidade entre máquinas/sessões. Se você (Claude) está lendo
> isso numa sessão nova, sem memória da conversa anterior, este é o estado
> real do projeto — não confie em ideias antigas de outra sessão que
> contradigam o que está escrito aqui.

## Race conditions sob doação simultânea -- testado de verdade (2026-08-01)

Cliente pediu certeza de que doações concorrentes (várias pessoas doando ao
mesmo tempo) não causam inconsistência. Em vez de só ler o código, rodei 3
cenários de concorrência real (`Promise.all`, não sequencial) contra o
Postgres de produção, com dados descartáveis:

1. **30 doações diferentes, mesmo streamer, disparadas ao mesmo tempo**:
   saldo final bateu exatamente com `30 × fatia esperada`, nenhuma perdida.
   Garantido pelo padrão `balance_cents = balance_cents + $2` dentro do
   `UPDATE` (o Postgres serializa escritas concorrentes na mesma linha por
   trava de linha, mesmo em `READ COMMITTED` -- não é uma leitura seguida
   de escrita em JS, que perderia incremento).
2. **O mesmo pagamento "chegando" 15x ao mesmo tempo** (simula webhook
   duplicado de verdade, não só sequencial): só 1 creditou.
   **Achado no processo**: a primeira versão dependia só de um
   `SELECT`-antes-de-`INSERT` dentro da transação, que tem uma janela de
   corrida teórica real (duas chamadas concorrentes podem passar pelo
   `SELECT` antes de qualquer uma commitar). Corrigido com uma **constraint
   única** no banco (`ledger_entries_payment_kind_unique`, migration 008)
   como garantia de verdade, não só convenção de aplicação -- o `INSERT`
   duplicado é recusado pelo Postgres, capturado com `SAVEPOINT`/`ROLLBACK
   TO SAVEPOINT` (sem isso, o erro aborta a transação inteira e o `COMMIT`
   final falharia mesmo capturando o erro em JS).
3. **5 pedidos de saque concorrentes pro mesmo streamer** (saldo só dava
   pra 1): exatamente 1 teve sucesso, os outros 4 falharam por saldo
   insuficiente (já tinha ido a zero), nenhum saque duplicado criado.
   Garantido pelo `SELECT ... FOR UPDATE` em `streamer_balances` dentro de
   `createWithdrawal` -- esse `FOR UPDATE` é o correto de manter (trava só
   a linha daquele streamer específico, não a plataforma inteira).

**Efeito colateral encontrado e corrigido**: `creditDonation` tinha um
`SELECT * FROM fee_config WHERE id = 1 FOR UPDATE` que travava a **única**
linha de configuração de taxa da plataforma inteira a cada doação -- ou
seja, doações de streamers completamente diferentes, em leilões diferentes,
serializavam entre si sem necessidade (fee_config quase nunca muda, não
precisava de trava). Removido; a constraint única do banco já garante a
idempotência sem precisar dessa trava global.

## Correção crítica de confiabilidade do saque (2026-08-01)

Revisão completa do fluxo de dinheiro pedida pelo cliente ("revise
totalmente, não podemos passar por problemas") encontrou e corrigiu um bug
real, com potencial de inconsistência de saldo em produção:

**O bug**: `POST /api/l/:id/admin/saque` chamava `ledgerStore.markWithdrawalSent()`
assim que `efiApi.enviarPix()` respondia `201 EM_PROCESSAMENTO` — tratando
a resposta síncrona como confirmação de sucesso. Só que essa mesma sessão
provou, com testes reais em Produção, que `EM_PROCESSAMENTO` não garante
nada: o resultado de verdade (`REALIZADO`/`NAO_REALIZADO`) chega depois,
assíncrono. Se isso rodasse com o `pix.send` liberado, um saque aceito mas
rejeitado depois ficaria marcado "enviado" com o saldo do streamer já
debitado, enquanto o dinheiro nunca saiu da Conta Master de verdade — e o
webhook só processava eventos de recebimento, nunca de status de envio, sem
nenhum caminho de reconciliação.

**A correção**:
- `POST /admin/saque` gera o `idEnvio` **antes** de chamar `enviarPix` e
  grava ele no saque (`ledgerStore.attachEfiEnvioId`) antes da chamada --
  se o processo cair logo depois de mandar pra Efí, o rastro do envio
  sobrevive. A resposta da rota não marca mais nada como concluído, só
  confirma que a solicitação foi aceita (`status: "pending"`).
- O webhook (`server.js`) agora diferencia eventos de recebimento
  (têm `txid`) de eventos de status de envio (têm `tipo`, sem `txid`,
  formato confirmado na doc oficial: `{tipo, status, gnExtras: {idEnvio,
  erro?}}`). Envio confirmado `REALIZADO` marca o saque como enviado de
  verdade; `NAO_REALIZADO` estorna o saldo automaticamente
  (`ledgerStore.resolveEnvioStatus`, compartilhado entre webhook e
  reconciliação). Status desconhecido não mexe em nada -- fica pending
  pra investigação manual em vez de arriscar um estorno ou confirmação
  errada.
- **`src/reconciliation.js` (novo)**: como a entrega do webhook de envio já
  se mostrou inconsistente em homologação (só 1 de 3 entregas chegou, ver
  seção de progresso abaixo), um job a cada 60s resolve saques que ficaram
  "pending" há mais de 2 minutos consultando `consultarEnvioPix`
  diretamente -- rede de segurança pro caso do webhook nunca chegar.

**Testado de ponta a ponta contra o Postgres de produção** (streamer/saque
descartáveis, limpos depois, nenhum dado real tocado): crédito de doação,
débito de saque, confirmação `REALIZADO`, idempotência (resolver 2x não
duplica nem reprocessa), estorno automático em `NAO_REALIZADO`, status
desconhecido deixado intacto, e detecção de saque "parado" pela
reconciliação (testado com timestamp forçado pra trás).

**Bug adicional achado durante esse teste**: `withdrawals.id`,
`streamers.id` e `payments.id` são `BIGSERIAL` -- o driver do Postgres
devolve `BIGINT` como **string**, não number. `rowToWithdrawal`,
`rowToStreamer` e `rowToPayment` não convertiam isso, então qualquer
comparação estrita (`===`) contra um id quebrava silenciosamente (pego ao
vivo: `findStalePendingWithdrawals` não achava um saque que a própria
query SQL confirmava ter retornado). Corrigido nos três `rowToX()` com
`Number()` explícito. Vale lembrar essa pegadinha em qualquer `rowToX()`
novo que vier a existir.

## Status em 2026-08-01: migração de código concluída, rodando em homologação

O Mercado Pago foi **removido por completo do código** (não é mais "em
transição" — não existe rota, arquivo nem UI de MP no repositório). O
fluxo de doação → cobrança Efí → webhook → crédito no ledger foi **testado
de ponta a ponta contra a Efí de verdade e o Postgres de produção**
(streamer descartável, limpo depois): taxa calculada certinha, cobrança
criada, QR buscado, pagamento marcado, saldo creditado corretamente,
idempotência confirmada (webhook duplicado não credita 2x).

`EFI_ENV=homologacao` no Railway agora mesmo -- o site em produção está
processando doações reais contra o ambiente de **teste** da Efí, não
contra dinheiro real, até alguém trocar essa variável conscientemente pra
`producao`.

**Conta de Produção confirmada ativa (2026-08-01)**: painel mostra conta
plena (Cartões, Antecipação de recebíveis, Investimentos, Depositar, sem
aviso de análise pendente). A chave Pix é **a mesma** pros dois ambientes
(`fd7aaa7e-c08c-4048-a9d3-30ce8c71163d`) -- chave é da conta, não do
ambiente de API; o que muda entre homologação/produção é só a
credencial/certificado usado pra chamar a API. Testado com sucesso: uma
cobrança real de R$1,00 criada em Produção (`status: ATIVA`), sem pagar
(evitado de propósito -- não expusemos o QR/copia-e-cola em nenhum log).

**Ainda falta antes de trocar `EFI_ENV` pra `producao` de verdade**:
`pix.send` (envio/saque) em Produção está **pendente, não confirmado**.

Teste feito em 2026-08-01: registrado webhook em Produção (`efiApi.registrarWebhook("producao", ...)`,
tinha esquecido isso antes -- é por ambiente, não compartilhado com
Homologação). `enviarPix` de R$1,00 (chave da empresa → chave pessoal do
dono, dentro do limite pré-aprovado de autoenvio) foi **aceito pela API**
duas vezes (`idEnvio` `8c7d1676b9771a65e9374ebc74f2a67c` e
`343d41df29d0be026f932f7e4f3a54e2`), mas nenhum dos dois completou.

Descoberto no processo: `consultarEnvioPix` estava com o **endpoint errado**
(`GET /v3/gn/pix/:idEnvio`, escrito por suposição/simetria, nunca
confirmado na doc -- erro meu). O certo, confirmado via busca:
`GET /v2/gn/pix/enviados/id-envio/:idEnvio`, escopo `gn.pix.send.read`
("Consultar pix enviado", não estava marcado, corrigido). Com o endpoint
certo, os dois envios voltam **`status: "NAO_REALIZADO"`** -- ou seja,
**não foi bug/atraso de consulta, o envio de fato falhou** dos dois lados.
Saldo nunca mudou (sem risco de perda), motivo da falha não vem nesse
endpoint (sem código de erro/razão no JSON). Segunda tentativa resolveu em
~5s (não ficou minutos "em processamento"), o que sugere uma regra sendo
aplicada de forma consistente, não uma análise manual variável.

**Painel conferido (2026-08-01): nenhum registro dos dois envios aparece
lá** — nem como falha, nem com motivo nenhum. Reforça a hipótese de que a
rejeição acontece antes de virar uma transação de verdade no extrato (bate
com resolver em ~5s e o saldo nunca mudar).

**Hipótese da titularidade testada e descartada (2026-08-01)**: os dois
`idEnvio` acima eram autoenvio (chave da empresa → chave pessoal do dono,
mesma titularidade), e a Efí tem um endpoint dedicado só pra isso
(`PUT /v2/gn/pix/:idEnvio/mesma-titularidade`, escopo
`gn.pix.sameownership.send`, não habilitado na nossa aplicação) — parecia
explicar o `NAO_REALIZADO` sem precisar de suporte. **Testado com uma
terceira tentativa, pra uma chave celular de titularidade genuinamente
diferente (`+5511995822094`, formato internacional corrigido depois de um
`400 valor_invalido` na primeira tentativa sem o `+55`)**: passou da
validação de formato, `status: EM_PROCESSAMENTO` na resposta, `e2eId`
gerado — mas o resultado final, depois de ~5s, foi **o mesmo
`NAO_REALIZADO`**. Isso descarta a titularidade como causa: aconteceu
igual com uma chave de pessoa diferente.

`idEnvio` da terceira tentativa: `554109b8d9cbba65e6d2c1b881cfe1e4`.

**Conclusão: são 3 tentativas consistentes (2 mesma titularidade + 1
titularidade diferente), todas rejeitadas em ~5s, sem mexer saldo, sem
aparecer no extrato.** Já não é mais explicável por nada do nosso lado
(formato de chave e titularidade descartados).

**Causa provável encontrada (2026-08-01), via post da Comunidade Efí**: o
envio de Pix (`pix.send`) **não é liberado só marcando o escopo na
aplicação** — precisa de um processo separado: preencher um formulário de
solicitação, a Efí analisa e aprova (ou não), e só depois de **assinar um
aditivo contratual** o endpoint passa a funcionar de verdade em Produção.
O mesmo post confirma que quando o `NAO_REALIZADO` tem uma causa de
negócio normal, ele vem com motivo (ex: "Negado por timeout") — nos nossos
3 casos não veio motivo nenhum, o que bate mais com "conta sem esse
aditivo assinado" do que com uma rejeição pontual de transação.
Fonte: [comunidade.sejaefi.com.br/discussao/problemas-api-pagamento-pix-producao-45](https://comunidade.sejaefi.com.br/discussao/problemas-api-pagamento-pix-producao-45).

**Confirmado pelo suporte da Efí (via Discord, 2026-08-01): é isso mesmo.**
Precisa preencher um formulário de solicitação pra liberar `pix.send` em
Produção. Aditivo contratual é assinado depois da aprovação. **Ação
pendente do cliente**: localizar e preencher esse formulário (checar
painel da Efí ou pedir o link direto no mesmo canal de suporte). Até isso
ser aprovado, `pix.send` em Produção continua bloqueado -- comportamento
esperado agora, não é mais um mistério.

**Não trocar `EFI_ENV` pra `producao` até isso se resolver.** Acionar
doação real sem saber se o saque funciona de verdade recria o problema
que motivou sair do Mercado Pago.

## Se importa mais que tudo: o modelo mudou, não é mais pix.gg

Numa fase anterior do projeto (noutra máquina), a ideia era integrar com
**pix.gg**. Isso foi **descartado por completo** — o código do pix.gg/LivePix
já foi removido do repositório há tempos. Depois disso o projeto passou por
**Mercado Pago** (OAuth marketplace, split automático) — também sendo
substituído agora, porque a conta pessoal de uma streamer foi bloqueada em
minutos (padrão de risco: Pix picotado de muitos desconhecidos).

**Modelo atual, decidido e confirmado com o cliente**: sistema de pagamento
próprio, com **Efí Bank**, arquitetura de **custódia/escrow numa Conta
Master única** (CNPJ da empresa) + ledger interno no nosso Postgres. Não é
mais conta-por-streamer (nem via Mercado Pago OAuth, nem via produto de
Split/Subcontas da Efí — esse último foi avaliado e descartado, porque exige
cada streamer abrir a própria conta na Efí, reintroduzindo o mesmo risco de
bloqueio individual).

## Decisões fechadas (2026-07-29)

- **Taxa da plataforma**: 3,9% por doação. Composição: 1,19% é repasse do
  custo real de recebimento Pix da Efí (não é lucro nosso), 2,71% é margem
  líquida da plataforma. Streamer sempre recebe **96,1%** do valor bruto.
- **Taxa de saque (cash-out) da Efí, tabela pública**: 1,19% do valor
  enviado, mínimo R$0,50. **Em negociação** com o comercial da Efí por algo
  fixo ou percentual menor — indício forte de que isso é possível: o pix.gg
  (que usa Efí por trás) cobra R$4,00 fixo dos usuários dele.
- **Plano se a negociação não avançar**: absorver o custo de saque dentro da
  margem da plataforma (sobra ~1,16% líquido), pra o streamer sempre ver os
  96,1% redondos, sem desconto visível no saque — decisão do cliente,
  priorizando competitividade sobre margem.
- **Plano B avaliado**: Woovi/OpenPix — 0,8% cash-in com teto de R$5,00 (mais
  barato que Efí em valores altos). Documentado mas não escolhido; falta
  confirmar se o Pix Out deles aceita chave externa arbitrária.
- **Concorrência pesquisada**: 1Pix (3,99%), Pix na Tela (3,5%, saque grátis
  a partir de R$1), AlertPix (2%). Um concorrente específico ("Quem Dá Mais")
  não processa pagamento — só espelha doações Pix/StreamElements que o
  streamer já tem configurado por fora, modelo de assinatura, não comparável
  em taxa de gateway.

## Pendências externas

- Resposta do comercial da Efí sobre taxa negociada de saque.
- Confirmar se `pix.send` em **Produção** exige aditivo separado (em
  Homologação já testamos e não exige — ver seção de progresso). Enquanto
  não tiver resposta, tratar Produção como bloqueada pra envio de Pix.
- Falta uma segunda chave Pix de teste (diferente da `fd7aaa7e-...` já
  cadastrada) pra conseguir testar um `enviarPix` completo em homologação,
  não só confirmar que o escopo não está bloqueado.

Resolvido nesta sessão (2026-08-01): conta Efí criada, ambiente de
homologação confirmado utilizável e usado pra testar tudo que foi escrito
(`efiAuth`, `efiApi`, `efiWebhook`) contra a Efí de verdade, em vez de
ficar sem nenhum teste real.

## Progresso da implementação

**Feito e testado** (não depende de conta/credencial da Efí):
- `src/migrations/005_efi_ledger.sql` e `006_payments_efi_txid.sql`
  **aplicadas contra o Postgres de produção** (2026-08-01, via
  `scripts/migrate.js` apontado pro `DATABASE_PUBLIC_URL`, já que
  `DATABASE_URL` interno só resolve de dentro da rede do Railway). Tabelas
  `fee_config`, `streamer_pix_keys`, `streamer_balances`, `withdrawals`,
  `ledger_entries`, `reconciliation_log` existem de verdade agora, e
  `payments` ganhou a coluna `efi_txid` (mesma tabela do MP, agnóstica de
  processador).
- `src/ledgerStore.js` — `computeDonationSplit()`/`computeWithdrawal()`
  (puras) e agora também `creditDonation()` (idempotência incluída),
  `createWithdrawal()`, `markWithdrawalSent()` **testados de ponta a ponta
  contra o Postgres real de produção**, com streamer/payments/withdrawal
  descartáveis criados e removidos depois (nenhum dado real tocado).
  Achado na hora de limpar: `ledger_entries` de `platform_credit`/
  `platform_withdrawal_cost` ficam com `streamer_id NULL`, então uma
  limpeza/consulta que filtra só por `streamer_id` não pega essas linhas —
  vale lembrar disso em qualquer script futuro que mexa nessa tabela.
- `src/pg.js` ganhou `withTransaction()` — helper de transação (BEGIN/COMMIT/
  ROLLBACK) que o ledger precisa pra creditar doação + atualizar saldo
  atomicamente.
- `paymentsStore.js` ganhou `markCreatedEfi`/`markPaidEfi`/`findByEfiTxid`,
  espelhando as funções que já existiam pro MP (`createPending` e
  `buildExternalReference` já eram agnósticos de processador, reusados
  como estavam).

**Feito e testado de verdade contra a Efí** (2026-07-31): conta Efí criada,
aplicações de Produção e Homologação configuradas com os escopos de API Pix
(cobrança, consulta/envio de Pix, webhooks, saldo, infrações MED — sem
Cobranças/Split/Open Finance/Pagamento de Contas). Confirmado: a API Pix da
Efí exige mTLS (certificado `.p12` por aplicação, um por ambiente), sem
senha no certificado. `src/efiAuth.js` escrito (`getAccessToken(env)`,
`env` = `"producao"` ou `"homologacao"`, token cacheado em memória até
expirar) e testado com sucesso contra `homologacao` via `railway run`
(token real recebido de `pix-h.api.efipay.com.br/oauth/token`).

Variáveis no Railway (serviço `leilao-de-jogos`, ambiente `production`):
`EFI_CLIENT_ID_PRODUCAO`/`EFI_CLIENT_SECRET_PRODUCAO`/`EFI_CERT_PRODUCAO_BASE64`
e o mesmo trio com sufixo `_HOMOLOGACAO` (certificado guardado em base64,
decodificado em memória no `pfx` do `https.request` — nunca escrito em
disco nem commitado).

`src/efiClient.js` extraído como cliente HTTP compartilhado (mTLS via
`https.request`, timeout de 15s, `getConfig(env)`) — `efiAuth.js` usa ele
por baixo, e `efiApi.js` também.

`src/efiApi.js` escrito com `criarCobranca(env, {...})` (`POST /v2/cob`,
sem txid) e `consultarCobranca(env, txid)`, **testado com sucesso contra
homologação de verdade**: cobrança de R$5,00 criada com a chave Pix
aleatória `fd7aaa7e-c08c-4048-a9d3-30ce8c71163d` (cadastrada na Conta
Digital, fora da área de API), voltou `status: ATIVA` e `pixCopiaECola`
pronto, sem precisar de uma segunda chamada pra buscar QR code (a doc
sugeria isso, mas o campo já vem na resposta do `POST /v2/cob`).

**Confirmado por teste real (não só doc, que era ambígua nisso): o campo
`devedor` NÃO é obrigatório** pra criar cobrança imediata. A arquitetura de
doação anônima (sem CPF do doador) continua válida como desenhada.

`enviarPix`/`consultarEnvioPix` escritos em `efiApi.js` (`PUT /v3/gn/pix/:idEnvio`,
`idEnvio` como chave de idempotência) seguindo a doc oficial confirmada via
busca.

**Atualização 2026-08-01, testado de verdade contra homologação**: a
suposição de que `pix.send` "não vem liberado só marcando o escopo" (baseada
em posts da comunidade Efí, não doc oficial) **não se confirmou em
homologação**. Chamei `enviarPix` contra `pix-h.api.efipay.com.br` e a Efí
respondeu `404 chave_favorecido_nao_encontrada` — ou seja, passou pela
autenticação e pela checagem de escopo, e só barrou porque usei a mesma
chave como pagador e favorecido (não existe uma segunda chave Pix cadastrada
pra testar um envio de verdade ainda). Se o escopo estivesse bloqueado, o
erro teria sido 403/escopo, não uma validação de negócio. **Hipótese**: a
exigência de aditivo é só pra Produção (dinheiro real), não pro sandbox.
Ainda não temos confirmação sobre Produção — isso só se resolve com a
resposta da Efí ou tentando de verdade quando tivermos uma chave de
favorecido de teste válida.

Continua valendo: **webhook é obrigatório pra usar o envio** (a chave Pix
pagadora precisa ter webhook associado; a confirmação não vem na resposta
HTTP, que só devolve `status: "EM_PROCESSAMENTO"`, vem por notificação
assíncrona) — isso já está resolvido, ver seção do webhook abaixo.

`src/efiWebhook.js` escrito, testado (funções puras) e **rota real em
produção** (`POST /webhooks/efi/pix/:token` em `server.js`).
**Descoberta importante**: a Efí não assina o webhook com HMAC como o
Mercado Pago (`mpWebhook.js`) — a autenticidade deles é via **mTLS na
camada de conexão**, que não dá pra verificar no nosso caso porque o
Railway termina o TLS antes do tráfego chegar no Node. A Efí trava o
registro do webhook com um erro ("TLS mútuo não configurado") até você
mandar o header `x-skip-mtls-checking: true` na chamada de registro —
solução oficial deles pra PaaS/serverless sem controle de TLS bruto
(`registrarWebhook()` em `efiApi.js` já manda esse header por padrão).

IP também não é confiável pra bloquear: a doc cita só `34.193.116.226`,
mas o IP real observado na validação foi `152.233.47.x` (várias
terminações diferentes) — provavelmente um pool não documentado. Por isso
`isAuthentic()` decide só pelo segredo de 24 bytes na URL; IP fora da
lista conhecida (`isKnownIp()`) vira só um log de aviso, nunca bloqueia.

Webhook **registrado com sucesso contra homologação** (confirmado via
`consultarWebhook`) e uma entrega real chegou na rota com o token válido.
**Não deu pra confirmar o formato exato do payload ao vivo**: testei 3
cobranças de R$7-9 (na faixa R$0,01-R$10 que o sandbox confirma sozinho),
as 3 ficaram `CONCLUIDA` do lado da Efí, mas só 1 das 3 entregas de
webhook chegou no nosso servidor — entrega em homologação parece
inconsistente, não parece ser bug nosso. O parsing em `server.js` segue o
formato documentado oficialmente: `{"pix": [{ endToEndId, txid, chave,
valor, horario, infoPagador }]}` pra recebimento (status de envio de Pix
inclui também `tipo`, `status`, `gnExtras.idEnvio`). Confirmação de ponta
a ponta fica pra quando isso estiver ligado a uma doação de verdade.

A rota hoje **só autentica e loga** o evento — ainda falta o lado da
criação da cobrança (rota `/doacao`) guardar `txid -> leilaoId/doador` em
algum lugar (tabela nova, não existe ainda) pra esse handler conseguir
achar o que foi pago e creditar de verdade. Idempotência deve seguir o
mesmo padrão do `mpWebhook.js`/rota `/webhook/mercadopago`: checar estado
atual antes de processar, não confiar só na camada de transporte.

**Ainda não escrito**: mudança na rota `/doacao` pra usar `efiApi.criarCobranca`
e chamar `paymentsStore.createPending`/`markCreatedEfi` (a tabela e as
funções já existem, só falta a rota usar), crédito de verdade no webhook
via `paymentsStore.markPaidEfi` + `ledgerStore.creditDonation`,
`reconciliation.js`. Nenhuma rota de doação foi tocada — o Mercado Pago
continua sendo o único caminho de pagamento ativo em produção. Solicitação
de liberação do `pix.send` (aditivo com a Efí) ainda pendente do lado do
cliente.

- Tudo em **centavos inteiros**, nunca float (confirmado no `ledgerStore.js`).
- `fee_config` como tabela editável (não hardcoded), pra atualizar a taxa
  negociada sem redeploy.
- Job de **reconciliação periódica** comparando saldo do ledger vs. extrato
  real da Efí (mesmo padrão do backup de estado do leilão em
  `src/stateBackup.js`) — tabela já existe (`reconciliation_log`), job ainda
  não escrito.
- Webhook com verificação de assinatura + idempotência dupla (igual ao
  padrão já usado em `src/mpWebhook.js`) — `creditDonation()` já é idempotente
  por `payment_id`.
- **Nunca persistir CPF** no nosso banco — só passa direto pra API da Efí
  quando necessário (ex: cadastro de chave Pix / KYC de saque).

## Regra permanente de segurança

O cliente pediu segurança máxima em qualquer código de pagamento, de forma
contínua (não só quando pedir de novo). Auditoria feita em 2026-07-29 no
código atual (Mercado Pago) confirmou: zero SQL injection (queries sempre
parametrizadas), toda rota administrativa autenticada, webhook com
assinatura HMAC verificada, tokens cifrados em repouso (AES-256-GCM,
`src/tokenCrypto.js`), CPF nunca guardado. Esse padrão deve se repetir
integralmente no código da Efí antes de qualquer coisa ir pra produção.
