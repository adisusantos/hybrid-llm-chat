CREATE TABLE `generated_images` (
	`id` text PRIMARY KEY NOT NULL,
	`chat_id` text NOT NULL,
	`message_id` text NOT NULL,
	`prompt` text NOT NULL,
	`negative_prompt` text DEFAULT '' NOT NULL,
	`params_json` text DEFAULT '{}' NOT NULL,
	`file_path` text NOT NULL,
	`width` integer NOT NULL,
	`height` integer NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`chat_id`) REFERENCES `chats`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`message_id`) REFERENCES `messages`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `generated_images_chat_idx` ON `generated_images` (`chat_id`);--> statement-breakpoint
CREATE INDEX `generated_images_message_idx` ON `generated_images` (`message_id`);--> statement-breakpoint
ALTER TABLE `characters` ADD `appearance` text DEFAULT '' NOT NULL;