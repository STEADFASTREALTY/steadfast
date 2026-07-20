"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { updateInquiryStatusAction } from "@/app/actions/inquiries";

export type AgentInquiry = {
  id: string;
  listingId: string;
  listingTitle: string;
  listingLocation: string;
  requesterName: string;
  requesterEmail: string;
  requesterPhone: string | null;
  contactPreference: string;
  message: string;
  status: "new" | "in_progress" | "closed";
  createdAt: string;
};

type InquiryFilter = "all" | "new" | "in_progress" | "closed";
const PAGE_SIZE = 10;

function formatInquiryTime(value: string) {
  return new Intl.DateTimeFormat("en-JM", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "America/Jamaica",
  }).format(new Date(value));
}

export function InquiryInbox({ inquiries }: { inquiries: AgentInquiry[] }) {
  const [filter, setFilter] = useState<InquiryFilter>("all");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const filtered = useMemo(() => {
    const query = search.trim().toLocaleLowerCase();
    return inquiries.filter((inquiry) => {
      const inFolder = filter === "all" || inquiry.status === filter;
      const searchable = [inquiry.requesterName, inquiry.requesterEmail, inquiry.listingTitle, inquiry.listingLocation, inquiry.message].join(" ").toLocaleLowerCase();
      return inFolder && (!query || searchable.includes(query));
    });
  }, [filter, inquiries, search]);
  const folders: Array<{ key: InquiryFilter; label: string; count: number }> = [
    { key: "all", label: "Inbox", count: inquiries.length },
    { key: "new", label: "New", count: inquiries.filter((inquiry) => inquiry.status === "new").length },
    { key: "in_progress", label: "In progress", count: inquiries.filter((inquiry) => inquiry.status === "in_progress").length },
    { key: "closed", label: "Closed", count: inquiries.filter((inquiry) => inquiry.status === "closed").length },
  ];
  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const currentPage = Math.min(page, pageCount);
  const visibleInquiries = filtered.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);
  const firstVisible = filtered.length ? ((currentPage - 1) * PAGE_SIZE) + 1 : 0;
  const lastVisible = Math.min(currentPage * PAGE_SIZE, filtered.length);

  return <section className="notification-inbox inquiry-inbox">
    <aside className="notification-folders" aria-label="Inquiry folders">
      <strong>Mailboxes</strong>
      {folders.map((folder) => <button className={filter === folder.key ? "active" : ""} key={folder.key} onClick={() => { setFilter(folder.key); setPage(1); }} type="button"><span>{folder.label}</span><b>{folder.count}</b></button>)}
    </aside>
    <div className="notification-mailbox">
      <div className="notification-mailbox-toolbar">
        <div><span>{folders.find((folder) => folder.key === filter)?.label}</span><strong>{filtered.length ? `${firstVisible}–${lastVisible} of ${filtered.length}` : "0"} message{filtered.length === 1 ? "" : "s"}</strong></div>
        {filter !== "all" || search.trim() ? <button className="text-button notification-clear-filter" onClick={() => { setFilter("all"); setSearch(""); setPage(1); }} type="button">Clear filters</button> : null}
      </div>
      <label className="notification-search"><span>Search inquiries</span><input value={search} onChange={(event) => { setSearch(event.target.value); setPage(1); }} placeholder="Search buyer, property, or message" type="search" /></label>
      {visibleInquiries.length ? <div className="notification-list inquiry-mail-list">
        {visibleInquiries.map((inquiry) => <article className={inquiry.status === "new" ? "unread" : ""} key={inquiry.id}>
          <div className="notification-avatar" aria-hidden="true">{inquiry.requesterName.slice(0, 1).toUpperCase()}</div>
          <div className="notification-message">
            <div className="notification-message-heading"><span>{inquiry.requesterName} · {inquiry.requesterEmail}</span><time>{formatInquiryTime(inquiry.createdAt)}</time></div>
            <h2>{inquiry.listingTitle}</h2>
            <p>{inquiry.message}</p>
            <div className="inquiry-mail-details"><span>{inquiry.listingLocation}</span><span>{inquiry.requesterPhone ?? "No phone provided"}</span><span>Reply by {inquiry.contactPreference.replaceAll("_", " ")}</span></div>
          </div>
          <div className="notification-actions inquiry-mail-actions">
            <Link className="outline-dark-button" href={`/properties/${inquiry.listingId}`} target="_blank">Open property</Link>
            {inquiry.status === "new" ? <form action={updateInquiryStatusAction} data-prompt-title="Start following up?" data-prompt-message="This inquiry will move to your In progress folder." data-prompt-confirm="Start follow-up"><input name="inquiryId" type="hidden" value={inquiry.id} /><button className="solid-button" name="operation" value="claim" type="submit">Start follow-up</button></form> : null}
            {inquiry.status === "in_progress" ? <form action={updateInquiryStatusAction} data-prompt-title="Close this inquiry?" data-prompt-message="The message will remain in your private Closed folder." data-prompt-confirm="Close inquiry"><input name="inquiryId" type="hidden" value={inquiry.id} /><button className="solid-button" name="operation" value="close" type="submit">Close inquiry</button></form> : null}
            {inquiry.status === "closed" ? <form action={updateInquiryStatusAction} data-prompt-title="Reopen this inquiry?" data-prompt-message="The message will return to your In progress folder." data-prompt-confirm="Reopen inquiry"><input name="inquiryId" type="hidden" value={inquiry.id} /><button className="outline-dark-button" name="operation" value="reopen" type="submit">Reopen inquiry</button></form> : null}
          </div>
        </article>)}
        {pageCount > 1 ? <nav aria-label="Inquiry pages" className="notification-pagination"><button disabled={currentPage === 1} onClick={() => setPage((value) => Math.max(1, value - 1))} type="button">Previous</button><span>Page {currentPage} of {pageCount}</span><button disabled={currentPage === pageCount} onClick={() => setPage((value) => Math.min(pageCount, value + 1))} type="button">Next</button></nav> : null}
      </div> : <div className="listing-empty"><span>Inbox</span><h2>No matching inquiries.</h2><p>New buyer messages sent to you will appear here.</p></div>}
    </div>
  </section>;
}
