import { Router } from "express";
import { db, roomsTable, roomMembersTable, messagesTable, messageReactionsTable, cohortRolesTable } from "@workspace/db";
import { eq, and, desc, sql, max, inArray } from "drizzle-orm";
import { generateMaskedLabel } from "../lib/cohort-engine";
import { requireAuth } from "../lib/auth";

const router = Router();

const ALLOWED_REACTION_GLYPHS = new Set([
  "✦",
  "✧",
  "❂",
  "☼",
  "▲",
  "◉",
  "✺",
  "⌬",
]);

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
        const [myMembership] = await db.select({ maskedLabel: roomMembersTable.maskedLabel })
          .from(roomMembersTable)
          .where(and(eq(roomMembersTable.roomId, roomId), eq(roomMembersTable.userId, req.session.userId!)))
          .limit(1);
        let myMaskedLabel = myMembership?.maskedLabel ?? null;
        if (!myMaskedLabel) {
          const candidate = generateMaskedLabel();
          await db.update(roomMembersTable)
            .set({ maskedLabel: candidate })
            .where(and(
              eq(roomMembersTable.roomId, roomId),
              eq(roomMembersTable.userId, req.session.userId!),
              sql`${roomMembersTable.maskedLabel} IS NULL`,
            ));
          const [refreshed] = await db.select({ maskedLabel: roomMembersTable.maskedLabel })
            .from(roomMembersTable)
            .where(and(eq(roomMembersTable.roomId, roomId), eq(roomMembersTable.userId, req.session.userId!)))
            .limit(1);
          myMaskedLabel = refreshed?.maskedLabel ?? candidate;
        }
        rooms.push({
          ...room,
          memberCount: Number(count),
          myMaskedLabel,
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
        });
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
  const roomId = parseInt(String(req.params.roomId));
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

    const ordered = messages.reverse();

    let reactionsByMessage: Record<number, Array<{
      id: number;
      messageId: number;
      glyph: string;
      maskedSenderLabel: string | null;
      mine: boolean;
      createdAt: Date;
    }>> = {};

    if (ordered.length > 0) {
      const ids = ordered.map((m) => m.id);
      const reactions = await db.select()
        .from(messageReactionsTable)
        .where(inArray(messageReactionsTable.messageId, ids));

      reactionsByMessage = reactions.reduce<typeof reactionsByMessage>((acc, r) => {
        const list = acc[r.messageId] ?? (acc[r.messageId] = []);
        list.push({
          id: r.id,
          messageId: r.messageId,
          glyph: r.glyph,
          maskedSenderLabel: r.maskedSenderLabel,
          mine: r.userId === req.session.userId,
          createdAt: r.createdAt,
        });
        return acc;
      }, {});
    }

    const enriched = ordered.map((m) => ({
      ...m,
      reactions: reactionsByMessage[m.id] ?? [],
    }));

    res.json(enriched);
  } catch (err) {
    req.log.error({ err }, "Error fetching messages");
    res.status(500).json({ error: "internal_error", message: "Failed to fetch messages" });
  }
});

