import type { Metadata } from "next";
import { ImportClient } from "./import-client";

export const metadata: Metadata = { title: "Import customers — OzShine Staff" };

export default function ImportPage() {
  return <ImportClient />;
}
