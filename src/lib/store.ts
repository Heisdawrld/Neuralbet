import { create } from 'zustand';
import type { NavTab } from './types';

interface AppState {
  activeTab: NavTab;
  setActiveTab: (tab: NavTab) => void;
  selectedDate: string;
  setSelectedDate: (date: string) => void;
  selectedLeague: number | null;
  setSelectedLeague: (leagueId: number | null) => void;
  sidebarCollapsed: boolean;
  setSidebarCollapsed: (collapsed: boolean) => void;
  selectedLeagueForStandings: number | null;
  setSelectedLeagueForStandings: (id: number | null) => void;
  // Match Detail Panel
  selectedMatchId: number | null;
  isMatchPanelOpen: boolean;
  openMatchPanel: (matchId: number) => void;
  closeMatchPanel: () => void;
}

export const useAppStore = create<AppState>((set) => ({
  activeTab: 'dashboard',
  setActiveTab: (tab) => set({ activeTab: tab }),
  selectedDate: new Date().toISOString().split('T')[0],
  setSelectedDate: (date) => set({ selectedDate: date }),
  selectedLeague: null,
  setSelectedLeague: (leagueId) => set({ selectedLeague: leagueId }),
  sidebarCollapsed: false,
  setSidebarCollapsed: (collapsed) => set({ sidebarCollapsed: collapsed }),
  selectedLeagueForStandings: null,
  setSelectedLeagueForStandings: (id) => set({ selectedLeagueForStandings: id }),
  // Match Detail Panel
  selectedMatchId: null,
  isMatchPanelOpen: false,
  openMatchPanel: (matchId) => set({ selectedMatchId: matchId, isMatchPanelOpen: true }),
  closeMatchPanel: () => set({ isMatchPanelOpen: false, selectedMatchId: null }),
}));
