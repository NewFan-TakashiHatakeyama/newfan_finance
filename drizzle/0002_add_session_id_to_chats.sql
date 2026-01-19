-- Migration: Add sessionId column to chats table
ALTER TABLE `chats` ADD COLUMN `sessionId` text DEFAULT '' NOT NULL;
