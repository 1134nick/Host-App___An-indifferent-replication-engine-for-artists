import { Router } from "express";
import { db, usersTable, applicationsTable, cohortsTable } from "@workspace/db";
import { eq, sql } from "drizzle-orm";
import { requireAdmin } from "../lib/auth";

const router = Router();

router.get("/stats", requireAdmin, async (req, res) => {
  try {
    const [{ totalUsers }] = await db.select({ totalUsers: sql<number>`count(*)` }).from(usersTable);
    const [{ totalApplications }] = await db.select({ totalApplications: sql<number>`count(*)` }).from(applicationsTable);
    const [{ totalCohorts }] = await db.select({ totalCohorts: sql<number>`count(*)` }).from(cohortsTable);
    const [{ activeCohorts }] = await db.select({ activeCohorts: sql<number>`count(*)` }).from(cohortsTable).where(eq(cohortsTable.status, "active"));
    const [{ openCohortApplicants }] = await db.select({ openCohortApplicants: sql<number>`count(*)` }).from(applicationsTable).where(eq(applicationsTable.status, "submitted"));

    const openCohortCount = Number(openCohortApplicants);
    const spotsToFill = Math.max(0, 100 - openCohortCount);

    res.json({
      totalUsers: Number(totalUsers),
      totalApplications: Number(totalApplications),
      totalCohorts: Number(totalCohorts),
      activeCohorts: Number(activeCohorts),
      openCohortApplicants: openCohortCount,
      spotsToFill,
    });
  } catch (err) {
    req.log.error({ err }, "Error fetching admin stats");
    res.status(500).json({ error: "internal_error", message: "Failed to fetch stats" });
  }
});

export default router;
