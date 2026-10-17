# grilling-pane

[English](README.md)

[![test](https://github.com/meganemura/grilling-pane/actions/workflows/test.yml/badge.svg)](https://github.com/meganemura/grilling-pane/actions/workflows/test.yml)

grilling-pane は、Claude が計画に取りかかる前に、その計画について人に質問する Claude Code の plugin（mod）である。
plugin の skill `grilling-pane:grilling` は、質問の進め方として Matt Pocock の `grilling` skill を呼び出す。
skill は各ラウンドの質問を 1 つの block に書き、grilling-pane はその block を transcript の横の pane に描く。
1 回の Submit で、ラウンド全体への回答を 1 ターンで送る。

## 見た目

```
[ Submit ] 1 answered, 1 skipped

Q4 Where does the cache live?
  ( ) In the memory of the application process
      recommended: the goal is desk latency, so a shared service
      adds cost with no gain
  ( ) In a shared store such as Redis
  ( ) Talk about this one

Q5 What does one lookup ask for?
  (*) The loan state of one book copy
      recommended: a return changes one copy, so the write
      invalidates exactly one entry
  ( ) All loans of one patron
  ( ) Talk about this one

[ Submit ] 1 answered, 1 skipped
```

## 必要なもの

- Claude Code 2.1.280 以降。Claude Code 2.1.287 以降は mod を標準で読み込む。それより古い版では `CLAUDE_CODE_ENABLE_FUNCTION_HOOKS=1` を設定する。
- terminal のセッション、または Claude Code Desktop の Code タブ。print mode（`-p`）には pane がない。
- mattpocock/skills の upstream `grilling` skill（v1.2.0 以降）:
  `gh skill install mattpocock/skills grilling --agent claude-code`

## インストール

```sh
claude plugin marketplace add meganemura/grilling-pane
claude plugin install grilling-pane@grilling-pane
```

checkout を使って開発するときは、作業ツリーから plugin を読み込む。

```sh
claude --plugin-dir /path/to/grilling-pane/plugin
```

### Claude Code Desktop

pane は Claude Code Desktop の Code タブにも描かれる。
上の command で user スコープにインストールした plugin は、Desktop でも読み込まれる。
Desktop では `/plugin` は動かない。
アプリからインストールするには、プロンプト欄の横の + を押し、Plugins、Add marketplace の順に進んで `meganemura/grilling-pane` を指定し、Add plugin を押す。

Desktop は `--plugin-dir` を受け取らない。
Desktop で checkout を使って開発するときは、`~/.claude/settings.json` の `env` に次を設定する。

```json
{
  "env": {
    "CLAUDE_CODE_PLUGIN_DIRS": "/path/to/grilling-pane/plugin",
    "CLAUDE_CODE_PLUGIN_DIR_WATCH": "1"
  }
}
```

## 使い方

`/grilling-pane:grilling <計画>` で始める。
`/grilling-pane` で pane の表示と非表示を切り替える。
`/grilling-pane` は pane に keyboard の focus も渡す。
矢印 key でボタンの間を移動し、Enter で focus のあるボタンを押す。
Esc で focus がプロンプト欄に戻る。
マウスのクリックでもボタンを押せる。
選択肢のボタンを押すとその選択肢を選ぶ。
同じボタンをもう一度押すと選択を外す。
各質問の最後の選択肢 `Talk about this one` も同じように動く。
一覧の上か下の `Submit` を押すと、ラウンドを送る。

`Talk about this one` を選ぶと、その下に 1 行の入力欄が出て、focus がそこに移る。
考えていることをそこに書く。入力は任意である。
Enter は文字を残したまま何も送らず、focus を次の質問に移す。最後の質問のあとは下の `Submit` に移す。
ラウンドを送るのは `Submit` だけである。

一度 pane を表示すると、以後はラウンドが届くたびに、keyboard を奪わずに pane が自動で開く。
止めるには `/grilling-pane` で pane を隠す。

### Claude Code Desktop での使い方

Desktop では、pane は 1 問ずつ回答する。`Submit` はない。

- 選択肢を押すと、その回答をすぐに送る。Claude は短いターンで返答し、次のラウンドを書く。次のラウンドには、まだ開いている質問、その回答から出てきた追加の質問、その回答で不要になった質問が入る。
- Claude が書いている間も、ほかの質問に答えられる。1 回押すごとにプロンプトが 1 つ増え、順番を待って送られる。
- `Talk about this one` を押すと、その下に入力欄が出る。入力欄で Enter を押すと、書いた文字を付けて `(discuss)` を送る。
- pane は会話のすべての質問を番号順に並べる。新しいラウンドは末尾に行を足すので、上の行は動かない。回答済みの質問には、その回答を表示する。Claude が取り下げた質問はグレーになり、理由を表示し、ボタンを持たない。
- 新しいラウンドやほかの回答で pane を描き直しても、入力欄の文字は消えない。

1 問だけの回答プロンプトは次のようになる。

```
Answers (grilling-pane):
Q13 Is the loan cache per user, or one for the whole library? → Per user
Still open (grilling-pane): Q14, Q15
```

質問がもう不要だと示すとき、skill は block に `Drop` 行を書く。

```grilling
Drop Q15: a per-user cache has no shared store
Q14: Does an entry expire by time, or on write?
- By time
- On write
Q16: Does a return clear the entry?
- Yes
- No
```

## ラウンドが開いている間に文字で返答する

入力したメッセージはそのまま送られる。plugin が書き換えることはない。
Claude は、メッセージが触れていない質問を、スキップではなくまだ開いている質問として読む。
pane はそれらの質問の選択を残し、次のラウンドはそれらの質問をもう一度出す。

## 質問の block

plugin の skill は、各ラウンドを `grilling` というラベルの fenced block の中に書く。

```grilling
Q13: Is the loan cache per user, or one for the whole library?
- Per user (recommended: it matches the authorization boundary)
- One for the whole library
Q14: Does an entry expire by time, or on write?
- By time
- On write
Q15: Which store holds the sessions?
- The application's own memory
- A shared store such as Redis
```

`Q<n>: <質問>` の行が 1 つの質問を始め、その下の `- ` の行が選択肢になる。
推奨の選択肢は `(recommended: <理由>)` で終わる。
番号は会話全体で 1 つの連番であり、使い回さない。

## 回答のプロンプト

`Submit` を押すと、`Answers (grilling-pane):` という見出しで始まり、質問ごとに 1 行を持つプロンプトを 1 つ送る。

```
Answers (grilling-pane):
Q13 Is the loan cache per user, or one for the whole library? → Per user
Q14 Does an entry expire by time, or on write? → (skipped)
Q15 Which store holds the sessions? → (discuss) Only if it survives a restart
```

## skip と discuss の意味

Submit は、選択肢を選ばなかった質問に `(skipped)` を送る。
これは、人が答えないことを選んだという意味であり、人が見ていない質問とは区別される。
ラウンドのどの質問にも選択がないとき、Submit は何も送らない。そのとき status line は、まず 1 つ選ぶよう求める。

どの質問にも、pane が自分で描く最後の選択肢 `Talk about this one` がある。skill はこれを書かない。
これを選ぶと、その質問には `(discuss)` を送る。
一覧にない選択肢がほしいとき、または選ぶ前に質問について話したいときの印である。
その下の入力欄に書いた文字は、同じ行の `(discuss)` のあとに続く。
回答は 1 行なので、文字の中の改行は空白になる。

## transcript が唯一の正

pane が表示する質問は、すべて assistant のメッセージの中の文字である。
pane が送る回答は、すべて質問の文を繰り返すプロンプトである。
plugin をアンインストールした人でも、transcript だけですべての質問と回答を読める。

terminal では、pane は最新のラウンドだけを表示する。
新しいラウンドが届くと、前のラウンドの開いていた質問は、答えたかどうかにかかわらず pane から消える。
Desktop では、pane はすべての質問を残し、前のラウンドの開いていた質問は取り下げとして表示する。

## 開発

commit の前と CI で、3 つのゲートを実行する: `claude plugin validate plugin`、`npx -p typescript tsc -p plugin/hooks`、`CLAUDE_CODE_ENABLE_FUNCTION_HOOKS=1 claude plugin test plugin`。

## クレジット

質問の進め方は Matt Pocock の `grilling` skill（<https://github.com/mattpocock/skills>、MIT）による。
plugin 自身の skill `grilling-pane:grilling` は、質問の block の形式と pane を加え、進め方については upstream の skill を呼び出す。

## ライセンス

MIT。[LICENSE](LICENSE) を参照。
