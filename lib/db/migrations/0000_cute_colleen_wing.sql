CREATE TABLE `characters` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`description` text DEFAULT '' NOT NULL,
	`personality` text DEFAULT '' NOT NULL,
	`scenario` text DEFAULT '' NOT NULL,
	`first_mes` text DEFAULT '' NOT NULL,
	`mes_example` text DEFAULT '' NOT NULL,
	`system_prompt_override` text,
	`post_history_instructions` text DEFAULT '' NOT NULL,
	`avatar_path` text,
	`tags` text DEFAULT '[]' NOT NULL,
	`creator_notes` text DEFAULT '' NOT NULL,
	`character_version` text DEFAULT '1.0' NOT NULL,
	`alternate_greetings` text DEFAULT '[]' NOT NULL,
	`extensions` text DEFAULT '{}' NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch()) NOT NULL
);
--> statement-breakpoint
CREATE TABLE `chat_lorebooks` (
	`chat_id` text NOT NULL,
	`lorebook_id` text NOT NULL,
	PRIMARY KEY(`chat_id`, `lorebook_id`),
	FOREIGN KEY (`chat_id`) REFERENCES `chats`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`lorebook_id`) REFERENCES `lorebooks`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `chats` (
	`id` text PRIMARY KEY NOT NULL,
	`character_id` text NOT NULL,
	`title` text DEFAULT '' NOT NULL,
	`summary` text DEFAULT '' NOT NULL,
	`sampler_preset_id` text,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`character_id`) REFERENCES `characters`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `chats_character_id_idx` ON `chats` (`character_id`);--> statement-breakpoint
CREATE TABLE `lorebook_entries` (
	`id` text PRIMARY KEY NOT NULL,
	`lorebook_id` text NOT NULL,
	`keys` text NOT NULL,
	`secondary_keys` text DEFAULT '[]' NOT NULL,
	`content` text NOT NULL,
	`comment` text DEFAULT '' NOT NULL,
	`insertion_order` integer DEFAULT 0 NOT NULL,
	`enabled` integer DEFAULT true NOT NULL,
	`case_sensitive` integer DEFAULT false NOT NULL,
	`regex` integer DEFAULT false NOT NULL,
	`constant` integer DEFAULT false NOT NULL,
	`position` text DEFAULT 'after_char' NOT NULL,
	`priority` integer DEFAULT 100 NOT NULL,
	`selective_logic` text DEFAULT 'and' NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`lorebook_id`) REFERENCES `lorebooks`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `lorebook_entries_lorebook_priority_idx` ON `lorebook_entries` (`lorebook_id`,`priority`);--> statement-breakpoint
CREATE TABLE `lorebooks` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`description` text DEFAULT '' NOT NULL,
	`scan_depth` integer DEFAULT 5 NOT NULL,
	`token_budget` integer DEFAULT 1024 NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL
);
--> statement-breakpoint
CREATE TABLE `memories` (
	`id` text PRIMARY KEY NOT NULL,
	`chat_id` text NOT NULL,
	`content` text NOT NULL,
	`importance` integer DEFAULT 3 NOT NULL,
	`is_pinned` integer DEFAULT false NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`chat_id`) REFERENCES `chats`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `messages` (
	`id` text PRIMARY KEY NOT NULL,
	`chat_id` text NOT NULL,
	`role` text NOT NULL,
	`content` text NOT NULL,
	`name` text,
	`swipe_id` integer DEFAULT 0 NOT NULL,
	`is_hidden` integer DEFAULT false NOT NULL,
	`token_estimate` integer DEFAULT 0 NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`chat_id`) REFERENCES `chats`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `messages_chat_id_created_at_idx` ON `messages` (`chat_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `sampler_presets` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`scope` text DEFAULT 'global' NOT NULL,
	`config_json` text NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL
);
--> statement-breakpoint
CREATE TABLE `settings` (
	`key` text PRIMARY KEY NOT NULL,
	`value` text NOT NULL
);
