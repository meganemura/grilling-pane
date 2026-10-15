// Pure parsing and formatting for the ```grilling block and its answer lines. No `$`, no hooks,
// no Claude Code runtime beyond the `SessionMessage` type: mod.ts is the only caller, and every
// export here is a plain function over strings and the transcript's own messages.

import type { SessionMessage } from 'claude-code'

export type Option = { label: string; reason?: string }
export type Question = { number: number; text: string; options: Option[] }
export type OpenQuestion = { question: Question; isDuplicate: boolean }

export const ANSWERS_HEADER = 'Answers (grilling-pane):'
// The line under a one-answer prompt (see `oneAnswerTextOf`) that names the questions the person
// has not answered yet. It is not an answer line, so `answerLinesOf` stops at it.
export const STILL_OPEN_HEADER = 'Still open (grilling-pane):'
export const SKIPPED = '(skipped)'
export const DISCUSS = '(discuss)'

const OPEN_RE = /^```grilling[ \t]*$/
const CLOSE_RE = /^```[ \t]*$/
const QUESTION_RE = /^Q(\d+):\s*(.+)$/
const OPTION_RE = /^-\s+(.+)$/
const ANSWER_LINE_RE = /^Q\d+ /
// `Drop Q<n>: <reason>` inside a block: the model says that an earlier open question is not
// necessary now. The reason is optional.
const DROP_RE = /^Drop\s+Q(\d+)\s*:?\s*(.*)$/

// The recommendation mark at the end of an option line: an opening paren (half- or full-width),
// the word 推奨 or recommended (case-insensitive), an optional colon (half- or full-width), the
// reason, and a closing paren — anchored at the end of the line so a paren earlier in the label
// is left alone.
const RECOMMENDATION_RE = /[(（]\s*(?:推奨|recommended)\s*[:：]?\s*([^)）]*)[)）]\s*$/i

function optionOf(raw: string): Option {
  const content = raw.trim()
  const match = RECOMMENDATION_RE.exec(content)
  if (match === null) return { label: content }
  const label = content.slice(0, match.index).trimEnd()
  return { label, reason: (match[1] ?? '').trim() }
}

// Every question with one or more options, from every ```grilling block in `text` (a message may
// carry more than one). Anything outside a block, a line inside a block that matches neither the
// question nor the option pattern, and a question left with no options are all dropped rather
// than failing the whole parse: a model's draft can contain a stray line or an empty question.
export function questionsOf(text: string): Question[] {
  const questions: Question[] = []
  let inBlock = false
  let current: Question | null = null

  const flush = (): void => {
    if (current !== null && current.options.length > 0) questions.push(current)
    current = null
  }

  for (const line of text.split('\n')) {
    if (!inBlock) {
      if (OPEN_RE.test(line)) inBlock = true
      continue
    }
    if (CLOSE_RE.test(line)) {
      flush()
      inBlock = false
      continue
    }
    const questionMatch = QUESTION_RE.exec(line)
    if (questionMatch !== null) {
      flush()
      current = { number: Number(questionMatch[1] ?? ''), text: (questionMatch[2] ?? '').trim(), options: [] }
      continue
    }
    const optionMatch = OPTION_RE.exec(line)
    if (optionMatch !== null && current !== null) {
      current.options.push(optionOf(optionMatch[1] ?? ''))
    }
    // Anything else (blank lines, a broken option with nothing after the dash) is skipped; it
    // does not end the question in progress.
  }
  flush() // An unclosed block runs to the end of the text.

  return questions
}

export function identityOf(question: Question): string {
  return `${question.number}\n${question.text}`
}

// The `Answers (grilling-pane):` header and, under it, every `^Q\d+ ` line that follows it
// without a break — one user message can hold more than one such run if the header repeats.
function answerLinesOf(text: string): string[] {
  const lines = text.split('\n').map((line) => line.trim())
  const answers: string[] = []
  for (let i = 0; i < lines.length; i += 1) {
    if (lines[i] !== ANSWERS_HEADER) continue
    for (let j = i + 1; j < lines.length && ANSWER_LINE_RE.test(lines[j] ?? ''); j += 1) {
      answers.push(lines[j] ?? '')
    }
  }
  return answers
}

