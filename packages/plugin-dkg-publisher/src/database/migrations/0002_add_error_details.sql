ALTER TABLE `publishing_attempts` ADD COLUMN `error_details` json;--> statement-breakpoint
ALTER TABLE `wallets` CHANGE COLUMN `private_key_encrypted` `private_key` text NOT NULL;
