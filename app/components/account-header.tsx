import Link from "next/link";
import { signOutAction } from "@/app/actions/auth";
import { BrandLogo } from "@/app/components/brand-logo";

export function AccountHeader({
  displayName,
  hasWorkspace = false,
  canManageAgents = false,
  canManageListings = false,
  canReviewListings = false,
  canManageInquiries = false,
  canShareListings = false,
}: {
  displayName: string;
  hasWorkspace?: boolean;
  canManageAgents?: boolean;
  canManageListings?: boolean;
  canReviewListings?: boolean;
  canManageInquiries?: boolean;
  canShareListings?: boolean;
}) {
  return (
    <header className="account-header">
      <BrandLogo compact />
      <nav aria-label="Account navigation">
        <Link href="/properties">Properties</Link>
        {hasWorkspace ? <Link href="/workspace">Workspace</Link> : null}
        {hasWorkspace ? <Link href="/workspace/site">Website</Link> : null}
        {canManageListings ? <Link href="/workspace/listings">Listings</Link> : null}
        {canReviewListings ? <Link href="/workspace/reviews">Reviews</Link> : null}
        {canShareListings ? <Link href="/workspace/sharing">Sharing</Link> : null}
        {canManageInquiries ? <Link href="/workspace/inquiries">Inquiries</Link> : null}
        {canManageAgents ? <Link href="/broker/agents">Team</Link> : null}
        <Link href="/account/notifications">Notifications</Link>
        <Link href="/account/profile">Profile</Link>
        <Link href="/account">My account</Link>
        <Link href="/account/security">Security</Link>
      </nav>
      <div className="account-session-actions">
        <span>{displayName}</span>
        <form action={signOutAction} data-prompt-title="Sign out on this machine?" data-prompt-message="Only this browser session will end. Other machines remain signed in." data-prompt-confirm="Sign out here">
          <input type="hidden" name="scope" value="local" />
          <button className="text-button" type="submit">Sign out here</button>
        </form>
        <form action={signOutAction} data-prompt-title="Sign out on every machine?" data-prompt-message="Every active SteadFast session for this account will be revoked, including this machine." data-prompt-confirm="Sign out everywhere" data-prompt-variant="danger">
          <input type="hidden" name="scope" value="global" />
          <button className="text-button" type="submit">All machines</button>
        </form>
      </div>
    </header>
  );
}
