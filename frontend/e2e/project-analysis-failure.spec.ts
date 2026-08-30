import { expect, test } from '@playwright/test'

test('Workspace 분석 실패를 샘플 성공으로 대체하지 않는다', async ({ page }) => {
  await page.route('**/api/project/workspace/analyze', (route) => route.fulfill({
    status: 504,
    contentType: 'application/json',
    body: JSON.stringify({ message: 'Gateway Timeout' }),
  }))

  await page.goto('/')

  await expect(page.getByText('분석 실패', { exact: true }).first()).toBeVisible()
  await expect(page.getByRole('heading', { name: /분석하지 못했습니다/ })).toBeVisible()
  await expect(page.getByText('샘플 프로젝트로 자동 전환하지 않았습니다.')).toBeVisible()
  const workflow = page.getByRole('navigation', { name: 'StackFlow 작업 단계' })
  await expect(workflow).toHaveCount(1)
  await expect(page.getByRole('list', { name: '분석 증거 단계' })).toHaveCount(0)
  await expect(workflow.getByRole('button', { name: /프로젝트 구조.*분석 실패/ })).toHaveAttribute('aria-current', 'page')
  await expect(workflow.getByRole('button', { name: /API 요청.*분석 후 사용/ })).toBeDisabled()
  await expect(workflow.getByRole('button', { name: /Trace.*API 준비 필요/ })).toBeDisabled()
  await expect(page.getByRole('button', { name: '다시 분석' }).first()).toBeVisible()
  await expect(page.getByRole('button', { name: '데모 프로젝트 열기' })).toBeVisible()
  await expect(page.getByText('StackFlow 샘플', { exact: true })).toHaveCount(0)

  await page.setViewportSize({ width: 390, height: 844 })
  await expect.poll(() => page.evaluate(() =>
    document.documentElement.scrollWidth - document.documentElement.clientWidth,
  )).toBe(0)
})
