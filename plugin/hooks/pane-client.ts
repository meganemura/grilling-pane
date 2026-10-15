// The desktop pane's surface module: a `Client` that draws the question history and sends one
// answer for each press. It runs on the drawing thread, with no `$`. It holds the person's own
// unsent work (the text in a comment field, which discuss fields are open, and the answers it
// posted that the props do not show yet) in its local state. The engine keeps that state while the
// `Client` stays in the tree under the same key. Thus a redraw from the hooks module (a new round,
// another answer) does not clear typed text and does not move the rows.
//
// Must NOT know about: the ```grilling block syntax, the answer prompt, or the transcript. The
// hooks module (mod.ts) gives every question as plain data in `PaneClientProps`, and reads back
// `PaneClientPost`. Only types come from 'claude-code'; nothing at run time.

import type { ClientModule, ClientSurface, RenderElement } from 'claude-code'

export type PaneClientOption = { label: string; reason?: string }

// One question as the hooks module gives it. `id` is the question's identity (number and text),
// `key` a short element key that stays the same for the question across redraws.
// - `open`: the person can answer it.
// - `sent`: the pane sent an answer, and the transcript does not show it yet.
// - `answered`: the transcript has its answer.
// - `dropped`: the model said it is not necessary now, or it did not ask it again.
export type PaneClientEntry = {
  id: string
  key: string
  number: number
  text: string
  options: PaneClientOption[]
  status: 'open' | 'sent' | 'answered' | 'dropped'
  answer?: string
  reason?: string
  isDuplicate: boolean
}

export type PaneClientProps = {
  entries: PaneClientEntry[]
  // A model turn is running, so a new round can come.
  isBusy: boolean
}

export type PaneClientAnswer = { id: string; pick: number | 'discuss'; comment: string }

// Every answer that the person pressed and the props do not show as sent yet. The hooks module
// ignores an id it already sent, so a repeat is safe. Each post carries all of them because the
// surface keeps only the last post of a frame.
export type PaneClientPost = { answers: PaneClientAnswer[] }

type Local = {
  drafts: Record<string, string>
  discussing: Record<string, true>
  outbox: Record<string, PaneClientAnswer>
}

// Nearer to white than `cyan`; the same colour the terminal pane uses for a question.
const QUESTION_COLOR = '#c8d8e8'

function localOf(surface: ClientSurface<Local>): Local {
  if (surface.state !== undefined) return surface.state
  const initial: Local = { drafts: {}, discussing: {}, outbox: {} }
  // One setState, on the first call only. Later calls change this same object in place and call
  // setState only when the person acts, so the engine does not see a render loop.
  surface.setState(initial)
  return initial
}

function send(surface: ClientSurface<Local>, local: Local, answer: PaneClientAnswer): void {
  local.outbox[answer.id] = answer
  delete local.discussing[answer.id]
  surface.post({ answers: Object.values(local.outbox) })
  surface.setState({ ...local })
}

function answerLabelOf(entry: PaneClientEntry, answer: PaneClientAnswer): string {
  if (answer.pick === 'discuss') {
    const comment = answer.comment.replace(/\s+/g, ' ').trim()
    return comment === '' ? '(discuss)' : `(discuss) ${comment}`
  }
  return entry.options[answer.pick]?.label ?? '(skipped)'
}

function headingOf(surface: ClientSurface<Local>, entry: PaneClientEntry, isActive: boolean): RenderElement {
  const { Text } = surface.elements
  const text = `Q${entry.number} ${entry.text}`
  if (isActive) return Text({ bold: true, color: QUESTION_COLOR, children: text })
  return Text({ dimColor: true, strikethrough: entry.status === 'dropped', children: text })
}

