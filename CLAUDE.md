# Project Instructions -- Food and Poop

## What this project is

A private family app for logging a boy's meals, poops, and symptoms. Two users:
me and my spouse. We log from Windows desktops, an Android phone, and an iPhone.
Convenience is the primary design goal. The log exists to spot patterns -- which
foods precede which symptoms and which kinds of poop -- and the analysis will be
done in R, against the sheet exported as-is.

## Architecture (already decided -- do not re-litigate without being asked)

- **Storage:** a single Google Sheet. It is the database. We must be able to
  read and edit it directly in the Sheets UI at any time.
- **Server:** a Google Apps Script Web App bound to that sheet, acting as a thin
  REST-ish API. There is no other backend.
- **Client:** a static, single-page PWA hosted on GitHub Pages. No build step,
  no framework, no bundler unless I explicitly ask. Vanilla JS, ES modules.
- **Auth:** web app deployed as "execute as me / anyone with the link", plus a
  shared token in each request. This is obscurity, not security, and that is an
  accepted tradeoff for a family log. Do not propose client-side OAuth against
  the Sheets API.

Rejected alternatives, for context: Firebase/Supabase (loses the plain Google
Sheet, which is a hard requirement), Google Forms (not editable or attractive
enough), native apps.

### What the server can and cannot reach

The web app runs as me, so the blast radius is worth stating precisely. It
cannot reach my Drive or my Google account: `appsscript.json` is pinned to the
`spreadsheets.currentonly` scope, `Code.gs` uses `getActiveSpreadsheet()` and
never `DriveApp` or `openById()`, and no endpoint ever accepts a spreadsheet ID
as a parameter. **Any change that would widen that is a change worth stopping to
discuss.**

What someone with the URL and token could do: read the log, write junk rows, or
exhaust the daily Apps Script quota so the app stops working for a day.
Recoverable, and accepted.

## Non-negotiable technical constraints

These came out of design discussion and exist to prevent known failure modes:

1. **Records are keyed by UUID, never by row number.** The client generates the
   UUID. The server finds rows by scanning the id column. We edit the sheet by
   hand, so row indices are not stable.
2. **POST bodies are sent as `Content-Type: text/plain` and parsed with
   `JSON.parse` server-side.** Apps Script does not answer CORS preflight, so
   `application/json` fails. Do not "fix" this back to JSON.
3. **Every date-time column holds an ISO 8601 string in a column formatted as
   plain text.** This covers `time`, `created_at` and `updated_at`. Never store
   them as native date cells -- Sheets reinterprets them by locale.
4. **`Code.gs` stays generic.** It implements `list`, `add`, `update`, `delete`
   over a header-row-defined schema, and knows nothing about meals, poops, or
   symptoms. Domain logic lives in the client. Server changes require a
   redeploy; client changes do not. Keep the server boring so it stops changing.
5. **All server access goes through one `api.js` module** exposing exactly four
   functions: `list`, `add`, `update`, `remove`. (`delete` is a reserved word,
   so the fourth is `remove`; the wire action is still `delete`.) A second
   implementation backed by localStorage sits behind the mock switch so the UI
   can be built and debugged with no network.
6. **Mock mode is a runtime toggle, not a build-time flag.** `?mock=1` turns it
   on, `?mock=0` off, and the choice persists in localStorage. It has to be
   flippable on a device because iPhone Safari cannot be remote-debugged here.
   The mock deliberately imitates the real thing -- 800-3000ms latency, and an
   injectable failure rate -- so the optimistic UI and the retry path are
   actually exercised. A mock that answered instantly and never failed would
   leave both untested.
7. **Optimistic UI plus an offline write queue.** Apps Script round-trips take
   0.5-3s. Render immediately from local state, sync in the background, queue
   failed writes in localStorage and retry. Two rules make the queue behave, and
   both are load-bearing:
   - Strict FIFO, stopping at the first failure. An update to a record whose
     add has not landed yet must never overtake it.
   - `NetworkError` is retried forever; anything else is terminal. If the server
     understood the request and refused it, retrying will fail identically, so
     the operation is dropped, the optimistic change is undone by recompute, and
     the failure is reported. **A dropped write must always be visible in the
     UI** -- silently losing a meal someone just logged is the worst thing this
     app can do.
