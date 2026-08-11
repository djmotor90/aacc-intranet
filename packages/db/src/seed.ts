/**
 * Proprietary — Copyright (c) 2024–2026 Kim Gurinov (Gurver).
 * Author: Kim Gurinov <kurinov@gurver.org> <kim@gurver.com>
 * Website: https://gurver.com
 * Fingerprint: GURVER-KG-AITIM-2026-7F3C9E2A
 * License: Proprietary. All rights reserved. See LICENSE / COPYRIGHT.
 */
/**
 * Dev seed: tasks module + CEWD Operations space with a "Workflow Discovery" list,
 * statuses, workflow fields, a dev user, and a discovery task.
 * Idempotent: safe to run repeatedly.
 */
import { eq } from "drizzle-orm";
import { db, getPool } from "./index";
import {
  customFieldDefinitions,
  lists,
  modules,
  spaceMembers,
  spaces,
  spaceTaskCounters,
  statuses,
  taskAssignees,
  tasks,
  users,
} from "./schema/index";

async function main() {
  // Module registry
  const [tasksModule] = await db
    .insert(modules)
    .values({ slug: "tasks", name: "Tasks" })
    .onConflictDoUpdate({ target: modules.slug, set: { name: "Tasks" } })
    .returning();

  // Dev user (stands in for an Entra-synced user locally)
  let [admin] = await db.select().from(users).where(eq(users.email, "dev@aacc.local"));
  if (!admin) {
    [admin] = await db
      .insert(users)
      .values({
        email: "dev@aacc.local",
        displayName: "Dev Admin",
        jobTitle: "Developer",
        department: "IT",
        platformRole: "admin",
        isProtectedAdmin: true,
      })
      .returning();
  }

  // CEWD Operations space
  const existingSpace = await db.select().from(spaces).where(eq(spaces.slug, "cewd-operations"));
  let space = existingSpace[0];
  if (!space) {
    [space] = await db
      .insert(spaces)
      .values({
        moduleId: tasksModule.id,
        name: "CEWD Operations",
        slug: "cewd-operations",
        taskPrefix: "CEWD",
        icon: "🎓",
        color: "#007582",
        createdBy: admin.id,
      })
      .returning();
    await db.insert(spaceTaskCounters).values({ spaceId: space.id });
    await db.insert(spaceMembers).values({
      spaceId: space.id,
      principalType: "user",
      userId: admin.id,
      role: "owner",
    });
  }

  // Workflow Discovery list
  const existingList = await db.select().from(lists).where(eq(lists.spaceId, space.id));
  let list = existingList[0];
  if (!list) {
    [list] = await db
      .insert(lists)
      .values({
        spaceId: space.id,
        name: "Workflow Discovery",
        slug: "workflow-discovery",
        description:
          "Capture candidate CEWD workflows, validate owners and requirements, and select the strongest pilot for delivery.",
        icon: "🧭",
        color: "#BE5513",
      })
      .returning();

    const statusRows = await db
      .insert(statuses)
      .values([
        { listId: list.id, name: "New", color: "#64748b", category: "open", position: "a0" },
        { listId: list.id, name: "In Review", color: "#f59e0b", category: "active", position: "a1" },
        { listId: list.id, name: "In Progress", color: "#007582", category: "active", position: "a2" },
        { listId: list.id, name: "Completed", color: "#22c55e", category: "done", position: "a3" },
        { listId: list.id, name: "Rejected", color: "#ef4444", category: "cancelled", position: "a4" },
      ])
      .returning();

    await db.update(lists).set({ defaultStatusId: statusRows[0].id }).where(eq(lists.id, list.id));

    const [workflowType] = await db
      .insert(customFieldDefinitions)
      .values([
        {
          listId: list.id,
          key: "workflow_type",
          label: "Workflow type",
          type: "dropdown",
          isRequired: true,
          position: "a0",
          options: [
            { id: "workflow_discovery", label: "Workflow discovery", color: "#007582" },
            { id: "employer_training", label: "Employer training", color: "#BE5513" },
            { id: "course_launch", label: "Course or program launch", color: "#15515A" },
            { id: "approval", label: "Approval process", color: "#7C3AED" },
            { id: "compliance", label: "Compliance deliverable", color: "#217A5B" },
          ],
        },
        {
          listId: list.id,
          key: "workflow_owner",
          label: "Workflow owner",
          type: "text",
          isRequired: true,
          position: "a1",
        },
        {
          listId: list.id,
          key: "owner_email",
          label: "Owner email",
          type: "email",
          isRequired: false,
          position: "a2",
        },
        {
          listId: list.id,
          key: "process_lead",
          label: "Process lead",
          type: "user",
          isRequired: false,
          position: "a3",
        },
      ])
      .returning();

    const [demoTask] = await db
      .insert(tasks)
      .values({
        listId: list.id,
        number: "CEWD-1",
        title: "Select and validate the CEWD pilot workflow",
        description: {
          type: "doc",
          content: [
            {
              type: "paragraph",
              content: [
                {
                  type: "text",
                  text: "Run structured discovery with CEWD stakeholders to validate workflow candidates, governance needs, pilot boundaries, and success measures before configuration begins.",
                },
              ],
            },
          ],
        },
        statusId: statusRows[0].id,
        priority: "high",
        createdBy: admin.id,
        customFields: {
          [workflowType.id]: "workflow_discovery",
        },
      })
      .returning();
    await db
      .update(spaceTaskCounters)
      .set({ nextNumber: 2 })
      .where(eq(spaceTaskCounters.spaceId, space.id));
    await db.insert(taskAssignees).values({
      taskId: demoTask.id,
      userId: admin.id,
      assignedBy: admin.id,
    });
  }

  console.log("Seed complete.");
  await getPool().end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
