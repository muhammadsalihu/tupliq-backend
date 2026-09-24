#!/usr/bin/env python3
"""Print the Tupliq Agent waitlist (tupliq.com/agent signups) as a table.

Reads ADMIN_API_KEY from the VPS backend .env and calls GET /waitlist.
Usage: bash ~/workspace/check-waitlist.sh [limit]
"""
import json
import subprocess
import sys

ENV_FILE = "/srv/production/tupliq-backend/.env"
LIMIT = sys.argv[1] if len(sys.argv) > 1 else "200"


def admin_key() -> str:
    with open(ENV_FILE) as fh:
        for line in fh:
            if line.startswith("ADMIN_API_KEY="):
                return line.split("=", 1)[1].strip()
    return ""


def main() -> int:
    key = admin_key()
    if not key:
        print(f"ADMIN_API_KEY not found in {ENV_FILE}", file=sys.stderr)
        return 1

    out = subprocess.run(
        [
            "curl", "-sS",
            "-H", f"x-admin-key: {key}",
            f"https://api.airbills.digital/waitlist?limit={LIMIT}",
        ],
        capture_output=True, text=True, check=True,
    ).stdout

    data = json.loads(out)
    rows = data.get("entries", [])
    print(f"{data.get('total', 0)} signup(s) total, showing {len(rows)}\n")
    if not rows:
        return 0

    width = max(len(r["email"]) for r in rows)
    print(f"{'signed up (UTC)':<19}  {'email':<{width}}  who / what they want")
    print("-" * (21 + width + 26))
    for r in rows:
        when = r["createdAt"][:19].replace("T", " ")
        extra = " · ".join(x for x in [r.get("name") or "", r.get("goal") or ""] if x)
        print(f"{when:<19}  {r['email']:<{width}}  {extra}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
