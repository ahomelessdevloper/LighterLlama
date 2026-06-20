import json
import os
import re
import urllib.error
import urllib.parse
import urllib.request
from datetime import date, timedelta

TARGETS = ["lighter", "hyperliquid", "aster"]
DEFAULT_METRICS = [
    "fees",
    "revenue",
    "notional_trading_volume",
    "tvl",
    "open_interest",
    "trade_count",
    "price",
    "market_cap_circulating",
]


def request_json(url: str, api_key: str | None = None) -> dict:
    headers = {"Accept": "application/json", "User-Agent": "Mozilla/5.0"}
    if api_key:
        headers["Authorization"] = f"Bearer {api_key}"
    req = urllib.request.Request(url, headers=headers)
    with urllib.request.urlopen(req, timeout=60) as resp:
        return json.loads(resp.read().decode("utf-8"))


def fetch_explorer_data(slug: str) -> dict:
    url = f"https://tokenterminal.com/explorer/projects/{slug}"
    req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
    with urllib.request.urlopen(req, timeout=30) as resp:
        page_html = resp.read().decode("utf-8", "replace")
    match = re.search(r'<script id="__NEXT_DATA__"[^>]*>(.*?)</script>', page_html)
    if not match:
        raise RuntimeError(f"No explorer data for {slug}")
    page = json.loads(match.group(1))
    return page["props"]["pageProps"]["data"]


def available_metric_ids(explorer_data: dict) -> list[str]:
    availability = explorer_data.get("metric_availability") or {}
    return sorted(metric_id for metric_id, enabled in availability.items() if enabled)


def fetch_project_metrics(
    project_id: str,
    api_key: str,
    metric_ids: list[str] | None = None,
    start: str | None = None,
    end: str | None = None,
) -> dict:
    params: dict[str, str] = {}
    if metric_ids:
        params["metric_ids"] = ",".join(metric_ids)
    if start:
        params["start"] = start
    if end:
        params["end"] = end
    query = urllib.parse.urlencode(params)
    url = f"https://api.tokenterminal.com/v2/projects/{project_id}/metrics"
    if query:
        url = f"{url}?{query}"
    return request_json(url, api_key)


def main() -> None:
    api_key = os.environ.get("TOKEN_TERMINAL_API_KEY", "").strip()
    end = date.today().isoformat()
    start = (date.today() - timedelta(days=30)).isoformat()

    output = {
        "endpoint": "https://api.tokenterminal.com/v2/projects/{project_id}/metrics",
        "query_defaults": {
            "start": start,
            "end": end,
            "metric_ids": "all available metrics when omitted",
        },
        "source": "api" if api_key else "availability_only",
        "projects": [],
    }

    for slug in TARGETS:
        explorer = fetch_explorer_data(slug)
        project = {
            "project_id": slug,
            "name": explorer.get("name"),
            "chains": explorer.get("chains", []),
            "earliest_metric_timestamp": explorer.get("earliest_metric_timestamp"),
            "metric_availability": available_metric_ids(explorer),
            "metrics_url": f"https://api.tokenterminal.com/v2/projects/{slug}/metrics",
        }

        if api_key:
            try:
                requested = [m for m in DEFAULT_METRICS if m in project["metric_availability"]]
                project["metrics"] = fetch_project_metrics(
                    slug,
                    api_key,
                    metric_ids=requested or None,
                    start=start,
                    end=end,
                )
            except urllib.error.HTTPError as exc:
                body = exc.read().decode("utf-8", "replace")
                project["metrics_error"] = {"status": exc.code, "body": body}
        else:
            project["metrics_error"] = {
                "status": 403,
                "body": "TOKEN_TERMINAL_API_KEY not set. Historical metrics require Bearer auth.",
            }

        output["projects"].append(project)

    out_path = os.path.join(os.path.dirname(__file__), "projects_metrics.json")
    with open(out_path, "w", encoding="utf-8") as f:
        json.dump(output, f, indent=2, ensure_ascii=False)

    print(json.dumps(output, indent=2, ensure_ascii=False))
    print(f"\nSaved to {out_path}")


if __name__ == "__main__":
    main()