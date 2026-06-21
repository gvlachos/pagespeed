#!/usr/bin/env bash
# =============================================================================
# run.sh
#
# Batch-runs the PageSpeed Insights TypeScript tool (pagespeed.ts) against a
# list of URLs, first in mobile strategy then desktop. Each URL+strategy
# combination is analysed N times and pagespeed.ts computes the averages,
# standard deviation, min, and max across those runs.
#
# Transient HTTP 500/503/429 errors are retried automatically with
# exponential backoff inside pagespeed.ts — the batch script does not need
# to handle them.
#
# Usage:
#   ./run.sh [OPTIONS] url1 url2 ...
#   ./run.sh --file urls.txt --runs 10
#   ./run.sh --file urls.txt --key AIzaSy... --runs 5 --out ./reports
#   ./run.sh --file urls.txt --debug          # verbose trace output
#
# Options:
#   --key     <API_KEY>   Google API key (optional but recommended)
#   --file    <FILE>      Plain-text file with one URL per line (# = comment)
#   --runs    <N>         API calls per URL+strategy for averaging (default: 3)
#   --delay   <MS>        Pause in ms between successful runs    (default: 3000)
#   --retries <N>         Max retries per run on 500/503/429     (default: 3)
#   --backoff <MS>        Starting retry backoff delay in ms     (default: 5000)
#   --out     <DIR>       Base output directory                  (default: ./reports)
#   --debug               Print detailed trace lines to stderr   (default: off)
#   --help                Show this help message
#
# Output per run:
#   reports/<timestamp>/
#     pagespeed_<host>_mobile_<N>runs.md
#     pagespeed_<host>_desktop_<N>runs.md
#     summary.txt
#
# Dependencies:
#   Node.js >= 18  https://nodejs.org/en/download
#   ts-node        installed via `npm install` in the project directory
#
# Why set -e is NOT used — see the comment block below.
#
# Code layout:
#   lib/colors.sh        ANSI colour codes
#   lib/debug.sh         DEBUG flag + dbg() trace helper
#   lib/help.sh          --help text
#   lib/args.sh          command-line argument parsing
#   lib/urls.sh          loading URLs from --file
#   lib/dependencies.sh  environment + option validation checks
#   lib/analysis.sh      building/running the pagespeed.ts command
#   lib/format.sh        small output-formatting helpers
#   lib/report.sh        banner, summary.txt, final report
# =============================================================================

# -----------------------------------------------------------------------------
# IMPORTANT: set -e is intentionally NOT used here.
#
# `set -e` (errexit) causes bash to exit on the first non-zero exit code.
# This interacts badly with several common patterns:
#
#   1. `local var=$(command)` — the `local` builtin always returns 0,
#      masking the exit code of the subshell. Combined with set -e this
#      means failures inside $(...) are silently swallowed OR the `local`
#      line itself triggers an exit depending on bash version.
#
#   2. Functions that intentionally return 1 (like run_analysis when a URL
#      fails) cause set -e to kill the whole script immediately, before we
#      can record the failure and move on.
#
#   3. Array operations like `local arr=()` can trigger set -e on older
#      bash versions when the array is empty (treated as a failed assignment).
#
# We handle errors explicitly with if/else and manual `exit` calls instead,
# which is more predictable and debuggable.
#
# Reference: https://mywiki.wooledge.org/BashFAQ/105
# -----------------------------------------------------------------------------

# `set -u` (nounset) catches typos in variable names.
# We keep this — it is almost always safe and very helpful.
set -u

# `set -o pipefail` makes a pipeline fail if ANY command in it fails.
# e.g. `false | true` returns 1, not 0.
set -o pipefail

# -----------------------------------------------------------------------------
# Resolve the directory this script lives in, then load the lib/ modules.
#
# BASH_SOURCE[0] is the path to the running script (even when sourced).
# `cd "$(dirname ...)" && pwd` resolves symlinks into a clean absolute path.
# This must happen before anything else: check_dependencies (lib/dependencies.sh)
# and run_analysis (lib/analysis.sh) both need SCRIPT_DIR, and the lib/ modules
# themselves live under SCRIPT_DIR/lib.
#
# Reference: https://www.gnu.org/software/bash/manual/bash.html#Bash-Variables
# -----------------------------------------------------------------------------
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROG_DIR="${SCRIPT_DIR}/src"
LIB_DIR="${SCRIPT_DIR}/lib/sh"

# shellcheck source=lib/colors.sh
source "${LIB_DIR}/colors.sh"
# shellcheck source=lib/debug.sh
source "${LIB_DIR}/debug.sh"
# shellcheck source=lib/help.sh
source "${LIB_DIR}/help.sh"
# shellcheck source=lib/args.sh
source "${LIB_DIR}/args.sh"
# shellcheck source=lib/urls.sh
source "${LIB_DIR}/urls.sh"
# shellcheck source=lib/dependencies.sh
source "${LIB_DIR}/dependencies.sh"
# shellcheck source=lib/analysis.sh
source "${LIB_DIR}/analysis.sh"
# shellcheck source=lib/format.sh
source "${LIB_DIR}/format.sh"
# shellcheck source=lib/report.sh
source "${LIB_DIR}/report.sh"

