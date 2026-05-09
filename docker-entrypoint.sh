#!/bin/sh
set -e

# Push schema to the database (idempotent)
npx prisma db push --skip-generate

exec node server.js
