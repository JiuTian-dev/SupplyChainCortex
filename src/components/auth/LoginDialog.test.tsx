import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { LoginDialog } from './LoginDialog';

// Mock the auth store
const mockSetShowLoginDialog = vi.fn();
const mockCheckAuth = vi.fn().mockResolvedValue(undefined);

vi.mock('@/stores/auth-store', () => ({
  useAuthStore: () => ({
    showLoginDialog: true,
    setShowLoginDialog: mockSetShowLoginDialog,
    checkAuth: mockCheckAuth,
  }),
}));

// Mock next-auth/react
vi.mock('next-auth/react', () => ({
  signIn: vi.fn().mockResolvedValue({ error: null }),
}));

// Mock Dialog components to avoid portal issues in tests
vi.mock('@/components/ui/dialog', () => ({
  Dialog: ({ children, open, onOpenChange }: { children: React.ReactNode; open: boolean; onOpenChange: (open: boolean) => void }) => {
    if (!open) return null;
    return (
      <div data-testid="dialog" role="dialog">
        <button data-testid="dialog-close" onClick={() => onOpenChange(false)}>Close</button>
        {children}
      </div>
    );
  },
  DialogContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DialogHeader: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DialogTitle: ({ children }: { children: React.ReactNode }) => <h2>{children}</h2>,
  DialogDescription: ({ children }: { children: React.ReactNode }) => <p>{children}</p>,
}));

describe('LoginDialog', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders login form when open', () => {
    render(<LoginDialog />);
    
    expect(screen.getByText('登录SupplyChain Cortex')).toBeInTheDocument();
    expect(screen.getByLabelText('邮箱')).toBeInTheDocument();
    expect(screen.getByLabelText('密码')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '登录' })).toBeInTheDocument();
  });

  it('shows demo accounts', () => {
    render(<LoginDialog />);
    
    expect(screen.getByText('演示账号：')).toBeInTheDocument();
    expect(screen.getByText(/admin@supply-chain.com/)).toBeInTheDocument();
    expect(screen.getByText(/manager@supply-chain.com/)).toBeInTheDocument();
    expect(screen.getByText(/viewer@supply-chain.com/)).toBeInTheDocument();
  });

  it('has email input field', () => {
    render(<LoginDialog />);
    const emailInput = screen.getByPlaceholderText('请输入邮箱');
    expect(emailInput).toBeInTheDocument();
    expect(emailInput).toHaveAttribute('type', 'email');
  });

  it('has password input field', () => {
    render(<LoginDialog />);
    const passwordInput = screen.getByPlaceholderText('请输入密码');
    expect(passwordInput).toBeInTheDocument();
  });

  it('handles email input change', async () => {
    render(<LoginDialog />);
    const emailInput = screen.getByPlaceholderText('请输入邮箱');
    
    await userEvent.type(emailInput, 'admin@supply-chain.com');
    expect(emailInput).toHaveValue('admin@supply-chain.com');
  });

  it('handles password input change', async () => {
    render(<LoginDialog />);
    const passwordInput = screen.getByPlaceholderText('请输入密码');
    
    await userEvent.type(passwordInput, 'admin123');
    expect(passwordInput).toHaveValue('admin123');
  });

  it('submits form on login button click', async () => {
    const { signIn } = await import('next-auth/react');
    render(<LoginDialog />);
    
    const emailInput = screen.getByPlaceholderText('请输入邮箱');
    const passwordInput = screen.getByPlaceholderText('请输入密码');
    
    await userEvent.type(emailInput, 'admin@supply-chain.com');
    await userEvent.type(passwordInput, 'admin123');
    
    const loginButton = screen.getByRole('button', { name: '登录' });
    await userEvent.click(loginButton);
    
    expect(signIn).toHaveBeenCalledWith('credentials', {
      email: 'admin@supply-chain.com',
      password: 'admin123',
      redirect: false,
    });
  });

  it('shows loading state during login', async () => {
    // Make signIn hang to see loading state
    const { signIn } = await import('next-auth/react');
    vi.mocked(signIn).mockImplementation(() => new Promise(() => {}));
    
    render(<LoginDialog />);
    
    const emailInput = screen.getByPlaceholderText('请输入邮箱');
    const passwordInput = screen.getByPlaceholderText('请输入密码');
    
    await userEvent.type(emailInput, 'admin@supply-chain.com');
    await userEvent.type(passwordInput, 'admin123');
    
    const loginButton = screen.getByRole('button', { name: '登录' });
    await userEvent.click(loginButton);
    
    expect(screen.getByText('登录中...')).toBeInTheDocument();
  });
});
