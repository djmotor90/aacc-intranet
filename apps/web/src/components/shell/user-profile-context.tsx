"use client";

/**
 * Proprietary — Copyright (c) 2024–2026 Kim Gurinov (Gurver).
 * Author: Kim Gurinov <kurinov@gurver.org> <kim@gurver.com>
 * Website: https://gurver.com
 * Fingerprint: GURVER-KG-AITIM-2026-7F3C9E2A
 * License: Proprietary. All rights reserved. See LICENSE / COPYRIGHT.
 */
import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { UserProfileSheet } from "./user-profile-sheet";

type UserProfileContextValue = {
  openProfile: (userId: string) => void;
  closeProfile: () => void;
  profileUserId: string | null;
};

const UserProfileContext = createContext<UserProfileContextValue | null>(null);

export function UserProfileProvider({ children }: { children: ReactNode }) {
  const [profileUserId, setProfileUserId] = useState<string | null>(null);

  const openProfile = useCallback((userId: string) => {
    setProfileUserId(userId);
  }, []);

  const closeProfile = useCallback(() => {
    setProfileUserId(null);
  }, []);

  const value = useMemo(
    () => ({ openProfile, closeProfile, profileUserId }),
    [openProfile, closeProfile, profileUserId],
  );

  return (
    <UserProfileContext.Provider value={value}>
      {children}
      <UserProfileSheet
        userId={profileUserId}
        open={!!profileUserId}
        onOpenChange={(open) => {
          if (!open) closeProfile();
        }}
      />
    </UserProfileContext.Provider>
  );
}

export function useUserProfile(): UserProfileContextValue {
  const ctx = useContext(UserProfileContext);
  if (!ctx) {
    return {
      openProfile: () => {
        console.warn("useUserProfile: UserProfileProvider missing");
      },
      closeProfile: () => {},
      profileUserId: null,
    };
  }
  return ctx;
}
