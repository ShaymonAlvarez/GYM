# Configurar Supabase

Este app usa:

- Supabase Auth para email/senha.
- Tabela `public.gym_app_states` para treino, feedback e configuracoes do app.
- Storage privado `gym-photos` para fotos otimizadas.
- Videos permanecem somente no dispositivo local.

## 1. Criar projeto

1. Acesse o Supabase Dashboard e crie um projeto.
2. Em `Project Settings > API`, copie:
   - `Project URL`
   - `anon public key`
3. Nao use `service_role` no app frontend.

## 2. Configurar Auth

1. Va em `Authentication > Providers`.
2. Ative `Email`.
3. Para teste rapido, voce pode desativar confirmacao de email em `Authentication > Sign In / Providers > Email`.
4. Para producao, deixe confirmacao ativa e configure as URLs permitidas do app.

## 3. Criar tabela, bucket e politicas

1. Abra `SQL Editor`.
2. Cole e execute o conteudo de [supabase/setup.sql](supabase/setup.sql).

O SQL cria:

- Tabela `gym_app_states` com RLS.
- Bucket privado `gym-photos`.
- Politicas para cada usuario ler/escrever apenas linhas e fotos do proprio `auth.uid()`.

## 4. Conectar o app

Crie um arquivo `.env.local` na raiz do projeto:

```bash
VITE_SUPABASE_URL=https://SEU-PROJETO.supabase.co
VITE_SUPABASE_ANON_KEY=SUA_ANON_PUBLIC_KEY
```

Reinicie o Vite depois de criar ou alterar esse arquivo:

```bash
npm run dev -- --host 127.0.0.1
```

Tambem e possivel preencher `Project URL` e `Anon key` diretamente no painel Supabase do app, mas `.env.local` e mais pratico.

## 5. Usar no app

1. Desbloqueie o app pelo PIN.
2. Abra o painel `Supabase`.
3. Marque `Sincronizar dados do app e fotos otimizadas`.
4. Crie conta ou entre com email/senha.
5. Clique `Enviar agora` para subir treino, feedback e fotos.
6. Clique `Baixar dados` em outro dispositivo para recuperar estado e fotos.

## 6. Midia

- Fotos sao redimensionadas no navegador para ate `1800px` no maior lado.
- Fotos sao convertidas para `WebP` com qualidade alta quando o navegador suporta; caso contrario, `JPEG`.
- O app nunca envia videos ao Supabase.
- Videos ficam no IndexedDB local do navegador e so existem naquele dispositivo.

