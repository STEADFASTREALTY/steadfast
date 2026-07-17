import "server-only";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export async function requireAccount(nextPath = "/account") {
  const supabase = await createClient();
  const { data: userData, error: userError } = await supabase.auth.getUser();

  if (userError || !userData.user) {
    redirect(`/sign-in?notice=Please+sign+in+to+continue.&next=${encodeURIComponent(nextPath)}`);
  }

  const { data: person, error: personError } = await supabase
    .from("people")
    .select("id, display_name, primary_email, primary_phone, locale, timezone, account_status")
    .single();

  if (personError || !person) redirect("/sign-in?notice=Your+account+is+not+available.");

  return { supabase, user: userData.user, person };
}

export async function getActiveMembershipContext(nextPath = "/account") {
  const account = await requireAccount(nextPath);
  const [{ data: memberships }, { data: internalRoles }] = await Promise.all([
    account.supabase
      .from("brokerage_memberships")
      .select("id, brokerage_id, status, starts_at, brokerages(id, display_name, slug, status)")
      .eq("status", "active")
      .limit(1),
    account.supabase
      .from("person_platform_roles")
      .select("role_key")
      .eq("person_id", account.person.id)
      .is("ends_at", null),
  ]);

  const platformRoles = internalRoles?.map((role) => role.role_key) ?? [];

  const membership = memberships?.[0] ?? null;
  if (!membership) {
    return {
      ...account,
      membership: null,
      roles: [] as string[],
      permissions: [] as Array<{ permission_key: string; effect: string }>,
      platformRoles,
    };
  }

  const [{ data: roles }, { data: permissions }] = await Promise.all([
    account.supabase
      .from("membership_roles")
      .select("role_key")
      .eq("membership_id", membership.id)
      .is("ends_at", null),
    account.supabase
      .from("membership_permissions")
      .select("permission_key, effect")
      .eq("membership_id", membership.id)
      .is("ends_at", null),
  ]);

  return {
    ...account,
    membership,
    roles: roles?.map((role) => role.role_key) ?? [],
    permissions: permissions ?? [],
    platformRoles,
  };
}
