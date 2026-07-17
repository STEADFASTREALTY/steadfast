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
}: {
  displayName: string;
  hasWorkspace?: boolean;
  canManageAgents?: boolean;
  canManageListings?: boolean;
  canReviewListings?: boolean;
  canManageInquiries?: boolean;
}) {
  return (
    <header className="account-header">
      <BrandLogo compact />
      <nav aria-label="Account navigation">
        <Link href="/properties">Properties</Link>
        {hasWorkspace ? <Link href="/workspace">Workspace</Link> : null}
        {canManageListings ? <Link href="/workspace/listings">Listings</Link> : null}
        {canReviewListings ? <Link href="/workspace/reviews">Reviews</Link> : null}
        {canManageInquiries ? <Link href="/workspace/inquiries">Inquiries</Link> : null}
        {canManageAgents ? <Link href="/broker/agents">Team</Link> : null}
        <Link href="/account/notifications">Notifications</Link>
        <Link href="/account">My account</Link>
        <Link href="/account/security">Security</Link>
      </nav>
      <form action={signOutAction} data-prompt-title="Sign out of SteadFast?" data-prompt-message="Your current session will end. Saved work will remain available when you sign in again." data-prompt-confirm="Sign out">
        <span>{displayName}</span>
        <button className="text-button" type="submit">Sign out</button>
      </form>
    </header>
  );
}
