A chave da conta de serviço do Google Play fica aqui, como:

    play-service-account.json

Tudo nesta pasta é ignorado pelo git (só este README é versionado). A chave sozinha publica
releases na conta de desenvolvedor: nunca entra no repositório, num chat ou num log de CI.

Como gerar (a conta de serviço NÃO é criada no Play Console — procurar "Setup -> API access"
lá é beco sem saída):
1. Google Cloud Console -> IAM & Admin -> Service Accounts -> Create; Manage keys -> JSON.
2. No Cloud Console, habilite a "Google Play Android Developer API".
3. Play Console -> Usuários e permissões -> Convidar o e-mail da conta de serviço. Para a
   trilha "internal": ver informações do app, lançar em trilhas de teste, gerenciar trilhas.
O app precisa já existir no Play Console. Usada por eas.json (submit.production.android).
