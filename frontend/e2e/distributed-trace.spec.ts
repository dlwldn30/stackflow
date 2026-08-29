import { expect, test, type Page } from '@playwright/test'

const WORKSPACE_SUMMARY = '서비스 2개 · 도메인 2개 · API 7개'
const NORMAL_ENDPOINT = '/lab/orders/{orderId}'
const TIMEOUT_ENDPOINT = '/lab/orders/{orderId}/product-timeout'

test.describe.serial('분산 Trace 사용자 흐름', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/')
    await expect(page.getByText(WORKSPACE_SUMMARY, { exact: true })).toBeVisible()
    await selectOrderService(page)
  })

  test('Order에서 Product로 이어지는 정상 Trace의 서비스 경계를 표시한다', async ({ page }) => {
    await openEndpoint(page, NORMAL_ENDPOINT)

    await expect(page.getByLabel('대상 기본 URL')).toHaveValue('http://order-service:8092')
    await expect(page.getByLabel('Path variable 값')).toHaveValue('2001')
    await page.getByRole('button', { name: '요청 보내고 Trace 보기' }).click()

    const outcome = page.getByRole('region', { name: 'Trace 실행 결과' })
    await expect(outcome.getByText('정상 완료', { exact: true }).first()).toBeVisible({ timeout: 30_000 })
    await expectMetric(outcome, 'HTTP', '200')
    await expectMetric(outcome, '진입 서비스', 'order-service')
    await expect(outcome.getByText(/2개 · 경계 1회/)).toBeVisible()

    const history = page.getByRole('region', { name: '최근 Trace 탐색' })
    await expect(history).toBeVisible()
    await expect(history.locator('.trace-item.is-selected')).toHaveAccessibleName(/\/lab\/orders\/2001 · 성공/)

    const waterfall = page.getByRole('region', { name: 'Span 타임라인' })
    await expect(waterfall.getByText('서비스 경계', { exact: true })).toBeVisible()
    await expect(waterfall.getByText('order-service → product-service', { exact: true })).toBeVisible()

    await page.getByRole('tab', { name: '그래프' }).click()
    await expect(page.locator('.service-area').filter({ hasText: 'order-service' })).toBeVisible()
    await expect(page.locator('.service-area').filter({ hasText: 'product-service' })).toBeVisible()
    await expect(page.locator('.react-flow__edge-text').filter({ hasText: 'order-service → product-service' })).toBeVisible()

    await page.setViewportSize({ width: 390, height: 844 })
    await expect.poll(() => page.evaluate(() =>
      document.documentElement.scrollWidth - document.documentElement.clientWidth,
    )).toBe(0)
    const graphTop = await page.locator('.graph-panel').evaluate((element) => element.getBoundingClientRect().top + window.scrollY)
    const inspectorTop = await page.locator('.workspace--runtime .right-panel').evaluate((element) => element.getBoundingClientRect().top + window.scrollY)
    const historyTop = await page.getByRole('region', { name: '최근 Trace 탐색' }).evaluate((element) => element.getBoundingClientRect().top + window.scrollY)
    expect(graphTop).toBeLessThan(inspectorTop)
    expect(inspectorTop).toBeLessThan(historyTop)
  })

  test('Product PostgreSQL timeout의 원인과 Order까지의 오류 전파를 표시한다', async ({ page }) => {
    await openEndpoint(page, TIMEOUT_ENDPOINT)
    await page.getByRole('button', { name: '요청 보내고 Trace 보기' }).click()

    const outcome = page.getByRole('region', { name: 'Trace 실행 결과' })
    await expect(outcome.getByText('요청 실패', { exact: true }).first()).toBeVisible({ timeout: 30_000 })
    await expectMetric(outcome, 'HTTP', '504')

    const cause = outcome.locator('.trace-cause')
    await expect(cause.getByText('주요 실패 원인', { exact: true })).toBeVisible()
    const propagation = outcome.locator('[aria-label="오류 전파 경로"]')
    await expect(propagation).toContainText('product-service')
    await expect(propagation).toContainText('order-service')

    await cause.getByRole('button', { name: /상세 보기/ }).click()
    const inspector = page.locator('.trace-inspector')
    await expect(inspector).toContainText(/PostgreSQL|POSTGRESQL/)
    await expect(inspector.locator('.trace-inspector-error')).toBeVisible()

  })
})

async function selectOrderService(page: Page) {
  const orderService = page.getByRole('button', { name: /order-service.*API 2개/ })
  await expect(orderService).toBeVisible()
  await orderService.click()
}

async function openEndpoint(page: Page, endpoint: string) {
  const workflow = page.getByRole('navigation', { name: 'StackFlow 작업 단계' })
  await workflow.getByRole('button', { name: /API 요청/ }).click()

  const explorer = page.getByRole('region', { name: 'Endpoint 탐색' })
  const endpointButton = explorer.getByRole('button', {
    name: new RegExp(`^GET ${escapeRegExp(endpoint)} `),
  })
  await expect(endpointButton).toHaveCount(1)
  await endpointButton.click()
  await expect(page.getByText(endpoint, { exact: true }).first()).toBeVisible()
}

async function expectMetric(outcome: ReturnType<Page['getByRole']>, label: string, value: string) {
  const metric = outcome.locator('.trace-outcome__metrics > span').filter({ hasText: label })
  await expect(metric.getByText(value, { exact: true })).toBeVisible()
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}
