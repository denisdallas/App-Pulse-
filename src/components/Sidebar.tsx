import React from 'react';
import { 
  LayoutDashboard, 
  Compass, 
  MessageSquareWarning, 
  BrainCircuit, 
  Scale, 
  Lightbulb, 
  Send, 
  FolderGit2, 
  Settings,
  Sparkles,
  X
} from 'lucide-react';

export type ViewTab = 
  | 'dashboard'
  | 'discovery'
  | 'reviews'
  | 'analytics'
  | 'compare'
  | 'opportunities'
  | 'outreach'
  | 'projects'
  | 'settings';

interface SidebarProps {
  currentTab: ViewTab;
  onSelectTab: (tab: ViewTab) => void;
  stats?: {
    totalApps: number;
    negativeReviews: number;
    totalOpportunities: number;
  };
  isOpenOnMobile?: boolean;
  onCloseMobile?: () => void;
}

export const Sidebar: React.FC<SidebarProps> = ({ 
  currentTab, 
  onSelectTab, 
  stats,
  isOpenOnMobile,
  onCloseMobile,
}) => {
  const navItems = [
    { id: 'dashboard' as ViewTab, label: 'Dashboard', icon: LayoutDashboard },
    { id: 'discovery' as ViewTab, label: 'App Discovery', icon: Compass, badge: stats?.totalApps },
    { id: 'reviews' as ViewTab, label: 'Review Explorer', icon: MessageSquareWarning, badge: stats?.negativeReviews },
    { id: 'analytics' as ViewTab, label: 'Complaint Analytics', icon: BrainCircuit },
    { id: 'compare' as ViewTab, label: 'Competitor Matrix', icon: Scale },
    { id: 'opportunities' as ViewTab, label: 'Opportunity Finder', icon: Lightbulb, badge: stats?.totalOpportunities },
    { id: 'outreach' as ViewTab, label: 'Outreach Studio', icon: Send },
    { id: 'projects' as ViewTab, label: 'Research Projects', icon: FolderGit2 },
    { id: 'settings' as ViewTab, label: 'Settings & Connectors', icon: Settings },
  ];

  return (
    <>
      {/* Mobile Backdrop */}
      {isOpenOnMobile && (
        <div 
          onClick={onCloseMobile}
          className="fixed inset-0 bg-black/70 backdrop-blur-sm z-40 md:hidden"
        />
      )}

      <aside className={`
        fixed inset-y-0 left-0 z-50 w-64 bg-slate-900 border-r border-slate-800 flex flex-col shrink-0 transition-transform duration-200 ease-in-out
        md:static md:translate-x-0
        ${isOpenOnMobile ? 'translate-x-0' : '-translate-x-full md:translate-x-0'}
      `}>
        {/* Brand Header */}
        <div className="h-16 flex items-center justify-between px-5 border-b border-slate-800">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-indigo-600 flex items-center justify-center text-white font-bold shadow-md shadow-indigo-600/30">
              <Sparkles className="w-4 h-4 text-white" />
            </div>
            <div className="flex flex-col">
              <span className="font-bold text-sm tracking-tight text-white">AppPulse</span>
              <span className="text-[11px] text-slate-400 font-medium">Market Intelligence</span>
            </div>
          </div>

          {/* Close Button on Mobile */}
          <button
            onClick={onCloseMobile}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white md:hidden"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Navigation Links */}
        <nav className="flex-1 p-3 space-y-1 overflow-y-auto">
          <div className="px-3 py-1.5 text-[10px] font-semibold tracking-wider text-slate-400 uppercase">
            Intelligence Workspace
          </div>
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = currentTab === item.id;
            return (
              <button
                key={item.id}
                onClick={() => {
                  onSelectTab(item.id);
                  onCloseMobile?.();
                }}
                className={`w-full flex items-center justify-between px-3 py-2 rounded-lg text-xs font-medium transition-all ${
                  isActive
                    ? 'bg-indigo-600/20 text-indigo-400 border border-indigo-500/30 font-semibold'
                    : 'text-slate-300 hover:bg-slate-800/70 hover:text-white'
                }`}
              >
                <div className="flex items-center gap-2.5">
                  <Icon className={`w-4 h-4 ${isActive ? 'text-indigo-400' : 'text-slate-400'}`} />
                  <span>{item.label}</span>
                </div>
                {item.badge !== undefined && item.badge > 0 && (
                  <span className="text-[10px] font-mono tabular-nums px-1.5 py-0.5 rounded bg-slate-800 text-slate-300">
                    {item.badge}
                  </span>
                )}
              </button>
            );
          })}
        </nav>

        {/* Footer Info */}
        <div className="p-4 border-t border-slate-800 text-[11px] text-slate-400 space-y-1">
          <div className="flex items-center justify-between">
            <span>Engine Status</span>
            <span className="text-emerald-400 font-medium flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400"></span>
              Operational
            </span>
          </div>
          <div className="text-[10px] text-slate-400">
            Steam · Google Play · MS Store
          </div>
        </div>
      </aside>
    </>
  );
};
