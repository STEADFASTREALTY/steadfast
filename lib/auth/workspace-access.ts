type Permission = { permission_key: string; effect: string };

export type WorkspaceAccess = {
  hasWorkspace: boolean;
  isAgent: boolean;
  canManageAgents: boolean;
  canReviewListings: boolean;
  canManageBrokerage: boolean;
  isOperations: boolean;
  isAdmin: boolean;
};

export function deriveWorkspaceAccess({
  hasMembership,
  roles,
  permissions,
  platformRoles,
}: {
  hasMembership: boolean;
  roles: string[];
  permissions: Permission[];
  platformRoles: string[];
}): WorkspaceAccess {
  const isBroker = roles.includes("broker");
  const allows = (key: string) => permissions.some(
    (permission) => permission.permission_key === key && permission.effect === "allow",
  );
  const isOperations = platformRoles.includes("steadfast_operations");
  const isAdmin = platformRoles.includes("steadfast_admin");

  return {
    hasWorkspace: hasMembership || isOperations || isAdmin,
    isAgent: roles.includes("agent") || isBroker,
    canManageAgents: isBroker || allows("agent.manage"),
    canReviewListings: isBroker || allows("listing.review"),
    canManageBrokerage: isBroker || allows("brokerage.profile"),
    isOperations,
    isAdmin,
  };
}
