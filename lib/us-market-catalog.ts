export type USMarket = {
  id: string;
  label: string;
  region: string;
  center: { lat: number; lng: number };
  aliases: string[];
  highlights: string[];
  neighborhoods: [string, string, string];
  basePrice: number;
};

export const usMarkets: USMarket[] = [
  market("los-angeles", "Los Angeles", "California", 34.0522, -118.2437, ["la", "los angeles", "洛杉矶"], ["UCLA", "USC", "Caltech", "SpaceX"], ["Westwood", "USC North", "Culver City"], 1680),
  market("boston", "Boston", "Massachusetts", 42.3601, -71.0589, ["bos", "boston", "cambridge", "波士顿"], ["Harvard", "MIT", "Boston University", "Northeastern"], ["Back Bay", "Fenway", "Cambridge"], 2080),
  market("new-york", "New York", "New York", 40.7128, -74.006, ["nyc", "new york city", "manhattan", "brooklyn", "纽约"], ["Columbia University", "NYU", "Wall Street", "Google"], ["Morningside Heights", "Long Island City", "Downtown Brooklyn"], 2850),
  market("san-francisco-bay-area", "San Francisco Bay Area", "California", 37.7749, -122.4194, ["sf", "san francisco", "bay area", "oakland", "berkeley", "旧金山"], ["UC Berkeley", "UCSF", "Salesforce", "OpenAI"], ["SoMa", "Mission Bay", "Berkeley"], 2670),
  market("san-jose", "San Jose", "California", 37.3382, -121.8863, ["sj", "san jose", "silicon valley", "palo alto", "santa clara"], ["Stanford", "Apple", "Google", "NVIDIA"], ["Downtown San Jose", "Santa Clara", "Palo Alto"], 2480),
  market("seattle", "Seattle", "Washington", 47.6062, -122.3321, ["sea", "seattle", "bellevue", "redmond", "西雅图"], ["University of Washington", "Amazon", "Microsoft", "Boeing"], ["University District", "South Lake Union", "Bellevue"], 2050),
  market("san-diego", "San Diego", "California", 32.7157, -117.1611, ["sd", "san diego", "圣地亚哥"], ["UC San Diego", "Qualcomm", "Scripps Research", "Biotech"], ["La Jolla", "University City", "Downtown San Diego"], 2110),
  market("portland", "Portland", "Oregon", 45.5152, -122.6784, ["pdx", "portland", "波特兰"], ["Portland State", "Intel", "Nike", "OHSU"], ["Pearl District", "Hillsboro", "South Waterfront"], 1580),
  market("sacramento", "Sacramento", "California", 38.5816, -121.4944, ["sac", "sacramento", "萨克拉门托"], ["UC Davis", "Sac State", "California Government", "Healthcare"], ["Midtown", "Davis", "Natomas"], 1640),
  market("denver-boulder", "Denver-Boulder", "Colorado", 39.7392, -104.9903, ["denver", "boulder", "den", "丹佛"], ["CU Boulder", "University of Denver", "Lockheed Martin", "Aerospace"], ["Capitol Hill", "Boulder", "RiNo"], 1760),
  market("salt-lake-city", "Salt Lake City", "Utah", 40.7608, -111.891, ["slc", "salt lake", "salt lake city", "盐湖城"], ["University of Utah", "Adobe", "Qualtrics", "Silicon Slopes"], ["Downtown", "Sugar House", "Lehi"], 1510),
  market("phoenix-tempe", "Phoenix-Tempe", "Arizona", 33.4484, -112.074, ["phoenix", "tempe", "phx", "凤凰城"], ["Arizona State University", "Intel", "TSMC", "Semiconductors"], ["Tempe", "Downtown Phoenix", "Chandler"], 1490),
  market("las-vegas", "Las Vegas", "Nevada", 36.1699, -115.1398, ["vegas", "las vegas", "拉斯维加斯"], ["UNLV", "Hospitality", "Conventions", "Entertainment"], ["Paradise", "Downtown Las Vegas", "Summerlin"], 1420),
  market("austin", "Austin", "Texas", 30.2672, -97.7431, ["aus", "austin", "奥斯汀"], ["UT Austin", "Dell", "Apple", "Tesla"], ["West Campus", "Downtown Austin", "North Burnet"], 1740),
  market("dallas-fort-worth", "Dallas-Fort Worth", "Texas", 32.7767, -96.797, ["dallas", "dfw", "fort worth", "达拉斯"], ["SMU", "UT Dallas", "American Airlines", "AT&T"], ["Uptown Dallas", "Richardson", "Las Colinas"], 1610),
  market("houston", "Houston", "Texas", 29.7604, -95.3698, ["hou", "houston", "休斯敦"], ["Rice University", "University of Houston", "Texas Medical Center", "Energy"], ["Rice Village", "Texas Medical Center", "Midtown"], 1450),
  market("atlanta", "Atlanta", "Georgia", 33.749, -84.388, ["atl", "atlanta", "亚特兰大"], ["Georgia Tech", "Emory", "Delta", "Coca-Cola"], ["Midtown Atlanta", "Decatur", "Buckhead"], 1570),
  market("miami", "Miami", "Florida", 25.7617, -80.1918, ["mia", "miami", "fort lauderdale", "迈阿密"], ["University of Miami", "FIU", "Finance", "Hospitality"], ["Coral Gables", "Brickell", "Downtown Miami"], 2160),
  market("orlando", "Orlando", "Florida", 28.5383, -81.3792, ["orl", "orlando", "奥兰多"], ["UCF", "Disney", "Lockheed Martin", "Simulation"], ["UCF Area", "Lake Nona", "Downtown Orlando"], 1510),
  market("tampa-bay", "Tampa Bay", "Florida", 27.9506, -82.4572, ["tampa", "tampa bay", "st petersburg", "坦帕"], ["University of South Florida", "Healthcare", "Finance", "MacDill"], ["Temple Terrace", "Downtown Tampa", "St. Petersburg"], 1540),
  market("nashville", "Nashville", "Tennessee", 36.1627, -86.7816, ["bna", "nashville", "纳什维尔"], ["Vanderbilt", "HCA Healthcare", "Music Row", "Belmont"], ["Midtown Nashville", "Music Row", "The Gulch"], 1620),
  market("charlotte", "Charlotte", "North Carolina", 35.2271, -80.8431, ["clt", "charlotte", "夏洛特"], ["UNC Charlotte", "Bank of America", "Wells Fargo", "Finance"], ["University City", "Uptown Charlotte", "South End"], 1510),
  market("raleigh-durham", "Raleigh-Durham", "North Carolina", 35.9132, -79.0558, ["raleigh", "durham", "chapel hill", "rtp", "research triangle"], ["Duke", "UNC", "NC State", "Research Triangle Park"], ["Downtown Durham", "Chapel Hill", "Downtown Raleigh"], 1490),
  market("new-orleans", "New Orleans", "Louisiana", 29.9511, -90.0715, ["nola", "new orleans", "新奥尔良"], ["Tulane", "LSU Health", "Hospitality", "Port of New Orleans"], ["Uptown", "Mid-City", "Downtown New Orleans"], 1390),
  market("washington-dc", "Washington, DC", "District of Columbia", 38.9072, -77.0369, ["dc", "washington dc", "washington d.c.", "arlington", "northern virginia", "nova", "华盛顿"], ["Georgetown", "George Washington University", "Amazon HQ2", "Federal Government"], ["Foggy Bottom", "Arlington", "NoMa"], 2260),
  market("philadelphia", "Philadelphia", "Pennsylvania", 39.9526, -75.1652, ["philly", "philadelphia", "费城"], ["UPenn", "Drexel", "Temple", "Comcast"], ["University City", "Center City", "Fishtown"], 1570),
  market("baltimore", "Baltimore", "Maryland", 39.2904, -76.6122, ["baltimore", "bmore", "巴尔的摩"], ["Johns Hopkins", "University of Maryland Baltimore", "Under Armour", "Healthcare"], ["Charles Village", "Inner Harbor", "Canton"], 1480),
  market("pittsburgh", "Pittsburgh", "Pennsylvania", 40.4406, -79.9959, ["pgh", "pittsburgh", "匹兹堡"], ["Carnegie Mellon", "University of Pittsburgh", "UPMC", "Robotics"], ["Oakland", "Shadyside", "Lawrenceville"], 1430),
  market("chicago", "Chicago", "Illinois", 41.8781, -87.6298, ["chi", "chicago", "芝加哥"], ["University of Chicago", "Northwestern", "UIC", "Finance"], ["Hyde Park", "Evanston", "West Loop"], 1790),
  market("detroit", "Detroit", "Michigan", 42.3314, -83.0458, ["detroit", "dearborn", "底特律"], ["Wayne State", "Ford", "General Motors", "Automotive"], ["Midtown Detroit", "Corktown", "Dearborn"], 1280),
  market("ann-arbor", "Ann Arbor", "Michigan", 42.2808, -83.743, ["ann arbor", "a2", "安娜堡"], ["University of Michigan", "Michigan Medicine", "Biotech", "Automotive R&D"], ["Kerrytown", "Downtown Ann Arbor", "North Campus"], 1490),
  market("columbus", "Columbus", "Ohio", 39.9612, -82.9988, ["columbus", "cbus", "哥伦布"], ["Ohio State", "JPMorgan Chase", "Nationwide", "Intel"], ["University District", "Short North", "Downtown Columbus"], 1360),
  market("indianapolis", "Indianapolis", "Indiana", 39.7684, -86.1581, ["indy", "indianapolis", "印第安纳波利斯"], ["IU Indianapolis", "Purdue", "Eli Lilly", "Salesforce"], ["Downtown Indianapolis", "Broad Ripple", "Carmel"], 1310),
  market("minneapolis-st-paul", "Minneapolis-St. Paul", "Minnesota", 44.9778, -93.265, ["minneapolis", "st paul", "twin cities", "msp", "明尼阿波利斯"], ["University of Minnesota", "Target", "3M", "Medtronic"], ["Dinkytown", "North Loop", "St. Paul"], 1470),
  market("st-louis", "St. Louis", "Missouri", 38.627, -90.1994, ["st louis", "saint louis", "stl", "圣路易斯"], ["Washington University", "Saint Louis University", "Boeing", "Healthcare"], ["Central West End", "University City", "Clayton"], 1320),
  market("kansas-city", "Kansas City", "Missouri / Kansas", 39.0997, -94.5786, ["kansas city", "kc", "kansas city missouri"], ["UMKC", "Garmin", "Logistics", "Healthcare"], ["Downtown Kansas City", "Country Club Plaza", "Overland Park"], 1290),
  market("cleveland", "Cleveland", "Ohio", 41.4993, -81.6944, ["cleveland", "cle", "克利夫兰"], ["Case Western", "Cleveland Clinic", "University Hospitals", "Healthcare"], ["University Circle", "Downtown Cleveland", "Ohio City"], 1260),
  market("cincinnati", "Cincinnati", "Ohio", 39.1031, -84.512, ["cincinnati", "cincy", "辛辛那提"], ["University of Cincinnati", "P&G", "Kroger", "GE Aerospace"], ["Clifton", "Downtown Cincinnati", "Blue Ash"], 1290),
  market("milwaukee", "Milwaukee", "Wisconsin", 43.0389, -87.9065, ["milwaukee", "mke", "密尔沃基"], ["Marquette", "UW Milwaukee", "Northwestern Mutual", "Manufacturing"], ["East Side", "Downtown Milwaukee", "Third Ward"], 1320),
  market("providence", "Providence", "Rhode Island", 41.824, -71.4128, ["providence", "pvd", "普罗维登斯"], ["Brown", "RISD", "Johnson & Wales", "Healthcare"], ["College Hill", "Downtown Providence", "Fox Point"], 1580)
];

