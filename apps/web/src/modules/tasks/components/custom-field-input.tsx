"use client";

/**
 * Proprietary — Copyright (c) 2024–2026 Kim Gurinov (Gurver).
 * Author: Kim Gurinov <kurinov@gurver.org> <kim@gurver.com>
 * Website: https://gurver.com
 * Fingerprint: GURVER-KG-AITIM-2026-7F3C9E2A
 * License: Proprietary. All rights reserved. See LICENSE / COPYRIGHT.
 */
import { useState } from "react";
import { Checkbox } from "@/components/ui/checkbox";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { normalizeCustomFieldLabelPosition } from "../lib/custom-field-presentation";

export interface FieldDefLike {
  id: string;
  label: string;
  description?: string | null;
  labelPosition?: string | null;
  type: string;
  options: unknown;
  isRequired: boolean;
}

export interface UserOption {
  id: string;
  displayName: string;
  photoKey?: string | null;
}

/** Multi-person picker for People custom fields (repeated form name → uuid[]). */
function PeopleFieldSelect({
  name,
  users,
  defaultValue,
  required,
  placeholder = "Select people…",
}: {
  name: string;
  users: UserOption[];
  defaultValue: string[];
  required?: boolean;
  placeholder?: string;
}) {
  const [selected, setSelected] = useState<string[]>(defaultValue);

  function toggle(id: string) {
    setSelected((cur) => (cur.includes(id) ? cur.filter((v) => v !== id) : [...cur, id]));
  }

  const selectedUsers = selected
    .map((id) => users.find((u) => u.id === id))
    .filter((u): u is UserOption => !!u);

  return (
    <>
      {selected.map((id) => (
        <input key={id} type="hidden" name={name} value={id} />
      ))}
      {required && selected.length === 0 && (
        <input
          tabIndex={-1}
          className="sr-only"
          required
          value=""
          onChange={() => {}}
          aria-hidden
        />
      )}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            id={name}
            type="button"
            className="flex min-h-9 w-full flex-wrap items-center gap-1.5 rounded-md border bg-transparent px-2 py-1.5 text-left text-sm hover:bg-muted"
          >
            {selectedUsers.length > 0 ? (
              selectedUsers.map((u) => (
                <span
                  key={u.id}
                  className="inline-flex items-center gap-1 rounded-full bg-muted px-1.5 py-0.5 text-xs font-medium"
                >
                  {u.displayName}
                </span>
              ))
            ) : (
              <span className="text-muted-foreground">{placeholder}</span>
            )}
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent className="max-h-72 min-w-[14rem]">
          {users.map((u) => (
            <DropdownMenuCheckboxItem
              key={u.id}
              checked={selected.includes(u.id)}
              onCheckedChange={() => toggle(u.id)}
              onSelect={(e) => e.preventDefault()}
            >
              {u.displayName}
            </DropdownMenuCheckboxItem>
          ))}
          {users.length === 0 && (
            <div className="px-2 py-1.5 text-sm text-muted-foreground">No users available</div>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
    </>
  );
}

/** Compact label picker showing selected chips, with a
 * checklist popover — never renders the full option list inline. Selections are
 * mirrored into hidden inputs so the enclosing form still submits `name` as a
 * repeated field (same contract as a native `<select multiple>`). */
function MultiSelectField({
  name,
  options,
  defaultValue,
  placeholder = "—",
}: {
  name: string;
  options: { id: string; label: string; color?: string }[];
  defaultValue: string[];
  placeholder?: string;
}) {
  const [selected, setSelected] = useState<string[]>(defaultValue);

  function toggle(id: string) {
    setSelected((cur) => (cur.includes(id) ? cur.filter((v) => v !== id) : [...cur, id]));
  }

  const selectedOptions = selected
    .map((id) => options.find((o) => o.id === id))
    .filter((o): o is (typeof options)[number] => !!o);

  return (
    <>
      {selected.map((id) => (
        <input key={id} type="hidden" name={name} value={id} />
      ))}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            id={name}
            type="button"
            className="flex min-h-9 w-full flex-wrap items-center gap-1 rounded-md border bg-transparent px-2 py-1.5 text-left text-sm hover:bg-muted"
          >
            {selectedOptions.length > 0 ? (
              selectedOptions.map((o) => (
                <span
                  key={o.id}
                  className="rounded px-1.5 py-0.5 text-xs font-medium"
                  style={
                    o.color
                      ? { backgroundColor: `${o.color}26`, color: o.color }
                      : { backgroundColor: "var(--muted)" }
                  }
                >
                  {o.label}
                </span>
              ))
            ) : (
              <span className="text-muted-foreground">{placeholder}</span>
            )}
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent className="max-h-72">
          {options.map((o) => (
            <DropdownMenuCheckboxItem
              key={o.id}
              checked={selected.includes(o.id)}
              onCheckedChange={() => toggle(o.id)}
              onSelect={(e) => e.preventDefault()}
            >
              {o.color && (
                <span
                  className="mr-1.5 size-2.5 shrink-0 rounded-full"
                  style={{ backgroundColor: o.color }}
                />
              )}
              {o.label}
            </DropdownMenuCheckboxItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
    </>
  );
}

/** Color palette single-select for create forms / task layout. */
function ColorFieldSelect({
  id,
  name,
  required,
  options,
  defaultValue,
  placeholder = "Pick a color…",
}: {
  id: string;
  name: string;
  required?: boolean;
  options: { id: string; label: string; color?: string }[];
  defaultValue: string;
  placeholder?: string;
}) {
  const [value, setValue] = useState(defaultValue);
  const current = options.find((o) => o.id === value);

  return (
    <>
      <input type="hidden" name={name} value={value} required={required && !value ? true : undefined} />
      {/* HTML required: empty color fails validation when field is required */}
      {required && !value && (
        <input tabIndex={-1} className="sr-only" required value="" onChange={() => {}} aria-hidden />
      )}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            id={id}
            type="button"
            className="flex h-9 w-full items-center gap-2 rounded-md border bg-transparent px-2 text-left text-sm hover:bg-muted"
          >
            {current ? (
              <>
                <span
                  className="size-5 shrink-0 rounded-full border border-border shadow-sm"
                  style={{ backgroundColor: current.color ?? current.id }}
                />
                {current.label ? (
                  <span className="truncate">{current.label}</span>
                ) : (
                  <span className="truncate font-mono text-xs text-muted-foreground">
                    {current.color ?? "Selected"}
                  </span>
                )}
              </>
            ) : (
              <span className="text-muted-foreground">{placeholder}</span>
            )}
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent className="max-h-72 min-w-[12rem]">
          {!required && (
            <DropdownMenuCheckboxItem
              checked={!value}
              onCheckedChange={() => setValue("")}
              onSelect={(e) => e.preventDefault()}
              className="text-muted-foreground"
            >
              —
            </DropdownMenuCheckboxItem>
          )}
          {options.map((o) => (
            <DropdownMenuCheckboxItem
              key={o.id}
              checked={o.id === value}
              onCheckedChange={() => setValue(o.id)}
              onSelect={(e) => e.preventDefault()}
              className="gap-2"
            >
              <span
                className="size-4 shrink-0 rounded-full border border-border shadow-sm"
                style={{ backgroundColor: o.color ?? o.id }}
              />
              {o.label || (
                <span className="font-mono text-xs text-muted-foreground">{o.color ?? o.id}</span>
              )}
            </DropdownMenuCheckboxItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
    </>
  );
}

/** Uncontrolled inputs named cf_<definitionId>, parsed server-side. */
export function CustomFieldInput({
  def,
  users,
  defaultValue,
}: {
  def: FieldDefLike;
  users: UserOption[];
  defaultValue?: unknown;
}) {
  const name = `cf_${def.id}`;
  const options = (def.options ?? []) as { id: string; label: string; color?: string }[];
  const dv = defaultValue as string | number | boolean | string[] | undefined;
  const labelPosition = normalizeCustomFieldLabelPosition(def.labelPosition);
  const insidePrompt =
    labelPosition === "inside" ? `${def.label}${def.isRequired ? " *" : ""}` : undefined;
  const description = def.description?.trim() || null;

  const control =
    def.type === "textarea" ? (
      <Textarea
        id={name}
        name={name}
        required={def.isRequired}
        defaultValue={(dv as string) ?? ""}
        placeholder={insidePrompt}
      />
    ) : def.type === "checkbox" ? (
      <div className="flex min-h-9 items-center gap-2">
        <Checkbox id={name} name={name} defaultChecked={dv === true} />
        {labelPosition === "inside" && (
          <Label htmlFor={name} className="font-normal">
            {def.label}
            {def.isRequired && <span className="text-destructive"> *</span>}
          </Label>
        )}
      </div>
    ) : def.type === "dropdown" ? (
        <select
          id={name}
          name={name}
          required={def.isRequired}
          defaultValue={(dv as string) ?? ""}
          className="h-9 rounded-md border bg-transparent px-3 text-sm"
        >
          <option value="">{insidePrompt ?? "—"}</option>
          {options.map((o) => (
            <option key={o.id} value={o.id}>
              {o.label}
            </option>
          ))}
        </select>
    ) : def.type === "color" ? (
        <ColorFieldSelect
          id={name}
          name={name}
          required={def.isRequired}
          options={options}
          defaultValue={(dv as string) ?? ""}
          placeholder={insidePrompt}
        />
    ) : def.type === "multi_select" ? (
        <MultiSelectField
          name={name}
          options={options}
          defaultValue={(dv as string[]) ?? []}
          placeholder={insidePrompt}
        />
    ) : def.type === "user" ? (
        <PeopleFieldSelect
          name={name}
          users={users}
          required={def.isRequired}
          defaultValue={
            Array.isArray(dv)
              ? (dv as string[])
              : typeof dv === "string" && dv
                ? [dv]
                : []
          }
          placeholder={insidePrompt}
        />
    ) : def.type === "file" ? (
        <FileFieldDisplay value={defaultValue} />
    ) : (
        <Input
          id={name}
          name={name}
          required={def.isRequired}
          defaultValue={(dv as string | number) ?? ""}
          type={
            def.type === "number"
              ? "number"
              : def.type === "date"
                ? "date"
                : def.type === "email"
                  ? "email"
                  : def.type === "url"
                    ? "url"
                    : "text"
          }
          step={def.type === "number" ? "any" : undefined}
          placeholder={insidePrompt}
        />
    );

  const label = (
    <Label
      htmlFor={name}
      className={cn(
        (labelPosition === "hidden" || labelPosition === "inside") && "sr-only",
      )}
    >
      {def.label}
      {def.isRequired && <span className="text-destructive"> *</span>}
    </Label>
  );
  const help = description ? (
    <p className="text-xs leading-relaxed text-muted-foreground">{description}</p>
  ) : null;

  if (labelPosition === "left" || labelPosition === "right") {
    const labelBlock = (
      <div className="flex min-w-28 max-w-48 flex-col gap-1 pt-2">
        {label}
        {help}
      </div>
    );
    return (
      <div className="grid items-start gap-3 sm:grid-cols-[minmax(7rem,0.7fr)_minmax(0,1.3fr)]">
        {labelPosition === "left" && labelBlock}
        <div className={cn(labelPosition === "right" && "sm:order-first")}>{control}</div>
        {labelPosition === "right" && labelBlock}
      </div>
    );
  }

  if (labelPosition === "bottom") {
    return (
      <div className="flex flex-col gap-1.5">
        {control}
        {label}
        {help}
      </div>
    );
  }

  if (labelPosition === "hidden" || labelPosition === "inside") {
    return (
      <div className="flex flex-col gap-1.5">
        {label}
        {control}
        {help}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-1.5">
      {label}
      {help}
      {control}
    </div>
  );
}

function FileFieldDisplay({ value }: { value: unknown }) {
  const files = Array.isArray(value)
    ? value.filter(
        (v): v is { attachmentId: string; fileName: string } =>
          Boolean(
            v &&
              typeof v === "object" &&
              typeof (v as { attachmentId?: unknown }).attachmentId === "string" &&
              typeof (v as { fileName?: unknown }).fileName === "string",
          ),
      )
    : [];
  if (files.length === 0) {
    return <p className="text-xs text-muted-foreground">No files</p>;
  }
  return (
    <ul className="space-y-1 text-sm">
      {files.map((f) => (
        <li key={f.attachmentId}>
          <a
            href={`/api/attachments/${f.attachmentId}`}
            className="text-primary hover:underline"
            target="_blank"
            rel="noreferrer"
          >
            {f.fileName}
          </a>
        </li>
      ))}
    </ul>
  );
}
