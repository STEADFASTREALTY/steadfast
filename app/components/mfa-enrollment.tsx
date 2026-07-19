"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import { createClient } from "@/lib/supabase/client";

type Enrollment = { factorId: string; qrCode: string; secret: string };

export function MfaEnrollment({ nextPath, allowAdditional = false }: { nextPath: string; allowAdditional?: boolean }) {
  const [enrollment, setEnrollment] = useState<Enrollment | null>(null);
  const [code, setCode] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [factorCount, setFactorCount] = useState<number | null>(null);

  useEffect(() => {
    const supabase = createClient();
    void supabase.auth.mfa.listFactors().then(({ data }) => {
      setFactorCount(data?.totp.filter((factor) => factor.status === "verified").length ?? 0);
    });
  }, []);

  async function beginEnrollment() {
    setBusy(true);
    setMessage("");
    const supabase = createClient();
    const factors = await supabase.auth.mfa.listFactors();
    if (factors.error) {
      setMessage("Your authenticator settings could not be loaded.");
      setBusy(false);
      return;
    }

    const verified = factors.data.totp.filter((factor) => factor.status === "verified");
    if (verified.length && !allowAdditional) {
      setMessage("An authenticator is already enabled. Continue to verification.");
      setBusy(false);
      return;
    }

    await Promise.all(
      factors.data.all
        .filter((factor) => factor.status === "unverified")
        .map((factor) => supabase.auth.mfa.unenroll({ factorId: factor.id })),
    );

    const result = await supabase.auth.mfa.enroll({
      factorType: "totp",
      friendlyName: allowAdditional ? "ProperAP backup authenticator" : "ProperAP authenticator",
    });
    if (result.error) {
      setMessage("Authenticator setup could not be started. Please try again.");
      setBusy(false);
      return;
    }

    setEnrollment({ factorId: result.data.id, qrCode: result.data.totp.qr_code, secret: result.data.totp.secret });
    setBusy(false);
  }

  async function verifyEnrollment(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!enrollment || !/^\d{6}$/.test(code)) {
      setMessage("Enter the six-digit code from your authenticator app.");
      return;
    }
    setBusy(true);
    setMessage("");
    const supabase = createClient();
    const challenge = await supabase.auth.mfa.challenge({ factorId: enrollment.factorId });
    if (challenge.error) {
      setMessage("A verification challenge could not be created. Please try again.");
      setBusy(false);
      return;
    }
    const verified = await supabase.auth.mfa.verify({ factorId: enrollment.factorId, challengeId: challenge.data.id, code });
    if (verified.error) {
      setMessage("That code was not accepted. Wait for a new code and try again.");
      setBusy(false);
      return;
    }
    window.location.assign(nextPath);
  }

  if (!enrollment) {
    return <div className="mfa-action">{allowAdditional && factorCount !== null ? <strong>{factorCount ? `${factorCount} verified authenticator${factorCount === 1 ? "" : "s"} enrolled` : "No authenticator enrolled"}</strong> : null}<p>Use Google Authenticator, Microsoft Authenticator, 1Password, Authy, or another TOTP-compatible app.</p>{message ? <p className="status-message error" role="status">{message}</p> : null}<button className="solid-button" type="button" onClick={beginEnrollment} disabled={busy}>{busy ? "Preparing…" : allowAdditional && factorCount ? "Add a backup authenticator" : "Set up authenticator"}</button></div>;
  }

  return <form className="mfa-enrollment" onSubmit={verifyEnrollment}>
    <div className="mfa-qr"><Image src={enrollment.qrCode} alt="QR code for ProperAP authenticator setup" width={220} height={220} unoptimized /></div>
    <div><h3>1. Scan this code</h3><p>Open your authenticator app and scan the QR code. If scanning is unavailable, enter this setup key:</p><code>{enrollment.secret}</code></div>
    <label><span>2. Enter the six-digit code</span><input value={code} onChange={(event) => setCode(event.target.value.replace(/\D/g, "").slice(0, 6))} inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" required /></label>
    {message ? <p className="status-message error" role="status">{message}</p> : null}
    <button className="solid-button" type="submit" disabled={busy}>{busy ? "Checking…" : "Verify and enable"}</button>
  </form>;
}
