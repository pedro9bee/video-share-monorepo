# Video Share Monorepo

Monorepo para a aplicação de compartilhamento de vídeos com frontend e backend separados.

## Estrutura

- `packages/backend`: Servidor Express, gerenciamento do Cloudflare Tunnel, API de tracking.
- `packages/frontend`: Interface do usuário com player de vídeo, construída com Rollup.
- `.github/workflows`: CI/CD (exemplo).

## Como Usar (Localmente)

1.  **Instalar Dependências:**
    ```bash
    npm install
    ```
2.  **Configurar Backend:** Crie um arquivo `.env` em `packages/backend/.env` com as variáveis (veja `packages/backend/.env.example`).
3.  **Construir Frontend:**
    ```bash
    npm run build
    ```
4.  **Iniciar Backend (com Cloudflare):**
    ```bash
    npm run start:backend
    ```
5.  **Desenvolvimento (Frontend + Backend com Watch):**
    ```bash
    npm run dev
    ```

# Garanta que tudo está commitado
git add .
git commit -m "feat: frontend to Typescript"

# Crie a nova tag
git tag -a v1.0.2 -m "Frontend to Typescript"

# Envie a tag para o repositório remoto
git push origin v1.0.2
