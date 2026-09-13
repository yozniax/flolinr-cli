# flolinr-cli

Terminal で `flolinr` と打つと、nano のような全画面アウトライナーが開きます。Enter / Tab / Shift+Tab は Web の Flolinr と同じです。

データはローカルの `.flolinr/` が正本で、Git または GitHub Contents API でも保存できます。Web アプリ [flolinr](https://github.com/yozniax/flolinr) と Vault を共有できます。Flolinr クラウドへのログインは使いません。

## 必要環境

- Node.js 20+
- GitHub へ API で Push/Pull する場合: PAT、`GH_TOKEN`、または [`gh`](https://cli.github.com/) のログイン

## インストール

```bash
git clone https://github.com/yozniax/flolinr-cli.git
cd flolinr-cli
npm install
npm run build
npm run install:bin
```

`install:bin` は `~/.local/bin/flolinr` にシンボリックリンクを作ります（Fedora の既定 PATH に含まれます）。

`npm link` は npm のグローバル bin（例: `~/.npm-global/bin`）へ入れます。そのディレクトリが PATH に無いと `flolinr: command not found` になります。その場合は次のどちらかです。

```bash
npm run install:bin
# または
export PATH="$HOME/.npm-global/bin:$PATH"
```

開発中はビルドなしで:

```bash
npx tsx src/cli.ts --help
# または
npm run flolinr -- --help
```

## ワークスペース

```
.flolinr/
  manifest.json
  AGENTS.md
  rolls/*.csv
  remote.json          # 任意（トークンは書かない）
```

CSV の列順と `# last_edited_id` / `# schema_version,1` は Web と同じです。既存行の `id` は変更しないでください。

## 日常の使い方

使い方の一覧:

```bash
flolinr help
```

画面の中では `Ctrl+G` でも同じ内容を表示します。

ノートを置きたいディレクトリで:

```bash
flolinr
```

`.flolinr/` が無ければ作り、Inbox が開きます。

| キー | 動作 |
|---|---|
| Enter | 下に新しい行 |
| Tab | 一段深くする |
| Shift+Tab | 一段浅くする |
| ↑ / ↓ | 行移動 |
| Backspace | 文字削除。空行なら行ごと削除 |
| Ctrl+L | 折りたたみ |
| Ctrl+S | 保存（編集中も自動保存） |
| Ctrl+R | Roll 一覧（Enter で開く、`n` で新規） |
| Ctrl+G | キー一覧 |
| Ctrl+X | 保存して終了 |

特定の Roll を開く:

```bash
flolinr Inbox
```

## その他のコマンド

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

Flolinr クラウドログイン、Roll 専用 repo、OGP / 添付ファイル。

## 開発

```bash
npm test
npx tsc --noEmit
```
