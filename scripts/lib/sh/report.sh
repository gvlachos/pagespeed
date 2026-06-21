#!/usr/bin/env bash
# =============================================================================
# lib/report.sh
#
# Everything related to reporting progress and results to the user:
#   - the startup banner
#   - the summary.txt file (header, per-combo lines, totals)
#   - the final on-screen summary
# =============================================================================

# -----------------------------------------------------------------------------
# write_summary_header()
#
# Writes the header of summary.txt. Exits 1 if the file can't be written.
# -----------------------------------------------------------------------------
write_summary_header() {
  local summary_file="$1"
  local total_api_calls="$2"

  dbg "  Writing summary header to: '$summary_file'"

  if {
    echo "PageSpeed Insights Batch Summary"
    echo "Generated  : $(date)"
    echo "URLs       : ${#URLS[@]}"
    echo "Runs/combo : ${RUNS}"
    echo "API calls  : ${total_api_calls}"
    echo "=========================================="
  } > "$summary_file"; then
    dbg "  Summary header written OK"
  else
    echo -e "${RED}Error: could not write to summary file '$summary_file'${RESET}" >&2
    dbg "  FAIL — summary file write failed"
    exit 1
  fi
}

# -----------------------------------------------------------------------------
# print_run_banner()
#
# Prints the box header and the configuration summary before the main loop
# starts.
# -----------------------------------------------------------------------------
print_run_banner() {
  local out_dir="$1"
  local total_api_calls="$2"

  echo -e "${BOLD}${CYAN}"
  echo "╔══════════════════════════════════════════════╗"
  echo "║   PageSpeed Insights Batch Runner (Averaged) ║"
  echo "╚══════════════════════════════════════════════╝"
  echo -e "${RESET}"
  echo -e "  URLs            : ${BOLD}${#URLS[@]}${RESET}"
  echo -e "  Strategies      : ${BOLD}mobile → desktop${RESET}"
  echo -e "  Runs per combo  : ${BOLD}${RUNS}${RESET}"
  echo -e "  Total API calls : ${BOLD}${total_api_calls}${RESET}"
  echo -e "  Delay per run   : ${BOLD}${DELAY_MS}ms${RESET}"
  echo -e "  Retries on fail : ${BOLD}${RETRIES}${RESET}"
  echo -e "  Backoff start   : ${BOLD}${BACKOFF_MS}ms${RESET}"
  echo -e "  Output folder   : ${BOLD}${out_dir}${RESET}"

  if [[ -n "$API_KEY" ]]; then
    echo -e "  API key         : ${GREEN}provided${RESET}"
  else
    echo -e "  API key         : ${YELLOW}not set (anonymous quota)${RESET}"
  fi

  if [[ "$DEBUG" -eq 1 ]]; then
    echo -e "  Debug output    : ${YELLOW}ON${RESET}"
  fi

  echo ""
}

# -----------------------------------------------------------------------------
# print_url_header()
#
# Prints the "URL i/N: <url>" section header at the start of each URL's
# block in the main loop.
# -----------------------------------------------------------------------------
print_url_header() {
  local url="$1"
  local url_num="$2"
  local url_count="$3"

  echo -e "${BOLD}─────────────────────────────────────────────────${RESET}"
  echo -e "  URL ${url_num}/${url_count}: ${CYAN}${url}${RESET}"
  echo -e "${BOLD}─────────────────────────────────────────────────${RESET}"
}

# -----------------------------------------------------------------------------
# record_combo_result()
#
# Prints the pass/fail line for one URL+strategy combo and appends the
# corresponding line to summary.txt.
# -----------------------------------------------------------------------------
record_combo_result() {
  local summary_file="$1"
  local status="$2"   # "PASS" or "FAIL"
  local strategy="$3"
  local url="$4"

  if [[ "$status" == "PASS" ]]; then
    echo -e "  ${GREEN}✔  ${strategy} complete${RESET}"
  else
    echo -e "  ${RED}✘  ${strategy} failed${RESET}"
  fi

  echo "${status} | ${strategy} | ${RUNS} runs | ${url}" >> "$summary_file"
}

# -----------------------------------------------------------------------------
# print_failed_list()
#
# Prints the list of failed URL+strategy combos, if any.
# -----------------------------------------------------------------------------
print_failed_list() {
  local -n failed_urls_ref="$1"

  if [[ ${#failed_urls_ref[@]} -eq 0 ]]; then
    return 0
  fi

  dbg "  Printing ${#failed_urls_ref[@]} failed URL(s)"
  echo -e "\n  ${RED}Failed analyses:${RESET}"
  for entry in "${failed_urls_ref[@]}"; do
    echo -e "    ${RED}✘${RESET}  $entry"
  done
  echo ""
}

# -----------------------------------------------------------------------------
# append_summary_totals()
#
# Appends the final totals block to summary.txt.
# -----------------------------------------------------------------------------
append_summary_totals() {
  local summary_file="$1"
  local total="$2"
  local passed="$3"
  local failed="$4"
  local duration="$5"

  dbg "  Appending totals to summary file"
  {
    echo "=========================================="
    echo "Total combos : ${total}"
    echo "Passed       : ${passed}"
    echo "Failed       : ${failed}"
    echo "Duration     : ${duration}"
  } >> "$summary_file"
}

# -----------------------------------------------------------------------------
# print_final_summary()
#
# Prints the final on-screen summary box, the list of failures (if any),
# and a pointer to the summary file.
# -----------------------------------------------------------------------------
print_final_summary() {
  local total="$1"
  local passed="$2"
  local failed="$3"
  local total_api_calls="$4"
  local out_dir="$5"
  local duration="$6"
  local failed_urls_name="$7"
  local summary_file="$8"

  echo -e "${BOLD}═════════════════════════════════════════════════${RESET}"
  echo -e "  ${BOLD}Batch complete${RESET} in ${duration}"
  echo -e "  Combos : ${total}  |  ${GREEN}Passed : ${passed}${RESET}  |  ${RED}Failed : ${failed}${RESET}"
  echo -e "  API calls made  : ${BOLD}${total_api_calls}${RESET}"
  echo -e "  Reports saved to: ${BOLD}${out_dir}${RESET}"
  echo -e "${BOLD}═════════════════════════════════════════════════${RESET}"

  # Pass the ARRAY NAME (not a nameref variable) through to print_failed_list,
  # which creates its own nameref. Passing an existing nameref's name here
  # would trigger bash's "circular name reference" error.
  print_failed_list "$failed_urls_name"

  echo -e "  Summary written to: ${BOLD}${summary_file}${RESET}\n"
}
