import asyncio
import pandas as pd
import httpx
from playwright.async_api import async_playwright, Error as PlaywrightError, TimeoutError as PlaywrightTimeoutError
import sys
import argparse
import re
import os
import json
import math
from json import JSONDecodeError
from datetime import datetime
from urllib.parse import quote_plus, urljoin, urlparse

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

CATEGORIES = [
    "Mobile Mechanics",
    "Power washing",
    "landscaping",
    "Tree Removal",
    "Cleaning",
    "Concrete",
    "Fencing Companies",
    "Barbers",
    "Roofers"
]

EMAIL_REGEX = r'[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}'
EMAIL_JUNK_SUBSTRINGS = ("example.", "sentry", "wixpress", "godaddy", "no-reply", "noreply", "@2x")
EMAIL_JUNK_SUFFIXES = (".png", ".jpg", ".jpeg", ".gif", ".webp", ".svg")
CONTACT_PAGE_PATHS = ("contact", "contact-us", "about")
EMAIL_CRAWL_MAX_BYTES = 500_000
SOCIAL_DOMAINS = ["facebook.com", "instagram.com", "linkedin.com", "twitter.com", "t.co", "youtube.com", "tiktok.com"]
VALID_BLOCKED_STATUSES = {401, 403, 405, 429}
WEBSITE_CHECK_TIMEOUT = 12.0
NEARBY_RADIUS_MILES = 10
NOMINATIM_SEARCH_URL = "https://nominatim.openstreetmap.org/search"
OVERPASS_URL = "https://overpass-api.de/api/interpreter"
OSM_HEADERS = {"User-Agent": "lead-generation-tool/1.0"}
CSV_FORMULA_PREFIXES = ("=", "+", "-", "@", "\t", "\r", "\n")
CALL_SHEET_COLUMNS = [
    "Call Priority",
    "Priority Score",
    "Priority Reason",
    "Name",
    "Phone",
    "Normalized Phone",
    "Category",
    "Location",
    "Website Reason",
    "Website Status",
    "Rating",
    "Reviews",
    "Website",
    "Website Domain",
    "Source",
    "Source URL",
    "Google Maps URL",
    "Facebook URL",
]

def build_chain_regex(chains):
    chains = [chain.strip() for chain in chains if chain and chain.strip()]
    if not chains:
        return None
    return re.compile(r'\b(' + '|'.join(re.escape(c) for c in chains) + r')\b', re.IGNORECASE)

_CHAIN_RE = build_chain_regex(EXCLUDED_CHAINS)

def is_chain(name, chain_regex=None):
    if not name: return False
    chain_regex = chain_regex if chain_regex is not None else _CHAIN_RE
    return bool(chain_regex and chain_regex.search(name))

def warn(message):
    print(f"Warning: {message}", file=sys.stderr)

def is_social_media(url):
    if not url: return False
    hostname = urlparse(url).hostname or ""
    hostname = hostname.lower()
    return any(hostname == domain or hostname.endswith(f".{domain}") for domain in SOCIAL_DOMAINS)

def is_facebook_url(url):
    if not url:
        return False
    hostname = urlparse(normalize_website_url(url) or "").hostname or ""
    hostname = hostname.lower()
    return hostname == "facebook.com" or hostname.endswith(".facebook.com")

def normalize_website_url(url):
    if not url:
        return None

    url = url.strip()
    if not url or url.startswith("/"):
        return None

    parsed = urlparse(url)
    if not parsed.scheme:
        url = f"https://{url}"
        parsed = urlparse(url)

    if parsed.scheme not in {"http", "https"} or not parsed.netloc:
        return None

    return url

def extract_email_from_html(html, preferred_domain=None):
    """Pull the most plausible contact email out of page HTML.

    Prefers an address whose domain matches the business's own website domain
    so we don't pick up a web designer's or plugin vendor's email by accident.
    """
    if not html:
        return None
    haystack = html[:EMAIL_CRAWL_MAX_BYTES]
    candidates = re.findall(r'mailto:([^"\'>\s?]+)', haystack, re.IGNORECASE)
    candidates.extend(re.findall(EMAIL_REGEX, haystack))
    seen = set()
    cleaned = []
    for candidate in candidates:
        email = candidate.strip().strip(".").lower()
        if not re.fullmatch(EMAIL_REGEX, email):
            continue
        if email in seen:
            continue
        if any(junk in email for junk in EMAIL_JUNK_SUBSTRINGS):
            continue
        if email.endswith(EMAIL_JUNK_SUFFIXES):
            continue
        seen.add(email)
        cleaned.append(email)
    if not cleaned:
        return None
    if preferred_domain:
        for email in cleaned:
            domain = email.split("@", 1)[1]
            if domain == preferred_domain or domain.endswith(f".{preferred_domain}"):
                return email
    return cleaned[0]