function answerPrefixOf(question: Question): string {
  return `Q${question.number} ${question.text} → `
}

// The latest round's questions that have no answer line (a skipped or discussed one counts as
// answered too), deduplicated by identity, first occurrence kept, in ascending number order with
// ties in the order they were first seen.
//
// A round is one assistant message with one or more ```grilling blocks. The latest round
// supersedes every round before it: a question the model still needs, it asks again under a new
// number in the new round, and the earlier round's own text stays in the transcript untouched —
// it is the pane, not the transcript, that stops showing it.
//
// Answer lines are read from every user message, not just those after the latest round: an
// assistant message may quote the header back (repeating the questions to explain itself), and
// that quoting must not count as an answer.
export function openQuestionsOf(messages: readonly SessionMessage[]): OpenQuestion[] {
  let allQuestions: Question[] = []
  const answerLines: string[] = []
  for (const message of messages) {
    if (message.role === 'assistant') {
      const questions = questionsOf(message.text)
      // A message with only Drop lines is a round too: it closes the questions it drops and asks
      // nothing new.
      if (questions.length > 0 || dropsOf(message.text).size > 0) allQuestions = questions
    } else {
      answerLines.push(...answerLinesOf(message.text))
    }
  }

  const isAnswered = (question: Question): boolean => {
    const prefix = answerPrefixOf(question)
    return answerLines.some((line) => line.startsWith(prefix))
  }

  const seen = new Set<string>()
  const unanswered: Question[] = []
  for (const question of allQuestions) {
    if (isAnswered(question)) continue
    const identity = identityOf(question)
    if (seen.has(identity)) continue
    seen.add(identity)
    unanswered.push(question)
  }

  const identitiesByNumber = new Map<number, Set<string>>()
  for (const question of unanswered) {
    const identities = identitiesByNumber.get(question.number) ?? new Set<string>()
    identities.add(identityOf(question))
    identitiesByNumber.set(question.number, identities)
  }

  return unanswered
    .map((question) => ({
      question,
      isDuplicate: (identitiesByNumber.get(question.number)?.size ?? 0) > 1,
    }))
    .sort((a, b) => a.question.number - b.question.number)
}

// A comment folded onto one line: an answer line ends at its newline (`answerLinesOf` reads one
// line per question), so a pasted line break would cut the comment and leave the rest outside
// the answer.
function commentLineOf(comment: string): string {
  return comment.replace(/\s+/g, ' ').trim()
}

// The prompt a Submit press sends: the header, then one `Q<n> <text> → <label>` line per
// question, in the order given, `picks` naming each question's chosen option by its identity, an
// option's index, `'discuss'` (the pane's own extra option, not one the model wrote), or missing
// or out of range for a skip. `comments` holds, by identity, what the person typed under a
// discuss pick; it rides after `(discuss)` on the same line, and a pick of an option or a skip
// ignores it.
export function answersTextOf(
  questions: readonly Question[],
  picks: ReadonlyMap<string, number | 'discuss'>,
  comments: ReadonlyMap<string, string> = new Map(),
): string {
  const lines = questions.map((question) => {
    const identity = identityOf(question)
    const pick = picks.get(identity)
    if (pick === 'discuss') {
      const comment = commentLineOf(comments.get(identity) ?? '')
      return `${answerPrefixOf(question)}${comment === '' ? DISCUSS : `${DISCUSS} ${comment}`}`
    }
    const label = pick === undefined ? SKIPPED : (question.options[pick]?.label ?? SKIPPED)
    return `${answerPrefixOf(question)}${label}`
  })
  return [ANSWERS_HEADER, ...lines].join('\n')
}

