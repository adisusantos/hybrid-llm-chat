ALTER TABLE characters ADD COLUMN world_setting TEXT NOT NULL DEFAULT '';
--> statement-breakpoint
ALTER TABLE characters ADD COLUMN face_description TEXT;
--> statement-breakpoint
ALTER TABLE characters ADD COLUMN use_ip_adapter INTEGER NOT NULL DEFAULT 0;
--> statement-breakpoint
ALTER TABLE characters ADD COLUMN ip_adapter_weight REAL NOT NULL DEFAULT 0.7;