async def crawl_contact_email(client, base_url, semaphore, preferred_domain=None):
    """Fetch likely contact pages looking for an email the homepage didn't have."""
    headers = {"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"}
    base = base_url if base_url.endswith("/") else f"{base_url}/"
    for path in CONTACT_PAGE_PATHS:
        target = urljoin(base, path)
        async with semaphore:
            try:
                response = await asyncio.wait_for(
                    client.get(target, timeout=10.0, follow_redirects=True, headers=headers),
                    timeout=WEBSITE_CHECK_TIMEOUT,
                )
            except (httpx.HTTPError, asyncio.TimeoutError):
                continue
        if response.status_code >= 400:
            continue
        if not response.headers.get("content-type", "").startswith("text/html"):
            continue
        try:
            email = extract_email_from_html(response.text, preferred_domain)
        except Exception:
            email = None
        if email:
            return email
    return None

async def check_website(client, url, semaphore):
    """Returns website validation details for a business URL."""
    url = normalize_website_url(url)
    if not url:
        return {"is_valid": False, "url": None, "status_code": None, "reason": "missing_or_invalid_url"}

    hostname = urlparse(url).hostname or ""
    if hostname == "google.com" or hostname.endswith(".google.com"):
        return {"is_valid": False, "url": url, "status_code": None, "reason": "google_url"}
    if is_social_media(url):
        return {"is_valid": False, "url": url, "status_code": None, "reason": "social_media"}
    
    async with semaphore:
        try:
            headers = {"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"}
            response = await asyncio.wait_for(
                client.get(url, timeout=10.0, follow_redirects=True, headers=headers),
                timeout=WEBSITE_CHECK_TIMEOUT,
            )
            is_valid = response.status_code < 400 or response.status_code in VALID_BLOCKED_STATUSES
            reason = "reachable" if response.status_code < 400 else f"http_{response.status_code}"
            # The homepage body is already in hand — mine it for a contact
            # email at zero extra request cost.
            email = None
            if response.headers.get("content-type", "").startswith("text/html"):
                try:
                    email = extract_email_from_html(response.text, normalize_domain(url))
                except Exception:
                    email = None
            return {
                "is_valid": is_valid,
                "url": str(response.url) if response.url else url,
                "status_code": response.status_code,
                "reason": reason,
                "email": email,
            }
        except httpx.HTTPError as e:
            return {"is_valid": False, "url": url, "status_code": None, "reason": e.__class__.__name__}
        except asyncio.TimeoutError:
            return {"is_valid": False, "url": url, "status_code": None, "reason": "TimeoutError"}

async def get_business_details(browser_context, maps_url, semaphore):
    """Opens a fresh page for the specific Maps URL to ensure correct details."""
    async with semaphore:
        page = await browser_context.new_page()
        details = {"phone": None, "website": None, "email": None, "rating": None, "reviews": None}
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

                text = await panel.inner_text()
                if not details["phone"]:
                    match = re.search(r'(\+?\d{1,3}[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}', text)
                    if match: details["phone"] = match.group(0)

                email_match = re.search(EMAIL_REGEX, text)
                if email_match:
                    details["email"] = email_match.group(0)

                ws_el = await panel.query_selector("a[data-item-id='authority'], a[aria-label*='website'], a[aria-label*='Website']")
                if ws_el:
                    details["website"] = await ws_el.get_attribute("href")

                # Extract rating and review count
                rating_match = re.search(r'(\d\.\d)\s*\((\d[\d,]*)\s*reviews?\)', text, re.IGNORECASE)
                if not rating_match:
                    # Try alternate pattern: rating and review count on separate lines
                    rating_match = re.search(r'(\d\.\d)\s*\n\s*\(?([\d,]+)\)?', text)
                if rating_match:
                    details["rating"] = float(rating_match.group(1))
                    details["reviews"] = int(rating_match.group(2).replace(',', ''))
                else:
                    # Try aria-label on rating element
                    rating_el = await panel.query_selector("[aria-label*='stars'], [aria-label*=' star']")
                    if rating_el:
                        aria = await rating_el.get_attribute("aria-label")
                        if aria:
                            r = re.search(r'\b([\d.]+)\b\s*star', aria, re.IGNORECASE)
                            if r:
                                details["rating"] = float(r.group(1))
        except PlaywrightError as e:
            warn(f"Could not read business details for {maps_url}: {e}")
        finally:
            if not page.is_closed():
                await page.close()
        return details