// Every `Drop Q<n>: <reason>` line from every ```grilling block in `text`, by number. A later line
// for the same number wins. `questionsOf` skips these lines, so a terminal pane ignores them.
export function dropsOf(text: string): Map<number, string> {
  const drops = new Map<number, string>()
  let inBlock = false
  for (const line of text.split('\n')) {
    if (!inBlock) {
      if (OPEN_RE.test(line)) inBlock = true
      continue
    }
    if (CLOSE_RE.test(line)) {
      inBlock = false
      continue
    }
    const match = DROP_RE.exec(line.trim())
    if (match !== null) drops.set(Number(match[1] ?? ''), (match[2] ?? '').trim())
  }
  return drops
}

// One question as the desktop pane shows it in its history:
// - `open`: in the latest round, with no answer line and no Drop line.
// - `answered`: a user message has its answer line. `answer` is the text after the arrow.
// - `dropped`: an earlier round asked it, it has no answer line, and the latest round does not
//   ask it again. `reason` is the text of the Drop line that names it, if one does.
export type HistoryEntry = {
  question: Question
  status: 'open' | 'answered' | 'dropped'
  answer?: string
  reason?: string
  isDuplicate: boolean
}

// Every question the transcript asked, one entry for each identity, in ascending number order
// with ties in the order first seen. Numbers only go up across a conversation, so a new round
// adds entries at the end and no earlier entry moves. The desktop pane draws this list, so the
// person sees what changed in place instead of a list that is built again.
export function historyOf(messages: readonly SessionMessage[]): HistoryEntry[] {
  const seen = new Map<string, Question>()
  const answerLines: string[] = []
  const dropReasons = new Map<number, string>()
  let latest = new Set<string>()
  let latestDrops = new Set<number>()
  for (const message of messages) {
    if (message.role === 'assistant') {
      const questions = questionsOf(message.text)
      const drops = dropsOf(message.text)
      for (const [number, reason] of drops) dropReasons.set(number, reason)
      if (questions.length === 0 && drops.size === 0) continue
      latest = new Set(questions.map(identityOf))
      latestDrops = new Set(drops.keys())
      for (const question of questions) {
        const identity = identityOf(question)
        if (!seen.has(identity)) seen.set(identity, question)
      }
    } else {
      answerLines.push(...answerLinesOf(message.text))
    }
  }

  const countByNumber = new Map<number, number>()
  for (const question of seen.values()) countByNumber.set(question.number, (countByNumber.get(question.number) ?? 0) + 1)

  const entries: HistoryEntry[] = []
  for (const [identity, question] of seen) {
    const prefix = answerPrefixOf(question)
    const line = answerLines.find((candidate) => candidate.startsWith(prefix))
    const isDuplicate = (countByNumber.get(question.number) ?? 0) > 1
    if (line !== undefined) {
      entries.push({ question, status: 'answered', answer: line.slice(prefix.length), isDuplicate })
    } else if (latest.has(identity) && !latestDrops.has(question.number)) {
      entries.push({ question, status: 'open', isDuplicate })
    } else {
      const reason = dropReasons.get(question.number)
      entries.push({ question, status: 'dropped', ...(reason !== undefined && reason !== '' ? { reason } : {}), isDuplicate })
    }
  }
  // A stable sort keeps the first-seen order between questions that share a number.
  return entries.sort((a, b) => a.question.number - b.question.number)
}

// The prompt one press on the desktop sends: the header, the one answer line, and a line that
// names the questions still open, so the model keeps them open and does not read them as skipped.
export function oneAnswerTextOf(question: Question, pick: number | 'discuss', comment: string, stillOpen: readonly Question[]): string {
  const picks = new Map<string, number | 'discuss'>([[identityOf(question), pick]])
  const comments = new Map<string, string>([[identityOf(question), comment]])
  const text = answersTextOf([question], picks, comments)
  if (stillOpen.length === 0) return text
  return `${text}\n${STILL_OPEN_HEADER} ${stillOpen.map((open) => `Q${open.number}`).join(', ')}`
}
