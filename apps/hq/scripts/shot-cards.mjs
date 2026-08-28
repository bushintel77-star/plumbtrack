import { chromium } from "@playwright/test"

const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 1720, height: 1000 } })
await page.goto("http://localhost:3900/?module=dispatch")
await page.getByTestId("demo-badge").waitFor({ timeout: 20_000 })
await page.getByTestId("matrix-view").waitFor({ timeout: 20_000 })
await page.waitForTimeout(800)

// 1. Slack bridge: cards, accept, en-route ETA, on-site channel — BEFORE any
//    assignment changes the card lifecycle.
await page.getByTestId("comms-trigger").click()
await page.getByTestId("comms-panel").waitFor()
await page.getByTestId("slack-accept-j-1008").click()
await page.waitForTimeout(400)
await page.getByTestId("comms-input").fill("/dispatch-status j-1008 en_route")
await page.getByTestId("comms-input").press("Enter")
await page.getByTestId("comms-input").fill("/dispatch-status j-1008 active")
await page.getByTestId("comms-input").press("Enter")
await page.waitForTimeout(400)
await page.screenshot({ path: "shots/slack-bridge.png" })
await page.getByTestId("comms-tab-messages").click()
await page.waitForTimeout(300)
await page.screenshot({ path: "shots/slack-channels.png" })
await page.getByTestId("comms-close").click()

// 2. Suggestion strip with drive-time chips
await page.getByTestId("queue-card-j-1001").click()
await page.getByTestId("details-close").click()
await page.waitForTimeout(400)
await page.screenshot({ path: "shots/suggestion-strip.png" })

// 3. Availability panel with a selected task
await page.getByTestId("availability-trigger").click()
await page.getByTestId("availability-panel").waitFor()
await page.waitForTimeout(300)
await page.screenshot({ path: "shots/availability-panel.png" })
await page.keyboard.press("Escape")
await page.waitForTimeout(300)

// 4. Route Optimizer configured + results, then applied canvas
await page.getByTestId("optimizer-trigger").click()
await page.getByTestId("opt-run").click()
await page.getByTestId("opt-results").waitFor()
await page.waitForTimeout(300)
await page.screenshot({ path: "shots/route-optimizer.png" })
await page.getByTestId("opt-apply").click()
await page.waitForTimeout(600)
await page.screenshot({ path: "shots/optimizer-applied.png" })

await browser.close()
console.log("done")
