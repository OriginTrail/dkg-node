-- Migration: Add user_id column to assets table for per-user asset tracking
-- Date: 2025-01-06
-- Description: Adds user_id column and indexes to support per-account asset filtering

-- Add user_id column
ALTER TABLE `assets` ADD `user_id` varchar(255);

-- Create index for user_id queries
CREATE INDEX `idx_user_id` ON `assets` (`user_id`);

-- Create composite index for efficient user + status + date queries
CREATE INDEX `idx_user_status` ON `assets` (`user_id`, `status`, `created_at`);

