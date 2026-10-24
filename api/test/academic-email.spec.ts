import { describe, expect, it } from "vitest";
import { academicEmailDomain, isAcademicEmail } from "../src/auth/academic-email";

describe("school email detection", () => {
  it("accepts .edu, reserved .edu.xx / .ac.xx and listed schools including their subdomains", () => {
    for (const email of ["a@usc.edu", "a@andrew.cmu.edu", "a@ucl.ac.uk", "a@mails.tsinghua.edu.cn", "a@connect.hku.hk", "a@mail.mcgill.ca", "a@uwaterloo.ca", "a@khazar.org", "A@NYU.EDU"]) {
      expect(isAcademicEmail(email), email).toBe(true);
    }
  });
  it("rejects personal mail, unlisted .org and lookalike domains", () => {
    for (const email of ["a@gmail.com", "a@qq.com", "a@163.com", "a@outlook.com", "a@example.org", "a@redcross.org", "a@edu.com", "a@usc.edu.evil.com",
      "a@notmcgill.ca", "a@ac.uk", "a@edu", "a@kidu-darululum.blogspot.com", "not-an-email", "@usc.edu", "a@bad_domain.edu", "a@-x.edu"]) {
      expect(isAcademicEmail(email), email).toBe(false);
    }
  });
  it("returns the normalized domain", () => {
    expect(academicEmailDomain("Person@Mail.UToronto.ca")).toBe("mail.utoronto.ca");
  });
});
