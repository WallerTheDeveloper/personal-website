# Authored project bodies

One file per project — `p1.html` … `p4.html` — holding the body of that
project's detail dialog. Write plain HTML. It is read at build time by
`build/copy-tokens.ts` and inlined, **unescaped**, into the matching
`<div class="project__body" data-body="pN">` in `index.html`.

A file that does not exist leaves the slot empty. That is the normal unfilled
state, not an error.

## What these files are

A **fragment**, not a document. No `<html>`, `<head>` or `<body>` — the content
starts at your first heading or paragraph.

The bodies currently in this directory are **seeded from the tokens they
replaced** (`PROJECT_n_POINT_1`, `_POINT_2`, `_STACK`). They are a starting
point so no copy was lost in the move, not finished writing. Replace them.

## Rules

`tests/unit/authored-html.test.ts` checks every file here on `npm test`, so a
mistake shows up in a second rather than in a Playwright run. It rejects:

| Not allowed | Why |
|---|---|
| `<script>` | Nothing on this site executes from content. Banned for predictability, not for XSS — these are your own files. |
| `on*=` handlers (`onclick`, …) | Same. |
| `style="…"` | Every visual decision belongs in `src/styles.css`. Use the classes below. |
| `border-radius`, `box-shadow`, `font-family` anywhere in the text | The house rules: radii are 0 everywhere but the fps chip and the reticle, there are no shadows anywhere, and the type is the three families. `tests/e2e/visual.spec.ts` sweeps the rendered page for all three. |
| `<h1>`, `<h2>`, `<h3>` | The document already uses them: panel `<h1>` → card `<h2>` → dialog `<h3>`. Start at **`<h4>`**. |
| An `<img>` with no `alt` | Every image needs one. Decorative? `alt=""`. |
| An external `<a>` with no `rel="noopener"` | Same rule the rest of the site follows. |
| `{{` | Copy tokens are filled before the body is inlined, so a token written here would ship as visible braces. Put the copy in the file. |
| Unbalanced tags | A cheap tag-stack check. It will not catch everything, but it catches the one that matters. |

## What you can use

Ordinary flow content — `<p>`, `<ul>`, `<ol>`, `<h4>`–`<h6>`, `<strong>`,
`<em>`, `<code>`, `<blockquote>`, `<a>`, `<img>`, `<figure>` — all of it
inherits the panel's type and its accent.

Two opt-in classes, so a side-by-side figure needs no inline style:

```html
<div class="shots">
  <img class="shot" src="projects/pick-ma-job-1.png" alt="The job list, scored">
  <img class="shot" src="projects/pick-ma-job-2.png" alt="A single job's analysis">
</div>
```

`.shots` is a responsive grid that collapses to one column on a phone; `.shot`
sizes an image to its cell. A single image needs neither.

## Images

Put them in `public/projects/` and reference them **relative**:

```html
<img src="projects/shot-1.png" alt="…">
```

Relative is what makes them resolve under the site's `/personal-website/` base,
the same way `href="cv.pdf"` already does. A leading slash would 404 on the
deployed site. `public/` is outside both size budgets, so screenshots cost
nothing there — but they are still downloaded by anyone who opens the detail,
so keep them sensible.
