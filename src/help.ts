export const USAGE = `flolinr — ターミナル用アウトライナー

起動
  flolinr                 全画面アウトライナーを開く
  flolinr <roll>          指定した Roll を開く
  flolinr help            この使い方
  flolinr --help
  flolinr --dir <path>    ワークスペースを指定

画面のキー（nano と同様、^ は Ctrl）
  Enter                   下に新しい行
  Tab                     一段深くする
  Shift+Tab               一段浅くする
  ↑ / ↓                   行を移動
  ← / →                   カーソル移動
  Backspace               文字削除。空行なら行ごと削除
  Ctrl+L                  折りたたみ / 展開
  Alt+↑ / Alt+↓           同じ階層で並べ替え
  Ctrl+S                  保存（入力中も自動保存）
  Ctrl+R                  Roll 一覧（Enter で開く、n で新規）
  Ctrl+G                  この使い方
  Ctrl+X                  保存して終了

その他のコマンド
  init [--git] [--remote owner/repo]
  status
  rolls
  roll new <name>
  roll rename <name|id> <new>
  roll archive <name|id>
  show <roll>
  add <roll> <text>
  search <query>
  tags [name]
  logs [YYYY-MM-DD]
  import <file.csv|file.md>
  export <roll> [--format csv|md]
  remote set owner/repo
  remote show
  push
  pull

データはローカルの .flolinr/ が正本です。
GitHub へは git push、または flolinr push / pull で保存できます。
トークンは FLOLINR_GITHUB_TOKEN → GH_TOKEN → gh auth token →
~/.config/flolinr/config.json の順で探します。
`

export const USAGE_LINES = USAGE.replace(/\n$/, '').split('\n')
