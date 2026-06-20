import json
import os
import re
import urllib.request

TARGETS = ["lighter", "hyperliquid", "aster"]


def fetch_explorer(slug: str) -> dict:
    url = f"https://tokenterminal.com/explorer/projects/{slug}"
    req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
    with urllib.request.urlopen(req, timeout=30) as resp:
        html = resp.read().decode("utf-8", "replace")
    page = json.loads(re.search(r'<script id="__NEXT_DATA__"[^>]*>(.*?)</script>', html).group(1))
    return page["props"]["pageProps"]["data"]


def main() -> None:
    root = os.path.dirname(__file__)
    with open(os.path.join(root, "projects_data.json"), encoding="utf-8") as f:
        projects_data = {p["project_id"]: p for p in json.load(f)["projects"]}
    with open(os.path.join(root, "projects_metrics.json"), encoding="utf-8") as f:
        metrics_data = {p["project_id"]: p for p in json.load(f)["projects"]}

    output = []
    for slug in TARGETS:
        explorer = fetch_explorer(slug)
        base = projects_data[slug]
        metrics = metrics_data[slug]
        output.append(
            {
                **base,
                "earliest_metric_timestamp": metrics.get("earliest_metric_timestamp"),
                "metric_availability": metrics.get("metric_availability", []),
                "plots": explorer.get("plots", []),
                "accent": {
                    "lighter": "#22d3ee",
                    "hyperliquid": "#4ade80",
                    "aster": "#a78bfa",
                }[slug],
            }
        )

    out_path = os.path.join(root, "public", "data.json")
    os.makedirs(os.path.dirname(out_path), exist_ok=True)
    with open(out_path, "w", encoding="utf-8") as f:
        json.dump({"updated_at": __import__("datetime").datetime.utcnow().isoformat() + "Z", "projects": output}, f, indent=2)


if __name__ == "__main__":
    main()