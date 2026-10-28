import { createContext, useContext } from 'react';

// push({ name: 'match' | 'league' | 'team' | 'player' | 'settings', ...params }), pop(), setTab(key)
export const NavContext = createContext({ push: () => {}, pop: () => {}, setTab: () => {} });
export const useNav = () => useContext(NavContext);
