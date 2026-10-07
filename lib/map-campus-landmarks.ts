export type CampusCity = "Los Angeles" | "Boston";

export type MapCampusLandmark = Readonly<{
  id: string;
  label: string;
  city: CampusCity;
  lat: number;
  lng: number;
  sourceURL: string;
}>;

// Public campus orientation anchors, rounded from university-published sources.
// City denotes the search metro, including Pasadena, Cambridge and Medford.
// These are approximate reference points, not home addresses, entrances or
// campus boundaries. Harvard uses Harvard Yard; Tufts uses the Academic Quad.
const campusReferences: MapCampusLandmark[] = [
  {
    id: "ucla",
    label: "UCLA",
    city: "Los Angeles",
    lat: 34.0683,
    lng: -118.4453,
    sourceURL: "https://map.ucla.edu/"
  },
  {
    id: "usc",
    label: "USC · University Park",
    city: "Los Angeles",
    lat: 34.0233,
    lng: -118.2838,
    sourceURL: "https://maps.usc.edu/?id=1928"
  },
  {
    id: "caltech",
    label: "Caltech",
    city: "Los Angeles",
    lat: 34.137,
    lng: -118.125,
    sourceURL: "https://www.caltech.edu/map/campus"
  },
  {
    id: "lmu",
    label: "LMU · Westchester",
    city: "Los Angeles",
    lat: 33.9696,
    lng: -118.4184,
    sourceURL: "https://www.lmu.edu/resources/campusmaps/westchester/"
  },
  {
    id: "csun",
    label: "CSUN",
    city: "Los Angeles",
    lat: 34.2433,
    lng: -118.5288,
    sourceURL: "https://3dmap.csun.edu/?id=1100"
  },
  {
    id: "mit",
    label: "MIT",
    city: "Boston",
    lat: 42.3603,
    lng: -71.092,
    sourceURL: "https://whereis.mit.edu/"
  },
  {
    id: "harvard",
    label: "Harvard · Harvard Yard",
    city: "Boston",
    lat: 42.3742,
    lng: -71.1164,
    sourceURL: "https://map.harvard.edu/"
  },
  {
    id: "bu",
    label: "BU · Charles River",
    city: "Boston",
    lat: 42.3504,
    lng: -71.1089,
    sourceURL: "https://maps.bu.edu/?id=647"
  },
  {
    id: "northeastern",
    label: "Northeastern · Boston",
    city: "Boston",
    lat: 42.3389,
    lng: -71.0903,
    sourceURL: "https://www.northeastern.edu/campusmap/"
  },
  {
    id: "tufts",
    label: "Tufts · Medford/Somerville",
    city: "Boston",
    lat: 42.4076,
    lng: -71.1194,
    sourceURL: "https://campusmaps.tufts.edu/medford/"
  }
];

export const mapCampusLandmarks: readonly MapCampusLandmark[] = Object.freeze(
  campusReferences.map((campus) => Object.freeze(campus))
);

const losAngelesCampuses = Object.freeze(mapCampusLandmarks.filter((campus) => campus.city === "Los Angeles"));
const bostonCampuses = Object.freeze(mapCampusLandmarks.filter((campus) => campus.city === "Boston"));
const noCampuses: readonly MapCampusLandmark[] = Object.freeze([]);

/** Exact supported metro names only; every result is an immutable local subset. */
export function getCampusesByCities(cities: readonly string[]): readonly MapCampusLandmark[] {
  if (!Array.isArray(cities)) return noCampuses;
  const hasLosAngeles = cities.includes("Los Angeles");
  const hasBoston = cities.includes("Boston");
  if (hasLosAngeles && hasBoston) return mapCampusLandmarks;
  if (hasLosAngeles) return losAngelesCampuses;
  if (hasBoston) return bostonCampuses;
  return noCampuses;
}
