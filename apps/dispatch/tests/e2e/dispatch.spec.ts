import { join } from 'path'
import { expect, test, _electron, type ElectronApplication, type Page } from '@playwright/test'
import { expectWithSelfHeal } from '../helpers/selfHeal'

/* eslint-disable @typescript-eslint/no-explicit-any */

let app: ElectronApplication
let page: Page

test.beforeAll(async () => {
  // Launch the production build of the Electron app.
  const electronPath = require('electron') as unknown as string
  app = await _electron.launch({
    args: [join(__dirname, '..', '..', 'out', 'main', 'index.js')],
    executablePath: electronPath
  })
  page = await app.firstWindow()
  await page.waitForLoadState('domcontentloaded')
  // The store test-bridge must be exposed before any assertions run.
  await expect
    .poll(() => page.evaluate(() => Boolean((window as any).__fieldloop)))
    .toBe(true)
})

test.afterAll(async () => {
  await app.close()
})

async function storeEvaluate<T>(fn: string, ...args: unknown[]): Promise<T> {
  return page.evaluate(
    ({ fn, args }) => {
      const store = (window as any).__fieldloop
      return (store.getState() as any)[fn](...(args ?? []))
    },
    { fn, args }
  )
}

test.describe('Single-Active-State Enforcer + timer lifecycle', () => {
  test('fresh clock-on renders 00:00:00 and enforces exactly one pulsing timer per row', async () => {
    // Clock on Mike's morning job.
    await page.getByTestId('job-block-j-1002').click()
    await page.getByTestId('clock-on-btn').click()

    await expect(page.getByTestId('timer-j-1002')).toHaveText(/^00:00:0/)
    // Exactly one timer element in Mike's row.
    await expect(
      page.locator('[data-testid="tech-row-t-mike"] [data-testid^="timer-"]')
    ).toHaveCount(1)

    // Let the timer accrue a little elapsed time…
    await page.waitForTimeout(2100)

    // …then clock on Mike's afternoon job: enforcer must demote the sibling
    // and the new timer must restart from a fresh 00:00:0x.
    await page.getByTestId('job-block-j-1003').click()
    await page.getByTestId('clock-on-btn').click()

    await expect(page.getByTestId('timer-j-1003')).toHaveText(/^00:00:0/)
    await expect(page.getByTestId('job-block-j-1002')).toContainText('QUEUED')
    await expect(page.getByTestId('job-block-j-1002')).toHaveAttribute('data-status', 'scheduled')
    await expect(
      page.locator('[data-testid="tech-row-t-mike"] [data-testid^="timer-"]')
    ).toHaveCount(1)

    // Clock off freezes the row: no timers left, job marked DONE.
    await page.getByTestId('clock-off-btn').click()
    await expect(page.getByTestId('job-block-j-1003')).toHaveAttribute('data-status', 'complete')
    await expect(page.getByTestId('job-block-j-1003')).toContainText('DONE')
    await expect(
      page.locator('[data-testid="tech-row-t-mike"] [data-testid^="timer-"]')
    ).toHaveCount(0)
  })

  test('queue → technician assignment unlocks clock-on and drains the queue card', async () => {
    await page.getByTestId('queue-card-j-1001').click()
    await expect(page.getByTestId('clock-on-btn')).toBeDisabled()

    await page.getByTestId('tech-select').selectOption('t-dana')
    await expect(page.getByTestId('queue-card-j-1001')).toHaveCount(0)
    await expect(page.getByTestId('job-block-j-1001')).toBeVisible()

    await page.getByTestId('clock-on-btn').click()
    await expect(page.getByTestId('timer-j-1001')).toHaveText(/^00:00:0/)
    await page.getByTestId('clock-off-btn').click()
  })
})

