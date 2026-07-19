"use client";

import { Fragment, useState } from "react";
import { createListingShareAction, endListingShareAction } from "@/app/actions/shares";

type AgentOption = { id: string; name: string };
type OwnedShare = { id: string; agentName: string };
type OwnedListing = { id: string; title: string; listedDate: string; shares: OwnedShare[] };
type IncomingShare = { id: string; listingId: string; title: string; listedDate: string; ownerName: string };

function GlobeIcon() {
  return <svg aria-hidden="true" viewBox="0 0 24 24"><circle cx="12" cy="12" r="9" /><path d="M3 12h18M12 3c3 3.2 4.2 6.2 4.2 9S15 17.8 12 21c-3-3.2-4.2-6.2-4.2-9S9 6.2 12 3Z" /></svg>;
}

function ShareIcon() {
  return <svg aria-hidden="true" viewBox="0 0 24 24"><circle cx="18" cy="5" r="2.5" /><circle cx="6" cy="12" r="2.5" /><circle cx="18" cy="19" r="2.5" /><path d="m8.3 10.8 7.4-4.4M8.3 13.2l7.4 4.4" /></svg>;
}

export function ListingSharingTables({
  view,
  ownedListings,
  incomingShares,
  agents,
}: {
  view: "mine" | "shared";
  ownedListings: OwnedListing[];
  incomingShares: IncomingShare[];
  agents: AgentOption[];
}) {
  const [openListingId, setOpenListingId] = useState<string | null>(null);
  const [agentNames, setAgentNames] = useState<Record<string, string>>({});

  if (view === "shared") {
    return <div className="sharing-table-wrap">
      <table className="sharing-table">
        <thead><tr><th>Agent name (owner)</th><th>Listing date</th><th>Listing name</th><th>Link</th><th>Action</th></tr></thead>
        <tbody>
          {incomingShares.length ? incomingShares.map((share) => <tr key={share.id}>
            <td>{share.ownerName}</td>
            <td>{share.listedDate}</td>
            <td className="sharing-table-name">{share.title}</td>
            <td><a className="sharing-icon-link" href={`/properties/${share.listingId}`} target="_blank" rel="noreferrer" aria-label={`Open ${share.title} in a new tab`} title="Open listing"><GlobeIcon /></a></td>
            <td><form action={endListingShareAction} data-prompt-title="Quit sharing this listing?" data-prompt-message="The listing will be removed from your website and its owner will be notified." data-prompt-confirm="Quit sharing" data-prompt-variant="danger"><input type="hidden" name="shareId" value={share.id} /><button className="sharing-quit-button" name="operation" value="remove" type="submit">Quit sharing</button></form></td>
          </tr>) : <tr><td className="sharing-empty-cell" colSpan={5}>No listings have been shared with you.</td></tr>}
        </tbody>
      </table>
    </div>;
  }

  return <div className="sharing-table-wrap">
    <table className="sharing-table">
      <thead><tr><th>Listed date</th><th>Listing name</th><th>Link</th><th>Action</th></tr></thead>
      <tbody>
        {ownedListings.length ? ownedListings.map((listing) => {
          const typedName = agentNames[listing.id] ?? "";
          const selectedAgent = agents.find((agent) => agent.name.localeCompare(typedName.trim(), undefined, { sensitivity: "accent" }) === 0);
          const isOpen = openListingId === listing.id;
          return <Fragment key={listing.id}>
            <tr>
              <td>{listing.listedDate}</td>
              <td className="sharing-table-name">{listing.title}</td>
              <td><a className="sharing-icon-link" href={`/properties/${listing.id}`} target="_blank" rel="noreferrer" aria-label={`Open ${listing.title} in a new tab`} title="Open listing"><GlobeIcon /></a></td>
              <td><button className={`sharing-icon-button${isOpen ? " active" : ""}`} type="button" onClick={() => setOpenListingId(isOpen ? null : listing.id)} aria-expanded={isOpen} aria-label={`Share ${listing.title}`} title="Share listing"><ShareIcon /></button></td>
            </tr>
            {isOpen ? <tr className="sharing-inline-row"><td colSpan={4}>
              <form action={createListingShareAction} className="sharing-inline-form" data-prompt-title="Share this listing?" data-prompt-message="This agent may display the listing but cannot edit it. The agent will be notified." data-prompt-confirm="Share listing">
                <input type="hidden" name="listingId" value={listing.id} />
                <input type="hidden" name="displayingAgentPersonId" value={selectedAgent?.id ?? ""} />
                <label htmlFor={`share-agent-${listing.id}`}>Agent name</label>
                <input id={`share-agent-${listing.id}`} list={`share-agents-${listing.id}`} value={typedName} onChange={(event) => setAgentNames((current) => ({ ...current, [listing.id]: event.target.value }))} placeholder="Enter an agent name" autoComplete="off" required />
                <datalist id={`share-agents-${listing.id}`}>{agents.map((agent) => <option key={agent.id} value={agent.name} />)}</datalist>
                <button className="solid-button" type="submit" disabled={!selectedAgent}>Share</button>
              </form>
            </td></tr> : null}
            {listing.shares.length ? <tr className="sharing-agent-row"><td colSpan={4}><span>Shared with</span><div className="sharing-agent-chips">{listing.shares.map((share) => <div className="sharing-agent-chip" key={share.id}><strong>{share.agentName}</strong><form action={endListingShareAction} data-prompt-title={`Remove ${share.agentName} from this share?`} data-prompt-message="The listing will disappear from this agent’s website and the agent will be notified." data-prompt-confirm="Remove share" data-prompt-variant="danger"><input type="hidden" name="shareId" value={share.id} /><button name="operation" value="revoke" type="submit" aria-label={`Remove ${share.agentName}`} title={`Remove ${share.agentName}`}>×</button></form></div>)}</div></td></tr> : null}
          </Fragment>;
        }) : <tr><td className="sharing-empty-cell" colSpan={4}>You do not have any published listings available to share.</td></tr>}
      </tbody>
    </table>
  </div>;
}
