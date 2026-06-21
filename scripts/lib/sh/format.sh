#!/usr/bin/env bash
# =============================================================================
# lib/format.sh
#
# Small formatting helpers.
# =============================================================================

# -----------------------------------------------------------------------------
# format_duration()
#
# Converts integer seconds into a "Xm Ys" or "Ys" string.
# $(( )) is bash arithmetic expansion.
# Reference: https://www.gnu.org/software/bash/manual/bash.html#Arithmetic-Expansion
# -----------------------------------------------------------------------------
format_duration() {
  local total_seconds="$1"
  dbg "format_duration() called with $total_seconds seconds"

  local minutes=$(( total_seconds / 60 ))
  local seconds=$(( total_seconds % 60 ))

  if [[ $minutes -gt 0 ]]; then
    echo "${minutes}m ${seconds}s"
  else
    echo "${seconds}s"
  fi
}
