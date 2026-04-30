-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateTable
CREATE TABLE "Owner" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Owner_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Pet" (
    "id" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "name" TEXT NOT NULL DEFAULT 'Tammy',
    "hunger" INTEGER NOT NULL,
    "hygiene" INTEGER NOT NULL,
    "fun" INTEGER NOT NULL,
    "rest" INTEGER NOT NULL,
    "isSleeping" BOOLEAN NOT NULL DEFAULT false,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Pet_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Pet_ownerId_key" ON "Pet"("ownerId");

-- AddForeignKey
ALTER TABLE "Pet" ADD CONSTRAINT "Pet_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "Owner"("id") ON DELETE CASCADE ON UPDATE CASCADE;
