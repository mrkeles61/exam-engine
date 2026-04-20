"""One-shot capture: log in, navigate every page, save PNGs to screenshots/."""
import os, sys, time
from pathlib import Path
from playwright.sync_api import sync_playwright

OUT = Path(__file__).resolve().parent
BASE = "http://localhost:3000"

PAGES = [
    ("01-login",        "/login",                       None),
    ("02-dashboard",    "/",                            "logged_in"),
    ("03-jobs",         "/jobs",                        "logged_in"),
    ("04-analytics",    "/analytics",                   "logged_in"),
    ("05-answer-keys",  "/answer-keys",                 "logged_in"),
    ("06-upload",       "/upload",                      "logged_in"),
    ("07-exam-builder", "/exam-builder",                "logged_in"),
    ("08-topnav-close", "/",                            "logged_in"),   # close-up crop handled in JS
]

def log(m):
    try: print(m, flush=True)
    except UnicodeEncodeError: print(m.encode("ascii", "replace").decode(), flush=True)

with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)
    ctx = browser.new_context(viewport={"width": 1440, "height": 900})
    page = ctx.new_page()
    page.set_default_timeout(15000)

    # 1. Login page screenshot first (pre-auth)
    log("→ login page")
    page.goto(f"{BASE}/login", wait_until="networkidle")
    page.screenshot(path=str(OUT / "01-login.png"), full_page=True)

    # 2. Fill demo credentials then submit
    log("→ submitting demo login")
    try:
        page.fill('input[type="email"]', "admin@university.edu")
        page.fill('input[type="password"]', "admin123")
        page.click('button[type="submit"]')
        page.wait_for_url(lambda u: "/login" not in u, timeout=15000)
    except Exception as e:
        log(f"  login fallback: setting token manually ({e})")
        # If the form differs, poke a token in and reload
        page.evaluate("localStorage.setItem('access_token', 'demo')")
        page.goto(f"{BASE}/")

    # 3. Walk every page
    for label, path, _ in PAGES[1:]:
        log(f"→ {label} {path}")
        page.goto(f"{BASE}{path}", wait_until="networkidle")
        time.sleep(1.2)   # allow count-up / charts to settle
        page.screenshot(path=str(OUT / f"{label}.png"), full_page=True)

    # 4. Drill into the first evaluation → results → a student (V4)
    log("→ results + student-v4")
    page.goto(f"{BASE}/jobs", wait_until="networkidle")
    time.sleep(1.0)
    try:
        first = page.locator('a:has-text("Detay"), a[href^="/results/"]').first
        if first.count() > 0:
            first.click()
            page.wait_for_load_state("networkidle")
            time.sleep(1.2)
            page.screenshot(path=str(OUT / "08-results.png"), full_page=True)
            # Click first student row
            srow = page.locator('a[href*="/student/"]').first
            if srow.count() > 0:
                srow.click()
                page.wait_for_load_state("networkidle")
                time.sleep(1.5)
                page.screenshot(path=str(OUT / "09-student-v4.png"), full_page=True)
    except Exception as e:
        log(f"  results/student skipped: {e}")

    # 5. Pipeline monitor (needs a job id)
    log("→ pipeline monitor")
    try:
        # Grab first job id via the API
        resp = page.request.get(f"{BASE}/api/jobs", headers={"Authorization": "Bearer demo"})
        if resp.ok:
            jobs = resp.json()
            if jobs:
                job_id = jobs[0].get("id") or jobs[0].get("job_id")
                if job_id:
                    page.goto(f"{BASE}/pipeline/{job_id}", wait_until="networkidle")
                    time.sleep(1.5)
                    page.screenshot(path=str(OUT / "10-pipeline.png"), full_page=True)
    except Exception as e:
        log(f"  pipeline skipped: {e}")

    # 6. Language toggle — EN view
    log("→ EN variant of dashboard")
    try:
        page.goto(f"{BASE}/", wait_until="networkidle")
        en = page.get_by_role("button", name="EN")
        if en.count() > 0:
            en.first.click()
            time.sleep(0.8)
            page.screenshot(path=str(OUT / "11-dashboard-en.png"), full_page=True)
    except Exception as e:
        log(f"  EN toggle skipped: {e}")

    browser.close()
    log("done")
