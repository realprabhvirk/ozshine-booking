import type { Metadata } from "next";
import { UiGallery } from "./ui-gallery";

export const metadata: Metadata = { title: "UI kit — OzShine Staff" };

// Internal reference page for the V2 building blocks. Not linked from the
// menu; open /ui on a preview to check how everything looks in both themes.
export default function UiPage() {
  return <UiGallery />;
}