router.post("/:roomId/messages", requireAuth, async (req, res) => {
  const roomId = parseInt(String(req.params.roomId));
  if (isNaN(roomId)) { res.status(400).json({ error: "validation_error", message: "Invalid room ID" }); return; }

  const { content, mediaType, mediaUrl, mediaMimeType, mediaDurationMs, isCapture, parentMessageId } = req.body as {
    content?: string;
    mediaType?: string;
    mediaUrl?: string;
    mediaMimeType?: string;
    mediaDurationMs?: number;
    isCapture?: boolean;
    parentMessageId?: number | null;
  };

  if (!content?.trim() && !mediaUrl) {
    res.status(400).json({ error: "validation_error", message: "Message must have content or media" });
    return;
  }

  if (mediaType && !["image", "audio", "video", "link"].includes(mediaType)) {
    res.status(400).json({ error: "validation_error", message: "mediaType must be image, audio, video, or link" });
    return;
  }

  if (parentMessageId !== undefined && parentMessageId !== null) {
    if (typeof parentMessageId !== "number" || !Number.isInteger(parentMessageId) || parentMessageId <= 0) {
      res.status(400).json({ error: "validation_error", message: "parentMessageId must be a positive integer" });
      return;
    }
  }

  const ALLOWED_AUDIO_MIME = new Set([
    "audio/mpeg",
    "audio/mp3",
    "audio/wav",
    "audio/x-wav",
    "audio/wave",
    "audio/webm",
    "audio/ogg",
    "audio/mp4",
  ]);

  let mediaProvider: "spotify" | "youtube" | "soundcloud" | null = null;
  let normalizedMediaUrl: string | null = mediaUrl ?? null;

  if (mediaType === "audio") {
    if (typeof mediaUrl !== "string" || !mediaUrl.startsWith("/objects/")) {
      res.status(400).json({ error: "validation_error", message: "Audio mediaUrl must reference an uploaded object" });
      return;
    }
    if (typeof mediaMimeType !== "string") {
      res.status(400).json({ error: "validation_error", message: "Audio mediaMimeType is required and must be a supported audio type" });
      return;
    }
    const baseMime = mediaMimeType.toLowerCase().split(";")[0].trim();
    if (!ALLOWED_AUDIO_MIME.has(baseMime)) {
      res.status(400).json({ error: "validation_error", message: "Audio mediaMimeType is required and must be a supported audio type" });
      return;
    }
    if (mediaDurationMs !== undefined && (typeof mediaDurationMs !== "number" || mediaDurationMs < 0 || mediaDurationMs > 30 * 60 * 1000)) {
      res.status(400).json({ error: "validation_error", message: "mediaDurationMs out of range" });
      return;
    }
  }

  if (mediaType === "link") {
    if (typeof mediaUrl !== "string" || !/^https:\/\//i.test(mediaUrl)) {
      res.status(400).json({ error: "validation_error", message: "Link mediaUrl must be a valid https URL" });
      return;
    }
    try {
      const parsed = new URL(mediaUrl);
      if (parsed.protocol !== "https:") {
        res.status(400).json({ error: "validation_error", message: "Link must use https" });
        return;
      }
      const host = parsed.hostname.toLowerCase().replace(/^www\./, "");
      const PROVIDER_HOSTS: Record<string, "spotify" | "youtube" | "soundcloud"> = {
        "spotify.com": "spotify",
        "open.spotify.com": "spotify",
        "youtube.com": "youtube",
        "m.youtube.com": "youtube",
        "music.youtube.com": "youtube",
        "youtu.be": "youtube",
        "soundcloud.com": "soundcloud",
        "m.soundcloud.com": "soundcloud",
        "on.soundcloud.com": "soundcloud",
      };
      const matchedProvider = PROVIDER_HOSTS[host];
      if (!matchedProvider) {
        res.status(400).json({ error: "validation_error", message: "Link must be from Spotify, YouTube, or SoundCloud" });
        return;
      }
      mediaProvider = matchedProvider;
      parsed.hash = "";
      normalizedMediaUrl = parsed.toString();
    } catch {
      res.status(400).json({ error: "validation_error", message: "Invalid URL" });
      return;
    }
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

    let validatedParentId: number | null = null;
    if (typeof parentMessageId === "number") {
      const [parent] = await db.select({ id: messagesTable.id, roomId: messagesTable.roomId })
        .from(messagesTable)
        .where(eq(messagesTable.id, parentMessageId))
        .limit(1);
      if (!parent || parent.roomId !== roomId) {
        res.status(400).json({ error: "validation_error", message: "parentMessageId does not reference a message in this room" });
        return;
      }
      validatedParentId = parent.id;
    }

    const [message] = await db.insert(messagesTable).values({
      roomId,
      userId: req.session.userId!,
      content: content?.trim() || "",
      isSystemMessage: false,
      maskedSenderLabel: membership.maskedLabel || "UNKNOWN-ENTITY",
      mediaType: mediaType || null,
      mediaUrl: normalizedMediaUrl,
      mediaProvider,
      mediaMimeType: mediaType === "audio" && typeof mediaMimeType === "string"
        ? mediaMimeType.toLowerCase().split(";")[0].trim()
        : null,
      mediaDurationMs: mediaType === "audio" && typeof mediaDurationMs === "number" ? Math.round(mediaDurationMs) : null,
      isCapture: mediaType === "audio" && isCapture === true,
      parentMessageId: validatedParentId,
    }).returning();

    res.status(201).json({ ...message, reactions: [] });
  } catch (err) {
    req.log.error({ err }, "Error sending message");
    res.status(500).json({ error: "internal_error", message: "Failed to send message" });
  }
});

