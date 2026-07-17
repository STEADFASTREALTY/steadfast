export function StatusMessage({ error, notice }: { error?: string; notice?: string }) {
  if (!error && !notice) return null;
  return <p className={`status-message ${error ? "error" : "success"}`} role="status">{error ?? notice}</p>;
}
