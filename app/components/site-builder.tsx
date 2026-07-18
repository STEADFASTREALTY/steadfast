"use client";

import { useEffect, useRef, useState } from "react";
import { useFormStatus } from "react-dom";
import { createSiteTestimonialAction, removeSiteTestimonialAction, saveSiteBuilderAction, updateSiteTestimonialAction, uploadSiteAssetAction } from "@/app/actions/site-builder";
import { compressListingImage } from "@/lib/media/client-image-compression";

const labels: Record<string, string> = { hero: "Hero", about: "About", search: "Property search", listings: "Listings", testimonials: "Testimonials", contact: "Contact" };
const allSections = ["hero", "about", "search", "listings", "testimonials", "contact"];
type Site = { id: string; site_type: string; display_name: string; slug: string; theme: Record<string, unknown> | null; layout: Record<string, unknown> | null; content: Record<string, unknown> | null };
type SiteTheme = { primary: string; accent: string; background: string; text: string };
type Testimonial = { id: string; author_name: string; author_context: string | null; quote: string; asset_id: string | null; position: number; created_at: string };
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

function AddTestimonialButton() {
  const { pending } = useFormStatus();
  return <button className="solid-button full" type="submit" disabled={pending} aria-busy={pending}>
    {pending ? <><span className="button-spinner" aria-hidden="true" />Adding testimonial…</> : "Add testimonial"}
  </button>;
}

