export type PreviewListing = {
  id: string;
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
  availableFrom: string;
  availableTo: string;
  latitude: number;
  longitude: number;
};

const neighborhoods = [
  "Westwood",
  "Koreatown",
  "Culver City",
  "Santa Monica",
  "Silver Lake",
  "Pasadena",
  "DTLA",
  "USC North",
  "Hollywood",
  "Burbank",
  "Sawtelle",
  "Glendale",
  "Mar Vista",
  "Echo Park",
  "Playa Vista",
  "North Hollywood",
  "Los Feliz",
  "Brentwood",
  "Arts District",
  "El Segundo",
  "Palms",
  "Venice",
  "Century City",
  "Highland Park"
];

const titles = [
  "校园步行圈阳光主卧",
  "地铁口安静次卧",
  "实习通勤友好一居",
  "海边带家具开间",
  "采光充足合租房",
  "研究生友好主卧",
  "高层景观阁楼",
  "三人合租整套",
  "门卫公寓一居",
  "影视实习短租房",
  "日系街区主卧",
  "安全小区两居",
  "独立出入开间",
  "湖边安静合租",
  "科技园通勤一居",
  "轻轨旁两居",
  "复古公寓主卧",
  "朝南明亮一居",
  "工业风阁楼",
  "海边通勤两居",
  "宠物友好次卧",
  "可做饭独卫主卧",
  "短租友好一居",
  "带车位整租房"
];

const images = [
  "https://images.unsplash.com/photo-1505693416388-ac5ce068fe85?auto=format&fit=crop&w=1200&q=80",
  "https://images.unsplash.com/photo-1522708323590-d24dbb6b0267?auto=format&fit=crop&w=1200&q=80",
  "https://images.unsplash.com/photo-1560448204-e02f11c3d0e2?auto=format&fit=crop&w=1200&q=80",
  "https://images.unsplash.com/photo-1493809842364-78817add7ffb?auto=format&fit=crop&w=1200&q=80",
  "https://images.unsplash.com/photo-1484154218962-a197022b5858?auto=format&fit=crop&w=1200&q=80",
  "https://images.unsplash.com/photo-1512917774080-9991f1c4c750?auto=format&fit=crop&w=1200&q=80"
];

const tagSets = [
  ["Wi-Fi", "独卫", "带家具"],
  ["Wi-Fi", "宠物友好", "洗烘"],
  ["近地铁", "Wi-Fi", "门卫"],
  ["独卫", "无烟", "可做饭"],
  ["带家具", "健身房", "Wi-Fi"],
  ["近地铁", "宠物友好", "采光好"]
];

export function createPreviewListings(): PreviewListing[] {
  return neighborhoods.map((neighborhood, index) => {
    const availableMonth = 8 + (index % 3);
    const availableDay = 1 + index;
    const endMonth = 11 + Math.floor(index / 12);
    const price = 995 + index * 97;

    return {
      id: `preview-${String(index + 1).padStart(2, "0")}`,
      title: `${neighborhood} ${titles[index]}`,
      area: `Los Angeles · ${neighborhood}`,
      image: images[index % images.length],
      price,
      originalPrice: price + 235 + index,
      beds: 1 + (index % 4),
      baths: 1 + (index % 3),
      commute: `${8 + index} 分钟到主要通勤点`,
      transit: index % 2 === 0 ? `近地铁 · ${neighborhood}` : `公交直达 · ${neighborhood}`,
      trust: "用户声明房东知情 · 待平台审核",
      tags: tagSets[index % tagSets.length],
      score: Number((4.51 + index * 0.019).toFixed(2)),
      availableFrom: `2026-${String(availableMonth).padStart(2, "0")}-${String(availableDay).padStart(2, "0")}`,
      availableTo: `2026-${String(endMonth).padStart(2, "0")}-${String(28 - (index % 5)).padStart(2, "0")}`,
      latitude: Number((33.9 + index * 0.011).toFixed(4)),
      longitude: Number((-118.52 + index * 0.013).toFixed(4))
    };
  });
}

export function isPreviewDataEnabled(
  value = process.env.NEXT_PUBLIC_ENABLE_PREVIEW_DATA,
  environment = process.env.NODE_ENV
) {
  return value === "true" && environment !== "production";
}
