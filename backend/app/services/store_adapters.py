"""Store adapters for the cart executor.

Two families:
  * DryRunAdapter — simulates a cart from the bag's own prices. Default. Lets the whole
    approval flow run end to end before any browser is involved.
  * PlaywrightAdapter — drives a dedicated Chrome profile on the Mac that the owner has
    logged into each store once. Selectors are per-store config and MUST be tuned on the
    first supervised runs; nothing here places an order without the gate in cart_service.

Select with FOOD_EXECUTOR=dry_run|playwright.
"""

from __future__ import annotations

import datetime
import os
import time
from pathlib import Path

from app.models.food import ShoppingBag
from app.services.cart_service import CartResult, PlacedResult

SCREENSHOT_DIR = Path(
    os.getenv(
        "FOOD_SCREENSHOT_DIR",
        str(Path.home() / "Library" / "Application Support" / "Habits" / "carts"),
    )
)
PROFILE_DIR = Path(
    os.getenv(
        "FOOD_BROWSER_PROFILE",
        str(
            Path.home()
            / "Library"
            / "Application Support"
            / "Habits"
            / "chrome-profile"
        ),
    )
)


class DryRunAdapter:
    name = "dry_run"

    def __init__(self, drift: float = 0.0):
        self.drift = drift  # tests use this to simulate a price change between approval and placement

    def build_cart(self, bag: ShoppingBag) -> CartResult:
        lines = [
            {
                "name": i["name"],
                "qty": i["packs"],
                "unit_price": i["unit_price"],
                "line_total": i["line_total"],
                "product": f"{i['name']} ({i['pack_label']})",
            }
            for i in (bag.items or [])
        ]
        goods = round(sum(l["line_total"] for l in lines), 2)
        return CartResult(
            lines=lines,
            total=round(goods + (bag.delivery_fee or 0), 2),
            screenshot_path=None,
        )

    def read_total(self, bag: ShoppingBag) -> float:
        return round(self.build_cart(bag).total + self.drift, 2)

    def prepare_place_order(self, bag: ShoppingBag) -> None:
        return None  # nothing to park on in a simulation

    def place_order(self, bag: ShoppingBag) -> PlacedResult:
        return PlacedResult(
            merchant_order_id=f"DRY-{bag.store.upper()}-{bag.id}",
            total=self.read_total(bag),
            delivery_window="simulated",
        )


# ---------------------------------------------------------------------------
# Real browser adapters
# ---------------------------------------------------------------------------

# Per-store navigation config. Tune on the first supervised run; everything here is a
# best-effort starting point, not a promise about the stores' current markup.
STORE_CONFIG: dict[str, dict] = {
    "hmart": {
        "home": "https://www.hmart.com/",
        "search": "input[name='q'], input[type='search']",
        "first_result_add": "button:has-text('Add to Cart'), button:has-text('Add')",
        "cart": "https://www.hmart.com/checkout/cart/",
        "total": "[data-th='Order Total'], .grand.totals .price, .cart-summary .grand .price",
        "checkout": "button:has-text('Proceed to Checkout'), a:has-text('Checkout')",
        "place": "button:has-text('Place Order')",
    },
    "wf": {
        "home": "https://www.amazon.com/alm/storefront?almBrandId=VUZHIFdob2xlIEZvb2Rz",
        "search": "input#twotabsearchtextbox",
        "first_result_add": "button:has-text('Add to Cart'), input[name='submit.addToCart']",
        "cart": "https://www.amazon.com/cart/localmarket",
        "total": "#sc-subtotal-amount-activecart, .sc-subtotal .a-price .a-offscreen",
        "checkout": "input[name='proceedToALMCheckout-VUZHIFdob2xlIEZvb2Rz'], input[name='proceedToRetailCheckout']",
        "place": "input[name='placeYourOrder1'], #placeYourOrder input",
    },
    "weg": {
        "home": "https://www.doordash.com/store/wegmans",
        "search": "input[placeholder*='Search']",
        "first_result_add": "button:has-text('Add')",
        "cart": None,  # DoorDash keeps the cart in a drawer on the store page
        "total": "[data-anchor-id='CartTotal'], span:has-text('Subtotal') + span",
        "checkout": "button:has-text('Checkout')",
        "place": "button:has-text('Place Order')",
    },
}


