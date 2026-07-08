# Ad Scoring Model

## Engagement score

    ctr = clicks / impressions
    ctr_normalized = min(ctr / 0.05, 1.0) * 100   # 5% CTR = 100
    cpc = spend / clicks
    cpc_score = max(0, 100 - (cpc / max_cpc) * 100)
    engagement_score = (ctr_normalized * 0.6) + (cpc_score * 0.4)

## Hook strength score

| Hooks detected | Score |
|---|---|
| 0 | 0 |
| 1 | 40 |
| 2 | 70 |
| 3+ | 100 |

## Final score

    final_score = (engagement_score * 0.7) + (hook_score * 0.3)

| Score | Interpretation |
|---|---|
| 80-100 | High-performer - study and model this ad |
| 60-79 | Solid - test hook variations |
| 40-59 | Mediocre - rewrite the headline |
| 0-39 | Poor - do not model this creative |
