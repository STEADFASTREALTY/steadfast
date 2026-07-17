"use client";

import { useEffect, useRef, useState } from "react";
import { useFormStatus } from "react-dom";
import { saveSiteBuilderAction, uploadSiteAssetAction } from "@/app/actions/site-builder";
import { compressListingImage } from "@/lib/media/client-image-compression";

const labels: Record<string, string> = { hero: "Hero", about: "About", search: "Property search", listings: "Listings", testimonials: "Testimonials", contact: "Contact" };
const allSections = ["hero", "about", "search", "listings", "testimonials", "contact"];
type Site = { id: string; site_type: string; display_name: string; slug: string; theme: Record<string, unknown> | null; layout: Record<string, unknown> | null; content: Record<string, unknown> | null };
type SiteTheme = { primary: string; accent: string; background: string; text: string };
const themeFields: { key: keyof SiteTheme; label: string; help: string }[] = [
  { key: "primary", label: "Hero background", help: "The large banner at the top of your public website." },
  { key: "accent", label: "Accent color", help: "Buttons, highlights, and small premium details." },
  { key: "background", label: "Page background", help: "The light background behind your website sections." },
  { key: "text", label: "Body text", help: "Main text on light page sections." },
];

function ImageUploadButton() {
  const { pending } = useFormStatus();
  return <button className="outline-dark-button image-upload-button" type="submit" disabled={pending} aria-busy={pending}>
    {pending ? <><span className="button-spinner" aria-hidden="true" />Preparing and uploading…</> : "Prepare and upload"}
  </button>;
}

