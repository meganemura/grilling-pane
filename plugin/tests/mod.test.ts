// Tests for the plugin's function-hooks module, run by `claude plugin test plugin` with
// `CLAUDE_CODE_ENABLE_FUNCTION_HOOKS=1`. Nothing here reaches a real transcript or model: the
// world stubs `session.messages`, `prompt.submit`, `ui.status` and the rest of what mod.ts calls
// through its `Host`, and every test drives the plugin the way the person does, through
// `$.command.run`, `$.ui.render` and `$.ui.press`.

import type { CommandRunInput, On, RenderInput, SessionMessage, TurnCompleteInput } from 'claude-code'
import { describe, expect, mock, test, tier } from 'claude-code/testing'

import { ANSWERS_HEADER } from '../hooks/block'
import { typedWhileOpenNoteOf } from '../hooks/mod'

tier('user')

const PLUGIN = 'grilling-pane'
const COMMAND = 'grilling-pane'
const STORE_KEY = 'wantsOpen'

const SESSION = { surface: 'terminal', isInteractive: true, cwd: '/work' } as const

const PANE: RenderInput<'Pane'> = {
  component: 'Pane',
  surface: 'terminal',
  requestId: PLUGIN,
  viewport: { columns: 120, rows: 40 },
  props: { title: PLUGIN, isFocused: false, bodyColumns: 80, placement: 'dock', scroll: { offset: 0, bodyRows: 30 }, view: {} },
}

const RUN: CommandRunInput = { command: COMMAND, args: '', origin: { kind: 'composer' }, presentation: { isFullscreen: false, columns: 120 } }

const TURN_COMPLETE: TurnCompleteInput = { answer: '', durationMs: 0, isAborted: false, turnId: 't1', reason: 'answer' }

// One assistant message with one question about a made-up library loan cache: a fixture, not a
// real project's plan.
const ONE_QUESTION: SessionMessage = {
  role: 'assistant',
  text: ['```grilling', 'Q1: cache is per user, or one for all?', '- per user (推奨: cheaper to invalidate)', '- one for all', '```'].join('\n'),
  toolUses: [],
}

// Two questions, one of them in Japanese, about a made-up weekly report delivery: fixture data
// for the tests that need more than one open question at once.
const TWO_QUESTIONS: SessionMessage = {
  role: 'assistant',
  text: ['```grilling', 'Q1: cache is per user, or one for all?', '- per user', '- one for all', 'Q2: 配信は週次か日次か?', '- 週次', '- 日次', '```'].join(
    '\n',
  ),
  toolUses: [],
}

// Two blocks in one message, sharing a number: one round (a later message would supersede an
// earlier one entirely, so a cross-round duplicate cannot happen).
const DUPLICATE_NUMBERS: SessionMessage = {
  role: 'assistant',
  text: ['```grilling', 'Q1: cache scope?', '- per user', '- shared', '```', '```grilling', 'Q1: report cadence?', '- weekly', '- daily', '```'].join('\n'),
  toolUses: [],
}

type WorldOptions = {
  messages?: SessionMessage[]
  store?: Record<string, unknown>
  submit?: (text: string) => { text: string } | { drop: string }
  // Leaves `prompt.submit` with nothing answering it, so `host.submit` rejects for real (the
  // engine's own "no implementation for prompt.submit") instead of a stub simulating a failure.
  noSubmit?: boolean
}

