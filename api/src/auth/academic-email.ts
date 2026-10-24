import { ACADEMIC_DOMAINS } from "./academic-domains.generated";

let listed: Set<string> | undefined;

// Country codes whose .edu.xx / .ac.xx second level is reserved for schools.
// Restricted suffixes count without a listing; everything else, including any
// .org school, must be on the reviewed university list.
const RESERVED_SECOND_LEVEL = new Set(["edu", "ac"]);

export function academicEmailDomain(email: string): string | null {
  const at = email.lastIndexOf("@");
  if (at < 1) return null;
  const domain = email.slice(at + 1).toLowerCase().replace(/\.$/, "");
  const labels = domain.split(".");
  if (labels.length < 2 || labels.some(label => !/^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?$/.test(label))) return null;
  const top = labels[labels.length - 1];
  if (top === "edu") return domain;
  if (labels.length >= 3 && /^[a-z]{2}$/.test(top) && RESERVED_SECOND_LEVEL.has(labels[labels.length - 2])) return domain;
  listed ??= new Set(ACADEMIC_DOMAINS.split(" "));
  // A school's subdomains (mail.utoronto.ca, g.ucla.edu) belong to the school.
  for (let start = 0; start <= labels.length - 2; start++) {
    if (listed.has(labels.slice(start).join("."))) return domain;
  }
  return null;
}

export const isAcademicEmail = (email: string) => academicEmailDomain(email) !== null;
