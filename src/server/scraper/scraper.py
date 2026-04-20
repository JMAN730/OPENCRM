import asyncio
import pandas as pd
import httpx
from playwright.async_api import async_playwright
import sys
import argparse
import re
import os
import json

# List of popular chains to exclude
EXCLUDED_CHAINS = [
    "mcdonald's", "mcdonalds", "starbucks", "subway", "burger king", "wendy's", "wendys",
    "kfc", "taco bell", "dunkin", "pizza hut", "domino's", "dominos", "applebee's", "applebees",
    "walmart", "target", "kroger", "cvs", "walgreens", "rite aid", "costco", "aldi", "whole foods",
    "jcpenney", "jc penney", "macy's", "macys", "kohls", "kohl's", "nordstrom", "best buy",
    "home depot", "lowe's", "lowes", "ikea", "staples", "office depot", "petsmart", "petco",
    "shell", "bp", "exxon", "chevron", "7-eleven", "7 eleven", "circle k",
    "marriott", "hilton", "holiday inn", "hyatt", "sheraton", "best western", "t-mobile", "verizon", "att", "at&t"
]

DEFAULT_CATEGORIES = [
    "Mobile Mechanics", 
    "Power washing Business", 
    "landscaping", 
    "Tree Removal", 
    "Cleaning", 
    "Concrete", 
    "Fencing Companies"
]

def is_chain(name):
    if not name: return False
    name_lower = name.lower()
    return any(chain in name_lower for chain in EXCLUDED_CHAINS)

def is_social_media(url):
    if not url: return False
    social_domains = ["facebook.com", "instagram.com", "linkedin.com", "twitter.com", "t.co", "youtube.com", "tiktok.com"]
    return any(domain in url.lower() for domain in social_domains)

async def check_website(client, url, semaphore):
    """Returns True ONLY if the business has a VALID, NON-SOCIAL website."""
    if not url: return False
    if "google.com" in url.lower() or url.startswith("/"): return False
    if is_social_media(url): return False
    
    async with semaphore:
        try:
            headers = {"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"}
            response = await client.get(url, timeout=10.0, follow_redirects=True, headers=headers)
            return response.status_code == 200
        except:
            return False

async def get_business_details(browser_context, maps_url, semaphore):
    """Opens a fresh page for the specific Maps URL to ensure correct details."""
    async with semaphore:
        page = await browser_context.new_page()
        details = {"phone": None, "website": None}
        try:
            await page.goto(maps_url)
            await page.wait_for_selector("div[role='main']", timeout=10000)
            
            panel = await page.query_selector("div[role='main']")
            if panel:
                phone_el = await panel.query_selector("button[data-item-id^='phone:tel:'], a[href^='tel:']")
                if phone_el:
                    phone_data = await phone_el.get_attribute("data-item-id")
                    if phone_data and "phone:tel:" in phone_data:
                        details["phone"] = phone_data.replace("phone:tel:", "")
                    else:
                        phone_href = await phone_el.get_attribute("href")
                        if phone_href: details["phone"] = phone_href.replace("tel:", "")
                
                if not details["phone"]:
                    text = await panel.inner_text()
                    match = re.search(r'(\+?\d{1,3}[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}', text)
                    if match: details["phone"] = match.group(0)

                ws_el = await panel.query_selector("a[data-item-id='authority'], a[aria-label*='website'], a[aria-label*='Website']")
                if ws_el:
                    details["website"] = await ws_el.get_attribute("href")
        except Exception as e:
            # print(f"Error getting details for {maps_url}: {e}")
            pass
        finally:
            await page.close()
        return details

async def scrape_gmaps(browser_context, search_query, max_results=50):
    page = await browser_context.new_page()
    print(f"Searching: {search_query}")
    await page.goto(f"https://www.google.com/maps/search/{search_query.replace(' ', '+')}")
    
    try:
        consent = await page.wait_for_selector("button:has-text('Accept all')", timeout=5000)
        if consent: await consent.click()
    except: pass
    
    try: await page.wait_for_selector("div[role='feed']", timeout=15000)
    except: pass
    
    found_places = []
    visited_urls = set()
    
    while len(found_places) < max_results:
        links = await page.query_selector_all("a[href^='https://www.google.com/maps/place/']")
        if not links: break

        for link in links:
            if len(found_places) >= max_results: break
            url = await link.get_attribute("href")
            if url in visited_urls: continue
            visited_urls.add(url)
            
            name = await link.get_attribute("aria-label") or await link.inner_text()
            if is_chain(name): continue
            
            found_places.append({"Name": name, "URL": url})

        feed = await page.query_selector("div[role='feed']")
        if feed:
            await feed.evaluate("el => el.scrollBy(0, 1000)")
            await asyncio.sleep(2)
            if await page.query_selector("text='reached the end'"): break
        else: break
    
    await page.close()

    print(f"Collected {len(found_places)} places for '{search_query}'. Fetching details in parallel...")
    
    details_semaphore = asyncio.Semaphore(5)
    tasks = [get_business_details(browser_context, p["URL"], details_semaphore) for p in found_places]
    results_details = await asyncio.gather(*tasks)
    
    final_results = []
    for place, details in zip(found_places, results_details):
        if details["phone"]:
            final_results.append({
                "Name": place["Name"],
                "Phone": details["phone"],
                "Website": details["website"]
            })
    
    return final_results

