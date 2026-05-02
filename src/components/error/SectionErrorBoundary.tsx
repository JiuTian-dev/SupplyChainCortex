'use client';

import { GlobalErrorBoundary } from './GlobalErrorBoundary';

interface SectionErrorBoundaryProps {
  children: React.ReactNode;
  sectionName: string;
}

export function SectionErrorBoundary({ children, sectionName }: SectionErrorBoundaryProps) {
  return (
    <GlobalErrorBoundary level="section">
      {children}
    </GlobalErrorBoundary>
  );
}
