-- Use floating-point stats so server and client time simulation stay aligned (Int was truncating).
ALTER TABLE "Pet" ALTER COLUMN "hunger" SET DATA TYPE DOUBLE PRECISION USING "hunger"::double precision;
ALTER TABLE "Pet" ALTER COLUMN "hygiene" SET DATA TYPE DOUBLE PRECISION USING "hygiene"::double precision;
ALTER TABLE "Pet" ALTER COLUMN "fun" SET DATA TYPE DOUBLE PRECISION USING "fun"::double precision;
ALTER TABLE "Pet" ALTER COLUMN "rest" SET DATA TYPE DOUBLE PRECISION USING "rest"::double precision;