// The world beneath the module: a transcript (replaceable, for `turn.complete`), a store seeded
// before `session.start`, and a `prompt.submit` that echoes the text back unless a test asks for
// a drop.
function world(on: On, options: WorldOptions = {}) {
  const opened: string[] = []
  const openCalls: { id: string; focus?: true }[] = []
  const closed: string[] = []
  const logged: string[] = []
  const statuses: (string | undefined)[] = []
  const submittedTexts: string[] = []
  const submittedContexts: (readonly string[] | undefined)[] = []
  let messages: SessionMessage[] = options.messages ?? []

  on('session.start', ($, e) => ({ cwd: e.cwd }))
  on('turn.complete', ($, e) => ({ text: e.answer }))
  on('session.messages', () => ({ value: messages }))

  // A chain event, not a plain call: the terminal fake answers with the shape `prompt.submit`
  // itself resolves to (`{ text }` or `{ drop }`), never wrapped in `{ value }`. `e.context` is
  // recorded as it reaches the terminal, past every hook above it (mod.ts's own included), so a
  // test can check what a hook attached without the terminal itself needing to echo it back.
  if (!options.noSubmit) {
    on('prompt.submit', ($, e) => {
      submittedTexts.push(e.text)
      submittedContexts.push(e.context)
      return options.submit ? options.submit(e.text) : { text: e.text }
    })
  }

  on('command.register', ($, e) => ({ value: { command: e.name } }))
  on('ui.open', ($, e) => {
    opened.push(e.id)
    openCalls.push({ id: e.id, ...(e.focus ? { focus: e.focus } : {}) })
    return { value: undefined }
  })
  on('ui.close', ($, e) => {
    closed.push(e.id)
    return { value: undefined }
  })
  on('ui.invalidate', () => ({ value: undefined }))
  on('ui.log', ($, e) => {
    logged.push(e.text)
    return { value: undefined }
  })
  on('ui.status', ($, e) => {
    statuses.push(e.text)
    return { value: undefined }
  })

  const store = new Map<string, unknown>(Object.entries(options.store ?? {}))
  on('store.get', ($, e) => ({ value: store.get(e.key) }))
  on('store.set', ($, e) => {
    store.set(e.key, e.value)
    return { value: undefined }
  })

  return {
    opened,
    openCalls,
    closed,
    logged,
    statuses,
    submittedTexts,
    submittedContexts,
    store,
    setMessages: (next: SessionMessage[]) => {
      messages = next
    },
  }
}

// The strings a drawn tree carries: a Text's joined children, a Button's label.
function textOf(tree: unknown): string {
  if (Array.isArray(tree)) return tree.map(textOf).join('\n')
  if (typeof tree !== 'object' || tree === null) return ''
  const type: unknown = Reflect.get(tree, 'type')
  const props: unknown = Reflect.get(tree, 'props')
  const children: unknown = Reflect.get(tree, 'children')
  if (type === 'Text') {
    return (Array.isArray(children) ? children : []).filter((child): child is string => typeof child === 'string').join('')
  }
  if (type === 'Button') {
    const label = typeof props === 'object' && props ? Reflect.get(props, 'label') : undefined
    return typeof label === 'string' ? label : ''
  }
  return textOf(children)
}

// Every `Text` node in a drawn tree, each with its own text and the style it set (color, bold),
// absent where it set none.
function coloredLinesOf(tree: unknown): { text: string; color?: string; bold?: boolean }[] {
  if (Array.isArray(tree)) return tree.flatMap(coloredLinesOf)
  if (typeof tree !== 'object' || tree === null) return []
  const type: unknown = Reflect.get(tree, 'type')
  const children: unknown = Reflect.get(tree, 'children')
  if (type === 'Text') {
    const info = textInfoOf(tree)
    return info === undefined ? [] : [{ text: info.text, ...(info.color === undefined ? {} : { color: info.color }), ...(info.bold ? { bold: true } : {}) }]
  }
  return coloredLinesOf(children)
}

// Every Button in a drawn tree, keyed.
function buttonsOf(tree: unknown): { key: string; label: string }[] {
  if (Array.isArray(tree)) return tree.flatMap(buttonsOf)
  if (typeof tree !== 'object' || tree === null) return []
  const type: unknown = Reflect.get(tree, 'type')
  const props: unknown = Reflect.get(tree, 'props')
  const children: unknown = Reflect.get(tree, 'children')
  if (type === 'Button') {
    const key = typeof props === 'object' && props ? Reflect.get(props, 'key') : undefined
    const label = typeof props === 'object' && props ? Reflect.get(props, 'label') : undefined
    return [{ key: typeof key === 'string' ? key : '', label: typeof label === 'string' ? label : '' }]
  }
  return buttonsOf(children)
}

