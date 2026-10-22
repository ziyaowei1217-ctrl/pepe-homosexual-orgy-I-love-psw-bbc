/** Stored codes for structured roommate fields, with their Chinese labels. */
const roommateLabels = {
  gender: { female: "女", male: "男", nonbinary: "非二元" },
  genderPreference: { any: "不限", female: "只找女生", male: "只找男生" },
  roomType: { private_room: "独立卧室", shared_room: "合住一间", entire_place: "整租" },
  sleepSchedule: { early_bird: "早睡早起", regular: "作息规律", night_owl: "夜猫子" },
  cleanliness: { relaxed: "随性", tidy: "整洁", very_tidy: "很爱干净" },
  guests: { rarely: "很少带朋友", sometimes: "偶尔带朋友", often: "经常带朋友" },
  smoking: { no: "不抽烟", outside: "只在室外抽", yes: "抽烟" },
  pets: { none: "没有宠物", has_pet: "养宠物" },
  dealbreakers: { smoking: "抽烟", pets: "宠物", night_owl: "夜猫子", frequent_guests: "经常带朋友" }
} as const;

export type RoommateField = keyof typeof roommateLabels;

export function roommateCodes(field: RoommateField) {
  return Object.keys(roommateLabels[field]);
}

export function roommateLabel(field: RoommateField, value: string | null | undefined): string | null {
  const labels: Record<string, string> = roommateLabels[field];
  return value != null && Object.hasOwn(labels, value) ? labels[value] : null;
}

/** The value when it is a known code; legacy free text counts as unknown. */
export function roommateCode(field: RoommateField, value: string | null | undefined) {
  return roommateLabel(field, value) === null ? null : value!;
}
