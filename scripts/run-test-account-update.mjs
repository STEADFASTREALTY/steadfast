import { createClient } from "@supabase/supabase-js";

if (process.env.VERCEL_ENV !== "production") {
  process.exit(0);
}

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const secret = process.env.SUPABASE_SECRET_KEY;
if (!url || !secret) throw new Error("Production Supabase credentials are required for the one-time test account update.");

const supabase = createClient(url, secret, { auth: { autoRefreshToken: false, persistSession: false } });
const password = "CanadaSap!";
const requestedAccounts = [
  { label: "John Stamp", email: "johnstamp@canadasap.com", matches: (value) => value.includes("john") && value.includes("stamp") },
  { label: "Karen Wei", email: "karenwei@canadasap.com", matches: (value) => value.includes("karen") },
  { label: "Tony Lin", email: "tonylin@canadasap.com", matches: (value) => value.includes("tony") || value.includes("lincanada") || value === "lin" },
];

function normal(value) {
  return String(value ?? "").trim().toLowerCase();
}

const { data: usersPage, error: usersError } = await supabase.auth.admin.listUsers({ page: 1, perPage: 1000 });
if (usersError) throw usersError;
const users = usersPage.users;
const { data: people, error: peopleError } = await supabase.from("people").select("id,auth_user_id,display_name,primary_email");
if (peopleError) throw peopleError;

const resolved = requestedAccounts.map((account) => {
  const person = people.find((candidate) => {
    const values = [normal(candidate.display_name), normal(candidate.primary_email), normal(users.find((user) => user.id === candidate.auth_user_id)?.email)];
    return values.some(account.matches);
  });
  if (!person) {
    const available = people.filter((candidate) => candidate.auth_user_id).map((candidate) => `${candidate.display_name} <${candidate.primary_email ?? "no email"}>`).slice(0, 50).join(", ");
    throw new Error(`Could not identify the existing ${account.label} test account. Available test identities: ${available}`);
  }
  const user = users.find((candidate) => candidate.id === person.auth_user_id || normal(candidate.email) === normal(person.primary_email));
  if (!user) throw new Error(`The ${account.label} profile has no matching Supabase Auth user.`);
  const conflicting = users.find((candidate) => normal(candidate.email) === account.email && candidate.id !== user.id);
  if (conflicting) throw new Error(`${account.email} is already used by a different account.`);
  return { ...account, person, user };
});

const john = resolved[0];
const karen = resolved[1];
const tony = resolved[2];
const { data: brokerage, error: brokerageError } = await supabase.from("brokerages").select("id,display_name").eq("slug", "stamp-brokerage-inc").single();
if (brokerageError || !brokerage) throw brokerageError ?? new Error("Stamp Brokerage Inc. was not found.");

const { data: existingBrokerRole, error: existingBrokerRoleError } = await supabase
  .from("membership_roles")
  .select("membership_id,brokerage_memberships!inner(person_id,status)")
  .eq("brokerage_id", brokerage.id)
  .eq("role_key", "broker")
  .is("ends_at", null)
  .maybeSingle();
if (existingBrokerRoleError) throw existingBrokerRoleError;
if (existingBrokerRole && existingBrokerRole.brokerage_memberships.person_id !== john.person.id) {
  throw new Error("Stamp Brokerage Inc. already has a different active broker; no role changes were made.");
}

async function ensureMembership(personId) {
  const { data: current, error: currentError } = await supabase
    .from("brokerage_memberships")
    .select("id,status")
    .eq("brokerage_id", brokerage.id)
    .eq("person_id", personId)
    .eq("status", "active")
    .maybeSingle();
  if (currentError) throw currentError;
  if (current) return current.id;
  const { data: created, error: createdError } = await supabase
    .from("brokerage_memberships")
    .insert({ brokerage_id: brokerage.id, person_id: personId, status: "active", starts_at: new Date().toISOString(), approved_by_person_id: john.person.id })
    .select("id")
    .single();
  if (createdError) throw createdError;
  return created.id;
}

async function ensureMembershipRole(membershipId, roleKey) {
  const { data: existing, error: existingError } = await supabase
    .from("membership_roles")
    .select("membership_id")
    .eq("membership_id", membershipId)
    .eq("role_key", roleKey)
    .is("ends_at", null)
    .maybeSingle();
  if (existingError) throw existingError;
  if (existing) return;
  const { error } = await supabase.from("membership_roles").insert({ membership_id: membershipId, brokerage_id: brokerage.id, role_key: roleKey, granted_by_person_id: john.person.id });
  if (error) throw error;
}

const johnMembershipId = await ensureMembership(john.person.id);
const karenMembershipId = await ensureMembership(karen.person.id);
await ensureMembershipRole(johnMembershipId, "broker");
await ensureMembershipRole(karenMembershipId, "agent");
await ensureMembershipRole(karenMembershipId, "staff");

const { data: existingAdminRole, error: existingAdminError } = await supabase
  .from("person_platform_roles")
  .select("person_id")
  .eq("person_id", tony.person.id)
  .eq("role_key", "steadfast_admin")
  .is("ends_at", null)
  .maybeSingle();
if (existingAdminError) throw existingAdminError;
if (!existingAdminRole) {
  const { error } = await supabase.from("person_platform_roles").insert({ person_id: tony.person.id, role_key: "steadfast_admin", granted_by_person_id: tony.person.id, reason: "Dedicated test platform administrator account" });
  if (error) throw error;
}

for (const account of resolved) {
  const { error: authUpdateError } = await supabase.auth.admin.updateUserById(account.user.id, { email: account.email, email_confirm: true, password });
  if (authUpdateError) throw authUpdateError;
  const { error: personUpdateError } = await supabase.from("people").update({ auth_user_id: account.user.id, primary_email: account.email }).eq("id", account.person.id);
  if (personUpdateError) throw personUpdateError;
}

console.log(JSON.stringify({
  updatedAccounts: resolved.map(({ label, email }) => ({ label, email })),
  brokerage: brokerage.display_name,
  johnRoles: ["broker"],
  karenRoles: ["agent", "staff"],
  tonyRoles: ["steadfast_admin"],
}));
