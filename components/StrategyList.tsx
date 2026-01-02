import React from 'react';
import { Strategy } from '../types';
import { Trash2, ExternalLink } from 'lucide-react';

interface StrategyListProps {
  strategies: Strategy[];
  allocations: Record<string, number>;
  onAllocationChange: (id: string, val: number) => void;
  onRemoveStrategy: (id: string) => void;
  totalAllocation: number;
  onReset: () => void;
  onEqualWeight: () => void;
}

export const StrategyList: React.FC<StrategyListProps> = ({
  strategies,
  allocations,
  onAllocationChange,
  onRemoveStrategy,
  totalAllocation,
  onReset,
  onEqualWeight
}) => {
  
  const builtInStrategies = strategies.filter(s => s.isBuiltIn);
  const userStrategies = strategies.filter(s => !s.isBuiltIn);

  const renderRow = (s: Strategy) => (
    <div key={s.id} className="flex flex-col gap-1 py-3 border-b border-slate-100 last:border-0">
      <div className="flex justify-between items-center mb-1">
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 rounded-full" style={{ backgroundColor: s.color }}></div>
          <span className="text-sm font-medium text-slate-700 truncate max-w-[140px]" title={s.name}>{s.name}</span>
          {s.infoUrl && (
            <a href={s.infoUrl} target="_blank" rel="noreferrer" className="text-slate-400 hover:text-blue-500">
              <ExternalLink size={12} />
            </a>
          )}
        </div>
        <div className="flex items-center gap-2">
            <span className="text-xs font-semibold tabular-nums w-8 text-right">
                {allocations[s.id] || 0}%
            </span>
            {!s.isBuiltIn && (
                <button 
                    onClick={() => onRemoveStrategy(s.id)}
                    className="text-slate-300 hover:text-red-500 transition-colors"
                >
                    <Trash2 size={14} />
                </button>
            )}
        </div>
      </div>
      <input
        type="range"
        min="0"
        max="100"
        step="1"
        value={allocations[s.id] || 0}
        onChange={(e) => onAllocationChange(s.id, Number(e.target.value))}
        className="w-full h-1.5 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-blue-600"
      />
    </div>
  );

  return (
    <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-5">
      <div className="flex justify-between items-center mb-4">
        <h3 className="font-semibold text-slate-800">Allocations</h3>
        <div className={`text-sm font-bold ${totalAllocation > 100 ? 'text-red-500' : totalAllocation === 100 ? 'text-emerald-600' : 'text-amber-500'}`}>
          {totalAllocation}%
        </div>
      </div>

      <div className="flex gap-2 mb-6">
        <button 
          onClick={onEqualWeight}
          className="flex-1 py-1.5 px-3 bg-slate-100 hover:bg-slate-200 text-slate-600 text-xs font-medium rounded-md transition-colors"
        >
          Equal Weight
        </button>
        <button 
          onClick={onReset}
          className="flex-1 py-1.5 px-3 bg-slate-100 hover:bg-slate-200 text-slate-600 text-xs font-medium rounded-md transition-colors"
        >
          Reset
        </button>
      </div>

      {userStrategies.length > 0 && (
        <div className="mb-6">
            <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3">Your Strategies</h4>
            <div className="flex flex-col">
                {userStrategies.map(renderRow)}
            </div>
        </div>
      )}

      <div>
        <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3">Market Strategies</h4>
        <div className="flex flex-col">
            {builtInStrategies.map(renderRow)}
        </div>
      </div>
    </div>
  );
};