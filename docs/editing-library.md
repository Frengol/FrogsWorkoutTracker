# Editando a biblioteca do Frogs

O catálogo base do app agora fica em arquivos JSON fáceis de editar:

- `data/exercises.catalog.json`
- `data/workouts.library.json`

## Onde editar

No Linux com KDE, você pode abrir esses arquivos no:

- `Kate`
- `VS Code`
- `VSCodium`
- qualquer editor de texto que preserve JSON válido

## Regras importantes

- Mantenha o campo `slug` dos exercícios estável sempre que possível.
- Edite o campo `name` em PT-BR para mudar o nome exibido no app.
- Em treinos prontos, use `exerciseSlug` para apontar para um exercício existente.
- Os aliases servem para importações e compatibilidade com nomes antigos.

## Como validar depois de editar

Rode pelo menos:

```bash
npm run typecheck
npm run validate:library
```

Se o JSON estiver inválido, o teste e o typecheck vão acusar o problema.
