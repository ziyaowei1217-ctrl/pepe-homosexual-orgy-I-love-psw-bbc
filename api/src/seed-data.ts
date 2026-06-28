export const seedListings = [
  {
    id: "seed-listing-1",
    title: "Fenway 高层主卧短租",
    area: "Boston · Fenway",
    image: "https://images.unsplash.com/photo-1505693416388-ac5ce068fe85?auto=format&fit=crop&w=1200&q=80",
    price: 1420,
    originalPrice: 1680,
    beds: 1,
    baths: 1,
    commute: "步行 12 分钟到 Northeastern",
    transit: "地铁 18 分钟到 Back Bay",
    trust: ".edu 已认证 · 房东知情",
    tags: ["独卫", "电梯", "可 6/18 入住"],
    score: 4.92,
    ownerId: "seed-user",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  },
  {
    id: "seed-listing-2",
    title: "Cambridge 三室整租 Group 优选",
    area: "Cambridge · Central",
    image: "https://images.unsplash.com/photo-1522708323590-d24dbb6b0267?auto=format&fit=crop&w=1200&q=80",
    price: 3480,
    originalPrice: 3900,
    beds: 3,
    baths: 2,
    commute: "骑行 9 分钟到 MIT",
    transit: "红线 14 分钟到 Harvard",
    trust: "三方协议模板 · 视频验房",
    tags: ["整租", "宠物友好", "Group 推荐"],
    score: 4.88,
    ownerId: "seed-user",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  },
  {
    id: "seed-listing-3",
    title: "Allston 阳光 Studio",
    area: "Boston · Allston",
    image: "https://images.unsplash.com/photo-1560448204-e02f11c3d0e2?auto=format&fit=crop&w=1200&q=80",
    price: 1980,
    originalPrice: 2250,
    beds: 1,
    baths: 1,
    commute: "绿线 16 分钟到 BU",
    transit: "步行 6 分钟到 Packards Corner",
    trust: "企业邮箱认证 · 首日保障",
    tags: ["健身房", "门卫", "可短租"],
    score: 4.84,
    ownerId: "seed-user",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  }
];

export const seedRoommates = [
  {
    id: "seed-roommate-1",
    name: "Mia Chen",
    age: 22,
    role: "BU MSBA · 秋季入学",
    image: "https://images.unsplash.com/photo-1494790108377-be9c29b29330?auto=format&fit=crop&w=900&q=80",
    match: 94,
    budget: "$1,450/月",
    commute: "Fenway / Back Bay",
    tags: ["早睡", "少做饭", "无宠物", "安静"]
  },
  {
    id: "seed-roommate-2",
    name: "Ethan Liu",
    age: 24,
    role: "实习生 · Seaport",
    image: "https://images.unsplash.com/photo-1500648767791-00dcc994a43e?auto=format&fit=crop&w=900&q=80",
    match: 89,
    budget: "$1,650/月",
    commute: "红线 30 分钟内",
    tags: ["可合租", "周末社交", "爱干净", "健身"]
  },
  {
    id: "seed-roommate-3",
    name: "Ava Zhang",
    age: 23,
    role: "Northeastern Co-op",
    image: "https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=900&q=80",
    match: 91,
    budget: "$1,520/月",
    commute: "步行到校区",
    tags: ["会做饭", "猫友好", "不抽烟", "稳定"]
  }
];

export const seedGroups = [
  {
    id: "seed-group-1",
    name: "Cambridge 秋季合租",
    budget: "$4,620/月",
    members: seedRoommates
  }
];

export const seedTrips = [
  {
    id: "seed-trip-1",
    listingId: "seed-listing-1",
    title: "Fenway 高层主卧短租",
    amount: 1420,
    status: "funds_held"
  }
];

export const seedTrustQueues = [
  { id: "trust-1", label: "人工认证待审", value: 24, variant: "trust" },
  { id: "trust-2", label: "房源媒体审核", value: 11, variant: "warning" },
  { id: "trust-3", label: "退款/缺陷工单", value: 3, variant: "danger" },
  { id: "trust-4", label: "信用分重算队列", value: 128, variant: "success" }
];
