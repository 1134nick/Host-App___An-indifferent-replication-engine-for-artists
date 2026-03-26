import { db, cohortsTable, applicationsTable, cohortRolesTable, roomsTable, roomMembersTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";

// Prime positions within a 100-person cohort — stored as metadata, not used for access control
export const PRIMES_TO_100 = [2,3,5,7,11,13,17,19,23,29,31,37,41,43,47,53,59,61,67,71,73,79,83,89,97];
export const TEAM_A_POSITIONS = [2,3,5,7,11,13,17,19,23,29,31,37];
export const TEAM_B_POSITIONS = [41,43,47,53,59,61,67,71,73,79,83,89];
export const LEADER_POSITION = 97;

/** Compute the prime association metadata for a given position — for informational use only */
export function computePrimeAssociation(position: number): {
  isPrimePosition: boolean;
  primeTeamAssignment: string | null;
} {
  const isPrimePosition = PRIMES_TO_100.includes(position);
  let primeTeamAssignment: string | null = null;
  if (TEAM_A_POSITIONS.includes(position)) primeTeamAssignment = "team_a";
  else if (TEAM_B_POSITIONS.includes(position)) primeTeamAssignment = "team_b";
  else if (position === LEADER_POSITION) primeTeamAssignment = "leader";
  return { isPrimePosition, primeTeamAssignment };
}

export async function getOrCreateOpenCohort(): Promise<{ id: number; cohortNumber: number; applicantCount: number }> {
  const existing = await db.select()
    .from(cohortsTable)
    .where(eq(cohortsTable.status, "open"))
    .limit(1);

  if (existing.length > 0) {
    return existing[0];
  }

  const allCohorts = await db.select().from(cohortsTable);
  const nextNumber = allCohorts.length + 1;

  const [newCohort] = await db.insert(cohortsTable)
    .values({ cohortNumber: nextNumber, applicantCount: 0, status: "open" })
    .returning();

  return newCohort;
}

const SIGNAL_ADJECTIVES = ["SILENT","HOLLOW","LATENT","OPAQUE","COVERT","VEILED","MUTED","REMOTE","OBSCURE","INERT","STILL","VOID"];
const SIGNAL_NOUNS = ["SIGNAL","NODE","RELAY","CONDUIT","ENTITY","VECTOR","THREAD","CHANNEL","CIRCUIT","CARRIER"];

/** Generate a stable anonymous label for a user in a room */
export function generateMaskedLabel(): string {
  const adj = SIGNAL_ADJECTIVES[Math.floor(Math.random() * SIGNAL_ADJECTIVES.length)];
  const noun = SIGNAL_NOUNS[Math.floor(Math.random() * SIGNAL_NOUNS.length)];
  const num = Math.floor(Math.random() * 900) + 100;
  return `${adj}-${noun}-${num}`;
}

/** Get or create the shared general room for a cohort */
async function getOrCreateGeneralRoom(cohortId: number): Promise<number> {
  const existing = await db.select()
    .from(roomsTable)
    .where(and(eq(roomsTable.cohortId, cohortId), eq(roomsTable.roomType, "general")))
    .limit(1);

  if (existing.length > 0) return existing[0].id;

  const [room] = await db.insert(roomsTable)
    .values({ cohortId, roomType: "general", visibilityRule: "all_members" })
    .returning();

  return room.id;
}

/**
 * Called immediately when a user submits an application.
 * Grants full access regardless of prime position.
 * Prime association is stored as metadata for future use.
 */
export async function assignUserOnApplication(
  userId: number,
  cohortId: number,
  applicationOrder: number
): Promise<void> {
  const { isPrimePosition, primeTeamAssignment } = computePrimeAssociation(applicationOrder);

  // All users are assigned as team_member — prime data stored but not used for access
  await db.insert(cohortRolesTable).values({
    cohortId,
    userId,
    roleType: "team_member",
    teamName: null,
    isHiddenRole: false,
    isPrimePosition,
    primeTeamAssignment,
  });

  // Add to the shared general room with a permanent anonymous label
  const generalRoomId = await getOrCreateGeneralRoom(cohortId);

  const alreadyMember = await db.select()
    .from(roomMembersTable)
    .where(and(eq(roomMembersTable.roomId, generalRoomId), eq(roomMembersTable.userId, userId)))
    .limit(1);

  if (alreadyMember.length === 0) {
    await db.insert(roomMembersTable).values({
      roomId: generalRoomId,
      userId,
      maskedLabel: generateMaskedLabel(),
    });
  }
}

/**
 * Admin-only: process an entire cohort using prime-based logic.
 * This function is preserved for future use — it may be repurposed
 * for activities, sub-groups, or other structural uses beyond access control.
 */
export async function processCohort(cohortId: number) {
  const applications = await db.select()
    .from(applicationsTable)
    .where(eq(applicationsTable.cohortId, cohortId));

  let teamACount = 0, teamBCount = 0, leaderAssigned = false, peripheralCount = 0;

  for (const app of applications) {
    const order = app.applicationOrder!;
    const { isPrimePosition, primeTeamAssignment } = computePrimeAssociation(order);

    // Update existing role record with refreshed prime metadata
    await db.update(cohortRolesTable)
      .set({ isPrimePosition, primeTeamAssignment })
      .where(and(eq(cohortRolesTable.cohortId, cohortId), eq(cohortRolesTable.userId, app.userId)));

    if (primeTeamAssignment === "team_a") teamACount++;
    else if (primeTeamAssignment === "team_b") teamBCount++;
    else if (primeTeamAssignment === "leader") leaderAssigned = true;
    else if (!isPrimePosition) peripheralCount++;
  }

  return {
    cohortId,
    rolesAssigned: applications.length,
    teamACount,
    teamBCount,
    leaderAssigned,
    peripheralCount,
  };
}

export function getRoleStatusLabel(_roleType: string, _teamName: string | null): string {
  return "Active Member";
}
