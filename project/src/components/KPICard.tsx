import { LucideIcon, TrendingUp, TrendingDown } from 'lucide-react';
import { motion } from 'framer-motion';
import { useEffect, useState } from 'react';

interface KPICardProps {
  title: string;
  value: number;
  icon: LucideIcon;
  color: string;
  prefix?: string;
  trend?: number;
  onClick?: () => void;
}

export function KPICard({ title, value, icon: Icon, color, prefix = '', trend, onClick }: KPICardProps) {
  const [isUpdating, setIsUpdating] = useState(false);
  const [prevValue, setPrevValue] = useState(value);

  useEffect(() => {
    if (value !== prevValue && prevValue !== undefined) {
      setIsUpdating(true);
      const timer = setTimeout(() => setIsUpdating(false), 1000);
      setPrevValue(value);
      return () => clearTimeout(timer);
    }
    setPrevValue(value);
  }, [value, prevValue]);

  const formattedValue = typeof value === 'number'
    ? value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
    : '0.00';

  const trendPositive = trend && trend > 0;
  const trendNegative = trend && trend < 0;

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{
        opacity: 1,
        y: 0,
        scale: isUpdating ? [1, 1.03, 1] : 1
      }}
      whileHover={onClick ? { scale: 1.02, y: -4 } : undefined}
      transition={{ duration: 0.2 }}
      onClick={onClick}
      className={`
        relative overflow-hidden rounded-2xl shadow-lg border border-gray-100 dark:border-gray-700
        ${onClick ? 'cursor-pointer' : ''}
        ${isUpdating ? 'ring-2 ring-blue-400 ring-opacity-50' : ''}
      `}
    >
      <div className={`${color} p-6 text-white relative`}>
        <div className="absolute top-0 right-0 w-32 h-32 opacity-10">
          <Icon className="w-full h-full" />
        </div>

        <div className="relative z-10">
          <div className="flex items-center justify-between mb-2">
            <div className="p-2 bg-white/20 rounded-lg backdrop-blur-sm">
              <Icon className="h-5 w-5" />
            </div>
            {trend !== undefined && (
              <div className={`flex items-center gap-1 text-sm font-semibold ${
                trendPositive ? 'text-white' : trendNegative ? 'text-red-200' : 'text-white/80'
              }`}>
                {trendPositive && <TrendingUp className="h-4 w-4" />}
                {trendNegative && <TrendingDown className="h-4 w-4" />}
                <span>{trend > 0 ? '+' : ''}{trend}%</span>
              </div>
            )}
          </div>

          <h3 className="text-sm font-medium text-white/90 mb-1">{title}</h3>
          <p className="text-2xl font-bold text-white">
            {prefix}{formattedValue}
          </p>
        </div>
      </div>
    </motion.div>
  );
}
