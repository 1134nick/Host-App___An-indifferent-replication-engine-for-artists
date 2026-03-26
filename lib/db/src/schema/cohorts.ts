import { pgTable, serial, integer, timestamp, pgEnum } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const cohortStatusEnum = pgEnum("cohort_status", ["open", "processing", "active", "closed"]);

export const cohortsTable = pgTable("cohorts", {
  id: serial("id").primaryKey(),
  cohortNumber: integer("cohort_number").notNull().unique(),
  applicantCount: integer("applicant_count").notNull().default(0),
  status: cohortStatusEnum("status").notNull().default("open"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  lockedAt: timestamp("locked_at"),
});

export const insertCohortSchema = createInsertSchema(cohortsTable).omit({ id: true, createdAt: true });
export type InsertCohort = z.infer<typeof insertCohortSchema>;
export type Cohort = typeof cohortsTable.$inferSelect;
