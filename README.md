# Monitor de Alterações do Painel CNJ

Este projeto monitora alterações no painel do CNJ e envia notificações via Telegram quando detecta mudanças.

## Configuração

1. Crie um bot no Telegram com o [BotFather](https://core.telegram.org/bots#6-botfather)
2. Obtenha o `TELEGRAM_BOT_TOKEN` e o `TELEGRAM_CHAT_ID`
3. Adicione esses valores como secrets no repositório do GitHub:
   - Settings > Secrets > Actions > New repository secret

## Como funciona

- O workflow é executado a cada 30 minutos
- O script baixa o conteúdo da página e compara com a versão anterior
- Se houver alterações, envia uma notificação via Telegram
