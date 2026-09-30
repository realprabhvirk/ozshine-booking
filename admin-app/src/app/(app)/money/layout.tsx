import { MoneyNav } from "./money-nav";

export default function MoneyLayout({ children }: LayoutProps<"/money">) {
  return (
    <div className="mx-auto max-w-[1400px]">
      <h1 className="mb-4 text-2xl font-bold tracking-tight print:hidden">Money</h1>
      <MoneyNav />
      {children}
    </div>
  );
}
