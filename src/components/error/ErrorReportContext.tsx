'use client';

import React, { createContext, useContext, useState, useCallback } from 'react';

export interface ErrorReport {
  id: string;
  timestamp: Date;
  error: Error;
  errorInfo?: React.ErrorInfo;
  componentStack?: string;
  level: 'page' | 'section' | 'component';
  sectionName?: string;
  userAgent: string;
  url: string;
  userId?: string;
}

interface ErrorReportContextType {
  errors: ErrorReport[];
  reportError: (error: Error, info?: { level?: string; sectionName?: string; errorInfo?: React.ErrorInfo }) => void;
  clearErrors: () => void;
  getErrorCount: () => number;
}

const ErrorReportContext = createContext<ErrorReportContextType | null>(null);

const MAX_ERRORS = 50;

function generateId(): string {
  return `err_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
}

export function ErrorReportProvider({ children }: { children: React.ReactNode }) {
  const [errors, setErrors] = useState<ErrorReport[]>([]);

  const reportError = useCallback(
    (error: Error, info?: { level?: string; sectionName?: string; errorInfo?: React.ErrorInfo }) => {
      const report: ErrorReport = {
        id: generateId(),
        timestamp: new Date(),
        error,
        errorInfo: info?.errorInfo,
        componentStack: info?.errorInfo?.componentStack ?? undefined,
        level: (info?.level as ErrorReport['level']) || 'component',
        sectionName: info?.sectionName,
        userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : 'unknown',
        url: typeof window !== 'undefined' ? window.location.href : 'unknown',
      };

      setErrors((prev) => {
        const next = [report, ...prev];
        return next.slice(0, MAX_ERRORS);
      });

      // Log in development
      if (process.env.NODE_ENV === 'development') {
        console.error('[ErrorReport]', {
          message: error.message,
          level: report.level,
          sectionName: report.sectionName,
          stack: error.stack,
          componentStack: report.componentStack,
        });
      }
    },
    []
  );

  const clearErrors = useCallback(() => {
    setErrors([]);
  }, []);

  const getErrorCount = useCallback(() => {
    return errors.length;
  }, [errors.length]);

  return (
    <ErrorReportContext.Provider value={{ errors, reportError, clearErrors, getErrorCount }}>
      {children}
    </ErrorReportContext.Provider>
  );
}

export function useErrorReport(): ErrorReportContextType {
  const ctx = useContext(ErrorReportContext);
  if (!ctx) {
    // Return a no-op fallback when used outside provider
    return {
      errors: [],
      reportError: () => {},
      clearErrors: () => {},
      getErrorCount: () => 0,
    };
  }
  return ctx;
}
