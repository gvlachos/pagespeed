## What standard deviation measures

When you take multiple measurements of the same thing, they rarely come out identical. Standard deviation answers one question: **how spread out are the values around their average?**

A small std dev means the values cluster tightly around the mean — the measurements are consistent. A large std dev means the values are scattered — the measurements are noisy or variable.

---

## Population vs Sample standard deviation

There are two variants and the difference matters.

**Sample standard deviation** is used when your data is a *subset* drawn from a larger unknown population, and you want to estimate the spread of that whole population. You divide by `N − 1` (Bessel's correction) to compensate for the fact that a small sample tends to underestimate the true spread.

**Population standard deviation** is used when your data *is* the entire population you care about — there is no larger group you're trying to estimate. You divide by `N`.

In this tool, you run the API exactly N times and you want to describe the spread of *those specific N scores*. There is no hidden larger population you're trying to infer. The N runs are the complete dataset. So population std dev is correct here.

---

## The formula, step by step

Given N values x₁, x₂, ... xₙ:

```
μ  = (x₁ + x₂ + ... + xₙ) / N          ← mean

σ  = √[ ((x₁−μ)² + (x₂−μ)² + ... + (xₙ−μ)²) / N ]   ← std dev
```

Let's walk through a concrete example with 5 Lighthouse performance scores:

```
Run 1:  72
Run 2:  85
Run 3:  78
Run 4:  91
Run 5:  74
```

**Step 1 — calculate the mean:**
```
μ = (72 + 85 + 78 + 91 + 74) / 5
  = 400 / 5
  = 80
```

**Step 2 — subtract the mean from each value (the "deviation"):**
```
72 − 80 = −8
85 − 80 = +5
78 − 80 = −2
91 − 80 = +11
74 − 80 = −6
```

You can't just average these raw deviations — they always sum to zero by definition (positive and negative deviations cancel out perfectly). That's why the next step squares them.

**Step 3 — square each deviation:**
```
(−8)²  = 64
(+5)²  = 25
(−2)²  = 4
(+11)² = 121
(−6)²  = 36
```

Squaring does two things: it eliminates the sign (so large deviations in either direction both count as "far from the mean"), and it penalises large deviations more heavily than small ones.

**Step 4 — average the squared deviations (the "variance"):**
```
variance = (64 + 25 + 4 + 121 + 36) / 5
         = 250 / 5
         = 50
```

**Step 5 — take the square root (to undo the squaring from step 3):**
```
σ = √50 ≈ 7.07
```

So the report would show: **80 (72–91 ±7.1)**

---

## How it maps to the code

```typescript
function calcStats(values: number[]): Stats {
  const mean = values.reduce((a, b) => a + b, 0) / values.length;  // Step 1
  const min  = Math.min(...values);
  const max  = Math.max(...values);

  const stdDev = Math.sqrt(
    values.reduce(
      (sum, v) => sum + Math.pow(v - mean, 2),  // Steps 2 & 3: (xᵢ − μ)²
      0
    ) / values.length                            // Step 4: divide by N
  );                                             // Step 5: √

  return { mean, min, max, stdDev, values };
}
```

The `reduce` accumulates the sum of squared deviations in a single pass, then divides by `values.length` (N, not N−1), then `Math.sqrt` brings it back to the original scale.

---

## How to interpret the output in the report

The report shows each metric as:

```
87 (82–91 ±3.2)
```

| Part    | Meaning                                               |
| ------- | ----------------------------------------------------- |
| `87`    | Mean score across all runs — the headline number      |
| `82–91` | Min and max — the full range of observed values       |
| `±3.2`  | Standard deviation — how consistently the site scored |

**Practical reading guide:**

A std dev of **±2–3** on a score of 87 means the site is stable — if you ran it again you'd reliably expect something between 84 and 90. This is normal for a well-configured site.

A std dev of **±10–15** on a score of 87 means the scores ranged widely — perhaps 72 one run, 91 the next. This tells you something real: the site's performance is genuinely variable, likely due to inconsistent server response times, CDN cold starts, or JavaScript execution that varies with server load. The mean of 87 is less trustworthy as a single number.

A std dev of **0** would mean every single run returned the exact same score — essentially impossible for a live website, but you'd see it on a completely static page served from a fast CDN.

This is precisely why averaging multiple runs matters: a single score of 87 could have been a lucky fast run or an unlucky slow one. The std dev tells you which.