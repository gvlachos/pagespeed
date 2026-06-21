# PageSpeed Insights CLI

A TypeScript command-line tool that queries the **Google PageSpeed Insights API**
for any URL, repeats the analysis N times, averages all the results with full
statistics (mean, min, max, standard deviation), and saves a Markdown report.

---

## Prerequisites

| Requirement                    | Minimum | Notes                        |
| ------------------------------ | ------- | ---------------------------- |
| [Node.js](https://nodejs.org/) | **18**  | Built-in `fetch` is required |
| npm                            | 8+      | Bundled with Node            |

> **Why Node 18?** The code uses the [native `fetch` API](https://nodejs.org/en/blog/announcements/v18-release-announce#fetch-api) introduced in Node 18. No extra HTTP library is needed.

---

## Setup

```bash
# 1. Place all four files in the same folder
#    pagespeed.ts  run.sh  run.ps1  urls.txt

# 2. Install dev dependencies (TypeScript + ts-node)
npm install

# 3. Make the bash script executable (Linux/macOS only)
chmod +x run.sh
```

---

## Running with the bash script (`run.sh`)

Designed for **Ubuntu / macOS / WSL (or Git bash)**. Processes a list of URLs unattended,
running mobile then desktop for each, and saves one averaged Markdown report
per URL+strategy combination.

**1. Create a `urls.txt` file**

```
https://www.example.com
https://www.google.com
# comment lines and blank lines are ignored
```

**2. Run**

```bash
# Minimal — 3 runs per URL+strategy, no API key
./run.sh --file urls.txt

# Recommended for regular use — API key + 5 runs
./run.sh --file urls.txt --key AIzaSy... --runs 5

# If something looks wrong, add --debug to see every step
./run.sh --file urls.txt --runs 5 --key AIzaSy... --debug
```

**3. Find your reports**

A timestamped folder is created inside `./reports/` (or whichever directory
you pass via `--out`). Each `.md` file is a self-contained report for one
URL and one strategy.

```
reports/
└── 2025-06-01_143022/
    ├── pagespeed_example.com_mobile_5runs.md
    ├── pagespeed_example.com_desktop_5runs.md
    └── summary.txt          ← PASS/FAIL log for every combination
```

> If the script exits immediately without printing anything, run
> `bash run.sh --debug --file urls.txt` to bypass any
> execute-permission issue and see the full trace.

---

## Single-URL usage — `pagespeed.ts`

```bash
npx ts-node pagespeed.ts --url <URL> [OPTIONS]
```

| Flag         | Default      | Description                                         |
| ------------ | ------------ | --------------------------------------------------- |
| `--url`      | *(required)* | The URL to analyse                                  |
| `--strategy` | `mobile`     | `mobile` or `desktop`                               |
| `--runs`     | `3`          | Number of API calls to average                      |
| `--delay`    | `3000`       | Milliseconds between successful runs                |
| `--retries`  | `3`          | Max retries per run on HTTP 500/503/429             |
| `--backoff`  | `5000`       | Starting retry backoff in ms (doubles each attempt) |
| `--key`      | *(none)*     | Google API key                                      |
| `--out`      | `.`          | Output directory                                    |

### Examples

```bash
# 3 runs, mobile (defaults)
npx ts-node pagespeed.ts --url https://example.com

# 10 runs, desktop, save to ./reports
npx ts-node pagespeed.ts --url https://example.com --runs 10 --strategy desktop --out ./reports

# With API key and aggressive retry
npx ts-node pagespeed.ts --url https://example.com --runs 5 --retries 5 --key AIzaSy...
```

The output file is named automatically, e.g. `pagespeed_example.com_mobile_5runs.md`

---

## Batch usage — multiple URLs

### Linux / macOS — `run.sh`

```bash
./run.sh [OPTIONS] [url1 url2 ...]
```

| Flag              | Default     | Description                              |
| ----------------- | ----------- | ---------------------------------------- |
| `--file <FILE>`   | *(none)*    | Text file with one URL per line          |
| `--key <API_KEY>` | *(none)*    | Google API key                           |
| `--runs <N>`      | `3`         | API calls per URL+strategy for averaging |
| `--delay <MS>`    | `3000`      | Pause in ms between successful runs      |
| `--retries <N>`   | `3`         | Max retries per run on 500/503/429       |
| `--backoff <MS>`  | `5000`      | Starting retry backoff delay in ms       |
| `--out <DIR>`     | `./reports` | Base output directory                    |
| `--debug`         | off         | Print detailed trace lines to stderr     |
| `--help`          |             | Show usage                               |

```bash
# URLs on the command line
./run.sh https://example.com https://google.com

# From a file, 10 runs per URL+strategy
./run.sh --file urls.txt --runs 10

# Full options with debug trace
./run.sh --file urls.txt --runs 5 --retries 5 --key AIzaSy... --debug

# Show all flags
./run.sh --help
```

## URL file format (`urls.txt`)

```
# Lines starting with # are comments and are ignored.
# Blank lines are also ignored.

https://example.com
https://google.com

# Add your own URLs below:
# https://yoursite.com/about
```

---

## Output structure

Each batch run creates a timestamped subdirectory so runs never overwrite each other:

```
reports/
└── 2025-06-01_143022/
    ├── pagespeed_example.com_mobile_5runs.md
    ├── pagespeed_example.com_desktop_5runs.md
    ├── pagespeed_google.com_mobile_5runs.md
    ├── pagespeed_google.com_desktop_5runs.md
    └── summary.txt
```

`summary.txt` records `PASS` or `FAIL` for every URL+strategy combination along with the run count, total API calls, and elapsed time.

---

## Reading the report

Each metric in the Markdown report shows:

```
87 (82–91 ±3.2)
 ↑    ↑  ↑   ↑
mean  min max std dev
```

- **Mean** — the headline averaged score across all N runs
- **Min / Max** — the full observed range
- **± Std dev** — how consistent the scores were

A small std dev (±2–3) means stable scores. A large one (±10+) means the site's performance is genuinely variable — perhaps due to inconsistent server response times or CDN cold starts — and the mean is less reliable as a single number.

The **per-run values** column shows the raw score for each individual run, e.g. `87, 90, 85, 88`, for full transparency.

---

## Why average multiple runs?

A single Lighthouse score can vary by 5–15 points between runs on the same unchanged page due to server load, CDN cache state, and measurement noise in Google's Lighthouse worker fleet. Averaging 3–10 runs gives a far more reliable picture.

Reference: [Lighthouse score variability](https://web.dev/articles/variability)

---

## Retry behaviour

The tool retries automatically when it receives:

| HTTP code     | Retried? | Reason                                           |
| ------------- | -------- | ------------------------------------------------ |
| 500           | ✅ Yes    | Lighthouse crash — almost always transient       |
| 503           | ✅ Yes    | API overloaded — transient                       |
| 429           | ✅ Yes    | Rate limited — backing off is the right response |
| Network error | ✅ Yes    | Transient connectivity issue                     |
| 400           | ❌ No     | Bad URL or parameters — won't fix itself         |
| 403           | ❌ No     | Invalid API key or quota exhausted               |

Retries use **exponential backoff with jitter**: the wait doubles on each attempt (5 s → 10 s → 20 s) with a ±20% random offset so that simultaneous batch runs don't all retry at the same moment.

Set `--retries 0` (bash) to disable retries entirely.

---

## API key

Without a key, requests are identified by IP and share a small anonymous quota. For regular use:

1. Go to the [Google Cloud Console](https://console.cloud.google.com/)
2. Enable the **PageSpeed Insights API**
3. Create an **API key** under *Credentials → + Create Credentials → API key*
4. Restrict the key to **PageSpeed Insights API** only (under *API restrictions*)
5. Pass it with `--key YOUR_KEY` (bash)

**The PageSpeed Insights API is completely free.** Do not enable billing — leaving it off means you cannot be charged even accidentally. Full guide: https://developers.google.com/speed/docs/insights/v5/get-started#key

---

## Debug output

### Bash

```bash
./run.sh --file urls.txt --debug
```

`--debug` is a command-line flag (default off). Each debug line is prefixed `[DEBUG]` and written to **stderr** in magenta, so it stays separate from normal stdout and never ends up in redirected files. The very first lines print before argument parsing so you can confirm the script launched even if it exits inside `parse_args`.

Debug lines are tagged with a category prefix:

| Tag    | Section                              |
| ------ | ------------------------------------ |
| `INIT` | Script startup and parameter logging |
| `DEPS` | Dependency checks                    |
| `FILE` | URL file loading                     |
| `EXEC` | TypeScript invocation                |
| `UTIL` | Helper functions                     |
| `MAIN` | Top-level main body                  |
| `LOOP` | The URL/strategy loop                |

---

## Why `set -e` is not used (bash)

`set -e` (errexit) causes bash to exit on the first non-zero exit code. This interacts badly with three patterns used in this script:

1. **`local var=$(command)`** — the `local` builtin always returns exit code 0, masking the exit code of the subshell. `set -e` sees the inner failure and may or may not exit depending on bash version, making behaviour unpredictable.

2. **Functions that intentionally return 1** — `run_analysis` returns 1 when a URL fails. With `set -e`, the script dies before the `if/else` branch can record the failure and continue.

3. **Empty array declarations** — `local arr=()` triggers `set -e` on some older bash versions.

All error handling is done explicitly with `if/else` and `exit 1` instead.
Reference: https://mywiki.wooledge.org/BashFAQ/105

---

## Key documentation

### PageSpeed Insights
- [PageSpeed Insights API overview](https://developers.google.com/speed/docs/insights/v5/about)
- [API reference — runPagespeed](https://developers.google.com/speed/docs/insights/v5/reference/pagespeedapi/runpagespeed)
- [Getting started & API key](https://developers.google.com/speed/docs/insights/v5/get-started)
- [PageSpeed Insights web UI](https://pagespeed.web.dev/)

### Lighthouse & scoring
- [Lighthouse performance scoring](https://developer.chrome.com/docs/lighthouse/performance/performance-scoring)
- [Lighthouse audit reference](https://developer.chrome.com/docs/lighthouse/performance/)
- [Lighthouse score variability](https://web.dev/articles/variability)
- [Core Web Vitals](https://web.dev/articles/vitals) — LCP, FID/INP, CLS explained

### Retry & reliability
- [Exponential backoff and jitter](https://aws.amazon.com/blogs/architecture/exponential-backoff-and-jitter/)
- [Chrome UX Report (CrUX)](https://developer.chrome.com/docs/crux) — real-user field data

### TypeScript & Node.js
- [TypeScript handbook](https://www.typescriptlang.org/docs/handbook/intro.html)
- [tsconfig reference](https://www.typescriptlang.org/tsconfig)
- [Node.js built-in fetch (v18)](https://nodejs.org/en/blog/announcements/v18-release-announce#fetch-api)
- [Node.js `fs` module](https://nodejs.org/api/fs.html)
- [Node.js `process.argv`](https://nodejs.org/api/process.html#processargv)

### Bash
- [Bash manual](https://www.gnu.org/software/bash/manual/bash.html)
- [BashFAQ/105 — why set -e is dangerous](https://mywiki.wooledge.org/BashFAQ/105)
- [BashFAQ/001 — reading files line by line](https://mywiki.wooledge.org/BashFAQ/001)
