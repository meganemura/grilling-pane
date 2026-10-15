// Tests for the plain functions in hooks/block.ts: no `$`, no hooks, just the ```grilling block
// parser and the answer-line formatter.

import type { SessionMessage } from 'claude-code'
import { describe, expect, test, tier } from 'claude-code/testing'

import {
  ANSWERS_HEADER,
  DISCUSS,
  SKIPPED,
  answersTextOf,
  dropsOf,
  historyOf,
  identityOf,
  oneAnswerTextOf,
  openQuestionsOf,
  questionsOf,
} from '../hooks/block'

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

  test('writes "(discuss)" for a pick of `\'discuss\'`, the pane\'s own extra option', () => {
    const questions = [{ number: 1, text: 'cache is per user, or one for all?', options: [{ label: 'per user' }, { label: 'one for all' }] }]
    const picks = new Map<string, number | 'discuss'>([[identityOf(questions[0]!), 'discuss']])

    expect(answersTextOf(questions, picks)).toBe([ANSWERS_HEADER, `Q1 cache is per user, or one for all? → ${DISCUSS}`].join('\n'))
  })
})

describe('answersTextOf with comments', () => {
  const questions = [{ number: 1, text: 'cache is per user, or one for all?', options: [{ label: 'per user' }, { label: 'one for all' }] }]
  const identity = identityOf(questions[0]!)

  test('writes a discuss comment after "(discuss)" on the same line, folded onto one line', () => {
    const picks = new Map<string, number | 'discuss'>([[identity, 'discuss']])
    const comments = new Map([[identity, '  per branch\n\tof the library ']])

    expect(answersTextOf(questions, picks, comments)).toBe(
      [ANSWERS_HEADER, `Q1 cache is per user, or one for all? → ${DISCUSS} per branch of the library`].join('\n'),
    )
  })

  test('writes a plain "(discuss)" for a comment of only whitespace', () => {
    const picks = new Map<string, number | 'discuss'>([[identity, 'discuss']])

    expect(answersTextOf(questions, picks, new Map([[identity, ' \n ']]))).toBe(
      [ANSWERS_HEADER, `Q1 cache is per user, or one for all? → ${DISCUSS}`].join('\n'),
    )
  })

  test('ignores a comment on a question picked with an option, or skipped', () => {
    const comments = new Map([[identity, 'per branch']])

    expect(answersTextOf(questions, new Map([[identity, 1]]), comments)).toBe(
      [ANSWERS_HEADER, 'Q1 cache is per user, or one for all? → one for all'].join('\n'),
    )
    expect(answersTextOf(questions, new Map(), comments)).toBe([ANSWERS_HEADER, `Q1 cache is per user, or one for all? → ${SKIPPED}`].join('\n'))
  })

  test('an answer line with a comment still marks its question answered', () => {
    const answers = answersTextOf(questions, new Map([[identity, 'discuss']]), new Map([[identity, 'per branch']]))
    const messages = [assistant(['```grilling', 'Q1: cache is per user, or one for all?', '- per user', '- one for all', '```'].join('\n')), user(answers)]

    expect(openQuestionsOf(messages)).toEqual([])
  })
})

