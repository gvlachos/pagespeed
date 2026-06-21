#!/usr/bin/env bash
# =============================================================================
# lib/args.sh
#
# Command-line argument parsing.
#
# parse_args() iterates over $@ using a while+case loop.
# `shift` removes the first positional parameter.
# `shift 2` removes the flag AND its value in one step.
#
# Reference: https://www.gnu.org/software/bash/manual/bash.html#index-shift
# =============================================================================

# -----------------------------------------------------------------------------
# require_flag_value()
#
# Shared guard used by every "--flag <value>" case below. Exits with an
# error if the flag was given without a following value.
#
# Usage: require_flag_value "--key" "$#"
# -----------------------------------------------------------------------------
require_flag_value() {
  local flag="$1"
  local remaining="$2"

  if [[ "$remaining" -lt 2 ]]; then
    echo -e "${RED}Error: ${flag} requires a value.${RESET}" >&2
    exit 1
  fi
}

# -----------------------------------------------------------------------------
# parse_args()
# -----------------------------------------------------------------------------
parse_args() {
  dbg "------------------------------------------------------------"
  dbg "parse_args() start — received $# argument(s)"

  # Guard: if called with zero arguments, nothing to do.
  if [[ $# -eq 0 ]]; then
    dbg "  No arguments passed to parse_args — using all defaults"
    return 0
  fi

  while [[ $# -gt 0 ]]; do
    dbg "  Next argument to process: '$1'  (remaining: $#)"

    case "$1" in

      --key)
        require_flag_value "--key" "$#"
        API_KEY="$2"
        dbg "  --key consumed (value hidden for security)"
        shift 2
        ;;

      --file)
        require_flag_value "--file" "$#"
        URL_FILE="$2"
        dbg "  --file set to: '$URL_FILE'"
        shift 2
        ;;

      --runs)
        require_flag_value "--runs" "$#"
        RUNS="$2"
        dbg "  --runs set to: '$RUNS'"
        shift 2
        ;;

      --delay)
        require_flag_value "--delay" "$#"
        DELAY_MS="$2"
        dbg "  --delay set to: '$DELAY_MS'"
        shift 2
        ;;

      --retries)
        require_flag_value "--retries" "$#"
        RETRIES="$2"
        dbg "  --retries set to: '$RETRIES'"
        shift 2
        ;;

      --backoff)
        require_flag_value "--backoff" "$#"
        BACKOFF_MS="$2"
        dbg "  --backoff set to: '$BACKOFF_MS'"
        shift 2
        ;;

      --debug)
        # --debug is a standalone flag with no value argument.
        # Setting DEBUG=1 here means all subsequent dbg() calls will fire.
        # The pre-parse_args startup lines are handled separately in run.sh.
        DEBUG=1
        dbg "  --debug flag consumed — debug output now active"
        shift
        ;;

      --out)
        require_flag_value "--out" "$#"
        BASE_OUT_DIR="$2"
        dbg "  --out set to: '$BASE_OUT_DIR'"
        shift 2
        ;;

      --help|-h)
        print_help
        ;;

      --*)
        echo -e "${RED}Error: unknown option '$1'${RESET}" >&2
        echo "Run with --help for usage." >&2
        exit 1
        ;;

      *)
        # Anything that is not a flag is treated as a URL.
        dbg "  Adding positional URL: '$1'"
        URLS+=("$1")
        shift
        ;;

    esac
  done

  dbg "parse_args() complete"
  dbg "  API_KEY set   : $(if [[ -n "$API_KEY" ]]; then echo yes; else echo no; fi)"
  dbg "  URL_FILE      : '$URL_FILE'"
  dbg "  RUNS          : $RUNS"
  dbg "  DELAY_MS      : $DELAY_MS"
  dbg "  RETRIES       : $RETRIES"
  dbg "  BACKOFF_MS    : $BACKOFF_MS"
  dbg "  BASE_OUT_DIR  : $BASE_OUT_DIR"
  dbg "  DEBUG         : $DEBUG"
  dbg "  URLs from args: ${#URLS[@]}"
}
