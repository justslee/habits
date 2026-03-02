#!/bin/bash
# Patch worklets and reanimated version checks for Expo Go compatibility
PATCH='export function checkCppVersion(){return}export function matchVersion(){return true}'

for f in \
  node_modules/react-native-worklets/lib/module/utils/checkCppVersion.js \
  node_modules/react-native-reanimated/lib/module/platform-specific/checkCppVersion.js; do
  if [ -f "$f" ]; then
    echo "'use strict';${PATCH}" > "$f"
    echo "Patched $f"
  fi
done
