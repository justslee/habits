#!/usr/bin/env bash
# Backstop for the grocery shopper: the browser may build carts but never submit an order.
# Layers, strongest first: the server-side gate (Face ID approval, caps, total re-check);
# the order lock injected into every page (backend/ops/mac/shopper-guard.js), which swallows
# order/buy/pay clicks; and this hook, which keeps the shopper from scripting pages (the one
# way around the lock) and stops the obvious slip of aiming at an order button.
set -euo pipefail
input="$(cat)"
tool="$(jq -r '.tool_name' <<<"$input")"

deny() {
  jq -n --arg r "$1" '{hookSpecificOutput: {hookEventName: "PreToolUse", permissionDecision: "deny", permissionDecisionReason: $r}}'
  exit 0
}

ORDER='place (your )?order|submit (your )?order|complete (your )?(order|purchase)|confirm (and pay|order|purchase)|buy now|pay now|pay \$|start (your )?(free )?trial|join (prime|dashpass)|subscribe|placeyourorder|place-?order|submit-?order|buy-?now|one-?click|turbo-?checkout'

case "$tool" in
  *__browser_evaluate|*__browser_run_code*|*__browser_file_upload|*__browser_drop)
    deny "The shopper reads pages with snapshots; scripting the page is off." ;;
  *__browser_fill_form)
    deny "Forms are for the owner (payment, address). Use browser_type for store search." ;;
  *__browser_navigate|*__browser_tabs)
    url="$(jq -r '.tool_input.url // empty' <<<"$input")"
    if [ -n "$url" ] && ! grep -qiE '^https?://' <<<"$url"; then
      deny "The shopper only opens http(s) pages."
    fi ;;
  *__browser_click|*__browser_type|*__browser_press_key|*__browser_select_option)
    what="$(jq -r '[.tool_input.element, .tool_input.target, .tool_input.text, .tool_input.key] | map(select(type == "string")) | join(" ")' <<<"$input")"
    if grep -qiE "$ORDER" <<<"$what"; then
      deny "Placing the order is the owner's job. Stop on the review page and report through shopper.sh."
    fi ;;
esac
exit 0
