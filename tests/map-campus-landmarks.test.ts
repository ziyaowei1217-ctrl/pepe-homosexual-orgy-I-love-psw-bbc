import { describe, expect, it } from "vitest";

import { getCampusesByCities, mapCampusLandmarks } from "../lib/map-campus-landmarks";

describe("public campus reference landmarks", () => {
  it("covers the curated campuses once, with five references per supported metro", () => {
    expect(mapCampusLandmarks).toHaveLength(10);
    expect(new Set(mapCampusLandmarks.map((campus) => campus.id)).size).toBe(10);
    expect(getCampusesByCities(["Los Angeles"]).map((campus) => campus.id))
      .toEqual(["ucla", "usc", "caltech", "lmu", "csun"]);
    expect(getCampusesByCities(["Boston"]).map((campus) => campus.id))
      .toEqual(["mit", "harvard", "bu", "northeastern", "tufts"]);
  });

  it("keeps approximate anchors within the published campus areas, without swapped coordinates", () => {
    const campusAreas: Record<string, readonly [number, number, number, number]> = {
      ucla: [34.063, 34.075, -118.453, -118.438],
      usc: [34.018, 34.027, -118.291, -118.278],
      caltech: [34.134, 34.142, -118.130, -118.120],
      lmu: [33.965, 33.974, -118.424, -118.414],
      csun: [34.236, 34.252, -118.535, -118.522],
      mit: [42.356, 42.366, -71.104, -71.086],
      harvard: [42.371, 42.377, -71.120, -71.112],
      bu: [42.347, 42.354, -71.120, -71.100],
      northeastern: [42.335, 42.343, -71.095, -71.082],
      tufts: [42.404, 42.412, -71.125, -71.113]
    };
    for (const campus of mapCampusLandmarks) {
      const [minLat, maxLat, minLng, maxLng] = campusAreas[campus.id];
      expect(Number.isFinite(campus.lat)).toBe(true);
      expect(Number.isFinite(campus.lng)).toBe(true);
      expect(campus.lat).toBeGreaterThan(minLat);
      expect(campus.lat).toBeLessThan(maxLat);
      expect(campus.lng).toBeGreaterThan(minLng);
      expect(campus.lng).toBeLessThan(maxLng);
      expect(campus.lat).toBe(Number(campus.lat.toFixed(4)));
      expect(campus.lng).toBe(Number(campus.lng.toFixed(4)));
    }
  });

  it("links only to HTTPS maps on each referenced university's own domain", () => {
    const sourceDomains: Record<string, string> = {
      ucla: "ucla.edu",
      usc: "usc.edu",
      caltech: "caltech.edu",
      lmu: "lmu.edu",
      csun: "csun.edu",
      mit: "mit.edu",
      harvard: "harvard.edu",
      bu: "bu.edu",
      northeastern: "northeastern.edu",
      tufts: "tufts.edu"
    };
    for (const campus of mapCampusLandmarks) {
      const source = new URL(campus.sourceURL);
      const domain = sourceDomains[campus.id];
      expect(source.protocol).toBe("https:");
      expect(source.hostname === domain || source.hostname.endsWith(`.${domain}`)).toBe(true);
      expect(source.username).toBe("");
      expect(source.password).toBe("");
      expect(source.port).toBe("");
      expect(campus.label.length).toBeGreaterThan(0);
      expect(campus.label.length).toBeLessThanOrEqual(40);
    }
  });

  it("returns stable bounded subsets regardless of order, duplicates or unknown cities", () => {
    const both = getCampusesByCities(["Boston", "Los Angeles", "Boston", "Unknown"]);
    expect(both).toBe(mapCampusLandmarks);
    expect(getCampusesByCities(["Los Angeles", "Boston"])).toBe(both);
    expect(getCampusesByCities(Array.from({ length: 1000 }, () => "Boston")))
      .toBe(getCampusesByCities(["Boston"]));
    expect(getCampusesByCities(["Unknown", "Los Angeles"]))
      .toBe(getCampusesByCities(["Los Angeles"]));
  });

  it.each(["__proto__", "constructor", "toString", "hasOwnProperty", "los angeles", "boston", " Boston ", "Cambridge", ""])(
    "does not turn unsupported city input %s into campus references",
    (city) => {
      expect(getCampusesByCities([city])).toEqual([]);
      expect(getCampusesByCities([city, "Boston"])).toBe(getCampusesByCities(["Boston"]));
    }
  );

  it("does not accept a lookup object or boxed strings as supported city input", () => {
    expect(getCampusesByCities({ Boston: true } as unknown as readonly string[])).toEqual([]);
    expect(getCampusesByCities([new String("Boston")] as unknown as readonly string[])).toEqual([]);
    expect(getCampusesByCities([])).toEqual([]);
  });

  it("freezes records and cached subsets so callers cannot alter shared coordinates or links", () => {
    const campus = mapCampusLandmarks[0];
    const originalLat = campus.lat;
    expect(Object.isFrozen(mapCampusLandmarks)).toBe(true);
    expect(mapCampusLandmarks.every(Object.isFrozen)).toBe(true);
    expect(Reflect.set(campus, "lat", 0)).toBe(false);
    expect(campus.lat).toBe(originalLat);
    for (const cities of [[], ["Boston"], ["Los Angeles"], ["Boston", "Los Angeles"]]) {
      expect(Object.isFrozen(getCampusesByCities(cities))).toBe(true);
    }
  });
});
