<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

## Implementation verification

Whenever code or configuration changes are implemented, run the normal validation checks and launch the Docker stack with `docker compose up --build -d`. Verify that the app container starts, required services are healthy, migrations complete, and the app responds from inside the Docker network before calling the work done.
