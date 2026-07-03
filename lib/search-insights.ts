import { formatDateRangeLabel, type DateRange } from "./date-range";

export type SearchInsightFilters = DateRange & {
  query: string;
  budget: number;
  amenity: string;
};

export type SearchInsight = {
  status: "healthy" | "tight" | "empty";
  headline: string;
  suggestion: string;
  chips: string[];
};

export function buildSearchInsight(
  filters: SearchInsightFilters,
  resultCount: number
): SearchInsight {
  const chips = [
    filters.query.trim() || "全洛杉矶",
    formatDateRangeLabel(filters),
    `$${filters.budget.toLocaleString()} 以内`,
    filters.amenity
  ];

  if (resultCount === 0) {
    return {
      status: "empty",
      headline: "没有精确命中",
      suggestion: "先放宽预算或设施偏好，再保留相近日期候选。",
      chips
    };
  }

  if (resultCount <= 3) {
    return {
      status: "tight",
      headline: "命中偏少",
      suggestion: "建议同时看相近日期和邻近街区，避免错过可组队的房源。",
      chips
    };
  }

  return {
    status: "healthy",
    headline: "匹配稳定",
    suggestion: "先用地图锁定通勤圈，再进入详情确认费用和 Trust 状态。",
    chips
  };
}
