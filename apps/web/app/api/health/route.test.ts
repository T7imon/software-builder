import { describe, expect, it } from "vitest";

import { GET } from "./route";

describe("web health route", () => {
  it("returns an uncached machine-readable health response", async () => {
    const response = GET();

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    await expect(response.json()).resolves.toEqual({
      service: "software-builder-web",
      status: "ok",
    });
  });
});
