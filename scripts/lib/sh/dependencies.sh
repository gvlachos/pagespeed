#!/usr/bin/env bash
# =============================================================================
# lib/dependencies.sh
#
# Validates all required tools exist and that key arguments are sane.
#
# Each check_*/validate_* function below performs ONE check, prints its own
# error message(s) on failure, and returns 1 (0 on success). This lets
# check_dependencies() accumulate ALL failures before exiting so the user
# sees everything wrong at once — rather than fixing one issue, re-running,
# and discovering the next.
# =============================================================================

# -----------------------------------------------------------------------------
# check_node_installed()
#
# Confirms `node` is on PATH.
# -----------------------------------------------------------------------------
check_node_installed() {
  dbg "  Checking for 'node' in PATH..."

  if command -v node &>/dev/null; then
    local node_path
    node_path=$(command -v node)
    dbg "  'node' found at: $node_path"
    return 0
  fi

  echo -e "${RED}Error: 'node' is not installed or not in PATH.${RESET}" >&2
  echo "  Download Node.js: https://nodejs.org/en/download" >&2
  dbg "  FAIL — 'node' not found"
  return 1
}

# -----------------------------------------------------------------------------
# check_npx_installed()
#
# Confirms `npx` is on PATH.
# -----------------------------------------------------------------------------
check_npx_installed() {
  dbg "  Checking for 'npx' in PATH..."

  if command -v npx &>/dev/null; then
    local npx_path
    npx_path=$(command -v npx)
    dbg "  'npx' found at: $npx_path"
    return 0
  fi

  echo -e "${RED}Error: 'npx' is not installed or not in PATH.${RESET}" >&2
  dbg "  FAIL — 'npx' not found"
  return 1
}

# -----------------------------------------------------------------------------
# check_node_version()
#
# Confirms the installed Node.js major version is >= 18 (required for the
# built-in fetch() API).
#
# Declare and assign separately (not `local x=$(cmd)`) to avoid masking the
# exit code: `local` always returns 0 regardless of the subshell's result.
# -----------------------------------------------------------------------------
check_node_version() {
  dbg "  Checking Node.js version..."

  local node_version
  node_version=$(node -e "process.stdout.write(process.versions.node)" 2>/dev/null) || {
    echo -e "${RED}Error: 'node' is in PATH but failed to run.${RESET}" >&2
    dbg "  FAIL — node -e command itself failed"
    return 1
  }
  dbg "  Raw Node.js version string: '$node_version'"

  # Extract the major version number by splitting on '.' and taking field 1.
  # `cut -d'.' -f1` is more portable than bash string manipulation for this.
  local node_major
  node_major=$(echo "$node_version" | cut -d'.' -f1)
  dbg "  Node.js major version: '$node_major'"

  if [[ -z "$node_major" ]]; then
    echo -e "${RED}Error: could not parse Node.js version from '$node_version'.${RESET}" >&2
    dbg "  FAIL — major version string is empty after parsing"
    return 1
  fi

  if [[ "$node_major" -lt 18 ]]; then
    echo -e "${RED}Error: Node.js >= 18 required (found v${node_version}).${RESET}" >&2
    echo "  Download: https://nodejs.org/en/download" >&2
    dbg "  FAIL — Node.js major version $node_major is less than 18"
    return 1
  fi

  dbg "  Node.js version OK: v$node_version (major=$node_major >= 18)"
  return 0
}

# -----------------------------------------------------------------------------
# check_pagespeed_script()
#
# Confirms src/pagespeed.ts exists alongside this script.
# -----------------------------------------------------------------------------
check_pagespeed_script() {
  dbg "  Looking for pagespeed.ts..."
  dbg "  SCRIPT_DIR is: '$SCRIPT_DIR'"
  dbg "  PROG_DIR is: '$PROG_DIR'"

  local ts_file="${PROG_DIR}/pagespeed.ts"
  dbg "  Expected path: '$ts_file'"

  if [[ -f "$ts_file" ]]; then
    dbg "  pagespeed.ts found: OK"
    return 0
  fi

  echo -e "${RED}Error: pagespeed.ts not found at '$ts_file'${RESET}" >&2
  echo "  pagespeed.ts must be located in the src/ subdirectory." >&2
  dbg "  FAIL — pagespeed.ts not found"
  return 1
}

# -----------------------------------------------------------------------------
# validate_runs_option()
#
# Confirms --runs is a positive integer.
# -----------------------------------------------------------------------------
validate_runs_option() {
  dbg "  Validating --runs value: '$RUNS'"

  if [[ "$RUNS" =~ ^[0-9]+$ ]] && [[ "$RUNS" -ge 1 ]]; then
    dbg "  --runs OK: $RUNS"
    return 0
  fi

  echo -e "${RED}Error: --runs must be a positive integer, got: '$RUNS'${RESET}" >&2
  dbg "  FAIL — invalid --runs"
  return 1
}

# -----------------------------------------------------------------------------
# validate_delay_option()
#
# Confirms --delay is a non-negative integer (milliseconds).
# -----------------------------------------------------------------------------
validate_delay_option() {
  dbg "  Validating --delay value: '$DELAY_MS'"

  if [[ "$DELAY_MS" =~ ^[0-9]+$ ]]; then
    dbg "  --delay OK: $DELAY_MS"
    return 0
  fi

  echo -e "${RED}Error: --delay must be a non-negative integer (ms), got: '$DELAY_MS'${RESET}" >&2
  dbg "  FAIL — invalid --delay"
  return 1
}

# -----------------------------------------------------------------------------
# check_dependencies()
#
# Runs every check above and exits 1 if any of them failed. Uses a plain
# integer counter rather than set -e + early return so that every check
# always runs regardless of previous failures, and the user sees every
# problem at once.
# -----------------------------------------------------------------------------
check_dependencies() {
  dbg "------------------------------------------------------------"
  dbg "check_dependencies() start"

  local missing=0

  check_node_installed   || missing=1
  check_npx_installed    || missing=1
  check_node_version     || missing=1
  check_pagespeed_script || missing=1
  validate_runs_option    || missing=1
  validate_delay_option   || missing=1

  dbg "check_dependencies() complete — missing=$missing"

  if [[ "$missing" -ne 0 ]]; then
    echo -e "${RED}Aborting due to the above error(s).${RESET}" >&2
    dbg "Exiting with code 1 from check_dependencies"
    exit 1
  fi

  dbg "All dependency checks passed"
}
