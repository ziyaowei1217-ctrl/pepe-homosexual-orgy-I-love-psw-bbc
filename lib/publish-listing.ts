export type PublishStep = "basic" | "media" | "pricing" | "review";

export type PublishMedia = {
  url: string;
  kind: string;
};

export type PublishDraft = {
  title: string;
  area: string;
  beds: number;
  baths: number;
  commute: string;
  transit: string;
  media: PublishMedia[];
  price: number;
  originalPrice: number;
  tags: string[];
  landlordAware: boolean;
  remoteListingId: string | null;
  uploadedMediaUrls: string[];
};

export type ListingDto = {
  title: string;
  area: string;
  image: string;
  price: number;
  originalPrice: number;
  beds: number;
  baths: number;
  commute: string;
  transit: string;
  trust: string;
  tags: string[];
  score: number;
};

export type PublishSaveResult = {
  status: "saved" | "partial" | "submitted";
  remoteListingId: string;
  uploadedMediaUrls: string[];
  message: string;
};

type PublishAdapter = {
  create: (dto: ListingDto) => Promise<{ id: string }>;
  update: (id: string, dto: ListingDto) => Promise<unknown>;
  addMedia: (
    id: string,
    media: { url: string; kind: string; sortOrder: number }
  ) => Promise<unknown>;
  submit: (id: string) => Promise<unknown>;
};

export function getPublishStepErrors(draft: PublishDraft, step: PublishStep) {
  const errors: string[] = [];

  if (step === "basic" || step === "review") {
    if (!draft.title.trim()) errors.push("请填写房源标题。");
    if (!draft.area.trim()) errors.push("请填写房源区域。");
    if (!Number.isInteger(draft.beds) || draft.beds < 0) errors.push("请填写有效卧室数。");
    if (!Number.isInteger(draft.baths) || draft.baths < 0) errors.push("请填写有效卫浴数。");
    if (!draft.commute.trim()) errors.push("请填写通勤说明。");
    if (!draft.transit.trim()) errors.push("请填写交通说明。");
  }

  if (step === "media" || step === "review") {
    if (draft.media.length === 0) errors.push("请至少添加一张图片 URL。");
    if (draft.media.some((item) => !isHttpUrl(item.url))) errors.push("请检查图片 URL。");
    if (draft.media.some((item) => !item.kind.trim())) errors.push("请为每张图片选择分类。");
  }

  if (step === "pricing" || step === "review") {
    if (!Number.isInteger(draft.price) || draft.price < 1) errors.push("请填写有效月租。");
    if (!Number.isInteger(draft.originalPrice) || draft.originalPrice < 1) errors.push("请填写有效原价。");
    if (draft.tags.length === 0) errors.push("请至少选择一项设施。");
    if (!draft.landlordAware) errors.push("请确认房东知情声明。");
  }

  return Array.from(new Set(errors));
}

export function mapPublishDraftToListingDto(draft: PublishDraft): ListingDto {
  const tags = Array.from(
    new Set([
      ...draft.tags.map((tag) => tag.trim()).filter(Boolean),
      ...(draft.landlordAware ? ["房东知情"] : [])
    ])
  );

  return {
    title: draft.title.trim(),
    area: draft.area.trim(),
    image: draft.media[0]?.url.trim() ?? "",
    price: draft.price,
    originalPrice: draft.originalPrice,
    beds: draft.beds,
    baths: draft.baths,
    commute: draft.commute.trim(),
    transit: draft.transit.trim(),
    trust: draft.landlordAware
      ? "房东知情声明 · 待平台审核"
      : "用户未声明 · 待平台审核",
    tags,
    score: 4.8
  };
}

export function mapApiListingToPublishDraft(listing: ApiListing): PublishDraft {
  const orderedMedia = listing.media?.length
    ? [...listing.media].sort((left, right) => left.sortOrder - right.sortOrder)
    : [];
  const media = orderedMedia.length
    ? orderedMedia.map((item) => ({
          url: item.url,
          kind: item.kind
        }))
    : listing.image
      ? [{ url: listing.image, kind: "卧室" }]
      : [{ url: "", kind: "卧室" }];
  const uploadedMediaUrls = orderedMedia.map((item) => item.url);

  return {
    title: listing.title,
    area: listing.area,
    beds: listing.beds,
    baths: listing.baths,
    commute: listing.commute,
    transit: listing.transit,
    media,
    price: listing.price,
    originalPrice: listing.originalPrice,
    tags: listing.tags.filter((tag) => tag !== "房东知情"),
    landlordAware:
      listing.tags.includes("房东知情") ||
      listing.trust.includes("房东知情"),
    remoteListingId: listing.id,
    uploadedMediaUrls
  };
}

export async function executePublishSave(
  draft: PublishDraft,
  adapter: PublishAdapter,
  shouldSubmit: boolean
): Promise<PublishSaveResult> {
  const dto = mapPublishDraftToListingDto(draft);
  let remoteListingId = draft.remoteListingId;
  const uploadedMediaUrls = [...draft.uploadedMediaUrls];

  if (remoteListingId) {
    await adapter.update(remoteListingId, dto);
  } else {
    const created = await adapter.create(dto);
    remoteListingId = created.id;
  }

  for (const [index, media] of draft.media.entries()) {
    if (uploadedMediaUrls.includes(media.url)) continue;

    try {
      await adapter.addMedia(remoteListingId, {
        url: media.url,
        kind: media.kind,
        sortOrder: index
      });
      uploadedMediaUrls.push(media.url);
    } catch {
      return {
        status: "partial",
        remoteListingId,
        uploadedMediaUrls,
        message: "草稿已保存，部分图片尚未上传。请重试。"
      };
    }
  }

  if (shouldSubmit) {
    try {
      await adapter.submit(remoteListingId);
    } catch {
      return {
        status: "partial",
        remoteListingId,
        uploadedMediaUrls,
        message: "草稿已保存，提交审核失败。请重试。"
      };
    }
    return {
      status: "submitted",
      remoteListingId,
      uploadedMediaUrls,
      message: "房源已提交审核。"
    };
  }

  return {
    status: "saved",
    remoteListingId,
    uploadedMediaUrls,
    message: "草稿已保存。"
  };
}

function isHttpUrl(value: string) {
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}
import type { ApiListing } from "./api";
