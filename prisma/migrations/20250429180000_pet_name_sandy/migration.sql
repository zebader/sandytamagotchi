-- Default for new rows + rename legacy default pet
ALTER TABLE "Pet" ALTER COLUMN "name" SET DEFAULT 'Sandy';
UPDATE "Pet" SET name = 'Sandy' WHERE name = 'Tammy';
