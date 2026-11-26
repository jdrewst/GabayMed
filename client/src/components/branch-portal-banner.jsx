import React from 'react';
import { MapPin, Phone, Mail, Clock, Store, ArrowRight, Building2 } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { useBranch } from '@/lib/branch-context';

export function BranchPortalBanner({ className = '' }) {
  const { isBranchPortal, selectedBranch, selectBranch } = useBranch();

  if (!isBranchPortal || !selectedBranch) return null;

  return (
    <div
      className={`rounded-2xl border border-blue-200/90 bg-gradient-to-r from-blue-50/90 via-sky-50/60 to-indigo-50/50 p-4 md:p-5 shadow-sm mb-6 ${className}`}
    >
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-start gap-3.5">
          <div className="w-12 h-12 rounded-xl bg-blue-600 text-white flex items-center justify-center font-bold text-lg shadow-md shrink-0">
            {selectedBranch.abbreviation || <Store className="w-6 h-6" />}
          </div>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h2 className="text-xl font-bold text-slate-900 tracking-tight">
                {selectedBranch.name} Portal
              </h2>
              <Badge className="bg-blue-600 hover:bg-blue-700 text-white text-[11px] font-semibold px-2 py-0.5">
                Branch View Active
              </Badge>
            </div>
            {selectedBranch.address && (
              <p className="text-xs text-slate-600 mt-1 flex items-center gap-1.5">
                <MapPin className="w-3.5 h-3.5 text-blue-600 shrink-0" />
                <span>{selectedBranch.address}</span>
              </p>
            )}
            <div className="flex items-center gap-4 mt-1.5 text-xs text-slate-500 flex-wrap">
              {selectedBranch.contact_num && (
                <span className="flex items-center gap-1">
                  <Phone className="w-3 h-3 text-slate-400" />
                  {selectedBranch.contact_num}
                </span>
              )}
              {selectedBranch.email && (
                <span className="flex items-center gap-1">
                  <Mail className="w-3 h-3 text-slate-400" />
                  {selectedBranch.email}
                </span>
              )}
              {selectedBranch.operating_hours && (
                <span className="flex items-center gap-1">
                  <Clock className="w-3 h-3 text-slate-400" />
                  {selectedBranch.operating_hours}
                </span>
              )}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2 self-start md:self-center shrink-0">
          <Button
            variant="outline"
            size="sm"
            onClick={() => selectBranch('all')}
            className="rounded-full text-xs font-semibold border-slate-300 text-slate-700 hover:bg-white"
          >
            <Building2 className="w-3.5 h-3.5 mr-1 text-slate-500" />
            Switch to All Branches
          </Button>
        </div>
      </div>
    </div>
  );
}
