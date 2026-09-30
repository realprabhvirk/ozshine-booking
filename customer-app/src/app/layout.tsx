import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import { ToastProvider } from "@/components/ui/toast";
import { siteUrl } from "@/lib/site";
import "./globals.css";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800"],
});

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl()),
  title: {
    default: "OzShine Hand Car Wash Beenleigh — Book online",
    template: "%s · OzShine Beenleigh",
  },
  description:
    "Hand car wash, polish and detailing in Beenleigh, QLD. See real prices for your vehicle and book a time online in under a minute. No account needed.",
  alternates: { canonical: "/" },
  openGraph: {
    type: "website",
    locale: "en_AU",
    siteName: "OzShine Hand Car Wash",
    title: "OzShine Hand Car Wash Beenleigh",
    description: "Hand car wash and detailing in Beenleigh. Book online in under a minute.",
  },
  robots: { index: true, follow: true },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#0b0c0e",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en-AU" className={`${inter.variable} antialiased`}>
      <body className="bg-canvas text-fg">
        <ToastProvider>{children}</ToastProvider>
      </body>
    </html>
  );
}
