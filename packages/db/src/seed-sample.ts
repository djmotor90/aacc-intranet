/**
 * Proprietary — Copyright (c) 2024–2026 Kim Gurinov (Gurver).
 * Author: Kim Gurinov <kurinov@gurver.org> <kim@gurver.com>
 * Website: https://gurver.com
 * Fingerprint: GURVER-KG-AITIM-2026-7F3C9E2A
 * License: Proprietary. All rights reserved. See LICENSE / COPYRIGHT.
 */
/**
 * Sample data for CEWD Operations: extra discovery fields and a batch of
 * realistic workflow candidates with statuses, priorities, assignees,
 * custom field values, comments, and activity.
 * Idempotent: skips tasks whose title already exists.
 * Run: pnpm --filter @aitim/db seed:sample
 */
import { and, asc, eq, sql } from "drizzle-orm";
import { db, getPool } from "./index";
import {
  activityLog,
  comments,
  customFieldDefinitions,
  lists,
  spaces,
  spaceTaskCounters,
  statuses,
  taskAssignees,
  tasks,
  users,
} from "./schema/index";

const EXTRA_FIELDS = [
  {
    key: "readiness",
    label: "Discovery readiness",
    type: "dropdown" as const,
    isRequired: false,
    position: "a4",
    options: [
      { id: "emerging", label: "Emerging", color: "#94a3b8" },
      { id: "mapped", label: "Mapped", color: "#BE5513" },
      { id: "validated", label: "Validated", color: "#007582" },
      { id: "pilot_ready", label: "Pilot ready", color: "#217A5B" },
    ],
  },
  {
    key: "lead_unit",
    label: "Lead unit",
    type: "text" as const,
    isRequired: false,
    position: "a5",
    options: null,
  },
  {
    key: "stakeholder_contact",
    label: "Stakeholder contact",
    type: "email" as const,
    isRequired: false,
    position: "a6",
    options: null,
  },
  {
    key: "decision_needed",
    label: "Decision needed",
    type: "checkbox" as const,
    isRequired: false,
    position: "a7",
    options: null,
  },
];

interface SampleTask {
  title: string;
  status: string;
  priority: "urgent" | "high" | "normal" | "low" | null;
  dueInDays: number | null;
  workflowType: "workflow_discovery" | "employer_training" | "course_launch" | "approval" | "compliance";
  readiness: "emerging" | "mapped" | "validated" | "pilot_ready";
  owner: string;
  ownerEmail: string;
  leadUnit: string;
  decisionNeeded: boolean;
  assignees: number; // how many random users
  comment?: string;
}

const SAMPLE_TASKS: SampleTask[] = [
  { title: "Map the employer training request intake", status: "In Review", priority: "high", dueInDays: 5, workflowType: "employer_training", readiness: "mapped", owner: "CEWD Employer Services", ownerEmail: "cewd@aacc.edu", leadUnit: "Employer Services", decisionNeeded: true, assignees: 2, comment: "Validate the intake fields, routing rules, ownership, and follow-up expectations with representative staff." },
  { title: "Validate course and program launch approvals", status: "In Progress", priority: "high", dueInDays: 10, workflowType: "course_launch", readiness: "validated", owner: "CEWD Program Operations", ownerEmail: "cewd@aacc.edu", leadUnit: "Program Operations", decisionNeeded: true, assignees: 2 },
  { title: "Document new employee and staffing change workflow", status: "New", priority: "normal", dueInDays: 14, workflowType: "approval", readiness: "emerging", owner: "CEWD Administration", ownerEmail: "cewd@aacc.edu", leadUnit: "Administration", decisionNeeded: false, assignees: 1 },
  { title: "Map instructor onboarding and credential verification", status: "In Review", priority: "high", dueInDays: 12, workflowType: "approval", readiness: "mapped", owner: "CEWD Academic Operations", ownerEmail: "cewd@aacc.edu", leadUnit: "Academic Operations", decisionNeeded: true, assignees: 2 },
  { title: "Define program launch and registration readiness gates", status: "New", priority: "high", dueInDays: 18, workflowType: "course_launch", readiness: "emerging", owner: "CEWD Program Operations", ownerEmail: "cewd@aacc.edu", leadUnit: "Program Operations", decisionNeeded: true, assignees: 1 },
  { title: "Map grant and contract deliverable tracking", status: "New", priority: "normal", dueInDays: 21, workflowType: "compliance", readiness: "mapped", owner: "CEWD Administration", ownerEmail: "cewd@aacc.edu", leadUnit: "Administration", decisionNeeded: false, assignees: 1 },
  { title: "Define recurring audit and reporting cycle", status: "In Progress", priority: "normal", dueInDays: 15, workflowType: "compliance", readiness: "validated", owner: "CEWD Leadership", ownerEmail: "cewd@aacc.edu", leadUnit: "Leadership", decisionNeeded: false, assignees: 1 },
  { title: "Validate data access and permission requirements", status: "In Review", priority: "urgent", dueInDays: 7, workflowType: "workflow_discovery", readiness: "mapped", owner: "CEWD Leadership", ownerEmail: "cewd@aacc.edu", leadUnit: "Leadership and IT", decisionNeeded: true, assignees: 2 },
  { title: "Agree on pilot success measures and checkpoints", status: "New", priority: "high", dueInDays: 9, workflowType: "workflow_discovery", readiness: "emerging", owner: "CEWD Pilot Team", ownerEmail: "cewd@aacc.edu", leadUnit: "Pilot Team", decisionNeeded: true, assignees: 2 },
  { title: "Establish CEWD knowledge governance standards", status: "New", priority: "normal", dueInDays: 20, workflowType: "workflow_discovery", readiness: "emerging", owner: "CEWD Knowledge Owners", ownerEmail: "cewd@aacc.edu", leadUnit: "Cross-functional", decisionNeeded: true, assignees: 1 },
];