def load_existing_leads(output_path):
    if os.path.exists(output_path):
        try:
            df = pd.read_csv(output_path)
            # Normalize phone numbers for better deduplication if needed
            return set(zip(df['Name'], df['Phone']))
        except:
            return set()
    return set()

def load_progress(output_dir):
    progress_path = os.path.join(output_dir, "progress.json")
    if os.path.exists(progress_path):
        try:
            with open(progress_path, 'r') as f:
                return set(tuple(x) for x in json.load(f))
        except:
            return set()
    return set()

def save_progress(output_dir, completed_set):
    progress_path = os.path.join(output_dir, "progress.json")
    with open(progress_path, 'w') as f:
        json.dump(list(completed_set), f)

async def process_category(browser_context, http_client, location, category, limit, output_dir, existing_leads, progress_set):
    if (location, category) in progress_set:
        print(f"Skipping {category} in {location} (already completed)")
        return

    search_query = f"{category} in {location}"
    print(f"\n--- Processing: {search_query} ---")
    
    data = await scrape_gmaps(browser_context, search_query, limit)
    if not data:
        print(f"No businesses with phone numbers found for {category} in {location}.")
        progress_set.add((location, category))
        save_progress(output_dir, progress_set)
        return

    # Parallel website check
    check_semaphore = asyncio.Semaphore(10)
    
    async def process_lead(b):
        if (b["Name"], b["Phone"]) in existing_leads:
            return None
        
        is_valid_ws = await check_website(http_client, b["Website"], check_semaphore)
        if not is_valid_ws:
            return {"Name": b["Name"], "Phone": b["Phone"]}
        return None

    tasks = [process_lead(b) for b in data]
    new_leads = [r for r in await asyncio.gather(*tasks) if r]

    if new_leads:
        output_path = os.path.join(output_dir, "leads.csv")
        
        df_new = pd.DataFrame(new_leads)
        df_new["Category"] = category
        df_new["Location"] = location
        
        if os.path.exists(output_path):
            df_existing = pd.read_csv(output_path)
            df_final = pd.concat([df_existing, df_new], ignore_index=True).drop_duplicates(subset=["Name", "Phone"])
        else:
            df_final = df_new
        
        df_final.to_csv(output_path, index=False)
        for l in new_leads:
            existing_leads.add((l["Name"], l["Phone"]))
        print(f"Saved {len(new_leads)} new leads for {category} in {location}.")
    else:
        print(f"No new leads found for {category} in {location}.")
    
    progress_set.add((location, category))
    save_progress(output_dir, progress_set)

async def run_scraper(locations, categories, limit=20, output_dir=".", concurrency=1, stop_check=None):
    os.makedirs(output_dir, exist_ok=True)
    
    progress_set = load_progress(output_dir)
    # Load all existing leads once to keep deduplication consistent
    existing_leads = load_existing_leads(os.path.join(output_dir, "leads.csv"))
    
    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)
        context = await browser.new_context(user_agent="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36")
        
        async with httpx.AsyncClient(timeout=10.0, follow_redirects=True) as client:
            for location in locations:
                if stop_check and stop_check(): break
                print(f"\n{'#'*60}")
                print(f"Location: {location}")
                print(f"{'#'*60}")

                if concurrency > 1:
                    # Parallel across categories
                    chunks = [categories[i:i + concurrency] for i in range(0, len(categories), concurrency)]
                    for chunk in chunks:
                        if stop_check and stop_check(): break
                        tasks = [process_category(context, client, location, cat, limit, output_dir, existing_leads, progress_set) for cat in chunk]
                        await asyncio.gather(*tasks)
                else:
                    # Sequential across categories
                    for category in categories:
                        if stop_check and stop_check(): break
                        await process_category(context, client, location, category, limit, output_dir, existing_leads, progress_set)

        await browser.close()

    if stop_check and stop_check():
        print("\nScraping stopped by user.")
    else:
        print(f"\nAll searches completed. Results are in: {output_dir}")

async def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("location", nargs="?", help="Location to search (e.g., 'Toledo, Ohio')")
    parser.add_argument("--file", help="File containing locations (one per line)")
    parser.add_argument("--categories", help="Comma-separated list of categories")
    parser.add_argument("--limit", type=int, default=20, help="Limit per category per location")
    parser.add_argument("--output-dir", default=".", help="Directory to save leads (default: current folder)")
    parser.add_argument("--concurrency", type=int, default=1, help="Number of categories to process in parallel per location")
    args = parser.parse_args()

    locations = []
    if args.file:
        with open(args.file, 'r') as f:
            locations = [line.strip() for line in f if line.strip()]
    elif args.location:
        locations = [args.location]
    else:
        print("Please provide a location or a file with locations.")
        sys.exit(1)

    categories = DEFAULT_CATEGORIES
    if args.categories:
        categories = [c.strip() for c in args.categories.split(",") if c.strip()]

    await run_scraper(locations, categories, args.limit, args.output_dir, args.concurrency)

if __name__ == "__main__":
    asyncio.run(main())