# -----------------------------------------------------------------------------
# These four lines always print when --debug is passed. They fire before
# parse_args() so you can confirm the script launched even if it dies
# during argument parsing. They are guarded by a direct [[ check rather
# than dbg() so they do not depend on DEBUG being set yet.
#
# If you pass --debug and never see "Script starting", the problem is in
# the shebang line or file permissions — run `bash run.sh`
# directly to bypass the execute bit requirement.
# -----------------------------------------------------------------------------
if [[ " $* " == *" --debug "* ]] || [[ "$*" == "--debug" ]]; then
  echo -e "\033[0;35m[DEBUG]\033[0m ============================================================" >&2
  echo -e "\033[0;35m[DEBUG]\033[0m Script starting" >&2
  echo -e "\033[0;35m[DEBUG]\033[0m Bash version : ${BASH_VERSION}" >&2
  echo -e "\033[0;35m[DEBUG]\033[0m Working dir  : $(pwd)" >&2
  echo -e "\033[0;35m[DEBUG]\033[0m Script path  : ${BASH_SOURCE[0]}" >&2
  echo -e "\033[0;35m[DEBUG]\033[0m Arguments    : $*" >&2
  echo -e "\033[0;35m[DEBUG]\033[0m ============================================================" >&2
fi

dbg "Colour variables set"
dbg "SCRIPT_DIR resolved to: '$SCRIPT_DIR'"
dbg "PROG_DIR resolved to: '$PROG_DIR'"
dbg "LIB_DIR resolved to: '$LIB_DIR'"

# -----------------------------------------------------------------------------
# Defaults — declared at global scope so all functions can read them.
# In bash, variables are global unless declared with `local` inside a function.
# Declaring them here (rather than inline in parse_args) means `set -u` won't
# complain if parse_args never touches them.
# -----------------------------------------------------------------------------
API_KEY=""
URL_FILE=""
BASE_OUT_DIR="./reports"
RUNS=3
DELAY_MS=3000
RETRIES=3       # max retries per run on transient 500/503/429 errors
BACKOFF_MS=5000 # starting exponential backoff delay in ms (doubles each retry)
URLS=()
# DEBUG is declared in lib/debug.sh — do not redeclare it here or set -u will
# not catch typos that reference it before parse_args runs.

dbg "Default variables initialised"
dbg "  API_KEY     : (empty)"
dbg "  URL_FILE    : (empty)"
dbg "  BASE_OUT_DIR: $BASE_OUT_DIR"
dbg "  RUNS        : $RUNS"
dbg "  DELAY_MS    : $DELAY_MS"

