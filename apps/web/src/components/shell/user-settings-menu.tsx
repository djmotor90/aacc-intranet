"use client";

/**
 * Proprietary — Copyright (c) 2024–2026 Kim Gurinov (Gurver).
 * Author: Kim Gurinov <kurinov@gurver.org> <kim@gurver.com>
 * Website: https://gurver.com
 * Fingerprint: GURVER-KG-AITIM-2026-7F3C9E2A
 * License: Proprietary. All rights reserved. See LICENSE / COPYRIGHT.
 */
import {
  Building2,
  Cpu,
  KeyRound,
  LogOut,
  Monitor,
  Moon,
  Settings,
  Shield,
  Sun,
  Trash2,
  UserRound,
  Users,
  X,
} from "lucide-react";
import { useTheme } from "next-themes";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import {
  SettingsAdminGroupsPanel,
  SettingsAdminUsersPanel,
} from "@/components/shell/settings-admin-panels";
import { SettingsModulesPanel } from "@/components/shell/settings-modules-panel";
import { SettingsAuditPanel } from "@/components/shell/settings-audit-panel";
import { SettingsAiUsagePanel } from "@/components/shell/settings-ai-usage-panel";
import { SettingsSecurityPanel } from "@/components/shell/settings-security-panel";
import { SettingsTrashPanel } from "@/components/shell/settings-trash-panel";
import { AvatarUpload } from "@/components/shell/avatar-upload";
import { UserAvatar } from "@/components/shell/user-avatar";
import { Button } from "@/components/ui/button";
import { platformRoleLabel } from "@/lib/role-labels";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";

type SectionId =
  | "account"
  | "admin-users"
  | "admin-groups"
  | "admin-security"
  | "admin-modules"
  | "admin-ai"
  | "admin-trash"
  | "admin-audit";

type MenuItem = {
  id: SectionId;
  label: string;
  icon: typeof Settings;
  group?: "admin";
};

const THEME_OPTIONS = [
  { value: "light", label: "Light", icon: Sun },
  { value: "system", label: "System", icon: Monitor },
  { value: "dark", label: "Dark", icon: Moon },
] as const;

/** Account identity + human role label (Super Admin vs membership). */
function AccountIdentityCard({
  displayName,
  email,
  platformRole,
}: {
  displayName: string;
  email: string | null;
  platformRole: string;
}) {
  const [roleLabel, setRoleLabel] = useState(() =>
    platformRole === "admin" ? platformRoleLabel("admin") : "Member",
  );
  const [roleDescription, setRoleDescription] = useState<string | null>(
    platformRole === "admin" ? "Full platform access (god mode)" : null,
  );

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { getMyProfile } = await import("@/modules/shell/actions/profile");
        const p = await getMyProfile();
        if (cancelled) return;
        setRoleLabel(p.roleLabel);
        setRoleDescription(p.roleDescription);
      } catch {
        // keep fallback
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="rounded-xl border bg-muted/20 p-4">
      <div className="truncate text-base font-medium">{displayName}</div>
      {email && <div className="truncate text-sm text-muted-foreground">{email}</div>}
      <div className="mt-2 flex flex-col gap-0.5">
        <div className="text-sm">
          <span className="text-muted-foreground">Role: </span>
          <span className="font-medium">{roleLabel}</span>
        </div>
        {roleDescription && (
          <p className="text-xs text-muted-foreground">{roleDescription}</p>
        )}
      </div>
    </div>
  );
}

function ThemeToggle() {
  // Only rendered once the settings dialog is opened (Radix Dialog defers mounting
  // its content until then), so `theme` is already resolved — no hydration guard needed.
  const { theme, setTheme } = useTheme();

  return (
    <div className="inline-flex rounded-lg border p-1">
      {THEME_OPTIONS.map(({ value, label, icon: Icon }) => {
        const active = theme === value;
        return (
          <button
            key={value}
            type="button"
            onClick={() => setTheme(value)}
            aria-pressed={active}
            className={cn(
              "flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm transition-colors",
              active
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:bg-muted hover:text-foreground",
            )}
          >
            <Icon className="size-3.5" />
            {label}
          </button>
        );
      })}
    </div>
  );
}