test.describe('Quote state machine', () => {
  test('an empty quote cannot transition to SENT until client name and line items exist', async () => {
    await page.getByTestId('job-block-j-1005').click()

    // Invalid: no client, no line items.
    await expect(page.getByTestId('quote-validation')).toBeVisible()
    await expect(page.getByTestId('quote-status')).toHaveText('draft')

    await page.getByTestId('quote-mark-sent').click()
    await expect(page.getByText('Quote blocked from SENT')).toBeVisible()
    await expect(page.getByTestId('quote-status')).toHaveText('draft')

    // Repair the quote: client + one line item.
    await page.getByTestId('quote-client-input').fill('Vantage Build Ltd')
    await page.getByTestId('quote-add-item').click()
    await page.getByTestId('quote-mark-sent').click()

    await expect(page.getByTestId('quote-status')).toHaveText('sent')
    await expect(page.getByTestId('quote-validation')).toHaveCount(0)

    // SENT → APPROVED happy path.
    await page.getByTestId('quote-mark-approved').click()
    await expect(page.getByTestId('quote-status')).toHaveText('approved')
  })
})

test.describe('Document Vault expiry warnings', () => {
  test('permit within 30 days flags amber, expired certification flags red', async () => {
    await page.getByTestId('job-block-j-1004').click()
    await expect(page.getByTestId('doc-badge-d-1004-a')).toHaveText(/EXPIRES IN \d+D/)
    await expect(page.getByTestId('doc-badge-d-1004-b')).toHaveText(/45D LEFT/)

    await page.getByTestId('job-block-j-1006').click()
    await expect(page.getByTestId('doc-badge-d-1006-a')).toHaveText('EXPIRED')
  })
})

test.describe('Comms + command palette smoke', () => {
  test('channel switching updates the live feed', async () => {
    await page.getByTestId('channel-field-updates').click()
    await expect(page.getByTestId('channel-messages')).toContainText('Rough-in at Quarry Rd')
  })

  test('Ctrl+K palette navigates to a job', async () => {
    await page.keyboard.press('Control+K')
    await page.getByTestId('palette-input').fill('drainage')
    await page.getByRole('option', { name: /Emergency Drainage/ }).click()
    await expect(page.getByTestId('inspector-j-1001')).toBeVisible()
  })
})

test.describe('Programmatic self-healing', () => {
  test('detects a stuck timer, dispatches a store reset, and re-passes the assertion', async () => {
    await page.getByTestId('job-block-j-1004').click()
    await page.getByTestId('clock-on-btn').click()

    // Sabotage: force a corrupt stuck elapsed value straight into the store.
    await page.evaluate(() => {
      const store = (window as any).__fieldloop
      const state = store.getState()
      store.setState({
        jobs: state.jobs.map((j: any) =>
          j.id === 'j-1004' ? { ...j, elapsedSeconds: 9375, timerRunning: false } : j
        )
      })
    })

    // Fresh clock-on state must read 00:00:0x — the sabotaged state fails it,
    // the harness heals (reset + fresh clock-on), and the re-run passes.
    await expectWithSelfHeal(
      page,
      () => expect(page.getByTestId('inspector-timer-j-1004')).toHaveText(/^00:00:0/),
      async () => {
        await storeEvaluate('healTimer', 'j-1004')
        await storeEvaluate('clockOn', 'j-1004')
      }
    )
  })

  test('detects an invalid quote forced to SENT, resets it to DRAFT, and re-passes', async () => {
    await page.getByTestId('queue-card-j-1007').click()

    // Sabotage: an empty quote illegally holding SENT status.
    await page.evaluate(() => {
      const store = (window as any).__fieldloop
      const state = store.getState()
      store.setState({
        jobs: state.jobs.map((j: any) =>
          j.id === 'j-1007' ? { ...j, quote: { ...j.quote, status: 'sent' } } : j
        )
      })
    })

    // A quote without client name + line items must never display SENT.
    await expectWithSelfHeal(
      page,
      () => expect(page.getByTestId('quote-status')).toHaveText('draft'),
      async () => {
        await storeEvaluate('forceQuoteDraft', 'j-1007')
      }
    )
    await expect(page.getByTestId('quote-validation')).toBeVisible()
  })
})
