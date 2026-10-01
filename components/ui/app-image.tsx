import NextImage, { type ImageProps } from "next/image";

import { isFirstPartyListingMedia } from "@/lib/listing-image-policy";

export default function Image(props: ImageProps) {
  const directMedia = isFirstPartyListingMedia(props.src);
  return <NextImage {...props} unoptimized={directMedia || props.unoptimized} />;
}
