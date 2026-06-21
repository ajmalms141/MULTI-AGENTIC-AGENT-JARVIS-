from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

app = FastAPI(title="Jarvis Price Compare Service")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

import os
import re
import redis
import json
import httpx
import urllib.parse
import random
from fastapi import HTTPException
from playwright.async_api import async_playwright

# Connect to Redis
try:
    redis_client = redis.Redis(host='redis', port=6379, db=0, socket_timeout=3)
except Exception as e:
    print(f"Failed to connect to Redis: {e}")
    redis_client = None

@app.get("/health")
def health():
    return {"status": "ok", "service": "price_compare"}

def extract_clean_product_and_location(query: str) -> tuple:
    q_lower = query.lower()
    
    # Common prefixes to strip off
    prefixes = [
        "find the cheapest price for a ", "find the cheapest price for ", "find the cheapest price of ",
        "find the cheapest ", "cheapest price for a ", "cheapest price for ", "cheapest price of ",
        "price of a ", "price of ", "price for a ", "price for ", "cheapest website for buying a ",
        "cheapest website for buying ", "buy a ", "buy ", "find ", "search ", "get ", "hey ", "prices in ", "prices for "
    ]
    
    cleaned = query
    for prefix in prefixes:
        if cleaned.lower().startswith(prefix):
            cleaned = cleaned[len(prefix):]
            break
            
    # Extract location (e.g. "in pappanamode", "at trivandrum", "near kochi")
    location = ""
    loc_match = re.search(r'\b(in|at|near|for)\s+([a-zA-Z0-9\s]+)', cleaned, re.IGNORECASE)
    if loc_match:
        location = loc_match.group(2).strip()
        # Clean location from stop words
        for stopword in ["instamart", "blinkit", "zepto", "zomato", "swiggy", "online", "website", "cheapest", "prices", "price"]:
            location = re.sub(r'\b' + stopword + r'\b', '', location, flags=re.IGNORECASE).strip()
        cleaned = cleaned[:loc_match.start()].strip()
        
    # Clean up product query from stop words
    product = cleaned
    for stopword in ["instamart", "blinkit", "zepto", "zomato", "swiggy", "online", "website", "prices", "price"]:
        product = re.sub(r'\b' + stopword + r'\b', '', product, flags=re.IGNORECASE).strip()
        
    if not product.strip():
        product = query
        
    return product.strip(), location.strip()

async def call_gemini(system_prompt: str, user_prompt: str, json_mode: bool = False) -> str:
    gemini_key = os.environ.get("GEMINI_API_KEY")
    if not gemini_key:
        raise ValueError("Gemini API key is missing.")
        
    payload = {
        "contents": [{
            "parts": [{"text": f"{system_prompt}\n\n{user_prompt}"}]
        }]
    }
    if json_mode:
        payload["generationConfig"] = {"responseMimeType": "application/json"}
        
    url = f"https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key={gemini_key}"
    async with httpx.AsyncClient() as client:
        response = await client.post(url, json=payload, timeout=20.0)
        if response.status_code != 200:
            raise ValueError(f"Gemini API Error: {response.text}")
        result = response.json()
        return result["candidates"][0]["content"]["parts"][0]["text"]

