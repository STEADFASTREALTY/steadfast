"use client";

import { useState } from "react";
import { useFormStatus } from "react-dom";
import { permanentlyDeleteAccountAction } from "@/app/actions/auth";

function DeleteButton({ enabled }: { enabled: boolean }) {
  const { pending } = useFormStatus();
  return <button
    className="danger-button"
    type="submit"
    disabled={!enabled || pending}
  >{pending ? "Deleting account…" : "Delete account permanently"}</button>;
}

export function DeleteAccountForm({ blockedReason }: { blockedReason?: string }) {
  const [acknowledged, setAcknowledged] = useState(false);
  const [confirmation, setConfirmation] = useState("");
  const enabled = !blockedReason && acknowledged && confirmation === "DELETE MY ACCOUNT";

  return <section className="account-card delete-account-card">
    <div className="card-heading"><span>Permanent action</span><h2>Delete account</h2></div>
    <p>Deleting your account permanently removes your name, email address, phone number, profile, website, messages, saved listings, and private images. It cannot be revived, reversed, or recovered. Your email address and public username become available again.</p>
    <p>Past property records remain without your personal details. Brokerage-agent listings transfer to the brokerage and are paused for broker review. Independent-agent listings are closed automatically and remain only as property-only records, with no agent details or contact path.</p>
    {blockedReason ? <p className="delete-account-blocked">{blockedReason}</p> : <form
      action={permanentlyDeleteAccountAction}
      className="delete-account-form"
      data-prompt-title="Delete this account forever?"
      data-prompt-message="This is the final confirmation. ProperAP cannot restore this account, its sign-in, personal data, website, or private images."
      data-prompt-confirm="Delete forever"
      data-prompt-cancel="Keep account"
      data-prompt-variant="danger"
    >
      <label className="delete-account-check"><input name="acknowledgement" type="checkbox" checked={acknowledged} onChange={(event) => setAcknowledged(event.target.checked)} /><span>I understand this permanently deletes my account and cannot be reversed or recovered.</span></label>
      <label><span>Type DELETE MY ACCOUNT to continue</span><input name="confirmation" value={confirmation} onChange={(event) => setConfirmation(event.target.value)} autoComplete="off" spellCheck="false" /></label>
      <DeleteButton enabled={enabled} />
    </form>}
  </section>;
}
