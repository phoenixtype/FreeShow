# Scriptural Project

Songs and scripture on screen for church meetings, by [Scriptural](https://scriptural.online). It listens to the preacher and brings up each verse as it is read.

Download: [project.scriptural.online](https://project.scriptural.online)

- Live scripture: references, quotes, paraphrases (by meaning) and well-known stories become slides; "next verse" and "go to chapter four" move the screen.
- Every Bible version Scriptural serves (Import scripture > Scriptural), offline once downloaded.
- Imports EasyWorship, ProPresenter, OpenLP, MediaShout, PowerPoint and more (Import).
- Agents can run it through the [MCP server](mcp/README.md) or the REST API.

## Development

```bash
npm ci
npm start           # app with live reload
npm run test:unit
npm run build
```

Pushing to `main` builds installers for Windows, Mac and Linux into a GitHub release (`.github/workflows/release.yml`). `site/` is the download page, deployed to Cloudflare Pages project `scriptural-project`.

Upstream changes: `git fetch upstream && git merge upstream/main`.

## Licence

Built on [FreeShow](https://github.com/ChurchApps/FreeShow) by Kristoffer Vassbø and ChurchApps. Free software under the GNU GPL v3 (see LICENSE); this project's changes are under the same licence.
