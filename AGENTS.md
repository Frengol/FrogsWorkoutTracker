## Acordos de trabalho
- Sempre siga o `architecture.md` na raiz do repositório. Se ele não existir, crie-o e escreva um manifesto de arquitetura contendo todas as especificações funcionais e técnicas.
- Sempre planeje antes de implementar funcionalidades grandes.
- Escreva primeiro os testes e depois o código. **REGRA RÍGIDA (TDD):** para qualquer nova funcionalidade, correção de bug ou mudança de comportamento, o ciclo é: (1) escrever o teste que descreve o comportamento esperado → (2) confirmar que o teste falha → (3) implementar o mínimo de código para o teste passar → (4) rodar todos os testes regressivos → (5) refatorar se necessário. Nunca escreva código de produção sem um teste correspondente já existente. Para features novas, crie o arquivo de teste antes de criar o arquivo de código.
- Mantenha as alterações incrementais, pequenas e fáceis de revisar.
- Documente premissas quando houver ambiguidade técnica, mas pare e peça validação no chat se houver dúvida de escopo ou de regra de negócio.
- Prefira soluções confiáveis, simples e escaláveis em vez de soluções “espertas” demais.
- Priorize clean code: nomes claros, funções curtas, baixo acoplamento, alta coesão e eliminação de duplicação acidental.
- Preserve uma arquitetura de solução limpa: UI, aplicação, domínio e infraestrutura devem ter responsabilidades bem separadas, sem misturar regra de negócio com apresentação ou persistência sem necessidade real.
- Nunca introduza paywall, assinatura, bloqueio premium ou qualquer código de monetização.
- Nunca use verde na UI, ícones, gráficos, estados, ilustrações ou branding.
- Preserve uma identidade original para o Frogs Workout Tracker.
- Otimize a UX para registro rápido de treinos e alta clareza analítica.
- Trate treino em andamento como dado crítico e proteja-o com autosave e persistência local.
- Mantenha compatibilidade cross-platform, mas otimize a UX inicial principalmente para Android.
- Mantenha o repositório modular e orientado por domínio.
- Rode lint, typecheck, novos testes da implementação e os testes regressivos até tudo estar ok.
- Atualize README e  documentação sempre que arquitetura ou setup mudarem.
- Depois de concluir alterações no código, atualize o architecture.md.
- No final, sempre pergunte se desejo que você faça o commit ou gere o APK e nunca faça isso automaticamente.
- Para APKs de teste (debug e release), sempre compilar com as arquiteturas x86_64 e arm64-v8a. Para AABs de distribuição, sempre compilar somente com arm64-v8a. Não alterar essa matriz de ABIs sem instrução explícita do usuário.


## OBRIGATÓRIO
- Sempre procurar evitar paralelismo e tarefas muito pesadas, o computador é pode travar. Se for necessário tarefa pesada, execute uma de cada vez e nada em paralelo.

## Prioridades do produto
1. Velocidade no registro de treino
2. Confiabilidade offline
3. Utilidade dos analytics
4. Identidade visual limpa, amigável, moderna e inspirada nas cores do sapo azul (Tonz de azul, branco e preto)

## Padrões técnicos
- TypeScript em modo strict
- Fluxo de dados offline-first
- Componentes pequenos e reutilizáveis
- Modelos de domínio claros
- Feature flags para itens incertos ou dependentes de integrações externas

## Definição de pronto
- Fluxos principais funcionando localmente
- Sem erros críticos de lint ou tipagem
- UX coerente
- Documentação refletindo o estado real do projeto
