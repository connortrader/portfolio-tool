export interface DataPoint {
  date: string; // YYYY-MM-DD
  value: number;
  timestamp: number;
}

export interface Strategy {
  id: string;
  name: string;
  data: Map<string, number>; // Date -> Equity
  color: string;
  isBuiltIn: boolean;
  price?: number;
  infoUrl?: string;
}

export interface SimulationResult {
  dates: string[];
  timestamps: number[];
  combinedEquity: number[]; // Dollar value curve
  strategyEquities: number[][]; // Parallel to activeStrategies
  spyEquity: number[];
  stats: PortfolioStats;
  spyStats: PortfolioStats | null;
  chartData: any[];
}

export interface PortfolioStats {
  cagr: number;
  sharpe: number;
  sortino: number;
  maxDrawdown: number;
  calmar: number;
  totalReturn: number;
  finalBalance: number;
  bestYear: number;
  worstYear: number;
  annualReturns: Record<string, number>;
  monthlyReturns: Record<number, Record<number, number>>; // Year -> Month (0-11) -> Return
  annualMaxDrawdowns: Record<number, number>; // Year -> MaxDD (positive number representing %)
  winRate?: number;
  maxWinStreak?: number;
  maxLossStreak?: number;
}

export const BUILT_IN_STRATEGIES = [
  {name: "Weekly Pullback", url: "https://raw.githubusercontent.com/SaCapitalManagement/CapitalManagementLtd/refs/heads/main/public_json/weeklydip.json", price: 690, info: "https://setupalpha.com/products/weekly-pullback-realtest-strategy"},
  {name: "Low Drawdown NASDAQ MR", url: "https://raw.githubusercontent.com/SaCapitalManagement/CapitalManagementLtd/refs/heads/main/public_json/ndxmr.json", price: 790, info: "https://setupalpha.com/products/low-drawdown-nasdaq-mean-reversion-realtest-strategy"},
  {name: "ATH MR", url: "https://raw.githubusercontent.com/SaCapitalManagement/CapitalManagementLtd/refs/heads/main/public_json/athmr.json", price: 890, info: "https://setupalpha.com/products/all-time-high-mean-reversion-realtest-strategy"},
  {name: "ETF Rotation", url: "https://raw.githubusercontent.com/SaCapitalManagement/CapitalManagementLtd/refs/heads/main/public_json/etfrotation.json", price: 590, info: "https://setupalpha.com/products/etf-rotation-monthly-rebalance-realtest-strategy"},
  {name: "New MR 2025", url: "https://raw.githubusercontent.com/SaCapitalManagement/CapitalManagementLtd/refs/heads/main/public_json/newmr2025.json", price: 890, info: "https://setupalpha.com/products/mean-reversion-2025-realtest-strategy"},
  {name: "Breakout", url: "https://raw.githubusercontent.com/SaCapitalManagement/CapitalManagementLtd/refs/heads/main/public_json/breakout.json", price: 690, info: "https://setupalpha.com/products/modern-breakout-realtest-strategy"},
  {name: "NASDAQ 100 MR", url: "https://raw.githubusercontent.com/SaCapitalManagement/CapitalManagementLtd/refs/heads/main/public_json/nasdaq_mr.json", price: 790, info: "https://setupalpha.com/products/nasdaq-100-mean-reversion-realtest-strategy"},
  {name: "Parabolic Short", url: "https://raw.githubusercontent.com/SaCapitalManagement/CapitalManagementLtd/refs/heads/main/public_json/shortsellmr.json", price: 890, info: "https://setupalpha.com/products/parabolic-short-realtest-qullamaggie-strategy"},
  {name: "Short Term MR", url: "https://raw.githubusercontent.com/SaCapitalManagement/CapitalManagementLtd/refs/heads/main/public_json/shorttermmr.json", price: 790, info: "https://setupalpha.com/products/short-term-mean-reversion-realtest-connors-alvarez"},
  {name: "SPX MR", url: "https://raw.githubusercontent.com/SaCapitalManagement/CapitalManagementLtd/refs/heads/main/public_json/spxmr.json", price: 690, info: "https://setupalpha.com/products/spx-mean-reversion-realtest-strategy"}
];

export const SPY_URL = 'https://raw.githubusercontent.com/SaCapitalManagement/CapitalManagementLtd/main/public_json/spybenchmark.json';