class PlaywrightAdapter:
    """Builds a cart in a persistent Chrome profile and reads it back. Never presses Place
    Order unless `place_order` is called by the gate in unsupervised mode."""

    name = "playwright"

    def __init__(self, store: str, headless: bool = False):
        if store not in STORE_CONFIG:
            raise ValueError(f"no adapter config for store {store}")
        self.store = store
        self.cfg = STORE_CONFIG[store]
        self.headless = headless
        self._pw = None
        self._ctx = None
        self._page = None

    # -- browser ----------------------------------------------------------
    def _open(self):
        if self._page:
            return self._page
        from playwright.sync_api import (
            sync_playwright,
        )  # imported lazily: optional dependency

        PROFILE_DIR.mkdir(parents=True, exist_ok=True)
        self._pw = sync_playwright().start()
        self._ctx = self._pw.chromium.launch_persistent_context(
            str(PROFILE_DIR),
            headless=self.headless,
            channel="chrome",
            viewport={"width": 1280, "height": 900},
        )
        self._page = self._ctx.new_page()
        return self._page

    def close(self):
        try:
            if self._ctx:
                self._ctx.close()
            if self._pw:
                self._pw.stop()
        finally:
            self._pw = self._ctx = self._page = None

    def _shot(self, label: str) -> str:
        SCREENSHOT_DIR.mkdir(parents=True, exist_ok=True)
        path = (
            SCREENSHOT_DIR
            / f"{self.store}-{label}-{datetime.datetime.now():%Y%m%d-%H%M%S}.png"
        )
        self._page.screenshot(path=str(path), full_page=True)
        return str(path)

    def _require_logged_in(self, page) -> None:
        # Heuristic: a sign-in prompt anywhere on the landing page means the profile lost its session.
        if (
            page.locator("text=Sign in").count()
            and page.locator("text=Sign out").count() == 0
            and self.store == "wf"
        ):
            raise RuntimeError(
                f"{self.store}: not logged in — open the Habits Chrome profile and sign in once"
            )

    # -- cart -------------------------------------------------------------
    def build_cart(self, bag: ShoppingBag) -> CartResult:
        page = self._open()
        page.goto(self.cfg["home"], wait_until="domcontentloaded")
        self._require_logged_in(page)
        for item in bag.items or []:
            query = item.get("product_query") or item["name"]
            page.fill(self.cfg["search"], query)
            page.keyboard.press("Enter")
            page.wait_for_load_state("domcontentloaded")
            time.sleep(1.5)
            add = page.locator(self.cfg["first_result_add"]).first
            for _ in range(int(item.get("packs") or 1)):
                add.click()
                time.sleep(0.8)
        if self.cfg.get("cart"):
            page.goto(self.cfg["cart"], wait_until="domcontentloaded")
        time.sleep(1.5)
        shot = self._shot("cart")
        total = self.read_total(bag, page=page)
        lines = [
            {
                "name": i["name"],
                "qty": i["packs"],
                "unit_price": i["unit_price"],
                "line_total": i["line_total"],
                "product": "(read from cart page on review)",
            }
            for i in (bag.items or [])
        ]
        return CartResult(lines=lines, total=total, screenshot_path=shot)

    def read_total(self, bag: ShoppingBag, page=None) -> float:
        page = page or self._open()
        if self.cfg.get("cart") and self.cfg["cart"] not in page.url:
            page.goto(self.cfg["cart"], wait_until="domcontentloaded")
        text = page.locator(self.cfg["total"]).first.inner_text(timeout=8000)
        digits = "".join(ch for ch in text if ch.isdigit() or ch == ".")
        return float(digits) if digits else 0.0

    def prepare_place_order(self, bag: ShoppingBag) -> None:
        """Supervised mode: go to checkout and stop with the page open for the human."""
        page = self._open()
        page.locator(self.cfg["checkout"]).first.click()
        page.wait_for_load_state("domcontentloaded")
        self._shot("checkout")
        # deliberately no click on the place button

    def place_order(self, bag: ShoppingBag) -> PlacedResult:
        """Unsupervised mode only. The gate has already re-verified the total and caps."""
        page = self._open()
        page.locator(self.cfg["checkout"]).first.click()
        page.wait_for_load_state("domcontentloaded")
        page.locator(self.cfg["place"]).first.click()
        page.wait_for_load_state("domcontentloaded")
        time.sleep(2)
        shot = self._shot("receipt")
        order_id = page.url.split("/")[-1][:60] or f"{self.store}-{int(time.time())}"
        return PlacedResult(
            merchant_order_id=order_id,
            total=self.read_total(bag, page=page),
            receipt_path=shot,
        )


def adapter_for(store: str, mode: str | None = None):
    mode = mode or os.getenv("FOOD_EXECUTOR", "dry_run")
    if mode == "playwright":
        return PlaywrightAdapter(store)
    return DryRunAdapter()
