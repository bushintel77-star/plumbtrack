import { chromium } from "@playwright/test"

const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 1720, height: 1000 } })
await page.goto("http://localhost:3900/?module=dispatch")
await page.getByTestId("demo-badge").waitFor({ timeout: 20_000 })
await page.getByTestId("matrix-view").waitFor({ timeout: 20_000 })
await page.waitForTimeout(900)

// Dark chassis default — the board with frosted queue rail + canvas
await page.screenshot({ path: "shots-premium/dark-board.png" })

// Slack drawer over the canvas — frosted glass shows content beneath
await page.getByTestId("comms-trigger").click()
await page.getByTestId("comms-panel").waitFor()
await page.waitForTimeout(400)
await page.screenshot({ path: "shots-premium/dark-slack.png" })
await page.getByTestId("comms-close").click()

// Route optimizer drawer + suggestion strip
await page.getByTestId("queue-card-j-1001").click()
await page.getByTestId("details-close").click()
await page.waitForTimeout(300)
await page.getByTestId("optimizer-trigger").click()
await page.getByTestId("opt-run").click()
await page.getByTestId("opt-results").waitFor()
await page.waitForTimeout(300)
await page.screenshot({ path: "shots-premium/dark-optimizer.png" })

// Light colourway still intact one toggle away
await page.getByTestId("route-optimizer-close").click()
await page.getByTestId("theme-toggle").click()
await page.waitForTimeout(400)
await page.screenshot({ path: "shots-premium/light-board.png" })

await browser.close()
console.log("done")
