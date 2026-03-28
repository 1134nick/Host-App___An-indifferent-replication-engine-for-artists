import { pgTable, serial, integer, text, pgEnum, uniqueIndex } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { cohortsTable } from "./cohorts";
import { usersTable } from "./users";

export const roomTypeEnum = pgEnum("room_type", ["general", "team_a", "team_b", "leader", "peripheral", "admin_broadcast", "member_channel"]);

export const roomsTable = pgTable("rooms", {
  id: serial("id").primaryKey(),
  cohortId: integer("cohort_id").notNull().references(() => cohortsTable.id),
  roomType: roomTypeEnum("room_type").notNull(),
  visibilityRule: text("visibility_rule").notNull().default("role_based"),
  displayName: text("display_name"),
  channelNumber: integer("channel_number"),
  createdByUserId: integer("created_by_user_id").references(() => usersTable.id),
});

export const roomMembersTable = pgTable("room_members", {
  id: serial("id").primaryKey(),
  roomId: integer("room_id").notNull().references(() => roomsTable.id),
  userId: integer("user_id").notNull().references(() => usersTable.id),
  maskedLabel: text("masked_label"),
}, (table) => [
  uniqueIndex("room_members_room_user_idx").on(table.roomId, table.userId),
]);

export const insertRoomSchema = createInsertSchema(roomsTable).omit({ id: true });
export const insertRoomMemberSchema = createInsertSchema(roomMembersTable).omit({ id: true });
export type InsertRoom = z.infer<typeof insertRoomSchema>;
export type Room = typeof roomsTable.$inferSelect;
export type RoomMember = typeof roomMembersTable.$inferSelect;
