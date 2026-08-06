"use client";

/**
 * Proprietary — Copyright (c) 2024–2026 Kim Gurinov (Gurver).
 * Author: Kim Gurinov <kurinov@gurver.org> <kim@gurver.com>
 * Website: https://gurver.com
 * Fingerprint: GURVER-KG-AITIM-2026-7F3C9E2A
 * License: Proprietary. All rights reserved. See LICENSE / COPYRIGHT.
 */
import { Camera, Loader2, Trash2 } from "lucide-react";
import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { toast } from "sonner";
import { UserAvatar } from "@/components/shell/user-avatar";
import { Button } from "@/components/ui/button";
import {
  AVATAR_SOURCE_MAX_BYTES,
  prepareAvatarImage,
} from "@/lib/resize-avatar-image";
import {
  getMyProfile,
  removeMyAvatar,
  uploadMyAvatar,
  type MyProfile,
} from "@/modules/shell/actions/profile";

export function AvatarUpload({
  userId,
  displayName,
}: {
  userId: string;
  displayName: string;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [profile, setProfile] = useState<MyProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [pending, startTransition] = useTransition();
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const p = await getMyProfile();
      setProfile(p);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to load profile");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void (async () => {
      await load();
    })();
  }, [load]);

  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
  }, [previewUrl]);

  function onPickFile(file: File | null) {
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      toast.error("Choose an image file");
      return;
    }
    if (file.size > AVATAR_SOURCE_MAX_BYTES) {
      toast.error("Image must be 25 MB or smaller");
      return;
    }

    startTransition(async () => {
      try {
        // Downscale / re-encode in the browser so we never hit the 1 MB action body limit
        // with multi‑MB phone photos. Stored avatar is ~512×512 JPEG or WebP.
        const prepared = await prepareAvatarImage(file);
        setPreviewUrl((prev) => {
          if (prev) URL.revokeObjectURL(prev);
          return URL.createObjectURL(prepared);
        });

        const fd = new FormData();
        fd.set("avatar", prepared);
        const next = await uploadMyAvatar(fd);
        setProfile(next);
        toast.success("Profile photo updated");
        setPreviewUrl((prev) => {
          if (prev) URL.revokeObjectURL(prev);
          return null;
        });
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Upload failed");
        setPreviewUrl((prev) => {
          if (prev) URL.revokeObjectURL(prev);
          return null;
        });
      } finally {
        if (inputRef.current) inputRef.current.value = "";
      }
    });
  }

  function onRemove() {
    if (!window.confirm("Remove your upload and restore the Entra / directory photo?")) return;
    startTransition(async () => {
      try {
        const next = await removeMyAvatar();
        setProfile(next);
        setPreviewUrl(null);
        toast.success(
          next.hasPhoto ? "Restored Entra / directory photo" : "Custom photo removed",
        );
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Could not remove photo");
      }
    });
  }

  const hasPhoto = Boolean(previewUrl || profile?.hasPhoto);
  const photoVersion = profile?.photoKey ?? null;

  return (
    <div className="flex flex-col gap-4 rounded-xl border bg-muted/20 p-4 sm:flex-row sm:items-center">
      <div className="relative shrink-0">
        {previewUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={previewUrl}
            alt={displayName}
            className="size-20 rounded-full object-cover ring-2 ring-border"
          />
        ) : (
          <UserAvatar
            userId={userId}
            name={displayName}
            hasPhoto={hasPhoto}
            photoVersion={photoVersion}
            className="size-20 text-lg"
          />
        )}
        {pending && (
          <div className="absolute inset-0 flex items-center justify-center rounded-full bg-background/60">
            <Loader2 className="size-5 animate-spin text-muted-foreground" />
          </div>
        )}
      </div>

      <div className="min-w-0 flex-1">
        <div className="text-sm font-medium">Profile photo</div>
        <p className="mt-0.5 text-xs text-muted-foreground">
          JPEG, PNG, WebP, or GIF · source up to 25 MB (auto-resized to a small square).
          {profile?.photoCustom
            ? " Using your upload. Remove to restore your Entra / directory photo."
            : " Default is your Entra / directory photo. Upload to override it."}
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          <input
            ref={inputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp,image/gif"
            className="sr-only"
            disabled={pending || loading}
            onChange={(e) => onPickFile(e.target.files?.[0] ?? null)}
          />
          <Button
            type="button"
            size="sm"
            variant="secondary"
            disabled={pending || loading}
            onClick={() => inputRef.current?.click()}
            className="gap-1.5"
          >
            <Camera className="size-3.5" />
            {hasPhoto ? "Change photo" : "Upload photo"}
          </Button>
          {profile?.photoCustom && (
            <Button
              type="button"
              size="sm"
              variant="ghost"
              disabled={pending || loading}
              onClick={onRemove}
              className="gap-1.5 text-destructive hover:text-destructive"
            >
              <Trash2 className="size-3.5" />
              Remove
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
