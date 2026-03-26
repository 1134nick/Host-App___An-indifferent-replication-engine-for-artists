import { db, cohortsTable, applicationsTable, cohortRolesTable, roomsTable, roomMembersTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";

const PRIMES_TO_100 = [2,3,5,7,11,13,17,19,23,29,31,37,41,43,47,53,59,61,67,71,73,79,83,89,97];
const TEAM_A_POSITIONS = [2,3,5,7,11,13,17,19,23,29,31,37];
const TEAM_B_POSITIONS = [41,43,47,53,59,61,67,71,73,79,83,89];
const LEADER_POSITION = 97;

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

export async function processCohort(cohortId: number) {
  const applications = await db.select()
    .from(applicationsTable)
    .where(eq(applicationsTable.cohortId, cohortId));

  const roles: Array<{ userId: number; roleType: "team_member" | "leader" | "peripheral"; teamName: "team_a" | "team_b" | null; isHiddenRole: boolean }> = [];

  for (const app of applications) {
    const order = app.applicationOrder!;
    if (TEAM_A_POSITIONS.includes(order)) {
      roles.push({ userId: app.userId, roleType: "team_member", teamName: "team_a", isHiddenRole: false });
    } else if (TEAM_B_POSITIONS.includes(order)) {
      roles.push({ userId: app.userId, roleType: "team_member", teamName: "team_b", isHiddenRole: false });
    } else if (order === LEADER_POSITION) {
      roles.push({ userId: app.userId, roleType: "leader", teamName: null, isHiddenRole: true });
    } else if (PRIMES_TO_100.includes(order)) {
      roles.push({ userId: app.userId, roleType: "team_member", teamName: null, isHiddenRole: false });
    } else {
      roles.push({ userId: app.userId, roleType: "peripheral", teamName: null, isHiddenRole: false });
    }
  }

  if (roles.length > 0) {
    await db.insert(cohortRolesTable).values(
      roles.map(r => ({ cohortId, ...r }))
    );
  }

  const roomTypes = ["team_a", "team_b", "leader", "peripheral", "admin_broadcast"] as const;
  const createdRooms: Record<string, number> = {};

  for (const roomType of roomTypes) {
    const [room] = await db.insert(roomsTable)
      .values({ cohortId, roomType, visibilityRule: "role_based" })
      .returning();
    createdRooms[roomType] = room.id;
  }

  for (const role of roles) {
    const roomsForUser: number[] = [];

    if (role.roleType === "team_member" && role.teamName === "team_a") {
      roomsForUser.push(createdRooms["team_a"]);
    } else if (role.roleType === "team_member" && role.teamName === "team_b") {
      roomsForUser.push(createdRooms["team_b"]);
    } else if (role.roleType === "leader") {
      roomsForUser.push(createdRooms["leader"], createdRooms["team_a"], createdRooms["team_b"]);
    } else if (role.roleType === "peripheral") {
      roomsForUser.push(createdRooms["peripheral"]);
    }

    for (const roomId of roomsForUser) {
      await db.insert(roomMembersTable).values({ roomId, userId: role.userId });
    }
  }

  await db.update(cohortsTable)
    .set({ status: "active", lockedAt: new Date() })
    .where(eq(cohortsTable.id, cohortId));

  await db.update(applicationsTable)
    .set({ status: "assigned" })
    .where(eq(applicationsTable.cohortId, cohortId));

  const teamACount = roles.filter(r => r.teamName === "team_a").length;
  const teamBCount = roles.filter(r => r.teamName === "team_b").length;
  const leaderAssigned = roles.some(r => r.roleType === "leader");
  const peripheralCount = roles.filter(r => r.roleType === "peripheral").length;

  return {
    cohortId,
    rolesAssigned: roles.length,
    teamACount,
    teamBCount,
    leaderAssigned,
    peripheralCount,
  };
}

export function getRoleStatusLabel(roleType: string, teamName: string | null): string {
  if (roleType === "team_member") {
    return "Assigned Participant";
  } else if (roleType === "leader") {
    return "Provisional Member";
  } else if (roleType === "peripheral") {
    return "Restricted Access Participant";
  }
  return "Further Instructions Pending";
}
