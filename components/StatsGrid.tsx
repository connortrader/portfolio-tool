import React from 'react';
import { PortfolioStats, Strategy } from '../types';
import { calculatePairwiseCorrelation, getMaxDrawdownInPeriod } from '../services/financeService';

export const StatsGrid: React.FC<{ stats: PortfolioStats, spyStats: PortfolioStats | null }> = ({ stats, spyStats }) => {
    const fmtP = (n: number | undefined) => (n !== undefined ? `${(n * 100).toFixed(2)}%` : 'N/A');
    const fmtN = (n: number | undefined) => (n !== undefined ? n.toFixed(2) : 'N/A');
    const fmtD = (n: number | undefined) => (n !== undefined ? `$${Math.round(n).toLocaleString()}` : 'N/A');

    const rows = [
        { label: 'CAGR', val: fmtP(stats.cagr), spy: spyStats ? fmtP(spyStats.cagr) : '-' },
        { label: 'Sharpe Ratio', val: fmtN(stats.sharpe), spy: spyStats ? fmtN(spyStats.sharpe) : '-' },
        { label: 'Sortino Ratio', val: fmtN(stats.sortino), spy: spyStats ? fmtN(spyStats.sortino) : '-' },
        { label: 'Max Drawdown', val: stats.maxDrawdown ? `-${fmtP(Math.abs(stats.maxDrawdown))}` : '0%', spy: spyStats ? `-${fmtP(Math.abs(spyStats.maxDrawdown))}` : '-' },
        { label: 'Calmar Ratio', val: fmtN(stats.calmar), spy: spyStats ? fmtN(spyStats.calmar) : '-' },
        { label: 'Total Return', val: fmtP(stats.totalReturn), spy: spyStats ? fmtP(spyStats.totalReturn) : '-' },
        { label: 'Final Balance', val: fmtD(stats.finalBalance), spy: spyStats ? fmtD(spyStats.finalBalance) : '-' },
        { label: 'Best Year', val: fmtP(stats.bestYear), spy: spyStats ? fmtP(spyStats.bestYear) : '-' },
        { label: 'Worst Year', val: fmtP(stats.worstYear), spy: spyStats ? fmtP(spyStats.worstYear) : '-' },
        { label: 'Win Rate', val: fmtP(stats.winRate), spy: spyStats ? fmtP(spyStats.winRate) : '-' },
        { label: 'Max Win Streak', val: `${stats.maxWinStreak} days`, spy: spyStats ? `${spyStats.maxWinStreak} days` : '-' },
        { label: 'Max Loss Streak', val: `${stats.maxLossStreak} days`, spy: spyStats ? `${spyStats.maxLossStreak} days` : '-' },
    ];

    return (
        <div className="mb-8">
            <h3 className="text-lg font-bold text-slate-800 mb-4">Portfolio Performance Metrics</h3>
            <div className="overflow-hidden rounded-lg border border-slate-200">
                <table className="w-full text-sm text-left">
                    <thead className="bg-slate-50 text-slate-500 font-semibold border-b border-slate-200">
                        <tr>
                            <th className="px-4 py-3">Metric</th>
                            <th className="px-4 py-3 text-right text-slate-800">Portfolio</th>
                            <th className="px-4 py-3 text-right text-slate-800">SPY Buy & Hold</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 bg-white">
                        {rows.map((row, idx) => (
                            <tr key={idx} className={idx % 2 === 0 ? 'bg-white' : 'bg-slate-50/50'}>
                                <td className="px-4 py-3 font-medium text-slate-600">{row.label}</td>
                                <td className="px-4 py-3 text-right font-bold text-slate-900 tabular-nums">{row.val}</td>
                                <td className="px-4 py-3 text-right text-slate-500 tabular-nums">{row.spy}</td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    );
};

export const CorrelationMatrix: React.FC<{ 
    strategies: Strategy[]
}> = ({ strategies }) => {
    if (strategies.length < 2) return null;

    const names = strategies.map(s => s.name);
    const matrix: (number | null)[][] = [];

    for(let i=0; i<strategies.length; i++) {
        const row: (number | null)[] = [];
        for(let j=0; j<strategies.length; j++) {
            if(i===j) row.push(1);
            else {
                const val = calculatePairwiseCorrelation(strategies[i].data, strategies[j].data);
                row.push(val);
            }
        }
        matrix.push(row);
    }

    const getColor = (val: number | null) => {
        if (val === null) return 'text-slate-300';
        if (val >= 0.8) return 'bg-red-50 text-red-700 font-bold'; // High positive -> Red (Bad for diversification)
        if (val >= 0.6) return 'bg-amber-50 text-amber-700'; 
        if (val < 0.6) return 'bg-emerald-50 text-emerald-700 font-bold'; // Low/Negative -> Green (Good)
        return 'text-slate-600';
    };

    return (
        <div className="mt-8">
            <h4 className="text-sm font-bold text-slate-800 mb-4 flex items-center gap-2">
                Correlation Matrix
            </h4>
            <div className="border border-slate-200 rounded-lg overflow-x-auto custom-scrollbar">
                <table className="w-full min-w-max text-xs border-collapse bg-white">
                    <thead>
                        <tr className="bg-slate-50 border-b border-slate-200">
                            <th className="p-3 border-r border-slate-100 sticky left-0 bg-slate-50 z-10 shadow-[2px_0_5px_-2px_rgba(0,0,0,0.1)]"></th>
                            {names.map((n, i) => (
                                <th key={i} className="p-3 text-center font-semibold text-slate-500 border-r border-slate-100 min-w-[80px] max-w-[150px] truncate" title={n}>
                                    {n}
                                </th>
                            ))}
                        </tr>
                    </thead>
                    <tbody>
                        {names.map((rowName, i) => (
                            <tr key={i} className="border-b border-slate-100 last:border-0 hover:bg-slate-50/50 transition-colors">
                                <td className="p-3 font-medium text-slate-700 bg-slate-50 border-r border-slate-200 max-w-[150px] truncate sticky left-0 z-10 shadow-[2px_0_5px_-2px_rgba(0,0,0,0.1)]" title={rowName}>
                                    {rowName}
                                </td>
                                {matrix[i].map((val, j) => (
                                    <td key={j} className={`p-3 text-center tabular-nums border-r border-slate-100 ${i===j ? 'bg-slate-100 text-slate-400' : getColor(val)}`}>
                                        {val !== null ? val.toFixed(2) : 'N/A'}
                                    </td>
                                ))}
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    );
};

export const StressPeriodsTable: React.FC<{
    dates: string[],
    combinedEquity: number[],
    spyEquity: number[]
}> = ({ dates, combinedEquity, spyEquity }) => {
    
    const periods = [
        { name: 'Dotcom Bubble', start: '2000-01-01', end: '2002-10-08' },
        { name: '2008 Fin. Crisis', start: '2007-10-10', end: '2009-03-06' },
        { name: 'Covid-19 Crash', start: '2020-02-19', end: '2020-03-23' },
        { name: '2022 Bear Market', start: '2022-01-04', end: '2022-10-12' },
        { name: '2025 Tariffs Crash', start: '2025-02-19', end: '2025-04-07' }
    ];

    const formatDD = (val: number | null) => {
        if (val === null) return '-';
        return `-${(val * 100).toFixed(2)}%`;
    };

    return (
        <div className="mt-8">
            <h4 className="text-sm font-bold text-slate-800 mb-4 flex items-center gap-2">
                Historical Market Stress Periods
            </h4>
            <div className="border border-slate-200 rounded-lg overflow-hidden">
                <table className="w-full text-xs text-left border-collapse bg-white">
                    <thead className="bg-slate-50 text-slate-500 uppercase tracking-wider">
                        <tr>
                            <th className="p-3 border-b border-slate-200">Event</th>
                            <th className="p-3 border-b border-slate-200">Date Range</th>
                            <th className="p-3 border-b border-slate-200 text-right">Portfolio Max DD</th>
                            <th className="p-3 border-b border-slate-200 text-right">SPY Max DD</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                        {periods.map((p, i) => {
                            const portDD = getMaxDrawdownInPeriod(combinedEquity, dates, p.start, p.end);
                            const spyDD = getMaxDrawdownInPeriod(spyEquity, dates, p.start, p.end);

                            return (
                                <tr key={i} className="hover:bg-slate-50 transition-colors">
                                    <td className="p-3 font-medium text-slate-700">{p.name}</td>
                                    <td className="p-3 text-slate-500 tabular-nums text-[10px]">{p.start} to {p.end}</td>
                                    <td className={`p-3 text-right tabular-nums font-bold ${portDD && portDD > 0.2 ? 'text-red-600' : 'text-slate-700'}`}>
                                        {formatDD(portDD)}
                                    </td>
                                    <td className="p-3 text-right tabular-nums text-slate-500">
                                        {formatDD(spyDD)}
                                    </td>
                                </tr>
                            );
                        })}
                    </tbody>
                </table>
            </div>
        </div>
    );
};

export const MonthlyTable: React.FC<{ stats: PortfolioStats }> = ({ stats }) => {
    // Sort years Ascending (Oldest First)
    const years = Object.keys(stats.monthlyReturns).map(Number).sort((a,b) => a - b);
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    
    const getCellColor = (val: number | undefined) => {
        if (val === undefined) return 'text-slate-300';
        return val >= 0 ? 'text-slate-800' : 'text-red-600 font-medium';
    };

    // Calculate Averages
    const monthlyAvgs = Array(12).fill(0);
    const monthlyCounts = Array(12).fill(0);
    let totalAnnualSum = 0;
    let totalAnnualCount = 0;
    let maxDDSum = 0;
    let maxDDCount = 0;

    years.forEach(year => {
        // Monthly
        months.forEach((_, mIdx) => {
            const val = stats.monthlyReturns[year][mIdx];
            if (val !== undefined) {
                monthlyAvgs[mIdx] += val;
                monthlyCounts[mIdx]++;
            }
        });
        // Total
        if (stats.annualReturns[year] !== undefined) {
            totalAnnualSum += stats.annualReturns[year];
            totalAnnualCount++;
        }
        // MaxDD
        if (stats.annualMaxDrawdowns && stats.annualMaxDrawdowns[year] !== undefined) {
            maxDDSum += stats.annualMaxDrawdowns[year];
            maxDDCount++;
        }
    });

    const avgMonthly = monthlyAvgs.map((sum, i) => monthlyCounts[i] > 0 ? sum / monthlyCounts[i] : undefined);
    const avgTotal = totalAnnualCount > 0 ? totalAnnualSum / totalAnnualCount : undefined;
    const avgMaxDD = maxDDCount > 0 ? maxDDSum / maxDDCount : undefined;

    return (
        <div className="mt-8 overflow-x-auto">
            <h4 className="text-sm font-bold text-slate-800 mb-4">Monthly Returns</h4>
            <div className="border border-slate-200 rounded-lg overflow-hidden">
                <table className="w-full text-xs text-right border-collapse bg-white">
                    <thead className="bg-slate-50 text-slate-500 uppercase tracking-wider">
                        <tr>
                            <th className="p-3 text-left font-semibold border-b border-slate-200">Year</th>
                            {months.map(m => <th key={m} className="p-3 font-semibold border-b border-slate-200">{m}</th>)}
                            <th className="p-3 font-bold text-slate-700 border-b border-slate-200 bg-slate-100">Total</th>
                            <th className="p-3 font-bold text-slate-700 border-b border-slate-200 bg-slate-50">Max DD</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                        {years.map(year => {
                            const rowData = stats.monthlyReturns[year];
                            const total = stats.annualReturns[year];
                            const maxDD = stats.annualMaxDrawdowns ? stats.annualMaxDrawdowns[year] : 0;
                            
                            return (
                                <tr key={year} className="hover:bg-slate-50 transition-colors">
                                    <td className="p-3 text-left font-bold text-slate-700 bg-slate-50/50 border-r border-slate-100">{year}</td>
                                    {months.map((_, idx) => {
                                        const val = rowData[idx];
                                        return (
                                            <td key={idx} className={`p-3 tabular-nums border-r border-slate-50 ${getCellColor(val)}`}>
                                                {val !== undefined ? `${(val * 100).toFixed(1)}%` : '-'}
                                            </td>
                                        );
                                    })}
                                    <td className={`p-3 tabular-nums font-bold bg-slate-50 border-r border-slate-100 ${getCellColor(total)}`}>
                                        {(total * 100).toFixed(1)}%
                                    </td>
                                    <td className="p-3 tabular-nums text-red-600">
                                        {maxDD > 0 ? `-${(maxDD * 100).toFixed(1)}%` : '-'}
                                    </td>
                                </tr>
                            );
                        })}
                        {/* Average Row */}
                        <tr className="bg-slate-100 font-bold border-t-2 border-slate-200">
                            <td className="p-3 text-left text-slate-700 border-r border-slate-200">AVG</td>
                            {avgMonthly.map((val, idx) => (
                                <td key={idx} className={`p-3 tabular-nums border-r border-slate-200 ${getCellColor(val)}`}>
                                    {val !== undefined ? `${(val * 100).toFixed(1)}%` : '-'}
                                </td>
                            ))}
                            <td className={`p-3 tabular-nums border-r border-slate-200 ${getCellColor(avgTotal)}`}>
                                {avgTotal !== undefined ? `${(avgTotal * 100).toFixed(1)}%` : '-'}
                            </td>
                            <td className="p-3 tabular-nums text-red-700">
                                {avgMaxDD !== undefined ? `-${(avgMaxDD * 100).toFixed(1)}%` : '-'}
                            </td>
                        </tr>
                    </tbody>
                </table>
            </div>
        </div>
    );
};