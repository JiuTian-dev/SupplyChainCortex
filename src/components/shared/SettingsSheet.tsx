'use client';

import { useState, useEffect } from 'react';
import { useTheme } from 'next-themes';
import {
  X, Brain, Globe, Sun, Moon, Trash2, Download, Eye, EyeOff,
} from 'lucide-react';
import {
  Sheet, SheetContent, SheetHeader, SheetTitle,
} from '@/components/ui/sheet';

interface SettingsSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  memoryMode: boolean;
  onMemoryModeChange: (on: boolean) => void;
  webSearchMode: boolean | undefined;
  onWebSearchModeChange: (mode: boolean | undefined) => void;
  provider: string;
  model: string;
  onProviderChange: (provider: string, model: string) => void;
  apiKey: string;
  onApiKeyChange: (key: string) => void;
}

export function SettingsSheet({
  open, onOpenChange,
  memoryMode, onMemoryModeChange,
  webSearchMode, onWebSearchModeChange,
  provider, model, onProviderChange,
  apiKey, onApiKeyChange,
}: SettingsSheetProps) {
  const { theme, setTheme } = useTheme();
  const [showKey, setShowKey] = useState(false);

  const providers = [
    { id: 'deepseek', label: 'DeepSeek V4 Flash', model: 'deepseek-v4-flash', short: 'DS' },
    { id: 'openai', label: 'OpenAI GPT-4o', model: 'gpt-4o', short: 'GPT' },
    { id: 'anthropic', label: 'Anthropic Claude Sonnet 4.6', model: 'claude-sonnet-4-6', short: 'CL' },
  ];

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-80 p-0">
        <SheetHeader className="px-5 py-4 border-b">
          <SheetTitle className="text-sm">设置</SheetTitle>
        </SheetHeader>

        <div className="px-5 py-4 space-y-6 overflow-auto">
          {/* Memory */}
          <section>
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <Brain className="h-4 w-4 text-zinc-500" />
                <span className="text-sm font-medium">记忆</span>
              </div>
              <button
                onClick={() => onMemoryModeChange(!memoryMode)}
                className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${
                  memoryMode ? 'bg-blue-600' : 'bg-zinc-200 dark:bg-zinc-700'
                }`}
              >
                <span
                  className={`inline-block h-3.5 w-3.5 rounded-full bg-white transition-transform ${
                    memoryMode ? 'translate-x-[18px]' : 'translate-x-[2px]'
                  }`}
                />
              </button>
            </div>
            <p className="text-xs text-zinc-400 leading-relaxed">
              {memoryMode
                ? 'AI 会引用历史对话和偏好，提供个性化分析'
                : '每轮对话独立进行，不引用历史也不记录'}
            </p>
            {memoryMode && (
              <p className="text-[10px] text-zinc-400 mt-1">
                记忆存储在本地服务器，不会上传到云端
              </p>
            )}
          </section>

          {/* Web Search */}
          <section>
            <div className="flex items-center gap-2 mb-2">
              <Globe className="h-4 w-4 text-zinc-500" />
              <span className="text-sm font-medium">联网搜索</span>
            </div>
            <div className="flex gap-1">
              {([
                [undefined, '自动'],
                [true, '开启'],
                [false, '关闭'],
              ] as const).map(([val, label]) => (
                <button
                  key={String(val)}
                  onClick={() => onWebSearchModeChange(val)}
                  className={`flex-1 text-xs py-1.5 rounded-lg border transition-colors ${
                    webSearchMode === val
                      ? 'border-blue-300 bg-blue-50 text-blue-600 dark:border-blue-700 dark:bg-blue-950 dark:text-blue-400'
                      : 'border-zinc-200 dark:border-zinc-700 text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-800'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </section>

          {/* Model */}
          <section>
            <span className="text-sm font-medium block mb-2">模型</span>
            <div className="space-y-1">
              {providers.map(p => (
                <button
                  key={p.id}
                  onClick={() => onProviderChange(p.id, p.model)}
                  className={`w-full text-left text-xs px-3 py-2 rounded-lg border transition-colors ${
                    provider === p.id
                      ? 'border-blue-300 bg-blue-50 text-blue-600 dark:border-blue-700 dark:bg-blue-950 dark:text-blue-400'
                      : 'border-zinc-200 dark:border-zinc-700 text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800'
                  }`}
                >
                  {p.label}
                </button>
              ))}
            </div>
          </section>

          {/* Theme */}
          <section>
            <span className="text-sm font-medium block mb-2">外观</span>
            <div className="flex gap-1">
              {(['light', 'dark', 'system'] as const).map(t => (
                <button
                  key={t}
                  onClick={() => setTheme(t)}
                  className={`flex-1 text-xs py-1.5 rounded-lg border transition-colors ${
                    theme === t
                      ? 'border-blue-300 bg-blue-50 text-blue-600 dark:border-blue-700 dark:bg-blue-950 dark:text-blue-400'
                      : 'border-zinc-200 dark:border-zinc-700 text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-800'
                  }`}
                >
                  {t === 'light' ? '浅色' : t === 'dark' ? '深色' : '自动'}
                </button>
              ))}
            </div>
          </section>

          {/* API Key */}
          <section>
            <span className="text-sm font-medium block mb-2">API Key</span>
            <div className="flex gap-1">
              <input
                type={showKey ? 'text' : 'password'}
                value={apiKey}
                onChange={e => onApiKeyChange(e.target.value)}
                placeholder="sk-...（留空使用环境变量）"
                className="flex-1 h-8 text-xs px-2 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800"
              />
              <button
                onClick={() => setShowKey(!showKey)}
                className="h-8 w-8 rounded-lg border border-zinc-200 dark:border-zinc-700 flex items-center justify-center"
              >
                {showKey ? <EyeOff className="h-3 w-3" /> : <Eye className="h-3 w-3" />}
              </button>
            </div>
          </section>
        </div>
      </SheetContent>
    </Sheet>
  );
}
