"use client";

import { useActionState } from "react";
import {
  createBrokerageInvitationAction,
  type InvitationActionState,
} from "@/app/actions/onboarding";

const initialState: InvitationActionState = {};

export function InvitationForm({ brokerageId }: { brokerageId: string }) {
  const [state, action, pending] = useActionState(createBrokerageInvitationAction, initialState);

  return (
    <form action={action} className="stack-form">
      <input type="hidden" name="brokerageId" value={brokerageId} />
      <label>
        <span>Email address</span>
        <input name="email" type="email" required autoComplete="email" maxLength={320} />
      </label>
      <fieldset>
        <legend>Access to assign</legend>
        <label className="check-row"><input name="agent" type="checkbox" /> Agent</label>
        <label className="check-row"><input name="staff" type="checkbox" /> Broker staff</label>
      </fieldset>
      {state.error ? <p className="status-message error" role="status">{state.error}</p> : null}
      {state.invitationLink ? (
        <div className="invite-result" role="status">
          <strong>Invitation created</strong>
          <p>Send this private, one-time link to the invited person. It expires in seven days.</p>
          <input readOnly value={state.invitationLink} aria-label="Invitation link" />
        </div>
      ) : null}
      <button className="solid-button" type="submit" disabled={pending}>
        {pending ? "Creating invitation…" : "Create invitation"}
      </button>
    </form>
  );
}
