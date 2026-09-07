type NationwideSeedMarket = {
  id: string;
  label: string;
  region: string;
  neighborhoods: [string, string, string];
  hubs: [string, string, string];
  basePrice: number;
};

const nationwideSeedMarkets: NationwideSeedMarket[] = [
  seedMarket("new-york", "New York", "New York", ["Morningside Heights", "Long Island City", "Downtown Brooklyn"], ["Columbia University", "NYU", "Wall Street"], 2850),
  seedMarket("san-francisco-bay-area", "San Francisco Bay Area", "California", ["SoMa", "Mission Bay", "Berkeley"], ["Salesforce", "UCSF", "UC Berkeley"], 2670),
  seedMarket("san-jose", "San Jose", "California", ["Downtown San Jose", "Santa Clara", "Palo Alto"], ["San Jose State", "Apple", "Stanford"], 2480),
  seedMarket("seattle", "Seattle", "Washington", ["University District", "South Lake Union", "Bellevue"], ["University of Washington", "Amazon", "Microsoft"], 2050),
  seedMarket("san-diego", "San Diego", "California", ["La Jolla", "University City", "Downtown San Diego"], ["UC San Diego", "Qualcomm", "Biotech"], 2110),
  seedMarket("portland", "Portland", "Oregon", ["Pearl District", "Hillsboro", "South Waterfront"], ["Portland State", "Intel", "OHSU"], 1580),
  seedMarket("sacramento", "Sacramento", "California", ["Midtown", "Davis", "Natomas"], ["Sac State", "UC Davis", "California Government"], 1640),
  seedMarket("denver-boulder", "Denver-Boulder", "Colorado", ["Capitol Hill", "Boulder", "RiNo"], ["University of Denver", "CU Boulder", "Aerospace"], 1760),
  seedMarket("salt-lake-city", "Salt Lake City", "Utah", ["Downtown", "Sugar House", "Lehi"], ["University of Utah", "Adobe", "Silicon Slopes"], 1510),
  seedMarket("phoenix-tempe", "Phoenix-Tempe", "Arizona", ["Tempe", "Downtown Phoenix", "Chandler"], ["Arizona State University", "TSMC", "Intel"], 1490),
  seedMarket("las-vegas", "Las Vegas", "Nevada", ["Paradise", "Downtown Las Vegas", "Summerlin"], ["UNLV", "Hospitality", "Conventions"], 1420),
  seedMarket("austin", "Austin", "Texas", ["West Campus", "Downtown Austin", "North Burnet"], ["UT Austin", "Dell", "Tesla"], 1740),
  seedMarket("dallas-fort-worth", "Dallas-Fort Worth", "Texas", ["Uptown Dallas", "Richardson", "Las Colinas"], ["SMU", "UT Dallas", "AT&T"], 1610),
  seedMarket("houston", "Houston", "Texas", ["Rice Village", "Texas Medical Center", "Midtown"], ["Rice University", "Texas Medical Center", "Energy"], 1450),
  seedMarket("atlanta", "Atlanta", "Georgia", ["Midtown Atlanta", "Decatur", "Buckhead"], ["Georgia Tech", "Emory", "Delta"], 1570),
  seedMarket("miami", "Miami", "Florida", ["Coral Gables", "Brickell", "Downtown Miami"], ["University of Miami", "Finance", "FIU"], 2160),
  seedMarket("orlando", "Orlando", "Florida", ["UCF Area", "Lake Nona", "Downtown Orlando"], ["UCF", "Disney", "Lockheed Martin"], 1510),
  seedMarket("tampa-bay", "Tampa Bay", "Florida", ["Temple Terrace", "Downtown Tampa", "St. Petersburg"], ["University of South Florida", "Healthcare", "Finance"], 1540),
  seedMarket("nashville", "Nashville", "Tennessee", ["Midtown Nashville", "Music Row", "The Gulch"], ["Vanderbilt", "HCA Healthcare", "Music Row"], 1620),
  seedMarket("charlotte", "Charlotte", "North Carolina", ["University City", "Uptown Charlotte", "South End"], ["UNC Charlotte", "Bank of America", "Wells Fargo"], 1510),
  seedMarket("raleigh-durham", "Raleigh-Durham", "North Carolina", ["Downtown Durham", "Chapel Hill", "Downtown Raleigh"], ["Duke", "UNC", "NC State"], 1490),
  seedMarket("new-orleans", "New Orleans", "Louisiana", ["Uptown", "Mid-City", "Downtown New Orleans"], ["Tulane", "LSU Health", "Port of New Orleans"], 1390),
  seedMarket("washington-dc", "Washington, DC", "District of Columbia", ["Foggy Bottom", "Arlington", "NoMa"], ["George Washington University", "Amazon HQ2", "Georgetown"], 2260),
  seedMarket("philadelphia", "Philadelphia", "Pennsylvania", ["University City", "Center City", "Fishtown"], ["UPenn", "Drexel", "Comcast"], 1570),
  seedMarket("baltimore", "Baltimore", "Maryland", ["Charles Village", "Inner Harbor", "Canton"], ["Johns Hopkins", "University of Maryland Baltimore", "Under Armour"], 1480),
  seedMarket("pittsburgh", "Pittsburgh", "Pennsylvania", ["Oakland", "Shadyside", "Lawrenceville"], ["Carnegie Mellon", "University of Pittsburgh", "UPMC"], 1430),
  seedMarket("chicago", "Chicago", "Illinois", ["Hyde Park", "Evanston", "West Loop"], ["University of Chicago", "Northwestern", "Finance"], 1790),
  seedMarket("detroit", "Detroit", "Michigan", ["Midtown Detroit", "Corktown", "Dearborn"], ["Wayne State", "Ford", "General Motors"], 1280),
  seedMarket("ann-arbor", "Ann Arbor", "Michigan", ["Kerrytown", "Downtown Ann Arbor", "North Campus"], ["University of Michigan", "Michigan Medicine", "Automotive R&D"], 1490),
  seedMarket("columbus", "Columbus", "Ohio", ["University District", "Short North", "Downtown Columbus"], ["Ohio State", "JPMorgan Chase", "Nationwide"], 1360),
  seedMarket("indianapolis", "Indianapolis", "Indiana", ["Downtown Indianapolis", "Broad Ripple", "Carmel"], ["IU Indianapolis", "Eli Lilly", "Salesforce"], 1310),
  seedMarket("minneapolis-st-paul", "Minneapolis-St. Paul", "Minnesota", ["Dinkytown", "North Loop", "St. Paul"], ["University of Minnesota", "Target", "3M"], 1470),
  seedMarket("st-louis", "St. Louis", "Missouri", ["Central West End", "University City", "Clayton"], ["Washington University", "Saint Louis University", "Boeing"], 1320),
  seedMarket("kansas-city", "Kansas City", "Missouri / Kansas", ["Downtown Kansas City", "Country Club Plaza", "Overland Park"], ["UMKC", "Garmin", "Logistics"], 1290),
  seedMarket("cleveland", "Cleveland", "Ohio", ["University Circle", "Downtown Cleveland", "Ohio City"], ["Case Western", "Cleveland Clinic", "Healthcare"], 1260),
  seedMarket("cincinnati", "Cincinnati", "Ohio", ["Clifton", "Downtown Cincinnati", "Blue Ash"], ["University of Cincinnati", "P&G", "Kroger"], 1290),
  seedMarket("milwaukee", "Milwaukee", "Wisconsin", ["East Side", "Downtown Milwaukee", "Third Ward"], ["Marquette", "UW Milwaukee", "Northwestern Mutual"], 1320),
  seedMarket("providence", "Providence", "Rhode Island", ["College Hill", "Downtown Providence", "Fox Point"], ["Brown", "RISD", "Healthcare"], 1580)
];

