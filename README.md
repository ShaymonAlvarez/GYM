# Gym Local

PWA local-first para acompanhamento de treino no celular, com PIN simples, backup em JSON e uso offline.

## Rodar localmente

```bash
npm install
npm run dev
```

## Build de producao

```bash
npm run build
```

O build executa `npm run import:source` antes do bundle final.
Esse passo lê a planilha e o catálogo PDF do repositório para gerar `src/data/importedProgram.json`.

## Referencias de exercicio

- A ficha inicial é importada da planilha `Planilha de cargas Rayza Alvarez_clean.xlsx`.
- Os links de referência vêm do PDF `Catálogo de exercícios.pdf`.
- As imagens mostradas no app usam a thumbnail do vídeo de cada exercício e podem ser substituídas por uma foto local salva no aparelho.

## Deploy no Render

1. Suba o repositório no GitHub.
2. No Render, crie um novo Blueprint ou Static Site apontando para o repositório.
3. O arquivo `render.yaml` já define build e publish path.

## PIN padrao

O PIN padrao inicial esta em `src/config.ts`.
Troque esse valor antes de publicar para uso real.

## Backup

- Os dados ficam no IndexedDB do navegador.
- Use o botao de exportar JSON antes de trocar de aparelho ou limpar os dados do navegador.
