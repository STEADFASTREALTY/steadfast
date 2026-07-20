"use client";

import { useState } from "react";

function EyeIcon({ open }: { open: boolean }) {
  return open
    ? <svg aria-hidden="true" viewBox="0 0 24 24"><path d="M3 3l18 18" /><path d="M10.6 10.7a2 2 0 0 0 2.7 2.7" /><path d="M9.9 5.1A10.4 10.4 0 0 1 12 5c5.2 0 8.8 4.2 9.8 7-0.4 1.1-1.2 2.5-2.5 3.8" /><path d="M6.2 6.2C4.6 7.7 3.5 9.8 3 12c1 2.8 4.8 7 9 7 1.3 0 2.5-.3 3.6-.9" /></svg>
    : <svg aria-hidden="true" viewBox="0 0 24 24"><path d="M2.5 12S6 5 12 5s9.5 7 9.5 7-3.5 7-9.5 7-9.5-7-9.5-7Z" /><circle cx="12" cy="12" r="3" /></svg>;
}

export function PasswordChangeForm({ action }: { action: (formData: FormData) => void | Promise<void> }) {
  const [showPassword, setShowPassword] = useState(false);
  const type = showPassword ? "text" : "password";
  return <form action={action} className="stack-form password-change-form" data-prompt-title="Change your password?" data-prompt-message="Other signed-in devices will be signed out for account protection." data-prompt-confirm="Change password">
    <label><span>New password</span><div className="password-input"><input name="password" type={type} autoComplete="new-password" minLength={10} required /><button type="button" onClick={() => setShowPassword((visible) => !visible)} aria-label={showPassword ? "Hide password" : "Show password"} title={showPassword ? "Hide password" : "Show password"}><EyeIcon open={showPassword} /></button></div></label>
    <label><span>Confirm new password</span><div className="password-input"><input name="confirmPassword" type={type} autoComplete="new-password" minLength={10} required /><button type="button" onClick={() => setShowPassword((visible) => !visible)} aria-label={showPassword ? "Hide password" : "Show password"} title={showPassword ? "Hide password" : "Show password"}><EyeIcon open={showPassword} /></button></div></label>
    <button className="solid-button" type="submit">Save new password</button>
  </form>;
}
