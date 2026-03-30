import { Router } from "express";
import { db, roomsTable, roomMembersTable, messagesTable, cohortRolesTable } from "@workspace/db";
import { eq, and, desc, sql, max, inArray } from "drizzle-orm";
import { generateMaskedLabel } from "../lib/cohort-engine";
import { requireAuth } from "../lib/auth";
import { requireAdmin } from "../lib/auth";

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
        rooms.push({
          ...room,
          memberCount: Number(count),
        });
      }
    }

    rooms.sort((a, b) => {
      if (a.roomType === "general" && b.roomType !== "general") return -1;
      if (a.roomType !== "general" && b.roomType === "general") return 1;
      return (a.channelNumber ?? 0) - (b.channelNumber ?? 0);
    });

    res.json(rooms);
  } catch (err) {
    req.log.error({ err }, "Error fetching rooms");
    res.status(500).json({ error: "internal_error", message: "Failed to fetch rooms" });
  }
});

router.post("/", requireAuth, async (req, res) => {
  const { name } = req.body;

  if (!name || typeof name !== "string" || name.trim().length === 0 || name.trim().length > 50) {
    res.status(400).json({ error: "validation_error", message: "Channel name is required (max 50 characters)" });
    return;
  }

  try {
    const [role] = await db.select()
      .from(cohortRolesTable)
      .where(eq(cohortRolesTable.userId, req.session.userId!))
      .limit(1);

    if (!role) {
      res.status(403).json({ error: "forbidden", message: "You must be a cohort member to create a channel" });
      return;
    }

    const result = await db.transaction(async (tx) => {
      const [maxResult] = await tx.select({ maxNum: max(roomsTable.channelNumber) })
        .from(roomsTable)
        .where(eq(roomsTable.cohortId, role.cohortId));

      const nextNumber = (maxResult?.maxNum ?? 0) + 1;

      const [newRoom] = await tx.insert(roomsTable).values({
        cohortId: role.cohortId,
        roomType: "member_channel",
        visibilityRule: "all_members",
        displayName: name.trim(),
        channelNumber: nextNumber,
        createdByUserId: req.session.userId!,
      }).returning();

      const cohortMembers = await tx.select({ userId: cohortRolesTable.userId })
        .from(cohortRolesTable)
        .where(eq(cohortRolesTable.cohortId, role.cohortId));

      for (const member of cohortMembers) {
        await tx.insert(roomMembersTable).values({
          roomId: newRoom.id,
          userId: member.userId,
          maskedLabel: generateMaskedLabel(),
        }).onConflictDoNothing();
      }

      return { ...newRoom, memberCount: cohortMembers.length };
    });

    res.status(201).json(result);
  } catch (err) {
    req.log.error({ err }, "Error creating channel");
    res.status(500).json({ error: "internal_error", message: "Failed to create channel" });
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
  if (isNaN(roomId)) { res.status(400).json({ error: "validation_error", message: "Invalid room ID" }); return; }

  const { content, mediaType, mediaUrl, mediaMeta } = req.body;

  if (!content?.trim() && !mediaUrl) {
    res.status(400).json({ error: "validation_error", message: "Message must have content or media" });
    return;
  }

  if (mediaType && !["image", "audio", "video"].includes(mediaType)) {
    res.status(400).json({ error: "validation_error", message: "mediaType must be image, audio, or video" });
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
      mediaMeta: mediaMeta || null,
    }).returning();

    res.status(201).json(message);
  } catch (err) {
    req.log.error({ err }, "Error sending message");
    res.status(500).json({ error: "internal_error", message: "Failed to send message" });
  }
});

