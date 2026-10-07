import NextLink from "next/link";
import type { ComponentProps } from "react";

import { canBrowseWebsiteDemo, isWebsiteDemo } from "@/lib/website-demo";
import { websiteDemoSectionForPath } from "@/lib/website-demo-navigation";
import { canonicalWebsitePath } from "@/lib/website-static-path";

export type AppLinkProps = ComponentProps<typeof NextLink>;

export default function AppLink(props: AppLinkProps) {
  if (!isWebsiteDemo() || typeof props.href !== "string" || props.as !== undefined || props.legacyBehavior) {
    return <NextLink {...props} />;
  }

  const pathname = props.href.split(/[?#]/, 1)[0];
  if (canonicalWebsitePath(pathname) !== pathname || canBrowseWebsiteDemo(pathname) || !websiteDemoSectionForPath(pathname)) {
    return <NextLink {...props} />;
  }

  // Closed demo sections cross documents, so Back after a reload does not
  // depend on the new page's App Router history listener being hydrated.
  const { href, ...anchorProps } = props;
  for (const name of ["as", "replace", "scroll", "shallow", "passHref", "prefetch", "unstable_dynamicOnHover", "locale", "legacyBehavior", "onNavigate"]) {
    Reflect.deleteProperty(anchorProps, name);
  }
  return <a {...anchorProps} href={href} data-website-demo-navigation="document" />;
}
