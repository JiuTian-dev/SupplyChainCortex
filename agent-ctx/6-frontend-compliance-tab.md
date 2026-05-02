# Task 6-frontend: Compliance Tab Frontend Builder

## Work Summary
Built the Compliance & Certification Tab frontend component and integrated it into the main application.

## Changes Made

### 1. Verified existing API client and hooks (already complete)
- `fetchCompliance`, `createComplianceCert`, `createRegulationChange`, `updateComplianceCert`, `updateRegulationChange` in api-client.ts
- `useComplianceOverview`, `useComplianceCerts`, `useRegulationChanges`, `useExpiringCerts`, `useCreateComplianceCert`, `useCreateRegulationChange`, `useUpdateComplianceCert`, `useUpdateRegulationChange` in use-supply-chain-data.ts

### 2. Created ComplianceTab component
- File: `/home/z/my-project/src/components/compliance/ComplianceTab.tsx`
- Features:
  - Expiring soon alert section (yellow warning banner with critical/warning badges)
  - 4 overview MetricCards (Active, Expiring Soon, Expired, Critical)
  - Sub-tabs: 合规认证 and 法规变更
  - Certificate category PieChart (Recharts) with legend
  - Certificate cards with status badges (color-coded), category badges, expiry countdown progress bars
  - Create Certificate dialog (certName, certNumber, issuer, SKU, productName, category select, dates, scope, notes, reminderDays)
  - Edit Certificate dialog (click on cert card)
  - Regulation stats cards (new, reviewing, action required, non-compliant)
  - Regulation cards with source badges, impact level badges, status badges, action required sections
  - Review Regulation dialog (change status + add action required)
  - Create Regulation dialog (title, source, category, description, impactLevel, dates, affected SKUs, action required, source URL)
  - Full dark mode support
  - Responsive design
  - sonner toast notifications
  - React Query mutations with auto-invalidation

### 3. Integrated into page.tsx
- Added FileCheck icon import from lucide-react
- Added dynamic import for ComplianceTab with TabSkeleton
- Changed grid-cols-7 to grid-cols-8
- Added "合规资质" TabsTrigger with teal color theme
- Added TabsContent with SectionErrorBoundary and transition spinner

### Lint Status
- Fixed: CustomPieTooltip component moved outside render function (react-hooks/static-components rule)
- Final lint: 0 errors, 0 warnings
