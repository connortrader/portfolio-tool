import React, { useMemo, useState } from 'react';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Area, AreaChart,
  BarChart, Bar, Legend, PieChart, Pie, Cell
} from 'recharts';

interface ChartProps {
  data: any[];
  strategies: {id: string, name: string, color: string}[];
  showSpy: boolean;
  isLogScale?: boolean; // Added prop
}

const CustomTooltip = ({ active, payload, label }: any) => {
  if (active && payload && payload.length) {
    const dateStr = new Date(label).toLocaleDateString('en-US', {
        weekday: 'short', 
        year: 'numeric', 
        month: 'short', 
        day: 'numeric'
    });
    return (
      <div className="bg-white/95 border border-slate-200 p-3 rounded shadow-lg text-xs backdrop-blur-sm z-50 min-w-[200px]">
        <p className="font-bold text-slate-800 mb-2 border-b border-slate-100 pb-1">{dateStr}</p>
        <div className="flex flex-col gap-1">
            {payload.map((p: any, idx: number) => (
                <div key={idx} className="flex items-center justify-between gap-4">
                    <div className="flex items-center gap-2 overflow-hidden">
                        <div className="w-2 h-2 rounded-full shrink-0" style={{backgroundColor: p.color}}></div>
                        <span className="text-slate-600 truncate max-w-[120px]">{p.name}</span>
                    </div>
                    <span className="font-semibold tabular-nums text-slate-900">
                        {p.name.includes('Drawdown') 
                            ? `${p.value.toFixed(2)}%` 
                            : `$${p.value.toLocaleString(undefined, {maximumFractionDigits: 0})}`
                        }
                    </span>
                </div>
            ))}
        </div>
      </div>
    );
  }
  return null;
};

