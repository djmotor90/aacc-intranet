"use client";

/**
 * Proprietary — Copyright (c) 2024–2026 Kim Gurinov (Gurver).
 * Author: Kim Gurinov <kurinov@gurver.org> <kim@gurver.com>
 * Website: https://gurver.com
 * Fingerprint: GURVER-KG-AITIM-2026-7F3C9E2A
 * License: Proprietary. All rights reserved. See LICENSE / COPYRIGHT.
 */
import { useEffect, useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import {
  NOTIFICATION_EVENT_META,
  type ChannelPrefs,
  type EmailDigest,
} from "@/lib/notification-prefs";
import type { NotificationType } from "@/lib/notify";
import {
  getNotificationPreferences,
  saveNotificationPreferences,
} from "@/modules/shell/actions/notifications";

export function NotificationPreferencesPanel({ onSaved }: { onSaved?: () => void }) {
  const [prefs, setPrefs] = useState<Record<NotificationType, ChannelPrefs> | null>(null);
  const [digest, setDigest] = useState<EmailDigest>("instant");
  const [loading, setLoading] = useState(true);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const data = await getNotificationPreferences();
        if (cancelled) return;
        setPrefs(data.preferences);
        setDigest(data.emailDigest);
      } catch {
        if (!cancelled) toast.error("Could not load preferences");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  function setChannel(type: NotificationType, key: keyof ChannelPrefs, value: boolean) {
    setPrefs((cur) => {
      if (!cur) return cur;
      return { ...cur, [type]: { ...cur[type], [key]: value } };
    });
  }

  function save() {
    if (!prefs) return;
    startTransition(async () => {
      try {
        const next = await saveNotificationPreferences({
          preferences: prefs,
          emailDigest: digest,
        });
        setPrefs(next.preferences);
        setDigest(next.emailDigest);
        toast.success("Notification preferences saved");
        onSaved?.();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Save failed");
      }
    });
  }

  if (loading || !prefs) {
    return <p className="p-4 text-sm text-muted-foreground">Loading preferences…</p>;
  }

  return (
    <div className="flex flex-col gap-4 p-4">
      <div>
        <h3 className="text-sm font-semibold">Notify me when…</h3>
        <p className="text-xs text-muted-foreground">
          Choose what appears in your inbox and what is emailed.
        </p>
      </div>

      <div className="overflow-hidden rounded-lg border">
        <div className="grid grid-cols-[1fr_auto_auto] gap-2 border-b bg-muted/40 px-3 py-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
          <span>Event</span>
          <span className="w-14 text-center">In app</span>
          <span className="w-14 text-center">Email</span>
        </div>
        {NOTIFICATION_EVENT_META.map((meta) => (
          <div
            key={meta.type}
            className="grid grid-cols-[1fr_auto_auto] items-center gap-2 border-b px-3 py-2.5 last:border-b-0"
          >
            <div className="min-w-0">
              <div className="text-sm font-medium">{meta.label}</div>
              <div className="text-[11px] text-muted-foreground">{meta.description}</div>
            </div>
            <div className="flex w-14 justify-center">
              <Checkbox
                checked={prefs[meta.type].inApp}
                onCheckedChange={(v) => setChannel(meta.type, "inApp", v === true)}
                aria-label={`${meta.label} in app`}
              />
            </div>
            <div className="flex w-14 justify-center">
              <Checkbox
                checked={prefs[meta.type].email}
                onCheckedChange={(v) => setChannel(meta.type, "email", v === true)}
                aria-label={`${meta.label} email`}
              />
            </div>
          </div>
        ))}
      </div>

      <div className="flex flex-col gap-2">
        <Label className="text-sm font-semibold">Email cadence</Label>
        <div className="flex flex-wrap gap-1.5">
          {(
            [
              { value: "instant" as const, label: "Instant" },
              { value: "hourly" as const, label: "Hourly digest" },
              { value: "off" as const, label: "Off" },
            ] as const
          ).map((opt) => (
            <button
              key={opt.value}
              type="button"
              onClick={() => setDigest(opt.value)}
              className={
                digest === opt.value
                  ? "rounded-full bg-primary px-3 py-1 text-xs font-medium text-primary-foreground"
                  : "rounded-full bg-muted px-3 py-1 text-xs font-medium text-muted-foreground hover:text-foreground"
              }
            >
              {opt.label}
            </button>
          ))}
        </div>
        <p className="text-[11px] text-muted-foreground">
          Instant emails as events happen. Hourly sends one digest about every hour. Off
          disables all notification email (SMTP / Graph still required for delivery).
        </p>
      </div>

      <Button type="button" size="sm" disabled={pending} onClick={save} className="self-end">
        {pending ? "Saving…" : "Save preferences"}
      </Button>
    </div>
  );
}
