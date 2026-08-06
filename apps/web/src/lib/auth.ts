/**
 * Proprietary — Copyright (c) 2024–2026 Kim Gurinov (Gurver).
 * Author: Kim Gurinov <kurinov@gurver.org> <kim@gurver.com>
 * Website: https://gurver.com
 * Fingerprint: GURVER-KG-AITIM-2026-7F3C9E2A
 * License: Proprietary. All rights reserved. See LICENSE / COPYRIGHT.
 */
import NextAuth from "next-auth";
import type { JWT } from "next-auth/jwt";
import Credentials from "next-auth/providers/credentials";
import MicrosoftEntraID from "next-auth/providers/microsoft-entra-id";

const GRAPH_SCOPES = "openid profile email offline_access User.Read Presence.Read.All";

const devAuthEnabled = process.env.DEV_AUTH === "true" && process.env.NODE_ENV !== "production";

/** Entra SSO only when issuer is configured (local AACC uses DEV_AUTH without Entra). */
const entraEnabled = Boolean(
  process.env.AUTH_MICROSOFT_ENTRA_ID_ISSUER?.trim() ||
    process.env.AUTH_MICROSOFT_ENTRA_ID_ID?.trim(),
);

// Fail loudly at RUNTIME if AUTH_URL is missing in production. Without it,
// Auth.js falls back to deriving the OAuth redirect_uri from request headers,
// which behind some reverse-proxy misconfigurations yields the internal
// container hostname (e.g. https://8d202286fcb1:3000/...) and breaks sign-in
// with OAuthCallbackError.
//
// We only check at runtime (NEXT_RUNTIME is set by the standalone server, not
// during `next build` which sets NEXT_PHASE) so the guard doesn't break
// production builds where Coolify may inject env vars at runtime only.
if (
  process.env.NODE_ENV === "production" &&
  process.env.NEXT_RUNTIME !== undefined &&
  process.env.NEXT_PHASE === undefined &&
  !process.env.AUTH_URL
) {
   
  console.error(
    "\n[FATAL] AUTH_URL is not set. In production, AUTH_URL must be the public\n" +
      "        canonical URL of the app (e.g. https://intranet.apps.aitim.ai).\n" +
      "        Without it, OAuth callbacks use the wrong host and sign-in fails.\n",
  );
  throw new Error("AUTH_URL is required in production. See docs/coolify.md.");
}

/**
 * Group Object IDs (from Azure portal) that gate intranet access.
 * ENTRA_ADMIN_GROUP_ID  → platform_role = admin
 * ENTRA_MEMBER_GROUP_ID → platform_role = member
 *
 * If neither env var is set (e.g. local dev without Entra), the gate is skipped
 * and the default "member" role is used, preserving the existing dev-auth flow.
 */
const ACCESS_GROUPS = {
  admin:  process.env.ENTRA_ADMIN_GROUP_ID  ?? null,
  member: process.env.ENTRA_MEMBER_GROUP_ID ?? null,
} as const;

/**
 * Call Graph's checkMemberGroups to discover which (if any) of our access
 * groups the signing-in user belongs to. Returns null when no groups are
 * configured so the gate is a no-op in unconfigured / dev environments.
 */
async function resolveAccessGroup(
  accessToken: string,
): Promise<"admin" | "member" | null> {
  const groupIds = [ACCESS_GROUPS.admin, ACCESS_GROUPS.member].filter(Boolean) as string[];
  if (groupIds.length === 0) return "member"; // no gate configured — allow all

  const res = await fetch("https://graph.microsoft.com/v1.0/me/checkMemberGroups", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ groupIds }),
  });

  if (!res.ok) {
    // Fail open so a transient Graph error doesn't lock everyone out.
    console.error("checkMemberGroups failed", res.status, await res.text());
    return "member";
  }

  const { value } = (await res.json()) as { value: string[] };

  // Admin group takes precedence if the user is in both.
  if (ACCESS_GROUPS.admin && value.includes(ACCESS_GROUPS.admin)) return "admin";
  if (ACCESS_GROUPS.member && value.includes(ACCESS_GROUPS.member)) return "member";
  return null; // not in either access group → deny
}