async def scrape_gmaps(browser_context, search_query, max_results=50, stop_check=None, chain_regex=None):
    page = await browser_context.new_page()
    print(f"Searching: {search_query}")
    try:
        await page.goto(f"https://www.google.com/maps/search/{quote_plus(search_query)}")

        try:
            consent = await page.wait_for_selector("button:has-text('Accept all')", timeout=5000)
            if consent: await consent.click()
        except PlaywrightTimeoutError:
            pass

        try:
            await page.wait_for_selector("div[role='feed']", timeout=15000)
        except PlaywrightTimeoutError:
            warn(f"Search results feed did not load for '{search_query}' within 15 seconds.")

        found_places = []
        visited_urls = set()

        while len(found_places) < max_results:
            if stop_check and stop_check(): break
            links = await page.query_selector_all("a[href^='https://www.google.com/maps/place/']")
            if not links: break

            for link in links:
                if len(found_places) >= max_results: break
                url = await link.get_attribute("href")
                if url in visited_urls: continue
                visited_urls.add(url)

                aria_label = await link.get_attribute("aria-label") or ""
                name = aria_label or await link.inner_text()
                if is_chain(name, chain_regex): continue

                # Pull rating and review count directly from feed aria-label
                # e.g. "Joe's Landscaping 4.7 stars 89 reviews · Landscaping · Toledo, OH"
                feed_rating, feed_reviews = None, None
                rv_match = re.search(r'([\d.]+)\s*stars?\s+([\d,]+)\s*reviews?', aria_label, re.IGNORECASE)
                if rv_match:
                    feed_rating = float(rv_match.group(1))
                    feed_reviews = int(rv_match.group(2).replace(',', ''))

                found_places.append({"Name": name, "URL": url, "Rating": feed_rating, "Reviews": feed_reviews})

            feed = await page.query_selector("div[role='feed']")
            if feed:
                await feed.evaluate("el => el.scrollBy(0, 1000)")
                await asyncio.sleep(2)
                if await page.query_selector("text='reached the end'"): break
            else: break
    finally:
        if not page.is_closed():
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
                "Website": details["website"],
                "Email": details["email"],
                # Prefer feed data (fast & reliable); fall back to detail-page extraction
                "Rating": place["Rating"] if place["Rating"] is not None else details["rating"],
                "Reviews": place["Reviews"] if place["Reviews"] is not None else details["reviews"],
                "Google Maps URL": place["URL"],
                "Source": "google",
                "Source URL": place["URL"],
            })

    return final_results

def load_existing_leads(output_path):
    if os.path.exists(output_path):
        try:
            df = pd.read_csv(output_path)
            keys = set()
            for row in df.to_dict("records"):
                keys.update(get_lead_dedupe_keys(row))
            return keys
        except (OSError, KeyError, pd.errors.ParserError) as e:
            warn(f"Could not read existing leads from {output_path}: {e}")
            return set()
    return set()

def normalize_phone(phone):
    if not phone:
        return None
    digits = re.sub(r'\D+', '', str(phone))
    if len(digits) == 11 and digits.startswith("1"):
        digits = digits[1:]
    return digits or None

def normalize_domain(url):
    normalized = normalize_website_url(url)
    if not normalized:
        return None
    hostname = urlparse(normalized).hostname or ""
    hostname = hostname.lower()
    return hostname[4:] if hostname.startswith("www.") else hostname

def get_lead_dedupe_keys(lead):
    keys = set()
    phone = normalize_phone(lead.get("Phone"))
    maps_url = lead.get("Google Maps URL")
    domain = normalize_domain(lead.get("Website"))
    name = str(lead.get("Name") or "").strip().lower()

    if phone:
        keys.add(f"phone:{phone}")
    if maps_url:
        keys.add(f"maps:{maps_url}")
    if domain:
        keys.add(f"domain:{domain}")
    if name and phone:
        keys.add(f"name_phone:{name}:{phone}")
    return keys

def score_lead(lead):
    score = 0
    reasons = []
    website_reason = lead.get("Website Reason")
    rating = lead.get("Rating")
    reviews = lead.get("Reviews")

    if website_reason == "missing_or_invalid_url":
        score += 35
        reasons.append("no website")
    elif website_reason in {"social_media", "google_url"}:
        score += 30
        reasons.append("no standalone website")
    elif website_reason:
        score += 25
        reasons.append(f"website issue: {website_reason}")

    try:
        reviews_value = int(reviews) if reviews is not None and not pd.isna(reviews) else None
    except (TypeError, ValueError):
        reviews_value = None
    if reviews_value is not None:
        if reviews_value >= 100:
            score += 25
            reasons.append("100+ reviews")
        elif reviews_value >= 25:
            score += 18
            reasons.append("25+ reviews")
        elif reviews_value >= 5:
            score += 10
            reasons.append("some review history")

    try:
        rating_value = float(rating) if rating is not None and not pd.isna(rating) else None
    except (TypeError, ValueError):
        rating_value = None
    if rating_value is not None:
        if rating_value >= 4.5:
            score += 15
            reasons.append("strong rating")
        elif rating_value >= 4.0:
            score += 10
            reasons.append("good rating")
        elif rating_value < 3.5:
            score -= 10
            reasons.append("low rating")

    if lead.get("Phone"):
        score += 15
        reasons.append("phone available")
    if lead.get("Email"):
        score += 5
        reasons.append("email available")

    score = max(0, min(100, score))
    if score >= 70:
        priority = "High"
    elif score >= 45:
        priority = "Medium"
    else:
        priority = "Low"

    return {
        "Priority Score": score,
        "Call Priority": priority,
        "Priority Reason": "; ".join(reasons) if reasons else "limited qualification signals",
    }