function MenuGroup({
  label,
  items,
  section,
  onSelect,
}: {
  label: string;
  items: MenuItem[];
  section: SectionId;
  onSelect: (id: SectionId) => void;
}) {
  return (
    <div className="flex flex-col gap-1">
      <div className="px-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
        {label}
      </div>
      {items.map((item) => {
        const Icon = item.icon;
        const active = section === item.id;
        return (
          <button
            key={item.id}
            type="button"
            onClick={() => onSelect(item.id)}
            className={cn(
              "flex items-center gap-2 rounded-md px-2.5 py-2 text-left text-sm transition-colors",
              active
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:bg-muted hover:text-foreground",
            )}
          >
            <Icon className="size-4 shrink-0" />
            <span className="truncate">{item.label}</span>
          </button>
        );
      })}
    </div>
  );
}

export function UserSettingsMenu({
  user,
  isAdmin,
  canManageTrash = false,
  signOutAction,
}: {
  user: {
    id: string;
    name: string | null;
    email: string | null;
    platformRole: string;
    /** When set, header avatar can skip the “probe and 404” path. */
    photoKey?: string | null;
  };
  isAdmin: boolean;
  /** Space Admins and `manage_trash` permission holders see Trash too, without the rest of Admin. */
  canManageTrash?: boolean;
  signOutAction: () => Promise<void>;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [section, setSection] = useState<SectionId>("account");
  const displayName = user.name ?? "Account";
  const searchParams = useSearchParams();
  const router = useRouter();

  // Deep link: /?settings=trash (and other admin sections)
  useEffect(() => {
    const s = searchParams.get("settings");
    if (!s) return;
    const map: Record<string, SectionId> = {
      trash: "admin-trash",
      audit: "admin-audit",
      users: "admin-users",
      groups: "admin-groups",
      security: "admin-security",
      modules: "admin-modules",
      "super-agents": "admin-security",
      agents: "admin-security",
      ai: "admin-ai",
      "ai-usage": "admin-ai",
    };
    const id = map[s];
    if (!id) return;
    if (id !== "admin-trash" && !isAdmin) return;
    if (id === "admin-trash" && !isAdmin && !canManageTrash) return;
    // Deferred: deep-linking syncs state from the URL, and setState directly in
    // the effect body triggers cascading renders.
    queueMicrotask(() => {
      setSection(id);
      setSettingsOpen(true);
    });
    // Clean URL so refresh doesn't re-open forever
    const url = new URL(window.location.href);
    url.searchParams.delete("settings");
    router.replace(url.pathname + url.search, { scroll: false });
  }, [searchParams, isAdmin, canManageTrash, router]);

  const menuItems = useMemo<MenuItem[]>(() => {
    const items: MenuItem[] = [{ id: "account", label: "Account", icon: UserRound }];
    if (isAdmin) {
      items.push(
        { id: "admin-users", label: "Users", icon: Users, group: "admin" },
        { id: "admin-groups", label: "Groups & Roles", icon: Shield, group: "admin" },
        {
          id: "admin-modules",
          label: "Apps & menus",
          icon: Building2,
          group: "admin",
        },
        {
          id: "admin-security",
          label: "Security & Permissions",
          icon: KeyRound,
          group: "admin",
        },
        {
          id: "admin-ai",
          label: "AI Usage",
          icon: Cpu,
          group: "admin",
        },
        {
          id: "admin-trash",
          label: "Trash",
          icon: Trash2,
          group: "admin",
        },
        {
          id: "admin-audit",
          label: "Audit Logs",
          icon: Shield,
          group: "admin",
        },
      );
    } else if (canManageTrash) {
      // Space Admins / manage_trash holders get Trash without the rest of Admin.
      items.push({ id: "admin-trash", label: "Trash", icon: Trash2 });
    }
    return items;
  }, [isAdmin, canManageTrash]);

  const generalItems = menuItems.filter((i) => !i.group);
  const adminItems = menuItems.filter((i) => i.group === "admin");

  function openSettings() {
    setSection("account");
    setMenuOpen(false);
    setSettingsOpen(true);
  }

  return (
    <>
      <DropdownMenu open={menuOpen} onOpenChange={setMenuOpen}>
        <DropdownMenuTrigger asChild>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="size-9 rounded-full p-0"
            aria-label="User menu"
            title={displayName}
          >
            <UserAvatar
              userId={user.id}
              name={displayName}
              hasPhoto={user.photoKey != null ? true : undefined}
              photoVersion={user.photoKey ?? null}
              priority
              className="size-8"
            />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-56">
          <DropdownMenuLabel className="font-normal">
            <div className="flex flex-col gap-0.5">
              <span className="truncate text-sm font-medium">{displayName}</span>
              {user.email && (
                <span className="truncate text-xs font-normal text-muted-foreground">
                  {user.email}
                </span>
              )}
            </div>
          </DropdownMenuLabel>
          <DropdownMenuSeparator />
          <DropdownMenuItem onSelect={openSettings} className="gap-2">
            <Settings className="size-4" />
            Settings
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <form action={signOutAction}>
            <DropdownMenuItem asChild className="gap-2 text-destructive focus:text-destructive">
              <button type="submit" className="w-full">
                <LogOut className="size-4" />
                Sign out
              </button>
            </DropdownMenuItem>
          </form>
        </DropdownMenuContent>
      </DropdownMenu>

      <Dialog open={settingsOpen} onOpenChange={setSettingsOpen}>
        <DialogContent
          showCloseButton={false}
          className={cn(
            "flex h-[min(920px,calc(100svh-2rem))] w-[min(1200px,calc(100vw-2rem))] max-w-none",
            "flex-col gap-0 overflow-hidden p-0 sm:max-w-none",
          )}
        >
          <DialogTitle className="sr-only">Settings</DialogTitle>
          <DialogDescription className="sr-only">
            Account settings and administration.
          </DialogDescription>

          <div className="flex shrink-0 items-center justify-between border-b px-4 py-3">
            <div className="flex items-center gap-2 text-sm font-semibold">
              <Settings className="size-4" />
              Settings
            </div>
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              onClick={() => setSettingsOpen(false)}
              aria-label="Close settings"
            >
              <X className="size-4" />
            </Button>
          </div>

          <div className="flex min-h-0 flex-1">
            <aside className="flex w-56 shrink-0 flex-col border-r bg-muted/20">
              <nav className="flex flex-1 flex-col gap-4 overflow-y-auto p-3">
                <MenuGroup
                  label="General"
                  items={generalItems}
                  section={section}
                  onSelect={setSection}
                />
                {adminItems.length > 0 && (
                  <MenuGroup
                    label="Admin"
                    items={adminItems}
                    section={section}
                    onSelect={setSection}
                  />
                )}
              </nav>

              <div className="border-t p-3">
                <form action={signOutAction}>
                  <Button
                    type="submit"
                    variant="ghost"
                    className="w-full justify-start gap-2 text-destructive hover:bg-destructive/10 hover:text-destructive"
                  >
                    <LogOut className="size-4" />
                    Sign out
                  </Button>
                </form>
              </div>
            </aside>

            <section className="min-w-0 flex-1 overflow-y-auto p-6">
              {section === "account" && (
                <div className="mx-auto flex max-w-lg flex-col gap-6">
                  <div>
                    <h2 className="text-lg font-semibold">Account</h2>
                    <p className="text-sm text-muted-foreground">Your profile on the intranet.</p>
                  </div>

                  <AvatarUpload userId={user.id} displayName={displayName} />

                  <AccountIdentityCard
                    displayName={displayName}
                    email={user.email}
                    platformRole={user.platformRole}
                  />

                  <div>
                    <h3 className="text-sm font-medium">Appearance</h3>
                    <p className="mb-2 text-xs text-muted-foreground">
                      Choose how the intranet looks on this device.
                    </p>
                    <ThemeToggle />
                  </div>
                </div>
              )}
              {section === "admin-users" && isAdmin && <SettingsAdminUsersPanel />}
              {section === "admin-groups" && isAdmin && <SettingsAdminGroupsPanel />}
              {section === "admin-modules" && isAdmin && <SettingsModulesPanel />}
              {section === "admin-security" && isAdmin && (
                <div className="flex h-full min-h-[560px] flex-col">
                  <SettingsSecurityPanel />
                </div>
              )}
              {section === "admin-ai" && isAdmin && <SettingsAiUsagePanel />}
              {section === "admin-trash" && (isAdmin || canManageTrash) && (
                <div className="mx-auto w-full max-w-3xl">
                  <SettingsTrashPanel />
                </div>
              )}
              {section === "admin-audit" && isAdmin && (
                <div className="flex h-full min-h-[560px] flex-col">
                  <SettingsAuditPanel />
                </div>
              )}
            </section>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
