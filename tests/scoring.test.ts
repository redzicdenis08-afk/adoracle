import { AdPayload } from "../src/types";

describe("Ad Scoring", () => {
  it("should match interface fields", () => {
    const payload: AdPayload = {
      platform: "instagram",
      ad_id: "ad_1",
      hook_text: "test hook",
      engagement_score: 95
    };
    expect(payload.platform).toBe("instagram");
  });
});
