/**
 * Proprietary — Copyright (c) 2024–2026 Kim Gurinov (Gurver).
 * Author: Kim Gurinov <kurinov@gurver.org> <kim@gurver.com>
 * Website: https://gurver.com
 * Fingerprint: GURVER-KG-AITIM-2026-7F3C9E2A
 * License: Proprietary. All rights reserved. See LICENSE / COPYRIGHT.
 */
import Link from "next/link";
import { notFound } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { assertSpaceRole, requireUser } from "@/lib/rbac";
import {
  addListMember,
  countListSubtasks,
  countSecrets,
  createStatus,
  removeListMember,
  setListPrivacy,
} from "@/modules/tasks/actions";
import { FieldDefinitionsManager } from "@/modules/tasks/components/field-definitions-manager";
import { LayoutBuilder } from "@/modules/tasks/components/layout-builder";
import { ListPrivacyToggle } from "@/modules/tasks/components/list-privacy-toggle";
import { RequiredFieldsSettings } from "@/modules/tasks/components/required-fields-settings";
import { SecretViewersSettings } from "@/modules/tasks/components/secret-viewers-settings";
import { SecretsSettings } from "@/modules/tasks/components/secrets-settings";
import { SharingDialogBody } from "@/modules/tasks/components/sharing-dialog-body";
import { StatusManager } from "@/modules/tasks/components/status-manager";
import { SubtasksSettings } from "@/modules/tasks/components/subtasks-settings";
import { parseRequiredCoreFields } from "@/modules/tasks/lib/required-fields";
import { defaultLayout, type TaskLayout } from "@/modules/tasks/layout-types";
import {
  getActiveUsers,
  getFieldDefinitions,
  getListBySlug,
  getListMembers,
  getSecretViewers,
  getSpaceBySlug,
  getSpaceMembers,
  getStatusesForList,
  getTeams,
} from "@/modules/tasks/queries";