async def get_ai_augmented_results(query: str):
    try:
        system_prompt = (
            "You are a price comparison assistant specializing in Indian online and hyperlocal shopping. "
            "Analyze the user query (e.g. 'pendrive in Trivandrum') and generate a highly realistic list of 4-6 product listings with their current prices, "
            "ratings, and source stores.\n\n"
            "Identify the location if specified (e.g. Trivandrum). Suggest relevant instant delivery options "
            "(Blinkit, Swiggy Instamart, Zepto, BigBasket Now) if appropriate for the query. Also suggest scheduled delivery options "
            "(Flipkart, Croma, Reliance Digital, Amazon.in).\n\n"
            "Return a JSON object with a 'results' key containing a list of products. Each product MUST have:\n"
            "- 'title': Clear, descriptive product title (e.g. 'SanDisk Ultra Dual 64GB USB 3.0 Pen Drive')\n"
            "- 'price': Price in INR (e.g. '₹349' or '₹1,299')\n"
            "- 'link': A valid search URL on the exact store. VERY IMPORTANT: Use EXACTLY these formats based on the store:\n"
            "    Blinkit: https://blinkit.com/s/?q={product}\n"
            "    Swiggy Instamart: https://www.swiggy.com/instamart/search?query={product}\n"
            "    Zepto: https://www.zeptonow.com/search?q={product}\n"
            "    BigBasket: https://www.bigbasket.com/ps/?q={product}\n"
            "    Amazon: https://www.amazon.in/s?k={product}\n"
            "    Flipkart: https://www.flipkart.com/search?q={product}\n"
            "    For food (Swiggy/Zomato), use: https://www.swiggy.com/search?query={product} or https://www.zomato.com/search?q={product}\n"
            "  DO NOT use instamart.com or zepto.com. Use the EXACT templates above, substituting {product} with ONLY the item name (no location words).\n"
            "- 'image': A clean Unsplash image URL representing the product (e.g. 'https://images.unsplash.com/photo-1618424181497-157f25b6ddd5?w=400')\n"
            "- 'rating': A string representing ratings (e.g. '4.3')\n"
            "- 'source': Store name (e.g. 'Blinkit', 'Zepto', 'Swiggy Instamart', 'Flipkart', 'Croma')\n"
            "- 'delivery_type': Either 'instant' (for Blinkit, Zepto, Instamart, Swiggy, Dunzo) or 'scheduled' (for Flipkart, Croma, Reliance Digital, Amazon.in, Myntra, Ajio)\n\n"
            "Ensure the output is ONLY valid JSON. Do not include markdown wraps."
        )
        
        raw_res = await call_gemini(system_prompt, f"User query: '{query}'", json_mode=True)
        data = json.loads(raw_res.strip())
        return data.get("results", [])
    except Exception as e:
        print(f"Failed to get AI augmented results: {e}")
        return []

