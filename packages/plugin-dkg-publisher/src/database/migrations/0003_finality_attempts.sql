CREATE TABLE `finality_attempts` (
  `id` serial AUTO_INCREMENT NOT NULL,
  `asset_id` int NOT NULL,
  `attempt_number` int NOT NULL,
  `worker_id` varchar(100),
  `ual` varchar(255) NOT NULL,
  `transaction_hash` varchar(66),
  `confirmations` int,
  `required_confirmations` int,
  `status` enum('started','success','failed','timeout') NOT NULL,
  `error_type` varchar(50),
  `error_message` text,
  `started_at` timestamp NOT NULL,
  `completed_at` timestamp,
  `duration_seconds` int,
  `created_at` timestamp DEFAULT (now()),
  CONSTRAINT `finality_attempts_asset_id_assets_id_fk` FOREIGN KEY (`asset_id`) REFERENCES `assets`(`id`) ON DELETE cascade ON UPDATE no action
);--> statement-breakpoint
CREATE INDEX `idx_finality_asset_attempts` ON `finality_attempts` (`asset_id`,`attempt_number`);--> statement-breakpoint
