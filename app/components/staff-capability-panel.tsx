import { updateStaffCapabilityAction } from "@/app/actions/onboarding";

const capabilities = [
  { key: "listing.review", name: "Approve listings", description: "Review, return, approve, or decline listing submissions." },
  { key: "listing.manage", name: "Manage listing workflow", description: "Coordinate the brokerage portfolio without bypassing approval." },
  { key: "listing.reassign", name: "Reassign listings", description: "Assign brokerage listings to active agents." },
  { key: "agent.manage", name: "Manage agents", description: "Review applications and manage agent membership status." },
  { key: "staff.manage_limited", name: "Invite team members", description: "Invite broker staff and view delegated team access." },
  { key: "brokerage.profile", name: "Edit brokerage website", description: "Manage the company profile, offices, branding, and website." },
  { key: "inquiry.manage", name: "Manage inquiries", description: "Work with the brokerage inquiry queue and assignments." },
  { key: "report.view", name: "View reports", description: "See brokerage activity and operational reports." },
  { key: "audit.view", name: "View activity history", description: "Review approval, membership, assignment, and sharing history." },
  { key: "billing.view", name: "View billing", description: "See plan, usage, invoice, and payment status." },
  { key: "integration.manage", name: "Manage distribution", description: "Configure approved listing destinations and review delivery status." },
] as const;

type StaffCapabilityPanelProps = {
  membershipId: string;
  activePermissionKeys: string[];
  staffName: string;
};

export function StaffCapabilityPanel({ membershipId, activePermissionKeys, staffName }: StaffCapabilityPanelProps) {
  return (
    <details className="capability-panel">
      <summary><strong>{staffName}</strong><span>Permissions</span></summary>
      <p>Turn on only the work this person is responsible for. Every change is recorded.</p>
      <div className="capability-list">
        {capabilities.map((capability) => {
          const enabled = activePermissionKeys.includes(capability.key);
          return (
            <form action={updateStaffCapabilityAction} className="capability-row" key={capability.key} data-prompt-title={`${enabled ? "Remove" : "Grant"} this staff permission?`} data-prompt-message={`${capability.name} access will be ${enabled ? "removed from" : "granted to"} this team member and recorded in the activity history.`} data-prompt-confirm={enabled ? "Remove access" : "Grant access"} data-prompt-variant={enabled ? "danger" : "standard"}>
              <input name="membershipId" type="hidden" value={membershipId} />
              <input name="permissionKey" type="hidden" value={capability.key} />
              <input name="operation" type="hidden" value={enabled ? "revoke" : "grant"} />
              <input name="reason" type="hidden" value={enabled ? "Removed from broker team access" : "Assigned by principal broker"} />
              <span><strong>{capability.name}</strong><small>{capability.description}</small></span>
              <button className={enabled ? "capability-toggle enabled" : "capability-toggle"} type="submit" aria-label={`${enabled ? "Remove" : "Allow"} ${capability.name}`}>
                {enabled ? "Allowed" : "Not allowed"}
              </button>
            </form>
          );
        })}
      </div>
    </details>
  );
}
