from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

app = FastAPI(title="Jarvis Price Compare Service")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

import redis
import json
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

def get_mock_results(query: str):
    q_lower = query.lower()
    products = []
    
    # 1. Define categories and their matching stores/prices/images
    # Food Delivery
    food_keywords = ["pizza", "burger", "biryani", "momo", "roll", "sandwich", "pasta", "noodle", "curry", "rice", "food", "lunch", "dinner", "breakfast", "maggi", "subway"]
    # Groceries / Hyperlocal
    grocery_keywords = ["milk", "onion", "egg", "bread", "coffee", "tea", "potato", "tomato", "oil", "flour", "sugar", "salt", "soap", "detergent", "grocery", "groceries", "veggie", "fruit", "banana", "apple", "butter", "cheese", "snack", "chips"]
    # Fashion / Shoes / Clothes
    fashion_keywords = ["t-shirt", "jeans", "shirt", "dress", "kurta", "jacket", "shoes", "sneakers", "saree", "pants", "clothing", "wear", "socks", "cap", "kurti", "hoodie", "watch", "handbag", "wallet"]
    # Cosmetics / Beauty
    beauty_keywords = ["lipstick", "shampoo", "cream", "makeup", "perfume", "lotion", "foundation", "liner", "kajal", "beauty", "hair", "skin", "conditioner", "face wash"]

    # Classify query
    if any(k in q_lower for k in food_keywords):
        category = "food"
        stores = ["Zomato", "Swiggy"]
        base_price = 280
        img_url = "https://images.unsplash.com/photo-1565299624946-b28f40a0ae38?w=400"
    elif any(k in q_lower for k in grocery_keywords):
        category = "grocery"
        stores = ["Blinkit", "Instamart", "Flipkart Supermart", "Amazon Fresh"]
        base_price = 120
        img_url = "https://images.unsplash.com/photo-1542838132-92c53300491e?w=400"
    elif any(k in q_lower for k in fashion_keywords):
        category = "fashion"
        stores = ["Myntra", "Ajio", "Meesho", "Flipkart", "Amazon"]
        base_price = 1490
        # Specific overrides for luxury items like watches
        if "watch" in q_lower:
            base_price = 8500
        img_url = "https://images.unsplash.com/photo-1483985988355-763728e1935b?w=400"
    elif any(k in q_lower for k in beauty_keywords):
        category = "beauty"
        stores = ["Nykaa", "Myntra", "Blinkit", "Instamart", "Amazon"]
        base_price = 650
        img_url = "https://images.unsplash.com/photo-1596462502278-27bfdc403348?w=400"
    else:
        # Default category (Electronics / Appliances / Tech)
        category = "electronics"
        stores = ["Amazon", "Flipkart", "Meesho", "Reliance Digital", "Croma"]
        base_price = 35000
        if "macbook" in q_lower:
            base_price = 92900 if "air" in q_lower else 189900
        elif "iphone" in q_lower:
            base_price = 129900 if "pro" in q_lower else 69900
        elif "ipad" in q_lower:
            base_price = 42900
        elif "sony" in q_lower or "headphones" in q_lower:
            base_price = 22990
        elif "tv" in q_lower or "television" in q_lower:
            base_price = 49900
        img_url = "https://images.unsplash.com/photo-1498049794561-7780e7231661?w=400"
        
        # Override specific electronic images for high aesthetic
        if "macbook" in q_lower or "laptop" in q_lower:
            img_url = "https://images.unsplash.com/photo-1517336714731-489689fd1ca8?w=400"
        elif "iphone" in q_lower or "phone" in q_lower:
            img_url = "https://images.unsplash.com/photo-1511707171634-5f897ff02aa9?w=400"
        elif "watch" in q_lower:
            img_url = "https://images.unsplash.com/photo-1523275335684-37898b6baf30?w=400"
        elif "tv" in q_lower:
            img_url = "https://images.unsplash.com/photo-1593305841991-05c297ba4575?w=400"

    # Build products list with minor price deviations per store
    for i, store in enumerate(stores):
        # Vary price slightly (up to 15% difference)
        price_factor = random.uniform(0.88, 1.06)
        price = int(base_price * price_factor)
        rating = round(random.uniform(4.0, 4.8), 1)
        
        products.append({
            "title": f"{query} - Best Buy on {store}" if i > 0 else f"{query} (Official Brand Store)",
            "price": f"₹{price:,}",
            "link": f"https://www.{store.lower().replace(' ', '').replace('.in', '')}.com/search?q={urllib.parse.quote(query)}",
            "image": img_url,
            "rating": str(rating),
            "source": store
        })
        
    # Sort products by price ascending
    def parse_price(val):
        try:
            return int(val.replace("₹", "").replace(",", ""))
        except:
            return 0
            
    products.sort(key=lambda x: parse_price(x["price"]))
    return products


async def scrape_amazon(query: str):
    results = []
    # Playwright is heavy, so we run inside a try block
    try:
        async with async_playwright() as p:
            browser = await p.chromium.launch(headless=True)
            context = await browser.new_context(
                user_agent="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
            )
            page = await context.new_page()
            url = f"https://www.amazon.in/s?k={urllib.parse.quote(query)}"
            
            # Keep loading time low
            await page.goto(url, timeout=12000)
            await page.wait_for_selector('[data-component-type="s-search-result"]', timeout=6000)
            
            items = await page.query_selector_all('[data-component-type="s-search-result"]')
            for item in items[:5]:
                # Title
                title_el = await item.query_selector('h2 a span')
                title = await title_el.inner_text() if title_el else ""
                
                # Price
                price_el = await item.query_selector('.a-price-whole')
                price = await price_el.inner_text() if price_el else ""
                
                # Link
                link_el = await item.query_selector('h2 a')
                link = await link_el.get_attribute('href') if link_el else ""
                if link and not link.startswith('http'):
                    link = "https://www.amazon.in" + link
                    
                # Image
                img_el = await item.query_selector('img.s-image')
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
                        "source": "Amazon.in"
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
        
    cache_key = f"price_compare:{query.lower()}"
    
    # Try getting from Redis cache
    if redis_client:
        try:
            cached_data = redis_client.get(cache_key)
            if cached_data:
                print(f"Cache hit for query: {query}")
                return {"status": "success", "query": query, "results": json.loads(cached_data.decode('utf-8')), "cached": True}
        except Exception as e:
            print(f"Redis get error: {e}")
            
    # Scraping
    print(f"Cache miss. Searching for: {query}")
    results = await scrape_amazon(query)
    
    # Fallback to Mock Data if no results found or scraper fails
    if not results:
        print(f"Using mock fallback for query: {query}")
        results = get_mock_results(query)
        
    # Save to cache
    if redis_client:
        try:
            redis_client.setex(cache_key, 3600, json.dumps(results)) # Cache for 1 hour
        except Exception as e:
            print(f"Redis set error: {e}")
            
    return {"status": "success", "query": query, "results": results, "cached": False}