def add_priority_fields(lead):
    scored = dict(lead)
    scored.update(score_lead(scored))
    return scored

def sanitize_csv_value(value):
    if isinstance(value, str) and value.startswith(CSV_FORMULA_PREFIXES):
        return f"'{value}"
    return value

def sanitize_csv_frame(df):
    sanitized = df.copy()
    for column in sanitized.columns:
        sanitized[column] = sanitized[column].map(sanitize_csv_value)
    return sanitized

def load_lines_file(path):
    with open(path, 'r') as f:
        return [line.strip() for line in f if line.strip() and not line.strip().startswith("#")]

def dedupe_preserve_order(values):
    seen = set()
    result = []
    for value in values:
        value = str(value).strip()
        if not value:
            continue
        key = value.lower()
        if key in seen:
            continue
        seen.add(key)
        result.append(value)
    return result

def location_suffix(location):
    parts = [part.strip() for part in str(location).split(",")]
    if len(parts) > 1:
        return ", ".join(part for part in parts[1:] if part)
    return ""

def format_nearby_location(name, base_location):
    suffix = location_suffix(base_location)
    if suffix and "," not in name:
        return f"{name}, {suffix}"
    return name

def haversine_miles(lat1, lon1, lat2, lon2):
    radius_miles = 3958.8
    lat1, lon1, lat2, lon2 = map(math.radians, [lat1, lon1, lat2, lon2])
    dlat = lat2 - lat1
    dlon = lon2 - lon1
    a = math.sin(dlat / 2) ** 2 + math.cos(lat1) * math.cos(lat2) * math.sin(dlon / 2) ** 2
    return radius_miles * 2 * math.asin(math.sqrt(a))

async def geocode_location(client, location):
    params = {"q": location, "format": "jsonv2", "limit": 1}
    response = await client.get(NOMINATIM_SEARCH_URL, params=params, headers=OSM_HEADERS)
    response.raise_for_status()
    matches = response.json()
    if not matches:
        return None
    match = matches[0]
    return float(match["lat"]), float(match["lon"])

async def fetch_nearby_places(client, location, radius_miles=NEARBY_RADIUS_MILES):
    geocoded = await geocode_location(client, location)
    if not geocoded:
        return []
    lat, lon = geocoded
    radius_meters = int(radius_miles * 1609.344)
    query = f"""
    [out:json][timeout:25];
    (
      nwr["place"~"^(city|town|village|suburb)$"](around:{radius_meters},{lat},{lon});
    );
    out center tags;
    """
    response = await client.post(OVERPASS_URL, data={"data": query}, headers=OSM_HEADERS)
    response.raise_for_status()
    places = []
    for element in response.json().get("elements", []):
        tags = element.get("tags") or {}
        name = tags.get("name")
        if not name:
            continue
        place_lat = element.get("lat") or (element.get("center") or {}).get("lat")
        place_lon = element.get("lon") or (element.get("center") or {}).get("lon")
        if place_lat is None or place_lon is None:
            distance = radius_miles
        else:
            distance = haversine_miles(lat, lon, float(place_lat), float(place_lon))
            if distance > radius_miles:
                continue
        places.append((distance, format_nearby_location(name, location)))
    places.sort(key=lambda item: (item[0], item[1].lower()))
    return [name for _, name in places]

async def expand_locations_with_nearby(client, locations, radius_miles=NEARBY_RADIUS_MILES):
    expanded = []
    for location in dedupe_preserve_order(locations):
        expanded.append(location)
        try:
            nearby = await fetch_nearby_places(client, location, radius_miles=radius_miles)
        except (httpx.HTTPError, ValueError, KeyError, TypeError, JSONDecodeError) as e:
            warn(f"Could not expand nearby cities for '{location}': {e.__class__.__name__}")
            continue
        for nearby_location in nearby:
            if nearby_location.lower() != location.lower():
                expanded.append(nearby_location)
    return dedupe_preserve_order(expanded)

def load_preset(path):
    with open(path, "r") as f:
        data = json.load(f)
    if not isinstance(data, dict):
        raise ValueError("preset must be a JSON object")
    return data

def save_preset(path, config):
    with open(path, "w") as f:
        json.dump(config, f, indent=2)

