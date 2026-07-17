import Link from "next/link";
import { signOutAction } from "@/app/actions/auth";

export function AccountHeader({
  displayName,
  hasWorkspace = false,
  canManageAgents = false,
  canManageListings = false,
}: {
  displayName: string;
  hasWorkspace?: boolean;
  canManageAgents?: boolean;
  canManageListings?: boolean;
}) {
  return (
    <header className="account-header">
      <Link className="brand" href="/" aria-label="SteadFast Realty home">
        <span className="brand-mark" aria-hidden="true">S</span>
        <span>SteadFast</span>
        <small>Realty</small>
      </Link>
      <nav aria-label="Account navigation">
        <Link href="/properties">Properties</Link>
        {hasWorkspace ? <Link href="/workspace">Workspace</Link> : null}
        {canManageListings ? <Link href="/workspace/listings">Listings</Link> : null}
        {canManageAgents ? <Link href="/broker/agents">Team</Link> : null}
        <Link href="/account">My account</Link>
        <Link href="/account/security">Security</Link>
      </nav>
      <form action={signOutAction}>
        <span>{displayName}</span>
        <button className="text-button" type="submit">Sign out</button>
      </form>
    </header>
  );
}
