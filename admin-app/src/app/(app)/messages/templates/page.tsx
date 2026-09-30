import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import { errorMessage } from "@/lib/core/errors";
import { fetchTemplates } from "@/lib/shop/messages";
import { Notice } from "@/components/ui/feedback";
import { TemplatesEditor } from "./templates-editor";

export const metadata: Metadata = { title: "Message wording — OzShine Staff" };

export default async function TemplatesPage() {
  const supabase = await createClient();
  let templates;
  try {
    templates = await fetchTemplates(supabase);
  } catch (e) {
    return <Notice tone="bad" title="Couldn't load message wording">{errorMessage(e)}</Notice>;
  }
  return <TemplatesEditor templates={templates} />;
}
