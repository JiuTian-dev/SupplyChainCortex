/**
 * Exchange Rate Data — Major Settlement Currencies vs CNY
 * Used client-side for real-time display in the ExchangeRateMatrix.
 * Core rates can be refreshed from the Frankfurter API via exchange-rate.service.ts.
 */

export interface ExchangeRateEntry {
  code: string;
  name: string;
  symbol: string;
  rate: number;
  change: number;
  changeAmount: number;
  bid: number;
  ask: number;
}

export interface ExchangeRateSnapshot {
  rates: ExchangeRateEntry[];
  baseCurrency: string;
  timestamp: number;
}

// ─── 12 major settlement currencies vs CNY ──────────────────────────────────
const RATES: ExchangeRateEntry[] = [
  {
    code: 'USD', name: '美元', symbol: '$',
    rate: 7.2503, change: -0.08, changeAmount: -0.0058, bid: 7.2496, ask: 7.2510,
  },
  {
    code: 'EUR', name: '欧元', symbol: '€',
    rate: 7.8541, change: 0.12, changeAmount: 0.0094, bid: 7.8532, ask: 7.8550,
  },
  {
    code: 'JPY', name: '日元', symbol: '¥',
    rate: 0.04816, change: -0.25, changeAmount: -0.00012, bid: 0.04814, ask: 0.04818,
  },
  {
    code: 'KRW', name: '韩元', symbol: '₩',
    rate: 0.00543, change: 0.05, changeAmount: 0.000003, bid: 0.00542, ask: 0.00544,
  },
  {
    code: 'GBP', name: '英镑', symbol: '£',
    rate: 9.1827, change: 0.18, changeAmount: 0.0165, bid: 9.1818, ask: 9.1836,
  },
  {
    code: 'SGD', name: '新加坡元', symbol: 'S$',
    rate: 5.4021, change: -0.03, changeAmount: -0.0016, bid: 5.4015, ask: 5.4027,
  },
  {
    code: 'HKD', name: '港币', symbol: 'HK$',
    rate: 0.9276, change: -0.06, changeAmount: -0.0006, bid: 0.9274, ask: 0.9278,
  },
  {
    code: 'AUD', name: '澳元', symbol: 'A$',
    rate: 4.7685, change: 0.10, changeAmount: 0.0048, bid: 4.7679, ask: 4.7691,
  },
  {
    code: 'THB', name: '泰铢', symbol: '฿',
    rate: 0.2018, change: -0.15, changeAmount: -0.0003, bid: 0.2016, ask: 0.2020,
  },
  {
    code: 'BRL', name: '巴西雷亚尔', symbol: 'R$',
    rate: 1.4529, change: 0.22, changeAmount: 0.0032, bid: 1.4523, ask: 1.4535,
  },
  {
    code: 'RUB', name: '俄罗斯卢布', symbol: '₽',
    rate: 0.07952, change: -0.40, changeAmount: -0.00032, bid: 0.07948, ask: 0.07956,
  },
  {
    code: 'MXN', name: '墨西哥比索', symbol: 'Mex$',
    rate: 0.4237, change: 0.08, changeAmount: 0.0003, bid: 0.4235, ask: 0.4239,
  },
];

export function getExchangeRates(): ExchangeRateSnapshot {
  return {
    rates: RATES,
    baseCurrency: 'CNY',
    timestamp: Date.now(),
  };
}

export function getExchangeRate(code: string): ExchangeRateEntry | undefined {
  return RATES.find(r => r.code.toUpperCase() === code.toUpperCase());
}

export function convertFromCNY(amountCny: number, targetCode: string): number | null {
  const rate = getExchangeRate(targetCode);
  if (!rate || rate.rate === 0) return null;
  return Math.round((amountCny / rate.rate) * 100) / 100;
}

export function convertToCNY(amount: number, sourceCode: string): number | null {
  const rate = getExchangeRate(sourceCode);
  if (!rate) return null;
  return Math.round(amount * rate.rate * 100) / 100;
}

export function getRateForDestination(destination: string): ExchangeRateEntry {
  const map: Record<string, string> = {
    US: 'USD', EU: 'EUR', JP: 'JPY', KR: 'KRW',
    GB: 'GBP', SG: 'SGD', HK: 'HKD', AU: 'AUD',
    TH: 'THB', BR: 'BRL', RU: 'RUB', MX: 'MXN',
  };
  const code = map[destination.toUpperCase()] || 'USD';
  return getExchangeRate(code) || RATES[0];
}
