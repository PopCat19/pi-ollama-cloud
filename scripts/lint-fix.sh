#!/usr/bin/env bash
#
# Purpose: Runs biome check --write for formatting and safe lint fixes (NixOS-aware)

set -Eeuo pipefail

source "$(dirname "$0")/run.sh"

BIOME=$(resolve_tool biome biome)

if echo "$BIOME" | grep -q '^nix '; then
	eval "$BIOME" check --write .
else
	"$BIOME" check --write .
fi
