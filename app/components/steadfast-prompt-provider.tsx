"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";

export type SteadFastPromptOptions = {
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: "standard" | "danger";
};

type PromptRequest = SteadFastPromptOptions & {
  form?: HTMLFormElement;
  submitter?: HTMLElement | null;
  resolve?: (confirmed: boolean) => void;
};

const PromptContext = createContext<((options: SteadFastPromptOptions) => Promise<boolean>) | null>(null);

function promptValue(element: HTMLElement | null, form: HTMLFormElement, key: string) {
  return element?.dataset[key] ?? form.dataset[key];
}

export function SteadFastPromptProvider({ children }: { children: ReactNode }) {
  const [request, setRequest] = useState<PromptRequest | null>(null);
  const bypassedForms = useRef(new WeakSet<HTMLFormElement>());
  const confirmButton = useRef<HTMLButtonElement>(null);

  const ask = useCallback((options: SteadFastPromptOptions) => new Promise<boolean>((resolve) => {
    setRequest({ ...options, resolve });
  }), []);

  useEffect(() => {
    function interceptSubmit(event: SubmitEvent) {
      const form = event.target;
      if (!(form instanceof HTMLFormElement)) return;
      if (bypassedForms.current.has(form)) {
        bypassedForms.current.delete(form);
        return;
      }
      const submitter = event.submitter instanceof HTMLElement ? event.submitter : null;
      const title = promptValue(submitter, form, "promptTitle");
      const message = promptValue(submitter, form, "promptMessage");
      if (!title || !message) return;

      event.preventDefault();
      event.stopImmediatePropagation();
      setRequest({
        title,
        message,
        confirmLabel: promptValue(submitter, form, "promptConfirm") ?? "Continue",
        cancelLabel: promptValue(submitter, form, "promptCancel") ?? "Cancel",
        variant: promptValue(submitter, form, "promptVariant") === "danger" ? "danger" : "standard",
        form,
        submitter,
      });
    }
    document.addEventListener("submit", interceptSubmit, true);
    return () => document.removeEventListener("submit", interceptSubmit, true);
  }, []);

  useEffect(() => {
    if (!request) return;
    const currentRequest = request;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    confirmButton.current?.focus();
    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        currentRequest.resolve?.(false);
        setRequest(null);
      }
    }
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [request]);

  function cancel() {
    request?.resolve?.(false);
    setRequest(null);
  }

  function confirm() {
    if (!request) return;
    request.resolve?.(true);
    const { form, submitter } = request;
    setRequest(null);
    if (!form) return;
    bypassedForms.current.add(form);
    if (submitter instanceof HTMLButtonElement || submitter instanceof HTMLInputElement) {
      form.requestSubmit(submitter);
    } else {
      form.requestSubmit();
    }
  }

  return <PromptContext.Provider value={ask}>
    {children}
    {request ? <div className="prompt-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) cancel(); }}>
      <section className={`steadfast-prompt ${request.variant === "danger" ? "danger" : ""}`} role="alertdialog" aria-modal="true" aria-labelledby="steadfast-prompt-title" aria-describedby="steadfast-prompt-message">
        <span>{request.variant === "danger" ? "Please confirm" : "ProperAP confirmation"}</span>
        <h2 id="steadfast-prompt-title">{request.title}</h2>
        <p id="steadfast-prompt-message">{request.message}</p>
        <div>
          <button className="outline-dark-button" type="button" onClick={cancel}>{request.cancelLabel ?? "Cancel"}</button>
          <button ref={confirmButton} className={request.variant === "danger" ? "danger-button" : "solid-button"} type="button" onClick={confirm}>{request.confirmLabel ?? "Continue"}</button>
        </div>
      </section>
    </div> : null}
  </PromptContext.Provider>;
}

export function useSteadFastPrompt() {
  const prompt = useContext(PromptContext);
  if (!prompt) throw new Error("useSteadFastPrompt must be used within SteadFastPromptProvider.");
  return prompt;
}