/** Upsert the signing-in Entra user and return our internal row. Lazy db import keeps proxy bundle light. */
async function provisionUser(
  profile: { oid: string; email: string; name: string },
  accessToken: string,
): Promise<{ id: string; platformRole: "admin" | "member" } | null> {
  const { db, users } = await import("@aitim/db");
  const { eq } = await import("drizzle-orm");

  // ── group gate ──────────────────────────────────────────────────────────────
  const resolvedRole = await resolveAccessGroup(accessToken);
  if (resolvedRole === null) {
    console.warn(`Sign-in denied for ${profile.email}: not in any intranet access group`);
    return null;
  }

  const existing = await db.select().from(users).where(eq(users.entraObjectId, profile.oid));
  if (existing[0]) {
    if (!existing[0].isActive) return null; // manually deactivated accounts may not sign in
    // Ensure non–Super-Admins have a Security & Permissions membership role.
    let permissionRoleId = existing[0].permissionRoleId;
    if (resolvedRole !== "admin" && !existing[0].isProtectedAdmin && !permissionRoleId) {
      const { permissionRoles } = await import("@aitim/db");
      const [memberRole] = await db
        .select({ id: permissionRoles.id })
        .from(permissionRoles)
        .where(eq(permissionRoles.slug, "member"))
        .limit(1);
      permissionRoleId = memberRole?.id ?? null;
    }
    const now = new Date();
    await db
      .update(users)
      .set({
        email: profile.email,
        displayName: profile.name,
        lastSignedInAt: now,
        ...(permissionRoleId && !existing[0].permissionRoleId
          ? { permissionRoleId }
          : {}),
      })
      .where(eq(users.id, existing[0].id));
    // Platform Super Admin is managed by Entra sync; don't override here.
    return { id: existing[0].id, platformRole: existing[0].platformRole };
  }

  // New user: set platform role from Entra access group; membership defaults to Member.
  let permissionRoleId: string | null = null;
  if (resolvedRole !== "admin") {
    const { permissionRoles } = await import("@aitim/db");
    const [memberRole] = await db
      .select({ id: permissionRoles.id })
      .from(permissionRoles)
      .where(eq(permissionRoles.slug, "member"))
      .limit(1);
    permissionRoleId = memberRole?.id ?? null;
  }

  const now = new Date();
  const [created] = await db
    .insert(users)
    .values({
      entraObjectId: profile.oid,
      email: profile.email,
      displayName: profile.name,
      platformRole: resolvedRole,
      permissionRoleId,
      lastSignedInAt: now,
    })
    .returning();
  return { id: created.id, platformRole: created.platformRole };
}

