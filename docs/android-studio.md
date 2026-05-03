# Android Studio no Bazzite

## Objetivo

Fazer o Android Studio reconhecer o projeto Gradle do Frogs e habilitar o `Run` com emulador aberto.

## Fluxo certo

1. Confirme o ambiente:

```bash
npm run android:env:check
```

2. Abra o Android Studio com o ambiente alinhado:

```bash
npm run android:studio
```

Esse launcher exporta:

- `ANDROID_SDK_ROOT`
- `ANDROID_HOME`
- `JAVA_HOME`
- `PATH` com `node`, `adb` e `emulator`

3. No Android Studio, abra e mantenha aberto o módulo:

- `android/`

Não abra a raiz do repositório para trabalhar com o fluxo Gradle da IDE.

## Configuração da IDE

No Android Studio, confirme:

- `Settings > Build, Execution, Deployment > Gradle`
  - `Gradle JDK`: Android Studio JBR ou JDK 17
  - `Use Gradle from`: `gradle-wrapper.properties`
- `Settings > Android SDK`
  - `Android SDK Location`: `~/Android/Sdk`

## Se o botão Run continuar desabilitado

Valide nesta ordem:

1. O projeto aberto é a pasta `android/`
2. A janela `Gradle` aparece no lado direito
3. O módulo `app` aparece na árvore do projeto
4. O sync do Gradle terminou sem erro
5. O emulador está aberto e listado no seletor de device

## Erro conhecido com react-native-reanimated

Se o sync falhar com algo como:

```text
Task with name 'externalNativeBuildDebug' not found in project ':react-native-reanimated'
```

o projeto já inclui um patch local para o Android Studio sync.

Você pode reaplicar manualmente com:

```bash
npm run android:patch:reanimated
```

O patch também roda automaticamente no `postinstall`.

## Erros mais prováveis

### `node` não encontrado

Esse projeto usa `node` no `settings.gradle` e no `app/build.gradle`.

Solução:

- abrir o Studio pelo script `npm run android:studio`

### SDK Android não encontrado

Solução:

- apontar a IDE para `~/Android/Sdk`

### JDK incorreto

Solução:

- usar o JBR do Android Studio ou JDK 17

### Gradle não sincroniza

Solução:

- confirmar que a IDE está usando o Gradle Wrapper do projeto
- abrir a pasta `android/`

## Fluxo de desenvolvimento

Com o sync ok e o emulador aberto:

```bash
npm run start
```

Depois use `Run` no Android Studio, ou:

```bash
npm run android:run
```
