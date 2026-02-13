"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/**
 * Legacy redirect: Gmail connect moved to dashboard popup.
 * Redirects to the standard onboarding connect page.
 */
export default function GmailConnectRedirect() {
  const router = useRouter();

  useEffect(() => {
    router.replace("/connect");
  }, [router]);

  return null;
}
