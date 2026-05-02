import { pgTable, serial, integer, text, boolean, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { roomsTable } from "./rooms";
import { usersTable } from "./users";

export const messagesTable = pgTable("messages", {
  id: serial("id").primaryKey(),
  roomId: integer("room_id").notNull().references(() => roomsTable.id),
  userId: integer("user_id").references(() => usersTable.id),
  content: text("content").notNull().default(""),
  isSystemMessage: boolean("is_system_message").notNull().default(false),
  maskedSenderLabel: text("masked_sender_label"),
  mediaType: text("media_type"),
  mediaUrl: text("media_url"),
  mediaProvider: text("media_provider"),
  mediaMimeType: text("media_mime_type"),
  mediaDurationMs: integer("media_duration_ms"),
  isCapture: boolean("is_capture").notNull().default(false),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertMessageSchema = createInsertSchema(messagesTable).omit({ id: true, createdAt: true });
export type InsertMessage = z.infer<typeof insertMessageSchema>;
export type Message = typeof messagesTable.$inferSelect;
