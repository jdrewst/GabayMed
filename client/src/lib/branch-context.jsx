import React, { createContext, useContext, useState, useEffect } from 'react';
import { branchAPI, DEFAULT_BRANCHES } from '../../services/branch';

const BranchContext = createContext({
  branches: DEFAULT_BRANCHES,
  selectedBranchId: 'all',
  selectedBranch: null,
  selectBranch: () => {},
  rooms: [],
  isBranchPortal: false,
  loading: false
});

export function BranchProvider({ children }) {
  const [branches, setBranches] = useState(DEFAULT_BRANCHES);
  const [selectedBranchId, setSelectedBranchId] = useState(() => branchAPI.getActiveBranchId());
  const [rooms, setRooms] = useState([]);
  const [loading, setLoading] = useState(true);

  // Load branches
  useEffect(() => {
    let active = true;
    const fetchBranches = async () => {
      try {
        setLoading(true);
        const data = await branchAPI.getBranches();
        if (active && Array.isArray(data) && data.length > 0) {
          setBranches(data);
        }
      } catch (err) {
        console.warn('BranchProvider load error:', err);
      } finally {
        if (active) setLoading(false);
      }
    };

    fetchBranches();

    // Listen for branchChanged custom events
    const handleBranchChanged = (e) => {
      const newId = e.detail?.branchId;
      if (newId) setSelectedBranchId(newId);
    };

    // Listen for popstate (browser back/forward or pushState)
    const handlePopState = () => {
      const fromUrl = branchAPI.getActiveBranchId();
      setSelectedBranchId(fromUrl);
    };

    window.addEventListener('branchChanged', handleBranchChanged);
    window.addEventListener('popstate', handlePopState);

    return () => {
      active = false;
      window.removeEventListener('branchChanged', handleBranchChanged);
      window.removeEventListener('popstate', handlePopState);
    };
  }, []);

  // Update rooms whenever selectedBranchId or branches change
  useEffect(() => {
    let active = true;
    const loadRooms = async () => {
      const roomsList = await branchAPI.getRoomsForBranch(selectedBranchId, branches);
      if (active) setRooms(roomsList);
    };
    loadRooms();
    return () => { active = false; };
  }, [selectedBranchId, branches]);

  const selectBranch = (branchId) => {
    setSelectedBranchId(branchId);
    branchAPI.setActiveBranchId(branchId);
  };

  const selectedBranch = selectedBranchId === 'all'
    ? null
    : branches.find(
        b => b.branch_id === selectedBranchId ||
             b.abbreviation.toLowerCase() === selectedBranchId.toLowerCase() ||
             b.name.toLowerCase().includes(selectedBranchId.toLowerCase().replace(/-branch$/, ''))
      ) || null;

  const value = {
    branches,
    selectedBranchId,
    selectedBranch,
    selectBranch,
    rooms,
    isBranchPortal: selectedBranchId !== 'all' && !!selectedBranch,
    loading
  };

  return (
    <BranchContext.Provider value={value}>
      {children}
    </BranchContext.Provider>
  );
}

export function useBranch() {
  return useContext(BranchContext);
}
