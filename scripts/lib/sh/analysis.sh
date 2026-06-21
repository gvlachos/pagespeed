#!/usr/bin/env bash
# =============================================================================
# lib/analysis.sh
#
# Building and executing the pagespeed.ts command for a single
# URL + strategy combination.
# =============================================================================

# -----------------------------------------------------------------------------
# build_analysis_command()
#
# Builds the npx command as a bash array and writes it into the global
# ANALYSIS_CMD array.
#
# Using an array (rather than a string) means URLs/paths containing spaces
# are handled correctly.
# -----------------------------------------------------------------------------
build_analysis_command() {
  local url="$1"
  local strategy="$2"
  local out_dir="$3"

  ANALYSIS_CMD=(
    npx ts-node "${PROG_DIR}/pagespeed.ts"
    --url      "$url"
    --strategy "$strategy"
    --runs     "$RUNS"
    --delay    "$DELAY_MS"
    --retries  "$RETRIES"
    --backoff  "$BACKOFF_MS"
    --out      "$out_dir"
  )

  if [[ -n "$API_KEY" ]]; then
    ANALYSIS_CMD+=(--key "$API_KEY")
    dbg "  API key appended to command"
  else
    dbg "  No API key (running without)"
  fi
}

# -----------------------------------------------------------------------------
# run_analysis()
#
# Runs pagespeed.ts for a single URL + strategy combination.
#
# Returns 0 on success, 1 on failure. The caller decides what to do — this
# function never exits the script.
# -----------------------------------------------------------------------------
run_analysis() {
  local url="$1"
  local strategy="$2"
  local out_dir="$3"

  dbg "------------------------------------------------------------"
  dbg "run_analysis() called"
  dbg "  url      : '$url'"
  dbg "  strategy : '$strategy'"
  dbg "  out_dir  : '$out_dir'"
  dbg "  RUNS     : $RUNS"
  dbg "  DELAY_MS : $DELAY_MS"
  dbg "  PROG_DIR: '$PROG_DIR'"

  # Verify the output directory exists before handing it to the ts script.
  if [[ ! -d "$out_dir" ]]; then
    echo -e "${RED}Error: output directory does not exist: '$out_dir'${RESET}" >&2
    dbg "  FAIL — out_dir does not exist"
    return 1
  fi
  dbg "  out_dir exists: OK"

  local ANALYSIS_CMD=()
  build_analysis_command "$url" "$strategy" "$out_dir"

  # Log the full command. We expand ${ANALYSIS_CMD[*]} to show all arguments.
  # The API key is included here if present — acceptable for a local debug log.
  dbg "  Full command: ${ANALYSIS_CMD[*]}"
  dbg "  Executing now..."

  # Execute via `if` so a non-zero exit does NOT trigger set -e.
  # This is the canonical bash idiom for "run a command and branch on result".
  if "${ANALYSIS_CMD[@]}"; then
    dbg "  run_analysis: command exited 0 — SUCCESS"
    return 0
  else
    local exit_code=$?
    dbg "  run_analysis: command exited $exit_code — FAILURE"
    return 1
  fi
}
