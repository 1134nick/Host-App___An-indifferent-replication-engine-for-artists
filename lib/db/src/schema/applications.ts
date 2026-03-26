import { pgTable, serial, integer, text, timestamp, json, pgEnum } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { usersTable } from "./users";
import { cohortsTable } from "./cohorts";

export const applicationStatusEnum = pgEnum("application_status", ["submitted", "processing", "assigned"]);

export const applicationsTable = pgTable("applications", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => usersTable.id),
  cohortId: integer("cohort_id").references(() => cohortsTable.id),
  applicationOrder: integer("application_order"),
  age: integer("age").notNull(),
  nationality: text("nationality"),
  profession: text("profession"),
  educationalBackground: text("educational_background"),
  personalityAnswers: json("personality_answers").$type<Record<string, unknown>>(),
  skillTags: json("skill_tags").$type<string[]>().notNull().default([]),
  artistStatement: text("artist_statement").notNull(),
  status: applicationStatusEnum("status").notNull().default("submitted"),
  submittedAt: timestamp("submitted_at").notNull().defaultNow(),
});

export const insertApplicationSchema = createInsertSchema(applicationsTable).omit({ id: true, submittedAt: true });
export type InsertApplication = z.infer<typeof insertApplicationSchema>;
export type Application = typeof applicationsTable.$inferSelect;
