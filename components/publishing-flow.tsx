"use client";

import { Building2, CheckCircle2 } from "lucide-react";
import { useRef, useState } from "react";
import { ListingMediaUploader } from "@/components/listing-media-uploader";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import type { ListingMediaSummary } from "@/lib/listing-media";
import { ListingCopyHelper } from "@/components/assistant/listing-copy-helper";
import { getPublishStepErrors, publishAmenities, type PublishDraft, type PublishSaveResult, type PublishStep } from "@/lib/publish-listing";
import { formatRangeLong } from "@/lib/date-format";
import { DateInput } from "@/components/ui/date-input";

function createEmptyPublishDraft(): PublishDraft {
  return {
    title: "",
    area: "",
    availableFrom: "",
    availableTo: "",
    beds: 1,
    baths: 1,
    commute: "",
    transit: "",
    price: 0,
    originalPrice: 0,
    tags: [],
    landlordAware: false,
    remoteListingId: null
  };
}

export function PublishingFlow({
  initialDraft,
  isPublishing,
  token,
  onSave
}: {
  initialDraft: PublishDraft | null;
  isPublishing: boolean;
  token: string;
  onSave: (draft: PublishDraft, shouldSubmit: boolean) => Promise<PublishSaveResult | null>;
}) {
  const steps: Array<{ key: PublishStep; code: string; title: string; detail: string }> = [
    { key: "basic", code: "01", title: "基础信息", detail: "标题、区域、可租期、房型与交通" },
    { key: "pricing", code: "02", title: "价格与设施", detail: "月租、原价、设施与声明" },
    { key: "media", code: "03", title: "图片与分类", detail: "文件上传、排序与封面" },
    { key: "review", code: "04", title: "预览与提交", detail: "检查信息、照片与发布须知" }
  ];
  const [stepIndex, setStepIndex] = useState(0);
  const [draft, setDraft] = useState<PublishDraft>(
    () => initialDraft ?? createEmptyPublishDraft()
  );
  const [mediaSummary, setMediaSummary] = useState<ListingMediaSummary>({
    totalCount: 0,
    readyCount: 0,
    pendingCount: 0,
    failedCount: 0,
    mutationPending: false
  });
  const [errors, setErrors] = useState<string[]>([]);
  const [confirmSubmit, setConfirmSubmit] = useState(false);
  const [submittedResult, setSubmittedResult] = useState<PublishSaveResult | null>(null);
  const formRef = useRef<HTMLDivElement>(null);
  const step = steps[stepIndex];
  // Each error sits under its own field; only errors without a field (photos) stay at the bottom.
  const fieldErrors: Record<string, string> = {};
  for (const error of errors) { const field = getPublishErrorFieldName(error); if (field && !fieldErrors[field]) fieldErrors[field] = error; }
  const otherErrors = errors.filter((error) => !getPublishErrorFieldName(error));

  function updateDraft(patch: Partial<PublishDraft>) {
    setDraft((current) => ({ ...current, ...patch }));
    if (errors.length) setErrors([]);
  }

  function showPublishErrors(nextErrors: string[]) {
    setErrors(nextErrors);
    const fieldName = getPublishErrorFieldName(nextErrors[0]);
    if (fieldName) formRef.current?.querySelector<HTMLElement>(`[name="${fieldName}"]`)?.focus();
  }

  async function goToStep(nextIndex: number) {
    if (nextIndex > stepIndex) {
      const nextErrors = getPublishStepErrors(draft, step.key, mediaSummary);
      if (nextErrors.length > 0) {
        showPublishErrors(nextErrors);
        return;
      }
      if (step.key === "pricing" && !draft.remoteListingId) {
        const result = await onSave(draft, false);
        if (!result) return;
        setDraft((current) => ({ ...current, remoteListingId: result.remoteListingId }));
      }
    }
    setErrors([]);
    setConfirmSubmit(false);
    setStepIndex(Math.min(Math.max(0, nextIndex), steps.length - 1));
  }

  async function save(shouldSubmit: boolean) {
    const nextErrors = shouldSubmit
      ? getPublishStepErrors(draft, "review", mediaSummary)
      : [
          ...getPublishStepErrors(draft, "basic", mediaSummary),
          ...getPublishStepErrors(draft, "pricing", mediaSummary)
        ];
    if (nextErrors.length > 0) {
      showPublishErrors(nextErrors);
      return;
    }
    if (shouldSubmit && !confirmSubmit) {
      setConfirmSubmit(true);
      return;
    }

    const result = await onSave(draft, shouldSubmit);
    if (!result) return;
    if (result.status === "submitted") {
      setSubmittedResult(result);
      setConfirmSubmit(false);
      return;
    }
    setDraft((current) => ({
      ...current,
      remoteListingId: result.remoteListingId
    }));
    setConfirmSubmit(false);
  }

  function toggleTag(tag: string) {
    updateDraft({
      tags: draft.tags.includes(tag)
        ? draft.tags.filter((item) => item !== tag)
        : [...draft.tags, tag]
    });
  }

  if (submittedResult) {
    return (
      <Card className="shadow-panel">
        <CardContent className="flex min-h-[320px] flex-col items-center justify-center gap-4 p-8 text-center">
          <div className="flex size-14 items-center justify-center rounded-full bg-surface-subtle text-trust-verified">
            <CheckCircle2 className="size-7" aria-hidden="true" />
          </div>
          <div>
            <h2 className="font-rounded text-m-title sm:text-d-title font-bold text-foreground">房源已提交审核</h2>
            <p className="mt-2 max-w-md text-sm font-semibold text-muted-foreground">
              当前房源及图片已锁定，审核完成前不能继续编辑。你可以在“我的房源”查看审核状态。
            </p>
            <p className="mt-2 text-m-footnote font-semibold text-muted-foreground">
              房源编号：{submittedResult.remoteListingId}
            </p>
          </div>
          <Button
            variant="outline"
            onClick={() => {
              setSubmittedResult(null);
              setDraft(createEmptyPublishDraft());
              setMediaSummary({
                totalCount: 0,
                readyCount: 0,
                pendingCount: 0,
                failedCount: 0,
                mutationPending: false
              });
              setErrors([]);
              setStepIndex(0);
            }}
          >
            发布另一套房源
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="shadow-panel">
      <CardHeader>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-m-headline text-ink sm:text-d-headline">房源资料</h2>
            <CardDescription>
              填写房源信息并添加照片。提交审核后，照片将暂时锁定。
            </CardDescription>
          </div>
          <Button variant="outline" size="sm" onClick={() => void save(false)} disabled={isPublishing}>
            <Building2 data-icon="inline-start" />
            {isPublishing ? "保存中" : "保存草稿"}
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-4 gap-2 md:gap-3">
          {steps.map((item, index) => (
            <button
              key={item.key}
              className={cn(
                "min-h-11 min-w-0 rounded-psw-md border bg-surface px-1.5 py-2 text-left transition-colors md:p-4",
                index === stepIndex && "border-primary bg-primary-soft"
              )}
              type="button"
              aria-current={index === stepIndex ? "step" : undefined}
              onClick={() => void goToStep(index)}
            >
              <div className="text-m-footnote font-bold text-primary-text">{item.code}</div>
              <div className="mt-1 whitespace-nowrap text-m-footnote font-bold text-foreground md:mt-2 md:text-sm">{item.title}</div>
              <div className="mt-1 hidden text-m-footnote text-muted-foreground md:block">{item.detail}</div>
            </button>
          ))}
        </div>
        <div ref={formRef} className="mt-4 rounded-md border bg-surface p-4">
          {step.key === "basic" ? (
            <div className="grid gap-3 md:grid-cols-2">
              <ListingCopyHelper token={token} draft={draft} onApply={updateDraft} />
              <PublishField error={fieldErrors.title} name="title" label="房源标题" placeholder="例如：Westwood 两室中的主卧，步行到 UCLA" value={draft.title} onChange={(value) => updateDraft({ title: value })} />
              <PublishField error={fieldErrors.area} name="area" label="区域" placeholder="例如：Los Angeles · Westwood" value={draft.area} onChange={(value) => updateDraft({ area: value })} />
              <PublishField error={fieldErrors.availableFrom} name="availableFrom" type="date" label="可入住日期" value={draft.availableFrom} onChange={(value) => updateDraft({ availableFrom: value })} />
              <PublishField error={fieldErrors.availableTo} name="availableTo" type="date" label="最晚退租日期" value={draft.availableTo} onChange={(value) => updateDraft({ availableTo: value })} />
              <PublishNumberField error={fieldErrors.beds} name="beds" label="卧室" value={draft.beds} min={0} onChange={(value) => updateDraft({ beds: value })} />
              <PublishNumberField error={fieldErrors.baths} name="baths" label="卫浴" value={draft.baths} min={0} onChange={(value) => updateDraft({ baths: value })} />
              <PublishField error={fieldErrors.commute} name="commute" label="到学校或公司的通勤" placeholder="例如：步行 8 分钟到 UCLA" value={draft.commute} onChange={(value) => updateDraft({ commute: value })} />
              <PublishField error={fieldErrors.transit} name="transit" label="附近交通（选填）" placeholder="例如：楼下有 Metro 公交站，可以路边停车" value={draft.transit} onChange={(value) => updateDraft({ transit: value })} />
            </div>
          ) : null}

          {step.key === "media" ? (
            draft.remoteListingId && token ? (
              <ListingMediaUploader
                listingId={draft.remoteListingId}
                token={token}
                disabled={isPublishing}
                onSummaryChange={setMediaSummary}
              />
            ) : (
              <div className="rounded-md border border-dashed bg-secondary p-4 text-sm font-semibold text-muted-foreground">
                请先完成基础信息和价格设置，系统会保存草稿后开放图片上传。
              </div>
            )
          ) : null}

          {step.key === "pricing" ? (
            <div className="grid gap-4">
              <div className="grid gap-3 md:grid-cols-2">
                <PublishNumberField error={fieldErrors.price} name="price" label="转租月租（美元）" hint="租客看到的月租；选了日期的租客会看到按天折算的总价。" value={draft.price} min={1} onChange={(value) => updateDraft({ price: value })} />
                <PublishNumberField error={fieldErrors.originalPrice} name="originalPrice" label="原租约月租（美元，选填）" hint="你和房东签的月租。留空就按转租月租算。" value={draft.originalPrice} min={1} onChange={(value) => updateDraft({ originalPrice: value })} />
              </div>
              <fieldset>
                <legend className="text-sm font-semibold">设施</legend>
                <div className="mt-2 flex flex-wrap gap-2">
                  {publishAmenities.map((tag) => (
                    <Button key={tag} name={tag === "Wi-Fi" ? "tags" : undefined} variant={draft.tags.includes(tag) ? "secondary" : "outline"} aria-pressed={draft.tags.includes(tag)} onClick={() => toggleTag(tag)}>{tag}</Button>
                  ))}
                </div>
                {fieldErrors.tags ? <p className="mt-2 text-m-footnote font-semibold text-danger-text">{fieldErrors.tags}</p> : null}
              </fieldset>
              <label className="flex items-start gap-3 rounded-md border bg-secondary p-3 text-sm font-semibold">
                <input name="landlordAware" type="checkbox" className="mt-1" checked={draft.landlordAware} onChange={(event) => updateDraft({ landlordAware: event.target.checked })} />
                <span>我声明房东知道并同意这次转租。这是你的声明，平台不核验租约，租客可能会请你出示租约。</span>
              </label>
              {fieldErrors.landlordAware ? <p className="-mt-2 text-m-footnote font-semibold text-danger-text">{fieldErrors.landlordAware}</p> : null}
            </div>
          ) : null}

          {step.key === "review" ? (
            <div className="grid gap-4">
              <div className="grid gap-3 md:grid-cols-2">
                <PublishReviewItem label="标题" value={draft.title || "未填写"} />
                <PublishReviewItem label="区域" value={draft.area || "未填写"} />
                <PublishReviewItem label="可租日期" value={draft.availableFrom && draft.availableTo ? formatRangeLong(draft.availableFrom, draft.availableTo) : "未填写"} />
                <PublishReviewItem label="转租月租" value={`$${draft.price.toLocaleString("en-US")} / 月`} />
                <PublishReviewItem label="图片" value={`${mediaSummary.readyCount} 张已保存图片`} />
                <PublishReviewItem label="设施" value={draft.tags.join("、") || "未选择"} />
                <PublishReviewItem label="信任信息" value={draft.landlordAware ? "房东知情：转租人声明 · 待平台审核" : "房东是否知情：未声明 · 待平台审核"} />
              </div>
              {confirmSubmit ? (
                <div className="rounded-md border border-trust-amber bg-warning-soft p-4 text-sm font-semibold text-foreground">
                  请再次确认提交。提交后房源进入平台审核，在审核完成前不会标记为“平台已审核”。
                </div>
              ) : null}
              <div className="flex flex-wrap gap-2">
                <Button variant="outline" onClick={() => void save(false)} disabled={isPublishing}>保存草稿</Button>
                <Button variant="trust" onClick={() => void save(true)} disabled={isPublishing || mediaSummary.mutationPending}>
                  {isPublishing ? "提交中" : confirmSubmit ? "确认提交审核" : "提交审核"}
                </Button>
              </div>
            </div>
          ) : null}

          {errors.length > 0 ? (
            <div className="mt-4 rounded-psw-md bg-danger-soft p-3 text-d-subhead font-semibold text-danger-text" role="alert">
              {otherErrors.map((error) => <div key={error}>{error}</div>)}
              {errors.length > otherErrors.length ? <div>还有 {errors.length - otherErrors.length} 处要填，已标在对应的输入框下面。</div> : null}
            </div>
          ) : null}
          <div className="mt-4 flex items-center justify-between">
            <Button variant="ghost" className={stepIndex === 0 ? "invisible" : undefined} disabled={stepIndex === 0 || isPublishing} onClick={() => void goToStep(stepIndex - 1)}>上一步</Button>
            {stepIndex < steps.length - 1 ? (
              <Button variant="trust" disabled={isPublishing || mediaSummary.mutationPending} onClick={() => void goToStep(stepIndex + 1)}>下一步</Button>
            ) : null}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function PublishField({
  name,
  label,
  value,
  type = "text",
  disabled = false,
  placeholder,
  hint,
  error,
  onChange
}: {
  name: string;
  label: string;
  value: string;
  type?: "text" | "date";
  disabled?: boolean;
  /** An example of a good answer, so a first-time 转租人 knows what to write. */
  placeholder?: string;
  hint?: string;
  /** The field's own error, shown under it and announced with it. */
  error?: string;
  onChange: (value: string) => void;
}) {
  const describedBy = [hint ? `${name}-hint` : "", error ? `${name}-error` : ""].filter(Boolean).join(" ") || undefined;
  return (
    <label className="grid content-start gap-2 text-d-label text-ink-secondary">
      {label}
      {type === "date"
        ? <DateInput name={name} aria-label={label} value={value} disabled={disabled} aria-invalid={error ? true : undefined} aria-describedby={describedBy} onChange={(event) => onChange(event.target.value)} focusOutline={false} className={cn("flex h-11 w-full items-center rounded-psw-md border border-input bg-card px-3 text-base font-medium text-ink sm:text-sm peer-focus-visible:ring-2 peer-focus-visible:ring-ring peer-focus-visible:ring-offset-2", error && "border-danger")} />
        : <Input name={name} type={type} value={value} disabled={disabled} placeholder={placeholder} aria-invalid={error ? true : undefined} aria-describedby={describedBy} className={error ? "border-danger" : undefined} onChange={(event) => onChange(event.target.value)} />}
      {hint ? <span id={`${name}-hint`} className="text-m-footnote font-normal text-ink-secondary">{hint}</span> : null}
      {error ? <span id={`${name}-error`} className="text-m-footnote font-semibold text-danger-text">{error}</span> : null}
    </label>
  );
}

function PublishNumberField({
  name,
  label,
  value,
  min,
  hint,
  error,
  onChange
}: {
  name: string;
  label: string;
  value: number;
  min: number;
  hint?: string;
  error?: string;
  onChange: (value: number) => void;
}) {
  const describedBy = [hint ? `${name}-hint` : "", error ? `${name}-error` : ""].filter(Boolean).join(" ") || undefined;
  return (
    <label className="grid content-start gap-2 text-d-label text-ink-secondary">
      {label}
      <Input name={name} type="number" inputMode="numeric" min={min} value={value === 0 && min > 0 ? "" : value} aria-invalid={error ? true : undefined} aria-describedby={describedBy} className={error ? "border-danger" : undefined} onChange={(event) => onChange(Number(event.target.value))} />
      {hint ? <span id={`${name}-hint`} className="text-m-footnote font-normal text-ink-secondary">{hint}</span> : null}
      {error ? <span id={`${name}-error`} className="text-m-footnote font-semibold text-danger-text">{error}</span> : null}
    </label>
  );
}

function getPublishErrorFieldName(error?: string) {
  return {
    "请填写房源标题。": "title",
    "请填写房源区域。": "area",
    "请选择可入住日期。": "availableFrom",
    "请选择最晚退租日期。": "availableTo",
    "最晚退租日期必须晚于可入住日期。": "availableTo",
    "请填写有效卧室数。": "beds",
    "请填写有效卫浴数。": "baths",
    "请填写通勤说明。": "commute",
    "请填写有效月租。": "price",
    "原租约月租要填整数美元，或者留空。": "originalPrice",
    "请至少选择一项设施。": "tags",
    "请确认房东知情声明。": "landlordAware"
  }[error ?? ""];
}

function PublishReviewItem({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border bg-secondary p-3">
      <div className="text-m-footnote font-bold text-muted-foreground">{label}</div>
      <div className="mt-1 break-words text-sm font-extrabold text-foreground">{value}</div>
    </div>
  );
}
