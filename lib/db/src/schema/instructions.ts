import { pgTable, serial, integer, text, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { cohortsTable } from "./cohorts";
import { usersTable } from "./users";

export const instructionsTable = pgTable("instructions", {
  id: serial("id").primaryKey(),
  cohortId: integer("cohort_id").notNull().references(() => cohortsTable.id),
  targetRole: text("target_role"),
  targetUserId: integer("target_user_id").references(() => usersTable.id),
  content: text("content").notNull(),
  releaseAt: timestamp("release_at"),
  createdByAdmin: integer("created_by_admin").references(() => usersTable.id),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertInstructionSchema = createInsertSchema(instructionsTable).omit({ id: true, createdAt: true });
export type InsertInstruction = z.infer<typeof insertInstructionSchema>;
export type Instruction = typeof instructionsTable.$inferSelect;