def coerce_positive_int(value, field_name):
    try:
        value = int(value)
    except (TypeError, ValueError):
        raise ValueError(f"{field_name} must be a whole number") from None
    if value < 1:
        raise ValueError(f"{field_name} must be at least 1")
    return value

def coerce_string_list(value, field_name):
    if value is None:
        return None
    if not isinstance(value, list):
        raise ValueError(f"{field_name} must be a list")
    return [str(item).strip() for item in value if str(item).strip()]

def get_progress_path(output_dir, output_file):
    output_name = os.path.splitext(os.path.basename(output_file))[0]
    return os.path.join(output_dir, f"{output_name}.progress.json")

def load_progress(output_dir, output_file):
    progress_path = get_progress_path(output_dir, output_file)
    if os.path.exists(progress_path):
        try:
            with open(progress_path, 'r') as f:
                return set(tuple(x) for x in json.load(f))
        except (OSError, JSONDecodeError, TypeError) as e:
            print(f"Warning: Could not read progress file ({e}). Starting fresh — all categories will be re-scraped.")
            return set()
    return set()

def progress_key(location, category):
    return (location, category)

def is_progress_done(progress_set, location, category):
    return (location, category) in progress_set or ("google", location, category) in progress_set

def save_progress(output_dir, output_file, completed_set):
    progress_path = get_progress_path(output_dir, output_file)
    temp_path = f"{progress_path}.tmp"
    with open(temp_path, 'w') as f:
        json.dump(list(completed_set), f)
    os.replace(temp_path, progress_path)

def get_call_sheet_path(output_dir, output_file):
    output_name = os.path.splitext(os.path.basename(output_file))[0]
    return os.path.join(output_dir, f"{output_name}_call_sheet.csv")

def get_summary_path(output_dir, output_file):
    output_name = os.path.splitext(os.path.basename(output_file))[0]
    return os.path.join(output_dir, f"{output_name}_summary.json")

def create_run_summary(locations, categories, output_file):
    return {
        "started_at": datetime.now().isoformat(timespec="seconds"),
        "completed_at": None,
        "locations": list(locations),
        "categories": list(categories),
        "output_file": output_file,
        "categories_started": 0,
        "categories_completed": 0,
        "businesses_with_phone": 0,
        "lead_candidates": 0,
        "leads_written": 0,
        "dry_run_leads": 0,
        "duplicates_skipped": 0,
        "valid_websites_skipped": 0,
        "dry_run": False,
        "by_category": {},
        "by_location": {},
        "by_website_reason": {},
    }

def increment_summary(summary, key, amount=1):
    if summary is not None:
        summary[key] = summary.get(key, 0) + amount

def increment_nested(summary, section, key, amount=1):
    if summary is not None:
        bucket = summary.setdefault(section, {})
        bucket[key] = bucket.get(key, 0) + amount

def write_json_atomic(path, data):
    temp_path = f"{path}.tmp"
    with open(temp_path, "w") as f:
        json.dump(data, f, indent=2)
    os.replace(temp_path, path)

def write_call_sheet(output_dir, output_file, leads):
    if not leads:
        return
    call_sheet_path = get_call_sheet_path(output_dir, output_file)
    df = pd.DataFrame(leads)
    df = df[[c for c in CALL_SHEET_COLUMNS if c in df.columns]]
    df = df.sort_values(by=["Priority Score"], ascending=False)
    df = sanitize_csv_frame(df)
    write_header = not os.path.exists(call_sheet_path)
    df.to_csv(call_sheet_path, mode='a', header=write_header, index=False)

def align_frame_for_csv_append(df, output_path, default_columns):
    if os.path.exists(output_path):
        try:
            existing_columns = list(pd.read_csv(output_path, nrows=0).columns)
        except (OSError, pd.errors.ParserError) as e:
            warn(f"Could not read existing CSV header from {output_path}: {e}")
        else:
            if existing_columns:
                return df.reindex(columns=existing_columns)
    return df.reindex(columns=default_columns)

def print_run_summary(summary):
    if not summary:
        return
    print("\nRun summary")
    print(f"- Categories completed: {summary.get('categories_completed', 0)}/{summary.get('categories_started', 0)}")
    print(f"- Businesses with phone: {summary.get('businesses_with_phone', 0)}")
    print(f"- Lead candidates: {summary.get('lead_candidates', 0)}")
    print(f"- Leads written: {summary.get('leads_written', 0)}")
    if summary.get("dry_run"):
        print(f"- Dry-run leads: {summary.get('dry_run_leads', 0)}")
    print(f"- Duplicates skipped: {summary.get('duplicates_skipped', 0)}")
    print(f"- Valid websites skipped: {summary.get('valid_websites_skipped', 0)}")