async function refreshAccessToken(token: JWT): Promise<JWT> {
  try {
    const response = await fetch(
      `https://login.microsoftonline.com/${process.env.ENTRA_TENANT_ID}/oauth2/v2.0/token`,
      {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          client_id: process.env.AUTH_MICROSOFT_ENTRA_ID_ID!,
          client_secret: process.env.AUTH_MICROSOFT_ENTRA_ID_SECRET!,
          grant_type: "refresh_token",
          refresh_token: token.refreshToken!,
          scope: GRAPH_SCOPES,
        }),
      },
    );
    const data = await response.json();
    if (!response.ok) throw data;
    return {
      ...token,
      accessToken: data.access_token,
      refreshToken: data.refresh_token ?? token.refreshToken,
      expiresAt: Math.floor(Date.now() / 1000) + Number(data.expires_in),
      error: undefined,
    };
  } catch (error) {
    console.error("Failed to refresh Entra access token", error);
    return { ...token, error: "RefreshTokenError" };
  }
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  session: { strategy: "jwt" },
  pages: { signIn: "/login" },
  events: {
    async signIn({ user, account }) {
      // Stamp last sign-in when we already have an internal user id (e.g. dev login).
      // Entra path stamps inside provisionUser (jwt callback).
      if (user.id && account?.provider === "dev") {
        try {
          const { db, users } = await import("@aitim/db");
          const { eq } = await import("drizzle-orm");
          await db
            .update(users)
            .set({ lastSignedInAt: new Date() })
            .where(eq(users.id, user.id));
        } catch (err) {
          console.error("[auth] failed to record lastSignedInAt", err);
        }
      }
      try {
        const { writeAuditLog } = await import("@/lib/audit");
        await writeAuditLog({
          category: "user",
          eventType: "USER_LOGIN",
          title: "User Login",
          eventStatus: "success",
          actorId: user.id,
          actorEmail: user.email,
          actorName: user.name,
          payload: {
            authPath: "auth",
            authMethod: account?.provider ?? null,
            authStatus: "AUTHENTICATED",
          },
        });
      } catch (err) {
        console.error("[audit] signIn event failed", err);
      }
    },
    async signOut(message) {
      try {
        const { writeAuditLog } = await import("@/lib/audit");
        const token = "token" in message ? message.token : null;
        const userId =
          token && typeof token === "object" && "userId" in token
            ? String((token as { userId?: string }).userId ?? "")
            : null;
        await writeAuditLog({
          category: "user",
          eventType: "USER_LOGOUT",
          title: "User Logout",
          eventStatus: "success",
          actorId: userId || null,
          payload: { authPath: "auth", authStatus: "SIGNED_OUT" },
        });
      } catch (err) {
        console.error("[audit] signOut event failed", err);
      }
    },
  },
  providers: [
    ...(entraEnabled
      ? [
          MicrosoftEntraID({
            issuer: process.env.AUTH_MICROSOFT_ENTRA_ID_ISSUER,
            authorization: { params: { scope: GRAPH_SCOPES } },
          }),
        ]
      : []),
    ...(devAuthEnabled
      ? [
          Credentials({
            id: "dev",
            name: "Dev Login",
            credentials: { email: { label: "Email", type: "email" } },
            async authorize(credentials) {
              const { db, users } = await import("@aitim/db");
              const { eq } = await import("drizzle-orm");
              const [user] = await db
                .select()
                .from(users)
                .where(eq(users.email, String(credentials?.email ?? "dev@aitim.local")));
              if (!user || !user.isActive) return null;
              return { id: user.id, email: user.email, name: user.displayName };
            },
          }),
        ]
      : []),
  ],
  callbacks: {
    async jwt({ token, account, profile, user }) {
      // Initial sign-in via Entra
      if (account?.provider === "microsoft-entra-id" && profile) {
        const provisioned = await provisionUser(
          {
            oid: String(profile.oid ?? profile.sub),
            email: String(profile.email ?? profile.preferred_username ?? ""),
            name: String(profile.name ?? ""),
          },
          String(account.access_token ?? ""),
        );
        if (!provisioned) {
          try {
            const { writeAuditLog } = await import("@/lib/audit");
            await writeAuditLog({
              category: "user",
              eventType: "USER_LOGIN",
              title: "User Login Denied",
              eventStatus: "denied",
              actorEmail: String(profile.email ?? profile.preferred_username ?? ""),
              actorName: String(profile.name ?? ""),
              payload: {
                authPath: "auth",
                authMethod: "microsoft-entra-id",
                authStatus: "DENIED_NOT_IN_ACCESS_GROUP",
              },
            });
          } catch {
            // ignore
          }
          return { ...token, error: "RefreshTokenError" };
        }
        token.userId = provisioned.id;
        token.platformRole = provisioned.platformRole;
        token.accessToken = account.access_token;
        token.refreshToken = account.refresh_token;
        token.expiresAt = account.expires_at;
        token.roleCheckedAt = Date.now();
        return token;
      }
      // Initial sign-in via dev credentials
      if (account?.provider === "dev" && user) {
        const { db, users } = await import("@aitim/db");
        const { eq } = await import("drizzle-orm");
        const [row] = await db.select().from(users).where(eq(users.id, user.id!));
        token.userId = row.id;
        token.platformRole = row.platformRole;
        token.roleCheckedAt = Date.now();
        return token;
      }
      // Subsequent requests: refresh the Graph token if expired
      if (token.refreshToken && token.expiresAt && Date.now() / 1000 > token.expiresAt - 60) {
        token = await refreshAccessToken(token);
      }
      // Re-read role/active status from DB every 5 minutes so promotions,
      // group-mapping syncs, and deactivations reach live sessions.
      const now = Date.now();
      if (token.userId && (!token.roleCheckedAt || now - token.roleCheckedAt > 5 * 60_000)) {
        try {
          const { db, users } = await import("@aitim/db");
          const { eq } = await import("drizzle-orm");
          const [row] = await db
            .select({ platformRole: users.platformRole, isActive: users.isActive })
            .from(users)
            .where(eq(users.id, token.userId));
          // User deleted or deactivated: invalidate the session.
          if (!row || !row.isActive) return { ...token, userId: undefined };
          token.platformRole = row.platformRole;
          token.roleCheckedAt = now;
        } catch (err) {
          // Transient DB issue: keep the existing role rather than dropping the session.
          console.error("Session role refresh failed", err);
        }
      }
      return token;
    },
    session({ session, token }) {
      if (token.userId) {
        session.user.id = token.userId;
        session.user.platformRole = token.platformRole ?? "member";
      }
      session.accessToken = token.accessToken;
      return session;
    },
    authorized({ auth: session, request }) {
      const { pathname } = request.nextUrl;
      // Link-preview crawlers (Telegram, Slack, etc.) need icons + OG images
      // without a session, otherwise they show a broken/default card.
      const isPublic =
        pathname === "/login" ||
        pathname.startsWith("/forms/") ||
        pathname.startsWith("/api/forms/") ||
        pathname.startsWith("/api/auth/") ||
        pathname.startsWith("/api/health") ||
        pathname === "/icon" ||
        pathname.startsWith("/icon/") ||
        pathname === "/apple-icon" ||
        pathname.startsWith("/apple-icon/") ||
        pathname === "/opengraph-image" ||
        pathname.startsWith("/opengraph-image/") ||
        pathname === "/twitter-image" ||
        pathname.startsWith("/twitter-image/") ||
        pathname === "/favicon.ico";
      if (isPublic) return true;
      // Require a resolvable internal user id — a session whose user no longer
      // exists (e.g. after a DB rebuild) must land on /login, not loop.
      return !!session?.user?.id;
    },
  },
});
