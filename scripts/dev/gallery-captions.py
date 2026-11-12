"""
Adds a plain caption bar under each raw gallery screenshot and writes the
final 3:2 images Devpost expects (1800x1200). Captions describe exactly what
the screenshot shows; nothing is drawn over the application itself.

Usage: python -I scripts/dev/gallery-captions.py
"""
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont

RAW = Path("submission/gallery/raw")
OUT = Path("submission/gallery")
W, H = 1800, 1200
BAR = 96
NAVY = (11, 42, 91)
TEAL = (15, 169, 155)
WHITE = (255, 255, 255)
BG = (244, 247, 251)

CAPTIONS = {
    "01-home": ("PACT Protocol", "AI agents hire agents. Payment waits for proof."),
    "02-judge": ("Judge entry point", "A preconfigured, restricted workspace opened with an access code."),
    "03-overview": ("PACT Control overview", "Budget, held funds, captures, and verification outcomes computed from the workspace's own records."),
    "04-contract": ("Contract page", "Pipeline stage, next step, and the policy engine's latest decision with its reasons."),
    "05-verification-failed": ("Verification attempt 1: failed", "The contact form check found no submission at the capture endpoint. Capture blocked."),
    "06-verification-passed": ("Verification attempt 2: passed", "Corrected deliverable: Lighthouse performance 100, accessibility 95, all ten criteria met."),
    "07-evidence": ("Evidence taken by the verifier", "Screenshots at three viewports and the form confirmation, stored append-only with hashes."),
    "08-agent-runs": ("Agent runs and tool executions", "Every model session and tool call is recorded with a correlation ID and token counts."),
    "09-agents": ("Agent directory", "Buyer, worker, and verifier roles with separate identities, tools, and capabilities."),
    "10-passport": ("Trust Passport", "Reputation computed only from signed receipts and recorded verification runs."),
    "11-audit": ("Audit history", "Policy decisions, transitions, agent messages, and PayPal events in one searchable log."),
    "12-verification-methods": ("Verification methods", "What actually runs for each criterion: HTTP, Chromium, Lighthouse, form capture, JSON Schema."),
    "13-developers": ("Developer documentation", "Authentication, idempotency, lifecycles, errors, webhooks, and every endpoint."),
    "14-policy": ("Spending policy", "Caps, budgets, cold-start limits, and human approval rules enforced by the policy engine."),
}


def font(size: int, bold: bool = False):
    for name in (["segoeuib.ttf", "arialbd.ttf"] if bold else ["segoeui.ttf", "arial.ttf"]):
        try:
            return ImageFont.truetype(name, size)
        except OSError:
            continue
    return ImageFont.load_default()


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    title_font = font(30, bold=True)
    body_font = font(24)
    for path in sorted(RAW.glob("*.png")):
        key = path.stem
        title, body = CAPTIONS.get(key, (key, ""))
        src = Image.open(path).convert("RGB")
        # Fit the screenshot above the caption bar, preserving its aspect ratio.
        area_h = H - BAR
        scale = min(W / src.width, area_h / src.height)
        resized = src.resize((round(src.width * scale), round(src.height * scale)), Image.LANCZOS)
        canvas = Image.new("RGB", (W, H), BG)
        canvas.paste(resized, ((W - resized.width) // 2, (area_h - resized.height) // 2))
        draw = ImageDraw.Draw(canvas)
        draw.rectangle([0, area_h, W, H], fill=NAVY)
        draw.rectangle([0, area_h, W, area_h + 4], fill=TEAL)
        draw.text((40, area_h + 20), title, font=title_font, fill=WHITE)
        tw = draw.textlength(title, font=title_font)
        draw.text((40 + tw + 28, area_h + 26), body, font=body_font, fill=(214, 226, 244))
        canvas.save(OUT / f"{key}.png", optimize=True)
        print("wrote", key)


if __name__ == "__main__":
    main()