async def process_category(browser_context, http_client, location, category, limit, output_dir, existing_leads, progress_set, output_file, state_lock, stop_check=None, chain_regex=None, dry_run=False, call_sheet=False, summary=None):
    async with state_lock:
        if is_progress_done(progress_set, location, category):
            print(f"Skipping {category} in {location} (already completed)")
            return
        increment_summary(summary, "categories_started")
        increment_nested(summary, "by_category", category, 0)
        increment_nested(summary, "by_location", location, 0)

    search_query = f"{category} in {location}"
    print(f"\n--- Processing: {search_query} ---")

    try:
        data = await asyncio.wait_for(scrape_gmaps(browser_context, search_query, limit, stop_check=stop_check, chain_regex=chain_regex), timeout=180)
    except asyncio.TimeoutError:
        print(f"Timed out scraping {category} in {location}. Skipping (will retry on next run).")
        return

    if not data:
        print(f"No businesses with phone numbers found for {category} in {location}.")
        if dry_run:
            print(f"Dry run: progress not updated for {category} in {location}.")
        else:
            async with state_lock:
                progress_set.add(progress_key(location, category))
                save_progress(output_dir, output_file, progress_set)
        async with state_lock:
            increment_summary(summary, "categories_completed")
        return

    async with state_lock:
        increment_summary(summary, "businesses_with_phone", len(data))
        increment_nested(summary, "by_category", category, len(data))
        increment_nested(summary, "by_location", location, len(data))

    # Parallel website check
    check_semaphore = asyncio.Semaphore(10)

    async def process_lead(b):
        async with state_lock:
            if get_lead_dedupe_keys(b) & existing_leads:
                return {"status": "duplicate"}

        website_check = await check_website(http_client, b["Website"], check_semaphore)
        if website_check["is_valid"]:
            return {"status": "valid_website"}

        # Email fallback chain: Maps panel → homepage body → contact pages.
        email = b["Email"] or website_check.get("email")
        normalized_site = normalize_website_url(b["Website"])
        if (
            not email
            and normalized_site
            and not is_social_media(normalized_site)
            and website_check["reason"] not in {"missing_or_invalid_url", "google_url"}
        ):
            email = await crawl_contact_email(
                http_client,
                website_check["url"] or normalized_site,
                check_semaphore,
                normalize_domain(b["Website"]),
            )

        facebook_url = b.get("Facebook URL") or (b.get("Website") if is_facebook_url(b.get("Website")) else None)
        return {
            "status": "lead",
            "lead": add_priority_fields({
                "Name": b["Name"],
                "Phone": b["Phone"],
                "Normalized Phone": normalize_phone(b["Phone"]),
                "Email": email,
                "Website": b["Website"],
                "Website Domain": normalize_domain(b["Website"]),
                "Website Checked URL": website_check["url"],
                "Website Status": website_check["status_code"],
                "Website Reason": website_check["reason"],
                "Rating": b.get("Rating"),
                "Reviews": b.get("Reviews"),
                "Source": b.get("Source", "google"),
                "Source URL": b.get("Source URL") or b.get("Google Maps URL"),
                "Google Maps URL": b.get("Google Maps URL"),
                "Facebook URL": facebook_url,
            })
        }

    tasks = [process_lead(b) for b in data]
    lead_results = await asyncio.gather(*tasks)
    new_leads = []
    duplicate_count = 0
    valid_website_count = 0
    for result in lead_results:
        if not result:
            continue
        if result["status"] == "duplicate":
            duplicate_count += 1
        elif result["status"] == "valid_website":
            valid_website_count += 1
        elif result["status"] == "lead":
            new_leads.append(result["lead"])

    async with state_lock:
        increment_summary(summary, "lead_candidates", len(new_leads))
        increment_summary(summary, "duplicates_skipped", duplicate_count)
        increment_summary(summary, "valid_websites_skipped", valid_website_count)

        fresh_leads = []
        fresh_keys = []
        fresh_key_set = set()
        final_duplicate_count = 0
        for lead in new_leads:
            lead_keys = get_lead_dedupe_keys(lead)
            if lead_keys & existing_leads or lead_keys & fresh_key_set:
                final_duplicate_count += 1
                continue
            fresh_keys.extend(lead_keys)
            fresh_key_set.update(lead_keys)
            fresh_leads.append(lead)
        increment_summary(summary, "duplicates_skipped", final_duplicate_count)

        if fresh_leads:
            output_path = os.path.join(output_dir, output_file)

            df_new = pd.DataFrame(fresh_leads)
            df_new["Category"] = category
            df_new["Location"] = location

            cols = ["Name", "Phone", "Normalized Phone", "Email", "Website", "Website Domain", "Website Checked URL", "Website Status", "Website Reason", "Call Priority", "Priority Score", "Priority Reason", "Rating", "Reviews", "Source", "Source URL", "Google Maps URL", "Facebook URL", "Category", "Location"]
            df_new = df_new[[c for c in cols if c in df_new.columns]]
            df_new = sanitize_csv_frame(df_new)

            if dry_run:
                print(f"Dry run: found {len(fresh_leads)} leads for {category} in {location}; CSV not written.")
            else:
                write_header = not os.path.exists(output_path)
                df_new.to_csv(output_path, mode='a', header=write_header, index=False)
                if call_sheet:
                    write_call_sheet(output_dir, output_file, fresh_leads)
            existing_leads.update(fresh_keys)
            for lead in fresh_leads:
                increment_nested(summary, "by_website_reason", lead.get("Website Reason") or "unknown")
            if dry_run:
                increment_summary(summary, "dry_run_leads", len(fresh_leads))
            else:
                increment_summary(summary, "leads_written", len(fresh_leads))
            if not dry_run:
                print(f"Saved {len(fresh_leads)} new leads for {category} in {location}.")
        else:
            print(f"No new leads found for {category} in {location}.")

        if dry_run:
            print(f"Dry run: progress not updated for {category} in {location}.")
        else:
            progress_set.add(progress_key(location, category))
            save_progress(output_dir, output_file, progress_set)
        increment_summary(summary, "categories_completed")

