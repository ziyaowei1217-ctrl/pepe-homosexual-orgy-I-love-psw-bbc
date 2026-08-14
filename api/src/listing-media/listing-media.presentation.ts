export type ListingMediaPresentationSource = {
  id: string;
  storageStatus: string;
  url: unknown;
  originalKey: unknown;
  processedKey: unknown;
  publicMainKey: unknown;
  publicThumbnailKey: unknown;
};

export function presentListingMedia<T extends ListingMediaPresentationSource>(media: T) {
  const {
    url: _url,
    originalKey: _originalKey,
    processedKey: _processedKey,
    publicMainKey: _publicMainKey,
    publicThumbnailKey: _publicThumbnailKey,
    ...response
  } = media;

  return media.storageStatus === "PUBLISHED"
    ? { ...response, contentUrl: `/api/v1/listing-media/${media.id}/content` }
    : response;
}
