<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

## Implementation verification

Before writing Next.js app code, read the relevant guide in `node_modules/next/dist/docs/` and follow any deprecation notes for Next.js 16.

Standard validation commands in this repo:

- `npm run lint`
- `npm run type-check`
- `npm run test`
- `npm run build`
- `npm run test:e2e` for browser-flow changes

Local bootstrap commands used in the repo docs:

- `npx prisma db push`
- `npx prisma generate` if Prisma Client has not been generated after install
- `npm run seed`
- `npm run dev`

Whenever code or configuration changes are implemented, run the normal validation checks and launch the Docker stack with `docker compose up --build -d`. Verify that the app container starts, required services are healthy, the `migrate` service completes successfully, and the app responds from inside the Docker network before calling the work done.

Compose verification requires the documented minimum env values from `.env.example`, especially `NEXTAUTH_SECRET`, `NEXTAUTH_URL`, `POSTGRES_USER`, `POSTGRES_PASSWORD`, `POSTGRES_DB`, and `DATABASE_URL`.

For bare-server deployments that use the bundled reverse proxy, run `docker compose --profile proxy up --build -d` after setting `APP_DOMAIN` and `ACME_EMAIL`.

The compose `migrate` service currently runs the release-compat SQL script and then `prisma db push` before the app starts.
