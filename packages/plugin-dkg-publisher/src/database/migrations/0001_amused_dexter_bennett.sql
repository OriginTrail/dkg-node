ALTER TABLE `publishing_attempts` DROP FOREIGN KEY `publishing_attempts_asset_id_assets_id_fk`;--> statement-breakpoint
ALTER TABLE `publishing_attempts` DROP FOREIGN KEY `publishing_attempts_wallet_id_wallets_id_fk`;--> statement-breakpoint
ALTER TABLE `wallet_metrics` DROP FOREIGN KEY `wallet_metrics_wallet_id_wallets_id_fk`;--> statement-breakpoint
DROP INDEX `idx_content_hash` ON `assets`;--> statement-breakpoint
DROP INDEX `idx_source` ON `assets`;--> statement-breakpoint
ALTER TABLE `assets` MODIFY COLUMN `id` int NOT NULL AUTO_INCREMENT;--> statement-breakpoint
ALTER TABLE `assets` MODIFY COLUMN `batch_id` int;--> statement-breakpoint
ALTER TABLE `assets` MODIFY COLUMN `status` enum('pending','queued','assigned','publishing','published','failed') NOT NULL DEFAULT 'pending';--> statement-breakpoint
ALTER TABLE `batches` MODIFY COLUMN `id` int NOT NULL AUTO_INCREMENT;--> statement-breakpoint
ALTER TABLE `publishing_attempts` MODIFY COLUMN `id` int NOT NULL AUTO_INCREMENT;--> statement-breakpoint
ALTER TABLE `publishing_attempts` MODIFY COLUMN `asset_id` int NOT NULL;--> statement-breakpoint
ALTER TABLE `publishing_attempts` MODIFY COLUMN `wallet_id` int;--> statement-breakpoint
ALTER TABLE `wallet_metrics` MODIFY COLUMN `wallet_id` int NOT NULL;--> statement-breakpoint
ALTER TABLE `wallets` MODIFY COLUMN `id` int NOT NULL AUTO_INCREMENT;--> statement-breakpoint
ALTER TABLE `assets` DROP INDEX `assets_content_hash_unique`;--> statement-breakpoint
ALTER TABLE `assets` ADD `wallet_id` int;--> statement-breakpoint
ALTER TABLE `assets` ADD `source` varchar(100);--> statement-breakpoint
ALTER TABLE `assets` ADD `source_id` varchar(255);--> statement-breakpoint
ALTER TABLE `assets` ADD `retry_count` int DEFAULT 0;--> statement-breakpoint
ALTER TABLE `assets` ADD `queued_at` timestamp;--> statement-breakpoint
ALTER TABLE `assets` ADD `assigned_at` timestamp;--> statement-breakpoint
ALTER TABLE `assets` ADD `publishing_started_at` timestamp;--> statement-breakpoint
CREATE INDEX `idx_source` ON `assets` (`source`,`source_id`);--> statement-breakpoint
ALTER TABLE `publishing_attempts` ADD CONSTRAINT `publishing_attempts_asset_id_assets_id_fk` FOREIGN KEY (`asset_id`) REFERENCES `assets`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `publishing_attempts` ADD CONSTRAINT `publishing_attempts_wallet_id_wallets_id_fk` FOREIGN KEY (`wallet_id`) REFERENCES `wallets`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `wallet_metrics` ADD CONSTRAINT `wallet_metrics_wallet_id_wallets_id_fk` FOREIGN KEY (`wallet_id`) REFERENCES `wallets`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `assets` ADD CONSTRAINT `assets_wallet_id_wallets_id_fk` FOREIGN KEY (`wallet_id`) REFERENCES `wallets`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `assets` DROP COLUMN `content_hash`;--> statement-breakpoint
ALTER TABLE `assets` DROP COLUMN `external_id`;--> statement-breakpoint
ALTER TABLE `assets` DROP COLUMN `external_source`;--> statement-breakpoint
ALTER TABLE `assets` DROP COLUMN `source_type`;--> statement-breakpoint
ALTER TABLE `assets` DROP COLUMN `source_reference`;--> statement-breakpoint
ALTER TABLE `assets` DROP COLUMN `asset_type`;