// The keyed Box drawn under `key` (a row, or the marker's or the Button's own wrapper inside
// one), or undefined: read here rather than searched for by content, since a Box carries no
// text of its own for `textOf` to find it by.
function boxByKey(tree: unknown, key: string): { props: Record<string, unknown>; children: unknown } | undefined {
  if (Array.isArray(tree)) {
    for (const child of tree) {
      const found = boxByKey(child, key)
      if (found !== undefined) return found
    }
    return undefined
  }
  if (typeof tree !== 'object' || tree === null) return undefined
  const type: unknown = Reflect.get(tree, 'type')
  const props: unknown = Reflect.get(tree, 'props')
  const children: unknown = Reflect.get(tree, 'children')
  if (type === 'Box' && typeof props === 'object' && props !== null && Reflect.get(props, 'key') === key) {
    return { props: props as Record<string, unknown>, children }
  }
  return boxByKey(children, key)
}

// One `Text` element's own text and style, read directly off a node (not searched for): used on
// a row Box's first child, the marker, since a marker carries no key of its own to search by.
function textInfoOf(node: unknown): { text: string; color?: string; bold?: boolean; dim?: boolean } | undefined {
  if (typeof node !== 'object' || node === null) return undefined
  const type: unknown = Reflect.get(node, 'type')
  if (type !== 'Text') return undefined
  const props: unknown = Reflect.get(node, 'props')
  const children: unknown = Reflect.get(node, 'children')
  const text = (Array.isArray(children) ? children : []).filter((child): child is string => typeof child === 'string').join('')
  const color = typeof props === 'object' && props ? Reflect.get(props, 'color') : undefined
  const bold = typeof props === 'object' && props ? Reflect.get(props, 'bold') : undefined
  const dim = typeof props === 'object' && props ? Reflect.get(props, 'dimColor') : undefined
  return { text, ...(typeof color === 'string' ? { color } : {}), ...(bold === true ? { bold: true } : {}), ...(dim === true ? { dim: true } : {}) }
}

// The marker `Text` drawn beside an option's (or the discuss option's) Button: inside its own
// fixed-width wrapper Box (`${rowKey}:marker`, `markerRowOf`'s own key), one level under the row.
function markerOf(tree: unknown, rowKey: string): { text: string; color?: string; bold?: boolean; dim?: boolean } | undefined {
  const wrapper = boxByKey(tree, `${rowKey}:marker`)
  const first = Array.isArray(wrapper?.children) ? wrapper.children[0] : undefined
  return textInfoOf(first)
}

// A Button's `onPress` is not awaited by `$.ui.press`; it settles after a few turns of the task
// queue. `setTimeout` is reached through the global object, as the module names no host globals
// of its own.
async function settle(): Promise<void> {
  const later = (globalThis as unknown as { setTimeout: (f: () => void, ms: number) => unknown }).setTimeout
  for (let i = 0; i < 8; i += 1) await new Promise<void>((resolve) => later(resolve, 0))
}

