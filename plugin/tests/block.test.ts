// Tests for the plain functions in hooks/block.ts: no `$`, no hooks, just the ```grilling block
// parser and the answer-line formatter.

import type { SessionMessage } from 'claude-code'
import { describe, expect, test, tier } from 'claude-code/testing'

import { ANSWERS_HEADER, SKIPPED, answersTextOf, identityOf, openQuestionsOf, questionsOf } from '../hooks/block'

tier('user')

function assistant(text: string): SessionMessage {
  return { role: 'assistant', text, toolUses: [] }
}

function user(text: string): SessionMessage {
  return { role: 'user', text, toolUses: [] }
}

describe('questionsOf', () => {
  test('parses a block of three numbered questions, one with a recommended option and its reason', () => {
    const text = [
      '```grilling',
      'Q13: cache is per user, or one for all?',
      '- per user (推奨: cheaper to invalidate)',
      '- one for all',
      'Q14: expiry is by time, or on write?',
      '- by time',
      '- on write',
      'Q15: 貸出期間は何日にする?',
      '- 7日',
      '- 14日',
      '```',
    ].join('\n')

    expect(questionsOf(text)).toEqual([
      {
        number: 13,
        text: 'cache is per user, or one for all?',
        options: [
          { label: 'per user', reason: 'cheaper to invalidate' },
          { label: 'one for all' },
        ],
      },
      {
        number: 14,
        text: 'expiry is by time, or on write?',
        options: [{ label: 'by time' }, { label: 'on write' }],
      },
      {
        number: 15,
        text: '貸出期間は何日にする?',
        options: [{ label: '7日' }, { label: '14日' }],
      },
    ])
  })

  test('ignores lines outside a block that look like questions or options', () => {
    const text = ['Q1: not a real question', '- not a real option', '', 'plain prose'].join('\n')

    expect(questionsOf(text)).toEqual([])
  })

  test('skips a broken line inside a block and keeps reading what follows', () => {
    const text = ['```grilling', 'Q1: how should retries work?', '- not this one because no dash prefix follows', '- backoff', '- fixed delay', '```'].join(
      '\n',
    )

    expect(questionsOf(text)).toEqual([
      {
        number: 1,
        text: 'how should retries work?',
        options: [{ label: 'not this one because no dash prefix follows' }, { label: 'backoff' }, { label: 'fixed delay' }],
      },
    ])
  })

  test('reads a half-width or full-width recommendation mark, with or without a reason', () => {
    const text = [
      '```grilling',
      'Q1: which delivery time?',
      '- morning (recommended: fewer bounces)',
      '- evening(推奨)',
      '- afternoon',
      '```',
    ].join('\n')

    expect(questionsOf(text)).toEqual([
      {
        number: 1,
        text: 'which delivery time?',
        options: [{ label: 'morning', reason: 'fewer bounces' }, { label: 'evening', reason: '' }, { label: 'afternoon' }],
      },
    ])
  })

  test('reads two blocks in one message', () => {
    const text = ['```grilling', 'Q1: first?', '- yes', '- no', '```', 'some prose in between', '```grilling', 'Q2: second?', '- a', '- b', '```'].join('\n')

    expect(questionsOf(text)).toEqual([
      { number: 1, text: 'first?', options: [{ label: 'yes' }, { label: 'no' }] },
      { number: 2, text: 'second?', options: [{ label: 'a' }, { label: 'b' }] },
    ])
  })
})

describe('answersTextOf', () => {
  test('formats a header, a picked option, a skipped one, with no recommendation mark in the label', () => {
    const questions = [
      { number: 13, text: 'cache is per user, or one for all?', options: [{ label: 'per user', reason: 'cheaper' }, { label: 'one for all' }] },
      { number: 14, text: 'expiry is by time, or on write?', options: [{ label: 'by time' }, { label: 'on write' }] },
    ]
    const picks = new Map([[identityOf(questions[0]!), 0]])

    expect(answersTextOf(questions, picks)).toBe(
      [ANSWERS_HEADER, 'Q13 cache is per user, or one for all? → per user', `Q14 expiry is by time, or on write? → ${SKIPPED}`].join('\n'),
    )
  })
})

describe('openQuestionsOf', () => {
  test('keeps only unanswered questions across two assistant messages; a skipped one also counts as answered', () => {
    const messages = [
      assistant(['```grilling', 'Q1: retry count?', '- 3', '- 5', 'Q2: timeout?', '- 30s', '- 60s', '```'].join('\n')),
      assistant(['```grilling', 'Q3: 配信は週次か日次か?', '- 週次', '- 日次', '```'].join('\n')),
      user([ANSWERS_HEADER, 'Q1 retry count? → 3', 'Q2 timeout? → (skipped)'].join('\n')),
    ]

    const open = openQuestionsOf(messages)

    expect(open.map((oq) => oq.question.number)).toEqual([3])
    expect(open[0]!.question.text).toBe('配信は週次か日次か?')
    expect(open[0]!.isDuplicate).toBe(false)
  })

  test('two questions sharing a number are both open and both marked duplicate; answering one leaves the other alone', () => {
    const messages: SessionMessage[] = [
      assistant(['```grilling', 'Q1: cache scope?', '- per user', '- shared', '```'].join('\n')),
      assistant(['```grilling', 'Q1: report cadence?', '- weekly', '- daily', '```'].join('\n')),
    ]

    const bothOpen = openQuestionsOf(messages)
    expect(bothOpen).toHaveLength(2)
    expect(bothOpen.every((oq) => oq.isDuplicate)).toBe(true)

    const answered = openQuestionsOf([...messages, user([ANSWERS_HEADER, 'Q1 cache scope? → per user'].join('\n'))])
    expect(answered).toHaveLength(1)
    expect(answered[0]!.question.text).toBe('report cadence?')
    expect(answered[0]!.isDuplicate).toBe(false)
  })

  test('an assistant message quoting the answers header does not count as an answer', () => {
    const messages: SessionMessage[] = [
      assistant(['```grilling', 'Q1: cache scope?', '- per user', '- shared', '```'].join('\n')),
      assistant([ANSWERS_HEADER, 'Q1 cache scope? → per user'].join('\n')),
    ]

    const open = openQuestionsOf(messages)

    expect(open).toHaveLength(1)
    expect(open[0]!.question.number).toBe(1)
  })
})
