#!/usr/bin/env bash
#
# Purpose: Runs biome, TypeScript type-checking, and eslint (NixOS-aware)

set -Eeuo pipefail

source "$(dirname "$0")/run.sh"

BIOME=$(resolve_tool biome biome)
TSC=$(resolve_tool tsc tsc)
ESLINT=$(resolve_tool eslint eslint)

if echo "$BIOME" | grep -q '^nix '; then
	eval "$BIOME" check .
else
	"$BIOME" check .
fi

"$RUNNER" "$TSC" --noEmit
"$RUNNER" "$ESLINT" extensions/
