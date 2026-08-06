/**
 * Proprietary — Copyright (c) 2024–2026 Kim Gurinov (Gurver).
 * Author: Kim Gurinov <kurinov@gurver.org> <kim@gurver.com>
 * Website: https://gurver.com
 * Fingerprint: GURVER-KG-AITIM-2026-7F3C9E2A
 * License: Proprietary. All rights reserved. See LICENSE / COPYRIGHT.
 */
import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { CODE_OWNERSHIP, ownershipBanner } from "@aitim/shared";
import { ThemeProvider } from "@/components/theme-provider";
import { Toaster } from "@/components/ui/sonner";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const siteUrl =
  process.env.AUTH_URL?.replace(/\/$/, "") ||
  process.env.APP_BASE_URL?.replace(/\/$/, "") ||
  "http://localhost:3000";

const siteTitle = "AACC Operations Hub";
const siteDescription =
  "A shared workspace for AACC workflows, knowledge, and collaboration.";

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: {
    default: siteTitle,
    template: `%s · ${siteTitle}`,
  },
  description: siteDescription,
  applicationName: siteTitle,
  authors: [
    {
      name: CODE_OWNERSHIP.author,
      url: CODE_OWNERSHIP.website,
    },
  ],
  creator: CODE_OWNERSHIP.author,
  publisher: CODE_OWNERSHIP.organization,
  other: {
    "code-fingerprint": CODE_OWNERSHIP.fingerprintId,
    "code-owner": CODE_OWNERSHIP.stamp,
    copyright: CODE_OWNERSHIP.copyright,
  },
  openGraph: {
    type: "website",
    locale: "en_US",
    siteName: siteTitle,
    title: siteTitle,
    description: siteDescription,
  },
  twitter: {
    card: "summary_large_image",
    title: siteTitle,
    description: siteDescription,
  },
  robots: {
    // Intranet is private; discourage indexing of shared links.
    index: false,
    follow: false,
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <head>
        {/* Ownership watermark — grep GURVER-KG-AITIM in page source / builds */}
        <meta name="author" content={`${CODE_OWNERSHIP.author} <${CODE_OWNERSHIP.emails[0]}>`} />
        <meta name="copyright" content={CODE_OWNERSHIP.copyright} />
        <meta name="code-fingerprint" content={CODE_OWNERSHIP.fingerprintId} />
      </head>
      <body className="min-h-full flex flex-col" suppressHydrationWarning>
        {/* {ownershipBanner()} */}
        <span className="sr-only" data-code-fingerprint={CODE_OWNERSHIP.fingerprintId} data-code-owner={CODE_OWNERSHIP.stamp}>
          {ownershipBanner()}
        </span>
        <ThemeProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange>
          {children}
          <Toaster />
        </ThemeProvider>
      </body>
    </html>
  );
}
