# Frogs Workout Tracker

Frogs Workout Tracker é um aplicativo gratuito e open source para registro de treinos de academia. Ele funciona 100% no seu dispositivo — não precisa de conta, não envia seus dados para nenhum servidor e pode ser usado offline.

Ideal para quem treina com pesos, faz musculação ou treino funcional e quer um registro rápido, confiável e cheio de recursos sem depender de internet ou serviços pagos.

---

## Principais funcionalidades

- **Timer de descanso com overlay** — durante o treino, um cronômetro aparece sobre a tela. Quando o tempo acaba, o app vibra e você volta imediatamente para a próxima série.
- **Compartilhamento de rotinas e treinos** — exporte uma rotina ou treino como arquivo, envie por WhatsApp e a pessoa do outro lado importa diretamente no Frogs.
- Registro completo de treinos com séries, carga, repetições etc.
- Histórico completo de treinos com busca e filtros por período.
- Criação e edição de rotinas com supersets, notas, descanso personalizado por exercício e exercícios customizados.
- Importação e exportação de rotinas em formato JSON.
- Importação de histórico do Hevy via arquivo CSV.
- Compartilhamento de treinos individuais em CSV.
- Tela de progresso com visões: Visão geral, Exercícios, Músculos e Medidas corporais.
- Relatórios mensais e anuais gerados automaticamente a partir dos seus dados.
- Backup e restauração local completa de todos os dados.
- Notificações locais para timer de descanso, recordes pessoais e lembretes de treino.

---

## Instalação

O Frogs roda nativamente no Android. A forma mais simples de instalar é baixar o APK mais recente e instalar no seu celular.

Pré-requisitos mínimos:
- Android 8.0 (API 26) ou superior
- Permissão para instalar apps de fontes externas (ativar uma vez na instalação manual)

---

## Primeiros passos

1. Abra o Frogs.
2. Um onboarding rápido vai te guiar — sem cadastro, sem e-mail, sem senha.
3. Você cai na tela principal com 4 abas:
   - **Home** — visão geral, atalhos e acesso rápido para iniciar treino.
   - **Biblioteca** — suas rotinas salvas e todos os exercícios disponíveis.
   - **Progresso** — gráficos, estatísticas e medidas corporais.
   - **Perfil** — configurações, histórico completo, backup e privacidade.
4. O botão azul flutuante no canto inferior direito inicia um treino.

---

## Registrar um treino

1. Toque no botão azul flutuante para começar.
2. Durante o treino:
   - Registre séries com carga e repetições.
   - Use **Usar anterior** para preencher automaticamente os valores da última vez que fez aquele exercício.
   - Entre uma série e outra, o **timer de descanso** aparece como overlay e some ao acabar.
3. No final, revise o resumo e salve.

Para compartilhar um treino realizado: Toque em compartilhar no final do treino ou pelo histórico, escolha WhatsApp (ou qualquer app). O destinatário salva o arquivo e importa direto no histórico.

Para importar um treino realizado: toque no botão de importação nos treinamentos históricos e selecione o arquivo CSV recebido.


## Rotinas

Você pode criar rotinas personalizadas com:
- Exercícios na ordem que preferir
- Notas por exercício
- Descanso individual por exercício
- Carga, repetições e séries alvo
- Marcação de aquecimento

Para compartilhar uma rotina: abra a rotina, toque em compartilhar, escolha WhatsApp (ou qualquer app). O destinatário salva o arquivo e importa direto na Biblioteca.

Para importar uma rotina: toque no botão de importação na Biblioteca e selecione o arquivo JSON recebido.

---

## Progresso

A aba Progresso mostra:

- **Overview** — resumo de treinos, volume total e frequência.
- **Exercícios** — evolução de carga e repetições por exercício.
- **Músculos** — distribuição de volume por grupo muscular.
- **Medidas corporais** — registro de peso, medidas e correlação com treinos.

---

## Backup e importação

O Frogs mantém seus dados seguros localmente. Você pode:

- **Fazer backup completo** — gera um arquivo `frog-backup-v1.json` com todos os dados. Salve esse arquivo em um lugar seguro.
- **Restaurar backup** — selecione o arquivo de backup e todos os dados são recuperados.
- **Importar treinos** — exporte seu histórico do Frogs ou até do Hevy em CSV e importe direto aqui.
- **Exportar treinos em CSV** — compartilhe treinos individuais com outros apps.

Tudo isso está disponível na tela **Privacidade e Dados**, acessível pelo Perfil.

---

## Para desenvolvedores

Este é um projeto Expo + React Native + TypeScript, construído com foco em desempenho local e arquitetura modular.

Documentação técnica: [`docs/architecture.md`](./docs/architecture.md)
Build local e assinatura: [`docs/local-build.md`](./docs/local-build.md)

```bash
npm install
npm start
npx tsc --noEmit
npm test -- --runInBand
npm run lint
```

---

## Licença

- **Código-fonte:** [GPL-3.0-or-later](https://www.gnu.org/licenses/gpl-3.0.html)
- **Nome, logo e sapo e identidade visual:** Todos os direitos reservados.
- **Imagens de exercícios e assets de terceiros:** Conforme suas respectivas licenças.