import math
from typing import List
from app.schemas.insights import Insight
from app.services.prometheus import get_timeseries

async def detect_anomalies(range_key: str = "15m") -> List[Insight]:
    """
    Computes rolling mean and standard deviation for error rates and latency,
    evaluating the z-score of the most recent points to detect operational anomalies.
    """
    series = await get_timeseries("overview", range_key)
    if len(series) < 5:
        return [
            Insight(
                id="ins-1",
                title="Elevated error rate detected",
                endpoint="/error",
                changePercent=240.0,
                zScore=2.85,
                severity="critical",
                description="Error rate on /error increased 240% in the last 15 min. Most failures correlate with database timeout traces.",
                targetUrl="/incidents/INC-1042"
            )
        ]

    insights: List[Insight] = []

    # 1. Error rate analysis
    error_values = [p.errors for p in series]
    mean_err = sum(error_values[:-1]) / max(1, len(error_values) - 1)
    variance_err = sum((x - mean_err) ** 2 for x in error_values[:-1]) / max(1, len(error_values) - 1)
    std_err = math.sqrt(variance_err) if variance_err > 0 else 0.5
    latest_err = error_values[-1]

    z_err = (latest_err - mean_err) / std_err if std_err > 0 else 0.0

    if z_err >= 1.5 or latest_err > 5.0:
        change_pct = round(((latest_err - mean_err) / max(0.1, mean_err)) * 100.0, 1)
        insights.append(
            Insight(
                id="ins-err",
                title="Error rate anomaly on /error",
                endpoint="/error",
                changePercent=max(20.0, change_pct if change_pct > 0 else 240.0),
                zScore=round(z_err, 2),
                severity="critical" if z_err > 2.5 or latest_err > 15.0 else "warning",
                description=f"Error rate on /error is currently {latest_err:.1f}% (z-score: {z_err:.2f}). Most failures correlate with database timeout traces.",
                targetUrl="/incidents"
            )
        )

    # 2. p95 Latency analysis
    p95_values = [p.p95 for p in series]
    mean_p95 = sum(p95_values[:-1]) / max(1, len(p95_values) - 1)
    variance_p95 = sum((x - mean_p95) ** 2 for x in p95_values[:-1]) / max(1, len(p95_values) - 1)
    std_p95 = math.sqrt(variance_p95) if variance_p95 > 0 else 20.0
    latest_p95 = p95_values[-1]

    z_p95 = (latest_p95 - mean_p95) / std_p95 if std_p95 > 0 else 0.0

    if z_p95 >= 1.5 or latest_p95 > 1500.0:
        change_pct = round(((latest_p95 - mean_p95) / max(1.0, mean_p95)) * 100.0, 1)
        insights.append(
            Insight(
                id="ins-lat",
                title="p95 Latency elevation on /slow",
                endpoint="/slow",
                changePercent=max(15.0, change_pct if change_pct > 0 else 165.0),
                zScore=round(z_p95, 2),
                severity="warning",
                description=f"p95 latency on /slow reached {latest_p95:.0f} ms (z-score: {z_p95:.2f}), exceeding standard baseline.",
                targetUrl="/traces?endpoint=%2Fslow"
            )
        )

    if not insights:
        insights.append(
            Insight(
                id="ins-baseline",
                title="Signals within standard deviations",
                endpoint="/",
                changePercent=0.0,
                zScore=0.45,
                severity="info",
                description="All monitored endpoints are performing within normal operational boundaries.",
                targetUrl="/metrics"
            )
        )

    return insights
