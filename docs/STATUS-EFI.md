# Status: migração de pagamento (Mercado Pago → Efí Bank)

> Arquivo de continuidade entre máquinas/sessões. Se você (Claude) está lendo
> isso numa sessão nova, sem memória da conversa anterior, este é o estado
> real do projeto — não confie em ideias antigas de outra sessão que
> contradigam o que está escrito aqui.

## Pendente: aplicar migration 015 (webhook_secret UNIQUE) -- precisa ser do PC (2026-08-06)

`src/migrations/015_streamer_pixgg_webhook_secret_unique.sql` foi commitada
(`ALTER`/`CREATE UNIQUE INDEX` em `streamer_pixgg_credentials.webhook_secret`,
mesmo padrão da migration 008 pra `ledger_entries`) mas **ainda não foi
aplicada em produção**. Sessão do Claude Code aqui não tem acesso à
`DATABASE_PUBLIC_URL` (Railway MCP devolve variáveis sempre ocultas,
`valuesRedacted: true`, e esse ambiente sandboxed bloqueia conexão de saída
direta pra internet -- tentei até instalar o Railway CLI, a própria
autenticação foi rejeitada pela política de rede do ambiente). Cliente
tentou colar o SQL pelo console do Postgres no Railway direto do celular
(aba Database → terminal), mas colar texto num terminal embutido em
navegador mobile não funcionou de forma confiável. Decidido continuar essa
parte específica (rodar a migration) quando o cliente estiver no
computador -- lá dá pra colar sem problema no mesmo console, ou rodar
`node scripts/migrate.js` local com `DATABASE_PUBLIC_URL` configurada (setup
já usado antes, ver seção "Progresso da implementação" mais abaixo).

SQL pendente (idempotente, `IF NOT EXISTS`, seguro rodar mesmo se algo já
tiver sido tentado antes):
```sql
CREATE UNIQUE INDEX IF NOT EXISTS streamer_pixgg_credentials_webhook_secret_unique
  ON streamer_pixgg_credentials (webhook_secret);
```
Não é bloqueante pro fluxo de doação funcionar (o bug real do segredo
dessincronizado já foi corrigido no código, testado ao vivo com sucesso
2026-08-06) -- essa migration é só um reforço de integridade (constraint de
banco em vez de só confiar na entropia do `crypto.randomBytes`), sem
urgência de minutos.

## pixgg.com reconsiderado como ponte pra sexta (2026-08-05) -- investigado com evidência real, não suposição

Cliente questionou (com razão) uma resposta minha anterior que descartou o
pixgg.com de forma rasa só por "usar a Efí por trás". Reinvestigado com
`git log`/`git show` no código já deletado (`src/pixggApi.js`,
`src/pixggClient.js`, removidos no commit `993e533`), não por suposição:

