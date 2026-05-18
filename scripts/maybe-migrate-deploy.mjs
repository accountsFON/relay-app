#!/usr/bin/env node
import { execSync } from 'node:child_process';

const env = process.env.VERCEL_ENV;

if (env === 'production') {
  console.log('[maybe-migrate-deploy] VERCEL_ENV=production, running prisma migrate deploy');
  execSync('npx prisma migrate deploy --schema=src/db/schema.prisma', { stdio: 'inherit' });
} else {
  console.log(`[maybe-migrate-deploy] VERCEL_ENV=${env ?? '<unset>'}, skipping prisma migrate deploy`);
}