export function createNationwideSeedListings(timestamp: string, images: string[]) {
  return nationwideSeedMarkets.flatMap((market, marketIndex) =>
    market.neighborhoods.map((neighborhood, neighborhoodIndex) => {
      const price = market.basePrice + marketIndex * 7 + neighborhoodIndex * 137;
      const hub = market.hubs[neighborhoodIndex];
      return {
        id: `seed-listing-us-${market.id}-${neighborhoodIndex + 1}`,
        title: `${market.label} ${neighborhood} ${["学生通勤主卧", "企业通勤一居", "带家具灵活租期"][neighborhoodIndex]}`,
        area: `${market.label} · ${neighborhood}`,
        image: images[(marketIndex + neighborhoodIndex) % images.length],
        price,
        originalPrice: price + 280 + neighborhoodIndex * 40,
        beds: 1 + (neighborhoodIndex % 2),
        baths: 1 + (neighborhoodIndex % 2),
        commute: `${7 + neighborhoodIndex * 4} 分钟到 ${hub}`,
        transit: `${market.region} 都会区公共交通可达`,
        trust: "房源资料完整 · 全国演示房源",
        tags: neighborhoodIndex === 0 ? ["Wi-Fi", "学生友好", "带家具"] : ["Wi-Fi", "企业通勤", "灵活租期"],
        score: Number((4.71 + ((marketIndex + neighborhoodIndex) % 9) * 0.025).toFixed(2)),
        ownerId: "seed-user",
        createdAt: timestamp,
        updatedAt: timestamp
      };
    })
  );
}

function seedMarket(
  id: string,
  label: string,
  region: string,
  neighborhoods: [string, string, string],
  hubs: [string, string, string],
  basePrice: number
): NationwideSeedMarket {
  return { id, label, region, neighborhoods, hubs, basePrice };
}