# -----------------------------------------------------------------------------
# collect_urls()
#
# Parses command-line arguments, loads URLs from --file (if given), and
# validates that at least one URL is available. Populates the global URLS
# array.
# -----------------------------------------------------------------------------
collect_urls() {
  dbg "Step: calling parse_args with: $*"
  parse_args "$@"
  dbg "  After parse_args — URLS array has ${#URLS[@]} item(s)"

  dbg "Step: checking for URL file. URL_FILE='$URL_FILE'"
  if [[ -n "$URL_FILE" ]]; then
    dbg "  --file provided, loading from: '$URL_FILE'"
    load_urls_from_file "$URL_FILE"
    dbg "  After file load — URLS array has ${#URLS[@]} item(s)"
  else
    dbg "  --file not provided, skipping"
  fi

  dbg "Step: checking URL count. Total URLs: ${#URLS[@]}"
  if [[ ${#URLS[@]} -eq 0 ]]; then
    echo -e "${RED}Error: no URLs provided.${RESET}" >&2
    echo "  Pass URLs as arguments or use --file. Run --help for usage." >&2
    dbg "  FAIL — no URLs, exiting"
    exit 1
  fi

  dbg "  URL list (${#URLS[@]} total):"
  for i in "${!URLS[@]}"; do
    dbg "    [$i] ${URLS[$i]}"
  done
}

# -----------------------------------------------------------------------------
# prepare_output_dir()
#
# Creates the timestamped output directory under BASE_OUT_DIR and prints its
# path on stdout.
# -----------------------------------------------------------------------------
prepare_output_dir() {
  dbg "Step: creating output directory under '$BASE_OUT_DIR'"

  # Declare and assign separately (not `local ts=$(date ...)`) to correctly
  # capture a non-zero exit from `date` under set -u.
  local timestamp
  timestamp=$(date +%Y-%m-%d_%H%M%S)
  dbg "  Timestamp: '$timestamp'"

  local out_dir="${BASE_OUT_DIR}/${timestamp}"
  dbg "  Full output path: '$out_dir'"

  # mkdir -p creates all parent directories and does not fail if they exist.
  if mkdir -p "$out_dir"; then
    dbg "  mkdir -p succeeded"
  else
    echo -e "${RED}Error: could not create output directory '$out_dir'${RESET}" >&2
    dbg "  FAIL — mkdir returned non-zero"
    exit 1
  fi

  echo "$out_dir"
}

# -----------------------------------------------------------------------------
# run_all_combos()
#
# Runs every URL through both strategies (mobile, desktop), printing
# progress and recording results to summary.txt.
#
# Results are written into the global RESULT_* variables / arrays so main()
# can build the final report without bash's limited function-return options
# getting in the way:
#   RESULT_TOTAL        total combos attempted
#   RESULT_PASSED       combos that succeeded
#   RESULT_FAILED       combos that failed
#   RESULT_FAILED_URLS  array of "<strategy>: <url>" entries that failed
# -----------------------------------------------------------------------------
run_all_combos() {
  local out_dir="$1"
  local summary_file="$2"

  RESULT_TOTAL=0
  RESULT_PASSED=0
  RESULT_FAILED=0
  RESULT_FAILED_URLS=()

  dbg "Entering main URL loop (${#URLS[@]} URL(s))"

  # `${!URLS[@]}` expands to the indices of the array: 0, 1, 2, ...
  # This lets us print "URL 1/3" style progress counters.
  # Reference: https://www.gnu.org/software/bash/manual/bash.html#Arrays
  for i in "${!URLS[@]}"; do
    local url="${URLS[$i]}"
    local url_num=$(( i + 1 ))

    dbg "  --- URL $url_num / ${#URLS[@]} ---"
    dbg "  url: '$url'"

    print_url_header "$url" "$url_num" "${#URLS[@]}"

    for strategy in mobile desktop; do
      RESULT_TOTAL=$(( RESULT_TOTAL + 1 ))
      dbg "  Combo $RESULT_TOTAL: strategy='$strategy'"

      echo -e "\n  ${YELLOW}▶  Running ${strategy} (${RUNS} runs, averaging)...${RESET}"

      # `if command; then` is safe under set -u — non-zero return does not
      # trigger an exit here, only when the command is called bare.
      if run_analysis "$url" "$strategy" "$out_dir"; then
        RESULT_PASSED=$(( RESULT_PASSED + 1 ))
        dbg "  Combo $RESULT_TOTAL PASSED (passed=$RESULT_PASSED failed=$RESULT_FAILED)"
        record_combo_result "$summary_file" "PASS" "$strategy" "$url"
      else
        RESULT_FAILED=$(( RESULT_FAILED + 1 ))
        RESULT_FAILED_URLS+=("${strategy}: ${url}")
        dbg "  Combo $RESULT_TOTAL FAILED (passed=$RESULT_PASSED failed=$RESULT_FAILED)"
        record_combo_result "$summary_file" "FAIL" "$strategy" "$url"
      fi

      dbg "  Combo $RESULT_TOTAL done. Running totals: passed=$RESULT_PASSED failed=$RESULT_FAILED"
    done

    echo ""
  done

  dbg "Main loop finished."
  dbg "  total=$RESULT_TOTAL  passed=$RESULT_PASSED  failed=$RESULT_FAILED"
}

# =============================================================================
# main()
# =============================================================================
main() {
  dbg "============================================================"
  dbg "main() start — received $# argument(s): $*"

  collect_urls "$@"

  dbg "Step: running check_dependencies..."
  check_dependencies
  dbg "  check_dependencies passed"

  local out_dir
  out_dir=$(prepare_output_dir)

  local summary_file="${out_dir}/summary.txt"
  local start_time
  start_time=$(date +%s)
  dbg "  Start epoch: $start_time"

  local total_api_calls=$(( ${#URLS[@]} * 2 * RUNS ))
  dbg "  total_api_calls = ${#URLS[@]} URLs × 2 strategies × $RUNS runs = $total_api_calls"

  write_summary_header "$summary_file" "$total_api_calls"
  print_run_banner "$out_dir" "$total_api_calls"

  run_all_combos "$out_dir" "$summary_file"

  local end_time
  end_time=$(date +%s)
  local elapsed=$(( end_time - start_time ))
  dbg "  end_time=$end_time  elapsed=${elapsed}s"

  local duration
  duration=$(format_duration "$elapsed")
  dbg "  duration='$duration'"

  print_final_summary \
    "$RESULT_TOTAL" "$RESULT_PASSED" "$RESULT_FAILED" \
    "$total_api_calls" "$out_dir" "$duration" \
    RESULT_FAILED_URLS "$summary_file"

  append_summary_totals "$summary_file" "$RESULT_TOTAL" "$RESULT_PASSED" "$RESULT_FAILED" "$duration"

  # Exit 0 if everything passed; 1 if anything failed.
  # This allows CI pipelines to detect failures via the exit code.
  dbg "============================================================"
  if [[ "$RESULT_FAILED" -eq 0 ]]; then
    dbg "main() complete — exiting with code 0 (all passed)"
    exit 0
  else
    dbg "main() complete — exiting with code 1 ($RESULT_FAILED failure(s))"
    exit 1
  fi
}

# This is the script's entry point.
# "$@" passes all original arguments to main() as separate quoted strings.
dbg "About to call main() with args: $*"
main "$@"
