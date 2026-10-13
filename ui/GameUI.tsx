import React, { useEffect } from 'react';
import { AnimatePresence } from 'framer-motion';
import { useGameStore } from '../store';
import { useShallow } from 'zustand/react/shallow';
import { GameStatus } from '../types';
import { HUD } from './hud/HUD';
import { Notifications } from './hud/Overlays';
import { MainMenu } from './screens/MainMenu';
import { WaveReward } from './screens/WaveReward';
import { GameOver } from './screens/GameOver';
import { PauseMenu, SettingsDialog } from './screens/PauseMenu';
import { CodexDialog } from './screens/Codex';
import { InventoryPanel } from './panels/Inventory';
import { CharacterSheet } from './panels/CharacterSheet';
import { ShopPanel } from './panels/ShopPanel';
import { SellDialog, BuyDialog, GlobalConfirm, SummonReveal } from './panels/Dialogs';
import { TooltipLayer, hideTip } from './components/Tooltip';

const HUD_STATUSES = new Set<GameStatus>([GameStatus.PLAYING, GameStatus.PAUSED, GameStatus.LEVEL_UP, GameStatus.INVENTORY, GameStatus.SHOP]);

/** UI root. pointer-events none so the canvas still receives clicks; panels opt in with .pe */
export const GameUI: React.FC = () => {
  const { status, inv, shop, chr } = useGameStore(useShallow((s) => ({
    status: s.status, inv: s.isInventoryOpen, shop: s.isShopOpen, chr: s.isCharacterSheetOpen,
  })));
  const inGame = HUD_STATUSES.has(status);

  // tooltips must never outlive the element that spawned them
  useEffect(() => { hideTip(); }, [status, inv, shop, chr]);

  return (
    <div className="hud-root" style={{ zIndex: 10 }}>
      {status === GameStatus.MENU && <MainMenu />}
      {inGame && <HUD />}
      <AnimatePresence>
        {inGame && (inv || shop) && <InventoryPanel key="inv" />}
        {inGame && shop && <ShopPanel key="shop" />}
        {inGame && chr && <CharacterSheet key="chr" />}
      </AnimatePresence>
      <AnimatePresence>{status === GameStatus.LEVEL_UP && <WaveReward key="reward" />}</AnimatePresence>
      <AnimatePresence>{status === GameStatus.GAME_OVER && <GameOver key="over" />}</AnimatePresence>

      <Notifications />
      <PauseMenu />
      <SellDialog />
      <BuyDialog />
      <SettingsDialog />
      <CodexDialog />
      <GlobalConfirm />
      <SummonReveal />
      <TooltipLayer />
    </div>
  );
};
