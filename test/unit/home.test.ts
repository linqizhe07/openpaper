import { describe, expect, it } from "vitest";
import { defaultHome, HOME_NAME, homeNote, OLD_HOME_NAME } from "../../src/portfolio/home.ts";

/** Where the home is when --home is not given: the new name, the earlier name still honoured, and never a move made by the account itself */
describe("the home directory", () => {
  const user = "/Users/me";
  const at = (...present: string[]) => (p: string) => present.includes(p);

  it("is OPENPAPER_HOME, else BUYER_HOME (the earlier name), else ~/.openpaper, else an earlier version's ~/.buyer-agent-demo, else ~/.openpaper", () => {
    expect(defaultHome({ OPENPAPER_HOME: "/x", BUYER_HOME: "/y" }, user, at())).toBe("/x");
    expect(defaultHome({ BUYER_HOME: "/y" }, user, at())).toBe("/y");
    expect(defaultHome({}, user, at(`${user}/${HOME_NAME}`, `${user}/${OLD_HOME_NAME}`))).toBe(`${user}/${HOME_NAME}`);
    expect(defaultHome({}, user, at(`${user}/${OLD_HOME_NAME}`))).toBe(`${user}/${OLD_HOME_NAME}`);
    expect(defaultHome({}, user, at())).toBe(`${user}/${HOME_NAME}`);
    expect(defaultHome({ OPENPAPER_HOME: "" }, user, at())).toBe(`${user}/${HOME_NAME}`);
  });

  it("says how to move an earlier version's home, and nothing for the new one", () => {
    expect(homeNote(`${user}/${OLD_HOME_NAME}`)).toContain(`mv ${user}/${OLD_HOME_NAME} ${user}/${HOME_NAME}`);
    expect(homeNote(`${user}/${OLD_HOME_NAME}`)).toContain("stop the account");
    expect(homeNote(`${user}/${HOME_NAME}`)).toBeUndefined();
    expect(homeNote("/srv/openpaper-home")).toBeUndefined();
  });
});
