import { SubNav } from "@/components/shell/sub-nav";

const TABS = [
  { href: "/messages", label: "Sent messages" },
  { href: "/messages/campaigns", label: "Campaigns" },
  { href: "/messages/automations", label: "Automatic messages" },
  { href: "/messages/templates", label: "Wording" },
  { href: "/messages/feedback", label: "Feedback & reviews" },
  { href: "/messages/setup", label: "Setup" },
];

export default function MessagesLayout({ children }: LayoutProps<"/messages">) {
  return (
    <div className="mx-auto max-w-[1300px]">
      <h1 className="mb-4 text-2xl font-bold tracking-tight">Messages</h1>
      <SubNav label="Messages" tabs={TABS} exact="/messages" />
      {children}
    </div>
  );
}