export function searchUSMarkets(value: string, limit = 6) {
  const query = normalize(value);
  if (query.length < 2) return [];

  return usMarkets
    .map((entry) => ({ entry, rank: matchRank(entry, query) }))
    .filter((result) => Number.isFinite(result.rank))
    .sort((left, right) => left.rank - right.rank || left.entry.label.localeCompare(right.entry.label))
    .slice(0, limit)
    .map((result) => result.entry);
}

export function findUSMarketByArea(area: string) {
  const metro = normalize(area.split("·")[0] ?? area);
  return usMarkets.find((entry) =>
    normalize(entry.label) === metro || entry.aliases.some((alias) => normalize(alias) === metro)
  );
}

export function getMarketNeighborhoodCoordinates(entry: USMarket, neighborhood: string) {
  const hash = stableHash(`${entry.id}:${neighborhood}`);
  const latOffset = ((hash % 997) - 498) * 0.000055;
  const lngOffset = ((Math.floor(hash / 997) % 997) - 498) * 0.000075;
  return {
    lat: Number((entry.center.lat + latOffset).toFixed(4)),
    lng: Number((entry.center.lng + lngOffset).toFixed(4))
  };
}

function market(
  id: string,
  label: string,
  region: string,
  lat: number,
  lng: number,
  aliases: string[],
  highlights: string[],
  neighborhoods: [string, string, string],
  basePrice: number
): USMarket {
  return { id, label, region, center: { lat, lng }, aliases, highlights, neighborhoods, basePrice };
}

function matchRank(entry: USMarket, query: string) {
  const terms = [entry.label, entry.region, ...entry.aliases, ...entry.highlights, ...entry.neighborhoods].map(normalize);
  if (terms.some((term) => term === query)) return 0;
  if (terms.some((term) => term.startsWith(query))) return 1;
  if (terms.some((term) => term.split(/\s+/).some((word) => word.startsWith(query)))) return 2;
  if (terms.some((term) => term.includes(query))) return 3;
  return Number.POSITIVE_INFINITY;
}

function normalize(value: string) {
  return value.trim().toLowerCase();
}

function stableHash(value: string) {
  let hash = 0;
  for (const character of value) hash = (hash * 31 + character.charCodeAt(0)) >>> 0;
  return hash;
}
