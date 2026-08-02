ALTER TABLE "theme_settings" ALTER COLUMN "font_pair" SET DEFAULT 'classic';--> statement-breakpoint
ALTER TABLE "theme_settings" ADD COLUMN "palette_id" text DEFAULT 'paper' NOT NULL;--> statement-breakpoint
-- Changing a column default does not touch existing rows. Any tenant created
-- before this migration still carries the placeholder 'default' font pair,
-- which is not a key in FONT_PAIRS -- it would resolve to the fallback forever
-- and quietly ignore whatever the owner picked.
UPDATE "theme_settings" SET "font_pair" = 'classic' WHERE "font_pair" = 'default';