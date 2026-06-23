import { describe, it, expect } from 'vitest'
import { makeStepTimer } from '@/server/jobs/step-timer'

describe('makeStepTimer', () => {
  it('records the elapsed time between laps, attributed to each name', () => {
    let t = 1000
    const timer = makeStepTimer(() => t)
    t = 1500
    timer.lap('a') // 500
    t = 1800
    timer.lap('b') // 300
    expect(timer.durationsMs).toEqual({ a: 500, b: 300 })
  })

  it('reset() rebases the mark so the next lap measures from reset', () => {
    let t = 0
    const timer = makeStepTimer(() => t)
    t = 100
    timer.lap('init') // 100
    t = 200
    timer.reset() // mark -> 200
    t = 350
    timer.lap('step') // 150 from the reset point
    expect(timer.durationsMs).toEqual({ init: 100, step: 150 })
  })

  it('accumulates when the same name laps more than once', () => {
    let t = 0
    const timer = makeStepTimer(() => t)
    t = 100
    timer.lap('x') // 100
    t = 250
    timer.lap('x') // +150
    expect(timer.durationsMs).toEqual({ x: 250 })
  })
})