export function SiteBuilder({ site, testimonials }: { site: Site; testimonials: Testimonial[] }) {
  const savedOrder = Array.isArray(site.layout?.sectionOrder) ? site.layout.sectionOrder.filter((value): value is string => allSections.includes(String(value))) : allSections;
  const [order, setOrder] = useState(savedOrder.length === allSections.length ? savedOrder : allSections);
  const [aboutHtml, setAboutHtml] = useState(String(site.content?.aboutHtml ?? ""));
  const [contactEmail, setContactEmail] = useState(String(site.content?.contactEmail ?? ""));
  const [contactPhone, setContactPhone] = useState(String(site.content?.contactPhone ?? ""));
  const [strengths, setStrengths] = useState(String(site.content?.strengths ?? ""));
  const [imageError, setImageError] = useState("");
  const [selectedFileName, setSelectedFileName] = useState("");
  const [heroFileName, setHeroFileName] = useState("");
  const [testimonialFileName, setTestimonialFileName] = useState("");
  const [editingTestimonial, setEditingTestimonial] = useState<Testimonial | null>(null);
  const [editTestimonialFileName, setEditTestimonialFileName] = useState("");
  const editor = useRef<HTMLDivElement>(null);
  const initialized = useRef(false);
  useEffect(() => { if (editor.current && !initialized.current) { editor.current.innerHTML = aboutHtml; initialized.current = true; } }, [aboutHtml]);
  const theme = site.theme ?? {};
  const [siteTheme, setSiteTheme] = useState<SiteTheme>(() => ({ primary: String(theme.primary ?? "#102C2A"), accent: String(theme.accent ?? "#D8A72E"), background: String(theme.background ?? "#FBFAF6"), text: String(theme.text ?? "#17201C") }));
  const move = (index: number, change: number) => setOrder((current) => { const next = [...current]; const target = index + change; if (target < 0 || target >= next.length) return current; [next[index], next[target]] = [next[target], next[index]]; return next; });
  const format = (command: string, value?: string) => { editor.current?.focus(); document.execCommand(command, false, value); setAboutHtml(editor.current?.innerHTML ?? ""); };
  const toggleFormat = (kind: "heading" | "serif" | "large" | "teal") => {
    editor.current?.focus();
    const value = String(kind === "heading" ? document.queryCommandValue("formatBlock") : kind === "serif" ? document.queryCommandValue("fontName") : kind === "large" ? document.queryCommandValue("fontSize") : document.queryCommandValue("foreColor")).toLowerCase();
    if (kind === "heading") document.execCommand("formatBlock", false, value.includes("h2") ? "p" : "h2");
    if (kind === "serif") document.execCommand("fontName", false, value.includes("georgia") ? "Arial" : "Georgia");
    if (kind === "large") document.execCommand("fontSize", false, value === "5" ? "3" : "5");
    if (kind === "teal") document.execCommand("foreColor", false, value.includes("168c91") || value.includes("22, 140, 145") ? "#17201C" : "#168C91");
    setAboutHtml(editor.current?.innerHTML ?? "");
  };
  const compress = async (event: React.ChangeEvent<HTMLInputElement>) => { const selected = event.target.files?.[0]; if (!selected) return; try { const compressed = await compressListingImage(selected); const transfer = new DataTransfer(); transfer.items.add(compressed); event.target.files = transfer.files; setSelectedFileName(selected.name); setImageError(""); } catch { event.target.value = ""; setSelectedFileName(""); setImageError("Choose a clear still image at least 300 pixels wide and high."); } };
  const compressTestimonial = async (event: React.ChangeEvent<HTMLInputElement>, setFileName: (value: string) => void) => { const selected = event.target.files?.[0]; if (!selected) return; try { const compressed = await compressListingImage(selected); const transfer = new DataTransfer(); transfer.items.add(compressed); event.target.files = transfer.files; setFileName(selected.name); setImageError(""); } catch { event.target.value = ""; setFileName(""); setImageError("Choose a clear still image at least 300 pixels wide and high."); } };
  return <section className="account-card site-builder-card">
    <div className="card-heading"><span>{site.site_type === "brokerage" ? "Broker's website" : "Agent's website"}</span><h2>{site.display_name}</h2></div>
    <p>Arrange sections, write your story, and choose a color system. Changes are saved only when you confirm below.</p>
    <form id={`site-builder-save-${site.id}`} action={saveSiteBuilderAction} className="stack-form" data-prompt-title="Publish these website changes?" data-prompt-message="Your professional website layout, palette, and public content will update for visitors." data-prompt-confirm="Save website">
      <input type="hidden" name="siteId" value={site.id} /><input type="hidden" name="sectionOrder" value={JSON.stringify(order)} /><input type="hidden" name="content" value={JSON.stringify({ aboutHtml, contactEmail, contactPhone, strengths })} />
      <div className="site-section-order"><span>Page sections — drag is supported; the arrows work on every device.</span>{order.map((section, index) => <div key={section} draggable onDragStart={(event) => event.dataTransfer.setData("text/plain", section)} onDragOver={(event) => event.preventDefault()} onDrop={(event) => { const dragged = event.dataTransfer.getData("text/plain"); const from = order.indexOf(dragged); if (from >= 0) { const next = [...order]; next.splice(from, 1); next.splice(index, 0, dragged); setOrder(next); } }}><strong>⠿ {labels[section]}</strong><div><button type="button" aria-label={`Move ${labels[section]} up`} onClick={() => move(index, -1)}>↑</button><button type="button" aria-label={`Move ${labels[section]} down`} onClick={() => move(index, 1)}>↓</button></div></div>)}</div>
      <fieldset className="theme-editor"><legend>Your color palette</legend><p className="theme-editor-help">Choose the color for each part of your public website. Changes stay in this form until you save the website.</p>{themeFields.filter(({ key }) => site.site_type === "brokerage" || key !== "primary").map(({ key, label, help }) => <label key={key}><span>{label}</span><input type="color" name={`theme-${key}`} value={siteTheme[key]} onChange={(event) => setSiteTheme((current) => ({ ...current, [key]: event.target.value }))} /><small>{help}</small></label>)}<input type="hidden" name="theme" value={JSON.stringify(siteTheme)} readOnly /></fieldset>
      <label><span>About your service</span><div className="rich-toolbar" aria-label="Text formatting"><button type="button" onClick={() => format("bold")}>Bold</button><button type="button" onClick={() => format("insertUnorderedList")}>Bullets</button><button type="button" onClick={() => toggleFormat("heading")}>Heading</button><button type="button" onClick={() => toggleFormat("serif")}>Serif</button><button type="button" onClick={() => toggleFormat("large")}>Large</button><button type="button" onClick={() => toggleFormat("teal")}>Teal</button></div><div ref={editor} className="rich-editor" contentEditable suppressContentEditableWarning onInput={(event) => setAboutHtml(event.currentTarget.innerHTML)}>{site.content?.aboutHtml ? undefined : "Share your local knowledge, process, and the people you serve."}</div></label>
      <label><span>Public contact email</span><input type="email" value={contactEmail} onChange={(event) => setContactEmail(event.currentTarget.value)} /></label>
      <label><span>Public phone</span><input maxLength={40} value={contactPhone} onChange={(event) => setContactPhone(event.currentTarget.value)} /></label><label><span>Career strengths</span><input maxLength={800} value={strengths} onChange={(event) => setStrengths(event.currentTarget.value)} /></label>
    </form>
    {site.site_type === "agent" ? <section className="site-asset-section agent-hero-background-upload"><div className="card-heading"><span>Agent website banner</span><h2>Ocean-view background</h2></div><p>The included Jamaica ocean view is the default. To use your own, upload a wide JPEG, PNG, or WebP image at <strong>2400 × 800 pixels</strong> (3:1). Files must be at least 1500 × 500 pixels and under 5 MB.</p><form action={uploadSiteAssetAction} className="stack-form site-asset-upload" data-prompt-title="Save this agent website background?" data-prompt-message="It will be compressed to WebP, stripped of metadata, and replace the default ocean-view banner on your agent website." data-prompt-confirm="Save background image"><input type="hidden" name="siteId" value={site.id} /><input type="hidden" name="placement" value="hero_background" /><label className="site-file-picker"><span>Background image</span><input className="site-file-input" name="asset" type="file" accept="image/jpeg,image/png,image/webp" onChange={(event) => void compressTestimonial(event, setHeroFileName)} required /><span className="site-file-picker-row"><span className="site-file-picker-button">Choose file</span><span className="site-file-name">{heroFileName || "No file chosen"}</span></span></label><ImageUploadButton /></form></section> : null}
    <section className="testimonial-builder">
      <div className="card-heading"><span>Client stories</span><h2>Testimonials</h2></div>
      <p>Add up to ten client testimonials. Each one rotates on the public {site.site_type === "brokerage" ? "brokerage" : "agent"} website.</p>
      <form action={createSiteTestimonialAction} className="stack-form testimonial-form" data-prompt-title="Add this testimonial?" data-prompt-message="This client story will appear publicly on your professional website after it is saved." data-prompt-confirm="Add testimonial">
        <input type="hidden" name="siteId" value={site.id} />
        <label className="full"><span>Client name</span><input name="authorName" required maxLength={120} /></label>
        <label className="full"><span>Testimonial</span><textarea name="quote" required minLength={10} maxLength={1200} rows={4} placeholder="Write the client’s testimonial exactly as approved for public display." /></label>
        <label className="site-file-picker full"><span>Optional client photo</span><input className="site-file-input" name="testimonialAsset" type="file" accept="image/jpeg,image/png,image/webp" onChange={(event) => void compressTestimonial(event, setTestimonialFileName)} /><span className="site-file-picker-row"><span className="site-file-picker-button">Choose file</span><span className="site-file-name">{testimonialFileName || "No file chosen"}</span></span></label>
        <AddTestimonialButton />
      </form>
      {testimonials.length ? <div className="testimonial-records"><table><thead><tr><th>Client name</th><th>Date</th><th>Image</th><th><span className="sr-only">Edit</span></th><th><span className="sr-only">Delete</span></th></tr></thead><tbody>{testimonials.map((testimonial) => <tr key={testimonial.id}><td>{testimonial.author_name}</td><td>{new Intl.DateTimeFormat("en-JM", { day: "numeric", month: "short", year: "numeric" }).format(new Date(testimonial.created_at))}</td><td><span className={`image-status ${testimonial.asset_id ? "has-image" : "no-image"}`} title={testimonial.asset_id ? "Image uploaded" : "No image uploaded"} aria-label={testimonial.asset_id ? "Image uploaded" : "No image uploaded"}>{testimonial.asset_id ? "✓" : "×"}</span></td><td><button className="icon-action" type="button" aria-label={`Edit testimonial from ${testimonial.author_name}`} title="Edit testimonial" onClick={() => { setEditingTestimonial(testimonial); setEditTestimonialFileName(""); }}>✎</button></td><td><form action={removeSiteTestimonialAction} data-prompt-title="Remove this testimonial?" data-prompt-message="It will no longer appear on the public website." data-prompt-confirm="Delete testimonial" data-prompt-variant="danger"><input type="hidden" name="siteId" value={site.id} /><input type="hidden" name="testimonialId" value={testimonial.id} /><button className="icon-action delete" type="submit" aria-label={`Delete testimonial from ${testimonial.author_name}`} title="Delete testimonial">⌫</button></form></td></tr>)}</tbody></table></div> : null}
    </section>
    <section className="site-asset-section">
      <div className="card-heading"><span>Professional presence</span><h2>{site.site_type === "brokerage" ? "Brokerage logo" : "Professional photo"}</h2></div>
      <p>Choose the image visitors see on your public {site.site_type === "brokerage" ? "brokerage" : "agent"} website.</p>
      <form action={uploadSiteAssetAction} className="stack-form site-asset-upload" data-prompt-title="Save this website image?" data-prompt-message="It will be compressed to WebP, stripped of metadata, stored privately, and displayed only through SteadFast." data-prompt-confirm="Save image">
        <input type="hidden" name="siteId" value={site.id} /><input type="hidden" name="placement" value={site.site_type === "brokerage" ? "brokerage_logo" : "profile_photo"} />
        <label className="site-file-picker"><span>Choose image</span><input className="site-file-input" name="asset" type="file" accept="image/jpeg,image/png,image/webp" onChange={compress} required /><span className="site-file-picker-row"><span className="site-file-picker-button">Choose file</span><span className="site-file-name">{selectedFileName || "No file chosen"}</span></span></label>{imageError ? <p className="form-error" role="alert">{imageError}</p> : null}<ImageUploadButton />
      </form>
    </section>
    <button className="solid-button site-builder-save" form={`site-builder-save-${site.id}`} type="submit">Save website</button>
    {editingTestimonial ? <div className="testimonial-modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setEditingTestimonial(null); }}><section className="testimonial-modal" role="dialog" aria-modal="true" aria-labelledby="edit-testimonial-title"><div className="card-heading"><span>Client story</span><h2 id="edit-testimonial-title">Edit testimonial</h2></div><form action={updateSiteTestimonialAction} className="stack-form testimonial-form" data-prompt-title="Save testimonial changes?" data-prompt-message="The revised client story will update on the public website." data-prompt-confirm="Save changes"><input type="hidden" name="siteId" value={site.id} /><input type="hidden" name="testimonialId" value={editingTestimonial.id} /><label className="full"><span>Client name</span><input name="authorName" required maxLength={120} defaultValue={editingTestimonial.author_name} /></label><label className="full"><span>Testimonial</span><textarea name="quote" required minLength={10} maxLength={1200} rows={4} defaultValue={editingTestimonial.quote} /></label><label className="site-file-picker full"><span>Replace client photo (optional)</span><input className="site-file-input" name="testimonialAsset" type="file" accept="image/jpeg,image/png,image/webp" onChange={(event) => void compressTestimonial(event, setEditTestimonialFileName)} /><span className="site-file-picker-row"><span className="site-file-picker-button">Choose file</span><span className="site-file-name">{editTestimonialFileName || (editingTestimonial.asset_id ? "Current image kept" : "No file chosen")}</span></span></label><div className="testimonial-modal-actions full"><button className="outline-dark-button" type="button" onClick={() => setEditingTestimonial(null)}>Cancel</button><button className="solid-button" type="submit">Save</button></div></form></section></div> : null}
  </section>;
}
