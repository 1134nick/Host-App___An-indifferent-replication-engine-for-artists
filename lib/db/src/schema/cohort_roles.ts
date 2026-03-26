import { pgTable, serial, integer, text, boolean, timestamp, pgEnum } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { usersTable } from "./users";
import { cohortsTable } from "./cohorts";

export const roleTypeEnum = pgEnum("role_type", ["team_member", "leader", "peripheral"]);
export const teamNameEnum = pgEnum("team_name", ["team_a", "team_b"]);

export const cohortRolesTable = pgTable("cohort_roles", {
  id: serial("id").primaryKey(),
  cohortId: integer("cohort_id").notNull().references(() => cohortsTable.id),
  userId: integer("user_id").notNull().references(() => usersTable.id),
  roleType: roleTypeEnum("role_type").notNull(),
  teamName: teamNameEnum("team_name"),
  isHiddenRole: boolean("is_hidden_role").notNull().default(false),
  assignedAt: timestamp("assigned_at").notNull().defaultNow(),
  // Prime association metadata — stored for future use, does not gate access
  isPrimePosition: boolean("is_prime_position"),
  primeTeamAssignment: text("prime_team_assignment"),
});

export const insertCohortRoleSchema = createInsertSchema(cohortRolesTable).omit({ id: true, assignedAt: true });
export type InsertCohortRole = z.infer<typeof insertCohortRoleSchema>;
export type CohortRole = typeof cohortRolesTable.$inferSelect;
