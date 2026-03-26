import { Router } from "express";
import { db, roomsTable, roomMembersTable, messagesTable } from "@workspace/db";
import { eq, and, desc, gte, sql } from "drizzle-orm";
import { generateMaskedLabel } from "../lib/cohort-engine";
import { requireAuth } from "../lib/auth";

const router = Router();

router.get("/", requireAuth, async (req, res) => {
  try {
    const memberships = await db.select({ roomId: roomMembersTable.roomId })
      .from(roomMembersTable)
      .where(eq(roomMembersTable.userId, req.session.userId!));

    if (memberships.length === 0) {
      res.json([]);
      return;
    }

    const rooms = [];
    for (const { roomId } of memberships) {
      const [room] = await db.select().from(roomsTable).where(eq(roomsTable.id, roomId)).limit(1);
      if (room) {
        const [{ count }] = await db.select({ count: sql<number>`count(*)` })
          .from(roomMembersTable)
          .where(eq(roomMembersTable.roomId, roomId));
        rooms.push({ ...room, memberCount: Number(count) });
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
  if (isNaN(roomId)) { res.status(400).json({ error: "validation_error", message: "Invalid room ID" }); return; }

  const limit = parseInt(req.query.limit as string) || 50;
  const offset = parseInt(req.query.offset as string) || 0;

  try {
    const [membership] = await db.select()
      .from(roomMembersTable)
      .where(and(eq(roomMembersTable.roomId, roomId), eq(roomMembersTable.userId, req.session.userId!)))
      .limit(1);

    if (!membership) { res.status(403).json({ error: "forbidden", message: "No access to this room" }); return; }

    const thirtyMinAgo = sql`now() - interval '30 minutes'`;
    const messages = await db.select()
      .from(messagesTable)
      .where(and(eq(messagesTable.roomId, roomId), gte(messagesTable.createdAt, thirtyMinAgo)))
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
  if (isNaN(roomId)) { res.status(400).json({ error: "validation_error", message: "Invalid room ID" }); return; }

  const { content, mediaType, mediaUrl } = req.body;

  // Must have either text content or a media attachment
  if (!content?.trim() && !mediaUrl) {
    res.status(400).json({ error: "validation_error", message: "Message must have content or media" });
    return;
  }

  // Validate mediaType if provided
  if (mediaType && !["image", "audio"].includes(mediaType)) {
    res.status(400).json({ error: "validation_error", message: "mediaType must be image or audio" });
    return;
  }

  try {
    // Check room membership and get the user's masked label
    const [membership] = await db.select()
      .from(roomMembersTable)
      .where(and(eq(roomMembersTable.roomId, roomId), eq(roomMembersTable.userId, req.session.userId!)))
      .limit(1);

    if (!membership) { res.status(403).json({ error: "forbidden", message: "No access to this room" }); return; }

    // Backfill masked label for members who joined before this feature existed
    if (!membership.maskedLabel) {
      const label = generateMaskedLabel();
      await db.update(roomMembersTable)
        .set({ maskedLabel: label })
        .where(and(eq(roomMembersTable.roomId, roomId), eq(roomMembersTable.userId, req.session.userId!)));
      membership.maskedLabel = label;
    }

    const [message] = await db.insert(messagesTable).values({
      roomId,
      userId: req.session.userId!,
      content: content?.trim() || "",
      isSystemMessage: false,
      maskedSenderLabel: membership.maskedLabel || "UNKNOWN-ENTITY",
      mediaType: mediaType || null,
      mediaUrl: mediaUrl || null,
    }).returning();

    res.status(201).json(message);
  } catch (err) {
    req.log.error({ err }, "Error sending message");
    res.status(500).json({ error: "internal_error", message: "Failed to send message" });
  }
});

export default router;
