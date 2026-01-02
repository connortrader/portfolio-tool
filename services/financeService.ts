import { PortfolioStats } from '../types';

// Helper to parse generic date strings into YYYY-MM-DD
export function normalizeDate(dateStr: string | number): string | null {
  if (dateStr == null) return null;
  const s = String(dateStr).trim();
  
  // Match YYYY-MM-DD
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;

  // Match M/D/YYYY or M/D/YY (US format common in CSVs)
  const mdy = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
  if (mdy) {
      let [_, m, d, y] = mdy;
      m = m.padStart(2, '0');
      d = d.padStart(2, '0');
      if (y.length === 2) {
          const yNum = parseInt(y, 10);
          y = (yNum < 50 ? '20' : '19') + y;
      }
      return `${y}-${m}-${d}`;
  }
  
  // Match D.M.YYYY
  const dmy = s.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})$/);
  if (dmy) {
      const [_, d, m, y] = dmy;
      return `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
  }

  const d = new Date(s);
  if (isNaN(d.getTime())) return null;
  
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function parseNumber(val: any): number {
  if (val == null) return NaN;
  if (typeof val === 'number') return val;
  const s = String(val).replace(/[$,]/g, '').trim();
  const n = parseFloat(s);
  return isFinite(n) ? n : NaN;
}

export function calculateStats(equityCurve: number[], dates: string[]): PortfolioStats {
  if (!equityCurve || equityCurve.length < 2) {
    return {
      cagr: 0, sharpe: 0, sortino: 0, maxDrawdown: 0, calmar: 0,
      totalReturn: 0, finalBalance: 0, bestYear: 0, worstYear: 0, 
      annualReturns: {}, monthlyReturns: {}, annualMaxDrawdowns: {},
      winRate: 0, maxWinStreak: 0, maxLossStreak: 0
    };
  }

  const dailyReturns: number[] = [];
  const monthlyReturns: Record<number, Record<number, number>> = {};
  const monthMap = new Map<string, number[]>();

  for (let i = 1; i < equityCurve.length; i++) {
    const prev = equityCurve[i - 1];
    const curr = equityCurve[i];
    let r = 0;
    if (prev > 0) {
      r = (curr - prev) / prev;
    }
    dailyReturns.push(r);

    const [yStr, mStr] = dates[i].split('-');
    const year = parseInt(yStr);
    const month = parseInt(mStr) - 1; // 0-indexed
    
    const key = `${year}-${month}`;
    if (!monthMap.has(key)) monthMap.set(key, []);
    monthMap.get(key)!.push(r);
  }

  // Monthly Geometric Returns
  monthMap.forEach((rets, key) => {
    const [yearStr, monthStr] = key.split('-');
    const year = parseInt(yearStr);
    const month = parseInt(monthStr);
    const total = rets.reduce((acc, r) => acc * (1 + r), 1) - 1;
    if (!monthlyReturns[year]) monthlyReturns[year] = {};
    monthlyReturns[year][month] = total;
  });

  // Annual Returns
  const annualReturns: Record<string, number> = {};
  const yearRets = new Map<number, number[]>();
  const yearValues = new Map<number, number[]>();

  dates.forEach((d, idx) => {
    const year = parseInt(d.split('-')[0]);
    
    // Collect values for MaxDD calc
    if (!yearValues.has(year)) yearValues.set(year, []);
    yearValues.get(year)!.push(equityCurve[idx]);

    if (idx === 0) return;
    if (!yearRets.has(year)) yearRets.set(year, []);
    yearRets.get(year)!.push(dailyReturns[idx - 1]);
  });

  yearRets.forEach((rets, year) => {
    const total = rets.reduce((acc, r) => acc * (1 + r), 1) - 1;
    annualReturns[year] = total;
  });

  // Annual Max Drawdown (Intra-year)
  const annualMaxDrawdowns: Record<number, number> = {};
  yearValues.forEach((values, year) => {
      let peak = -Infinity;
      let maxDD = 0;
      for (const v of values) {
          if (v > peak) peak = v;
          const dd = peak > 0 ? (peak - v) / peak : 0;
          if (dd > maxDD) maxDD = dd;
      }
      annualMaxDrawdowns[year] = maxDD;
  });

  // Stats
  const firstValue = equityCurve[0];
  const lastValue = equityCurve[equityCurve.length - 1];
  const startDate = new Date(dates[0]);
  const endDate = new Date(dates[dates.length - 1]);
  
  // Calculate years accurately for CAGR
  const diffTime = Math.abs(endDate.getTime() - startDate.getTime());
  const years = Math.max(diffTime / (365.25 * 24 * 3600 * 1000), 0.1); // Avoid divide by zero
  const cagr = firstValue > 0 ? Math.pow(lastValue / firstValue, 1 / years) - 1 : 0;

  let peak = -Infinity;
  let maxDrawdown = 0;
  for (const val of equityCurve) {
    if (val > peak) peak = val;
    const dd = peak > 0 ? (peak - val) / peak : 0;
    if (dd > maxDrawdown) maxDrawdown = dd;
  }

  const avgReturn = dailyReturns.reduce((a, b) => a + b, 0) / dailyReturns.length;
  const stdDev = Math.sqrt(dailyReturns.reduce((a, b) => a + Math.pow(b - avgReturn, 2), 0) / dailyReturns.length);
  const downsideReturns = dailyReturns.filter(r => r < 0);
  const downsideStdDev = Math.sqrt(downsideReturns.reduce((a, b) => a + Math.pow(b, 2), 0) / downsideReturns.length);

  // Dynamic Annualization: Detect if 252 (stocks) or 365 (crypto) or other
  // This fixes the issue where mixing crypto/stocks caused wrong Sharpe
  const samplesPerYear = dailyReturns.length / years; 
  const annualizationFactor = Math.sqrt(samplesPerYear > 0 ? samplesPerYear : 252);

  const sharpe = stdDev > 0 ? (avgReturn / stdDev) * annualizationFactor : 0;
  const sortino = downsideStdDev > 0 ? (avgReturn / downsideStdDev) * annualizationFactor : 0;
  const calmar = maxDrawdown > 0 ? cagr / maxDrawdown : 0;

  const annualValues = Object.values(annualReturns);
  const bestYear = annualValues.length ? Math.max(...annualValues) : 0;
  const worstYear = annualValues.length ? Math.min(...annualValues) : 0;

  // Streaks
  let maxWinStreak = 0, maxLossStreak = 0;
  let currentWin = 0, currentLoss = 0;
  let wins = 0;
  
  dailyReturns.forEach(r => {
    if (r > 0) {
      wins++;
      currentWin++;
      currentLoss = 0;
      maxWinStreak = Math.max(maxWinStreak, currentWin);
    } else if (r < 0) {
      currentLoss++;
      currentWin = 0;
      maxLossStreak = Math.max(maxLossStreak, currentLoss);
    }
  });
  const winRate = dailyReturns.length > 0 ? wins / dailyReturns.length : 0;

  return {
    cagr, sharpe, sortino, maxDrawdown, calmar,
    totalReturn: firstValue > 0 ? (lastValue - firstValue) / firstValue : 0,
    finalBalance: lastValue,
    bestYear, worstYear,
    annualReturns, monthlyReturns, annualMaxDrawdowns,
    winRate, maxWinStreak, maxLossStreak
  };
}

// Calculate correlation only on overlapping dates
export function calculatePairwiseCorrelation(mapA: Map<string, number>, mapB: Map<string, number>): number | null {
  // Find intersection of dates
  const datesA = new Set(mapA.keys());
  const datesB = new Set(mapB.keys());
  const intersection = Array.from(datesA).filter(d => datesB.has(d)).sort();

  if (intersection.length < 2) return null;

  const seriesA = intersection.map(d => mapA.get(d)!);
  const seriesB = intersection.map(d => mapB.get(d)!);

  const retA: number[] = [];
  const retB: number[] = [];

  for (let i = 1; i < seriesA.length; i++) {
      // Simple returns for correlation
      if (seriesA[i-1] > 0 && seriesB[i-1] > 0) {
          retA.push((seriesA[i] - seriesA[i-1]) / seriesA[i-1]);
          retB.push((seriesB[i] - seriesB[i-1]) / seriesB[i-1]);
      }
  }

  if (retA.length < 2) return null;

  const n = retA.length;
  const sumA = retA.reduce((a, b) => a + b, 0);
  const sumB = retB.reduce((a, b) => a + b, 0);
  const sumAsq = retA.reduce((a, b) => a + b * b, 0);
  const sumBsq = retB.reduce((a, b) => a + b * b, 0);
  const pSum = retA.map((x, i) => x * retB[i]).reduce((a, b) => a + b, 0);

  const num = pSum - (sumA * sumB / n);
  const den = Math.sqrt((sumAsq - sumA * sumA / n) * (sumBsq - sumB * sumB / n));

  if (den === 0) return 0;
  return num / den;
}

// Helper to calculate Max Drawdown within a specific date range
export function getMaxDrawdownInPeriod(
  equityCurve: number[], 
  dates: string[], 
  startDate: string, 
  endDate: string
): number | null {
  // Find valid indices within range
  const validIndices: number[] = [];
  for(let i=0; i<dates.length; i++) {
    if (dates[i] >= startDate && dates[i] <= endDate) {
      validIndices.push(i);
    }
  }

  if (validIndices.length < 2) return null;

  // Extract subset values
  const subset = validIndices.map(i => equityCurve[i]);

  // Calculate Max DD on subset
  let peak = -Infinity;
  let maxDD = 0;
  for (const val of subset) {
    if (val > peak) peak = val;
    const dd = peak > 0 ? (peak - val) / peak : 0;
    if (dd > maxDD) maxDD = dd;
  }
  return maxDD;
}