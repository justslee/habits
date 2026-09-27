// Habits shopper order lock. Loaded into every page the shopper's browser opens
// (Playwright MCP --init-script), before the page's own scripts.
//
// The shopper (a Claude Code session) may fill carts and open checkout, but it can never
// press an order, buy or pay button. Those clicks, key presses and form submits are
// swallowed here. Only the placer (app/services/placer.py) opens the lock, after Face ID in
// the app, the total re-check and the caps. It sets a permit that lasts a few seconds and
// lets exactly one click through. The shopper's tools can't run page scripts (the
// shopper-guard.sh hook denies them), so it has no way to set the permit itself.
//
// Keep ORDER_BUTTON in sync with PLACE_BUTTON in app/services/placer.py (a test checks).
(() => {
  if (window.__habitsOrderLock) return;
  window.__habitsOrderLock = true;

  const ORDER_BUTTON = /^\s*(place (your )?order|submit (your )?order|complete (your )?(order|purchase)|confirm (and pay|order|purchase)|buy now|pay now|pay \$|start (your )?(free )?trial|join (prime|dashpass)|subscribe)/i;
  const ORDER_ATTR = /placeyourorder|place-?order|submit-?order|buy-?now|one-?click|turbo-?checkout/i;
  const ACTIONABLE = 'button, input[type=submit], input[type=button], input[type=image], a, [role=button], [role=link], [role=menuitem]';

  const clean = (s) => String(s || '').replace(/\s+/g, ' ').trim();
  const namesOf = (el) => {
    const names = [el.getAttribute('aria-label'), el.getAttribute('title'), el.value, el.innerText];
    const labelledBy = el.getAttribute('aria-labelledby');
    if (labelledBy) {
      for (const id of labelledBy.split(/\s+/)) {
        const ref = document.getElementById(id);
        if (ref) names.unshift(ref.innerText);
      }
    }
    return names.map(clean).filter(Boolean);
  };
  const isOrderButton = (el) =>
    namesOf(el).some((n) => ORDER_BUTTON.test(n)) ||
    ['id', 'name', 'data-testid', 'data-anchor-id', 'formaction'].some((a) => ORDER_ATTR.test(el.getAttribute(a) || ''));

  const orderTarget = (event) => {
    const path = event.composedPath ? event.composedPath() : [event.target];
    for (const node of path.slice(0, 10)) {
      if (node instanceof Element && node.matches(ACTIONABLE) && isOrderButton(node)) return node;
    }
    if (event.type === 'submit') {
      const form = event.target;
      if (event.submitter && isOrderButton(event.submitter)) return event.submitter;
      if (form instanceof HTMLFormElement && ORDER_ATTR.test(form.getAttribute('action') || '')) return form;
    }
    return null;
  };

  let notice = null;
  const announce = () => {
    if (notice || !document.body) return;
    notice = document.createElement('div');
    notice.setAttribute('role', 'status');
    notice.textContent = 'Habits order lock: the shopper cannot place orders. Stop here and report the checkout page.';
    notice.style.cssText = 'position:fixed;left:0;right:0;bottom:0;z-index:2147483647;padding:10px 16px;background:#7f1d1d;color:#fff;font:600 14px -apple-system,system-ui,sans-serif;text-align:center';
    document.body.appendChild(notice);
  };

  // The placer's permit: {until, clicked}. One click passes while it lasts, plus the
  // pointer, mouse and submit events that belong to that click.
  const permitted = (event) => {
    const permit = window.__habitsPlacePermit;
    if (!permit || typeof permit.until !== 'number' || Date.now() > permit.until) return false;
    if (event.type === 'click' || event.type === 'dblclick') {
      if (permit.clicked) return false;
      permit.clicked = true;
    }
    return true;
  };

  const guard = (event) => {
    if (event.type === 'keydown' && !['Enter', ' ', 'Spacebar'].includes(event.key)) return;
    const target = orderTarget(event);
    if (!target || permitted(event)) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    announce();
  };

  for (const type of ['pointerdown', 'mousedown', 'pointerup', 'mouseup', 'click', 'dblclick', 'auxclick', 'touchstart', 'touchend', 'keydown', 'submit']) {
    window.addEventListener(type, guard, true);
  }
})();