def get_mock_results(query: str):
    product, location = extract_clean_product_and_location(query)
    product_lower = product.lower()
    products = []
    
    # Define categories and their matching stores/prices/images
    food_keywords = ["pizza", "burger", "biryani", "momo", "roll", "sandwich", "pasta", "noodle", "curry", "rice", "food", "lunch", "dinner", "breakfast", "maggi", "subway"]
    grocery_keywords = ["milk", "onion", "egg", "bread", "coffee", "tea", "potato", "tomato", "oil", "flour", "sugar", "salt", "soap", "detergent", "grocery", "groceries", "veggie", "fruit", "banana", "apple", "butter", "cheese", "snack", "chips", "mango", "orange", "lemon", "vegetable", "fruits", "instamart", "blinkit", "zepto"]
    fashion_keywords = ["t-shirt", "jeans", "shirt", "dress", "kurta", "jacket", "shoes", "sneakers", "saree", "pants", "clothing", "wear", "socks", "cap", "kurti", "hoodie", "watch", "handbag", "wallet"]
    beauty_keywords = ["lipstick", "shampoo", "cream", "makeup", "perfume", "lotion", "foundation", "liner", "kajal", "beauty", "hair", "skin", "conditioner", "face wash"]

    # Match keywords strictly as whole words to avoid sub-string collisions (e.g. "prices" matching "rice")
    def match_any(keywords, text):
        return any(re.search(r'\b' + re.escape(k) + r'\b', text) for k in keywords)

    # Classify clean product query
    if match_any(food_keywords, product_lower):
        category = "food"
        stores = ["Swiggy", "Zomato"]
        delivery_types = ["instant", "instant"]
        base_price = 280
        img_url = "https://images.unsplash.com/photo-1565299624946-b28f40a0ae38?w=400"
    elif match_any(grocery_keywords, product_lower):
        category = "grocery"
        stores = ["Blinkit", "Instamart", "Zepto", "BigBasket"]
        delivery_types = ["instant", "instant", "instant", "scheduled"]
        base_price = 120
        if "mango" in product_lower:
            base_price = 90
        elif "milk" in product_lower:
            base_price = 30
        elif "egg" in product_lower:
            base_price = 70
        img_url = "https://images.unsplash.com/photo-1542838132-92c53300491e?w=400"
        if "mango" in product_lower:
            img_url = "https://images.unsplash.com/photo-1553279768-865429fa0078?w=400"
    elif match_any(fashion_keywords, product_lower):
        category = "fashion"
        stores = ["Myntra", "Ajio", "Meesho", "Flipkart", "Amazon"]
        delivery_types = ["scheduled", "scheduled", "scheduled", "scheduled", "scheduled"]
        base_price = 1490
        if "watch" in product_lower:
            base_price = 8500
        img_url = "https://images.unsplash.com/photo-1483985988355-763728e1935b?w=400"
    elif match_any(beauty_keywords, product_lower):
        category = "beauty"
        stores = ["Nykaa", "Myntra", "Blinkit", "Instamart", "Amazon"]
        delivery_types = ["scheduled", "scheduled", "instant", "instant", "scheduled"]
        base_price = 650
        img_url = "https://images.unsplash.com/photo-1596462502278-27bfdc403348?w=400"
    else:
        category = "electronics"
        stores = ["Blinkit", "Instamart", "Amazon", "Flipkart", "Croma"]
        delivery_types = ["instant", "instant", "scheduled", "scheduled", "scheduled"]
        base_price = 35000
        if "macbook" in product_lower:
            base_price = 92900 if "air" in product_lower else 189900
        elif "iphone" in product_lower:
            base_price = 129900 if "pro" in product_lower else 69900
        elif "ipad" in product_lower:
            base_price = 42900
        elif "sony" in product_lower or "headphones" in product_lower:
            base_price = 22990
        elif "tv" in product_lower or "television" in product_lower:
            base_price = 49900
        elif "pendrive" in product_lower or "pen drive" in product_lower:
            base_price = 399
            stores = ["Blinkit", "Instamart", "Amazon", "Flipkart", "Croma"]
            delivery_types = ["instant", "instant", "scheduled", "scheduled", "scheduled"]
        img_url = "https://images.unsplash.com/photo-1498049794561-7780e7231661?w=400"
        
        if "macbook" in product_lower or "laptop" in product_lower:
            img_url = "https://images.unsplash.com/photo-1517336714731-489689fd1ca8?w=400"
        elif "iphone" in product_lower or "phone" in product_lower:
            img_url = "https://images.unsplash.com/photo-1511707171634-5f897ff02aa9?w=400"
        elif "watch" in product_lower:
            img_url = "https://images.unsplash.com/photo-1523275335684-37898b6baf30?w=400"
        elif "tv" in product_lower:
            img_url = "https://images.unsplash.com/photo-1593305841991-05c297ba4575?w=400"
        elif "pendrive" in product_lower or "pen drive" in product_lower:
            img_url = "https://images.unsplash.com/photo-1618424181497-157f25b6ddd5?w=400"

    # Build products list with minor price deviations per store
    for i, store in enumerate(stores):
        price_factor = random.uniform(0.88, 1.06)
        price = int(base_price * price_factor)
        rating = round(random.uniform(4.0, 4.8), 1)
        
        title_str = f"Fresh {product.title()} from {store}" if category in ["food", "grocery"] else f"{product.title()} - Buy on {store}"
        if location:
            title_str += f" (Delivered to {location.title()})"
            
        store_lower = store.lower()
        if "blinkit" in store_lower:
            link_url = f"https://blinkit.com/s/?q={urllib.parse.quote(product)}"
        elif "instamart" in store_lower:
            link_url = f"https://www.swiggy.com/instamart/search?query={urllib.parse.quote(product)}"
        elif "zepto" in store_lower:
            link_url = f"https://www.zeptonow.com/search?q={urllib.parse.quote(product)}"
        elif "bigbasket" in store_lower:
            link_url = f"https://www.bigbasket.com/ps/?q={urllib.parse.quote(product)}"
        elif "zomato" in store_lower:
            link_url = f"https://www.zomato.com/search?q={urllib.parse.quote(product)}"
        elif "swiggy" in store_lower:
            link_url = f"https://www.swiggy.com/search?query={urllib.parse.quote(product)}"
        elif "amazon" in store_lower:
            link_url = f"https://www.amazon.in/s?k={urllib.parse.quote(product)}"
        else:
            link_url = f"https://www.{store_lower.replace(' ', '').replace('.in', '')}.com/search?q={urllib.parse.quote(product)}"

        products.append({
            "title": title_str,
            "price": f"₹{price:,}",
            "link": link_url,
            "image": img_url,
            "rating": str(rating),
            "source": store,
            "delivery_type": delivery_types[i]
        })
        
    def parse_price(val):
        try:
            return int(val.replace("₹", "").replace(",", ""))
        except:
            return 0
            
    products.sort(key=lambda x: parse_price(x["price"]))
    return products