8. **Visible rows are derived, never edited in place.** `rows = serverRows +
   replayed queue`. An optimistic write is just a queue item; undoing one is
   removing it and recomputing. Replay must stay idempotent -- a refresh can
   return a row whose add is still queued, and adding it twice shows the same
   meal twice.
9. **The schema is cached and restored synchronously at import time.** The
   header row is kept in localStorage so a cold start with no network still
   knows how many item slots exist. Without it an entry logged offline would
   sync with its items missing. `schemaKnown()` is false until then, and the
   entry forms must refuse to save rather than write into columns that may not
   exist.
10. **Writes are wrapped in `LockService`** so simultaneous entries from two
    phones cannot collide.
11. **Register the service worker in production only.** A stale SW cache during
    development wastes hours convincing me my edits did not apply. `sw.js` is
    the worker; `js/serviceWorker.js` is the registration, and it skips
    localhost and unregisters anything left behind there.
12. **Every entry flow is cancellable.** Any form can be left without writing
    anything.
13. **The UI is Hebrew and RTL.** `lang="he"`, `dir="rtl"`. Left and right in
    this document mean literal screen positions, not logical start/end.
14. **The client never hardcodes the number of item slots.** It counts the
    `itemN` columns in the header row at load time. Widening the sheet is then a
    Sheets edit, not a code change or a redeploy.

## Data model

Wide format: **one row per entry**, not per item. An entry is defined by a single
event time -- that is what makes it one entry. A meal with three foods is one row
using three item slots.

This is deliberate, and was chosen over a long/tidy table for two reasons.
Hand-editing in the Sheets UI is a hard requirement, and in long format adding a
meal by hand would mean writing three rows, repeating the event time, and
inventing a grouping UUID by hand. And the analysis happens in R, where reshaping
wide to long is a single `pivot_longer()` call, so the tidy format costs nothing
to obtain when it is actually wanted.

Columns, in order:

| column                | meaning                                                  |
|-----------------------|----------------------------------------------------------|
| `id`                  | UUID, one per entry, generated by the client             |
| `time`                | when the event happened, as entered by the user          |
| `type`                | `אוכל` \| `קקי` \| `תסמין` -- the only validated dropdown  |
| `notes`               | free text about the entry                                |
| `item1` … `item6`     | food name, poop consistency, or symptom name             |
| `amount1` … `amount6` | grams for אוכל and קקי; severity 1-10 for תסמין           |
| `entered_by`          | who logged it, set once per device                       |
| `created_at`          | when the row was first written                           |
| `updated_at`          | when the row was last changed                            |

`time` is the event time and is what every view and analysis sorts on. It
defaults to the moment of entry but is freely editable, so it must never be
conflated with `created_at` or `updated_at`, which are written by the code and
are not the user's business.

`item` and `amount` columns are interleaved in the sheet -- `item1`, `amount1`,
`item2`, `amount2` and so on -- so that a pair reads together. `notes` sits early,
before the item slots, so hand-editing does not require scrolling past them.

Notes on the schema:

- There is no `unit` column. The unit is implied by `type`: גרם for אוכל and
  קקי, דרגה for תסמין.
- `item` columns carry no data validation. Food and symptom names are open
  vocabularies, so a dropdown would fight every new entry.
- Only `type` has a validation dropdown. The header row is protected.
- The server tolerates hand-entered rows with a missing `id` by assigning one on
  the next write.
- Six slots is a starting point, not a limit. Add `item7`/`amount7` to the sheet
  and the client will pick them up.
- `entered_by` is overwritten with the current device's name whenever an entry
  is edited. Known and accepted: it means a correction re-attributes the entry.

### Hand-typed times

The app always writes `toISOString()`. But hand-editing is a hard requirement,
and a person typing into the `time` cell writes what looks natural. Those
strings sort wrongly against ISO ones (a space sorts before `T`) and parse as the
wrong instant, so every row is passed through `normalizeTime()` in `records.js`
as it arrives in `store.load()` -- **before sorting**, which is why this cannot
live in `readRecord`.

It accepts ISO (untouched), `YYYY-MM-DD HH:MM[:SS]`, day-first `DD/MM/YYYY
HH:MM` and `D.M.YYYY HH:MM`, and bare dates as local midnight. Dates are read
day-first because that is what the two people editing this sheet type. Anything
unparseable is returned untouched rather than guessed at -- a wrong timestamp
that looks right is worse than an obviously odd one.

