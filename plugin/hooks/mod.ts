// grilling-pane's one function-hooks module (the validator admits one per plugin). Reads the
// `Q<n>:` questions the model posts inside a ```grilling code block in the transcript, shows
// the unanswered ones from the latest such round in a pane beside it with a radio-style pick
// built from `Button` (see the note by `Ui` below for why not `Select`), and submits every pick
// — skipped where none was made — as one prompt that repeats each question's text, so the
// transcript itself is the record of what was asked and what was answered.
//
// Must NOT know about: what a question means or the plan the model is asking about (this file
// only ever holds question numbers, text and option labels as opaque strings); how a ```grilling
// block or an answer line is written — block.ts owns that syntax, and this file only calls its
// exported functions.
//
// It loads only where Claude Code has function hooks enabled. The engine's validator reads this
// file statically, so every call on `$` is spelled `$.noun.event(...)` and `$` is handed only to
// the function declaration at the top of the file (`hostOf`); the rest of the module holds a
// `Host`, a bundle of closures built once at `session.start`. The transcript is parsed on
// `session.start` and `turn.complete` only, kept in `state.open`; `ui.render` draws from that
// state alone and never reads the transcript itself.

import type { Elements, On, RenderElement, SessionMessage } from 'claude-code'
import { answersTextOf, identityOf, openQuestionsOf } from './block'
import type { OpenQuestion, Option } from './block'

const PANE_ID = 'grilling-pane'
const COMMAND = 'grilling-pane'
const STORE_KEY = 'wantsOpen'

type Host = {
  messages: () => Promise<readonly SessionMessage[]>
  submit: (text: string) => Promise<{ drop?: string }>
  status: (text: string | undefined) => void
  open: (focus: boolean) => Promise<void>
  close: () => Promise<void>
  invalidate: () => void
  log: (text: string) => void
  register: () => Promise<unknown>
  storeGet: (key: string) => Promise<unknown>
  storeSet: (key: string, value: unknown) => Promise<void>
}

type State = {
  host: Host | null
  isOpen: boolean
  wantsOpen: boolean
  open: OpenQuestion[]
  // A question's pick, by identity: an option's index, or `'discuss'` for the pane's own extra
  // option (see `discussBoxOf`) — never a value the model wrote.
  picks: Map<string, number | 'discuss'>
  submitted: Set<string>
  isSubmitting: boolean
}

