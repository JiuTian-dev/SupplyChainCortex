import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ChatPanel } from './ChatPanel';

// ─── Mock ChatPanel.helpers ────────────────────────────────────────────────────
vi.mock('./ChatPanel.helpers', () => ({
  loadMessages: vi.fn(() => []),
  saveMessages: vi.fn(),
  clearStoredMessages: vi.fn(),
  renderMarkdown: vi.fn((content: string) => <span>{content}</span>),
  CopyButton: ({ text }: { text: string }) => <button data-testid="copy-btn" data-text={text}>复制</button>,
  TypingIndicator: () => <div data-testid="typing-indicator">思考中</div>,
  fetchOllamaModels: vi.fn(),
  fmtBytes: vi.fn((b: number) => `${b} B`),
  STORAGE_KEY: 'supply-chain-chat-history',
}));

// ─── Mock ClaimLabel ───────────────────────────────────────────────────────────
vi.mock('./ClaimLabel', () => ({
  ClaimLabel: ({ claim }: { claim: { id: string; text: string } }) => (
    <span data-testid={`claim-${claim.id}`}>{claim.text}</span>
  ),
  parseClaimsFromText: vi.fn(() => []),
}));

// ─── Mock ActionCard ───────────────────────────────────────────────────────────
vi.mock('./ActionCard', () => ({
  ActionCard: ({ card }: { card: { id: string } }) => <div data-testid={`action-${card.id}`}>Action</div>,
}));

// ─── Mock SettingsSheet ────────────────────────────────────────────────────────
vi.mock('@/components/shared/SettingsSheet', () => ({
  SettingsSheet: ({ open }: { open: boolean }) =>
    open ? <div data-testid="settings-sheet">Settings</div> : null,
}));

// ─── Mock fetch for SSE streaming ──────────────────────────────────────────────
const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

// Helper: build a ReadableStream from an array of string chunks
function makeReadableStream(chunks: string[]): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  return new ReadableStream({
    start(controller) {
      chunks.forEach(c => controller.enqueue(encoder.encode(c)));
      controller.close();
    },
  });
}

// Helper: build SSE chunks for a streaming assistant response
function buildSSEChunks(events: Array<Record<string, unknown>>): string[] {
  return events.map(e => `data: ${JSON.stringify(e)}\n\n`);
}

// Helper: find the send button (the one with Send icon, last button in input row)
function getSendButton(): HTMLButtonElement | null {
  const input = screen.getByTestId('chat-input');
  // The send button is a sibling of the input's parent div, in the same flex container
  const flexContainer = input.closest('.flex.items-center.gap-2');
  if (!flexContainer) return null;
  const buttons = flexContainer.querySelectorAll('button');
  return buttons[buttons.length - 1] as HTMLButtonElement;
}