Nothing is written back. The sheet is mine to edit, and an app that silently
rewrites my corrections would be worse than one that tolerates them; a row heals
itself the next time it is opened and saved. **This fixes the app only.** R reads
the sheet raw, so use `lubridate::parse_date_time()` with several formats there.

### Closed vocabularies

Enforced by the client rather than by the sheet:

- `type`: אוכל, קקי, תסמין
- `itemN` when `type = קקי`: קשה, בינוני, רך, רך מאוד, שלשול
- `amountN` when `type = אוכל` or `קקי`: 10, 50, 100, 200, 300, 400
- `amountN` when `type = תסמין`: 1 through 10

Because the columns are generic, every option list and autocomplete is built by
first filtering rows on `type` -- frequent foods come from אוכל rows, frequent
symptoms from תסמין rows.

## Freshness

Nothing pushes from the sheet, so a device's copy goes stale the moment the other
phone writes. The read side refreshes when the app becomes visible again and when
the device reconnects, collapsing overlapping triggers into one call.

**Deliberately not a timer.** A 60s poll from three devices is roughly 4300 calls
a day, and at one to three seconds each that alone would approach the Apps Script
daily runtime limit -- the app would break every evening for no benefit. Two
phones open side by side will not see each other live; switching away and back is
the fix, and that is an accepted trade. Do not add polling without recalculating
that budget.

## Screens and interaction

Routes are `#name`, `#name/id`, or `#name/id/from`. The third segment records
where the user came from, so `תודה` and `לתקן` return to the history list at the
position they left rather than dumping them home. Hash routing rather than the
History API, because the app is served from a GitHub Pages subpath.

**Identity.** There is no login. `entered_by` is a per-device setting, chosen
once from `אבא` / `אמא` and changeable from the chip in the header. The chooser
must not be painted over by anything else while it is waiting for an answer.

**Home.** Large buttons: `אוכל`, `קקי`, `תסמין`, each reporting when that kind of
thing was last logged -- the question you actually have when you pick up the
phone is "has this already been recorded?". Below them, `היסטוריה` and `ניתוח`. A
smaller, deliberately harder-to-hit `קובץ` button links to the Google Sheet and
lets the OS decide what opens it.

**אוכל.** `מתי` sits at the entry level, defaulting to now: the time is editable,
one tap steps the date back to yesterday, a second tap opens a date picker. Below
it, repeating item blocks, each with:

- `מזון` -- free text, autocompleting from previously used names, with the ten
  most used names of the last ten days offered as one-tap chips. A time window
  rather than a count of entries, because what matters is what he has been eating
  lately; a fixed number of entries stretches further back in a quiet week, which
  is the wrong behaviour for a shortcut. Short of ten, the list is padded from
  `DEFAULT_ITEMS` so the chips are useful from the first day.
- `כמות` -- six image buttons showing scaled photographs of 10, 50, 100, 200,
  300 and 400 grams, so our estimates stay calibrated. Only the number is
  stored. **The tiles are drawn at their true relative widths**, read from
  `img/sizes.json`; drawing them uniformly throws away the calibration and
  defeats the point of having photographs.

`פריט נוסף` adds another block, up to the number of slots the sheet provides.
`הערות` is a single free-text field for the whole entry, placed so it clearly
belongs to the entry and not to one item. `גמרתי` submits, then shows the saved
record.

Density is a constraint, not a preference: the form has to fit on a phone screen
without scrolling, so amounts and notes collapse to a summary row that states the
current value.

**קקי.** Same shape, single item: `סוג` (the five consistencies), `כמות` (the
same six image buttons, using poop-sized photographs), `מתי`, `הערות`.

**תסמין.** Repeating item blocks: `תסמין` (free text with the same autocomplete
behaviour as `מזון`) and `חומרה` (1-10). Plus `מתי` and `הערות` for the entry.

**Entry detail.** One screen serves two jobs: shown straight after saving, so a
mistake is caught now rather than found in the sheet a week later, and shown
again when an entry is tapped in היסטוריה. `לתקן`, `תודה`, and somewhere else to
go. A freshly saved entry may still be in the write queue; it displays and edits
exactly as if it had landed.