async function main() {
  const [space] = await db.select().from(spaces).where(eq(spaces.slug, "cewd-operations"));
  if (!space) throw new Error("CEWD Operations space not found — run pnpm db:seed first");
  const [list] = await db
    .select()
    .from(lists)
    .where(and(eq(lists.spaceId, space.id), eq(lists.slug, "workflow-discovery")));
  if (!list) throw new Error("Workflow Discovery list not found");

  // 1. Extra custom fields
  for (const f of EXTRA_FIELDS) {
    await db
      .insert(customFieldDefinitions)
      .values({ listId: list.id, ...f })
      .onConflictDoNothing();
  }

  const defs = await db
    .select()
    .from(customFieldDefinitions)
    .where(eq(customFieldDefinitions.listId, list.id));
  const defByKey = new Map(defs.map((d) => [d.key, d]));
  const listStatuses = await db.select().from(statuses).where(eq(statuses.listId, list.id));
  const statusByName = new Map(listStatuses.map((s) => [s.name, s]));

  // Real users to assign (prefer synced Entra users, fall back to any active)
  const activeUsers = await db
    .select()
    .from(users)
    .where(eq(users.isActive, true))
    .orderBy(asc(users.displayName));
  const pool = activeUsers.filter((u) => u.entraObjectId).slice(0, 20);
  const assignPool = pool.length > 0 ? pool : activeUsers;
  const author = activeUsers.find((u) => u.email?.endsWith("@aacc.edu")) ?? activeUsers[0];

  let created = 0;
  for (const [i, t] of SAMPLE_TASKS.entries()) {
    const exists = await db
      .select({ id: tasks.id })
      .from(tasks)
      .where(and(eq(tasks.listId, list.id), eq(tasks.title, t.title)));
    if (exists.length > 0) continue;

    const status = statusByName.get(t.status);
    if (!status) continue;

    const dueDate = t.dueInDays
      ? new Date(Date.now() + t.dueInDays * 86_400_000).toISOString().slice(0, 10)
      : null;
    const assigneeUsers = Array.from(
      { length: t.assignees },
      (_, k) => assignPool[(i * 3 + k * 7) % assignPool.length],
    );
    const processLead = assigneeUsers[0];

    const customFields: Record<string, unknown> = {};
    const set = (key: string, value: unknown) => {
      const def = defByKey.get(key);
      if (def && value !== undefined && value !== null) customFields[def.id] = value;
    };
    set("workflow_type", t.workflowType);
    set("workflow_owner", t.owner);
    set("owner_email", t.ownerEmail);
    set("readiness", t.readiness);
    set("lead_unit", t.leadUnit);
    set("stakeholder_contact", t.ownerEmail);
    set("decision_needed", t.decisionNeeded);
    if (processLead) set("process_lead", processLead.id);

    await db.transaction(async (tx) => {
      const [counter] = await tx
        .update(spaceTaskCounters)
        .set({ nextNumber: sql`${spaceTaskCounters.nextNumber} + 1` })
        .where(eq(spaceTaskCounters.spaceId, space.id))
        .returning({ next: spaceTaskCounters.nextNumber });
      const number = `${space.taskPrefix}-${counter.next - 1}`;

      const [task] = await tx
        .insert(tasks)
        .values({
          listId: list.id,
          number,
          title: t.title,
          statusId: status.id,
          priority: t.priority,
          dueDate,
          customFields,
          createdBy: author.id,
          source: "manual",
          completedAt: status.category === "done" ? new Date() : null,
        })
        .returning();

      for (const u of assigneeUsers) {
        await tx
          .insert(taskAssignees)
          .values({ taskId: task.id, userId: u.id, assignedBy: author.id })
          .onConflictDoNothing();
      }

      await tx.insert(activityLog).values({
        spaceId: space.id,
        taskId: task.id,
        actorId: author.id,
        verb: "task.created",
        payload: { title: t.title, number },
      });

      if (t.comment) {
        await tx.insert(comments).values({
          taskId: task.id,
          authorId: (assigneeUsers[0] ?? author).id,
          body: { text: t.comment },
        });
        await tx.insert(activityLog).values({
          spaceId: space.id,
          taskId: task.id,
          actorId: (assigneeUsers[0] ?? author).id,
          verb: "comment.created",
          payload: { preview: t.comment.slice(0, 140) },
        });
      }
    });
    created++;
  }

  console.log(`Sample data ready: ${created} tasks created (${SAMPLE_TASKS.length - created} already existed), ${EXTRA_FIELDS.length} extra field definitions ensured.`);
  await getPool().end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