describe('ChatPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFetch.mockReset();
    // Default: any fetch returns empty OK response
    mockFetch.mockResolvedValue({
      ok: true,
      body: makeReadableStream([]),
      json: async () => ({}),
    } as unknown as Response);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('renders empty state with welcome message and quick actions', async () => {
    render(<ChatPanel />);

    expect(screen.getByText('SupplyChain Cortex')).toBeInTheDocument();
    expect(screen.getByText(/智能供应链决策助手/)).toBeInTheDocument();
    // Quick action buttons visible in empty state
    expect(screen.getByText('库存健康')).toBeInTheDocument();
    expect(screen.getByText('成本分析')).toBeInTheDocument();
    expect(screen.getByText('供应商评估')).toBeInTheDocument();
    expect(screen.getByText('合规审计')).toBeInTheDocument();
    expect(screen.getByText('全健康报告')).toBeInTheDocument();
  });

  it('renders input box with placeholder', () => {
    render(<ChatPanel />);
    const input = screen.getByTestId('chat-input');
    expect(input).toBeInTheDocument();
    expect(input).toHaveAttribute('placeholder', expect.stringContaining('输入问题'));
  });

  it('disables send button when input is empty', () => {
    render(<ChatPanel />);
    const sendButton = getSendButton();
    expect(sendButton).not.toBeNull();
    expect(sendButton!).toBeDisabled();
  });

  it('enables send button after typing text', async () => {
    const user = userEvent.setup();
    render(<ChatPanel />);
    const input = screen.getByTestId('chat-input') as HTMLInputElement;
    const sendButton = getSendButton();

    await user.type(input, '库存情况如何');
    expect(input).toHaveValue('库存情况如何');
    expect(sendButton).not.toBeNull();
    expect(sendButton!).not.toBeDisabled();
  });

  it('sends message on Enter key press (without shift)', async () => {
    const user = userEvent.setup();
    render(<ChatPanel />);
    const input = screen.getByTestId('chat-input') as HTMLInputElement;

    await user.type(input, '你好');
    await user.keyboard('{Enter}');

    // User message should be rendered
    expect(await screen.findByText('你好', {}, { timeout: 3000 })).toBeInTheDocument();

    // fetch should be called with /api/chat
    expect(mockFetch).toHaveBeenCalledWith(
      '/api/chat',
      expect.objectContaining({ method: 'POST' })
    );
  });

  it('does not send on Shift+Enter (allows newline behavior)', async () => {
    const user = userEvent.setup();
    render(<ChatPanel />);
    const input = screen.getByTestId('chat-input') as HTMLInputElement;

    await user.type(input, '你好');
    await user.keyboard('{Shift>}{Enter}{/Shift}');

    // Should not call /api/chat
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('renders user message after sending', async () => {
    const user = userEvent.setup();
    render(<ChatPanel />);
    const input = screen.getByTestId('chat-input') as HTMLInputElement;

    await user.type(input, '帮我做库存健康检查');
    await user.keyboard('{Enter}');

    expect(await screen.findByText('帮我做库存健康检查', {}, { timeout: 3000 })).toBeInTheDocument();
  });

  it('handles SSE streaming response with content events', async () => {
    const sseChunks = buildSSEChunks([
      { content: '你好' },
      { content: '，库存' },
      { content: '正常' },
    ]);
    mockFetch.mockResolvedValueOnce({
      ok: true,
      body: makeReadableStream(sseChunks),
    } as unknown as Response);

    const user = userEvent.setup();
    render(<ChatPanel />);
    const input = screen.getByTestId('chat-input') as HTMLInputElement;

    await user.type(input, '库存如何');
    await user.keyboard('{Enter}');

    // Wait for streamed content to appear as assistant message
    expect(await screen.findByText('你好，库存正常', {}, { timeout: 5000 })).toBeInTheDocument();
  });

  it('handles SSE tool call events and shows data panel trigger', async () => {
    const sseChunks = buildSSEChunks([
      { tool: 'query_inventory', params: { sku: 'SKU-001' } },
      { tool: 'query_inventory', result: '{"qty": 100}' },
      { content: '查询完成' },
    ]);
    mockFetch.mockResolvedValueOnce({
      ok: true,
      body: makeReadableStream(sseChunks),
    } as unknown as Response);

    const user = userEvent.setup();
    render(<ChatPanel />);
    const input = screen.getByTestId('chat-input') as HTMLInputElement;

    await user.type(input, '查询库存');
    await user.keyboard('{Enter}');

    expect(await screen.findByText('查询完成', {}, { timeout: 5000 })).toBeInTheDocument();
  });

  it('shows error recovery UI when fetch fails', async () => {
    mockFetch.mockReset();
    mockFetch.mockRejectedValueOnce(new Error('Network error'));

    const user = userEvent.setup();
    render(<ChatPanel />);
    const input = screen.getByTestId('chat-input') as HTMLInputElement;

    await user.type(input, '测试');
    await user.keyboard('{Enter}');

    expect(await screen.findByText(/请求失败/, {}, { timeout: 5000 })).toBeInTheDocument();
    // Recovery buttons
    expect(await screen.findByText('重试上一条', {}, { timeout: 3000 })).toBeInTheDocument();
    expect(screen.getByText('忽略')).toBeInTheDocument();
  });

  it('renders conversation history toggle button', () => {
    render(<ChatPanel />);
    const historyBtn = screen.getByTitle('对话历史');
    expect(historyBtn).toBeInTheDocument();
  });

  it('opens conversation history panel on button click', async () => {
    const user = userEvent.setup();
    render(<ChatPanel />);
    const historyBtn = screen.getByTitle('对话历史');

    await user.click(historyBtn);

    expect(screen.getByText('对话历史')).toBeInTheDocument();
    expect(screen.getByText('+ 新对话')).toBeInTheDocument();
  });

  it('renders file upload button', () => {
    render(<ChatPanel />);
    const uploadBtn = screen.getByTitle('上传文件');
    expect(uploadBtn).toBeInTheDocument();
  });

  it('quick action button populates input and sends', async () => {
    const user = userEvent.setup();
    render(<ChatPanel />);

    const quickBtn = screen.getByText('库存健康');
    await user.click(quickBtn);

    // Should call fetch for /api/chat
    await waitForFetchCall();
    expect(mockFetch).toHaveBeenCalledWith(
      '/api/chat',
      expect.objectContaining({ method: 'POST' })
    );
  });

  it('passes onJumpToPanel to data panel for tool calls', async () => {
    const sseChunks = buildSSEChunks([
      { tool: 'query_inventory', params: { sku: 'SKU-001' } },
      { tool: 'query_inventory', result: '{"qty": 100}' },
      { content: '查询已完成' },
    ]);
    mockFetch.mockResolvedValueOnce({
      ok: true,
      body: makeReadableStream(sseChunks),
    } as unknown as Response);

    const onJumpToPanel = vi.fn();
    const user = userEvent.setup();
    render(<ChatPanel onJumpToPanel={onJumpToPanel} />);
    const input = screen.getByTestId('chat-input') as HTMLInputElement;

    await user.type(input, '查询');
    await user.keyboard('{Enter}');

    // Wait for assistant message (unique content to avoid clashing with DataPanel "完成" status label)
    expect(await screen.findByText('查询已完成', {}, { timeout: 5000 })).toBeInTheDocument();

    // Data panel should be visible with "库存面板" jump link (only shown when onJump is provided)
    expect(await screen.findByText('库存面板', {}, { timeout: 5000 })).toBeInTheDocument();
  });
});

// Helper: wait for fetch to be called
async function waitForFetchCall(): Promise<void> {
  for (let i = 0; i < 50; i++) {
    if (mockFetch.mock.calls.length > 0) return;
    await new Promise(r => setTimeout(r, 50));
  }
}
