#!/usr/bin/env bash
# =============================================================================
# lib/help.sh
#
# print_help() — prints usage information and exits 0.
# =============================================================================

print_help() {
  dbg "print_help() called — printing usage and exiting"
  cat <<EOF

${BOLD}run.sh${RESET} — Batch PageSpeed Insights runner with averaging and retry

${BOLD}USAGE${RESET}
  ./run.sh [OPTIONS] [url1 url2 ...]

${BOLD}OPTIONS${RESET}
  --key     <API_KEY>   Google API key (optional but recommended)
  --file    <FILE>      Text file with one URL per line  (# lines are ignored)
  --runs    <N>         API calls per URL+strategy for averaging  (default: 3)
  --delay   <MS>        Pause in ms between successful runs       (default: 3000)
  --retries <N>         Max retries per run on 500/503/429        (default: 3)
  --backoff <MS>        Starting retry backoff delay in ms        (default: 5000)
  --out     <DIR>       Base output directory                     (default: ./reports)
  --debug               Print detailed trace lines to stderr
  --help                Show this message

${BOLD}EXAMPLES${RESET}
  # Minimal — 3 runs per URL+strategy (default)
  ./run.sh https://example.com https://google.com

  # 10 runs, reading URLs from a file
  ./run.sh --file urls.txt --runs 10

  # Full options with debug trace
  ./run.sh --file urls.txt --runs 5 --retries 5 --key AIzaSy... --debug

${BOLD}RETRY BEHAVIOUR${RESET}
  pagespeed.ts retries automatically on HTTP 500 (Lighthouse crash),
  503 (API overloaded), and 429 (rate limited), using exponential backoff
  with jitter. HTTP 400 and 403 are NOT retried (bad input / bad key).
  --retries 0 disables retries entirely.

${BOLD}OUTPUT STRUCTURE${RESET}
  reports/
  └── 2025-06-01_143022/
      ├── pagespeed_example.com_mobile_5runs.md
      ├── pagespeed_example.com_desktop_5runs.md
      └── summary.txt

${BOLD}URL FILE FORMAT${RESET}
  https://example.com
  https://google.com
  # This line is a comment and will be skipped

EOF
  exit 0
}
