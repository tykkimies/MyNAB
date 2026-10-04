import "server-only";
import { cookies } from "next/headers";
import {
  parseRegisterView,
  REGISTER_VIEW_COOKIE,
} from "@/domain/register-view";

export async function readRegisterView() {
  return parseRegisterView((await cookies()).get(REGISTER_VIEW_COOKIE)?.value);
}
