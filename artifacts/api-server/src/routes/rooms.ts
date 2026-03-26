import { Router } from "express";
import { db, roomsTable, roomMembersTable, messagesTable, usersTable } from "@workspace/db";
import { eq, and, desc } from "drizzle-orm";
import { requireAuth } from "../lib/auth";
import { sql } from "drizzle-orm";

const router = Router();

router.get("/", requireAuth, async (req, res) => {
  try {
    const memberships = await db.select({
      roomId: roomMembersTable.roomId,
    })
    .from(roomMembersTable)
    .where(eq(roomMembersTable.userId, req.session.userId!));

    if (memberships.length === 0) {
      res.json([]);
      return;
    }

    const roomIds = memberships.map(m => m.roomId);
    const rooms = [];

    for (const roomId of roomIds) {
      const [room] = await db.select().from(roomsTable).where(eq(roomsTable.id, roomId)).limit(1);
      if (room) {
        const memberCount = await db.select({ count: sql<number>`count(*)` })
          .from(roomMembersTable)
          .where(eq(roomMembersTable.roomId, roomId));
        rooms.push({
          ...room,
          memberCount: Number(memberCount[0]?.count ?? 0),
        });
      }
    }

    res.json(rooms);
  } catch (err) {
    req.log.error({ err }, "Error fetching rooms");
    res.status(500).json({ error: "internal_error", message: "Failed to fetch rooms" });
  }
});

router.get("/:roomId/messages", requireAuth, async (req, res) => {
  const roomId = parseInt(req.params.roomId);
  if (isNaN(roomId)) {
    res.status(400).json({ error: "validation_error", message: "Invalid room ID" });
    return;
  }

  const limit = parseInt(req.query.limit as string) || 50;
  const offset = parseInt(req.query.offset as string) || 0;

  try {
    const [membership] = await db.select()
      .from(roomMembersTable)
      .where(and(eq(roomMembersTable.roomId, roomId), eq(roomMembersTable.userId, req.session.userId!)))
      .limit(1);

    if (!membership) {
      res.status(403).json({ error: "forbidden", message: "You do not have access to this room" });
      return;
    }

    const messages = await db.select()
      .from(messagesTable)
      .where(eq(messagesTable.roomId, roomId))
      .orderBy(desc(messagesTable.createdAt))
      .limit(limit)
      .offset(offset);

    res.json(messages.reverse());
  } catch (err) {
    req.log.error({ err }, "Error fetching messages");
    res.status(500).json({ error: "internal_error", message: "Failed to fetch messages" });
  }
});

router.post("/:roomId/messages", requireAuth, async (req, res) => {
  const roomId = parseInt(req.params.roomId);
  if (isNaN(roomId)) {
    res.status(400).json({ error: "validation_error", message: "Invalid room ID" });
    return;
  }

  const { content } = req.body;
  if (!content || content.trim().length === 0) {
    res.status(400).json({ error: "validation_error", message: "Message content is required" });
    return;
  }

  try {
    const [membership] = await db.select()
      .from(roomMembersTable)
      .where(and(eq(roomMembersTable.roomId, roomId), eq(roomMembersTable.userId, req.session.userId!)))
      .limit(1);

    if (!membership) {
      res.status(403).json({ error: "forbidden", message: "You do not have access to this room" });
      return;
    }

    const [room] = await db.select().from(roomsTable).where(eq(roomsTable.id, roomId)).limit(1);

    const [message] = await db.insert(messagesTable).values({
      roomId,
      userId: req.session.userId!,
      content: content.trim(),
      isSystemMessage: false,
      maskedSenderLabel: room.roomType === "peripheral" ? "Member" : null,
    }).returning();

    res.status(201).json(message);
  } catch (err) {
    req.log.error({ err }, "Error sending message");
    res.status(500).json({ error: "internal_error", message: "Failed to send message" });
  }
});

export default router;
