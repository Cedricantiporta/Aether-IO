import { takeAutoplay } from '../characters';
import React, { useEffect } from 'react';
import { AnimatePresence } from 'framer-motion';
import { useGameStore } from '../store';
import { useShallow } from 'zustand/react/shallow';
import { GameStatus } from '../types';
import { HUD } from './hud/HUD';
import { TouchControls } from './hud/TouchControls';
import { InteractPrompt } from './hud/InteractPrompt';
import { Dialogue } from './hud/Dialogue';
import { SpeechBubbles } from './hud/SpeechBubbles';
import { TownFade } from './hud/TownFade';
import { device } from '../engine/device';
import { FpsCounter } from './hud/FpsCounter';
import { RotateHint } from './screens/RotateHint';
import { Notifications } from './hud/Overlays';
import { TitleScreen, VillageHUD } from './screens/MainMenu';
import { CharacterSelect } from './screens/CharacterSelect';
import { useSeen } from './lib/alerts';
import { useUiStore } from './uiStore';
import { WaveReward } from './screens/WaveReward';
import { GameOver } from './screens/GameOver';
import { SetOutWindow } from './screens/SetOut';
import { EndingScreen } from './screens/Ending';
import { Prologue, StoryBook } from './screens/Story';
import { PauseMenu, SettingsDialog } from './screens/PauseMenu';
import { CodexDialog } from './screens/Codex';
import { GoalsDialog } from './screens/Goals';
import '../goalsTracker';
import { InventoryPanel } from './panels/Inventory';
import { CharacterSheet } from './panels/CharacterSheet';
import { ShopPanel } from './panels/ShopPanel';
import { SummonWindow } from './panels/SummonWindow';
import { TutorialHint } from './hud/TutorialHint';
import { QuestLog } from './screens/QuestLog';
import { SellDialog, BuyDialog, GlobalConfirm, SummonReveal } from './panels/Dialogs';
import { TooltipLayer, hideTip } from './components/Tooltip';

const HUD_STATUSES = new Set<GameStatus>([GameStatus.PLAYING, GameStatus.PAUSED, GameStatus.LEVEL_UP, GameStatus.INVENTORY, GameStatus.SHOP]);

/** UI root. pointer-events none so the canvas still receives clicks; panels opt in with .pe */
export const GameUI: React.FC = () => {
  const { status, inv, shop, bagShop, chr, summonTab, techTab } = useGameStore(useShallow((s) => ({
    status: s.status, inv: s.isInventoryOpen, shop: s.isShopOpen, bagShop: s.isShopOpen && ['SUPPLIES', 'PETS', 'BLACKSMITH', 'ARMORY', 'WAREHOUSE', 'BREWER'].includes(s.activeShopTab), chr: s.isCharacterSheetOpen, summonTab: s.activeShopTab === 'SUMMON' || s.activeShopTab === 'TECH', techTab: s.activeShopTab === 'TECH',
  })));
  const titleDone = useUiStore((s) => s.titleDone);
  const charSelect = useUiStore((s) => s.charSelect);
  const village = status === GameStatus.MENU && titleDone;
  const inGame = HUD_STATUSES.has(status);
  const panels = inGame || village;

  // back from a character switch (page reload): straight into the town
  useEffect(() => { if (takeAutoplay()) useUiStore.getState().setCharSelect(false); }, []);

  // opening the bag / codex clears their red dots
  const codexOpen = useUiStore((s) => s.codexOpen);
  useEffect(() => { if (inv) useSeen.getState().markBag(); }, [inv]);
  useEffect(() => { if (codexOpen) useSeen.getState().markCodex(); }, [codexOpen]);

  // tooltips must never outlive the element that spawned them
  useEffect(() => { hideTip(); }, [status, inv, shop, chr]);

  return (
    <div className="hud-root" style={{ zIndex: 10 }}>
      {status === GameStatus.MENU && !titleDone && !charSelect && <TitleScreen />}
      {status === GameStatus.MENU && charSelect && <CharacterSelect />}
      {village && <VillageHUD />}
      {inGame && <HUD />}
      {(inGame || village) && device.touch && <TouchControls />}
      {village && <SpeechBubbles />}
      {(village || inGame) && <InteractPrompt />}
      {(village || inGame) && <TutorialHint />}
      {(village || inGame) && <Dialogue />}
      {village && <TownFade />}
      <AnimatePresence>
        {panels && (inv || bagShop) && <InventoryPanel key="inv" />}
        {panels && shop && !summonTab && <ShopPanel key="shop" />}
        {panels && shop && summonTab && <SummonWindow key="summon" />}
        {panels && chr && <CharacterSheet key="chr" />}
      </AnimatePresence>
      <AnimatePresence>{status === GameStatus.LEVEL_UP && <WaveReward key="reward" />}</AnimatePresence>
      <AnimatePresence>{status === GameStatus.GAME_OVER && <GameOver key="over" />}</AnimatePresence>
      {village && <SetOutWindow />}
      <EndingScreen />
      {village && <Prologue />}
      <StoryBook />

      <Notifications />
      <PauseMenu />
      <SellDialog />
      <BuyDialog />
      <SettingsDialog />
      <CodexDialog />
      <GoalsDialog />
      <QuestLog />
      <GlobalConfirm />
      <SummonReveal />
      <TooltipLayer />
      <FpsCounter />
      <RotateHint />
    </div>
  );
};