// The host is a bundle of closures over `$`, built once at `session.start`, so the rest of this
// file never holds `$` itself — the validator's rule, and also the seam a test fakes.
function hostOf($: any): Host {
  return {
    messages: () => $.session.messages(),
    submit: (text) => $.prompt.submit({ text }),
    status: (text) => $.ui.status(text),
    open: (focus) => $.ui.open({ id: PANE_ID, title: PANE_ID, ...(focus ? { focus: true } : {}) }),
    close: () => $.ui.close({ id: PANE_ID }),
    invalidate: () => $.ui.invalidate('ui.render'),
    log: (text) => $.ui.log(text),
    register: () => $.command.register({ name: COMMAND, description: 'Show or hide the grilling-pane' }),
    storeGet: (key) => $.store.get(key),
    storeSet: (key, value) => $.store.set(key, value),
  }
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

// The questions still worth drawing: `state.open` less whatever a Submit press already sent.
// `submitted` survives a `reparse` on purpose (see `submit`'s own note) so it, not `state.open`,
// is the filter applied here.
function visibleOf(state: State): OpenQuestion[] {
  return state.open.filter((oq) => !state.submitted.has(identityOf(oq.question)))
}

function updateStatus(state: State): void {
  const host = state.host
  if (host === null) return
  const visible = visibleOf(state)
  host.status(state.isOpen || visible.length === 0 ? undefined : `grilling-pane: ${visible.length} open questions (/grilling-pane)`)
}

// `$.store` is the plugin's own file, kept across sessions and hot reloads and shared by every
// session in every directory — one flag in it cannot mean "the pane is open", or a pane left
// open in one session would reopen empty at the start of every later one. It means the person
// wants the pane; the pane itself opens only once there is a question worth showing it for.
// Used from `session.start` (by way of `reparse`, below) and from `reparse` itself on
// `turn.complete`, so a question that appears mid-session opens the pane the same way one
// already open at session start does.
async function openIfWanted(state: State): Promise<void> {
  const host = state.host
  if (host === null || !state.wantsOpen || state.isOpen || visibleOf(state).length === 0) return
  try {
    // Not focused: opening on its own, unasked, must not take the keyboard away from whatever
    // the person is about to type.
    await host.open(false)
    state.isOpen = true
  } catch (error) {
    host.log(`grilling-pane: reopen failed: ${messageOf(error)}`)
  }
}

// Re-reads the transcript into `state.open`, drops any pick whose question is no longer open
// (answered elsewhere, or gone from the transcript), and redraws. Wrapped whole in a try/catch:
// a hook is fail-open, so a parse failure must not vanish silently — it goes to `host.log` once
// instead.
async function reparse(state: State): Promise<void> {
  const host = state.host
  if (host === null) return
  try {
    state.open = openQuestionsOf(await host.messages())
    const openIdentities = new Set(state.open.map((oq) => identityOf(oq.question)))
    for (const identity of state.picks.keys()) {
      if (!openIdentities.has(identity)) state.picks.delete(identity)
    }
    host.invalidate()
    await openIfWanted(state)
    updateStatus(state)
  } catch (error) {
    host.log(`grilling-pane: reparse failed: ${messageOf(error)}`)
  }
}

// `isSubmitting` guards a press arriving while a previous submit is still in flight. Sending
// nothing when no question has a pick guards the other press pattern: focus already sitting on
// Submit, one Enter with every question left unanswered, spending a whole turn on an all-skip
// prompt nobody chose.
async function submit(state: State, host: Host): Promise<void> {
  if (state.isSubmitting) return
  const visible = visibleOf(state)
  if (!visible.some((oq) => state.picks.has(identityOf(oq.question)))) {
    host.status('grilling-pane: pick at least one answer before Submit')
    return
  }

  state.isSubmitting = true
  try {
    const questions = visible.map((oq) => oq.question)
    const result = await host.submit(answersTextOf(questions, state.picks))
    if (result.drop === undefined) {
      for (const question of questions) {
        const identity = identityOf(question)
        state.submitted.add(identity)
        state.picks.delete(identity)
      }
      host.status(undefined)
      host.invalidate()
    }
    // A `drop` leaves every pick and every question exactly where it was, so the person can
    // press Submit again without redoing anything.
  } finally {
    state.isSubmitting = false
  }
}

// The real element types, so the typecheck refuses a prop the engine would refuse.
//
// `Select` is not used: on the real terminal it draws as a closed dropdown (`none ▾`) whose
// options are invisible until it has focus, and the test kit has no way to pick from one
// (`$.ui.select` does not exist; `$.ui.press` refuses a Select's key). A radio built from
// `Button` is visible and pickable in both.
type Ui = Pick<Elements['terminal'], 'Box' | 'Button' | 'Text'>

// `(*)`/`( )` and not a Unicode radio glyph: some terminal fonts draw a symbol glyph two cells
// wide, which pushes the label after it out of line. ASCII draws one cell wide in every font.
// Green and bold picked, dim otherwise, so which option is picked reads before the label does.
function markerTextOf(ui: Ui, isSelected: boolean): RenderElement {
  const { Text } = ui
  return isSelected ? Text({ color: 'green', bold: true, children: '(*)' }) : Text({ dimColor: true, children: '( )' })
}

// A marker plus its Button, side by side, the marker's own column held to a fixed width: without
// it, a label longer than the row squeezed the marker down to fit and wrapped it onto two lines
// (measured on a real terminal: `(` then the wrapped label, `)` alone on the next line).
function markerRowOf(ui: Ui, key: string, marker: RenderElement, button: RenderElement): RenderElement {
  const { Box } = ui
  return Box({
    key,
    flexDirection: 'row',
    columnGap: 1,
    children: [
      Box({ key: `${key}:marker`, width: 3, flexShrink: 0, children: [marker] }),
      Box({ key: `${key}:label`, flexGrow: 1, flexShrink: 1, children: [button] }),
    ],
  })
}

function optionBoxOf(ui: Ui, questionKey: string, index: number, option: Option, identity: string, state: State, host: Host): RenderElement {
  const { Box, Button, Text } = ui
  const key = `${questionKey}:o${index}`
  const isSelected = state.picks.get(identity) === index
  const children: RenderElement[] = [
    markerRowOf(
      ui,
      `${key}:row`,
      markerTextOf(ui, isSelected),
      Button({
        key: `${key}:button`,
        label: option.label,
        plain: true,
        onPress: () => {
          if (isSelected) state.picks.delete(identity)
          else state.picks.set(identity, index)
          updateStatus(state)
          host.invalidate()
        },
      }),
    ),
  ]
  if (option.reason !== undefined) {
    children.push(
      Box({
        key: `${key}:reason`,
        paddingLeft: 4,
        children: [Text({ dimColor: true, children: option.reason === '' ? 'recommended' : `recommended: ${option.reason}` })],
      }),
    )
  }
  return Box({ key, flexDirection: 'column', children })
}

// The pane's own extra option, never one the model wrote: without it, the only way past an
// option list that misses what the person is actually thinking is to skip, and a model then
// tends to read a skip as agreement with whichever option it marked recommended. Drawn by the
// pane itself, on every question, last — uniform across every question, and not dependent on
// the model at all: the skill asks it for questions and options, never for this one.
function discussBoxOf(ui: Ui, questionKey: string, identity: string, state: State, host: Host): RenderElement {
  const { Button } = ui
  const key = `${questionKey}:discuss`
  const isSelected = state.picks.get(identity) === 'discuss'
  return markerRowOf(
    ui,
    key,
    markerTextOf(ui, isSelected),
    Button({
      key: `${key}:button`,
      label: 'Talk about this one',
      plain: true,
      dimColor: true,
      onPress: () => {
        if (isSelected) state.picks.delete(identity)
        else state.picks.set(identity, 'discuss')
        updateStatus(state)
        host.invalidate()
      },
    }),
  )
}

function questionBoxOf(ui: Ui, index: number, oq: OpenQuestion, state: State, host: Host): RenderElement {
  const { Box, Text } = ui
  const key = `q${index}`
  const { question, isDuplicate } = oq
  const identity = identityOf(question)
  const children: RenderElement[] = [Text({ bold: true, color: 'cyan', children: `Q${question.number} ${question.text}` })]
  if (isDuplicate) children.push(Text({ color: 'yellow', children: 'duplicate number' }))
  const optionBoxes = question.options.map((option, optionIndex) => optionBoxOf(ui, key, optionIndex, option, identity, state, host))
  optionBoxes.push(discussBoxOf(ui, key, identity, state, host))
  children.push(Box({ key: `${key}:options`, flexDirection: 'column', paddingLeft: 2, children: optionBoxes }))
  return Box({ key, flexDirection: 'column', children })
}

function submitRowOf(ui: Ui, key: string, answered: number, skipped: number, state: State, host: Host): RenderElement {
  const { Box, Button, Text } = ui
  return Box({
    key,
    flexDirection: 'row',
    columnGap: 1,
    children: [
      Button({
        key: `${key}:button`,
        label: 'Submit',
        onPress: () => {
          submit(state, host).catch((error: unknown) => host.log(`grilling-pane: submit failed: ${messageOf(error)}`))
        },
      }),
      Text({ dimColor: true, children: `${answered} answered, ${skipped} skipped` }),
    ],
  })
}

// Nothing here reads `state.host` beyond what the caller already resolved into `ui` and `host`:
// the render hook itself is the only place allowed to touch `$` (through `$.ui.resolve`), and
// this function draws from `state` alone, per the module's own rule against reading the
// transcript from `ui.render`.
function paneOf(ui: Ui, state: State, host: Host): RenderElement {
  const { Box, Text } = ui
  const visible = visibleOf(state)
  if (visible.length === 0) return Text({ children: 'no open questions' })

  const answered = visible.filter((oq) => state.picks.has(identityOf(oq.question))).length
  const skipped = visible.length - answered

  return Box({
    key: PANE_ID,
    flexDirection: 'column',
    rowGap: 1,
    children: [
      submitRowOf(ui, 'submit:top', answered, skipped, state, host),
      Box({
        key: 'questions',
        flexDirection: 'column',
        rowGap: 1,
        children: visible.map((oq, index) => questionBoxOf(ui, index, oq, state, host)),
      }),
      submitRowOf(ui, 'submit:bottom', answered, skipped, state, host),
    ],
  })
}

export function register(on: On) {
  const state: State = {
    host: null,
    isOpen: false,
    wantsOpen: false,
    open: [],
    picks: new Map(),
    submitted: new Set(),
    isSubmitting: false,
  }

  on('session.start', async ($, e, next) => {
    state.host = hostOf($)
    await state.host.register().catch((error: unknown) => {
      state.host?.log(`grilling-pane: /${COMMAND} is not available: ${messageOf(error)}`)
    })
    const stored = await state.host.storeGet(STORE_KEY).catch(() => undefined)
    state.wantsOpen = stored === true
    // `reparse` runs first, so whether to open (there is a question to answer) is decided from
    // this session's own transcript, not just the flag; `openIfWanted` inside it is what
    // actually opens the pane, without focus, when that is warranted.
    await reparse(state)
    return next(e)
  })

  on('turn.complete', ($, e, next) => {
    void reparse(state)
    return next(e)
  })

  on('command.run', { command: COMMAND }, async ($, e, next) => {
    const host = state.host
    if (host === null) return next(e)

    if (state.isOpen) {
      await host.close()
      state.isOpen = false
      state.wantsOpen = false
      await host.storeSet(STORE_KEY, false)
      return { text: 'grilling-pane hidden' }
    }

    // Opens even with zero questions: the person asked outright, unlike the automatic open in
    // `openIfWanted`, which only ever opens where there is something to answer.
    await host.open(true)
    state.isOpen = true
    state.wantsOpen = true
    await host.storeSet(STORE_KEY, true)
    await reparse(state)
    return { text: 'grilling-pane shown' }
  })

  on('ui.close', { id: PANE_ID }, async ($, e, next) => {
    const result = await next(e)
    const host = state.host
    if (result.deny === undefined && host !== null) {
      state.isOpen = false
      state.wantsOpen = false
      await host.storeSet(STORE_KEY, false)
      updateStatus(state)
    }
    return result
  })

  on('ui.render', { component: 'Pane' }, async ($, e, next) => {
    if (e.requestId !== PANE_ID || state.host === null) return next(e)
    if (e.surface !== 'terminal') return next(e)
    const { Box, Button, Text } = await $.ui.resolve(e)
    return paneOf({ Box, Button, Text }, state, state.host)
  })
}