export const EquityChart: React.FC<ChartProps> = ({ data, strategies, showSpy, isLogScale = false }) => {
  // State for legend toggling
  const [hiddenSeries, setHiddenSeries] = useState<Set<string>>(new Set());

  const handleLegendClick = (e: any) => {
      const id = e.dataKey;
      setHiddenSeries(prev => {
          const next = new Set(prev);
          if (next.has(id)) next.delete(id);
          else next.add(id);
          return next;
      });
  };

  // Downsample logic & Always Normalize
  const processedData = useMemo(() => {
    let baseData = data;
    if (data.length > 800) {
        const factor = Math.ceil(data.length / 800);
        baseData = data.filter((_, i) => i % factor === 0 || i === data.length - 1);
    }

    // Normalization Logic: Scale all series to match Combined Portfolio start value
    const firstValidCombined = baseData.find(d => d.combined > 0);
    const baseValue = firstValidCombined ? firstValidCombined.combined : 100000;

    const startValues: Record<string, number> = {};
    startValues['combined'] = baseValue;
    
    const firstSpy = baseData.find(d => d.spy > 0);
    startValues['spy'] = firstSpy ? firstSpy.spy : 1;

    strategies.forEach(s => {
        const first = baseData.find(d => d[s.id] > 0);
        startValues[s.id] = first ? first[s.id] : 1;
    });

    return baseData.map(d => {
        const pt = { ...d };
        if (d.spy) pt.spy = (d.spy / startValues['spy']) * baseValue;
        strategies.forEach(s => {
            if (d[s.id]) pt[s.id] = (d[s.id] / startValues[s.id]) * baseValue;
        });
        return pt;
    });
  }, [data, strategies]);

  const formatYAxis = (val: number) => {
    if (val >= 1000000) return `$${(val / 1000000).toFixed(1)}M`;
    if (val >= 1000) return `$${(val / 1000).toFixed(0)}k`;
    return `$${val}`;
  };

  return (
    <div className="h-[420px] w-full select-none">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={processedData} margin={{ top: 10, right: 10, left: 0, bottom: 20 }}>
          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
          <XAxis 
            dataKey="timestamp" 
            type="number"
            domain={['dataMin', 'dataMax']}
            tickFormatter={(unix) => new Date(unix).getFullYear().toString()}
            stroke="#94a3b8"
            tick={{fontSize: 11}}
            minTickGap={40}
          />
          <YAxis 
            scale={isLogScale ? "log" : "linear"}
            domain={['auto', 'auto']}
            tickFormatter={formatYAxis}
            stroke="#94a3b8"
            tick={{fontSize: 11}}
            width={45}
            allowDataOverflow={true}
          />
          <Tooltip content={<CustomTooltip />} />
          <Legend 
            wrapperStyle={{fontSize: '12px', paddingTop: '16px', cursor: 'pointer'}} 
            iconType="circle"
            onClick={handleLegendClick}
            verticalAlign="bottom"
            align="center"
          />
          
          {strategies.map(s => (
            <Line 
              key={s.id}
              hide={hiddenSeries.has(s.id)}
              type="monotone"
              dataKey={s.id}
              name={s.name}
              stroke={s.color}
              strokeWidth={1.5}
              dot={false}
              isAnimationActive={false}
              connectNulls={true}
            />
          ))}
          
          <Line 
            hide={hiddenSeries.has('combined')}
            type="monotone" 
            dataKey="combined" 
            name="Combined Portfolio" 
            stroke="#111827" 
            strokeWidth={3} 
            dot={false} 
            isAnimationActive={false}
            connectNulls={true}
          />
          
          {showSpy && (
            <Line 
                hide={hiddenSeries.has('spy')}
                type="monotone"
                dataKey="spy"
                name="SPY ETF"
                stroke="#ef4444"
                strokeWidth={2}
                dot={false}
                isAnimationActive={false}
                connectNulls={true}
            />
          )}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
};

export const DrawdownChart: React.FC<{data: any[], showSpy: boolean}> = ({ data, showSpy }) => {
    const [hiddenSeries, setHiddenSeries] = useState<Set<string>>(new Set());

    const handleLegendClick = (e: any) => {
        const id = e.dataKey;
        setHiddenSeries(prev => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id);
            else next.add(id);
            return next;
        });
    };

    const chartData = useMemo(() => {
        if (data.length < 800) return data;
        const factor = Math.ceil(data.length / 800);
        return data.filter((_, i) => i % factor === 0 || i === data.length - 1);
    }, [data]);

    return (
        <div className="h-[250px] w-full mt-2 select-none">
            <h4 className="text-sm font-semibold text-slate-700 mb-4">Drawdown Analysis</h4>
            <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={chartData} margin={{ top: 5, right: 0, left: 0, bottom: 20 }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                    <XAxis 
                        dataKey="timestamp" 
                        type="number"
                        domain={['dataMin', 'dataMax']}
                        tickFormatter={(unix) => new Date(unix).getFullYear().toString()}
                        stroke="#94a3b8"
                        tick={{fontSize: 10}}
                    />
                    <YAxis 
                        stroke="#94a3b8"
                        tick={{fontSize: 10}}
                        tickFormatter={(val) => `${val}%`}
                        width={35}
                    />
                    <Tooltip content={<CustomTooltip />} />
                    <Legend 
                        wrapperStyle={{fontSize: '11px', paddingTop: '10px', cursor: 'pointer'}} 
                        verticalAlign="bottom" 
                        align="center"
                        onClick={handleLegendClick}
                        iconType="circle"
                    />
                    {/* Portfolio Drawdown = Gray Area */}
                    <Area 
                        type="monotone" 
                        dataKey="combinedDD" 
                        name="Portfolio Drawdown" 
                        stroke="#475569" 
                        fill="#cbd5e1" 
                        strokeWidth={1.5} 
                        isAnimationActive={false}
                        hide={hiddenSeries.has('combinedDD')}
                    />
                    {/* SPY Drawdown = Red Line */}
                    {showSpy && (
                        <Line 
                            type="monotone" 
                            dataKey="spyDD" 
                            name="SPY ETF Drawdown" 
                            stroke="#dc2626" 
                            strokeWidth={1.5} 
                            dot={false} 
                            isAnimationActive={false}
                            hide={hiddenSeries.has('spyDD')}
                        />
                    )}
                </AreaChart>
            </ResponsiveContainer>
        </div>
    );
};

