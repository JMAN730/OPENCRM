import asyncio
import pandas as pd
import httpx
from playwright.async_api import async_playwright
import sys
import argparse
import re
import os
import json
from urllib.parse import quote_plus

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

def emit_progress(total_queries, completed_queries, failed_queries, scraped_count, query=None, status=None, error=None):
    payload = {
        "event": "progress",
        "totalQueries": total_queries,
        "completedQueries": completed_queries,
        "failedQueries": failed_queries,
        "scrapedCount": scraped_count,
    }
    if query:
        payload["query"] = query
    if status:
        payload["status"] = status
    if error:
        payload["error"] = error
    print(json.dumps(payload), flush=True)

def parse_categories_arg(raw):
    if not raw:
        return DEFAULT_CATEGORIES
    return [c.strip() for c in raw.split(",") if c.strip()]

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
        details = {"phone": None, "website": None, "rating": None, "review_count": None}
        try:
            await page.goto(maps_url, wait_until="domcontentloaded", timeout=30000)
            await page.wait_for_selector("div[role='main'], body", timeout=10000)
            
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

                ws_el = await panel.query_selector("a[data-item-id='authority'], a[aria-label*='website'], a[aria-label*='Website'], a[href^='http']")
                if ws_el:
                    details["website"] = await ws_el.get_attribute("href")

                rating_el = await panel.query_selector('[role="img"][aria-label*="stars"], span[aria-hidden="true"]')
                if rating_el:
                    rating_label = await rating_el.get_attribute("aria-label")
                    rating_text = rating_label or await rating_el.inner_text()
                    if rating_text:
                        rating_match = re.search(r'([0-5](?:\.\d)?)', rating_text)
                        if rating_match:
                            details["rating"] = rating_match.group(1)

                text = await panel.inner_text()
                review_match = re.search(r'([\d,]+)\s+reviews', text, re.IGNORECASE)
                if review_match:
                    details["review_count"] = review_match.group(1).replace(",", "")
        except Exception as e:
            # print(f"Error getting details for {maps_url}: {e}")
            pass
        finally:
            await page.close()
        return details

async def scrape_gmaps(browser_context, search_query, max_results=50):
    page = await browser_context.new_page()
    print(f"Searching: {search_query}")
    try:
        await page.goto(f"https://www.google.com/maps/search/{quote_plus(search_query)}", wait_until="domcontentloaded", timeout=30000)
        
        try:
            consent = await page.wait_for_selector("button:has-text('Accept all'), button:has-text('I agree')", timeout=5000)
            if consent: await consent.click(timeout=5000)
        except Exception: pass
        
        try: await page.wait_for_selector("div[role='feed'], a[href^='https://www.google.com/maps/place/']", timeout=15000)
        except Exception: pass
        
        found_places = []
        visited_urls = set()
        
        while len(found_places) < max_results:
            links = await page.query_selector_all("a[href^='https://www.google.com/maps/place/']")
            if not links: break

            for link in links:
                if len(found_places) >= max_results: break
                url = await link.get_attribute("href")
                if not url or url in visited_urls: continue
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
    finally:
        await page.close()

    print(f"Collected {len(found_places)} places for '{search_query}'. Fetching details in parallel...")
    
    details_semaphore = asyncio.Semaphore(5)
    tasks = [get_business_details(browser_context, p["URL"], details_semaphore) for p in found_places]
    results_details = await asyncio.gather(*tasks, return_exceptions=True)
    
    final_results = []
    for place, details in zip(found_places, results_details):
        if isinstance(details, Exception):
            print(f"Detail lookup failed for {place['Name']}: {details}")
            continue
        if details["phone"]:
            final_results.append({
                "Name": place["Name"],
                "Phone": details["phone"],
                "Website": details["website"],
                "Rating": details["rating"],
                "ReviewCount": details["review_count"],
                "Google Maps URL": place["URL"],
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
        return {"completed": True, "failed": False, "scraped": 0}

    search_query = f"{category} in {location}"
    print(f"\n--- Processing: {search_query} ---")
    
    try:
        data = await scrape_gmaps(browser_context, search_query, limit)
    except Exception as e:
        print(f"Error processing {search_query}: {e}")
        return {"completed": False, "failed": True, "scraped": 0, "error": str(e)}

    if not data:
        print(f"No businesses with phone numbers found for {category} in {location}.")
        progress_set.add((location, category))
        save_progress(output_dir, progress_set)
        return {"completed": True, "failed": False, "scraped": 0}

    # Parallel website check
    check_semaphore = asyncio.Semaphore(10)
    
    async def process_lead(b):
        if (b["Name"], b["Phone"]) in existing_leads:
            return None
        
        is_valid_ws = await check_website(http_client, b["Website"], check_semaphore)
        if not is_valid_ws:
            return {
                "Name": b["Name"],
                "Phone": b["Phone"],
                "Website": b.get("Website"),
                "Rating": b.get("Rating"),
                "ReviewCount": b.get("ReviewCount"),
                "Google Maps URL": b.get("Google Maps URL"),
            }
        return None

    tasks = [process_lead(b) for b in data]
    checked = await asyncio.gather(*tasks, return_exceptions=True)
    new_leads = []
    for result in checked:
        if isinstance(result, Exception):
            print(f"Website check failed for {search_query}: {result}")
            continue
        if result:
            new_leads.append(result)

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
    return {"completed": True, "failed": False, "scraped": len(new_leads)}

async def run_scraper(locations, categories, limit=20, output_dir=".", concurrency=1, stop_check=None):
    os.makedirs(output_dir, exist_ok=True)
    total_queries = len(locations) * len(categories)
    completed_queries = 0
    failed_queries = 0
    scraped_count = 0
    progress_lock = asyncio.Lock()

    async def record_progress(query, result):
        nonlocal completed_queries, failed_queries, scraped_count
        async with progress_lock:
            if result.get("failed"):
                failed_queries += 1
            else:
                completed_queries += 1
            scraped_count += int(result.get("scraped") or 0)
            emit_progress(
                total_queries,
                completed_queries,
                failed_queries,
                scraped_count,
                query=query,
                status="failed" if result.get("failed") else "completed",
                error=result.get("error"),
            )
    
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
                        tasks = [(cat, process_category(context, client, location, cat, limit, output_dir, existing_leads, progress_set)) for cat in chunk]
                        results = await asyncio.gather(*(task for _, task in tasks), return_exceptions=True)
                        for (cat, _), result in zip(tasks, results):
                            query = f"{cat} in {location}"
                            if isinstance(result, Exception):
                                await record_progress(query, {"failed": True, "scraped": 0, "error": str(result)})
                            else:
                                await record_progress(query, result)
                else:
                    # Sequential across categories
                    for category in categories:
                        if stop_check and stop_check(): break
                        result = await process_category(context, client, location, category, limit, output_dir, existing_leads, progress_set)
                        await record_progress(f"{category} in {location}", result)

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

    categories = parse_categories_arg(args.categories)

    await run_scraper(locations, categories, args.limit, args.output_dir, args.concurrency)

if __name__ == "__main__":
    asyncio.run(main())
