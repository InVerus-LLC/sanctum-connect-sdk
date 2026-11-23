"use client";
/** Finishes the sign-in once (the SDK removes the code and state from the URL), then goes home. */
import { useRouter } from "next/navigation";
import { SignInCallback } from "@inverus/connect-react";

export function Finish() {
  const router = useRouter();
  return <SignInCallback onSignedIn={() => router.replace("/")} />;
}
