import { headers } from "next/headers";
import { DEVICE_HEADER, VIEW_HEADER } from "./device";

/** True when this request renders the phone app (see device.ts). */
export async function isPhone(): Promise<boolean> {
  return (await headers()).get(VIEW_HEADER) === "phone";
}

/** True for a phone, whatever the switch says: it offers "Phone site". */
export async function isPhoneDevice(): Promise<boolean> {
  return (await headers()).get(DEVICE_HEADER) === "phone";
}

