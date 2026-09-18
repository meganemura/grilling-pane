// Pure parsing and formatting for the ```grilling block and its answer lines. No `$`, no hooks,
// no Claude Code runtime beyond the `SessionMessage` type: mod.ts is the only caller, and every
// export here is a plain function over strings and the transcript's own messages.

import type { SessionMessage } from 'claude-code'

export type Option = { label: string; reason?: string }
export type Question = { number: number; text: string; options: Option[] }
export type OpenQuestion = { question: Question; isDuplicate: boolean }

export const ANSWERS_HEADER = 'Answers (grilling-pane):'
export const SKIPPED = '(skipped)'
export const DISCUSS = '(discuss)'

const OPEN_RE = /^```grilling[ \t]*$/
const CLOSE_RE = /^```[ \t]*$/
const QUESTION_RE = /^Q(\d+):\s*(.+)$/
const OPTION_RE = /^-\s+(.+)$/
const ANSWER_LINE_RE = /^Q\d+ /

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

// Every question from every assistant message's ```grilling blocks that has no answer line
// (a skipped one counts as answered too), deduplicated by identity, first occurrence kept, in
// ascending number order with ties in the order they were first seen.
//
// Answer lines are read only from user messages: an assistant message may quote the header back
// (repeating the questions to explain itself), and that quoting must not count as an answer.
export function openQuestionsOf(messages: readonly SessionMessage[]): OpenQuestion[] {
  const allQuestions: Question[] = []
  const answerLines: string[] = []
  for (const message of messages) {
    if (message.role === 'assistant') allQuestions.push(...questionsOf(message.text))
    else answerLines.push(...answerLinesOf(message.text))
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

// The prompt a Submit press sends: the header, then one `Q<n> <text> → <label>` line per
// question, in the order given, `picks` naming each question's chosen option by its identity, an
// option's index, `'discuss'` (the pane's own extra option, not one the model wrote), or missing
// or out of range for a skip.
export function answersTextOf(questions: readonly Question[], picks: ReadonlyMap<string, number | 'discuss'>): string {
  const lines = questions.map((question) => {
    const pick = picks.get(identityOf(question))
    const label = pick === 'discuss' ? DISCUSS : pick === undefined ? SKIPPED : (question.options[pick]?.label ?? SKIPPED)
    return `${answerPrefixOf(question)}${label}`
  })
  return [ANSWERS_HEADER, ...lines].join('\n')
}
