import { Router } from "express";
import { db, cohortRolesTable, cohortsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { requireAuth } from "../lib/auth";
import { getRoleStatusLabel } from "../lib/cohort-engine";

const router = Router();

router.get("/", requireAuth, async (req, res) => {
  try {
    const [role] = await db.select({
      roleType: cohortRolesTable.roleType,
      teamName: cohortRolesTable.teamName,
      isHiddenRole: cohortRolesTable.isHiddenRole,
      assignedAt: cohortRolesTable.assignedAt,
      cohortNumber: cohortsTable.cohortNumber,
    })
    .from(cohortRolesTable)
    .leftJoin(cohortsTable, eq(cohortRolesTable.cohortId, cohortsTable.id))
    .where(eq(cohortRolesTable.userId, req.session.userId!))
    .limit(1);

    if (!role) {
      res.status(404).json({ error: "not_found", message: "No role assigned" });
      return;
    }

    const statusLabel = getRoleStatusLabel(role.roleType, role.teamName);

    res.json({
      roleType: role.roleType,
      teamName: role.teamName,
      isHiddenRole: role.isHiddenRole,
      cohortNumber: role.cohortNumber,
      statusLabel,
      assignedAt: role.assignedAt,
    });
  } catch (err) {
    req.log.error({ err }, "Error fetching role");
    res.status(500).json({ error: "internal_error", message: "Failed to fetch role" });
  }
});

export default router;
