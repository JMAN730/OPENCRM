#!/bin/sh
set -e

# Push schema to the database (idempotent)
node ./node_modules/prisma/build/index.js db push --skip-generate

exec node server.js
