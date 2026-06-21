#!/usr/bin/env bash
# =============================================================================
# lib/urls.sh
#
# Loading the list of URLs to analyse from a --file argument.
# =============================================================================

# -----------------------------------------------------------------------------
# validate_url_file()
#
# Checks that the given path exists, is a regular file, and is readable.
# Exits 1 with a descriptive error if any check fails.
# -----------------------------------------------------------------------------
validate_url_file() {
  local file="$1"

  dbg "  Validating URL file path: '$file'"

  if [[ ! -e "$file" ]]; then
    echo -e "${RED}Error: URL file not found: '$file'${RESET}" >&2
    dbg "  FAIL — path does not exist"
    exit 1
  fi

  if [[ ! -f "$file" ]]; then
    echo -e "${RED}Error: '$file' exists but is not a regular file.${RESET}" >&2
    dbg "  FAIL — path exists but is not a file (maybe a directory?)"
    exit 1
  fi

  if [[ ! -r "$file" ]]; then
    echo -e "${RED}Error: '$file' exists but is not readable (check permissions).${RESET}" >&2
    dbg "  FAIL — file not readable"
    exit 1
  fi

  dbg "  File exists, is a regular file, and is readable"
}

# -----------------------------------------------------------------------------
# load_urls_from_file()
#
# Reads the file line by line using while+read and appends each valid URL
# to the global URLS array.
#
# `IFS=` prevents read from stripping leading/trailing whitespace.
# `|| [[ -n "$line" ]]` ensures the last line is processed even if the
# file does not end with a newline character.
#
# Reference: https://mywiki.wooledge.org/BashFAQ/001
# -----------------------------------------------------------------------------
load_urls_from_file() {
  local file="$1"

  dbg "------------------------------------------------------------"
  dbg "load_urls_from_file() called"
  dbg "  File path: '$file'"

  validate_url_file "$file"

  local line_number=0
  local added=0
  local skipped=0

  while IFS= read -r line || [[ -n "$line" ]]; do
    line_number=$(( line_number + 1 ))

    # Strip Windows carriage return (\r) from lines saved on Windows (CRLF).
    # Without this, each URL would have a trailing \r, causing the API to
    # receive a malformed URL like "https://example.com\r".
    line="${line//$'\r'/}"

    dbg "  Line $line_number raw: '${line}'"

    # Skip blank lines.
    if [[ -z "$line" ]]; then
      dbg "    → skipped (blank)"
      skipped=$(( skipped + 1 ))
      continue
    fi

    # Skip comment lines (starting with #).
    if [[ "$line" == \#* ]]; then
      dbg "    → skipped (comment): '$line'"
      skipped=$(( skipped + 1 ))
      continue
    fi

    dbg "    → accepted as URL: '$line'"
    URLS+=("$line")
    added=$(( added + 1 ))

  done < "$file"

  dbg "load_urls_from_file() complete"
  dbg "  Lines read    : $line_number"
  dbg "  URLs added    : $added"
  dbg "  Lines skipped : $skipped"
}
