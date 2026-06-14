CREATE TYPE "LoadingAnimationMode" AS ENUM ('ALWAYS', 'ONCE_DAILY', 'OFF');

ALTER TABLE "User"
  ADD COLUMN "loadingAnimationMode" "LoadingAnimationMode" NOT NULL DEFAULT 'ALWAYS';
