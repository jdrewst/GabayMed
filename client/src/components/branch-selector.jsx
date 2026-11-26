import React from 'react';
import { MapPin, ChevronDown, Check, Building2, Store } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger
} from '@/components/ui/dropdown-menu';
import { useBranch } from '@/lib/branch-context';

export function BranchSelector({ className = '', align = 'start', showLabel = true }) {
  const { branches, selectedBranchId, selectedBranch, selectBranch } = useBranch();

  const currentLabel = selectedBranch ? selectedBranch.name : 'All Branches (Main)';
  const currentAbbr = selectedBranch ? selectedBranch.abbreviation : 'ALL';

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="outline"
          className={`h-10 rounded-full px-4 border border-blue-200/80 bg-blue-50/50 hover:bg-blue-100/60 transition-all flex items-center gap-2 text-slate-800 shadow-sm ${className}`}
          aria-label="Select branch location portal"
        >
          <div className="w-5 h-5 rounded-full bg-blue-500/10 flex items-center justify-center shrink-0">
            <MapPin className="w-3.5 h-3.5 text-blue-600" />
          </div>
          <span className="font-semibold text-xs md:text-sm text-slate-900 max-w-[140px] truncate">
            {currentLabel}
          </span>
          <Badge
            variant="secondary"
            className="text-[10px] font-bold px-1.5 py-0 h-4 bg-blue-600 text-white rounded-full uppercase"
          >
            {currentAbbr}
          </Badge>
          <ChevronDown className="w-3.5 h-3.5 text-slate-500 ml-0.5" />
        </Button>
      </DropdownMenuTrigger>

      <DropdownMenuContent align={align} className="w-72 p-1.5 shadow-lg border border-slate-200 bg-white">
        <DropdownMenuLabel className="px-2.5 py-1.5 text-xs font-semibold text-slate-500 uppercase tracking-wider flex items-center gap-1.5">
          <Building2 className="w-3.5 h-3.5 text-blue-600" />
          Branch Location Portals
        </DropdownMenuLabel>
        <DropdownMenuSeparator />

        {/* All Branches Overview */}
        <DropdownMenuItem
          onClick={() => selectBranch('all')}
          className={`px-2.5 py-2 rounded-md cursor-pointer flex items-center justify-between text-sm transition-colors ${
            selectedBranchId === 'all' ? 'bg-blue-50/80 font-medium text-blue-900' : 'text-slate-700 hover:bg-slate-50'
          }`}
        >
          <div className="flex items-center gap-2.5">
            <div className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 ${
              selectedBranchId === 'all' ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-600'
            }`}>
              <Building2 className="w-4 h-4" />
            </div>
            <div>
              <p className="font-semibold text-xs">All Branches (Main Clinic)</p>
              <p className="text-[11px] text-slate-500">Unified multi-branch overview</p>
            </div>
          </div>
          {selectedBranchId === 'all' && (
            <Check className="w-4 h-4 text-blue-600 shrink-0" />
          )}
        </DropdownMenuItem>

        <DropdownMenuSeparator className="my-1" />

        {/* Individual Branch Portals */}
        {branches.map((branch) => {
          const isSelected = selectedBranchId === branch.branch_id ||
            selectedBranch?.branch_id === branch.branch_id ||
            (selectedBranch?.abbreviation && selectedBranch.abbreviation.toLowerCase() === branch.abbreviation.toLowerCase());

          return (
            <DropdownMenuItem
              key={branch.branch_id}
              onClick={() => selectBranch(branch.branch_id)}
              className={`px-2.5 py-2.5 rounded-md cursor-pointer flex items-start justify-between text-sm transition-colors mb-0.5 ${
                isSelected ? 'bg-blue-50/90 font-medium text-blue-950' : 'text-slate-700 hover:bg-slate-50'
              }`}
            >
              <div className="flex items-start gap-2.5 min-w-0 flex-1">
                <div className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 mt-0.5 ${
                  isSelected ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-600'
                }`}>
                  <Store className="w-4 h-4" />
                </div>
                <div className="min-w-0 flex-1 pr-2">
                  <div className="flex items-center gap-1.5">
                    <p className="font-semibold text-xs text-slate-900 truncate">
                      {branch.name}
                    </p>
                    <Badge variant="outline" className="text-[9px] px-1 py-0 h-3.5 border-blue-300 text-blue-700">
                      {branch.abbreviation}
                    </Badge>
                  </div>
                  {branch.address && (
                    <p className="text-[11px] text-slate-500 truncate mt-0.5 flex items-center gap-1">
                      <MapPin className="w-2.5 h-2.5 shrink-0 text-slate-400" />
                      <span className="truncate">{branch.address}</span>
                    </p>
                  )}
                  {branch.contact_num && (
                    <p className="text-[10px] text-slate-400 mt-0.5">
                      {branch.contact_num}
                    </p>
                  )}
                </div>
              </div>
              {isSelected && (
                <div className="shrink-0 mt-1">
                  <Check className="w-4 h-4 text-blue-600" />
                </div>
              )}
            </DropdownMenuItem>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
