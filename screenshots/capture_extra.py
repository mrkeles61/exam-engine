"""Capture drill-down + interactive-state screenshots.

Extends capture.py: after login, go through the full student flow (results ->
student detail V4), hit the pipeline monitor, and click a histogram bar on
Analytics to show the filter pill.
"""
import os, sys, time
from pathlib import Path
from playwright.sync_api import sync_playwright

OUT = Path(__file__).resolve().parent
BASE = "http://localhost:3000"

def log(m):
    try: print(m, flush=True)
    except UnicodeEncodeError: print(m.encode("ascii","replace").decode(), flush=True)

with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)
    ctx = browser.new_context(viewport={"width": 1440, "height": 900})
    page = ctx.new_page()
    page.set_default_timeout(15000)

    # Login
    log("login")
    page.goto(f"{BASE}/login", wait_until="networkidle")
    page.fill('input[type="email"]', "admin@university.edu")
    page.fill('input[type="password"]', "admin123")
    page.click('button[type="submit"]')
    page.wait_for_url(lambda u: "/login" not in u, timeout=15000)

    # Get first job id + student id via API
    resp = page.request.get(f"{BASE}/api/jobs", headers={
        "Authorization": f"Bearer {page.evaluate('localStorage.getItem(\"access_token\")')}"
    })
    job_id = resp.json()[0]["id"]
    log(f"job_id={job_id}")

    token = page.evaluate('localStorage.getItem("access_token")')
    rres = page.request.get(f"{BASE}/api/results/{job_id}", headers={"Authorization": f"Bearer {token}"})
    first = rres.json()["results"][0]
    student_id = first["student_id"]
    log(f"student_id={student_id}")

    # 08 — Results page for this job
    log("08-results")
    page.goto(f"{BASE}/results/{job_id}", wait_until="networkidle")
    time.sleep(1.3)
    page.screenshot(path=str(OUT / "08-results.png"), full_page=True)

    # 08b — Results with grade filter (click a bar)
    log("08b-results-filtered")
    try:
        # Click a column in the grade distribution chart
        col = page.locator('div.card').nth(1).locator('div.flex-1').first
        if col.count() > 0:
            col.click()
            time.sleep(0.6)
            page.screenshot(path=str(OUT / "08b-results-filtered.png"), full_page=True)
    except Exception as e:
        log(f"  grade-filter skip: {e}")

    # 09 — Student detail V4
    log("09-student-v4")
    page.goto(f"{BASE}/results/{job_id}/student/{student_id}", wait_until="networkidle")
    time.sleep(1.8)
    page.screenshot(path=str(OUT / "09-student-v4.png"), full_page=True)

    # 10 — Pipeline monitor for this job
    log("10-pipeline")
    page.goto(f"{BASE}/pipeline/{job_id}", wait_until="networkidle")
    time.sleep(1.5)
    page.screenshot(path=str(OUT / "10-pipeline.png"), full_page=True)

    # 12 — Analytics with click-to-filter active
    log("12-analytics-filter")
    page.goto(f"{BASE}/analytics", wait_until="networkidle")
    time.sleep(1.3)
    try:
        # Click the first bar in the histogram (Score Distribution)
        bars = page.locator('section').nth(1).locator('div.flex-1 > div.w-full')
        n = bars.count()
        log(f"  histogram bars found: {n}")
        if n >= 6:
            bars.nth(6).click()  # 60-70% bucket
            time.sleep(0.5)
            page.screenshot(path=str(OUT / "12-analytics-filter.png"), full_page=True)
    except Exception as e:
        log(f"  analytics-filter skip: {e}")

    # 13 — Expanded question difficulty row
    log("13-analytics-question-expanded")
    try:
        rows = page.locator('section').nth(2).locator('div.flex.items-center')
        if rows.count() > 0:
            rows.first.click()
            time.sleep(0.6)
            page.screenshot(path=str(OUT / "13-analytics-question-expanded.png"), full_page=True)
    except Exception as e:
        log(f"  question-expand skip: {e}")

    browser.close()
    log("done")
