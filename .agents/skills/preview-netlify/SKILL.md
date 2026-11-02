---
name: preview-netlify
description: Put a rig page on Netlify as a public preview, upload over it without the lane marker, and delete old deploys. Use for a plan's "Preview for review" and "Clean up" steps (ADR 0003).
---

# preview-netlify

One HTML file, one Netlify site, one public link that we can upload over. Ask the human before
each upload and before deleting a deploy: say what goes up, the link, who can see it, how to undo.

## Before

- `netlify status` shows the human's account. If not, the human runs `netlify login` themselves.
- Keep the preview out of the repo (ADR 0003): save it in a folder next to the repo, e.g.
  `../<repo>-preview/site/index.html`. Never commit it, never attach it to an issue or chat.

## Save the page (a command, not "save as")

```sh
PORT=8799 pnpm start &            # .env has LANE_MARKER set
curl -sf localhost:8799/digest/<night> -o ../<repo>-preview/site/index.html
kill %1
```

Without the marker: start with `LANE_MARKER=` (empty) and save to `../<repo>-preview/clean/`.
The banner then reads "no marker set"; diff the two files: only the marker may differ.

## Put it up

```sh
netlify sites:create --name <site-name> --account-slug <team-slug>   # once; non-interactive
netlify deploy --prod --dir ../<repo>-preview/site --site <site-id> --message "preview with lane marker"
```

Deploy a folder that holds only `index.html`: `sites:create` drops `.netlify/` and `.gitignore`
in the current folder.

## Check the link like a stranger, before sending it

```sh
curl -s -o /dev/null -w "%{http_code}\n" https://<site-name>.netlify.app/   # 200
curl -s https://<site-name>.netlify.app/ | grep -o '<span class="marker">[^<]*</span>'
```

Netlify serves `cache-control: max-age=0, must-revalidate`, so an upload shows at once.

## After the review is in: clean up

1. Wait until the reviewer confirms they have seen it. Until then the preview issue stays open.
2. `netlify deploy --prod --dir ../<repo>-preview/clean --site <site-id> --message "preview without lane marker"`
3. Every deploy keeps its own link (`https://<deploy-id>--<site-name>.netlify.app`), so the marker
   is still public there. List and delete the old deploy:

   ```sh
   netlify api listSiteDeploys --data '{"site_id":"<site-id>"}'
   netlify api deleteSiteDeploy --data '{"site_id":"<site-id>","deploy_id":"<old-deploy-id>"}'
   ```

4. Check both links again: the site shows "no marker set", the old deploy link answers 404.
