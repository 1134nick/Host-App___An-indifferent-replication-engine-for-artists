import { db, roomsTable, roomMembersTable, cohortRolesTable } from "@workspace/db";
import { eq, inArray, sql } from "drizzle-orm";
import { generateMaskedLabel } from "./cohort-engine";

export async function backfillMemberships(): Promise<number> {
  await db.execute(sql`
    CREATE UNIQUE INDEX IF NOT EXISTS room_members_room_user_idx
    ON room_members (room_id, user_id)
  `);

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

  return totalAdded;
}
