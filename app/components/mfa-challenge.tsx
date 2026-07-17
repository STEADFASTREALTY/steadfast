"use client";

import { useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";

export function MfaChallenge({ nextPath }: { nextPath: string }) {
  const [code, setCode] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  async function verify(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!/^\d{6}$/.test(code)) {
      setMessage("Enter the six-digit code from your authenticator app.");
      return;
    }
    setBusy(true);
    setMessage("");
    const supabase = createClient();
    const factors = await supabase.auth.mfa.listFactors();
    const factor = factors.data?.totp.find((item) => item.status === "verified");
    if (factors.error || !factor) {
      setMessage("No verified authenticator is available for this account.");
      setBusy(false);
      return;
    }
    const challenge = await supabase.auth.mfa.challenge({ factorId: factor.id });
    if (challenge.error) {
      setMessage("Verification could not be started. Please wait and try again.");
      setBusy(false);
      return;
    }
    const result = await supabase.auth.mfa.verify({ factorId: factor.id, challengeId: challenge.data.id, code });
    if (result.error) {
      setMessage("That code was not accepted. Wait for a new code and try again.");
      setBusy(false);
      return;
    }
    window.location.assign(nextPath);
  }

  return <form className="stack-form" onSubmit={verify}>
    <label><span>Authenticator code</span><input value={code} onChange={(event) => setCode(event.target.value.replace(/\D/g, "").slice(0, 6))} inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" required autoFocus /></label>
    {message ? <p className="status-message error" role="status">{message}</p> : null}
    <button className="solid-button" type="submit" disabled={busy}>{busy ? "Verifying…" : "Verify and continue"}</button>
    <p className="form-assist">Lost access to your authenticator? Contact your SteadFast administrator. <Link href="/account">Return to your account</Link></p>
  </form>;
}