export function SiteBuilder({ site }: { site: Site }) {
  const savedOrder = Array.isArray(site.layout?.sectionOrder) ? site.layout.sectionOrder.filter((value): value is string => allSections.includes(String(value))) : allSections;
  const [order, setOrder] = useState(savedOrder.length === allSections.length ? savedOrder : allSections);
  const [aboutHtml, setAboutHtml] = useState(String(site.content?.aboutHtml ?? ""));
  const [contactEmail, setContactEmail] = useState(String(site.content?.contactEmail ?? ""));
  const [contactPhone, setContactPhone] = useState(String(site.content?.contactPhone ?? ""));
  const [strengths, setStrengths] = useState(String(site.content?.strengths ?? ""));
  const [imageError, setImageError] = useState("");
  const [selectedFileName, setSelectedFileName] = useState("");
  const editor = useRef<HTMLDivElement>(null);
  const initialized = useRef(false);
  useEffect(() => { if (editor.current && !initialized.current) { editor.current.innerHTML = aboutHtml; initialized.current = true; } }, [aboutHtml]);
  const theme = site.theme ?? {};
  const [siteTheme, setSiteTheme] = useState<SiteTheme>(() => ({ primary: String(theme.primary ?? "#102C2A"), accent: String(theme.accent ?? "#D8A72E"), background: String(theme.background ?? "#FBFAF6"), text: String(theme.text ?? "#17201C") }));
  const move = (index: number, change: number) => setOrder((current) => { const next = [...current]; const target = index + change; if (target < 0 || target >= next.length) return current; [next[index], next[target]] = [next[target], next[index]]; return next; });
  const format = (command: string, value?: string) => { editor.current?.focus(); document.execCommand(command, false, value); setAboutHtml(editor.current?.innerHTML ?? ""); };
  const compress = async (event: React.ChangeEvent<HTMLInputElement>) => { const selected = event.target.files?.[0]; if (!selected) return; try { const compressed = await compressListingImage(selected); const transfer = new DataTransfer(); transfer.items.add(compressed); event.target.files = transfer.files; setSelectedFileName(selected.name); setImageError(""); } catch { event.target.value = ""; setSelectedFileName(""); setImageError("Choose a clear still image at least 300 pixels wide and high."); } };
  return <section className="account-card site-builder-card">
    <div className="card-heading"><span>Modular website</span><h2>{site.display_name}</h2></div>
    <p>Arrange sections, write your story, and choose a color system. Changes are saved only when you confirm below.</p>
    <form action={saveSiteBuilderAction} className="stack-form" data-prompt-title="Publish these website changes?" data-prompt-message="Your professional website layout, palette, and public content will update for visitors." data-prompt-confirm="Save website">
      <input type="hidden" name="siteId" value={site.id} /><input type="hidden" name="sectionOrder" value={JSON.stringify(order)} /><input type="hidden" name="content" value={JSON.stringify({ aboutHtml, contactEmail, contactPhone, strengths })} />
      <div className="site-section-order"><span>Page sections — drag is supported; the arrows work on every device.</span>{order.map((section, index) => <div key={section} draggable onDragStart={(event) => event.dataTransfer.setData("text/plain", section)} onDragOver={(event) => event.preventDefault()} onDrop={(event) => { const dragged = event.dataTransfer.getData("text/plain"); const from = order.indexOf(dragged); if (from >= 0) { const next = [...order]; next.splice(from, 1); next.splice(index, 0, dragged); setOrder(next); } }}><strong>⠿ {labels[section]}</strong><div><button type="button" aria-label={`Move ${labels[section]} up`} onClick={() => move(index, -1)}>↑</button><button type="button" aria-label={`Move ${labels[section]} down`} onClick={() => move(index, 1)}>↓</button></div></div>)}</div>
      <fieldset className="theme-editor"><legend>Your color palette</legend><p className="theme-editor-help">Choose the color for each part of your public website. Changes stay in this form until you save the website.</p>{themeFields.map(({ key, label, help }) => <label key={key}><span>{label}</span><input type="color" name={`theme-${key}`} value={siteTheme[key]} onChange={(event) => setSiteTheme((current) => ({ ...current, [key]: event.target.value }))} /><small>{help}</small></label>)}<input type="hidden" name="theme" value={JSON.stringify(siteTheme)} readOnly /></fieldset>
      <label><span>About your service</span><div className="rich-toolbar" aria-label="Text formatting"><button type="button" onClick={() => format("bold")}>Bold</button><button type="button" onClick={() => format("insertUnorderedList")}>Bullets</button><button type="button" onClick={() => format("formatBlock", "h2")}>Heading</button><button type="button" onClick={() => format("fontName", "Georgia")}>Serif</button><button type="button" onClick={() => format("fontSize", "5")}>Large</button><button type="button" onClick={() => format("foreColor", "#168C91")}>Teal</button></div><div ref={editor} className="rich-editor" contentEditable suppressContentEditableWarning onInput={(event) => setAboutHtml(event.currentTarget.innerHTML)}>{site.content?.aboutHtml ? undefined : "Share your local knowledge, process, and the people you serve."}</div></label>
      <label><span>Public contact email</span><input type="email" value={contactEmail} onChange={(event) => setContactEmail(event.currentTarget.value)} /></label>
      <label><span>Public phone</span><input maxLength={40} value={contactPhone} onChange={(event) => setContactPhone(event.currentTarget.value)} /></label><label><span>Career strengths</span><input maxLength={800} value={strengths} onChange={(event) => setStrengths(event.currentTarget.value)} /></label>
      <button className="solid-button" type="submit">Save website</button>
    </form>
    <form action={uploadSiteAssetAction} className="stack-form site-asset-upload" data-prompt-title="Save this website image?" data-prompt-message="It will be compressed to WebP, stripped of metadata, stored privately, and displayed only through SteadFast." data-prompt-confirm="Save image">
      <input type="hidden" name="siteId" value={site.id} /><input type="hidden" name="placement" value={site.site_type === "brokerage" ? "brokerage_logo" : "profile_photo"} />
      <label className="site-file-picker"><span>{site.site_type === "brokerage" ? "Brokerage logo" : "Professional photo"}</span><input className="site-file-input" name="asset" type="file" accept="image/jpeg,image/png,image/webp" onChange={compress} required /><span className="site-file-picker-row"><span className="site-file-picker-button">Choose file</span><span className="site-file-name">{selectedFileName || "No file chosen"}</span></span></label>{imageError ? <p className="form-error" role="alert">{imageError}</p> : null}<ImageUploadButton />
    </form>
  </section>;
}