export default async function ListSettingsPage(props: {
  params: Promise<{ spaceSlug: string; listSlug: string }>;
  searchParams: Promise<{ tab?: string }>;
}) {
  const { spaceSlug, listSlug } = await props.params;
  const { tab } = await props.searchParams;
  await requireUser();
  const space = await getSpaceBySlug(spaceSlug);
  if (!space) notFound();
  await assertSpaceRole(space.id, "owner");
  const list = await getListBySlug(space.id, listSlug);
  if (!list) notFound();

  const [
    listStatuses,
    fieldDefs,
    inheritedMembers,
    directMembers,
    activeUsers,
    subtaskCount,
    secretCount,
    secretViewers,
    teams,
  ] = await Promise.all([
    getStatusesForList(list.id),
    getFieldDefinitions(list.id, true),
    getSpaceMembers(space.id),
    getListMembers(list.id),
    getActiveUsers(),
    countListSubtasks(list.id),
    countSecrets(list.id),
    getSecretViewers(list.id),
    getTeams(),
  ]);
  const directMemberIds = new Set(directMembers.map((m) => m.userId));
  const directMemberGroupIds = new Set(directMembers.map((m) => m.groupId));
  const addableUsers = activeUsers.filter((u) => !directMemberIds.has(u.id));
  const addableTeams = teams.filter((team) => !directMemberGroupIds.has(team.id));
  const secretViewerIds = new Set(secretViewers.map((v) => v.userId));
  const secretViewerAddable = activeUsers.filter((u) => !secretViewerIds.has(u.id));

  const activeFieldDefs = fieldDefs.filter((f) => !f.isArchived);
  const savedLayout = list.taskLayout as TaskLayout | null;
  const layout = savedLayout ?? defaultLayout(activeFieldDefs);

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6">
      <div>
        <div className="text-sm text-muted-foreground">
          <Link href={`/tasks/${space.slug}/${list.slug}`} className="hover:underline">
            {space.name} / {list.name}
          </Link>
        </div>
        <h1 className="text-2xl font-semibold">List settings</h1>
      </div>

      <Tabs defaultValue={tab ?? "layout"}>
        <TabsList className="mb-4">
          <TabsTrigger value="layout">Task layout</TabsTrigger>
          <TabsTrigger value="statuses">Statuses</TabsTrigger>
          <TabsTrigger value="fields">Custom fields</TabsTrigger>
          <TabsTrigger value="features">Features</TabsTrigger>
          <TabsTrigger value="sharing">Sharing</TabsTrigger>
        </TabsList>

        {/* ── task layout tab ── */}
        <TabsContent value="layout">
          <Card>
            <CardHeader>
              <CardTitle>Task layout</CardTitle>
              <CardDescription>
                Group and arrange fields shown when a task is opened. Drag fields between groups,
                reorder groups, and pick how many columns each group uses.
                Fields left in <strong>Unassigned</strong> are hidden from the task view.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <LayoutBuilder
                listId={list.id}
                initialLayout={layout}
                fieldDefs={activeFieldDefs}
              />
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── statuses tab ── */}
        <TabsContent value="statuses">
          <Card>
            <CardHeader>
              <CardTitle>Statuses</CardTitle>
              <CardDescription>
                Workflow columns for this list. Drag to reorder or move between groups; use the
                pencil to rename or recolor.
              </CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-6">
              <StatusManager
                listId={list.id}
                initialStatuses={listStatuses}
                defaultStatusId={list.defaultStatusId}
              />

              <form action={createStatus} className="flex flex-wrap items-end gap-2 border-t pt-4">
                <input type="hidden" name="listId" value={list.id} />
                <div className="flex flex-col gap-1">
                  <Label htmlFor="s-name">Name</Label>
                  <Input id="s-name" name="name" required className="w-40" />
                </div>
                <div className="flex flex-col gap-1">
                  <Label htmlFor="s-color">Color</Label>
                  <Input id="s-color" name="color" type="color" defaultValue="#94a3b8" className="w-16 p-1" />
                </div>
                <div className="flex flex-col gap-1">
                  <Label htmlFor="s-category">Group</Label>
                  <select
                    id="s-category"
                    name="category"
                    className="h-9 rounded-md border bg-transparent px-3 text-sm"
                  >
                    <option value="open">Not Started</option>
                    <option value="active">Active</option>
                    <option value="done">Done</option>
                    <option value="cancelled">Closed</option>
                  </select>
                </div>
                <Button type="submit">Add status</Button>
              </form>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── custom fields tab ── */}
        <TabsContent value="fields">
          <div className="flex flex-col gap-6">
            <Card>
              <CardHeader>
                <CardTitle>Required fields</CardTitle>
                <CardDescription>
                  Mark default and custom fields that must be filled when creating a task on this
                  list.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <RequiredFieldsSettings
                  listId={list.id}
                  initialCoreRequired={parseRequiredCoreFields(list.requiredCoreFields)}
                  fieldDefs={fieldDefs.map((f) => ({
                    id: f.id,
                    label: f.label,
                    description: f.description,
                    type: f.type,
                    isRequired: f.isRequired,
                    isArchived: f.isArchived,
                  }))}
                />
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Custom fields</CardTitle>
                <CardDescription>
                  Fields attached to every task in this list. Use <strong>Edit</strong> to rename a
                  field, add help text, choose its label location, or manage dropdown / color
                  options. Archiving hides the field from forms but keeps historical values
                  readable.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <FieldDefinitionsManager
                  listId={list.id}
                  fieldDefs={fieldDefs.map((f) => ({
                    id: f.id,
                    label: f.label,
                    description: f.description,
                    labelPosition: f.labelPosition,
                    type: f.type,
                    options: f.options,
                    isRequired: f.isRequired,
                    isArchived: f.isArchived,
                  }))}
                />
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* ── features tab ── */}
        <TabsContent value="features">
          <Card>
            <CardHeader>
              <CardTitle>List features</CardTitle>
              <CardDescription>
                Turn modules on or off for this list. Defaults are on for new lists.
              </CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-4">
              <SubtasksSettings
                listId={list.id}
                initialEnabled={list.subtasksEnabled}
                existingSubtaskCount={subtaskCount}
              />
              <div className="flex flex-col gap-3">
                <SecretsSettings
                  listId={list.id}
                  initialEnabled={list.secretsEnabled}
                  existingSecretCount={secretCount}
                />
                {list.secretsEnabled && (
                  <div className="rounded-lg border p-4">
                    <p className="mb-3 text-sm font-medium">Secrets access</p>
                    <SecretViewersSettings
                      listId={list.id}
                      viewers={secretViewers}
                      addableUsers={secretViewerAddable}
                    />
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── sharing tab ── */}
        <TabsContent value="sharing">
          <Card>
            <CardHeader>
              <CardTitle>Sharing</CardTitle>
              <CardDescription>
                <strong>Public</strong> (default): every space member gets access automatically.{" "}
                <strong>Private</strong>: nobody carries over — you add exactly who should have
                access, including people who aren&apos;t in the space at all.
              </CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-4">
              <ListPrivacyToggle listId={list.id} isPrivate={list.isPrivate} />
              <SharingDialogBody
                idFieldName="listId"
                idValue={list.id}
                members={directMembers}
                addableUsers={addableUsers}
                addableTeams={addableTeams}
                addAction={addListMember}
                removeAction={removeListMember}
                inheritedMembers={inheritedMembers}
                isPrivate={list.isPrivate}
                lockAction={setListPrivacy}
              />
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
