#!/usr/bin/env bash
# =============================================================================
# lib/debug.sh
#
# Debug flag and the dbg() trace helper — controlled via --debug on the
# command line (default: off).
#
# WHY a flag instead of a hardcoded value:
#   Setting DEBUG=1 permanently forces every user to wade through trace
#   output on every run. With --debug, it is opt-in: normal runs are quiet,
#   and anyone diagnosing a problem just adds --debug to their command.
#
# HOW it works:
#   DEBUG starts at 0 here. parse_args() (lib/args.sh) sets it to 1 when it
#   sees --debug. Because --debug is parsed before dbg() is ever called in a
#   meaningful context (all early dbg() calls fire after parse_args
#   returns), the flag takes effect from the very first informative debug
#   line onward.
#
#   The very first "Script starting" trace block (printed directly by
#   run.sh, before any of this is sourced... well, before parse_args runs)
#   is handled separately — see the top of run.sh — because it must fire
#   even if the script dies inside argument parsing, and must not depend on
#   DEBUG being set yet.
# =============================================================================

DEBUG=0

dbg() {
  # Writes to stderr so debug lines are separate from normal stdout and never
  # end up inside redirected files or pipes.
  # Magenta colour (\033[0;35m) makes debug lines visually distinct from the
  # cyan/green/yellow/red used by normal output.
  if [[ "${DEBUG}" -eq 1 ]]; then
    echo -e "\033[0;35m[DEBUG]\033[0m $*" >&2
  fi
}
