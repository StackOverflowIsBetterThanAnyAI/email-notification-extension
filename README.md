# Gmail Notifier

Shows a desktop notification whenever a new email lands in your Gmail inbox.
Intended for personal use – loaded unpacked, **not** published to the Chrome Web Store.

- Requires Node.js ≥ 20.12. Key generation and build need no npm packages; linting needs `npm install` once.
- OAuth scope: `gmail.metadata` (sender, subject, labels – never the email body)
- Every user creates their **own** extension ID and **own** Google OAuth client.

## 1. Create your extension ID

Chrome identifies an extension by its ID, and the Google OAuth client must be registered
for exactly that ID. Generate your own fixed ID:

```bash
npm run keygen
```

This creates `.env` (from `.env.example`), writes a new `EXTENSION_PUBLIC_KEY` into it and
prints **your extension ID** – note it down for step 2.

- Running it again only prints your current ID; it never overwrites an existing key.
  `npm run keygen -- --force` creates a new key and therefore a **new ID** (you'd then need
  a new OAuth client as well).
- Only the _public_ key is stored. The private key is discarded – it is only needed for
  packing a `.crx` / publishing to the Web Store, which this project doesn't do.

<details>
<summary>Alternative: without a fixed key</summary>

Leave `EXTENSION_PUBLIC_KEY` empty, build (step 3) and load `dist/` (step 4) first.
Chrome then assigns an ID based on the folder path – copy it from `chrome://extensions`
and use it for step 2. Caveat: the ID changes if you move or rename the project folder,
and you'd have to update the OAuth client.

</details>

## 2. Google Cloud setup (one time, ~5 minutes)

1. Open <https://console.cloud.google.com/> and create a new project (e.g. "Gmail Notifier").
2. **APIs & Services → Library** → search for **Gmail API** → **Enable**.
3. **Google Auth Platform → Branding / OAuth consent screen**
    - User type: **External**
    - App name: e.g. "Gmail Notifier", support email: your address
    - **Data access → Add or remove scopes** → add `https://www.googleapis.com/auth/gmail.metadata`
    - **Audience** → leave the publishing status on **Testing** and add your Google account under **Test users**.
4. **Clients → Create client**
    - Application type: **Chrome Extension**
    - Item ID: **your extension ID** from step 1
    - Copy the generated **Client ID** and put it into `.env`:

      ```
      GOOGLE_CLIENT_ID=1234567890-abc123.apps.googleusercontent.com
      ```

> In "Testing" mode Google asks you to re-consent about every 7 days. Just click
> **Sign in with Google** again when the badge shows a red `!`. To avoid this, set the
> publishing status under **Audience** to **In production** (no Google review needed for
> personal use); you'll see a one-time "Google hasn't verified this app" warning when
> signing in – continue via **Advanced → Go to Gmail Notifier**.

### Configuration overview

The manifest is generated from `manifest.template.json`; your values live in `.env`,
which is git-ignored.

| Variable               | Required | Description                                                       |
| ---------------------- | -------- | ----------------------------------------------------------------- |
| `GOOGLE_CLIENT_ID`     | yes      | OAuth client ID (type "Chrome Extension")                         |
| `EXTENSION_PUBLIC_KEY` | no       | Public key that pins your extension ID (created by `npm run keygen`) |

Variables set in the shell environment take precedence over `.env`.

## 3. Build

```bash
npm run build
```

This validates the variables, fills them into the manifest, writes the loadable extension
to `dist/` and prints your extension ID. The build fails with a clear message if a variable
is missing or malformed.

## 4. Install the extension

1. Open `chrome://extensions`
2. Turn on **Developer mode** (top right)
3. **Load unpacked** → select the **`dist`** folder
4. Check that the displayed ID matches your extension ID from step 1
5. Pin the extension, open it and click **Sign in with Google**

**Account:** `chrome.identity` uses the Google account(s) signed in to your Chrome profile.
To watch a different account, use a separate Chrome profile signed in with that account.

**No notifications appearing?** On Windows check _Settings → System → Notifications_
(Google Chrome must be allowed, Focus Assist / Do Not Disturb off).

## How it works

- A `chrome.alarms` timer (15 s – 15 min, configurable; intervals below 30 s only work for unpacked extensions) calls the Gmail
  [history API](https://developers.google.com/gmail/api/reference/rest/v1/users.history/list)
  to find messages added to the inbox since the last check.
- Only messages that are still in the inbox and unread trigger a notification.
  More than 3 new messages are combined into one summary notification.
- Clicking a notification opens the message in Gmail.
- The toolbar badge shows the unread count of your inbox (red `!` = error / sign-in needed).

## Security & privacy

- **Least privilege:** read-only `gmail.metadata` scope; permissions limited to
  `identity`, `alarms`, `notifications`, `storage`; host access only to
  `gmail.googleapis.com` and `oauth2.googleapis.com`.
- **No token storage:** access tokens are managed by Chrome (`chrome.identity`); the extension
  stores only email address, history ID, unread count and settings in `chrome.storage.local`.
  No email content is stored.
- **Sign out revokes** the grant at Google and clears Chrome's token cache.
- **Strict CSP** (`default-src 'none'`, no inline scripts, no remote code, no `eval`).
- **Untrusted input:** sender/subject are stripped of control/bidi characters and truncated;
  the UI uses `textContent` only (no `innerHTML`). Message IDs are validated before building URLs.
- **Messaging:** the service worker only accepts allow-listed message types from the
  extension's own pages; no `externally_connectable`, no content scripts.
- Requests use `credentials: 'omit'`, `no-referrer`, `no-store` and a timeout.
- Option **"Show sender and subject"** can be turned off (e.g. during screen sharing).
- **Config out of the repo:** the Client ID lives in the git-ignored `.env`, never in
  committed files. Note that neither value is a real secret: a "Chrome Extension" OAuth
  client has no client secret, the ID is visible in any installed copy, and the key is
  a _public_ key. Keeping them out of git just avoids publishing them needlessly.
  Do not commit `.env` or `dist/`.

## Accessibility

- Semantic HTML (`main`, headings, `dl`, `fieldset`/`legend`, labelled controls), `lang="en"`.
- Status updates via `role="status"` live region, errors via `role="alert"`.
- Focus moves to the new view's heading after sign-in / sign-out; visible `:focus-visible` outlines.
- Fully keyboard-operable; busy buttons use `aria-disabled` (stay focusable).
- No layout shifts: the status line reserves its space and button labels stay constant.
- WCAG AA contrast in light and dark mode, `forced-colors` and `prefers-reduced-motion` support,
  target sizes ≥ 24 px, relative font sizes.
- Notifications are native OS notifications and are read by screen readers.
- The badge has a descriptive tooltip (e.g. "Gmail Notifier – 3 unread emails").

## License

[MIT](LICENSE) © 2026 Michael Münzenhofer
