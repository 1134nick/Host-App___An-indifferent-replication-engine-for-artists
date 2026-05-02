import { pgTable, serial, integer, text, boolean, timestamp, uniqueIndex, type AnyPgColumn } from "drizzle-orm/pg-core";
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
  parentMessageId: integer("parent_message_id").references((): AnyPgColumn => messagesTable.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const messageReactionsTable = pgTable(
  "message_reactions",
  {
    id: serial("id").primaryKey(),
    messageId: integer("message_id")
      .notNull()
      .references(() => messagesTable.id, { onDelete: "cascade" }),
    userId: integer("user_id")
      .notNull()
      .references(() => usersTable.id),
    glyph: text("glyph").notNull(),
    maskedSenderLabel: text("masked_sender_label"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => [uniqueIndex("message_reactions_unique").on(t.messageId, t.userId, t.glyph)],
);

export const insertMessageSchema = createInsertSchema(messagesTable).omit({ id: true, createdAt: true });
export type InsertMessage = z.infer<typeof insertMessageSchema>;
export type Message = typeof messagesTable.$inferSelect;

export const insertMessageReactionSchema = createInsertSchema(messageReactionsTable).omit({ id: true, createdAt: true });
export type InsertMessageReaction = z.infer<typeof insertMessageReactionSchema>;
export type MessageReaction = typeof messageReactionsTable.$inferSelect;
