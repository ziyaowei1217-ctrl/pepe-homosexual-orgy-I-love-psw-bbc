import { useId, useReducer, type FormEvent } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { ApiProfile } from "@/lib/api";
import {
  getMissingProfileFields,
  reduceOnboardingProfileState,
  type OnboardingReason
} from "@/lib/auth-flow";
import {
  buildOnboardingProfileInput,
  type OnboardingProfileInput
} from "@/lib/profile-input";
import { toProductApiError } from "@/lib/product-errors";

export type ProfileOnboardingProps = {
  reason: OnboardingReason;
  profile: ApiProfile | null;
  pending: boolean;
  error: string | null;
  onSave: (draft: OnboardingProfileInput) => void | Promise<unknown>;
  onDismiss: () => void;
};

const fieldLabels = {
  displayName: "显示名称",
  role: "身份",
  school: "学校",
  city: "城市"
} as const;

export function ProfileOnboarding({
  reason,
  profile,
  pending,
  error,
  onSave,
  onDismiss
}: ProfileOnboardingProps) {
  const fieldId = useId();
  const [formState, dispatch] = useReducer(reduceOnboardingProfileState, {
    draft: {
      displayName: profile?.displayName ?? "",
      school: profile?.school ?? "",
      city: profile?.city ?? "",
      role: profile?.role ?? "renter"
    },
    error: null
  });

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const input = buildOnboardingProfileInput(formState.draft);
    const missing = getMissingProfileFields(input);

    if (missing.length > 0) {
      dispatch({
        type: "set-error",
        error: `请填写${missing.map((field) => fieldLabels[field]).join("、")}。`
      });
      return;
    }

    dispatch({ type: "set-error", error: null });
    try {
      await onSave(input);
    } catch (saveError) {
      dispatch({
        type: "set-error",
        error: toProductApiError(saveError).message
      });
    }
  }

  const title = reason === "new-user" ? "先介绍一下自己" : "发布前完善资料";
  const dismissLabel = reason === "new-user" ? "稍后完善" : "暂不发布";
  const visibleError = formState.error ?? error;

  return (
    <section
      className="border-b border-border bg-background"
      aria-labelledby={`${fieldId}-title`}
    >
      <div className="app-shell py-4">
        <div className="editorial-panel mx-auto max-w-3xl p-4 md:p-6">
          <div className="mb-5">
            <div className="editorial-kicker">02 / 个人资料</div>
            <h2 id={`${fieldId}-title`} className="text-xl font-black text-primary">
              {title}
            </h2>
            <p className="mt-1 text-sm font-semibold text-muted-foreground">
              完善基本资料，让社区成员更容易认识你。
            </p>
          </div>

          <form className="grid gap-4" onSubmit={handleSubmit} noValidate>
            <div className="grid gap-4 md:grid-cols-2">
              <label
                htmlFor={`${fieldId}-display-name`}
                className="grid gap-1 text-xs font-black uppercase text-muted-foreground"
              >
                显示名称
                <Input
                  id={`${fieldId}-display-name`}
                  name="displayName"
                  autoComplete="name"
                  value={formState.draft.displayName}
                  onChange={(event) =>
                    dispatch({
                      type: "change",
                      field: "displayName",
                      value: event.target.value
                    })
                  }
                  placeholder="Maya Chen"
                />
              </label>

              <label
                htmlFor={`${fieldId}-role`}
                className="grid gap-1 text-xs font-black uppercase text-muted-foreground"
              >
                身份
                <select
                  id={`${fieldId}-role`}
                  name="role"
                  className="h-11 rounded-[12px] border border-input bg-card px-3 text-sm font-medium normal-case text-foreground shadow-sm outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                  value={formState.draft.role}
                  onChange={(event) =>
                    dispatch({
                      type: "change",
                      field: "role",
                      value: event.target.value as OnboardingProfileInput["role"]
                    })
                  }
                >
                  <option value="renter">租客</option>
                  <option value="lister">房东</option>
                  <option value="both">租客兼房东</option>
                </select>
              </label>

              <label
                htmlFor={`${fieldId}-school`}
                className="grid gap-1 text-xs font-black uppercase text-muted-foreground"
              >
                学校
                <Input
                  id={`${fieldId}-school`}
                  name="school"
                  autoComplete="organization"
                  value={formState.draft.school}
                  onChange={(event) =>
                    dispatch({
                      type: "change",
                      field: "school",
                      value: event.target.value
                    })
                  }
                  placeholder="UCLA"
                />
              </label>

              <label
                htmlFor={`${fieldId}-city`}
                className="grid gap-1 text-xs font-black uppercase text-muted-foreground"
              >
                城市
                <Input
                  id={`${fieldId}-city`}
                  name="city"
                  autoComplete="address-level2"
                  value={formState.draft.city}
                  onChange={(event) =>
                    dispatch({
                      type: "change",
                      field: "city",
                      value: event.target.value
                    })
                  }
                  placeholder="Los Angeles"
                />
              </label>
            </div>

            {visibleError ? (
              <p role="alert" className="text-sm font-semibold text-destructive">
                {visibleError}
              </p>
            ) : null}

            <div className="flex flex-wrap justify-end gap-2">
              <Button type="button" variant="ghost" onClick={onDismiss} disabled={pending}>
                {dismissLabel}
              </Button>
              <Button type="submit" variant="trust" disabled={pending}>
                {pending ? "保存中…" : "保存并继续"}
              </Button>
            </div>
          </form>
        </div>
      </div>
    </section>
  );
}
