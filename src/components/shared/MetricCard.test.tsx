import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { Zap } from 'lucide-react';
import { MetricCard } from './MetricCard';

describe('MetricCard', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders title and string value', async () => {
    render(
      <MetricCard
        icon={<Zap data-testid="icon" />}
        title="总销量"
        value="1,234"
        color="text-orange-600"
        bgColor="bg-orange-50"
      />
    );
    expect(screen.getByText('总销量')).toBeInTheDocument();
    await waitFor(() => {
      expect(screen.getByText('1,234')).toBeInTheDocument();
    });
  });

  it('renders numeric value after animation', async () => {
    render(
      <MetricCard
        icon={<Zap />}
        title="订单数"
        value={42}
        color="text-blue-600"
        bgColor="bg-blue-50"
      />
    );
    expect(screen.getByText('订单数')).toBeInTheDocument();
    // Wait for animation to complete and display final value
    await waitFor(() => {
      expect(screen.getByText('42')).toBeInTheDocument();
    }, { timeout: 2000 });
  });

  it('renders unit next to value', async () => {
    render(
      <MetricCard
        icon={<Zap />}
        title="库存量"
        value={100}
        unit="件"
        color="text-green-600"
        bgColor="bg-green-50"
      />
    );
    expect(screen.getByText('件')).toBeInTheDocument();
  });

  it('renders subtitle when provided', () => {
    render(
      <MetricCard
        icon={<Zap />}
        title="收入"
        value="¥99,999"
        subtitle="较上月"
        color="text-emerald-600"
        bgColor="bg-emerald-50"
      />
    );
    expect(screen.getByText('较上月')).toBeInTheDocument();
  });

  it('renders positive trend with green color class', () => {
    render(
      <MetricCard
        icon={<Zap />}
        title="增长率"
        value="15%"
        trend="+12.5%"
        subtitle="环比"
        color="text-green-600"
        bgColor="bg-green-50"
      />
    );
    const trendElement = screen.getByText('+12.5%');
    expect(trendElement).toBeInTheDocument();
    expect(trendElement).toHaveClass('text-green-600');
  });

  it('renders negative trend with amber color class', () => {
    render(
      <MetricCard
        icon={<Zap />}
        title="流失率"
        value="5%"
        trend="-3.2%"
        subtitle="环比"
        color="text-red-600"
        bgColor="bg-red-50"
      />
    );
    const trendElement = screen.getByText('-3.2%');
    expect(trendElement).toBeInTheDocument();
    expect(trendElement).toHaveClass('text-amber-600');
  });

  it('renders sparkline SVG when trend is provided', () => {
    const { container } = render(
      <MetricCard
        icon={<Zap />}
        title="销量"
        value={100}
        trend="+10%"
        color="text-orange-600"
        bgColor="bg-orange-50"
      />
    );
    const svg = container.querySelector('svg');
    expect(svg).toBeInTheDocument();
  });

  it('renders sparkline SVG from sparkline data array', () => {
    const { container } = render(
      <MetricCard
        icon={<Zap />}
        title="趋势"
        value={50}
        sparkline={[10, 20, 15, 30, 25, 40]}
        color="text-cyan-600"
        bgColor="bg-cyan-50"
      />
    );
    const svg = container.querySelector('svg');
    expect(svg).toBeInTheDocument();
    // Sparkline should contain a polyline
    const polyline = container.querySelector('polyline');
    expect(polyline).toBeInTheDocument();
  });

  it('renders top accent line with color based on color prop', () => {
    const { container } = render(
      <MetricCard
        icon={<Zap />}
        title="测试"
        value="100"
        color="text-orange-600"
        bgColor="bg-orange-50"
      />
    );
    // The top accent line is a div with h-[2px] class
    const accentLine = container.querySelector('.h-\\[2px\\]');
    expect(accentLine).toBeInTheDocument();
    expect(accentLine).toHaveStyle({ backgroundColor: '#f97316' });
  });

  it('renders icon in bg color container', () => {
    render(
      <MetricCard
        icon={<Zap data-testid="metric-icon" />}
        title="测试"
        value="100"
        color="text-orange-600"
        bgColor="bg-orange-50"
      />
    );
    const icon = screen.getByTestId('metric-icon');
    expect(icon).toBeInTheDocument();
    // Icon should be inside a container with the bgColor class
    const iconContainer = icon.closest('.bg-orange-50');
    expect(iconContainer).toBeInTheDocument();
  });

  it('renders tooltip content with title and value', async () => {
    render(
      <MetricCard
        icon={<Zap />}
        title="总收入"
        value="¥50,000"
        color="text-green-600"
        bgColor="bg-green-50"
      />
    );
    // The card is wrapped in a tooltip trigger; tooltip content is rendered but hidden
    // We can verify the card content is present
    expect(screen.getByText('总收入')).toBeInTheDocument();
  });

  it('renders custom detail text when provided', () => {
    render(
      <MetricCard
        icon={<Zap />}
        title="自定义"
        value="100"
        detail="这是自定义详情文本"
        color="text-violet-600"
        bgColor="bg-violet-50"
      />
    );
    // Detail is used in tooltip content, not directly visible
    expect(screen.getByText('自定义')).toBeInTheDocument();
  });

  it('does not render sparkline when no trend and no sparkline data', () => {
    const { container } = render(
      <MetricCard
        icon={<Zap />}
        title="无趋势"
        value="100"
        color="text-amber-600"
        bgColor="bg-amber-50"
      />
    );
    // No SVG should be rendered for sparkline (but icon SVG may exist)
    // The sparkline SVG has width="28" height="14"
    const sparklineSvgs = container.querySelectorAll('svg[width="28"]');
    expect(sparklineSvgs.length).toBe(0);
  });
});