describe('openQuestionsOf', () => {
  test('within one round, an answered question drops and a skipped one also counts as answered', () => {
    const messages = [
      assistant(
        ['```grilling', 'Q1: retry count?', '- 3', '- 5', 'Q2: timeout?', '- 30s', '- 60s', 'Q3: 配信は週次か日次か?', '- 週次', '- 日次', '```'].join(
          '\n',
        ),
      ),
      user([ANSWERS_HEADER, 'Q1 retry count? → 3', 'Q2 timeout? → (skipped)'].join('\n')),
    ]

    const open = openQuestionsOf(messages)

    expect(open.map((oq) => oq.question.number)).toEqual([3])
    expect(open[0]!.question.text).toBe('配信は週次か日次か?')
    expect(open[0]!.isDuplicate).toBe(false)
  })

  test('two questions sharing a number in the same round are both open and both marked duplicate; answering one leaves the other alone', () => {
    const roundText = ['```grilling', 'Q1: cache scope?', '- per user', '- shared', '```', '```grilling', 'Q1: report cadence?', '- weekly', '- daily', '```']
      .join('\n')
    const messages: SessionMessage[] = [assistant(roundText)]

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

  test('a new round replaces the one before it: only the latest message with a block stays open', () => {
    const messages: SessionMessage[] = [
      assistant(['```grilling', 'Q1: cache scope?', '- per user', '- shared', '```'].join('\n')),
      assistant(['```grilling', 'Q2: report cadence?', '- weekly', '- daily', '```'].join('\n')),
    ]

    expect(openQuestionsOf(messages).map((oq) => oq.question.number)).toEqual([2])
  })

  test('answering the latest round leaves nothing open, even though the earlier round was never answered', () => {
    const messages: SessionMessage[] = [
      assistant(['```grilling', 'Q1: cache scope?', '- per user', '- shared', '```'].join('\n')),
      assistant(['```grilling', 'Q2: report cadence?', '- weekly', '- daily', '```'].join('\n')),
      user([ANSWERS_HEADER, 'Q2 report cadence? → weekly'].join('\n')),
    ]

    expect(openQuestionsOf(messages)).toEqual([])
  })

  test('an assistant message with no block, after a round, does not change what is open', () => {
    const messages: SessionMessage[] = [
      assistant(['```grilling', 'Q1: cache scope?', '- per user', '- shared', '```'].join('\n')),
      assistant('Thanks, I will factor that in.'),
    ]

    expect(openQuestionsOf(messages).map((oq) => oq.question.number)).toEqual([1])
  })

  test('two blocks in the same assistant message are one round', () => {
    const messages: SessionMessage[] = [
      assistant(
        [
          '```grilling',
          'Q1: cache scope?',
          '- per user',
          '- shared',
          '```',
          'some prose in between',
          '```grilling',
          'Q2: report cadence?',
          '- weekly',
          '- daily',
          '```',
        ].join('\n'),
      ),
    ]

    expect(openQuestionsOf(messages).map((oq) => oq.question.number)).toEqual([1, 2])
  })
})

describe('dropsOf', () => {
  test('reads each Drop line inside a block, with or without a reason, and nothing outside', () => {
    const text = ['Drop Q9: outside a block', '```grilling', 'Drop Q2: the cache is per user', 'Drop Q3', 'Q4: expiry?', '- by time', '- on write', '```'].join('\n')
    expect([...dropsOf(text)]).toEqual([
      [2, 'the cache is per user'],
      [3, ''],
    ])
    expect(questionsOf(text).map((question) => question.number)).toEqual([4])
  })

  test('a message with only Drop lines is a round, and closes the earlier one', () => {
    const messages: SessionMessage[] = [
      assistant(['```grilling', 'Q1: cache scope?', '- per user', '- shared', '```'].join('\n')),
      assistant(['```grilling', 'Drop Q1: not needed', '```'].join('\n')),
    ]
    expect(openQuestionsOf(messages)).toEqual([])
  })
})

describe('historyOf', () => {
  const round1 = assistant(['```grilling', 'Q1: cache scope?', '- per user', '- shared', 'Q2: report cadence?', '- weekly', '- daily', 'Q3: expiry?', '- by time', '- on write', '```'].join('\n'))
  const answer1 = user([ANSWERS_HEADER, 'Q1 cache scope? → per user', 'Still open (grilling-pane): Q2, Q3'].join('\n'))
  const round2 = assistant(['```grilling', 'Drop Q2: a per-user cache has no shared report', 'Q3: expiry?', '- by time', '- on write', 'Q4: store?', '- memory', '- Redis', '```'].join('\n'))

  test('keeps every question in number order, with an answered, an open, a dropped and a new one', () => {
    expect(historyOf([round1, answer1, round2]).map((entry) => [entry.question.number, entry.status, entry.answer ?? entry.reason])).toEqual([
      [1, 'answered', 'per user'],
      [2, 'dropped', 'a per-user cache has no shared report'],
      [3, 'open', undefined],
      [4, 'open', undefined],
    ])
  })

  test('a question the latest round does not ask again is dropped with no reason', () => {
    const round = assistant(['```grilling', 'Q4: store?', '- memory', '- Redis', '```'].join('\n'))
    expect(historyOf([round1, answer1, round]).map((entry) => [entry.question.number, entry.status, entry.reason])).toEqual([
      [1, 'answered', undefined],
      [2, 'dropped', undefined],
      [3, 'dropped', undefined],
      [4, 'open', undefined],
    ])
  })

  test('a question carried forward is one entry, and an answer in a later message closes it', () => {
    const answer2 = user([ANSWERS_HEADER, 'Q3 expiry? → on write'].join('\n'))
    const history = historyOf([round1, answer1, round2, answer2])
    expect(history.filter((entry) => entry.question.number === 3)).toEqual([
      { question: { number: 3, text: 'expiry?', options: [{ label: 'by time' }, { label: 'on write' }] }, status: 'answered', answer: 'on write', isDuplicate: false },
    ])
  })
})

describe('oneAnswerTextOf', () => {
  const q1 = { number: 1, text: 'cache scope?', options: [{ label: 'per user' }, { label: 'shared' }] }
  const q2 = { number: 2, text: 'report cadence?', options: [{ label: 'weekly' }, { label: 'daily' }] }

  test('sends one answer line and names the questions still open', () => {
    expect(oneAnswerTextOf(q1, 1, '', [q2])).toBe([ANSWERS_HEADER, 'Q1 cache scope? → shared', 'Still open (grilling-pane): Q2'].join('\n'))
  })

  test('the Still open line is not read as an answer', () => {
    const messages = [assistant(['```grilling', 'Q1: cache scope?', '- per user', '- shared', 'Q2: report cadence?', '- weekly', '- daily', '```'].join('\n')), user(oneAnswerTextOf(q1, 'discuss', 'per desk', [q2]))]
    expect(openQuestionsOf(messages).map((oq) => oq.question.number)).toEqual([2])
    expect(historyOf(messages)[0]?.answer).toBe(`${DISCUSS} per desk`)
  })
})
