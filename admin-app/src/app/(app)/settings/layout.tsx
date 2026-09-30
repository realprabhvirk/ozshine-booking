import { SubNav } from "@/components/shell/sub-nav";

const TABS = [
  { href: "/settings", label: "Business" },
  { href: "/settings/hours", label: "Hours & booking" },
  { href: "/settings/services", label: "Services & prices" },
  { href: "/settings/extras", label: "Extras & bays" },
  { href: "/settings/closures", label: "Closures" },
  { href: "/settings/rewards", label: "Promos & loyalty" },
  { href: "/settings/tv", label: "Shop TV" },
  { href: "/settings/audit", label: "Audit log" },
];

export default function SettingsLayout({ children }: LayoutProps<"/settings">) {
  return (
    <div className="mx-auto max-w-[1300px]">
      <h1 className="mb-4 text-2xl font-bold tracking-tight">Settings</h1>
      <SubNav label="Settings" tabs={TABS} exact="/settings" />
      {children}
    </div>
  );
}
