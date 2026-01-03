import React, { useEffect, useState, useMemo } from 'react';
import { DollarSign, Info, ShoppingCart, Loader2, BarChart2, ArrowRight, Check, Tag } from 'lucide-react';
import { StrategyList } from './components/StrategyList';
import { FileUpload } from './components/FileUpload';
import { EquityChart, DrawdownChart, AnnualReturnsChart, AllocationPieChart } from './components/Charts';
import { StatsGrid, CorrelationMatrix, MonthlyTable, StressPeriodsTable } from './components/StatsGrid';
import { calculateStats, normalizeDate } from './services/financeService';
import { Strategy, BUILT_IN_STRATEGIES, SPY_URL, SimulationResult } from './types';

// Initial Palette
const COLORS = ['#3b82f6', '#8b5cf6', '#10b981', '#f59e0b', '#ef4444', '#ec4899', '#6366f1', '#14b8a6'];

export default function App() {
  const [strategies, setStrategies] = useState<Strategy[]>([]);
  const [allocations, setAllocations] = useState<Record<string, number>>({});
  
  // Use strings for inputs to allow clearing "0" easily
  const [initialBalanceStr, setInitialBalanceStr] = useState("100000");
  const [monthlyContributionStr, setMonthlyContributionStr] = useState("0");
  const [contributionFreq, setContributionFreq] = useState("monthly");

  // Chart State - Log Scale Default is TRUE now
  const [isLogScale] = useState(true);

  // Derived numeric settings
  const settings = useMemo(() => ({
      initialBalance: Number(initialBalanceStr) || 0,
      monthlyContribution: Number(monthlyContributionStr) || 0
  }), [initialBalanceStr, monthlyContributionStr]);

  const [spyData, setSpyData] = useState<Map<string, number> | null>(null);
  const [loading, setLoading] = useState(true);
  const [isCheckingOut, setIsCheckingOut] = useState(false);
  
  // Load initial data
  useEffect(() => {
    const loadData = async () => {
      try {
        // 1. Load Built-ins
        const builtInPromises = BUILT_IN_STRATEGIES.map(async (s: any, idx) => {
          try {
            const res = await fetch(s.url);
            const json = await res.json() as any[];
            const dataMap = new Map<string, number>();
            
            json.forEach((row: any) => {
              const d = normalizeDate(String(row['Date']));
              const eq = parseFloat(String(row['Equity']));
              if (d && !isNaN(eq)) dataMap.set(d, eq);
            });

            return {
              id: `bi-${idx}`,
              name: s.name,
              color: COLORS[idx % COLORS.length],
              isBuiltIn: true,
              data: dataMap,
              price: s.price,
              infoUrl: s.info
            } as Strategy;
          } catch (e) {
            console.error(`Failed to load strategy ${s.name}`, e);
            return null;
          }
        });

        // 2. Load SPY
        const spyPromise = fetch(SPY_URL).then(res => res.json()).then((json: any) => {
          const map = new Map<string, number>();
          json.forEach((row: any) => {
            const d = normalizeDate(String(row['Date']));
            const eq = parseFloat(String(row['Equity']));
            if (d && !isNaN(eq)) map.set(d, eq);
          });
          return map;
        }).catch(e => {
            console.error("Failed to load SPY", e);
            return null;
        });

        const [loadedStrategies, loadedSpy] = await Promise.all([
            Promise.all(builtInPromises),
            spyPromise
        ]);

        // Filter out failed loads
        setStrategies(loadedStrategies.filter((s): s is Strategy => s !== null));
        setSpyData(loadedSpy);
        setLoading(false);
      } catch (e) {
        console.error("Failed to load initial data", e);
        setLoading(false);
      }
    };
    loadData();
  }, []);

  // Handle User Upload
  const handleUpload = (name: string, data: Map<string, number>) => {
    const newId = `u-${Date.now()}`;
    const newStrategy: Strategy = {
      id: newId,
      name: name,
      data: data,
      color: COLORS[(strategies.length) % COLORS.length],
      isBuiltIn: false
    };
    setStrategies(prev => [...prev, newStrategy]);
    setAllocations(prev => ({ ...prev, [newId]: 0 })); // Start with 0 alloc
  };

  // Simulation Logic
  const simulation = useMemo<SimulationResult | null>(() => {
    if (loading || strategies.length === 0) return null;

    const activeIds = Object.keys(allocations).filter(id => (allocations[id] || 0) > 0);
    if (activeIds.length === 0) return null;

    const activeStrategies = strategies.filter(s => activeIds.includes(s.id));
    
    // Convert allocations to weights (0.0 to 1.0)
    const strategyWeights = activeStrategies.map(s => (allocations[s.id] || 0) / 100);

    // 1. Determine Global Time Window
    let maxStartDate = '';
    const allDatesSet = new Set<string>();

    activeStrategies.forEach(s => {
        const dates = Array.from(s.data.keys()).sort();
        if (dates.length === 0) return;
        const sStart = dates[0];
        if (sStart > maxStartDate) maxStartDate = sStart;
        dates.forEach(d => allDatesSet.add(d));
    });

    if (spyData) {
        Array.from(spyData.keys()).forEach(d => allDatesSet.add(d));
    }

    const masterTimeline = Array.from(allDatesSet)
        .filter(d => d >= maxStartDate)
        .sort();

    if (masterTimeline.length < 2) return null;

    // 2. Initialize Simulation Variables
    const startBalance = settings.initialBalance;
    const lastPrices: number[] = activeStrategies.map(s => {
        let p = s.data.get(masterTimeline[0]);
        if (p === undefined) {
             const sortedDates = Array.from(s.data.keys()).sort();
             const firstIdx = sortedDates.findIndex(d => d >= masterTimeline[0]);
             if (firstIdx !== -1) p = s.data.get(sortedDates[firstIdx]);
        }
        return p || 1;
    });

    const combinedEquity: number[] = [startBalance];
    const twrEquity: number[] = [100];
    const strategyEquities: number[][] = activeStrategies.map(() => []);
    const spyEquity: number[] = [];

    let spyLastPrice = 0;
    const spyStartPrice = spyData?.get(masterTimeline[0]) || 
                          (spyData ? Array.from(spyData.entries()).find(([d]) => d >= masterTimeline[0])?.[1] : 0) || 0;
    if (spyStartPrice > 0) spyLastPrice = spyStartPrice;
    const spyFactor = spyStartPrice > 0 ? startBalance / spyStartPrice : 0;
    if (spyStartPrice > 0) spyEquity.push(startBalance);

    let currentMonth = new Date(masterTimeline[0]).getMonth();

    activeStrategies.forEach((_, idx) => {
        const allocDollar = startBalance * strategyWeights[idx];
        strategyEquities[idx].push(allocDollar > 0 ? allocDollar : startBalance); 
    });

    // 3. Iterate Daily Returns
    for (let i = 1; i < masterTimeline.length; i++) {
        const date = masterTimeline[i];
        let weightedDayReturn = 0;
        
        activeStrategies.forEach((s, idx) => {
            let currPrice = s.data.get(date);
            if (currPrice === undefined) {
                currPrice = lastPrices[idx];
            }
            
            const prevPrice = lastPrices[idx];
            let dailyRet = 0;
            if (prevPrice > 0) {
                dailyRet = (currPrice - prevPrice) / prevPrice;
            }
            
            weightedDayReturn += dailyRet * strategyWeights[idx];
            lastPrices[idx] = currPrice;

            const prevStratEq = strategyEquities[idx][i-1];
            strategyEquities[idx].push(prevStratEq * (1 + dailyRet));
        });

        const prevTWR = twrEquity[i-1];
        twrEquity.push(prevTWR * (1 + weightedDayReturn));

        const dObj = new Date(date);
        const thisMonth = dObj.getMonth();
        
        let injectionAmount = 0;
        
        // Check for new month and frequency
        if (thisMonth !== currentMonth) {
            let shouldInject = false;
            
            if (contributionFreq === 'monthly') {
                shouldInject = true;
            } else if (contributionFreq === 'quarterly') {
                // Inject at start of Jan, Apr, Jul, Oct
                shouldInject = (thisMonth % 3 === 0);
            } else if (contributionFreq === 'semi-annually') {
                // Inject at start of Jan, Jul
                shouldInject = (thisMonth % 6 === 0);
            } else if (contributionFreq === 'annually') {
                // Inject at start of Jan
                shouldInject = (thisMonth === 0);
            }

            if (shouldInject) {
                injectionAmount = settings.monthlyContribution;
            }
            currentMonth = thisMonth;
        }

        const prevBalance = combinedEquity[i-1];
        const newBalance = (prevBalance * (1 + weightedDayReturn)) + injectionAmount;
        combinedEquity.push(newBalance);

        const sPrice = spyData?.get(date);
        if (sPrice !== undefined) spyLastPrice = sPrice;
        spyEquity.push(spyLastPrice * spyFactor);
    }

    const stats = calculateStats(twrEquity, masterTimeline);
    stats.finalBalance = combinedEquity[combinedEquity.length - 1];
    stats.totalReturn = (combinedEquity[combinedEquity.length - 1] - startBalance) / startBalance;
    
    const spyStats = calculateStats(spyEquity, masterTimeline);

    const calculateDD = (curve: number[]) => {
        let peak = -Infinity;
        return curve.map(val => {
            if (val > peak) peak = val;
            return peak > 0 ? ((val - peak) / peak) * 100 : 0;
        });
    };

    const combinedDD = calculateDD(combinedEquity);
    const spyDD = calculateDD(spyEquity);

    const chartData = masterTimeline.map((date, i) => {
        const pt: any = {
            date,
            timestamp: new Date(date).getTime(),
            combined: combinedEquity[i],
            spy: spyEquity[i],
            combinedDD: combinedDD[i],
            spyDD: spyDD[i]
        };
        activeStrategies.forEach((s, sIdx) => {
            pt[s.id] = strategyEquities[sIdx][i];
        });
        return pt;
    });

    return {
        dates: masterTimeline,
        timestamps: masterTimeline.map(d => new Date(d).getTime()),
        combinedEquity,
        strategyEquities,
        spyEquity,
        stats,
        spyStats,
        chartData,
        activeStrategies
    } as unknown as SimulationResult; 

  }, [strategies, allocations, settings, spyData, loading, contributionFreq]);

  const totalAllocation = Object.values(allocations).reduce((a: number, b: number) => a + b, 0);

  // Discount Logic Refined (Only count priced strategies)
  const pricedStrategies = strategies.filter(s => (allocations[s.id] || 0) > 0 && s.price && s.price > 0);
  const countForDiscount = pricedStrategies.length;

  const originalPrice = pricedStrategies.reduce((sum, s) => sum + (s.price || 0), 0);

  let discount = 0;
  let nextTierMsg = "";
  let bannerColorClass = "text-slate-400";
  let bannerBgClass = "bg-slate-800";

  if (countForDiscount > 0) {
    if (countForDiscount < 4) {
        const needed = 4 - countForDiscount;
        discount = 0;
        nextTierMsg = `Add ${needed} more strategy${needed > 1 ? 'ies' : ''} to save 20%`;
        bannerColorClass = "text-blue-300";
        bannerBgClass = "bg-blue-900/40 border-blue-700/50";
    } else if (countForDiscount >= 4 && countForDiscount < 6) {
        discount = 0.20;
        const needed = 6 - countForDiscount;
        nextTierMsg = `20% Discount Active! Add ${needed} more to save 30%`;
        bannerColorClass = "text-amber-300";
        bannerBgClass = "bg-amber-900/40 border-amber-700/50";
    } else {
        discount = 0.30;
        nextTierMsg = "Maximum 30% Discount Unlocked! 🎉";
        bannerColorClass = "text-emerald-300";
        bannerBgClass = "bg-emerald-900/40 border-emerald-700/50";
    }
  }

  const finalPrice = originalPrice * (1 - discount);

  // Helper to extract variant ID from info URL
  const extractVariantId = (url: string) => {
    const match = url.match(/[?&]variant=(\d+)/);
    return match ? match[1] : null;
  };

  // Checkout Logic
  const handleCheckout = async () => {
    setIsCheckingOut(true);
    
    // 1. Prepare items for Shopify Cart
    const itemsToBuy = pricedStrategies.map(s => {
        const variantId = s.infoUrl ? extractVariantId(s.infoUrl) : null;
        return {
            id: variantId,
            quantity: 1
        };
    }).filter(item => item.id); // Filter out strategies without variant ID

    if (itemsToBuy.length === 0) {
        alert("No strategies available for purchase.");
        setIsCheckingOut(false);
        return;
    }

    try {
        // 2. Add items to Shopify Cart via AJAX API
        const response = await fetch('/cart/add.js', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ items: itemsToBuy })
        });

        if (!response.ok) {
            throw new Error("Failed to add items to cart");
        }

        // 3. Redirect to Checkout
        window.location.href = '/checkout';

    } catch (error) {
        console.error("Checkout failed", error);
        alert("There was an error proceeding to checkout. Please try again.");
        setIsCheckingOut(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col bg-slate-50 font-sans text-slate-900">
      
      <main className="flex-1 max-w-[1600px] w-full mx-auto p-4 md:p-6 grid grid-cols-1 lg:grid-cols-12 gap-8 print:block print:p-0 print:max-w-none">
        
        {/* Sidebar - Hidden during Print */}
        <aside className="lg:col-span-3 print:hidden">
            <div className="sticky top-6 space-y-6 max-h-[calc(100vh-3rem)] overflow-y-auto custom-scrollbar pr-1">
                
                {/* Capital Settings */}
                <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-5">
                    <h3 className="font-semibold text-slate-800 mb-4 flex items-center gap-2">
                        <DollarSign size={18} className="text-blue-500"/>
                        Capital Settings
                    </h3>
                    <div className="space-y-4">
                        <div>
                            <label className="block text-xs font-medium text-slate-500 mb-1">Starting Balance</label>
                            <div className="flex items-center bg-slate-900 border border-slate-700 rounded-lg focus-within:ring-2 focus-within:ring-blue-500 focus-within:border-blue-500 transition-shadow shadow-inner overflow-hidden">
                                <span className="pl-3 text-slate-400 text-xs select-none">$</span>
                                <input 
                                    type="number" 
                                    value={initialBalanceStr}
                                    onChange={(e) => setInitialBalanceStr(e.target.value)}
                                    onFocus={(e) => e.target.value === '0' && setInitialBalanceStr('')}
                                    onBlur={(e) => e.target.value === '' && setInitialBalanceStr('0')}
                                    className="w-full pl-1 pr-3 py-2 bg-transparent border-none focus:ring-0 text-sm tabular-nums text-white placeholder-slate-500 outline-none"
                                />
                            </div>
                        </div>
                        <div>
                            <div className="flex justify-between items-center mb-1">
                                <label className="block text-xs font-medium text-slate-500">Recurring Cash Flow</label>
                                <select 
                                    value={contributionFreq}
                                    onChange={(e) => setContributionFreq(e.target.value)}
                                    className="text-xs bg-slate-100 border-none rounded px-2 py-1 text-slate-700 outline-none focus:ring-0 cursor-pointer"
                                >
                                    <option value="monthly">Monthly</option>
                                    <option value="quarterly">Quarterly</option>
                                    <option value="semi-annually">Semi-Annually</option>
                                    <option value="annually">Annually</option>
                                </select>
                            </div>
                            <div className="flex items-center bg-slate-900 border border-slate-700 rounded-lg focus-within:ring-2 focus-within:ring-blue-500 focus-within:border-blue-500 transition-shadow shadow-inner overflow-hidden">
                                <span className="pl-3 text-slate-400 text-xs select-none">$</span>
                                <input 
                                    type="number" 
                                    value={monthlyContributionStr}
                                    onChange={(e) => setMonthlyContributionStr(e.target.value)}
                                    onFocus={(e) => e.target.value === '0' && setMonthlyContributionStr('')}
                                    onBlur={(e) => e.target.value === '' && setMonthlyContributionStr('0')}
                                    className="w-full pl-1 pr-3 py-2 bg-transparent border-none focus:ring-0 text-sm tabular-nums text-white placeholder-slate-500 outline-none"
                                />
                            </div>
                            <p className="text-[10px] text-slate-400 mt-2 flex items-center gap-1">
                                <Info size={10} /> Positive to add, negative to withdraw.
                            </p>
                        </div>
                    </div>
                </div>
                
                <FileUpload onDataLoaded={handleUpload} />

                <StrategyList 
                    strategies={strategies} 
                    allocations={allocations}
                    totalAllocation={totalAllocation}
                    onAllocationChange={(id, val) => setAllocations(prev => ({...prev, [id]: val}))}
                    onRemoveStrategy={(id) => {
                        setStrategies(prev => prev.filter(s => s.id !== id));
                        setAllocations(prev => { const n = {...prev}; delete n[id]; return n; });
                    }}
                    onReset={() => {
                        const reset = {} as Record<string, number>;
                        strategies.forEach(s => reset[s.id] = 0);
                        setAllocations(reset);
                    }}
                    onEqualWeight={() => {
                        const activeCount = Object.keys(allocations).filter(k => (allocations[k] || 0) > 0).length;
                        if (activeCount === 0) return alert("Select at least one strategy (>0%) to equalize.");
                        const w = Math.floor(100 / activeCount);
                        const next = {...allocations};
                        let rem = 100 - (w * activeCount);
                        Object.keys(next).forEach(k => {
                            if (next[k] > 0) {
                                next[k] = w + (rem > 0 ? 1 : 0);
                                rem--;
                            }
                        });
                        setAllocations(next);
                    }}
                />
            </div>
        </aside>

        {/* Report Section */}
        <section 
            id="report-content" 
            className="lg:col-span-9 space-y-6 print:col-span-12 print:space-y-6"
        >
            
            {/* Print Header (Visible only in Print) */}
            <div className="hidden print:block mb-8 break-inside-avoid">
                <div className="flex justify-between items-end border-b-2 border-slate-800 pb-4">
                    <div>
                        <h1 className="text-2xl font-extrabold text-slate-900">Portfolio Analysis Report</h1>
                        <p className="text-slate-500 text-xs mt-1">Generated via Portfolio Architect</p>
                    </div>
                    <div className="text-right">
                        <p className="text-[10px] text-slate-500 uppercase font-bold">Report Date</p>
                        <p className="font-bold text-slate-900">{new Date().toLocaleDateString()}</p>
                    </div>
                </div>
            </div>

            {simulation ? (
                <>
                    {/* Main Equity Chart */}
                    <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6 break-inside-avoid">
                        <div className="flex justify-between items-center mb-6">
                            <h2 className="text-lg font-bold text-slate-800">Portfolio Growth</h2>
                            <div className="flex items-center gap-4">
                                <div className="hidden sm:flex items-center gap-2 px-3 py-1 bg-slate-50 border border-slate-200 rounded-md print:hidden">
                                    <BarChart2 size={12} className="text-slate-500"/>
                                    <span className="text-xs font-medium text-slate-600">Log Scale</span>
                                </div>
                                <div className="hidden sm:flex items-center gap-2 px-3 py-1 bg-slate-50 border border-slate-200 rounded-md print:hidden">
                                    <div className="w-2 h-2 rounded-full bg-[#111827]"></div>
                                    <span className="text-xs font-medium text-slate-600">Combined</span>
                                </div>
                            </div>
                        </div>
                        <EquityChart 
                            data={simulation.chartData} 
                            strategies={strategies.filter(s => (allocations[s.id] || 0) > 0)}
                            showSpy={true}
                            isLogScale={isLogScale}
                        />
                    </div>

                    {/* Stats Table */}
                    <div className="break-inside-avoid">
                        <StatsGrid stats={simulation.stats} spyStats={simulation.spyStats} />
                    </div>

                    {/* Stress Periods Table (NEW) */}
                    <div className="break-inside-avoid">
                        <StressPeriodsTable 
                            dates={simulation.dates}
                            combinedEquity={simulation.combinedEquity}
                            spyEquity={simulation.spyEquity}
                        />
                    </div>

                    {/* Drawdown & Annual Return Charts */}
                    <div className="grid grid-cols-1 xl:grid-cols-2 gap-6 print:grid-cols-1 print:gap-8 mt-6">
                        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6 break-inside-avoid">
                             <DrawdownChart data={simulation.chartData} showSpy={true} />
                        </div>
                        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6 break-inside-avoid">
                             <AnnualReturnsChart 
                                portfolioReturns={simulation.stats.annualReturns} 
                                spyReturns={simulation.spyStats?.annualReturns || {}} 
                             />
                        </div>
                    </div>

                    {/* Correlation & Monthly Returns */}
                    <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6 break-before-page mt-6">
                         <div className="break-inside-avoid mb-8">
                            <CorrelationMatrix 
                                strategies={strategies.filter(s => (allocations[s.id] || 0) > 0)} 
                            />
                         </div>
                         <div className="break-inside-avoid">
                             <MonthlyTable stats={simulation.stats} />
                         </div>
                    </div>
                    
                    {/* On-screen Allocation Summary (Bottom) */}
                    <div className="bg-slate-50 border border-slate-200 rounded-xl p-6 print:bg-white print:border-0 print:p-0 break-inside-avoid mt-6">
                        <h3 className="font-bold text-slate-800 mb-6">Allocation Summary</h3>
                         <div className="grid grid-cols-1 md:grid-cols-2 gap-8 items-center">
                             {/* Pie Chart Visual */}
                             <div className="flex justify-center border-r border-slate-200 pr-8">
                                 <AllocationPieChart strategies={strategies} allocations={allocations} />
                             </div>
                             
                             {/* Detailed Table */}
                             <div className="overflow-x-auto">
                                <table className="w-full text-sm text-left">
                                    <thead className="text-slate-500 border-b border-slate-200">
                                        <tr>
                                            <th className="pb-2 font-medium">Strategy</th>
                                            <th className="pb-2 font-medium text-right">Allocation</th>
                                            <th className="pb-2 font-medium text-right">Capital</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-200">
                                        {strategies.filter(s => (allocations[s.id] || 0) > 0).map(s => (
                                            <tr key={s.id}>
                                                <td className="py-3 font-medium text-slate-700 flex items-center gap-2">
                                                    <div className="w-2 h-2 rounded-full" style={{backgroundColor: s.color}}></div>
                                                    {s.name}
                                                </td>
                                                <td className="py-3 text-right text-slate-600 tabular-nums">{allocations[s.id]}%</td>
                                                <td className="py-3 text-right tabular-nums text-slate-600">
                                                    ${(settings.initialBalance * ((allocations[s.id] || 0) / 100)).toLocaleString()}
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                    <tfoot className="border-t border-slate-200">
                                        <tr>
                                            <td className="py-3 font-bold text-slate-800">Total</td>
                                            <td className="py-3 text-right font-bold text-slate-800">{totalAllocation}%</td>
                                            <td className="py-3 text-right font-bold text-slate-800 tabular-nums">
                                                ${(settings.initialBalance * (totalAllocation/100)).toLocaleString()}
                                            </td>
                                        </tr>
                                    </tfoot>
                                </table>
                             </div>
                         </div>
                    </div>
                    
                    {/* Cost Section - New Buying Area */}
                    {originalPrice > 0 && (
                        <div className="bg-slate-900 rounded-xl shadow-xl overflow-hidden print:hidden mt-8 border border-slate-700">
                            {/* Header / Upsell Banner */}
                            <div className={`${bannerBgClass} ${bannerColorClass} px-6 py-3 text-sm font-semibold flex items-center justify-between border-b border-white/5`}>
                                <div className="flex items-center gap-2">
                                    <Tag size={16} />
                                    <span>{countForDiscount} Paid Strateg{countForDiscount === 1 ? 'y' : 'ies'} Selected</span>
                                </div>
                                <span className="flex items-center gap-2">
                                    {countForDiscount < 6 && <Info size={14} />}
                                    {nextTierMsg}
                                </span>
                            </div>

                            <div className="p-6 grid grid-cols-1 md:grid-cols-3 gap-8">
                                {/* Left: Selected Items List */}
                                <div className="md:col-span-2 space-y-4">
                                     <h3 className="text-white font-bold text-lg flex items-center gap-2">
                                        <ShoppingCart className="text-blue-500" size={20}/>
                                        Your Selection
                                     </h3>
                                     <div className="bg-slate-800/50 rounded-lg p-4 space-y-3 max-h-[200px] overflow-y-auto custom-scrollbar border border-white/5">
                                        {pricedStrategies.map(s => (
                                            <div key={s.id} className="flex justify-between items-center text-sm">
                                                <div className="flex items-center gap-3">
                                                    <div className="w-2 h-2 rounded-full" style={{backgroundColor: s.color}}></div>
                                                    <span className="text-slate-200 font-medium">{s.name}</span>
                                                </div>
                                                <span className="text-slate-400 tabular-nums">${s.price}</span>
                                            </div>
                                        ))}
                                     </div>
                                </div>

                                {/* Right: Totals & Action */}
                                <div className="flex flex-col justify-between bg-slate-800/30 rounded-lg p-5 border border-white/5">
                                    <div className="space-y-3">
                                        <div className="flex justify-between text-slate-400 text-sm">
                                            <span>Subtotal</span>
                                            <span className="tabular-nums">${originalPrice.toLocaleString()}</span>
                                        </div>
                                        {discount > 0 && (
                                            <div className="flex justify-between text-emerald-400 text-sm font-medium">
                                                <span>Discount ({(discount*100).toFixed(0)}%)</span>
                                                <span className="tabular-nums">-${Math.round(originalPrice * discount).toLocaleString()}</span>
                                            </div>
                                        )}
                                        <div className="h-px bg-white/10 my-2"></div>
                                        <div className="flex justify-between text-white text-xl font-bold">
                                            <span>Total</span>
                                            <span className="tabular-nums">${Math.round(finalPrice).toLocaleString()}</span>
                                        </div>
                                    </div>
                                    
                                    <button 
                                        onClick={handleCheckout}
                                        disabled={isCheckingOut}
                                        className="w-full mt-6 bg-blue-600 hover:bg-blue-500 text-white font-bold py-3.5 rounded-lg transition-all transform active:scale-[0.98] shadow-lg shadow-blue-900/20 flex items-center justify-center gap-2 group disabled:opacity-70 disabled:cursor-not-allowed"
                                    >
                                        {isCheckingOut ? (
                                            <>
                                                <Loader2 size={18} className="animate-spin" />
                                                <span>Processing...</span>
                                            </>
                                        ) : (
                                            <>
                                                <span>Proceed to Checkout</span>
                                                <ArrowRight size={18} className="group-hover:translate-x-1 transition-transform" />
                                            </>
                                        )}
                                    </button>
                                     <p className="text-center text-[10px] text-slate-500 mt-3 flex items-center justify-center gap-1">
                                        <Check size={10} /> Secure payment. Instant access.
                                    </p>
                                </div>
                            </div>
                        </div>
                    )}
                </>
            ) : (
                <div className="h-[60vh] flex flex-col items-center justify-center text-slate-400 border-2 border-dashed border-slate-200 rounded-xl bg-slate-50/50">
                    <div className="bg-white p-4 rounded-full shadow-sm mb-4">
                        <Info size={32} className="text-blue-500" />
                    </div>
                    <h3 className="text-lg font-semibold text-slate-700">Portfolio Simulation</h3>
                    <p className="text-sm mt-2 max-w-md text-center text-slate-500">
                        Select strategies from the sidebar or upload your own CSV to generate a professional backtest report.
                    </p>
                </div>
            )}
        </section>
      </main>
    </div>
  );
}