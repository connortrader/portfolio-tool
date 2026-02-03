import React, { useEffect, useState, useMemo } from 'react';
import { Info, Loader2, BarChart2, ArrowRight, Check } from 'lucide-react';
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


    // Chart State - Log Scale Default is TRUE now
    const [isLogScale] = useState(true);

    // Rebalancing Frequency
    const [rebalanceFreq, setRebalanceFreq] = useState("monthly");

    // Derived numeric settings
    const settings = useMemo(() => ({
        initialBalance: Number(initialBalanceStr) || 0
    }), [initialBalanceStr]);

    const [spyData, setSpyData] = useState<Map<string, number> | null>(null);
    const [loading, setLoading] = useState(true);
    const [isCheckingOut, setIsCheckingOut] = useState(false);

    // DEFERRED VALUES for performance
    // This allows the sliders to be snappy while the heavy simulation logic runs in the background
    const deferredAllocations = React.useDeferredValue(allocations);
    const deferredSettings = React.useDeferredValue(settings);
    const deferredRebalanceFreq = React.useDeferredValue(rebalanceFreq);

    // Shopify iFrame Resizer Logic - Robust Version
    useEffect(() => {
        const sendHeight = () => {
            // Use offsetHeight of the main wrapper for the most accurate content height
            const wrapper = document.getElementById('app-wrapper');
            if (wrapper) {
                // Measure the actual rendered height including any bottom margin/padding
                const height = wrapper.getBoundingClientRect().height + 40;
                window.parent.postMessage({ type: 'resize', height }, '*');
            }
        };

        // 1. Initial Send
        sendHeight();

        // 2. Observer for content/DOM changes
        const mutationObserver = new MutationObserver(sendHeight);

        // 3. ResizeObserver for fluid changes (like charts resizing)
        const resizeObserver = new ResizeObserver(sendHeight);

        const wrapper = document.getElementById('app-wrapper');
        if (wrapper) {
            mutationObserver.observe(wrapper, { attributes: true, childList: true, subtree: true });
            resizeObserver.observe(wrapper);
        }

        // 4. Window resize listener
        window.addEventListener('resize', sendHeight);

        // 5. Periodic check (last resort)
        const interval = setInterval(sendHeight, 500);

        return () => {
            mutationObserver.disconnect();
            resizeObserver.disconnect();
            window.removeEventListener('resize', sendHeight);
            clearInterval(interval);
        };
    }, []);

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

    // pSEO: Handle URL Parameters (?strat=Name1,Name2&weights=50,50)
    useEffect(() => {
        if (!loading && strategies.length > 0) {
            const params = new URLSearchParams(window.location.search);
            const stratParam = params.get('strat');
            const weightsParam = params.get('weights');

            if (stratParam && weightsParam) {
                const stratNames = stratParam.split(',').map(s => decodeURIComponent(s.trim()).toLowerCase());
                const weightValues = weightsParam.split(',').map(Number);
                
                const newAllocations: Record<string, number> = {};
                
                stratNames.forEach((name, idx) => {
                    const found = strategies.find(s => s.name.toLowerCase() === name);
                    if (found && !isNaN(weightValues[idx])) {
                        newAllocations[found.id] = weightValues[idx];
                    }
                });

                if (Object.keys(newAllocations).length > 0) {
                    setAllocations(newAllocations);
                    console.log('pSEO: Applied allocations from URL', newAllocations);
                }
            }
        }
    }, [loading, strategies]);

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

    // 3. Pre-parse master timeline for speed
    const parsedTimeline = useMemo(() => {
        if (loading || strategies.length === 0) return [];
        // Determine global window once
        let maxStartDate: string = '';
        const allDatesSet = new Set<string>();

        strategies.forEach((s: Strategy) => {
            // Only consider dates from ACTIVE strategies. 
            // This prevents inactive strategies (uploaded CSVs with different dates) from corrupting the timeline with "flat" days.
            if ((allocations[s.id] || 0) > 0) {
                const dates = Array.from(s.data.keys()) as string[];

                // Track Max Start Date for the subset of active strategies
                if (dates.length > 0) {
                    const firstDate = dates[0];
                    if (firstDate > maxStartDate) maxStartDate = firstDate;
                }

                // Add these dates to the set
                dates.forEach((d: string) => allDatesSet.add(d));
            }
        });

        // Optimization: Do NOT add SPY dates to the master timeline. 
        // If SPY has dates that the strategy doesn't (excess holidays/data noise), it dilutes strategy returns.
        // We only want to simulate on days where we actually have strategy decisions/data.
        // if (spyData) Array.from(spyData.keys()).forEach((d: string) => allDatesSet.add(d));

        // If no active strategies, rely on all available dates (or min date)? 
        // If maxStartDate is still empty (no active strategies), find the EARLIEST date of any strategy?
        // But simulation doesn't run if no active strategies.
        // Let's ensure maxStartDate is correctly set if user hasn't selected anything yet (preview mode).
        // Actually, if nothing selected, simulation returns null anyway.

        return (Array.from(allDatesSet) as string[])
            .filter((d: string) => d >= maxStartDate)
            .sort()
            .map(date => {
                const dObj = new Date(date);
                return {
                    date,
                    timestamp: dObj.getTime(),
                    month: dObj.getMonth(),
                    year: dObj.getFullYear()
                };
            });
    }, [strategies, spyData, loading, allocations]);

    // Simulation Logic
    const simulation = useMemo<SimulationResult | null>(() => {
        if (loading || strategies.length === 0 || parsedTimeline.length < 2) return null;

        const activeIds = Object.keys(deferredAllocations).filter(id => (deferredAllocations[id] || 0) > 0);
        if (activeIds.length === 0) return null;

        const activeStrategies = strategies.filter(s => activeIds.includes(s.id));
        const strategyWeights = activeStrategies.map(s => (deferredAllocations[s.id] || 0) / 100);
        const totalAllocatedWeight = strategyWeights.reduce((a, b) => a + b, 0);

        // 2. Initialize Simulation Variables
        const startBalance = deferredSettings.initialBalance;

        // Track allocations in dollars for drift
        let currentStratBalances = activeStrategies.map((_, idx) => startBalance * strategyWeights[idx]);
        let currentCashBalance = startBalance * (1 - totalAllocatedWeight);

        const lastPrices: number[] = activeStrategies.map(s => {
            let p = s.data.get(parsedTimeline[0].date);
            if (p === undefined) p = Array.from(s.data.entries()).find(([d]) => d >= parsedTimeline[0].date)?.[1];
            return p || 1;
        });

        const combinedEquityIdx: number[] = [startBalance];
        const twrEquityIdx: number[] = [100];

        const strategyEquitiesIdx: number[][] = activeStrategies.map((_, idx) => [currentStratBalances[idx]]);
        const spyEquityIdx: number[] = [];

        let spyLastPrice = 0;
        const spyStartPrice = spyData?.get(parsedTimeline[0].date) ||
            (spyData ? Array.from(spyData.entries()).find(([d]) => d >= parsedTimeline[0].date)?.[1] : 0) || 0;

        if (spyStartPrice > 0) spyLastPrice = spyStartPrice;
        const spyFactor = spyStartPrice > 0 ? startBalance / spyStartPrice : 0;
        if (spyStartPrice > 0) spyEquityIdx.push(startBalance);

        let currentMonth = parsedTimeline[0].month;
        let currentYear = parsedTimeline[0].year;

        // 3. Iterate Daily Returns
        for (let i = 1; i < parsedTimeline.length; i++) {
            const { date, month, year } = parsedTimeline[i];

            // 1. Calculate Market Returns & Update Balances (Drift)
            let dailyTotalStrategies = 0;
            const prevTotalBalance = combinedEquityIdx[i - 1];

            for (let j = 0; j < activeStrategies.length; j++) {
                const s = activeStrategies[j];
                const currPrice = s.data.get(date) ?? lastPrices[j];
                const dailyRet = lastPrices[j] > 0 ? (currPrice - lastPrices[j]) / lastPrices[j] : 0;
                lastPrices[j] = currPrice;

                // Apply return
                currentStratBalances[j] *= (1 + dailyRet);
                dailyTotalStrategies += currentStratBalances[j];

                // Track indiv strategies
                const prevStratIndep = strategyEquitiesIdx[j][i - 1];
                strategyEquitiesIdx[j].push(prevStratIndep * (1 + dailyRet));
            }

            // Total Portfolio Value = Strategy Balances + Cash Balance
            const dailyTotalBeforeFlows = dailyTotalStrategies + currentCashBalance;

            // Portfolio Daily Return (TWR component)
            const portfolioDailyRet = prevTotalBalance > 0 ? (dailyTotalBeforeFlows - prevTotalBalance) / prevTotalBalance : 0;

            const prevTWR = twrEquityIdx[i - 1];
            twrEquityIdx.push(prevTWR * (1 + portfolioDailyRet));



            // 3. Handle Rebalancing
            let shouldRebalance = false;
            if (deferredRebalanceFreq === 'daily') {
                shouldRebalance = true;
            } else if (deferredRebalanceFreq === 'monthly') {
                if (month !== currentMonth) shouldRebalance = true;
            } else if (deferredRebalanceFreq === 'quarterly') {
                if (month !== currentMonth && month % 3 === 0) shouldRebalance = true;
            } else if (deferredRebalanceFreq === 'annually') {
                if (year !== currentYear) shouldRebalance = true;
            } else if (deferredRebalanceFreq === 'none') {
                shouldRebalance = false;
            }

            // Update Time Trackers
            if (month !== currentMonth) currentMonth = month;
            if (year !== currentYear) currentYear = year;


            // Apply Rebalance
            let newTotalBalance = dailyTotalBeforeFlows;

            if (shouldRebalance) {
                // Reset to Target Weights
                for (let j = 0; j < activeStrategies.length; j++) {
                    currentStratBalances[j] = newTotalBalance * strategyWeights[j];
                }
                currentCashBalance = newTotalBalance * (1 - totalAllocatedWeight);
            }
            // Else: Drift Continues

            combinedEquityIdx.push(newTotalBalance);

            if (spyData) {
                const sPrice = spyData.get(date);
                if (sPrice !== undefined) spyLastPrice = sPrice;
                spyEquityIdx.push(spyLastPrice * spyFactor);
            }
        }

        const datesOnly = parsedTimeline.map(t => t.date);

        // 1. TWR Stats (Pure Strategy Performance - Sharpe, CAGR, Volatility)
        // With no cashflows, TWR and Combined Equity are identical in shape.
        const stats = calculateStats(twrEquityIdx, datesOnly);

        // Final Val
        stats.finalBalance = combinedEquityIdx[combinedEquityIdx.length - 1];
        stats.totalReturn = (stats.finalBalance - startBalance) / startBalance;

        const spyStats = spyData ? calculateStats(spyEquityIdx, datesOnly) : null;

        // Calculate Drawdowns for the charts
        const calculateDD = (curve: number[]) => {
            let peak = -Infinity;
            return curve.map(val => {
                if (val > peak) peak = val;
                return peak > 0 ? ((val - peak) / peak) * 100 : 0;
            });
        };

        const combinedDD = calculateDD(combinedEquityIdx);
        const spyDD = spyData ? calculateDD(spyEquityIdx) : combinedEquityIdx.map(() => 0);

        // Subsample for chart performance (max 1000 points)
        const step = Math.max(1, Math.floor(parsedTimeline.length / 1000));
        const chartData = [];

        for (let i = 0; i < parsedTimeline.length; i += step) {
            const pt: any = {
                date: parsedTimeline[i].date,
                timestamp: parsedTimeline[i].timestamp,
                combined: combinedEquityIdx[i],
                spy: spyEquityIdx[i] || 0,
                combinedDD: combinedDD[i],
                spyDD: spyDD[i]
            };
            activeStrategies.forEach((s, sIdx) => {
                pt[s.id] = strategyEquitiesIdx[sIdx][i];
            });
            chartData.push(pt);
        }
        // Always include last point
        if ((parsedTimeline.length - 1) % step !== 0) {
            const lastIdx = parsedTimeline.length - 1;
            const pt: any = {
                date: parsedTimeline[lastIdx].date,
                timestamp: parsedTimeline[lastIdx].timestamp,
                combined: combinedEquityIdx[lastIdx],
                spy: spyEquityIdx[lastIdx] || 0,
                combinedDD: combinedDD[lastIdx],
                spyDD: spyDD[lastIdx]
            };
            activeStrategies.forEach((s, sIdx) => {
                pt[s.id] = strategyEquitiesIdx[sIdx][lastIdx];
            });
            chartData.push(pt);
        }

        return {
            dates: datesOnly,
            combinedEquity: combinedEquityIdx,
            strategyEquities: strategyEquitiesIdx,
            spyEquity: spyEquityIdx,
            stats,
            spyStats,
            chartData,
            activeStrategies
        } as unknown as SimulationResult;

    }, [strategies, deferredAllocations, deferredSettings, deferredRebalanceFreq, spyData, loading, parsedTimeline]);

    const totalAllocation = (Object.values(allocations) as number[]).reduce((a: number, b: number) => a + b, 0);

    // Discount Logic Refined (Only count priced strategies)
    const pricedStrategies = strategies.filter(s => (allocations[s.id] || 0) > 0 && s.price && s.price > 0);
    const countForDiscount = pricedStrategies.length;

    const originalPrice = pricedStrategies.reduce((sum, s) => sum + (s.price || 0), 0);

    let discount = 0;
    let nextTierMsg = "";
    let bannerColorClass = "text-slate-500";
    let bannerBgClass = "bg-slate-50 border-slate-200";

    if (countForDiscount > 0) {
        if (countForDiscount < 4) {
            const needed = 4 - countForDiscount;
            discount = 0;
            nextTierMsg = `Add ${needed} more strategy${needed > 1 ? 'ies' : ''} to save 20%`;
            bannerColorClass = "text-blue-600";
            bannerBgClass = "bg-blue-50 border-blue-200";
        } else if (countForDiscount >= 4 && countForDiscount < 6) {
            discount = 0.20;
            const needed = 6 - countForDiscount;
            nextTierMsg = `20% Discount Active! Add ${needed} more to save 30%`;
            bannerColorClass = "text-amber-700";
            bannerBgClass = "bg-amber-50 border-amber-200";
        } else {
            discount = 0.30;
            nextTierMsg = "Maximum 30% Discount Unlocked! 🎉";
            bannerColorClass = "text-emerald-700";
            bannerBgClass = "bg-emerald-50 border-emerald-200";
        }
    }

    const finalPrice = originalPrice * (1 - discount);

    // Helper to extract variant ID from info URL
    const extractVariantId = (url: string) => {
        const match = url.match(/[?&]variant=(\d+)/);
        return match ? match[1] : null;
    };

    // Checkout Logic - Updated to use Shopify Permalinks in new tab
    // This bypasses iframe cross-origin issues and sends user to checkout with products
    const handleCheckout = () => {
        setIsCheckingOut(true);

        // 1. Get Variant IDs
        const variantIds = pricedStrategies.map(s => {
            return s.infoUrl ? extractVariantId(s.infoUrl) : null;
        }).filter(id => id !== null);

        if (variantIds.length === 0) {
            alert("No strategies available for purchase.");
            setIsCheckingOut(false);
            return;
        }

        // 2. Construct Shopify Cart Permalink
        // Format: https://domain.com/cart/variant_id:qty,variant_id:qty
        // This format replaces the cart with these items and goes to checkout/cart flow
        const cartItems = variantIds.map(id => `${id}:1`).join(',');
        const checkoutUrl = `https://setupalpha.com/cart/${cartItems}`;

        // 3. Open in new tab
        window.open(checkoutUrl, '_blank');

        setIsCheckingOut(false);
    };

    return (
        <div id="app-wrapper" className="h-auto flex flex-col bg-transparent font-sans text-neutral-700 overflow-hidden">

            <main className="flex-1 max-w-[1600px] w-full mx-auto py-4 md:py-8 px-0 grid grid-cols-1 lg:grid-cols-12 gap-8 print:block print:p-0 print:max-w-none">

                {/* Sidebar - Hidden during Print */}
                <aside className="lg:col-span-3 print:hidden">
                    <div className="lg:sticky lg:top-6 flex flex-col gap-6 pr-1 pb-4">

                        {/* Capital Settings */}
                        <div className="bg-white rounded-lg border border-neutral-200 p-5">
                            <h3 className="font-medium text-neutral-900 text-sm mb-4">
                                Capital Settings
                            </h3>
                            <div className="space-y-4">
                                <div>
                                    <label className="block text-xs font-medium text-neutral-500 mb-1.5">Starting Balance</label>
                                    <div className="flex items-center bg-neutral-50 border border-neutral-200 rounded-lg h-10 focus-within:border-neutral-400 transition-all overflow-hidden">
                                        <span className="pl-3 text-neutral-400 text-sm select-none">$</span>
                                        <input
                                            type="number"
                                            value={initialBalanceStr}
                                            onChange={(e) => setInitialBalanceStr(e.target.value)}
                                            onFocus={(e) => e.target.value === '0' && setInitialBalanceStr('')}
                                            onBlur={(e) => e.target.value === '' && setInitialBalanceStr('0')}
                                            className="w-full pl-1 pr-3 py-2 bg-transparent border-none focus:ring-0 text-sm tabular-nums text-neutral-900 placeholder-neutral-400 outline-none"
                                        />
                                    </div>
                                </div>
                                <div>
                                    <label className="block text-xs font-medium text-neutral-500 mb-1.5">Rebalancing Frequency</label>
                                    <select
                                        value={rebalanceFreq}
                                        onChange={(e) => setRebalanceFreq(e.target.value)}
                                        className="w-full text-xs bg-neutral-50 border border-neutral-200 rounded-lg px-2 py-2 text-neutral-700 outline-none focus:border-neutral-400 cursor-pointer"
                                    >
                                        <option value="daily">Daily</option>
                                        <option value="monthly">Monthly</option>
                                        <option value="quarterly">Quarterly</option>
                                        <option value="annually">Annually</option>
                                        <option value="none">None (Buy & Hold)</option>
                                    </select>
                                </div>

                            </div>
                        </div>

                        <FileUpload onDataLoaded={handleUpload} />

                        <StrategyList
                            strategies={strategies}
                            allocations={allocations}
                            totalAllocation={totalAllocation}
                            onAllocationChange={(id, val) => setAllocations(prev => ({ ...prev, [id]: val }))}
                            onRemoveStrategy={(id) => {
                                setStrategies(prev => prev.filter(s => s.id !== id));
                                setAllocations(prev => { const n = { ...prev }; delete n[id]; return n; });
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
                                const next = { ...allocations };
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
                    className="lg:col-span-9 flex flex-col gap-6 print:col-span-12"
                >

                    {/* Print Header (Visible only in Print) */}
                    <div className="hidden print:block mb-8 break-inside-avoid">
                        <div className="flex justify-between items-end border-b border-stripe-primary pb-4">
                            <div>
                                <h1 className="text-xl font-semibold text-stripe-primary">Portfolio Analysis Report</h1>
                                <p className="text-stripe-muted text-sm mt-1">Generated via Portfolio Architect</p>
                            </div>
                            <div className="text-right">
                                <p className="text-xs text-stripe-muted uppercase font-medium">Report Date</p>
                                <p className="font-semibold text-stripe-primary">{new Date().toLocaleDateString()}</p>
                            </div>
                        </div>
                    </div>

                    {simulation ? (
                        <div className="flex flex-col gap-6">
                            {/* Main Equity Chart */}
                            <div className="bg-white rounded-lg border border-neutral-200 p-6 break-inside-avoid">
                                <div className="flex justify-between items-center mb-5">
                                    <h2 className="text-base font-semibold text-neutral-900">Portfolio Growth</h2>
                                    <div className="flex items-center gap-3">
                                        <div className="hidden sm:flex items-center gap-1.5 px-2.5 py-1 bg-neutral-50 border border-neutral-200 rounded print:hidden">
                                            <BarChart2 size={12} className="text-neutral-500" />
                                            <span className="text-xs font-medium text-neutral-700">Log Scale</span>
                                        </div>
                                        <div className="hidden sm:flex items-center gap-1.5 px-2.5 py-1 bg-neutral-50 border border-neutral-200 rounded print:hidden">
                                            <div className="w-2 h-2 rounded-full" style={{ backgroundColor: '#004cff' }}></div>
                                            <span className="text-xs font-medium text-neutral-700">Combined</span>
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
                                <StatsGrid stats={simulation.stats} spyStats={simulation.spyStats} equityHistory={simulation.combinedEquity} />
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
                            <div className="flex flex-col gap-6">
                                <div className="bg-white rounded-lg border border-neutral-200 p-5 break-inside-avoid">
                                    <DrawdownChart data={simulation.chartData} showSpy={true} />
                                </div>
                                <div className="bg-white rounded-lg border border-neutral-200 p-5 break-inside-avoid">
                                    <AnnualReturnsChart
                                        portfolioReturns={simulation.stats.annualReturns}
                                        spyReturns={simulation.spyStats?.annualReturns || {}}
                                    />
                                </div>
                            </div>

                            {/* Correlation & Monthly Returns */}
                            <div className="bg-white rounded-lg border border-neutral-200 p-5 break-before-page">
                                <div className="break-inside-avoid mb-6">
                                    <CorrelationMatrix
                                        strategies={strategies.filter(s => (allocations[s.id] || 0) > 0)}
                                    />
                                </div>
                                <div className="break-inside-avoid">
                                    <MonthlyTable stats={simulation.stats} />
                                </div>
                            </div>

                            {/* On-screen Allocation Summary (Bottom) */}
                            <div className="bg-white border border-neutral-200 rounded-lg p-5 print:bg-white print:border-0 print:p-0 break-inside-avoid">
                                <h3 className="font-semibold text-neutral-900 text-base mb-5">Allocation Summary</h3>
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-center">
                                    {/* Pie Chart Visual */}
                                    <div className="flex justify-center border-r border-neutral-200 pr-6">
                                        <AllocationPieChart strategies={strategies} allocations={allocations} />
                                    </div>

                                    {/* Detailed Table */}
                                    <div className="overflow-x-auto">
                                        <table className="w-full text-sm text-left">
                                            <thead className="text-neutral-500 border-b border-neutral-200">
                                                <tr>
                                                    <th className="pb-3 font-medium text-xs uppercase tracking-wide">Strategy</th>
                                                    <th className="pb-3 font-medium text-xs uppercase tracking-wide text-right">Allocation</th>
                                                    <th className="pb-3 font-medium text-xs uppercase tracking-wide text-right">Capital</th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {strategies.filter(s => (allocations[s.id] || 0) > 0).map(s => (
                                                    <tr key={s.id} className="border-b border-neutral-200 last:border-0">
                                                        <td className="py-3 font-medium text-neutral-700 flex items-center gap-2">
                                                            <div className="w-2 h-2 rounded-full" style={{ backgroundColor: s.color }}></div>
                                                            {s.name}
                                                        </td>
                                                        <td className="py-3 text-right text-neutral-700 tabular-nums">{allocations[s.id]}%</td>
                                                        <td className="py-3 text-right tabular-nums text-neutral-700">
                                                            ${Math.round(settings.initialBalance * ((allocations[s.id] || 0) / 100)).toLocaleString()}
                                                        </td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                            <tfoot className="border-t border-neutral-200">
                                                <tr>
                                                    <td className="py-3 font-semibold text-neutral-900">Total</td>
                                                    <td className="py-3 text-right font-semibold text-neutral-900">{totalAllocation}%</td>
                                                    <td className="py-3 text-right font-semibold text-neutral-900 tabular-nums">
                                                        ${Math.round(settings.initialBalance * (totalAllocation / 100)).toLocaleString()}
                                                    </td>
                                                </tr>
                                            </tfoot>
                                        </table>
                                    </div>
                                </div>
                            </div>

                            {/* Cost Section - Stripe-style checkout */}
                            {originalPrice > 0 && (
                                <div className="bg-white rounded-lg border border-neutral-200 overflow-hidden print:hidden">
                                    {/* Header / Upsell Banner */}
                                    <div className="bg-canvas border-b border-stripe-border px-5 py-3 text-sm font-medium flex items-center justify-between">
                                        <span className="text-stripe-secondary">{countForDiscount} Paid Strateg{countForDiscount === 1 ? 'y' : 'ies'} Selected</span>
                                        <span className="flex items-center gap-2 text-accent">
                                            {countForDiscount < 6 && <Info size={14} />}
                                            {nextTierMsg}
                                        </span>
                                    </div>

                                    <div className="p-5 grid grid-cols-1 md:grid-cols-3 gap-6">
                                        {/* Left: Selected Items List */}
                                        <div className="md:col-span-2 space-y-3">
                                            <h3 className="text-stripe-primary font-semibold text-base">
                                                Your Selection
                                            </h3>
                                            <div className="bg-canvas border border-stripe-border rounded p-4 space-y-2.5">
                                                {pricedStrategies.map(s => (
                                                    <div key={s.id} className="flex justify-between items-center text-sm">
                                                        <div className="flex items-center gap-2.5">
                                                            <div className="w-2 h-2 rounded-full" style={{ backgroundColor: s.color }}></div>
                                                            <span className="text-stripe-secondary font-medium">{s.name}</span>
                                                        </div>
                                                        <span className="text-stripe-muted tabular-nums">${s.price}</span>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>

                                        {/* Right: Totals & Action */}
                                        <div className="flex flex-col justify-between bg-canvas border border-stripe-border rounded p-4">
                                            <div className="space-y-2.5">
                                                <div className="flex justify-between text-stripe-muted text-sm">
                                                    <span>Subtotal</span>
                                                    <span className="tabular-nums">${originalPrice.toLocaleString()}</span>
                                                </div>
                                                {discount > 0 && (
                                                    <div className="flex justify-between text-success text-sm font-medium">
                                                        <span>Discount ({(discount * 100).toFixed(0)}%)</span>
                                                        <span className="tabular-nums">-${Math.round(originalPrice * discount).toLocaleString()}</span>
                                                    </div>
                                                )}
                                                <div className="h-px bg-stripe-border my-2"></div>
                                                <div className="flex justify-between text-stripe-primary text-lg font-semibold">
                                                    <span>Total</span>
                                                    <span className="tabular-nums">${Math.round(finalPrice).toLocaleString()}</span>
                                                </div>
                                            </div>

                                            <button
                                                onClick={handleCheckout}
                                                disabled={isCheckingOut}
                                                className="w-full mt-5 bg-accent hover:bg-accent-hover text-white font-semibold py-2.5 rounded transition-all flex items-center justify-center gap-2 group disabled:opacity-60 disabled:cursor-not-allowed"
                                            >
                                                {isCheckingOut ? (
                                                    <>
                                                        <Loader2 size={16} className="animate-spin" />
                                                        <span>Processing...</span>
                                                    </>
                                                ) : (
                                                    <>
                                                        <span>Proceed to Checkout</span>
                                                        <ArrowRight size={16} className="group-hover:translate-x-0.5 transition-transform" />
                                                    </>
                                                )}
                                            </button>
                                            <p className="text-center text-xs text-stripe-muted mt-2.5 flex items-center justify-center gap-1">
                                                <Check size={10} /> Secure payment. Instant access.
                                            </p>
                                        </div>
                                    </div>
                                </div>
                            )}
                        </div>
                    ) : (
                        <div className="min-h-[400px] flex flex-col items-center justify-center text-stripe-muted border-2 border-dashed border-neutral-200 rounded bg-white">
                            <div className="bg-white p-4 rounded-lg border border-neutral-200 mb-4">
                                <Info size={28} className="text-accent" />
                            </div>
                            <h3 className="text-base font-semibold text-stripe-primary">Portfolio Simulation</h3>
                            <p className="text-sm mt-2 max-w-md text-center text-stripe-muted">
                                Select strategies from the sidebar or upload your own CSV to generate a professional backtest report.
                            </p>
                        </div>
                    )}
                </section>
            </main>
        </div >
    );
}