describe('mod', () => {
  test('/grilling-pane opens the pane, and a second run closes it; the store follows', async ($, on) => {
    const kept = world(on)
    await $.session.start(SESSION)

    const shown = await $.command.run(RUN)
    expect(shown.text).toBe('grilling-pane shown')
    expect(kept.opened).toEqual([PLUGIN])
    expect(kept.store.get(STORE_KEY)).toBe(true)

    const hidden = await $.command.run(RUN)
    expect(hidden.text).toBe('grilling-pane hidden')
    expect(kept.closed).toEqual([PLUGIN])
    expect(kept.store.get(STORE_KEY)).toBe(false)
  })

  test('wanting the pane open, with a question already in the transcript, opens it once at session.start', async ($, on) => {
    const kept = world(on, { store: { [STORE_KEY]: true }, messages: [ONE_QUESTION] })

    await $.session.start(SESSION)

    expect(kept.opened).toEqual([PLUGIN])
    const text = textOf(await $.ui.render(PANE))
    expect(text).toContain('Q1 cache is per user, or one for all?')
  })

  test('wanting the pane open, but no question yet, does not open an empty pane at session.start', async ($, on) => {
    const kept = world(on, { store: { [STORE_KEY]: true }, messages: [] })

    await $.session.start(SESSION)

    expect(kept.opened).toEqual([])
  })

  test('wanting the pane open, once a question appears through turn.complete, opens it without focus', async ($, on) => {
    const kept = world(on, { store: { [STORE_KEY]: true }, messages: [] })
    await $.session.start(SESSION)
    expect(kept.opened).toEqual([])

    kept.setMessages([ONE_QUESTION])
    await $.turn.complete(TURN_COMPLETE)
    await settle()

    expect(kept.opened).toEqual([PLUGIN])
    expect(kept.openCalls.at(-1)?.focus).toBeUndefined()
    expect(textOf(await $.ui.render(PANE))).toContain('Q1')
  })

  test('after the person hides the pane, a later question does not reopen it, but the status line names it', async ($, on) => {
    const kept = world(on, { messages: [] })
    await $.session.start(SESSION)
    await $.command.run(RUN) // shows it, wanting it open
    await $.command.run(RUN) // hides it, no longer wanting it open
    expect(kept.store.get(STORE_KEY)).toBe(false)

    kept.setMessages([ONE_QUESTION])
    await $.turn.complete(TURN_COMPLETE)
    await settle()

    expect(kept.opened).toEqual([PLUGIN])
    expect(kept.statuses.at(-1)).toContain('open questions')
  })

  test('with no open questions, the pane draws exactly one line saying so', async ($, on) => {
    world(on, { messages: [] })
    await $.session.start(SESSION)
    await $.command.run(RUN)

    expect(textOf(await $.ui.render(PANE))).toBe('no open questions')
  })

  test('picking one option and pressing Submit sends the expected text, and the answered questions leave the pane', async ($, on) => {
    const kept = world(on, { messages: [TWO_QUESTIONS] })
    await $.session.start(SESSION)
    await $.command.run(RUN)
    await $.ui.render(PANE)

    await $.ui.press({ plugin: PLUGIN, key: 'q0:o0:button' })
    await $.ui.press({ plugin: PLUGIN, key: 'submit:top:button' })
    await settle()

    expect(kept.submittedTexts.at(-1)).toBe(
      ['Answers (grilling-pane):', 'Q1 cache is per user, or one for all? → per user', 'Q2 配信は週次か日次か? → (skipped)'].join('\n'),
    )

    const text = textOf(await $.ui.render(PANE))
    expect(text).toBe('no open questions')
  })

  test('pressing Submit with nothing picked sends nothing and posts a status asking for a pick; picking one clears it', async ($, on) => {
    const kept = world(on, { messages: [TWO_QUESTIONS] })
    await $.session.start(SESSION)
    await $.command.run(RUN)
    await $.ui.render(PANE)

    await $.ui.press({ plugin: PLUGIN, key: 'submit:top:button' })
    await settle()

    expect(kept.submittedTexts).toEqual([])
    expect(kept.statuses.at(-1)).toBe('grilling-pane: pick at least one answer before Submit')

    await $.ui.press({ plugin: PLUGIN, key: 'q0:o0:button' })
    await settle()

    expect(kept.statuses.at(-1)).toBeUndefined()
  })

  test('pressing the same option twice deselects it', async ($, on) => {
    world(on, { messages: [ONE_QUESTION] })
    await $.session.start(SESSION)
    await $.command.run(RUN)
    await $.ui.render(PANE)

    await $.ui.press({ plugin: PLUGIN, key: 'q0:o0:button' })
    await settle()
    expect(markerOf(await $.ui.render(PANE), 'q0:o0:row')).toEqual({ text: '(*)', color: 'green', bold: true })

    await $.ui.press({ plugin: PLUGIN, key: 'q0:o0:button' })
    await settle()
    expect(markerOf(await $.ui.render(PANE), 'q0:o0:row')).toEqual({ text: '( )', dim: true })
  })

  test('the marker is green and bold when picked, and the question text is bold and near-white', async ($, on) => {
    world(on, { messages: [ONE_QUESTION] })
    await $.session.start(SESSION)
    await $.command.run(RUN)

    const before = await $.ui.render(PANE)
    expect(markerOf(before, 'q0:o0:row')).toEqual({ text: '( )', dim: true })
    expect(coloredLinesOf(before).find((line) => line.text === 'Q1 cache is per user, or one for all?')).toEqual({
      text: 'Q1 cache is per user, or one for all?',
      color: '#c8d8e8',
      bold: true,
    })

    await $.ui.press({ plugin: PLUGIN, key: 'q0:o0:button' })
    await settle()
    expect(markerOf(await $.ui.render(PANE), 'q0:o0:row')).toEqual({ text: '(*)', color: 'green', bold: true })
  })

  test('the marker sits in a fixed-width Box, so a long label cannot squeeze it and wrap it', async ($, on) => {
    world(on, { messages: [ONE_QUESTION] })
    await $.session.start(SESSION)
    await $.command.run(RUN)

    const wrapper = boxByKey(await $.ui.render(PANE), 'q0:o0:row:marker')
    expect(wrapper?.props.width).toBe(3)
    expect(wrapper?.props.flexShrink).toBe(0)
  })

  test('the discuss option is drawn last on every question, and picking it sends a "(discuss)" line', async ($, on) => {
    const kept = world(on, { messages: [TWO_QUESTIONS] })
    await $.session.start(SESSION)
    await $.command.run(RUN)

    const tree = await $.ui.render(PANE)
    const q1Buttons = buttonsOf(tree).filter((button) => button.key.startsWith('q0:'))
    const q2Buttons = buttonsOf(tree).filter((button) => button.key.startsWith('q1:'))
    expect(q1Buttons.at(-1)).toEqual({ key: 'q0:discuss:button', label: 'Talk about this one' })
    expect(q2Buttons.at(-1)).toEqual({ key: 'q1:discuss:button', label: 'Talk about this one' })
    expect(textOf(tree)).toContain('0 answered, 2 skipped')

    await $.ui.press({ plugin: PLUGIN, key: 'q0:discuss:button' })
    await settle()
    expect(markerOf(await $.ui.render(PANE), 'q0:discuss')).toEqual({ text: '(*)', color: 'green', bold: true })
    expect(textOf(await $.ui.render(PANE))).toContain('1 answered, 1 skipped')

    await $.ui.press({ plugin: PLUGIN, key: 'submit:top:button' })
    await settle()

    expect(kept.submittedTexts.at(-1)).toBe(
      ['Answers (grilling-pane):', 'Q1 cache is per user, or one for all? → (discuss)', 'Q2 配信は週次か日次か? → (skipped)'].join('\n'),
    )
  })

  test('two questions sharing a number both draw "duplicate number"', async ($, on) => {
    world(on, { messages: [DUPLICATE_NUMBERS] })
    await $.session.start(SESSION)
    await $.command.run(RUN)

    const text = textOf(await $.ui.render(PANE))
    expect((text.match(/duplicate number/g) ?? []).length).toBe(2)
  })

  test('turn.complete re-parses the transcript and draws a question that just appeared', async ($, on) => {
    const kept = world(on, { messages: [] })
    await $.session.start(SESSION)
    await $.command.run(RUN)
    expect(textOf(await $.ui.render(PANE))).toBe('no open questions')

    kept.setMessages([ONE_QUESTION])
    await $.turn.complete(TURN_COMPLETE)
    await settle()

    expect(textOf(await $.ui.render(PANE))).toContain('Q1')
  })

  test('an unopened pane with unanswered questions posts a status line naming them', async ($, on) => {
    const kept = world(on, { messages: [ONE_QUESTION] })
    await $.session.start(SESSION)

    expect(kept.statuses.at(-1)).toContain('open questions')
  })

  test('a rejected host.submit leaves every question and pick where it was, and logs one line', async ($, on) => {
    const kept = world(on, { messages: [ONE_QUESTION], noSubmit: true })
    await $.session.start(SESSION)
    await $.command.run(RUN)
    await $.ui.render(PANE)

    await $.ui.press({ plugin: PLUGIN, key: 'q0:o0:button' })
    await $.ui.press({ plugin: PLUGIN, key: 'submit:top:button' })
    await settle()

    const tree = await $.ui.render(PANE)
    expect(textOf(tree)).toContain('Q1')
    expect(markerOf(tree, 'q0:o0:row')).toEqual({ text: '(*)', color: 'green', bold: true })
    expect(kept.logged.some((line) => line.startsWith('grilling-pane: submit failed:'))).toBe(true)
  })

  test('a dropped prompt.submit leaves every question and pick where it was', async ($, on) => {
    const kept = world(on, { messages: [ONE_QUESTION], submit: () => ({ drop: 'refused' }) })
    await $.session.start(SESSION)
    await $.command.run(RUN)
    await $.ui.render(PANE)

    await $.ui.press({ plugin: PLUGIN, key: 'q0:o0:button' })
    await $.ui.press({ plugin: PLUGIN, key: 'submit:top:button' })
    await settle()

    expect(kept.submittedTexts).toHaveLength(1)
    const tree = await $.ui.render(PANE)
    expect(textOf(tree)).toContain('Q1')
    expect(markerOf(tree, 'q0:o0:row')).toEqual({ text: '(*)', color: 'green', bold: true })
  })

  test('a plain prompt gets the typed-while-open note appended, after any context it already had, while a round is open', async ($, on) => {
    const kept = world(on, { messages: [ONE_QUESTION] })
    await $.session.start(SESSION)
    await $.command.run(RUN)

    const result = await $.prompt.submit({ text: 'go with per user', origin: { kind: 'composer' }, wait: false, context: ['already there'] })

    expect(result.text).toBe('go with per user')
    expect(kept.submittedContexts.at(-1)).toEqual(['already there', typedWhileOpenNoteOf([1])])
  })

  test('a prompt that is itself the answer sheet does not get the note', async ($, on) => {
    const kept = world(on, { messages: [ONE_QUESTION] })
    await $.session.start(SESSION)
    await $.command.run(RUN)

    await $.prompt.submit({
      text: `${ANSWERS_HEADER}\nQ1 cache is per user, or one for all? → per user`,
      origin: { kind: 'composer' },
      wait: false,
    })

    expect(kept.submittedContexts.at(-1)).toBeUndefined()
  })

  test('a plain prompt when no question is open does not get the note', async ($, on) => {
    const kept = world(on, { messages: [] })
    await $.session.start(SESSION)
    await $.command.run(RUN)

    await $.prompt.submit({ text: 'hello', origin: { kind: 'composer' }, wait: false })

    expect(kept.submittedContexts.at(-1)).toBeUndefined()
  })

  test("the plugin's own submitted prompt does not get the note", async ($, on) => {
    const kept = world(on, { messages: [ONE_QUESTION] })
    await $.session.start(SESSION)
    await $.command.run(RUN)

    await $.prompt.submit({ text: 'anything', origin: { kind: 'plugin', name: 'grilling-pane' }, wait: false })

    expect(kept.submittedContexts.at(-1)).toBeUndefined()
  })
})