function optionsOf(surface: ClientSurface<Local>, local: Local, entry: PaneClientEntry): RenderElement {
  const { Box, Button, Input, Text } = surface.elements
  const rows: RenderElement[] = []
  entry.options.forEach((option, index) => {
    rows.push(
      Button({
        key: `${entry.key}:o${index}`,
        label: option.label,
        plain: true,
        onPress: () => send(surface, local, { id: entry.id, pick: index, comment: '' }),
      }),
    )
    if (option.reason !== undefined) {
      rows.push(
        Box({
          key: `${entry.key}:o${index}:reason`,
          paddingLeft: 2,
          children: [Text({ dimColor: true, children: option.reason === '' ? 'recommended' : `recommended: ${option.reason}` })],
        }),
      )
    }
  })
  const isDiscussing = local.discussing[entry.id] === true
  rows.push(
    Button({
      key: `${entry.key}:discuss`,
      label: 'Talk about this one',
      plain: true,
      dimColor: true,
      onPress: () => {
        if (isDiscussing) delete local.discussing[entry.id]
        else local.discussing[entry.id] = true
        surface.setState({ ...local })
      },
    }),
  )
  if (isDiscussing) {
    rows.push(
      Box({
        key: `${entry.key}:comment:box`,
        paddingLeft: 2,
        children: [
          Input({
            // One key for the life of the question: the field keeps what the person typed.
            key: `${entry.key}:comment`,
            placeholder: 'what you have in mind (optional)',
            value: local.drafts[entry.id] ?? '',
            submitLabel: 'send',
            autoFocus: true,
            // No setState here: the field already shows the text. The draft is kept for the next
            // redraw only, so typing does not cause a redraw.
            onInput: (value) => {
              local.drafts[entry.id] = value
            },
            onSubmit: (value) => {
              local.drafts[entry.id] = value
              send(surface, local, { id: entry.id, pick: 'discuss', comment: value })
            },
          }),
        ],
      }),
    )
  }
  return Box({ key: `${entry.key}:options`, flexDirection: 'column', paddingLeft: 2, children: rows })
}

// A dropped question keeps its place and its options, drawn as dim text with no Button, so the
// person sees what it was but cannot answer it.
function droppedOf(surface: ClientSurface<Local>, entry: PaneClientEntry): RenderElement {
  const { Box, Text } = surface.elements
  const rows: RenderElement[] = entry.options.map((option, index) =>
    Text({ dimColor: true, strikethrough: true, children: option.label }),
  )
  rows.push(
    Text({
      dimColor: true,
      italic: true,
      children: entry.reason === undefined ? 'not necessary now' : `not necessary now: ${entry.reason}`,
    }),
  )
  return Box({ key: `${entry.key}:options`, flexDirection: 'column', paddingLeft: 2, children: rows })
}

function entryOf(surface: ClientSurface<Local>, local: Local, entry: PaneClientEntry): RenderElement {
  const { Box, Text } = surface.elements
  const pending = local.outbox[entry.id]
  // The props catch up with a press: from then on they, not the outbox, say what was sent.
  if (pending !== undefined && entry.status !== 'open') delete local.outbox[entry.id]
  const isActive = entry.status === 'open' && pending === undefined

  const children: RenderElement[] = [headingOf(surface, entry, isActive)]
  if (entry.isDuplicate) children.push(Text({ color: 'yellow', children: 'duplicate number' }))
  if (isActive) {
    children.push(optionsOf(surface, local, entry))
  } else if (entry.status === 'dropped') {
    children.push(droppedOf(surface, entry))
  } else {
    const answer = pending !== undefined && entry.status === 'open' ? answerLabelOf(entry, pending) : (entry.answer ?? '')
    const isWaiting = entry.status !== 'answered'
    children.push(
      Box({
        key: `${entry.key}:answer`,
        paddingLeft: 2,
        children: [Text({ color: isWaiting ? undefined : 'green', dimColor: isWaiting, children: `→ ${answer}${isWaiting ? '  (sent)' : ''}` })],
      }),
    )
  }
  return Box({ key: entry.key, flexDirection: 'column', children })
}

const PaneClient: ClientModule<PaneClientProps, Local> = (props, surface) => {
  const { Box, Text } = surface.elements
  const local = localOf(surface)
  const entries = props.entries ?? []
  if (entries.length === 0) return Box({ key: 'empty', children: [Text({ dimColor: true, children: 'no open questions' })] })

  const children = entries.map((entry) => entryOf(surface, local, entry))
  // Always drawn, empty when idle, so the row under the last question does not come and go.
  const isWaiting = props.isBusy || Object.keys(local.outbox).length > 0
  children.push(
    Box({ key: 'status', children: [Text({ dimColor: true, italic: true, children: isWaiting ? 'Claude is writing the next questions…' : ' ' })] }),
  )
  return Box({ key: 'history', flexDirection: 'column', rowGap: 1, children })
}

export default PaneClient