async def run_scraper(locations, limit=20, output_dir=".", concurrency=1, stop_check=None, categories=None, output_file=None, excluded_chains=None, dry_run=False, call_sheet=False, summary_report=True, include_nearby=True, nearby_radius_miles=NEARBY_RADIUS_MILES):
    if limit < 1:
        raise ValueError("limit must be at least 1")
    if concurrency < 1:
        raise ValueError("concurrency must be at least 1")

    if categories is None:
        categories = CATEGORIES
    if not categories:
        raise ValueError("at least one category is required")
    if excluded_chains is None:
        excluded_chains = EXCLUDED_CHAINS
    chain_regex = build_chain_regex(excluded_chains)
    if output_file is None:
        output_file = f"leads_{datetime.now().strftime('%Y%m%d_%H%M%S')}.csv"
    # Strip any path components and ensure .csv extension to block path traversal
    output_file = os.path.basename(output_file)
    if not output_file.endswith('.csv'):
        output_file += '.csv'
    if not dry_run:
        os.makedirs(output_dir, exist_ok=True)

    print(f"Output file: {os.path.join(output_dir, output_file)}")
    print(f"Progress file: {get_progress_path(output_dir, output_file)}")
    if call_sheet:
        print(f"Call sheet: {get_call_sheet_path(output_dir, output_file)}")
    if dry_run:
        print("Dry run enabled: no CSV or progress files will be written.")

    async with httpx.AsyncClient(timeout=20.0, follow_redirects=True) as client:
        original_locations = dedupe_preserve_order(locations)
        if include_nearby:
            print(f"Expanding locations with nearby cities within {nearby_radius_miles:g} miles...")
            locations = await expand_locations_with_nearby(client, original_locations, nearby_radius_miles)
            original_keys = {location.lower() for location in original_locations}
            added_locations = [location for location in locations if location.lower() not in original_keys]
            if added_locations:
                print(f"Added {len(added_locations)} nearby location(s): {', '.join(added_locations)}")
            else:
                print("No nearby locations added.")
        else:
            locations = original_locations

        progress_set = load_progress(output_dir, output_file)
        existing_leads = load_existing_leads(os.path.join(output_dir, output_file))
        state_lock = asyncio.Lock()
        summary = create_run_summary(locations, categories, output_file)
        summary["dry_run"] = dry_run
        summary["nearby_expansion"] = {
            "enabled": include_nearby,
            "radius_miles": nearby_radius_miles,
            "input_locations": original_locations,
            "expanded_locations": locations,
        }

        async with async_playwright() as p:
            browser = await p.chromium.launch(headless=True)
            context = await browser.new_context(user_agent="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36")

            for location in locations:
                if stop_check and stop_check(): break
                print(f"\n{'#'*60}")
                print(f"Location: {location}")
                print(f"{'#'*60}")

                if concurrency > 1:
                    chunks = [categories[i:i + concurrency] for i in range(0, len(categories), concurrency)]
                    for chunk in chunks:
                        if stop_check and stop_check(): break
                        tasks = [process_category(context, client, location, cat, limit, output_dir, existing_leads, progress_set, output_file, state_lock, stop_check=stop_check, chain_regex=chain_regex, dry_run=dry_run, call_sheet=call_sheet, summary=summary) for cat in chunk]
                        await asyncio.gather(*tasks)
                else:
                    for category in categories:
                        if stop_check and stop_check(): break
                        await process_category(context, client, location, category, limit, output_dir, existing_leads, progress_set, output_file, state_lock, stop_check=stop_check, chain_regex=chain_regex, dry_run=dry_run, call_sheet=call_sheet, summary=summary)

            await browser.close()

    if stop_check and stop_check():
        print("\nScraping stopped by user.")
    else:
        print(f"\nAll searches completed. Results are in: {output_dir}")
    summary["completed_at"] = datetime.now().isoformat(timespec="seconds")
    print_run_summary(summary)
    if summary_report and not dry_run:
        write_json_atomic(get_summary_path(output_dir, output_file), summary)
        print(f"Summary report: {get_summary_path(output_dir, output_file)}")
    return summary

