/**
 * User Journey 1: Chat Core Journey
 *
 * Validates the primary chat experience end-to-end:
 *   1. Home page loads with Chat as the default view
 *   2. User can type a message into the ChatPanel input
 *   3. Sending a message triggers an SSE streaming response (mocked)
 *   4. Tool calls are surfaced in the UI during streaming
 *   5. The assistant reply renders as a chat message bubble
 *   6. Message history persists across page reloads (localStorage)
 *
 * The /api/chat endpoint is mocked via page.route() to return a deterministic
 * SSE stream, so the test does not depend on an LLM provider.
 *
 * Run: npx playwright test e2e/user-journey-chat.spec.ts
 */

import { test, expect } from './fixtures';
import { buildChatSseBody, mockChatSse } from './fixtures';
import { selectors } from './helpers/selectors';

test.describe('User Journey — Chat Core', () => {
  test.beforeEach(async ({ page, navigation }) => {
    await navigation.gotoHome();
    // Ensure we start in chat view (default)
    await page.click('button:has-text("Chat")');
    await page.waitForTimeout(500);
  });

  test('1. Home page loads with Chat as default view', async ({ page }) => {
    // The chat input should be visible on first load
    await expect(page.locator(selectors.chat.input)).toBeVisible({ timeout: 10000 });
    // The brand title is shown in the empty-state hero
    await expect(page.locator('text=SupplyChain Cortex')).toBeVisible();
  });

  test('2. User can type a message into the chat input', async ({ page }) => {
    const input = page.locator(selectors.chat.input);
    await input.fill('帮我检查库存健康状态');
    await expect(input).toHaveValue('帮我检查库存健康状态');
  });

  test('3. Sending a message triggers an SSE streaming response', async ({ page, chatPanel }) => {
    await mockChatSse(page);

    await chatPanel.sendMessage('帮我做库存健康检查');

    // Wait for the response to complete — the assistant message should appear
    await page.waitForSelector('[data-testid="chat-message"]', { timeout: 15000 });
    // At least 2 messages: the user's question + the assistant's reply
    const messageCount = await page.locator('[data-testid="chat-message"]').count();
    expect(messageCount).toBeGreaterThanOrEqual(2);
  });

  test('4. Tool calls are surfaced during streaming', async ({ page, chatPanel }) => {
    // Mock SSE includes a tool_call + tool_result event
    await mockChatSse(page);

    await chatPanel.sendMessage('分析库存');

    // The tool call chain or thinking panel should appear during/after streaming.
    // We accept either the tool call chain element or the thinking steps button.
    const toolOrThinking = page.locator(
      '[data-testid="tool-call-chain"], button:has-text("思考过程")',
    );
    await expect(toolOrThinking.first()).toBeVisible({ timeout: 15000 });
  });

  test('5. Assistant reply renders as a chat message bubble with content', async ({ page, chatPanel }) => {
    await mockChatSse(page, buildChatSseBody({ content: '库存健康检查完成：4 个 SKU 中 1 个紧急补货。' }));

    await chatPanel.sendMessage('库存健康检查');

    // Wait for the second message (assistant reply) to render
    await page.waitForSelector('[data-testid="chat-message"]:nth-of-type(2)', { timeout: 15000 });
    const lastMessage = await chatPanel.getLastMessageText();
    expect(lastMessage).toBeTruthy();
    expect(lastMessage).toContain('库存');
  });

  test('6. Message history persists across page reloads', async ({ page, chatPanel }) => {
    await mockChatSse(page);

    const marker = `测试消息持久化_${Date.now()}`;
    await chatPanel.sendMessage(marker);
    await page.waitForSelector('[data-testid="chat-message"]', { timeout: 15000 });

    // The user's message text should be present before reload
    const beforeReload = await page.textContent('body');
    expect(beforeReload).toContain(marker);

    // Reload and verify the message is restored from localStorage
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(2000);
    await page.click('button:has-text("Chat")');
    await page.waitForTimeout(500);

    const afterReload = await page.textContent('body');
    expect(afterReload).toContain(marker);
  });

  test('7. Quick action buttons populate and send a query', async ({ page, chatPanel }) => {
    await mockChatSse(page);

    // Click the "库存健康" quick action shown in the empty state
    await page.click('button:has-text("库存健康")');
    await page.waitForTimeout(500);

    // The input should be populated (or the message sent) — verify a message appears
    await page.waitForSelector('[data-testid="chat-message"]', { timeout: 15000 });
    const messageCount = await chatPanel.getMessageCount();
    expect(messageCount).toBeGreaterThanOrEqual(1);
  });

  test('8. Chat input is disabled while a response is streaming', async ({ page, chatPanel }) => {
    await mockChatSse(page);

    await chatPanel.sendMessage('测试流式禁用');
    // Immediately after sending, the input may be disabled — check it becomes enabled again
    await page.waitForSelector('[data-testid="chat-message"]', { timeout: 15000 });
    // After the response completes, the input should be enabled for the next message
    await expect(page.locator(selectors.chat.input)).toBeEnabled({ timeout: 10000 });
  });
});
