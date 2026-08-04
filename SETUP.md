# Setup -- what you need to do before I write code

Do these in order. Steps 1-3 are the ones I actually need finished; 4-6 can wait
until there is something to deploy. Everything here is for the **dev** Sheet.
We repeat 1-4 later for production, which is why the steps are written to be
repeatable.

---

## 1. Create the dev Google Sheet

1. New Google Sheet. Name it `food-and-poop-DEV` so it is never confused with the
   real one.
2. Rename the first tab to `log`. (I will refer to it by name, not position.)
3. Paste this as row 1, starting at A1. It is 19 columns, A through S:

```
id	time	type	notes	item1	amount1	item2	amount2	item3	amount3	item4	amount4	item5	amount5	item6	amount6	entered_by	created_at	updated_at
```

   Those are tab characters, so pasting into A1 should spread across A1:S1. If it
   all lands in one cell, use Data > Split text to columns.

4. **Format the three date columns as plain text, before any data goes in.**
   Select columns B, R, and S (`time`, `created_at`, `updated_at`), then
   Format > Number > Plain text. This is the single most important step on this
   page. If you skip it, Sheets will silently reinterpret ISO strings by locale
   and the timestamps will be quietly wrong.
5. Leave the `amount*` columns as Automatic. They should stay numeric.
6. Data validation on column C (`type`). First select the range `C2:C` -- that
   means "column C from row 2 to the bottom", the whole column except the header.
   To select it, click the Name Box (the small field at the top left, just to the
   left of the formula bar), type `C2:C`, and press Enter. Starting at row 2
   keeps the rule off the header cell, which would otherwise be flagged as
   invalid. Then Data > Data validation > Add rule > Dropdown, with exactly these
   three values:

   ```
   אוכל
   קקי
   תסמין
   ```

   Set "If the data is invalid" to **Reject the input**.
7. Freeze row 1: View > Freeze > 1 row.
8. Protect row 1: select row 1 > right-click > View more row actions > Protect
   range > Set permissions > Only you.
9. From the URL, copy the **Sheet ID** -- the long string between `/d/` and
   `/edit`.

---

## 2. Create the bound Apps Script project

1. In that Sheet: Extensions > Apps Script. This creates a project already bound
   to the Sheet, which is what we want -- do not create a standalone script.
2. Name it `food-and-poop-DEV`.
3. Project Settings (gear icon) > copy the **Script ID**.

---

## 3. Generate the shared token

1. Open any browser console and run `crypto.randomUUID()`, or use a password
   generator. Anything 20+ random characters is fine.
2. In the Apps Script project: Project Settings > Script Properties >
   Add script property.
   - Property: `TOKEN`
   - Value: the string you generated
3. Save.

3. The client needs the same string. It goes in `config.js` in the repo. Since
   free GitHub Pages requires a public repo, that token is readable by anyone who
   views source -- this is accepted, per the auth note in CLAUDE.md.

### What that does and does not expose

The web app runs as you, so it is worth being precise about the blast radius.

It cannot reach your Drive or your Google account. The endpoint exposes exactly
four operations against one spreadsheet, and there is no way to make it run
anything else. To keep that true rather than merely likely, `appsscript.json` is
pinned to the `spreadsheets.currentonly` scope, `Code.gs` uses
`getActiveSpreadsheet()` and never `DriveApp` or `openById()`, and no endpoint
ever accepts a spreadsheet ID as a parameter. Any change that would widen that
scope is a change worth stopping to discuss.

What someone with the URL and token could do: read the log, write junk rows, or
exhaust the daily Apps Script quota so the app stops working for a day.
Recoverable, and accepted.

---

## 4. Deploy the web app

1. In the Apps Script editor: Deploy > New deployment.
2. Type: **Web app**.
3. Execute as: **Me**.
4. Who has access: **Anyone**. Not "Anyone with a Google account" -- that one
   will break the client.
5. Deploy. You will be asked to authorize scopes; the "unverified app" warning is
   expected for your own script -- click Advanced > Go to (unsafe).
6. Copy two things: the **web app URL** ending in `/exec`, and the
   **Deployment ID**.

From here on, redeploying is `clasp deploy -i <deploymentId>`, which keeps that
URL stable. Never use "New deployment" again on this project.

---

## 5. clasp (OPTIONAL -- skip unless you want it)

**This is not required.** clasp needs Node, and Node is not otherwise used
anywhere in this project -- there is no build step and no npm dependencies. All
clasp buys is `clasp push` instead of pasting `Code.gs` into the Apps Script
editor by hand. Since `Code.gs` is deliberately generic and expected to stop
changing, that is a handful of pastes over the project's life.

Without clasp: open the Apps Script editor, paste the contents of
`server/Code.gs`, save. That is the whole workflow.

For the local static server during client development, VS Code's Live Server
extension works with no Node, as does `python -m http.server`.

If you do want clasp:

1. Enable the Apps Script API for your account:
   https://script.google.com/home/usersettings -- turn it on.
2. Install and log in:

   ```
   npm install -g @google/clasp
   clasp login
   ```

3. Clone into a `server/` subfolder, **not** the repo root:

   ```
   mkdir server
   cd server
   clasp clone <scriptId>
   ```

   This matters. `clasp push` uploads every `.js`, `.gs` and `.html` file beneath
   its root directory, so cloning into the repo root would mean pushing the
   client code into the Apps Script project. Keeping the server in `server/` and
   the client at the repo root keeps the two apart, and keeps the Pages root
   clean.

---

## 6. GitHub repo and Pages

1. Create a repo, push this folder.
2. Settings > Pages > Source: Deploy from a branch, branch `main`, folder `/root`.
3. Note the resulting `https://<user>.github.io/<repo>/` URL. HTTPS matters -- the
   service worker will not register without it.
4. Smoke-test it before there is an app. Commit an `index.html` containing
   nothing but `<h1>hi</h1>`, wait for the Pages build, then open the URL on the
   iPhone and on the Android. Confirming that Pages works while there is nothing
   to blame it on is worth the two minutes -- iPhone Safari cannot be
   remote-debugged, so you want hosting problems and app problems to show up
   separately.

---

## What to send me when you are done

- Sheet ID (dev)
- Web app URL ending in `/exec`
- Deployment ID
- Script ID
- GitHub Pages URL
- The token (it lives in the repo anyway, so chat is no worse)

---

## Things that commonly go wrong

- **Timestamps come back mangled.** Column B, R or S was not set to plain text
  before data was written. Fix the format, then rewrite the affected rows.
- **The client gets a CORS error.** Almost always "Who has access" is set to
  "Anyone with a Google account" rather than "Anyone".
- **Edits do not appear in the app.** Either the service worker cached an old
  build, or `clasp push` happened without `clasp deploy -i`.
- **Hebrew arrives as mojibake.** Should not happen with `text/plain` plus
  `JSON.parse`, but if it does, tell me rather than adding encoding hacks.
