import { AccountHeader } from "@/app/components/account-header";
import { ConsumerAccountNav } from "@/app/components/consumer-account-nav";
import { getActiveMembershipContext } from "@/lib/auth/session";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";
export const metadata = { title: "Message center", robots: { index: false, follow: false } };

export default async function MessagesPage() {
  const context = await getActiveMembershipContext("/account/messages");
  const admin = createAdminClient();
  const { data: messages } = await admin.from("consumer_messages").select("id,sender_label,subject,body_safe,read_at,created_at").eq("recipient_person_id", context.person.id).is("deleted_at", null).order("created_at", { ascending: false }).limit(50);
  return <main className="account-page"><AccountHeader displayName={context.person.display_name} isConsumer={!context.membership} />
    <section className="account-hero compact"><span className="eyebrow"><i /> Private correspondence</span><h1>Message center</h1><p>Messages from ProperAP administrators and property professionals appear here.</p></section>
    <div className="account-settings-layout consumer-account-layout"><ConsumerAccountNav active="messages" /><section className="consumer-account-shell"><div className="consumer-page-heading"><span>Inbox</span><h2>{messages?.length ?? 0} messages</h2></div>{messages?.length ? <div className="consumer-message-list">{messages.map((message) => <article className={message.read_at ? "" : "unread"} key={message.id}><header><strong>{message.sender_label}</strong><time>{new Intl.DateTimeFormat("en-JM", { dateStyle: "medium" }).format(new Date(message.created_at))}</time></header><h2>{message.subject}</h2><p>{message.body_safe}</p></article>)}</div> : <section className="account-card"><h2>Your inbox is clear</h2><p>When an administrator or agent sends you a private message, it will appear here and you will see it on the notification bell.</p></section>}</section></div>
  </main>;
}
