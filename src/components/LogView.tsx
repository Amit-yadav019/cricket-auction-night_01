import React from 'react';
import { History, Gavel, CheckCircle2, XCircle, RotateCcw, Info } from 'lucide-react';
import { RoomData } from '../services/auctionService';

interface LogViewProps {
  room: RoomData;
}

export const LogView: React.FC<LogViewProps> = ({ room }) => {
  const getLogIcon = (type: string) => {
    switch (type) {
      case 'sold':
        return <CheckCircle2 className="w-4 h-4 text-emerald-600 flex-shrink-0" />;
      case 'unsold':
        return <XCircle className="w-4 h-4 text-gray-400 flex-shrink-0" />;
      case 'undo':
        return <RotateCcw className="w-4 h-4 text-amber-500 flex-shrink-0" />;
      case 'bid':
        return <Gavel className="w-4 h-4 text-[var(--color-primary)] flex-shrink-0" />;
      default:
        return <Info className="w-4 h-4 text-blue-500 flex-shrink-0" />;
    }
  };

  return (
    <div className="w-full max-w-[540px] mx-auto px-4 py-3 space-y-3">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-black font-display uppercase tracking-wider text-[var(--color-text-main)] flex items-center space-x-2">
            <History className="w-5 h-5 text-[var(--color-primary)]" />
            <span>Auction Log</span>
          </h2>
          <p className="text-xs text-[var(--color-text-muted)]">
            Live chronological transactions and events
          </p>
        </div>
      </div>

      <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-2xl p-3 shadow-xs space-y-2 max-h-[500px] overflow-y-auto">
        {room.auctionLog.length === 0 ? (
          <p className="text-xs text-[var(--color-text-dim)] italic text-center py-6">
            No activity logged yet.
          </p>
        ) : (
          room.auctionLog.map((item) => (
            <div
              key={item.id}
              className="p-2.5 rounded-xl bg-[var(--color-surface-subtle)] border border-[var(--color-border)] flex items-start space-x-2.5 text-xs text-[var(--color-text-main)]"
            >
              <div className="mt-0.5">{getLogIcon(item.type)}</div>
              <div className="flex-1 min-w-0">
                <p className="font-semibold leading-relaxed break-words">{item.message}</p>
                <span className="text-[10px] text-[var(--color-text-dim)] font-mono">
                  {new Date(item.timestamp).toLocaleTimeString([], {
                    hour: '2-digit',
                    minute: '2-digit',
                    second: '2-digit',
                  })}
                </span>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
};
