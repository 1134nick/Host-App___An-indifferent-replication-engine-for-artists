import { Router } from "express";
import { db, cohortsTable, applicationsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { requireAdmin } from "../lib/auth";
import { processCohort, getOrCreateOpenCohort } from "../lib/cohort-engine";

const router = Router();

router.get("/", requireAdmin, async (req, res) => {
  try {
    const cohorts = await db.select().from(cohortsTable);
    res.json(cohorts);
  } catch (err) {
    req.log.error({ err }, "Error fetching cohorts");
    res.status(500).json({ error: "internal_error", message: "Failed to fetch cohorts" });
  }
});

router.get("/current", async (req, res) => {
  try {
    const cohort = await getOrCreateOpenCohort();
    res.json({
      cohortNumber: cohort.cohortNumber,
      applicantCount: cohort.applicantCount,
      spotsRemaining: 100 - cohort.applicantCount,
      status: "open",
    });
  } catch (err) {
    req.log.error({ err }, "Error fetching current cohort");
    res.status(500).json({ error: "internal_error", message: "Failed to fetch cohort status" });
  }
});

router.post("/:cohortId/process", requireAdmin, async (req, res) => {
  const cohortId = parseInt(req.params.cohortId);
  if (isNaN(cohortId)) {
    res.status(400).json({ error: "validation_error", message: "Invalid cohort ID" });
    return;
  }

  try {
    const [cohort] = await db.select().from(cohortsTable).where(eq(cohortsTable.id, cohortId)).limit(1);
    if (!cohort) {
      res.status(404).json({ error: "not_found", message: "Cohort not found" });
      return;
    }

    const result = await processCohort(cohortId);
    res.json(result);
  } catch (err) {
    req.log.error({ err }, "Error processing cohort");
    res.status(500).json({ error: "internal_error", message: "Failed to process cohort" });
  }
});

export default router;