**היסטוריה.** One chronological column on a shared vertical time axis, grouped by
day. Three parallel columns were considered and rejected: on a phone they are too
narrow to read, and interleaving by time says the same thing. Type is carried by
a distinct icon and colour rather than by position, alongside the time.

**Newest first, both between days and within a day.** What you nearly always
want on opening this screen is the last thing that happened, and it should be at
the top. This does mean a meal does not read above the poop that followed it;
that was weighed and the top-of-list rule won.

Tap to open the detail view; `בחירה` turns on checkboxes for deleting several at
once, with a confirmation before anything is deleted. Selection mode is the only
delete path, which keeps deletion deliberately hard to hit by accident. Older
days are revealed a week at a time.

**ניתוח.** Placeholder for now. The analyses we actually want to look at will be
designed later.

## Service worker

`sw.js` exists to make the app open with no signal. Code and markup are
network-first falling back to cache -- cache-first is how you spend an hour
convinced your edits did not apply. Photographs are cache-first; they are large
and never change. Apps Script requests are never touched, because a cached reply
means a stale log, which is worse than none.

**`PRECACHE` deliberately does not list the ES modules under `js/`.** `index.html`
loads `js/app.js` as a module, so the browser fetches the whole import graph on
the first visit and the network-first handler caches each file as it goes.
Listing them too would mean maintaining a copy of the file tree, and forgetting
one fails invisibly -- it only breaks offline, and the precache merely warns. So
adding a module needs no edit to `sw.js`.

What stays listed is what the import graph cannot reveal: the shell, the
photographs (`loading="lazy"`, so never fetched until an amount picker opens),
and the icons (fetched by the OS, not the page). Bump `CACHE_VERSION` when that
list or the worker's logic changes.

## Coding conventions

- Modular over patchy. If a fix starts sprawling, stop and propose a
  refactor instead.
- Put a short comment above each block of code explaining what the block does
  and why.
- Prefer plain, readable JS over clever JS.

## Layout

```
index.html  manifest.json  sw.js       app shell, PWA manifest, service worker
css/app.css                            all styling, one file
js/       app.js router.js store.js    bootstrap, hash router, state
          api.js api.remote.js         the only route to the server
          api.mock.js seed.js          localStorage double, and its seed data
          queue.js errors.js           offline write queue
          records.js                   domain model, wide-row translation
          config.js identity.js        endpoint + token, who is logging
          format.js typeStyle.js       Hebrew formatting, per-type icon/colour
          imageSizes.js                true tile sizes, from img/sizes.json
          serviceWorker.js             registration (not the worker itself)
          screens/ ui/                 one file per screen, shared controls
server/   Code.gs appsscript.json      the whole backend
img/      icons/                       calibration photographs, PWA icons
test-api.html  test-store.html         manual harnesses, not part of the app
ids.txt                                sheet/script/deployment IDs, and the token
```

Repo: `https://github.com/baranan/food-and-poop`, served from GitHub Pages.
`ids.txt` is committed, and the repo is public so Pages will serve it -- so the
token is published. That is the accepted tradeoff above, but it means rotating
the token is a two-file edit: `ids.txt` and `js/config.js`, plus the `TOKEN`
script property.

## Workflow

- `Code.gs` lives in the repo under `server/`. It reaches the Apps Script project
  either by pasting it into the editor, or -- if clasp is ever installed -- with
  `clasp push` followed by `clasp deploy -i <deploymentId>`. clasp is optional
  and Node is not otherwise used in this project. Never create a new deployment;
  that changes the URL. Update the existing one.
- Server logic is tested by a `test_*()` function run directly in the Apps
  Script editor with a fake event object. `test_environment()` first when
  something fails for no obvious reason. Deploy only when the client needs it.
- Client is tested against a local static server, then on real phones. `?mock=1`
  for no network, `?debug=1` or a long press on the title for the log panel.
- I do not have a Mac, so iPhone Safari cannot be remote-debugged. Keep an
  on-screen debug log panel available in the app for mobile diagnosis.
- SETUP.md is the runbook for standing up a sheet, script project and deployment
  from nothing. It is still needed: everything so far is the dev sheet, and
  production has not been created yet.

## How to work with me

- Ask before making architectural changes. Small implementation choices are
  yours.
- Tell me when evidence or a recommendation is weak, rather than sounding
  confident.
- Keep explanations short, and end longer ones with a summary under 100 words.