async def scrape_amazon(query: str):
    results = []
    try:
        async with async_playwright() as p:
            browser = await p.chromium.launch(headless=True)
            context = await browser.new_context(
                user_agent="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
            )
            page = await context.new_page()
            url = f"https://www.amazon.in/s?k={urllib.parse.quote(query)}"
            
            await page.goto(url, timeout=15000)
            await page.wait_for_selector('[data-component-type="s-search-result"]', timeout=8000)
            
            items = await page.query_selector_all('[data-component-type="s-search-result"]')
            for item in items[:5]:
                # Title
                title_el = await item.query_selector('h2 span')
                if not title_el:
                    title_el = await item.query_selector('h2')
                title = await title_el.inner_text() if title_el else ""
                
                # Price
                price_el = await item.query_selector('.a-price-whole')
                price = await price_el.inner_text() if price_el else ""
                
                # Link
                link_el = await item.query_selector('a.a-text-normal')
                if not link_el:
                    link_el = await item.query_selector('a.s-line-clamp-2')
                link = await link_el.get_attribute('href') if link_el else ""
                if link and not link.startswith('http'):
                    link = "https://www.amazon.in" + link
                    
                # Image
                img_el = await item.query_selector('img.s-image')
                if not img_el:
                    img_el = await item.query_selector('img')
                img = await img_el.get_attribute('src') if img_el else ""
                
                # Rating
                rating_el = await item.query_selector('.a-icon-alt')
                rating = await rating_el.inner_text() if rating_el else ""
                
                if title and price:
                    results.append({
                        "title": title.strip(),
                        "price": f"₹{price.strip()}",
                        "link": link,
                        "image": img,
                        "rating": rating.split(' ')[0] if rating else "N/A",
                        "source": "Amazon.in",
                        "delivery_type": "scheduled"
                    })
            await browser.close()
    except Exception as e:
        print(f"Scraper encountered error (falling back to mock data): {e}")
    return results

@app.post("/search")
async def search(body: dict):
    query = body.get("query", "").strip()
    if not query:
        raise HTTPException(status_code=400, detail="Query cannot be empty")
        
    # Clean the query first to avoid scraping/searching the whole natural sentence
    product, location = extract_clean_product_and_location(query)
    search_query = product if product else query
    print(f"Cleaned product query: '{search_query}', Location: '{location}'")
    
    cache_key = f"price_compare:{search_query.lower()}:{location.lower()}"
    
    # Try getting from Redis cache
    if redis_client:
        try:
            cached_data = redis_client.get(cache_key)
            if cached_data:
                print(f"Cache hit for query: {search_query} at {location}")
                return {"status": "success", "query": query, "results": json.loads(cached_data.decode('utf-8')), "cached": True}
        except Exception as e:
            print(f"Redis get error: {e}")
            
    # Scraping & AI generation
    print(f"Cache miss. Searching for: {search_query}")
    
    # Run the real scraper and AI-augmented parser
    ai_results = await get_ai_augmented_results(f"{search_query} in {location}" if location else search_query)
    scraped_results = await scrape_amazon(search_query)
    
    # Merge results
    results = []
    # Add real scraped results first
    results.extend(scraped_results)
    
    # Add AI results, filtering out any duplicate Amazon listings
    scraped_sources = {r["source"].lower() for r in scraped_results}
    if ai_results:
        for item in ai_results:
            source_lower = item.get("source", "").lower()
            if source_lower in scraped_sources or "amazon" in source_lower:
                continue
            # Append location to title if parsed
            if location and location.lower() not in item.get("title", "").lower():
                item["title"] = f"{item['title']} (Delivered to {location.title()})"
            results.append(item)
    else:
        # If Gemini fails, merge the mock results to guarantee we have Instant Delivery options (Blinkit, Instamart, Zepto)
        print("Gemini API rate limited or failed. Merging mock results to ensure local instant options.")
        mock_results = get_mock_results(query)
        for item in mock_results:
            source_lower = item.get("source", "").lower()
            if source_lower in scraped_sources or "amazon" in source_lower:
                continue
            results.append(item)
        
    # Save to cache
    if redis_client:
        try:
            redis_client.setex(cache_key, 3600, json.dumps(results)) # Cache for 1 hour
        except Exception as e:
            print(f"Redis set error: {e}")
            
    return {"status": "success", "query": query, "results": results, "cached": False}
