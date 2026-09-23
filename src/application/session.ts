import "server-only";
import { logEvent } from "@/infrastructure/log";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { authenticate } from "./auth";
import { getConfig } from "@/infrastructure/config";
import { sessionCookie } from "@/infrastructure/http-security";
export async function currentUser() {
  const cookie = sessionCookie(getConfig());
  try {
    return await authenticate((await cookies()).get(cookie.name)?.value);
  } catch {
    logEvent("request_failed");
    throw new Error("Workspace temporarily unavailable");
  }
}
export async function requireUser() {
  const user = await currentUser();
  if (!user) redirect("/login");
  return user;
}
