import { Router } from "express";
import { db, instructionsTable, cohortRolesTable } from "@workspace/db";
import { eq, and, or, isNull, lte } from "drizzle-orm";
import { requireAuth, requireAdmin } from "../lib/auth";

const router = Router();

router.get("/", requireAuth, async (req, res) => {
  try {
    const [role] = await db.select()
      .from(cohortRolesTable)
      .where(eq(cohortRolesTable.userId, req.session.userId!))
      .limit(1);

    if (!role) {
      res.json([]);
      return;
    }

    const now = new Date();

    const instructions = await db.select()
      .from(instructionsTable)
      .where(
        and(
          eq(instructionsTable.cohortId, role.cohortId),
          or(
            isNull(instructionsTable.releaseAt),
            lte(instructionsTable.releaseAt, now)
          ),
          or(
            isNull(instructionsTable.targetRole),
            eq(instructionsTable.targetRole, role.roleType),
            eq(instructionsTable.targetUserId, req.session.userId!)
          )
        )
      );

    res.json(instructions);
  } catch (err) {
    req.log.error({ err }, "Error fetching instructions");
    res.status(500).json({ error: "internal_error", message: "Failed to fetch instructions" });
  }
});

router.post("/", requireAdmin, async (req, res) => {
  const { cohortId, targetRole, targetUserId, content, releaseAt } = req.body;

  if (!cohortId || !content) {
    res.status(400).json({ error: "validation_error", message: "cohortId and content are required" });
    return;
  }

  try {
    const [instruction] = await db.insert(instructionsTable).values({
      cohortId: parseInt(cohortId),
      targetRole: targetRole || null,
      targetUserId: targetUserId ? parseInt(targetUserId) : null,
      content,
      releaseAt: releaseAt ? new Date(releaseAt) : null,
      createdByAdmin: req.session.userId!,
    }).returning();

    res.status(201).json(instruction);
  } catch (err) {
    req.log.error({ err }, "Error creating instruction");
    res.status(500).json({ error: "internal_error", message: "Failed to create instruction" });
  }
});

export default router;
