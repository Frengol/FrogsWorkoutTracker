# Frogs Workout Tracker

Frogs Workout Tracker é um aplicativo gratuito e open source para registro de treinos de academia. Ele funciona 100% no seu dispositivo — não precisa de conta, não envia dados para servidores do Frogs e pode ser usado offline.

Ideal para quem treina com pesos, faz musculação ou treino funcional e quer um registro rápido, confiável e cheio de recursos sem depender de internet ou serviços pagos.

---

## Versões disponíveis

- **Versão estável (branch `main`)** — linha mais conservadora do app, indicada para quem quer acompanhar a versão mais estável do código. Ainda não há uma release oficial estável publicada.
- **Versão beta (branch `beta`)** — versão com mais funcionalidades em teste, publicada hoje como pre-release. Pode conter ajustes em andamento e instabilidades.

Escolha a versão e acesse os links oficiais para baixar:
- **Baixar versão estável:** <https://github.com/Frengol/FrogsWorkoutTracker/releases?q=prerelease%3Afalse>
- **Baixar versão beta:** <https://github.com/Frengol/FrogsWorkoutTracker/releases?q=prerelease%3Atrue>

---

## Principais funcionalidades

- **Timer de descanso com overlay** — durante o treino, se ativado, um timer aparece sobre a tela. Quando o tempo acaba, o app te envia uma notificação para voltar ao treino.
- **Biblioteca com mais de 280 exercícios prontos.**
- **Importação e exportação de uma ou múltiplas rotinas em formato JSON.**
- **Compartilhamento de treinos individuais ou múltiplos treinos em CSV**
- Importação de histórico do Hevy via arquivo CSV.
- Registro completo de treinos com séries, carga, repetições etc.
- Histórico completo de treinos com busca e filtros por período.
- Criação e edição de rotinas com supersets, notas, descanso personalizado por exercício e exercícios customizados.
- Compartilhamento de treinos individuais ou múltiplos treinos em CSV.
- Tela de progresso com visões: Visão geral, Exercícios, Músculos e Medidas corporais.
- Relatórios mensais e anuais gerados automaticamente a partir dos seus dados.
- Backup manual, backup nativo Android opcional e restauração local completa dos dados.
- Notificações locais para timer de descanso, recordes pessoais e lembretes de treino.

---

## Instalação

O Frogs roda nativamente no Android. A forma mais simples de instalar é baixar o APK mais recente e instalar no seu celular.

Pré-requisitos mínimos:
- Android 7.0 (API 24) ou superior
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
   - Entre uma série e outra, se ativado, o **timer de descanso** aparece como overlay e some ao acabar.
3. No final, revise o resumo e salve.

Para compartilhar um treino realizado: toque em compartilhar no final do treino ou pelo histórico, escolha WhatsApp (ou qualquer app). O destinatário salva o arquivo e importa direto no histórico.

Para compartilhar múltiplos treinos: acesse **Privacidade e Dados**, escolha a exportação de treinos e selecione os registros que deseja compartilhar.

Para importar um treino realizado: toque no botão de importação nos treinamentos históricos, selecione o arquivo CSV recebido e revise os exercícios importados antes de salvar.


## Rotinas

Você pode criar rotinas personalizadas com:
- Exercícios na ordem que preferir
- Notas por exercício
- Descanso individual por exercício
- Carga, repetições e séries alvo
- Marcação de aquecimento

Para compartilhar uma rotina: abra a rotina, toque em compartilhar, escolha WhatsApp (ou qualquer app). O destinatário salva o arquivo e importa direto na Biblioteca.

Para compartilhar múltiplas rotinas: acesse **Privacidade e Dados**, escolha a exportação de rotinas e selecione as rotinas que deseja compartilhar.

Para importar uma rotina: toque no botão de importação na Biblioteca, selecione o arquivo JSON recebido e revise os exercícios importados antes de salvar.

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

- **Fazer backup completo** — gera um arquivo `frog-backup-v1.json` com os dados do app, sem incluir os arquivos de fotos e vídeos anexados. Salve esse arquivo em um lugar seguro.
- **Ativar backup nativo Android** — permite que o Android/Google Drive salve um backup opcional dos dados do app, sem fotos, vídeos ou metadados de mídia. O Frogs não tem acesso nem gerencia essa cópia na nuvem.
- **Restaurar backup** — selecione o arquivo de backup, confirme a substituição da base atual e revise os exercícios necessários antes de salvar. Exercícios padrão idênticos aos do Frogs são reconhecidos automaticamente.
- **Importar treinos** — exporte seu histórico do Frogs ou até do Hevy em CSV, revise os exercícios importados e salve quando estiver tudo certo.
- **Exportar treinos em CSV** — compartilhe treinos individuais ou múltiplos treinos com outros apps; arquivos gerados pelo Frogs incluem os dados do exercício, como músculos secundários, equipamento, modalidade e instruções.
- **Exportar rotinas em JSON** — compartilhe uma rotina ou múltiplas rotinas salvas, mantendo exercícios, pastas, notas, descanso e séries alvo.

Tudo isso está disponível na tela **Privacidade e Dados**, acessível pelo Perfil.

Política de privacidade: <https://frengol.github.io/FrogsWorkoutTracker/privacy/>

Fonte da política: [`PRIVACY.md`](./PRIVACY.md)

---

## Licença

- **Código-fonte:** [GPL-3.0-or-later](https://www.gnu.org/licenses/gpl-3.0.html)
- **Nome, logo e sapo e identidade visual:** Todos os direitos reservados.
