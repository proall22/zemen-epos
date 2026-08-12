-- Phase H: optional geo-pin for branches.
--
-- Stored as plain doubles (WGS84). We don't yet need PostGIS — these power
-- a "here's where we are" map view in the onboarding wizard + the branch
-- form. Both nullable: existing branches keep operating without coordinates.

ALTER TABLE "branches" ADD COLUMN "latitude" DOUBLE PRECISION;
ALTER TABLE "branches" ADD COLUMN "longitude" DOUBLE PRECISION;