router.delete("/:roomId/messages/:messageId", requireAuth, async (req, res) => {
  const roomId = parseInt(String(req.params.roomId));
  const messageId = parseInt(String(req.params.messageId));
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

    // Reactions cascade-delete via FK. The message row itself is removed.
    // Media files in object storage are intentionally preserved forever.
    await db.delete(messagesTable)
      .where(eq(messagesTable.id, messageId));

    res.json({ success: true });
  } catch (err) {
    req.log.error({ err }, "Error deleting message");
    res.status(500).json({ error: "internal_error", message: "Failed to delete message" });
  }
});

router.post("/:roomId/messages/:messageId/reactions", requireAuth, async (req, res) => {
  const roomId = parseInt(String(req.params.roomId));
  const messageId = parseInt(String(req.params.messageId));
  if (isNaN(roomId) || isNaN(messageId)) {
    res.status(400).json({ error: "validation_error", message: "Invalid IDs" });
    return;
  }

  const { glyph } = req.body as { glyph?: string };
  if (typeof glyph !== "string" || !ALLOWED_REACTION_GLYPHS.has(glyph)) {
    res.status(400).json({ error: "validation_error", message: "glyph must be one of the allowed reaction glyphs" });
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

    const [message] = await db.select({ id: messagesTable.id })
      .from(messagesTable)
      .where(and(eq(messagesTable.id, messageId), eq(messagesTable.roomId, roomId)))
      .limit(1);

    if (!message) {
      res.status(404).json({ error: "not_found", message: "Message not found" });
      return;
    }

    // Backfill masked label if missing
    if (!membership.maskedLabel) {
      const label = generateMaskedLabel();
      await db.update(roomMembersTable)
        .set({ maskedLabel: label })
        .where(and(eq(roomMembersTable.roomId, roomId), eq(roomMembersTable.userId, req.session.userId!)));
      membership.maskedLabel = label;
    }

    const [existing] = await db.select()
      .from(messageReactionsTable)
      .where(and(
        eq(messageReactionsTable.messageId, messageId),
        eq(messageReactionsTable.userId, req.session.userId!),
        eq(messageReactionsTable.glyph, glyph),
      ))
      .limit(1);

    if (existing) {
      res.status(201).json({
        id: existing.id,
        messageId: existing.messageId,
        glyph: existing.glyph,
        maskedSenderLabel: existing.maskedSenderLabel,
        mine: true,
        createdAt: existing.createdAt,
      });
      return;
    }

    const [reaction] = await db.insert(messageReactionsTable).values({
      messageId,
      userId: req.session.userId!,
      glyph,
      maskedSenderLabel: membership.maskedLabel,
    }).returning();

    res.status(201).json({
      id: reaction.id,
      messageId: reaction.messageId,
      glyph: reaction.glyph,
      maskedSenderLabel: reaction.maskedSenderLabel,
      mine: true,
      createdAt: reaction.createdAt,
    });
  } catch (err) {
    req.log.error({ err }, "Error adding reaction");
    res.status(500).json({ error: "internal_error", message: "Failed to add reaction" });
  }
});

router.delete("/:roomId/messages/:messageId/reactions/:glyph", requireAuth, async (req, res) => {
  const roomId = parseInt(String(req.params.roomId));
  const messageId = parseInt(String(req.params.messageId));
  const glyph = decodeURIComponent(String(req.params.glyph));

  if (isNaN(roomId) || isNaN(messageId)) {
    res.status(400).json({ error: "validation_error", message: "Invalid IDs" });
    return;
  }

  if (!ALLOWED_REACTION_GLYPHS.has(glyph)) {
    res.status(400).json({ error: "validation_error", message: "glyph must be one of the allowed reaction glyphs" });
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

    const [message] = await db.select({ id: messagesTable.id })
      .from(messagesTable)
      .where(and(eq(messagesTable.id, messageId), eq(messagesTable.roomId, roomId)))
      .limit(1);

    if (!message) {
      res.status(404).json({ error: "not_found", message: "Message not found in this room" });
      return;
    }

    await db.delete(messageReactionsTable)
      .where(and(
        eq(messageReactionsTable.messageId, messageId),
        eq(messageReactionsTable.userId, req.session.userId!),
        eq(messageReactionsTable.glyph, glyph),
      ));

    res.json({ success: true });
  } catch (err) {
    req.log.error({ err }, "Error removing reaction");
    res.status(500).json({ error: "internal_error", message: "Failed to remove reaction" });
  }
});

export default router;
