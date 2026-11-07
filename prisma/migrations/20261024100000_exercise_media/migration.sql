-- Exercise demonstrations (additive): ExerciseMedia + its two enums. Nothing existing is altered.
-- CreateEnum
CREATE TYPE "MediaKind" AS ENUM ('FRAMES', 'GIF', 'IMAGE');

-- CreateEnum
CREATE TYPE "MediaSource" AS ENUM ('BUNDLED_OPEN', 'COACH', 'LICENSED');

-- CreateTable
CREATE TABLE "ExerciseMedia" (
    "id" TEXT NOT NULL,
    "exerciseId" TEXT NOT NULL,
    "kind" "MediaKind" NOT NULL,
    "frames" TEXT[],
    "source" "MediaSource" NOT NULL,
    "author" TEXT,
    "license" TEXT,
    "licenseUrl" TEXT,
    "sourceUrl" TEXT,
    "modified" BOOLEAN NOT NULL DEFAULT false,
    "recolorable" BOOLEAN NOT NULL DEFAULT false,
    "order" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ExerciseMedia_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ExerciseMedia_exerciseId_idx" ON "ExerciseMedia"("exerciseId");

-- AddForeignKey
ALTER TABLE "ExerciseMedia" ADD CONSTRAINT "ExerciseMedia_exerciseId_fkey" FOREIGN KEY ("exerciseId") REFERENCES "Exercise"("id") ON DELETE CASCADE ON UPDATE CASCADE;

