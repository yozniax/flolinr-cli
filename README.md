# flolinr-cli

Flolinr と同じ **schemaVersion 1** の `.flolinr/` を、ターミナルから読み書きするコマンド型 CLI です。データはローカルが正本で、Git または GitHub Contents API で Vault に保存できます。

Web アプリ [flolinr](https://github.com/yozniax/flolinr) と Vault を共有できます。Web が Push した内容を CLI が Pull でき、逆も成立します。Flolinr クラウドへのログインは使いません。

## 必要環境

- Node.js 20+
- GitHub へ API で Push/Pull する場合: PAT、`GH_TOKEN`、または [`gh`](https://cli.github.com/) のログイン

## インストール

```bash
git clone https://github.com/yozniax/flolinr-cli.git
cd flolinr-cli
npm install
npm run build
```

開発中はビルドなしで:

```bash
npx tsx src/cli.ts --help
# または
npm run flolinr -- --help
```

`npm link` すると `flolinr` コマンドが使えます。

## ワークスペース

```
.flolinr/
  manifest.json
  AGENTS.md
  rolls/*.csv
  remote.json          # 任意（トークンは書かない）
```

CSV の列順と `# last_edited_id` / `# schema_version,1` は Web と同じです。既存行の `id` は変更しないでください。

## コマンド

```bash
flolinr init [--git] [--remote owner/repo]
flolinr status

flolinr rolls
flolinr roll new Inbox
flolinr roll rename Inbox Notes
flolinr roll archive Notes
flolinr show Inbox
flolinr add Inbox "think in lines #idea" --parent <node-id>

flolinr search lines
flolinr tags
flolinr tags idea
flolinr logs
flolinr logs 2026-09-13

flolinr import notes.md
flolinr export Inbox --format md --out inbox.md

flolinr remote set owner/vault-repo
flolinr push
flolinr pull
```

`--dir` でワークスペースを指定できます。指定がなければ cwd から親へ `.flolinr/` を探します。

## GitHub への保存

2 通りあります。

1. **git 正本** — `flolinr init --git` のあと、通常どおり `git add .flolinr && git commit && git push`
2. **API Push/Pull** — `flolinr remote set owner/repo` のあと `push` / `pull`。Web と同じ last-write-wins です

トークンはリポジトリに書きません。優先順:

1. `FLOLINR_GITHUB_TOKEN`
2. `GH_TOKEN`
3. `gh auth token`
4. `~/.config/flolinr/config.json` の `token`

Fine-grained PAT なら対象リポジトリの **Contents: Read and write** が必要です。

## 対象外（v1）

終端 TUI、Flolinr クラウドログイン、Roll 専用 repo、OGP / 添付ファイル。

## 開発

```bash
npm test
npx tsc --noEmit
```
