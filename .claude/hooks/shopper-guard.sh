#!/usr/bin/env bash
# Backstop for the grocery shopper: the browser may build carts but never submit an order.
# The real gate is server-side (Face ID approval, caps, total re-check, human presses Place
# Order); this stops the obvious slip of clicking the button or scripting the page.
set -euo pipefail
input="$(cat)"
tool="$(jq -r '.tool_name' <<<"$input")"

deny() {
  jq -n --arg r "$1" '{hookSpecificOutput: {hookEventName: "PreToolUse", permissionDecision: "deny", permissionDecisionReason: $r}}'
  exit 0
}

case "$tool" in
  *__browser_evaluate|*__browser_run_code*|*__browser_file_upload|*__browser_drop)
    deny "The shopper reads pages with snapshots; scripting the page is off." ;;
  *__browser_fill_form)
    deny "Forms are for the owner (payment, address). Use browser_type for store search." ;;
  *__browser_click|*__browser_type|*__browser_press_key|*__browser_select_option)
    what="$(jq -r '[.tool_input.element, .tool_input.target, .tool_input.text, .tool_input.key] | map(select(type == "string")) | join(" ")' <<<"$input")"
    if grep -qiE 'place (your )?order|submit order|buy now|pay now|complete (purchase|order)|confirm (order|purchase|and pay)|checkout and pay' <<<"$what"; then
      deny "Placing the order is the owner's job. Stop on the review page and report through shopper.sh."
    fi ;;
esac
exit 0