- **`pix.gg` no texto do projeto e `pixgg.com` são o mesmo serviço** (URL
  base do client era `https://app.pixgg.com`, contato documentado era "Cris,
  do pix.gg"). Não são coisas diferentes.
- **Modelo do pixgg.com (como era em 2026-07)**: cada streamer cria a
  própria aplicação lá, com `clientId`/`clientSecret` próprios. A doação cai
  **direto na conta do streamer** -- a JogodaVez só recebia um webhook
  avisando (`streamerUsername`, valor, mensagem), nunca custodiava o
  dinheiro.
- **Por que foi abandonado (confirmado pelo commit `e5d31d1`, mensagem
  literal): "sair do pix.gg pra um sistema de split de pagamento nativo via
  Mercado Pago (OAuth + application_fee)"** -- ou seja, foi decisão de
  **modelo de negócio** (pix.gg não permitia a JogodaVez cobrar a taxa de
  3,9% automaticamente), **não** decisão de segurança/bloqueio. Não há
  nenhum registro de bloqueio de conta usando pix.gg -- o bloqueio real
  (streamer, minutos, ao vivo) aconteceu especificamente na fase do
  **Mercado Pago**, depois.
- **Implicação pra sexta**: como o dinheiro nunca passaria pela conta da
  JogodaVez nesse modelo, a arquitetura em si provavelmente não carrega o
  mesmo risco de bloqueio por "intermediação de pagamentos" que motivou o
  KYC da Efí -- mas também significa abrir mão (temporariamente) da taxa
  automática da plataforma, a não ser que o pixgg.com tenha adicionado
  split desde julho de 2026 (não confirmado ainda -- verificar antes de
  decidir reviver).

**Decidido e implementado (2026-08-06, commit `91ba311`)**: reintegrado como
ponte. `src/pixggApi.js`/`src/pixggClient.js` recriados, streamer conecta a
própria aplicação pixgg.com (Client ID/Secret) no Perfil → Financeiro
(`streamerPixggStore`), `doar.html`/`doar.js` redireciona pra lá quando
conectado, webhook em `POST /webhooks/pixgg/:secret` só atualiza o placar
(nunca custodia). Efí como opção de doação direta ficou visualmente
desativada no Perfil enquanto essa ponte estiver ativa — Efí continua sendo
o destino final (saldo/saque), só a doação em si passa pelo pixgg.com por
enquanto. Split/taxa automática do pixgg.com não foi confirmado nem é
necessário pra essa ponte (ela não coleta taxa da JogodaVez, é só passagem).

## Rede de segurança pro lançamento de sexta (2026-08-07) + KYC de intermediador em andamento (2026-08-05)

Prazo real: site precisa estar funcionando (doação + saque) até sexta-feira
08/08. `pix.send` em Produção segue sem limite diário configurado o
suficiente e o pedido de aumento (ver seção "Causa raiz real" abaixo) já
foi rejeitado uma vez pedindo R$20.000/dia sem documentação. Como rede de
segurança que **não depende de nenhuma aprovação da Efí**, foi construído:

- **`public/admin-saques.html`** (rota estática, sem link no site público,
  só quem tem a URL + o `SUPER_ADMIN_SECRET` acessa): lista saques presos
  (`pending`/`failed`) via `GET /api/admin/saques-pendentes` e confirma
  manualmente via `POST /api/admin/saques/:id/confirmar-manual` depois que
  o dono já mandou o Pix de verdade pelo app/site da própria Efí (canal
  "Plataforma", não API). **Uso**: o dono manda o Pix manualmente pela Efí
  primeiro, só depois clica "Confirmar" na página -- nunca o contrário.
  `ledgerStore.markWithdrawalSentManually()` reaplica o débito só se o saque
  estava `failed` (já tinha sido estornado); se ainda `pending`, o saldo já
  estava debitado, não redebita.
- Isso não é ilegal (mesma conta, mesma chave, só muda o canal de envio) e
  não substitui resolver o `pix.send` de verdade -- é só pra garantir que
  sexta acontece independente do resultado do que vem a seguir.

**Efí abriu KYC completo de "intermediador de pagamentos" (2026-08-05)**,
depois que o cliente perguntou proativamente pro suporte (Sergio, contato
direto) sobre risco de bloqueio de conta por padrão de "Pix picotado de
muitos desconhecidos" -- pergunta que já era prevista dado o histórico real
com o Mercado Pago (conta bloqueada em minutos, recebimento **e**
envio parados, ao vivo, sem aviso prévio -- é por isso que o modelo mudou
pra custódia PJ na Efí, não é hipotético). Sergio confirmou que **qualquer
conta pode sofrer bloqueio preventivo a qualquer momento** (não é ameaça
específica, é política geral deles) e, ao saber que o modelo é
custódia + repasse a terceiros, iniciou o processo formal de KYC pra esse
tipo de operação (formulário longo: modelo operacional, rastreabilidade de
transação, PLD/FT, compliance, anexos).

**Avaliação de risco pro cash-in (recebimento de doação) -- corrigida**:
inicialmente eu (Claude) disse que o recebimento via API era "mais seguro,
padrão testado" e separei esse risco do risco de saque. **Isso estava
incompleto** -- o precedente do Mercado Pago prova que o recebimento
também pode ser bloqueado, não só o envio. Não existe garantia de que não
aconteça de novo. Mitigação combinada (nenhuma delas zera o risco):
conta PJ em vez de CPF, contato humano proativo com a Efí (Sergio) em vez
de operar no escuro, KYC formal em andamento, documentação de compliance
já preparada (ver abaixo), aviso prévio à Efí sobre o volume esperado de
sexta (a ser enviado), e teste de doação real de baixo valor antes de
sexta pra confirmar que o recebimento segue funcionando.

**KYC preenchido (formulário Salesforce, URL enviada por e-mail, campo de
texto tem limite de 255 caracteres em vários campos -- já causou erro
`STRING_TOO_LONG` uma vez e resetou o formulário inteiro, todos os textos
precisam ser curtos)**. Documentos preparados como PDF (gerados via
`msedge --headless --print-to-pdf`, não há ferramenta de PDF dedicada no
projeto, é ad-hoc):
- Política de Cadastro, Política de Compliance e PLD/FT, Organograma
  Acionário (Empresário Individual, sócio único), Mapa da Operação
  (diagrama SVG do fluxo doador → Efí cobrança → custódia → ledger →
  saque → Efí envio → streamer, com o job de reconciliação).
- **Comprovante de faturamento**: sem DECORE (empresa aberta há ~1 semana,
  sem contador, sem faturamento ainda) -- gerada uma **Declaração de
  Faturamento autodeclarada** (assinatura em fonte cursiva, não é
  documento oficial de contador, é transparência sobre a real situação da
  empresa) como tentativa de anexo provisório. **Não confirmado se a Efí
  aceita isso no lugar do DECORE** -- pergunta foi feita direto pro Sergio,
  resposta ainda pendente.
- Reenvio do pedido de limite ajustado pra **R$12.000,00/dia** (em vez dos
  R$20.000 rejeitados antes), com justificativa + Cartão CNPJ como
  comprovante de atividade (não está na lista oficial de documentos
  aceitos pra isso, mas é o mais próximo disponível).

**Pendente**: resposta da Efí sobre a declaração de faturamento provisória,
conseguir o DECORE de verdade (contador ainda não contratado), enviar o
aviso prévio de volume pro Sergio antes da live de sexta, testar uma
doação real pequena antes de sexta pra confirmar que o cash-in não foi
afetado por nada disso.

## Perfil (conta) -- chave Pix/saldo/saque saíram do escopo do leilão (2026-08-01)

`streamerId` sempre foi por conta (`streamersStore.ensureByTwitchUserId`
devolve o mesmo streamer não importa qual leilão o dono está gerenciando),
mas a UI ainda tratava saldo/chave Pix/saque como se fossem por leilão
(dentro de Configurações → Avançado de cada board). Criada a página
`/perfil` (`public/perfil.html/css/js`), fora do escopo de um leilão
específico, com rotas de conta em `server.js`: `GET /api/perfil`,
`POST /api/perfil/pix-key`, `POST /api/perfil/saque`, `GET /api/perfil/saques`
(usa só `getTwitchSession(req)` + `streamersStore.ensureByTwitchUserId`, sem
`leilaoId`). As rotas antigas `GET/POST /api/l/:id/admin/saldo|pix-key|saque`
e o middleware `requireLeilaoOwner` foram **removidos** (não mantidos em
paralelo, pra não duplicar caminho de código que mexe com dinheiro). Ganhos
de código: `ledgerStore.getLifetimeEarnedCents` (soma histórica de
`donation_credit`, nunca cai mesmo depois de sacado) e
`ledgerStore.getWithdrawalHistory`.

No board, o `host-panel` ganhou um ícone pequeno (`#host-perfil-link`) que
leva pro Perfil, visível só quando `isPresenterOwner` está true (não pra
público nem moderador) -- deliberadamente um elemento separado do badge/link
existente do Twitch, pra não conflitar os dois destinos num mesmo clique.
"Sair da conta" saiu de Configurações → Avançado e migrou pro Perfil (ação de
conta, não de leilão); "Revogar acesso de moderadores" continua em
Configurações (é por leilão, depende do `adminSessionVersion` daquele
leilão específico).

## Revisão de fluxo: 3 itens médios corrigidos (2026-08-01/02)

Cliente pediu revisão geral do fluxo e priorizou 3 achados de severidade
média pra corrigir. Todos testados via HTTP real contra servidor local +
Postgres/Efí de produção (não só leitura de código), dados de teste limpos
depois.

1. **Cooldown entre trocar chave Pix e sacar** -- `POST /admin/saque` agora
   recusa por 24h após qualquer troca de chave (`server.js`,
   `pixKeyChangeCooldownRemainingMs`), com mensagem informando quanto falta.
   `GET /admin/saldo` já devolve `cooldownRemainingMs` pro front desabilitar
   o botão preventivamente. Motivo: sem isso, uma sessão de dono comprometida
   permitiria trocar a chave e sacar tudo na hora, sem fricção nenhuma.
   Também ganhou auditoria: `pix_key_history` (migration 009) grava
   old→new a cada troca, via `streamerPixKeysStore.setPixKey` (agora
   transacional). Testado via HTTP: saldo antes/depois de cadastrar chave,
   saque bloqueado com a mensagem certa durante o cooldown.

2. **Revogação de sessão de moderador** -- cookie `leilao_admin` passou a
   carregar a versão da sessão por leilão (`{id, v}` em vez de só `id`);
   `hasAdminSession` compara contra `adminSessionVersion` (estado do
   leilão). Nova rota `POST /admin/revoke-mod-sessions` (só dono, via
   Twitch) incrementa essa versão -- todo cookie de mod emitido antes vira
   inválido na hora, sem afetar o dono nem outros leilões (não precisa mais
   trocar `SESSION_SECRET` do site inteiro). Botão "Revogar acesso de
   moderadores" em Configurações → Avançado → Sua conta. **Testado de
   ponta a ponta via HTTP com cookie jars separados**: dono gera código →
   "mod" loga (cookie próprio) → `check-session` confirma `isPresenter:
   true` → dono revoga → mesmo cookie de mod agora dá `isPresenter: false`.

3. **Reconciliação completa de saldo** -- `src/reconciliation.js` ganhou
   `checkTotalBalance()`, rodando a cada 15min: soma
   `streamer_balances` + fatia líquida da plataforma + saques ainda
   "pending" (dinheiro debitado mas talvez ainda não saiu de verdade) via
   `ledgerStore.getLedgerTotals()`, compara com `efiApi.consultarSaldo()`
   de verdade, grava em `reconciliation_log` (tabela que já existia, sem
   uso até agora) e loga erro se a diferença passar de 5 centavos
   (tolerância de arredondamento). Só compara e loga -- nunca corrige nada
   sozinho, drift de dinheiro precisa de olho humano. **Testado contra o
   saldo real**: rodou em homologação (saldo 0 = 0, sem alarme) e forçado
   em produção (saldo real R$2,00 vs ledger 0 -- disparou o alerta de
   divergência certinho; esse R$2,00 é um resíduo conhecido de teste manual
   anterior ao ledger existir, não é bug).

Durante os testes, uma limpeza incompleta de sessões anteriores desta
mesma revisão deixou ~67 linhas órfãs de `platform_credit`/
`platform_withdrawal_cost` (`streamer_id NULL`) no Postgres de produção --
removidas antes de fechar. Reforça por que o item 3 (reconciliação) importa:
esse tipo de resíduo é exatamente o que ela existe pra pegar.

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

**Atualização crítica (suporte Efí via Discord, resposta em 2026-08-02,
"Marcelo Efí"): a liberação do limite operacional de `pix.send` em
Produção só está disponível pra conta PJ.** Resposta literal: "Em contas
PF, você até consegue testar esse envio, mas a liberação de um limite
operacional está disponível somente para contas PJ." Isso refina (não
contradiz) a descoberta anterior: não é só "preencher formulário e
esperar aprovação" -- se a conta usada pra chamar a API hoje for **PF**,
não tem formulário que libere, o requisito é a conta ser PJ. **Confirmado com o cliente (2026-08-02): a conta conectada já é PJ**
(CNPJ da empresa, como o modelo sempre previu -- ver seção "Se importa
mais que tudo" abaixo). Isso descarta "conta errada" como explicação dos
3 `NAO_REALIZADO`. A causa raiz continua sendo a hipótese original:
formulário de solicitação + análise + aditivo contratual, ainda pendente
de ser preenchido/aprovado do lado do cliente. A resposta do Marcelo
serve como confirmação adicional de que PJ é (e sempre foi) o requisito
certo, não como uma pista nova sobre o motivo do bloqueio atual.

**Causa raiz real encontrada (2026-08-03), via material oficial da Efí (não
mais suposição de post de comunidade): é limite diário, não aditivo/formulário.**
Toda conta nova vem com um limite diário **pré-aprovado propositalmente
baixo** pra envio de Pix via API, só pra teste: **R$0,30/dia em contas Efí
Pro, R$1,00/dia em contas Efí Empresas**, e só pra destino "você mesmo ou
contatos seguros". Isso explica os 3 `NAO_REALIZADO` sem precisar de
nenhuma das hipóteses anteriores (aditivo, formulário, PJ vs PF): os dois
primeiros testes de R$1,00 (autoenvio) provavelmente bateram exatamente no
teto pré-aprovado de conta Empresas, e a terceira tentativa (chave de
titularidade diferente, fora de "contatos seguros") não tem limite
pré-aprovado nenhum até ser configurado. **A aprovação é feita pelo próprio
usuário no painel, sem precisar acionar suporte nem preencher formulário
nenhum:**

1. tela inicial → "Configurações da conta" (⚙, menu superior direito);
2. "Limites" → "Configurar limites";
3. em "Pix e transferências" → "Pix";
4. origem da transação: **API**;
5. destino: pessoas físicas / empresas / você mesmo e contatos seguros
   (conforme o caso de uso real do saque, que é sempre pra terceiros —
   streamers, não "você mesmo");
6. período (diurno/noturno — noturno só existe em contas Efí Para Você e
   Efí Pro);
7. editar o valor desejado → "Continuar";
8. se pedir acima do pré-aprovado, dá pra justificar o motivo e anexar
   documento;
9. "Continuar" e autenticar a solicitação.

Isso **supera** (não só refina) a teoria antiga de "formulário +
aditivo contratual" — não existe esse processo separado, é
autoatendimento no próprio painel. **Ação pendente do cliente**: seguir
esse passo a passo e configurar um limite diário compatível com o volume
real de saques esperado, pro destino "pessoas físicas" (é pra isso que o
saque de streamer serve — não é "você mesmo" nem preenche o critério de
"contato seguro" só por estar cadastrado como chave Pix).

**Não trocar `EFI_ENV` pra `producao` até o limite estar configurado e
testado com um saque real de valor baixo.** Acionar doação real sem saber
se o saque funciona de verdade recria o problema que motivou sair do
Mercado Pago.

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

- **Configurar o limite diário de envio de Pix via API no painel da Efí**
  (Configurações da conta → Limites → Pix e transferências → Pix → origem
  API → destino "pessoas físicas"), pro valor real esperado de saque. Não
  é mais formulário/suporte -- é autoatendimento, ver passo a passo acima.
  Depois de configurado, testar de novo com um `enviarPix` real de valor
  baixo antes de confiar no fluxo em Produção.
- Resposta do comercial da Efí sobre taxa negociada de saque.
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