async def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("location", nargs="?", help="Location to search (e.g., 'Toledo, Ohio')")
    parser.add_argument("--file", help="File containing locations (one per line)")
    parser.add_argument("--limit", type=int, default=None, help="Limit per category per location")
    parser.add_argument("--output-dir", default=None, help="Directory to save leads (default: current folder)")
    parser.add_argument("--output-file", default=None, help="Filename for the CSV output (default: timestamped leads_YYYYMMDD_HHMMSS.csv)")
    parser.add_argument("--concurrency", type=int, default=None, help="Number of categories to process in parallel per location")
    parser.add_argument("--categories-file", help="File containing categories to search (one per line)")
    parser.add_argument("--exclude-chains-file", help="File containing chain names to exclude (one per line)")
    parser.add_argument("--dry-run", action="store_true", help="Run searches and validation without writing CSV or progress files")
    parser.add_argument("--call-sheet", action="store_true", help="Also write a call-ready CSV sorted by priority within each batch")
    parser.add_argument("--no-nearby", action="store_true", help="Do not add nearby cities/suburbs to the location list")
    parser.add_argument("--nearby-radius", type=float, default=None, help="Nearby city/suburb radius in miles (default: 10)")
    parser.add_argument("--preset", help="Load run settings from a JSON preset")
    parser.add_argument("--save-preset", help="Save the resolved run settings to a JSON preset and exit")
    args = parser.parse_args()

    preset = load_preset(args.preset) if args.preset else {}
    try:
        limit = coerce_positive_int(args.limit if args.limit is not None else preset.get("limit", 20), "limit")
        concurrency = coerce_positive_int(args.concurrency if args.concurrency is not None else preset.get("concurrency", 1), "concurrency")
    except ValueError as e:
        parser.error(str(e))
    output_dir = args.output_dir if args.output_dir is not None else preset.get("output_dir", ".")
    output_file = args.output_file if args.output_file is not None else preset.get("output_file")
    dry_run = args.dry_run or bool(preset.get("dry_run", False))
    call_sheet = args.call_sheet or bool(preset.get("call_sheet", False))
    include_nearby = not args.no_nearby and bool(preset.get("include_nearby", True))
    nearby_radius_miles = args.nearby_radius if args.nearby_radius is not None else float(preset.get("nearby_radius_miles", NEARBY_RADIUS_MILES))
    if nearby_radius_miles <= 0:
        parser.error("--nearby-radius must be greater than 0")
    categories_file = args.categories_file or preset.get("categories_file")
    exclude_chains_file = args.exclude_chains_file or preset.get("exclude_chains_file")
    file_path = args.file or preset.get("file")
    location = args.location or preset.get("location")

    locations = []
    if file_path:
        locations = load_lines_file(file_path)
    elif location:
        locations = [location]
    elif preset.get("locations"):
        try:
            locations = coerce_string_list(preset["locations"], "locations")
        except ValueError as e:
            parser.error(str(e))
    else:
        print("Please provide a location or a file with locations.")
        sys.exit(1)
    if not locations:
        parser.error("at least one location is required")

    try:
        categories = load_lines_file(categories_file) if categories_file else coerce_string_list(preset.get("categories"), "categories")
        excluded_chains = load_lines_file(exclude_chains_file) if exclude_chains_file else coerce_string_list(preset.get("excluded_chains"), "excluded_chains")
    except ValueError as e:
        parser.error(str(e))
    if categories is not None and not categories:
        parser.error("--categories-file must contain at least one category")

    if args.save_preset:
        save_preset(args.save_preset, {
            "locations": locations,
            "limit": limit,
            "output_dir": output_dir,
            "output_file": output_file,
            "concurrency": concurrency,
            "categories": categories,
            "excluded_chains": excluded_chains,
            "dry_run": dry_run,
            "call_sheet": call_sheet,
            "include_nearby": include_nearby,
            "nearby_radius_miles": nearby_radius_miles,
        })
        print(f"Saved preset: {args.save_preset}")
        return

    await run_scraper(
        locations,
        limit,
        output_dir,
        concurrency,
        categories=categories,
        output_file=output_file,
        excluded_chains=excluded_chains,
        dry_run=dry_run,
        call_sheet=call_sheet,
        include_nearby=include_nearby,
        nearby_radius_miles=nearby_radius_miles,
    )

if __name__ == "__main__":
    asyncio.run(main())
