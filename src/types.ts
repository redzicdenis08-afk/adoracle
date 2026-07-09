export interface AdPayload {
  platform: "facebook" | "instagram" | "tiktok";
  ad_id: string;
  hook_text: string;
  engagement_score: number;
}