router.delete("/:roomId", requireAuth, async (req, res) => {
  const roomId = parseInt(req.params.roomId);
  if (isNaN(roomId)) {
    res.status(400).json({ error: "validation_error", message: "Invalid room ID" });
    return;
  }

  try {
    const [room] = await db.select().from(roomsTable).where(eq(roomsTable.id, roomId)).limit(1);

    if (!room) {
      res.status(404).json({ error: "not_found", message: "Room not found" });
      return;
    }

    if (room.roomType === "general") {
      res.status(403).json({ error: "forbidden", message: "Cannot delete the general channel" });
      return;
    }

    const isCreator = room.createdByUserId === req.session.userId;
    const isAdmin = req.session.isAdmin === true;

    if (!isCreator && !isAdmin) {
      res.status(403).json({ error: "forbidden", message: "Only the channel creator or an admin can delete this channel" });
      return;
    }

    await db.transaction(async (tx) => {
      await tx.delete(messagesTable).where(eq(messagesTable.roomId, roomId));
      await tx.delete(roomMembersTable).where(eq(roomMembersTable.roomId, roomId));
      await tx.delete(roomsTable).where(eq(roomsTable.id, roomId));
    });

    res.json({ success: true });
  } catch (err) {
    req.log.error({ err }, "Error deleting room");
    res.status(500).json({ error: "internal_error", message: "Failed to delete room" });
  }
});

router.delete("/:roomId/messages/:messageId", requireAuth, async (req, res) => {
  const roomId = parseInt(req.params.roomId);
  const messageId = parseInt(req.params.messageId);
  if (isNaN(roomId) || isNaN(messageId)) {
    res.status(400).json({ error: "validation_error", message: "Invalid IDs" });
    return;
  }

  try {
    const [membership] = await db.select()
      .from(roomMembersTable)
      .where(and(eq(roomMembersTable.roomId, roomId), eq(roomMembersTable.userId, req.session.userId!)))
      .limit(1);

    if (!membership) {
      res.status(403).json({ error: "forbidden", message: "No access to this room" });
      return;
    }

    const [message] = await db.select()
      .from(messagesTable)
      .where(and(eq(messagesTable.id, messageId), eq(messagesTable.roomId, roomId)))
      .limit(1);

    if (!message) {
      res.status(404).json({ error: "not_found", message: "Message not found" });
      return;
    }

    if (message.userId !== req.session.userId) {
      res.status(403).json({ error: "forbidden", message: "You can only delete your own messages" });
      return;
    }

    // Only delete the database row. Media files in object storage are
    // intentionally preserved forever — audio and video recordings are
    // never removed from storage even when the message is deleted.
    await db.delete(messagesTable)
      .where(eq(messagesTable.id, messageId));

    res.json({ success: true });
  } catch (err) {
    req.log.error({ err }, "Error deleting message");
    res.status(500).json({ error: "internal_error", message: "Failed to delete message" });
  }
});

router.post("/backfill-memberships", requireAdmin, async (req, res) => {
  try {
    const sharedRooms = await db.select().from(roomsTable)
      .where(inArray(roomsTable.roomType, ["general", "member_channel"]));

    let totalAdded = 0;
    for (const room of sharedRooms) {
      const cohortMembers = await db.select({ userId: cohortRolesTable.userId })
        .from(cohortRolesTable)
        .where(eq(cohortRolesTable.cohortId, room.cohortId));

      const roomMembers = await db.select({ userId: roomMembersTable.userId })
        .from(roomMembersTable)
        .where(eq(roomMembersTable.roomId, room.id));

      const existingIds = new Set(roomMembers.map(m => m.userId));
      const missing = cohortMembers.filter(m => !existingIds.has(m.userId));

      for (const m of missing) {
        await db.insert(roomMembersTable).values({
          roomId: room.id,
          userId: m.userId,
          maskedLabel: generateMaskedLabel(),
        }).onConflictDoNothing();
        totalAdded++;
      }
    }

    res.json({ success: true, membershipsAdded: totalAdded });
  } catch (err) {
    req.log.error({ err }, "Error backfilling memberships");
    res.status(500).json({ error: "internal_error", message: "Failed to backfill" });
  }
});

export default router;
