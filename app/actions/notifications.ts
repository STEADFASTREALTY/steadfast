"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireAccount } from "@/lib/auth/session";

const notificationIdSchema = z.string().uuid();
const mailboxOperationSchema = z.enum(["star", "unstar", "delete"]);

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

async function updateMailboxAction(formData: FormData, operation: z.infer<typeof mailboxOperationSchema>) {
  const account = await requireAccount("/account/notifications");
  const parsed = notificationIdSchema.safeParse(formData.get("notificationId"));
  if (!parsed.success) return;

  await account.supabase.from("notification_mailbox_commands").insert({
    notification_id: parsed.data,
    operation: mailboxOperationSchema.parse(operation),
  });

  revalidatePath("/account/notifications");
  revalidatePath("/workspace");
}

export async function starNotificationAction(formData: FormData) {
  await updateMailboxAction(formData, "star");
}

export async function unstarNotificationAction(formData: FormData) {
  await updateMailboxAction(formData, "unstar");
}

export async function deleteNotificationAction(formData: FormData) {
  await updateMailboxAction(formData, "delete");
}
