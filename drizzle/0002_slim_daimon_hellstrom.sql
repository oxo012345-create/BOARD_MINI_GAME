CREATE TABLE `swarm_commands` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`code` text NOT NULL,
	`seat` integer NOT NULL,
	`sequence` integer NOT NULL,
	`body` text NOT NULL,
	`done` integer DEFAULT 0 NOT NULL,
	FOREIGN KEY (`code`) REFERENCES `swarm_rooms`(`code`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `swarm_command_identity` ON `swarm_commands` (`code`,`seat`,`sequence`);--> statement-breakpoint
CREATE INDEX `swarm_command_room` ON `swarm_commands` (`code`,`done`,`id`);--> statement-breakpoint
CREATE TABLE `swarm_rooms` (
	`code` text PRIMARY KEY NOT NULL,
	`mode` text NOT NULL,
	`seed` integer NOT NULL,
	`seats` text DEFAULT '[]' NOT NULL,
	`started` integer DEFAULT 0 NOT NULL,
	`revision` integer DEFAULT 0 NOT NULL,
	`next_tick` integer DEFAULT 0 NOT NULL,
	`last_at` integer DEFAULT 0 NOT NULL,
	`lease` text,
	`lease_until` integer DEFAULT 0 NOT NULL,
	`expires` integer NOT NULL,
	`created` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `swarm_rooms_expires` ON `swarm_rooms` (`expires`);--> statement-breakpoint
CREATE TABLE `swarm_states` (
	`code` text PRIMARY KEY NOT NULL,
	`checkpoint` text NOT NULL,
	`snapshot` text DEFAULT '' NOT NULL,
	`revision` integer DEFAULT 0 NOT NULL,
	`acks` text DEFAULT '[]' NOT NULL,
	FOREIGN KEY (`code`) REFERENCES `swarm_rooms`(`code`) ON UPDATE no action ON DELETE cascade
);
