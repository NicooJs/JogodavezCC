# Status: migração de pagamento (Mercado Pago → Efí Bank)

> Arquivo de continuidade entre máquinas/sessões. Se você (Claude) está lendo
> isso numa sessão nova, sem memória da conversa anterior, este é o estado
> real do projeto — não confie em ideias antigas de outra sessão que
> contradigam o que está escrito aqui.

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

## Pendências externas (bloqueiam início da implementação)

- Aprovação da conta Efí Empresas (documentos em análise).
- Resposta do comercial da Efí sobre taxa negociada de saque.
- Confirmação se o endpoint de Pix Out (`pix.send`) vem liberado por padrão
  ou exige análise/scope release separado.

**Regra: nenhuma linha de código de pagamento deve ser escrita até a conta
Efí estar aprovada e as chaves de API em mãos.** Não dá pra testar contra
nada real antes disso.

## Plano técnico completo

O desenho de schema (tabelas `ledger_entries`, `streamer_balances`,
`withdrawals`, `fee_config`, `reconciliation_log`, `streamer_pix_keys`),
módulos novos (`efiAuth.js`, `efiApi.js`, `efiWebhook.js`, `ledgerStore.js`,
`reconciliation.js`) e fluxos de cash-in/cash-out estão detalhados num
arquivo de plano que **só existe localmente na máquina onde foi escrito**
(`~/.claude/plans/efi-custodia-migracao.md`, fora do repositório). Se esse
arquivo não estiver disponível nesta sessão/máquina, ele precisa ser
reconstruído a partir deste resumo + da conversa com o usuário — os pontos
principais:

- Tudo em **centavos inteiros**, nunca float.
- `fee_config` como tabela editável (não hardcoded), pra atualizar a taxa
  negociada sem redeploy.
- Job de **reconciliação periódica** comparando saldo do ledger vs. extrato
  real da Efí (mesmo padrão do backup de estado do leilão em
  `src/stateBackup.js`).
- Webhook com verificação de assinatura + idempotência dupla (igual ao
  padrão já usado em `src/mpWebhook.js`).
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
