#!/bin/sh
set -e

# Push schema to the database (idempotent)
./node_modules/.bin/prisma db push --skip-generate

exec node server.js
