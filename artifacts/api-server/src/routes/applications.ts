import { Router } from "express";
import { db, applicationsTable, usersTable, cohortsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { requireAuth, requireAdmin } from "../lib/auth";
import { getOrCreateOpenCohort, assignUserOnApplication } from "../lib/cohort-engine";

const router = Router();

router.post("/", requireAuth, async (req, res) => {
  const { age, artistStatement } = req.body;

  if (!age || !artistStatement) {
    res.status(400).json({ error: "validation_error", message: "Age and statement are required" });
    return;
  }

  try {
    const existing = await db.select().from(applicationsTable)
      .where(eq(applicationsTable.userId, req.session.userId!))
      .limit(1);

    if (existing.length > 0) {
      res.status(400).json({ error: "already_applied", message: "You have already submitted an application" });
      return;
    }

    const cohort = await getOrCreateOpenCohort();
    const newOrder = cohort.applicantCount + 1;

    const [application] = await db.insert(applicationsTable).values({
      userId: req.session.userId!,
      cohortId: cohort.id,
      applicationOrder: newOrder,
      age: parseInt(age),
      artistStatement,
      status: "assigned",
    }).returning();

    await db.update(cohortsTable)
      .set({ applicantCount: newOrder })
      .where(eq(cohortsTable.id, cohort.id));

    // Grant immediate access — prime data stored as metadata for future use
    await assignUserOnApplication(req.session.userId!, cohort.id, newOrder);

    res.status(201).json({
      id: application.id,
      userId: application.userId,
      cohortId: application.cohortId,
      applicationOrder: application.applicationOrder,
      age: application.age,
      nationality: application.nationality,
      profession: application.profession,
      educationalBackground: application.educationalBackground,
      skillTags: application.skillTags,
      artistStatement: application.artistStatement,
      status: application.status,
      submittedAt: application.submittedAt,
    });
  } catch (err) {
    req.log.error({ err }, "Error submitting application");
    res.status(500).json({ error: "internal_error", message: "Failed to submit application" });
  }
});

router.get("/", requireAuth, async (req, res) => {
  try {
    const [application] = await db.select().from(applicationsTable)
      .where(eq(applicationsTable.userId, req.session.userId!))
      .limit(1);

    if (!application) {
      res.status(404).json({ error: "not_found", message: "No application found" });
      return;
    }

    res.json({
      id: application.id,
      userId: application.userId,
      cohortId: application.cohortId,
      applicationOrder: application.applicationOrder,
      age: application.age,
      nationality: application.nationality,
      profession: application.profession,
      educationalBackground: application.educationalBackground,
      skillTags: application.skillTags,
      artistStatement: application.artistStatement,
      status: application.status,
      submittedAt: application.submittedAt,
    });
  } catch (err) {
    req.log.error({ err }, "Error fetching application");
    res.status(500).json({ error: "internal_error", message: "Failed to fetch application" });
  }
});

router.get("/all", requireAdmin, async (req, res) => {
  try {
    const applications = await db.select({
      id: applicationsTable.id,
      userId: applicationsTable.userId,
      cohortId: applicationsTable.cohortId,
      applicationOrder: applicationsTable.applicationOrder,
      age: applicationsTable.age,
      nationality: applicationsTable.nationality,
      profession: applicationsTable.profession,
      educationalBackground: applicationsTable.educationalBackground,
      skillTags: applicationsTable.skillTags,
      artistStatement: applicationsTable.artistStatement,
      status: applicationsTable.status,
      submittedAt: applicationsTable.submittedAt,
      userDisplayName: usersTable.displayName,
      userEmail: usersTable.email,
    })
    .from(applicationsTable)
    .leftJoin(usersTable, eq(applicationsTable.userId, usersTable.id));

    res.json(applications);
  } catch (err) {
    req.log.error({ err }, "Error fetching all applications");
    res.status(500).json({ error: "internal_error", message: "Failed to fetch applications" });
  }
});

export default router;
