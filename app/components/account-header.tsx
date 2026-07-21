import Link from "next/link";
import { signOutAction } from "@/app/actions/auth";
import { BrandLogo } from "@/app/components/brand-logo";
import { NotificationNavLink } from "@/app/components/notification-nav-link";
import { createClient } from "@/lib/supabase/server";

export async function AccountHeader({
  displayName,
  hasWorkspace = false,
  canManageAgents = false,
  canManageListings = false,
  canManageInquiries = false,
  canShareListings = false,
  isConsumer = false,
  isOperations = false,
  isAdmin = false,
}: {
  displayName: string;
  hasWorkspace?: boolean;
  canManageAgents?: boolean;
  canManageListings?: boolean;
  canManageInquiries?: boolean;
  canShareListings?: boolean;
  isConsumer?: boolean;
  isOperations?: boolean;
  isAdmin?: boolean;
}) {
  const isPlatformRole = isOperations || isAdmin;
  const supabase = await createClient();
  const { count: unreadNotificationCount } = await supabase
    .from("notifications")
    .select("id", { count: "exact", head: true })
    .is("read_at", null)
    .is("deleted_at", null);

  return (
    <header className="account-header">
      <BrandLogo compact />
      <nav aria-label="Account navigation">
        <Link href="/properties">Properties</Link>
        {hasWorkspace && !isPlatformRole ? <Link href="/workspace/search">Search</Link> : null}
        {!isPlatformRole ? <Link href="/account/saved-listings">My watch</Link> : null}
        {isConsumer && !isPlatformRole ? <Link href="/account/messages">Message center</Link> : null}
        {hasWorkspace && !isPlatformRole ? <Link href="/workspace/site">Website</Link> : null}
        {canManageListings ? <Link href="/workspace/listings">Listings</Link> : null}
        {canShareListings ? <Link href="/workspace/sharing">Sharing</Link> : null}
        {canManageInquiries ? <Link href="/workspace/inquiries">Inquiries</Link> : null}
        {canManageAgents ? <Link href="/broker/agents">Team</Link> : null}
        {(canManageListings || canManageAgents || canManageInquiries || canShareListings) ? <Link href="/workspace/analytics">Analytics</Link> : null}
        {isPlatformRole ? <Link href="/staff">Members</Link> : null}
        <Link href="/account">My account</Link>
        <NotificationNavLink initialCount={unreadNotificationCount ?? 0} />
      </nav>
      <div className="account-session-actions">
        <span>{displayName}</span>
        <form action={signOutAction} data-prompt-title="Sign out on this machine?" data-prompt-message="Only this browser session will end. Other machines remain signed in." data-prompt-confirm="Sign out here">
          <input type="hidden" name="scope" value="local" />
          <button aria-label="Sign out on this machine" className="account-exit-button" title="Sign out on this machine" type="submit">
            <svg aria-hidden="true" viewBox="0 0 24 24"><path d="M10 5H5v14h5" /><path d="M14 8l4 4-4 4" /><path d="M8 12h10" /></svg>
          </button>
        </form>
      </div>
    </header>
  );
}
