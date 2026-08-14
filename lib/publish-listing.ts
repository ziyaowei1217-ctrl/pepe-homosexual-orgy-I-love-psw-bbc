export type PublishStep = "basic" | "media" | "pricing" | "review";

export type PublishDraft = {
  title: string;
  area: string;
  availableFrom: string;
  availableTo: string;
  beds: number;
  baths: number;
  commute: string;
  transit: string;
  price: number;
  originalPrice: number;
  tags: string[];
  landlordAware: boolean;
  remoteListingId: string | null;
};

export type ListingDto = {
  title: string;
  area: string;
  availableFrom: string;
  availableTo: string;
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
  message: string;
};

type PublishAdapter = {
  create: (dto: ListingDto) => Promise<{ id: string }>;
  update: (id: string, dto: ListingDto) => Promise<unknown>;
  submit: (id: string) => Promise<unknown>;
};

export function getPublishStepErrors(
  draft: PublishDraft,
  step: PublishStep,
  mediaSummary?: import("./listing-media").ListingMediaSummary
) {
  const errors: string[] = [];

  if (step === "basic" || step === "review") {
    if (!draft.title.trim()) errors.push("请填写房源标题。");
    if (!draft.area.trim()) errors.push("请填写房源区域。");
    if (!draft.availableFrom) errors.push("请选择可入住日期。");
    if (!draft.availableTo) errors.push("请选择最晚退租日期。");
    if (
      draft.availableFrom &&
      draft.availableTo &&
      draft.availableTo <= draft.availableFrom
    ) {
      errors.push("最晚退租日期必须晚于可入住日期。");
    }
    if (!Number.isInteger(draft.beds) || draft.beds < 0) errors.push("请填写有效卧室数。");
    if (!Number.isInteger(draft.baths) || draft.baths < 0) errors.push("请填写有效卫浴数。");
    if (!draft.commute.trim()) errors.push("请填写通勤说明。");
    if (!draft.transit.trim()) errors.push("请填写交通说明。");
  }

  if (step === "media" || step === "review") {
    if (!mediaSummary || mediaSummary.totalCount === 0 || mediaSummary.readyCount === 0) {
      errors.push("请至少上传一张图片。");
    }
    if (mediaSummary && (mediaSummary.pendingCount > 0 || mediaSummary.mutationPending)) {
      errors.push("请等待所有图片完成上传和校验。");
    }
    if (mediaSummary && mediaSummary.failedCount > 0) {
      errors.push("请删除失败图片或重试上传。");
    }
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
    availableFrom: draft.availableFrom,
    availableTo: draft.availableTo,
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
  return {
    title: listing.title,
    area: listing.area,
    availableFrom: normalizeApiDate(listing.availableFrom),
    availableTo: normalizeApiDate(listing.availableTo),
    beds: listing.beds,
    baths: listing.baths,
    commute: listing.commute,
    transit: listing.transit,
    price: listing.price,
    originalPrice: listing.originalPrice,
    tags: listing.tags.filter((tag) => tag !== "房东知情"),
    landlordAware:
      listing.tags.includes("房东知情") ||
      listing.trust.includes("房东知情"),
    remoteListingId: listing.id
  };
}

export async function executePublishSave(
  draft: PublishDraft,
  adapter: PublishAdapter,
  shouldSubmit: boolean
): Promise<PublishSaveResult> {
  const dto = mapPublishDraftToListingDto(draft);
  let remoteListingId = draft.remoteListingId;

  if (remoteListingId) {
    await adapter.update(remoteListingId, dto);
  } else {
    const created = await adapter.create(dto);
    remoteListingId = created.id;
  }

  if (shouldSubmit) {
    try {
      await adapter.submit(remoteListingId);
    } catch {
      return {
        status: "partial",
        remoteListingId,
        message: "草稿已保存，提交审核失败。请重试。"
      };
    }
    return {
      status: "submitted",
      remoteListingId,
      message: "房源已提交审核。"
    };
  }

  return {
    status: "saved",
    remoteListingId,
    message: "草稿已保存。"
  };
}

function normalizeApiDate(value: string | undefined) {
  return value?.slice(0, 10) ?? "";
}
import type { ApiListing } from "./api";
