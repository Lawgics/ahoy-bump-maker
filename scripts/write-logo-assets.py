#!/usr/bin/env python3
"""Write production logo SVGs: pure wordmark + [a] favicon."""

from pathlib import Path

ASSETS = Path("/home/mars/projects/ahoy-bump-maker/web/assets")
FONT = "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif"

LOGO = f"""<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 160 40" width="160" height="40" role="img" aria-label="[ahoy]">
  <text x="0" y="32" font-family="{FONT}" font-size="36" font-weight="900" fill="#ffffff" letter-spacing="-0.5">[ahoy]</text>
</svg>
"""

MARK = f"""<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32" width="32" height="32" role="img" aria-label="[a]">
  <text x="16" y="21" text-anchor="middle" font-family="{FONT}" font-size="17" font-weight="900" fill="#ffffff">[a]</text>
</svg>
"""


def main() -> None:
    ASSETS.mkdir(parents=True, exist_ok=True)
    (ASSETS / "ahoy-logo.svg").write_text(LOGO, encoding="utf-8", newline="\n")
    (ASSETS / "ahoy-mark.svg").write_text(MARK, encoding="utf-8", newline="\n")
    print("wrote ahoy-logo.svg, ahoy-mark.svg")


if __name__ == "__main__":
    main()