export const AnnualReturnsChart: React.FC<{portfolioReturns: Record<string, number>, spyReturns: Record<string, number>}> = ({ portfolioReturns, spyReturns }) => {
    const [hiddenSeries, setHiddenSeries] = useState<Set<string>>(new Set());

    const handleLegendClick = (e: any) => {
        const id = e.dataKey;
        setHiddenSeries(prev => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id);
            else next.add(id);
            return next;
        });
    };

    const years = Array.from(new Set([...Object.keys(portfolioReturns), ...Object.keys(spyReturns)])).sort();
    
    const data = years.map(year => ({
        year,
        Portfolio: (portfolioReturns[year] || 0) * 100,
        'SPY ETF': (spyReturns[year] || 0) * 100
    }));

    return (
        <div className="h-[300px] w-full mt-2 select-none">
            <h4 className="text-sm font-semibold text-slate-700 mb-4">Annual Returns</h4>
            <ResponsiveContainer width="100%" height="100%">
                <BarChart data={data} margin={{ top: 5, right: 0, left: 0, bottom: 20 }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                    <XAxis dataKey="year" stroke="#94a3b8" tick={{fontSize: 11}} />
                    <YAxis stroke="#94a3b8" tick={{fontSize: 11}} tickFormatter={(val) => `${val}%`} />
                    <Tooltip 
                        cursor={{fill: '#f8fafc'}}
                        contentStyle={{ borderRadius: '8px', border: '1px solid #e2e8f0', fontSize: '12px' }}
                        formatter={(value: number) => `${value.toFixed(1)}%`}
                    />
                    <Legend 
                        wrapperStyle={{fontSize: '12px', paddingTop: '10px', cursor: 'pointer'}} 
                        verticalAlign="bottom" 
                        align="center"
                        onClick={handleLegendClick}
                        iconType="circle"
                    />
                    <Bar 
                        dataKey="Portfolio" 
                        fill="#111827" 
                        radius={[4, 4, 0, 0]} 
                        hide={hiddenSeries.has('Portfolio')}
                    />
                    <Bar 
                        dataKey="SPY ETF" 
                        fill="#ef4444" 
                        radius={[4, 4, 0, 0]} 
                        hide={hiddenSeries.has('SPY ETF')}
                    />
                </BarChart>
            </ResponsiveContainer>
        </div>
    );
};

export const AllocationPieChart: React.FC<{ strategies: {id: string, name: string, color: string}[], allocations: Record<string, number> }> = ({ strategies, allocations }) => {
    const data = strategies
        .filter(s => (allocations[s.id] || 0) > 0)
        .map(s => ({
            name: s.name,
            value: allocations[s.id],
            color: s.color
        }));

    return (
        <div className="h-[220px] w-full">
            <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                    <Pie
                        data={data}
                        cx="50%"
                        cy="50%"
                        innerRadius={55}
                        outerRadius={75}
                        paddingAngle={4}
                        dataKey="value"
                    >
                        {data.map((entry, index) => (
                            <Cell key={`cell-${index}`} fill={entry.color} stroke={entry.color} />
                        ))}
                    </Pie>
                    <Tooltip 
                        formatter={(value: number) => `${value}%`}
                        contentStyle={{backgroundColor: '#fff', borderRadius: '8px', border: '1px solid #e2e8f0', fontSize: '12px'}}
                    />
                    <Legend 
                        verticalAlign="middle" 
                        align="right"
                        layout="vertical"
                        wrapperStyle={{fontSize: '11px', maxWidth: '45%'}}
                        iconType="circle"
                    />
                </PieChart>
            </ResponsiveContainer>
        </div>
    );
};