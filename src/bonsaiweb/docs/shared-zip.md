# Shared zip link

A project someone else can open is one zip. **Save project** already writes it: the `.ifcfed` plus the relative files it names. See [ifcfed.md](ifcfed.md). Dropping that zip on the viewport opens it today. The same zip, or a single `.ifc`, `.ifcview`, `.glb`, or `.gltf`, also opens from `src` on the page URL.

The Bonsai app reads `src` after the viewer is ready. The playground chooser (`/playground?src=`) forwards that parameter to the Bonsai playground, which opens it instead of the saved sample. A host that opens its own model passes `sharedLink: false`.

## The link to send

Share the zip file in Dropbox as **anyone with the link**. Send the Bonsai page with that link in `src`:

```text
https://<bonsai>/?src=<encoded Dropbox file link>
```

Encode the Dropbox URL. It contains `?` and `&`, and an unencoded value is cut at the first `&`.

```text
https://bonsai.example/?src=https%3A%2F%2Fwww.dropbox.com%2Fscl%2Ffi%2Fabc%2FSite.zip%3Frlkey%3Dxyz%26dl%3D1
```

`src` may also be a direct content URL that already uses `dl.dropboxusercontent.com`. The `rlkey` is the access secret. Anyone who has the Bonsai URL can download the zip.

## Which Dropbox URL is a file

Accept a shared **file** link:

```text
https://www.dropbox.com/scl/fi/<id>/<filename>.zip?rlkey=<key>&dl=0
```

| Piece | Rule |
|-------|------|
| Host | `www.dropbox.com`, `dropbox.com`, or `dl.dropboxusercontent.com` |
| Path | `/scl/fi/…` or the older `/s/…` file path. The last segment is the zip name. |
| `rlkey` | Required on `/scl/fi/` links. Keep it. |
| `dl` | Force `dl=1` before the fetch. `dl=0` is the HTML preview. |

Refuse a folder link (`/scl/fo/…`). Dropbox does not give the browser a file listing for it, and the content host below does not serve a folder. Put the project in one zip and share that file.

A team-only link, a password link, or a link that still requires a Dropbox login will not return the zip to an anonymous fetch.

## The content host

`www.dropbox.com` does not answer a `fetch` from another origin. Rewrite the host, then request the file:

```text
https://www.dropbox.com/scl/fi/<id>/Site.zip?rlkey=<key>&dl=0
        ↓
https://dl.dropboxusercontent.com/scl/fi/<id>/Site.zip?rlkey=<key>&dl=1
```

Keep the path and every query parameter. Set `dl=1`. Drop `st` only if a later response is HTML that asks the visitor to continue in a browser; the first request should still send the link as shared.

```text
GET https://dl.dropboxusercontent.com/scl/fi/<id>/Site.zip?rlkey=<key>&dl=1
```

This host returns `Access-Control-Allow-Origin: *` for a simple GET. Dropbox does not document the host swap and may change it. The fetch stays a simple GET so the browser does not preflight:

- Method `GET`.
- `credentials: 'omit'`. A credentialed request cannot use `*`.
- No `Authorization` header and no other custom header. This path does not use the Dropbox sign-in.
- `redirect: 'follow'`.

Read the body as bytes. Take the filename from `Content-Disposition` when Dropbox sends one, otherwise from the last path segment.

## What the bytes must be

The body is the zip when it starts with `PK` (`50 4B`). Hand those bytes to `Loader.loadLocalFile` as a `File` named with the zip's filename. A zip that contains an `.ifcfed` opens through `openProjectBag`. A zip with no `.ifcfed` stays the single `.ifc` / `.ifcview` pair.

Stop when the body is not a zip. Dropbox then returned an HTML page: the preview, a login wall, a password prompt, or a "file is too large" interstitial. Show that the link did not return the zip. Do not parse the HTML.

| Response | What to do |
|----------|------------|
| `200` and the body starts with `PK` | Open it as a local zip. |
| `200` and the body is HTML or any other type | The content host refused a direct file. Report the link. |
| `401`, `403`, `404` | The link is private, expired, or missing `rlkey`. |
| Network or CORS error | The host swap no longer allows this origin. The same zip still opens if the visitor downloads it and drops it on the viewport. |

## What the zip contains

Same archive as **Save project**:

```text
Site.ifcfed
ARC.ifc
ARC.ifcview
structure/STR.ifc
structure/STR.ifcview
```

`source.path` in the `.ifcfed` is the entry name. One shared top folder is removed, so `Site/Site.ifcfed` and `Site/ARC.ifc` still match. Two `.ifcfed` files after that strip is an error. Paths stay relative: `/` separators, no leading slash, no `..`.

## When the page runs it

Read `src` once, after the viewer is ready, and only when the session has no model yet. One zip replaces the scene the way **Open** does. A failed fetch leaves the empty session in place.

The Dropbox File Manager is a different path. It lists and downloads with the signed-in account. A shared zip link does not sign anyone in and does not write back to Dropbox.
