-- Apply once through the receiving environment's normal migration process.
-- Existing projects.id and this project_id must use the same charset/collation.
-- No existing monitor, schedule, answer, or financial data is rewritten.
CREATE TABLE `progress_monitor_organizations` (
  `project_id` varchar(36) NOT NULL,
  `revision` int unsigned NOT NULL,
  `groups` json NOT NULL,
  `membership` json NOT NULL,
  `created_at` timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`project_id`),
  CONSTRAINT `progress_monitor_organizations_project_id_projects_id_fk`
    FOREIGN KEY (`project_id`) REFERENCES `projects` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB;
