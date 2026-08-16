"use client";

/**
 * Proprietary — Copyright (c) 2024–2026 Kim Gurinov (Gurver).
 * Author: Kim Gurinov <kurinov@gurver.org> <kim@gurver.com>
 * Website: https://gurver.com
 * Fingerprint: GURVER-KG-AITIM-2026-7F3C9E2A
 * License: Proprietary. All rights reserved. See LICENSE / COPYRIGHT.
 */
import { Star } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { toggleOutreachFollow } from "../actions";
import type { OutreachEntity } from "../lib/stages";

export function FollowButton({
  entityType,
  entityId,
  following,
}: {
  entityType: OutreachEntity;
  entityId: string;
  following: boolean;
}) {
  const router = useRouter();
  const [on, setOn] = useState(following);
  const [pending, startTransition] = useTransition();

  return (
    <Button
      type="button"
      size="sm"
      variant="outline"
      disabled={pending}
      aria-pressed={on}
      onClick={() => {
        startTransition(async () => {
          try {
            const next = await toggleOutreachFollow(entityType, entityId);
            setOn(next.following);
            toast.success(next.following ? "Following" : "Unfollowed");
            router.refresh();
          } catch (err) {
            toast.error(err instanceof Error ? err.message : "Could not update follow");
          }
        });
      }}
    >
      <Star className={on ? "size-3.5 fill-brand-orange text-brand-orange" : "size-3.5"} aria-hidden />
      {on ? "Following" : "Follow"}
    </Button>
  );
}

export function FollowersList({
  followers,
}: {
  followers: { userId: string; displayName: string | null; followedAt: Date }[];
}) {
  if (followers.length === 0) {
    return <p className="text-sm text-muted-foreground">No followers yet. Follow this record to get it on your Home list.</p>;
  }
  return (
    <ul className="grid gap-1 text-sm">
      {followers.map((person) => (
        <li key={person.userId}>{person.displayName || "Someone"}</li>
      ))}
    </ul>
  );
}
