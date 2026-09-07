import { getMarketNeighborhoodCoordinates, usMarkets } from "./us-market-catalog";

export type PreviewListing = {
  id: string;
  title: string;
  area: string;
  image: string;
  images?: string[];
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
  const losAngelesListings = neighborhoods.map((neighborhood, index) => {
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

  const bostonNeighborhoods = ["Back Bay", "Fenway", "Allston", "Cambridge", "Somerville", "Seaport"];
  const bostonTitles = ["棕石公寓一居", "学生友好开间", "绿线旁合租主卧", "红线通勤两居", "安静采光次卧", "海港景观一居"];
  const bostonCoordinates = [
    { latitude: 42.3503, longitude: -71.081 },
    { latitude: 42.3467, longitude: -71.0972 },
    { latitude: 42.3555, longitude: -71.1328 },
    { latitude: 42.3736, longitude: -71.1097 },
    { latitude: 42.3876, longitude: -71.0995 },
    { latitude: 42.3519, longitude: -71.0496 }
  ];
  const bostonListings = bostonNeighborhoods.map((neighborhood, index) => ({
    id: `preview-${String(index + 25).padStart(2, "0")}`,
    title: `${neighborhood} ${bostonTitles[index]}`,
    area: `Boston · ${neighborhood}`,
    image: images[(index + 2) % images.length],
    price: [1895, 2075, 1465, 2345, 1785, 2195][index],
    originalPrice: [2140, 2290, 1690, 2610, 2010, 2480][index],
    beds: 1 + (index % 2),
    baths: 1 + (index % 2),
    commute: `${8 + index * 2} 分钟到主要通勤点`,
    transit: index % 2 === 0 ? `近 MBTA · ${neighborhood}` : `公交直达 · ${neighborhood}`,
    trust: "房源资料完整 · 演示房源",
    tags: tagSets[(index + 2) % tagSets.length],
    score: Number((4.72 + index * 0.03).toFixed(2)),
    availableFrom: `2026-09-${String(25 + index).padStart(2, "0")}`,
    availableTo: `2027-06-${String(10 + index).padStart(2, "0")}`,
    ...bostonCoordinates[index]
  }));

  const nationwideListings = usMarkets
    .filter((market) => market.id !== "los-angeles" && market.id !== "boston")
    .flatMap((market, marketIndex) => market.neighborhoods.map((neighborhood, neighborhoodIndex) => {
      const coordinates = getMarketNeighborhoodCoordinates(market, neighborhood);
      const hub = market.highlights[neighborhoodIndex] ?? market.highlights[0];
      const price = market.basePrice + marketIndex * 7 + neighborhoodIndex * 137;

      return {
        id: `preview-us-${market.id}-${neighborhoodIndex + 1}`,
        title: `${market.label} ${neighborhood} ${["学生通勤主卧", "企业通勤一居", "带家具灵活租期"][neighborhoodIndex]}`,
        area: `${market.label} · ${neighborhood}`,
        image: images[(marketIndex + neighborhoodIndex) % images.length],
        price,
        originalPrice: price + 260 + neighborhoodIndex * 35,
        beds: 1 + (neighborhoodIndex % 2),
        baths: 1 + (neighborhoodIndex % 2),
        commute: `${7 + neighborhoodIndex * 4} 分钟到 ${hub}`,
        transit: `${market.region} 都会区公共交通可达`,
        trust: "房源资料完整 · 全国演示房源",
        tags: neighborhoodIndex === 0 ? ["Wi-Fi", "学生友好", "带家具"] : ["Wi-Fi", "企业通勤", "灵活租期"],
        score: Number((4.71 + ((marketIndex + neighborhoodIndex) % 9) * 0.025).toFixed(2)),
        availableFrom: `2026-${String(10 + (marketIndex % 3)).padStart(2, "0")}-${String(1 + neighborhoodIndex * 6).padStart(2, "0")}`,
        availableTo: `2027-0${6 + (neighborhoodIndex % 3)}-${String(12 + (marketIndex % 12)).padStart(2, "0")}`,
        latitude: coordinates.lat,
        longitude: coordinates.lng
      };
    }));

  return [...losAngelesListings, ...bostonListings, ...nationwideListings];
}

export function isPreviewDataEnabled(
  value = process.env.NEXT_PUBLIC_ENABLE_PREVIEW_DATA,
  environment = process.env.NODE_ENV
) {
  return value === "true" && environment !== "production";
}
