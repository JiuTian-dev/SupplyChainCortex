import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import React from 'react';
import { GlobalErrorBoundary } from './GlobalErrorBoundary';

// Suppress console.error from ErrorBoundary in test output
const originalConsoleError = console.error;
beforeEach(() => {
  console.error = vi.fn();
});
afterEach(() => {
  console.error = originalConsoleError;
});

// Component that always throws for testing
function ThrowingComponent({ error }: { error?: Error } = {}): React.ReactNode {
  throw error ?? new Error('Test error message');
}

// Component that renders normally
function NormalComponent() {
  return <div data-testid="normal-content">Normal content</div>;
}

describe('GlobalErrorBoundary', () => {
  it('renders children when no error', () => {
    render(
      <GlobalErrorBoundary>
        <NormalComponent />
      </GlobalErrorBoundary>
    );
    
    expect(screen.getByTestId('normal-content')).toBeInTheDocument();
    expect(screen.getByText('Normal content')).toBeInTheDocument();
  });

  it('shows error UI when child throws', () => {
    render(
      <GlobalErrorBoundary>
        <ThrowingComponent />
      </GlobalErrorBoundary>
    );
    
    expect(screen.getByText('区块加载出错')).toBeInTheDocument();
  });

  it('shows error detail in collapsible section', () => {
    render(
      <GlobalErrorBoundary>
        <ThrowingComponent error={new Error('Something went wrong')} />
      </GlobalErrorBoundary>
    );
    
    expect(screen.getByText('错误详情')).toBeInTheDocument();
  });

  it('shows retry button when error occurs', () => {
    render(
      <GlobalErrorBoundary>
        <ThrowingComponent />
      </GlobalErrorBoundary>
    );
    
    expect(screen.getByText('重试')).toBeInTheDocument();
  });

  it('retry button resets error state', () => {
    let shouldThrow = true;
    
    function ConditionalThrower() {
      if (shouldThrow) {
        throw new Error('Conditional error');
      }
      return <div data-testid="recovered">Recovered!</div>;
    }
    
    render(
      <GlobalErrorBoundary>
        <ConditionalThrower />
      </GlobalErrorBoundary>
    );
    
    // Should show error
    expect(screen.getByText('区块加载出错')).toBeInTheDocument();
    
    // Stop throwing before retry
    shouldThrow = false;
    
    // Click retry
    fireEvent.click(screen.getByText('重试'));
    
    // Should now show recovered content
    expect(screen.getByTestId('recovered')).toBeInTheDocument();
    expect(screen.getByText('Recovered!')).toBeInTheDocument();
  });

  it('calls onError callback when error occurs', () => {
    const onError = vi.fn();
    
    render(
      <GlobalErrorBoundary onError={onError}>
        <ThrowingComponent />
      </GlobalErrorBoundary>
    );
    
    expect(onError).toHaveBeenCalledTimes(1);
    expect(onError.mock.calls[0][0]).toBeInstanceOf(Error);
    expect(onError.mock.calls[0][0].message).toBe('Test error message');
  });

  it('renders custom fallback when provided', () => {
    render(
      <GlobalErrorBoundary fallback={<div data-testid="custom-fallback">Custom error</div>}>
        <ThrowingComponent />
      </GlobalErrorBoundary>
    );
    
    expect(screen.getByTestId('custom-fallback')).toBeInTheDocument();
    expect(screen.getByText('Custom error')).toBeInTheDocument();
  });

  it('shows page-level error message for page level', () => {
    render(
      <GlobalErrorBoundary level="page">
        <ThrowingComponent />
      </GlobalErrorBoundary>
    );
    
    expect(screen.getByText('页面加载出错')).toBeInTheDocument();
  });

  it('shows component-level error message for component level', () => {
    render(
      <GlobalErrorBoundary level="component">
        <ThrowingComponent />
      </GlobalErrorBoundary>
    );
    
    expect(screen.getByText('组件异常')).toBeInTheDocument();
  });

  it('shows "返回首页" button for page-level errors', () => {
    render(
      <GlobalErrorBoundary level="page">
        <ThrowingComponent />
      </GlobalErrorBoundary>
    );
    
    expect(screen.getByText('返回首页')).toBeInTheDocument();
  });

  it('does not show "返回首页" button for non-page-level errors', () => {
    render(
      <GlobalErrorBoundary level="section">
        <ThrowingComponent />
      </GlobalErrorBoundary>
    );
    
    expect(screen.queryByText('返回首页')).not.toBeInTheDocument();
  });
});
