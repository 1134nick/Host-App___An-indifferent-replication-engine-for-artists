import { pgTable, serial, integer, text, pgEnum } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { cohortsTable } from "./cohorts";
import { usersTable } from "./users";

export const roomTypeEnum = pgEnum("room_type", ["team_a", "team_b", "leader", "peripheral", "admin_broadcast"]);

export const roomsTable = pgTable("rooms", {
  id: serial("id").primaryKey(),
  cohortId: integer("cohort_id").notNull().references(() => cohortsTable.id),
  roomType: roomTypeEnum("room_type").notNull(),
  visibilityRule: text("visibility_rule").notNull().default("role_based"),
});

export const roomMembersTable = pgTable("room_members", {
  id: serial("id").primaryKey(),
  roomId: integer("room_id").notNull().references(() => roomsTable.id),
  userId: integer("user_id").notNull().references(() => usersTable.id),
});

export const insertRoomSchema = createInsertSchema(roomsTable).omit({ id: true });
export const insertRoomMemberSchema = createInsertSchema(roomMembersTable).omit({ id: true });
export type InsertRoom = z.infer<typeof insertRoomSchema>;
export type Room = typeof roomsTable.$inferSelect;
export type RoomMember = typeof roomMembersTable.$inferSelect;
