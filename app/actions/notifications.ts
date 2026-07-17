"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireAccount } from "@/lib/auth/session";

const notificationIdSchema = z.string().uuid();

export async function markNotificationReadAction(formData: FormData) {
  const account = await requireAccount("/account/notifications");
  const parsed = notificationIdSchema.safeParse(formData.get("notificationId"));
  if (!parsed.success) return;

  await account.supabase.from("notification_read_commands").insert({
    notification_id: parsed.data,
    mark_all: false,
  });

  revalidatePath("/account/notifications");
  revalidatePath("/workspace");
}

export async function markAllNotificationsReadAction() {
  const account = await requireAccount("/account/notifications");

  await account.supabase.from("notification_read_commands").insert({
    notification_id: null,
    mark_all: true,
  });

  revalidatePath("/account/notifications");
  revalidatePath("/workspace");
}
