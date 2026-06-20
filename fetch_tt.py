import json
import os
import re
import urllib.error
import urllib.request

TARGETS = ["lighter", "hyperliquid", "aster"]
API_URL = "https://api.tokenterminal.com/v2/projects"


def fetch_api_projects(api_key: str) -> list[dict]:
    req = urllib.request.Request(
        API_URL,
        headers={"Authorization": f"Bearer {api_key}", "Accept": "application/json"},
    )
    with urllib.request.urlopen(req, timeout=30) as resp:
        payload = json.loads(resp.read().decode("utf-8"))
    return payload.get("data", payload)


def fetch_explorer_project(slug: str) -> dict:
    url = f"https://tokenterminal.com/explorer/projects/{slug}"
    req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
    with urllib.request.urlopen(req, timeout=30) as resp:
        html = resp.read().decode("utf-8", "replace")
    match = re.search(r'<script id="__NEXT_DATA__"[^>]*>(.*?)</script>', html)
    if not match:
        raise RuntimeError(f"No embedded data found for {slug}")
    page = json.loads(match.group(1))
    return page["props"]["pageProps"]["data"]


def to_api_shape(explorer_data: dict) -> dict:
    return {
        "name": explorer_data.get("name"),
        "project_id": explorer_data.get("api_id") or explorer_data.get("data_id"),
        "coingecko_id": explorer_data.get("coingecko_id"),
        "symbol": explorer_data.get("symbol"),
        "url": f"https://api.tokenterminal.com/v2/projects/{explorer_data.get('api_id') or explorer_data.get('data_id')}/metrics",
        "is_archived": bool(explorer_data.get("is_archived", False)),
        "archived_reason": explorer_data.get("archived_reason"),
        "maintenance_reason": explorer_data.get("maintenance_reason"),
        "products": explorer_data.get("products", []),
        "chains": explorer_data.get("chains", []),
        "market_sectors": explorer_data.get("market_sectors", []),
        "links": explorer_data.get("links", []),
        "price_data": explorer_data.get("price_data"),
        "business_model": explorer_data.get("business_model"),
        "description_who": explorer_data.get("description_who"),
        "description_what": explorer_data.get("description_what"),
        "description_how": explorer_data.get("description_how"),
        "tier": explorer_data.get("tier"),
        "flattened_tags": explorer_data.get("flattened_tags"),
    }


def main() -> None:
    api_key = os.environ.get("TOKEN_TERMINAL_API_KEY", "").strip()
    results: list[dict] = []
    source = "api"

    if api_key:
        try:
            all_projects = fetch_api_projects(api_key)
            by_id = {p.get("project_id"): p for p in all_projects}
            for slug in TARGETS:
                if slug in by_id:
                    results.append(by_id[slug])
                else:
                    results.append({"project_id": slug, "error": "not found in /v2/projects"})
        except urllib.error.HTTPError as exc:
            source = "explorer_fallback"
            print(f"API error {exc.code}: {exc.read().decode('utf-8', 'replace')}")
        except Exception as exc:
            source = "explorer_fallback"
            print(f"API failed: {exc}")
    else:
        source = "explorer_fallback"
        print("TOKEN_TERMINAL_API_KEY not set; using public explorer page data.")

    if source == "explorer_fallback":
        for slug in TARGETS:
            explorer = fetch_explorer_project(slug)
            results.append(to_api_shape(explorer))

    output = {"source": source, "projects": results}
    out_path = os.path.join(os.path.dirname(__file__), "projects_data.json")
    with open(out_path, "w", encoding="utf-8") as f:
        json.dump(output, f, indent=2, ensure_ascii=False)

    print(json.dumps(output, indent=2, ensure_ascii=False))
    print(f"\nSaved to {out_path}")


if __name__ == "__main__":
    main()