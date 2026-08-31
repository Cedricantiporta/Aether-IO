
import React, { useEffect, useState, useMemo, useRef, Suspense } from 'react';
import { Canvas } from '@react-three/fiber';
import { useGLTF, PresentationControls } from '@react-three/drei';
import { useGameStore, calculateItemCP, calculateTotalCP } from '../store';
import { GameStatus, Upgrade, Item, Rarity, GameNotification, HeroClass, SkillLevels, ActionResult, PlayerStats } from '../types';
import { UPGRADES_POOL, ITEMS_POOL, HERO_STATS, PETS_POOL, SKILLS_INFO, ARENA_SIZE, SHOP_POSITIONS, RECYCLE_YIELDS, CRAFTING_COSTS, MATERIAL_COMBINE_COST, RARITY_LEVEL_REQ } from '../constants';
import { WEAPON_PATHS } from '../assetConfig';
import {
  Heart, Zap, Sparkles, RotateCcw,
  Backpack, Shield, Sword, Gem, X, User, Flame, Wind, ShoppingBag, Coins, Hammer, MoveRight, Activity, Magnet, Ghost, Dices, Timer, Trash2, CheckCircle2, ShieldCheck, Wand, FlaskConical, CircleDollarSign, Package,
  Crosshair, Axe, Wand2, Hexagon, Layers, BookOpen, Star, ArrowUpCircle, Trophy, RefreshCcw, Anvil, ArrowRight, Sun, Tornado, Skull, Check, AlertTriangle, Book, Search, Lock, ArrowBigRight, Menu, Play, BarChart3, ChevronRight, AlertCircle, Plus, Minus, Recycle, PenTool
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

// Weapon name → GLTF model key
const ITEM_WEAPON_MODEL: Partial<Record<string, keyof typeof WEAPON_PATHS>> = {
  'Shortbow': 'bow', 'Elven Bow': 'bow', 'Composite Bow': 'crossbow', 'Windforce': 'bow', 'Apollo Bow': 'bow',
  'Novice Staff': 'staff', 'Adept Staff': 'staff', 'Inferno Rod': 'wand', 'Archon Staff': 'staff', 'Staff of Aether': 'staff',
  'Hand Axe': 'axe_1h', 'Viking Axe': 'axe_2h', 'Double Axe': 'axe_2h', 'World Breaker': 'axe_2h', 'Titan Killer': 'axe_2h',
};

const WeaponModel: React.FC<{ modelKey: keyof typeof WEAPON_PATHS }> = ({ modelKey }) => {
  const { scene } = useGLTF(WEAPON_PATHS[modelKey]);
  const clone = useMemo(() => scene.clone(), [scene]);
  return (
    <>
      <ambientLight intensity={3} />
      <directionalLight position={[3, 5, 3]} intensity={3} color="#fff8e8" />
      <primitive object={clone} />
    </>
  );
};

const WeaponThumb: React.FC<{ item: Item }> = ({ item }) => {
  const mk = ITEM_WEAPON_MODEL[item.name];
  if (!mk) return null;
  return (
    <Canvas camera={{ position: [0, 0, 2.4], fov: 42 }} style={{ width: '100%', height: '100%' }}>
      <Suspense fallback={null}>
        <PresentationControls global snap speed={2} polar={[-0.3, 0.3]} azimuth={[-Math.PI / 4, Math.PI / 4]}>
          <WeaponModel modelKey={mk} />
        </PresentationControls>
      </Suspense>
    </Canvas>
  );
};

// --- HELPER COMPONENTS ---

const getRarityBg = (rarity?: Rarity) => {
    switch(rarity) {
        case 'MYTHIC': return 'bg-red-100';
        case 'LEGENDARY': return 'bg-yellow-100';
        case 'EPIC': return 'bg-purple-100';
        case 'RARE': return 'bg-blue-100';
        default: return 'bg-slate-200';
    }
};

const getRarityTextColor = (rarity?: Rarity) => {
    switch(rarity) {
        case 'MYTHIC': return 'text-red-600';
        case 'LEGENDARY': return 'text-yellow-600';
        case 'EPIC': return 'text-purple-600';
        case 'RARE': return 'text-blue-600';
        default: return 'text-slate-600';
    }
};

const formatStat = (key: string, value: number): string => {
    if (key === 'critRate' || key === 'dodge' || key === 'cooldownReduction' || key === 'moveSpeed' || key === 'spread') {
        return `+${(value * 100).toFixed(0)}%`;
    }
    if (key === 'critDamage' || key === 'skillDamage') {
        return `+${(value * 100).toFixed(0)}%`;
    }
    return `+${value}`;
};

const ItemIcon: React.FC<{ item: Item; size?: number }> = ({ item, size = 24 }) => {
  const f = (color: string) => ({ fill: color, strokeWidth: 0, style: { color } });

  if (item.type === 'POTION') {
    const c = item.name.toLowerCase().includes('mana') ? '#60a5fa' : '#f87171';
    return <FlaskConical size={size} {...f(c)} />;
  }
  if (item.type === 'CORE') return <Hexagon size={size} {...f('#818cf8')} />;
  if (item.type === 'REVIVE') return <Heart size={size} {...f('#fbbf24')} />;

  const rarityColor = item.rarity === 'MYTHIC' ? '#f87171' : item.rarity === 'LEGENDARY' ? '#fbbf24' : item.rarity === 'EPIC' ? '#c084fc' : item.rarity === 'RARE' ? '#60a5fa' : '#94a3b8';

  if (item.type === 'WEAPON') {
    if ((item as any).projectileType === 'MAGIC') return <Wand2 size={size} {...f('#60a5fa')} />;
    if ((item as any).projectileType === 'ARROW') return <Crosshair size={size} {...f('#4ade80')} />;
    if ((item as any).projectileType === 'AXE')   return <Axe size={size} {...f('#f87171')} />;
    return <Sword size={size} {...f(rarityColor)} />;
  }
  if (item.type === 'ARMOR')     return <Shield size={size} {...f('#93c5fd')} />;
  if (item.type === 'ACCESSORY') return <Gem size={size} {...f('#c084fc')} />;
  if (item.type === 'PET')       return <Ghost size={size} {...f('#f9a8d4')} />;
  return <Package size={size} style={{ color: '#94a3b8' }} />;
};

const NotificationItem: React.FC<{ note: GameNotification; onRemove: (id: string) => void }> = React.memo(({ note, onRemove }) => {
    useEffect(() => {
        if (!note.persistent) {
            const timer = setTimeout(() => onRemove(note.id), 3000);
            return () => clearTimeout(timer);
        }
    }, [note.persistent]);

    return (
        <motion.div
            initial={{ y: -20, opacity: 0, scale: 0.9 }}
            animate={{ y: 0, opacity: 1, scale: 1 }}
            exit={{ y: -20, opacity: 0, scale: 0.9 }}
            layout
            className="mb-1 px-3 py-2 rounded text-white flex items-center gap-2.5 pointer-events-auto min-w-[180px]"
            style={{ background: 'linear-gradient(180deg,rgba(28,28,40,0.97) 0%,rgba(16,16,24,0.97) 100%)', border: '1px solid rgba(180,150,70,0.25)', boxShadow: '0 4px 12px rgba(0,0,0,0.7), inset 0 1px 0 rgba(255,255,255,0.04)' }}
        >
            <div className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: note.color }} />
            <div className="font-bold text-xs tracking-wide rpg-text">{note.message}</div>
            {note.action && (
                <button
                    onClick={() => { note.action!.onClick(); onRemove(note.id); }}
                    className="ml-auto text-[9px] text-white px-2 py-0.5 rounded font-black uppercase"
                    style={{ background: 'rgba(180,150,70,0.25)', border: '1px solid rgba(180,150,70,0.35)' }}
                >
                    {note.action.label}
                </button>
            )}
        </motion.div>
    );
});

const WarningNotification: React.FC<{ note: GameNotification; onRemove: (id: string) => void }> = React.memo(({ note, onRemove }) => {
    useEffect(() => {
        const timer = setTimeout(() => onRemove(note.id), 2000);
        return () => clearTimeout(timer);
    }, []);

    return (
        <motion.div
            initial={{ y: -50, opacity: 0, scale: 0.5 }}
            animate={{ y: 0, opacity: 1, scale: 1 }}
            exit={{ y: -50, opacity: 0, scale: 0.5 }}
            className="text-3xl font-black text-red-500 drop-shadow-[0_2px_4px_rgba(0,0,0,0.8)] stroke-black tracking-tighter text-center"
            style={{ WebkitTextStroke: '1px black' }}
        >
            {note.message}
        </motion.div>
    );
});

const CenterNotification: React.FC<{ note: GameNotification; onRemove: (id: string) => void }> = React.memo(({ note, onRemove }) => {
    useEffect(() => {
        const timer = setTimeout(() => onRemove(note.id), 3000);
        return () => clearTimeout(timer);
    }, []);

    return (
      <motion.div
        initial={{ opacity: 0, y: -20, scale: 0.95 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: -20, scale: 0.95 }}
        className="absolute left-1/2 top-1/3 -translate-x-1/2 w-full max-w-lg pointer-events-auto z-[110]"
      >
        <div className="rounded-3xl p-5 bg-slate-950/95 border border-slate-500/40 shadow-2xl backdrop-blur-xl text-center relative">
            <button onClick={() => onRemove(note.id)} className="absolute top-2 right-2 text-white/40 hover:text-white/80 text-lg font-black leading-none">✕</button>
            <div className="text-sm font-black text-white uppercase tracking-[0.22em] mb-2">{note.message}</div>
            {note.action && (
              <button
                onClick={() => { note.action!.onClick(); onRemove(note.id); }}
                className="mt-2 px-5 py-3 rounded-full bg-amber-400 text-slate-950 font-black uppercase tracking-wider shadow-inner shadow-black/20 hover:bg-amber-300 transition"
              >
                {note.action.label}
              </button>
            )}
        </div>
      </motion.div>
    );
});

const CLASS_COLOR: Record<string, string> = {
    ARCHER:    '#22c55e',
    WIZARD:    '#3b82f6',
    BARBARIAN: '#ef4444',
};

const getLevelReqDesc = (rarity?: Rarity): string => {
    switch(rarity) {
        case 'MYTHIC':    return 'Requires Lv.28';
        case 'LEGENDARY': return 'Requires Lv.21';
        case 'EPIC':      return 'Requires Lv.14';
        case 'RARE':      return 'Requires Lv.7';
        default:          return '';
    }
};

const getRarityBgDark = (rarity?: Rarity): string => {
    switch(rarity) {
        case 'MYTHIC':    return 'rgba(220,38,38,0.18)';
        case 'LEGENDARY': return 'rgba(202,138,4,0.18)';
        case 'EPIC':      return 'rgba(147,51,234,0.18)';
        case 'RARE':      return 'rgba(59,130,246,0.18)';
        default:          return 'rgba(255,255,255,0.04)';
    }
};

const getRarityTextColorDark = (rarity?: Rarity): string => {
    switch(rarity) {
        case 'MYTHIC':    return '#f87171';
        case 'LEGENDARY': return '#fbbf24';
        case 'EPIC':      return '#c084fc';
        case 'RARE':      return '#60a5fa';
        default:          return '#94a3b8';
    }
};

const UniversalSkillSlot: React.FC<{
    icon: React.ReactNode;
    level: number;
    cooldown?: number;
    maxCooldown?: number;
    label?: string;
    desc: string;
    active: boolean;
    manaCost?: number;
    currentMana?: number;
    charges?: number;
    maxCharges?: number;
    heroClass?: string;
    isPassive?: boolean;
    onClick?: () => void;
    onHover?: (desc: string | null) => void;
}> = ({ icon, level, cooldown = 0, maxCooldown = 1, label, desc, active, manaCost = 0, currentMana = 999, charges, maxCharges, heroClass, isPassive, onClick, onHover }) => {

    const actualCost = heroClass === 'WIZARD' ? Math.ceil(manaCost * 1.3) : manaCost;
    const canAfford = currentMana >= actualCost;
    const accent = heroClass ? (CLASS_COLOR[heroClass] ?? '#6366f1') : '#6366f1';

    const isChargingType = maxCharges && maxCharges > 0;
    const showCooldownOverlay = cooldown > 0 && (!isChargingType || (charges !== undefined && charges < maxCharges));
    const percent = Math.min(100, Math.max(0, (cooldown / maxCooldown) * 100));
    const isDimmed = !active || level === 0;
    const isPotion = label === '1' || label === '2';
    const qty = isPotion ? level : 0;
    const slotSize = 'w-14 h-14';

    return (
        <div className="flex flex-col items-center gap-0.5">
            {label && (
                <div className="text-xs font-black text-white/70 uppercase tracking-widest leading-none" style={{ textShadow: '0 1px 3px rgba(0,0,0,1)', WebkitTextStroke: '0.3px rgba(0,0,0,0.6)' }}>{label}</div>
            )}

            <div className="relative group">
                <button
                    onClick={onClick}
                    disabled={!onClick}
                    className={`${slotSize} rounded-lg flex items-center justify-center relative overflow-hidden transition-all
                        ${isDimmed ? 'opacity-35' : ''}
                        ${!canAfford && active && (!isChargingType || charges! > 0) ? 'grayscale' : ''}
                        ${onClick && !isDimmed ? 'cursor-pointer active:scale-95' : 'cursor-default'}
                    `}
                    style={{
                        background: isDimmed ? 'rgba(18,18,24,0.9)' : 'rgba(22,22,30,0.95)',
                        border: isDimmed ? '1px solid rgba(60,60,75,0.45)' : `1.5px solid ${accent}60`,
                        boxShadow: !isDimmed ? `0 0 14px ${accent}28, inset 0 0 10px rgba(0,0,0,0.5)` : 'none',
                    }}
                >
                    <div className="z-0 flex items-center justify-center">{icon}</div>

                    {showCooldownOverlay && (
                        <div className="absolute inset-0 z-10 flex items-center justify-center pointer-events-none"
                            style={{ background: `conic-gradient(rgba(0,0,0,0.82) ${percent}%, transparent ${percent}% 100%)` }}>
                            {!isChargingType && (
                                <span className="text-white font-black text-sm drop-shadow-lg z-20 leading-none"
                                    style={{ textShadow: '0 1px 5px rgba(0,0,0,1)', WebkitTextStroke: '0.5px rgba(0,0,0,0.8)' }}>
                                    {cooldown.toFixed(1)}
                                </span>
                            )}
                        </div>
                    )}

                    {!active && (
                        <div className="absolute inset-0 flex items-center justify-center z-20">
                            <Lock size={14} className="text-gray-700" />
                        </div>
                    )}

                    {!canAfford && active && (!isChargingType || charges! > 0) && manaCost > 0 && (
                        <div className="absolute inset-0 bg-blue-950/50 flex items-center justify-center z-10">
                            <span className="text-blue-300 text-[9px] font-black">MP</span>
                        </div>
                    )}

                    {isPotion && qty > 0 && (
                        <div className="absolute bottom-0 right-0 z-20 px-1 py-0.5 font-black text-white text-xs leading-none"
                            style={{ background: 'rgba(0,0,0,0.8)', borderTopLeftRadius: 4 }}>
                            {qty}
                        </div>
                    )}

                    {isChargingType && active && (
                        <div className="absolute bottom-1 left-0 right-0 flex justify-center gap-1 z-20">
                            {[...Array(maxCharges)].map((_, i) => (
                                <div key={i} className={`w-1.5 h-1.5 rounded-full ${i < (charges || 0) ? 'bg-green-400' : 'bg-gray-700'}`} />
                            ))}
                        </div>
                    )}
                </button>
            </div>

            {/* Skill name — below slot */}
            <div className="text-[10px] font-bold leading-tight text-center max-w-[56px] truncate"
                style={{ color: isDimmed ? 'rgba(100,100,110,0.5)' : 'rgba(220,210,190,0.9)', textShadow: '0 1px 3px rgba(0,0,0,0.8)', WebkitTextStroke: '0.2px rgba(0,0,0,0.5)' }}>
                {desc.split('.')[0].split(':')[0].slice(0, 12)}
            </div>
        </div>
    );
};

const EquipmentSlot: React.FC<{
    type: string;
    label: string;
    item: Item | null;
    onClick: () => void;
    onUpgrade: () => void;
    canUpgrade: boolean;
    onHover: (item: Item | null) => void;
    textColorClass?: string;
    hideUpgrade?: boolean;
}> = ({ type, label, item, onClick, onUpgrade, canUpgrade, onHover, textColorClass, hideUpgrade }) => {
    return (
        <div className="flex flex-col items-center gap-1">
            <button 
                onClick={onClick}
                onMouseEnter={() => item && onHover(item)}
                onMouseLeave={() => onHover(null)}
                className={`w-16 h-16 rounded-2xl flex items-center justify-center relative border-b-4 active:translate-y-1 active:border-b-0 transition-all
                    ${item ? getRarityBg(item.rarity) : 'bg-slate-200'}
                    border-slate-300
                `}
            >
                {item ? <ItemIcon item={item} size={32} /> : <div className="text-slate-400 opacity-50 font-bold text-[10px]">{label}</div>}
                {item && item.level > 1 && (
                     <div className="absolute top-0 right-0 bg-amber-500 text-white text-[9px] px-1.5 py-0.5 rounded-bl-lg font-bold">
                        +{item.level-1}
                     </div>
                )}
            </button>
            <div className="text-[10px] font-bold text-slate-400 uppercase">{label}</div>
        </div>
    );
};

const Minimap: React.FC = () => {
    const { minimapEnemies, playerPosition } = useGameStore();
    const canvasRef = useRef<HTMLCanvasElement>(null);
    
    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;
        
        ctx.clearRect(0, 0, 150, 150);
        
        // Arena is ARENA_SIZE x ARENA_SIZE (120x120)
        // Map 150px = 120 units => scale = 1.25
        const scale = 150 / ARENA_SIZE;
        
        const mapX = (x: number) => (x + ARENA_SIZE/2) * scale;
        const mapZ = (z: number) => (z + ARENA_SIZE/2) * scale;
        
        // Draw Player
        ctx.fillStyle = '#3b82f6'; // Blue
        ctx.beginPath();
        ctx.arc(mapX(playerPosition.x), mapZ(playerPosition.z), 3, 0, Math.PI * 2);
        ctx.fill();
        
        // Enemies
        minimapEnemies.forEach(e => {
            if (e.type === 2) ctx.fillStyle = '#ef4444'; // Boss
            else if (e.type === 5) ctx.fillStyle = '#a855f7'; // Elite
            else ctx.fillStyle = '#ef4444'; 
            
            ctx.beginPath();
            ctx.fillRect(mapX(e.x)-1, mapZ(e.z)-1, 2, 2);
        });
        
    }, [minimapEnemies, playerPosition]);

    return (
        <div className="absolute right-6 bottom-6 w-[150px] h-[150px] overflow-hidden shadow-xl pointer-events-auto" style={{ background: 'rgba(8,8,16,0.88)', border: '1px solid rgba(180,150,70,0.25)', borderRadius: 6 }}>
            <canvas ref={canvasRef} width={150} height={150} />
        </div>
    );
};

export const GameUI: React.FC = () => {
  const {
    status, health, mana, stats, score, gems, level, experience, experienceToNextLevel, skillPoints,
    inventory, maxInventorySlots, materials, equipment, setStatus, skills, skillMaxCooldowns, skillLevels, passiveSkillState,
    startGame, resetGame, applyUpgrade, selectUpgrade, upgradeOptions, equipItem, unequipItem, buyItem, upgradeItem, sellItem, sellItems, autoEquip, selectHero, hero, hpPotionCooldown, mpPotionCooldown,
    wave, waveTimer, recentRuns, bossData, gameStats,
    isInventoryOpen, isShopOpen, toggleInventory, activeShopTab, closeAllUI, openSpecificShop,
    notifications, removeNotification, addNotification, upgradeSkill, toggleCharacterSheet, isCharacterSheetOpen, baseStats, activeAbilityQ, activeAbilityR,
    recycleItem, massRecycle, combineMaterials, craftItem, buyInventorySlots, actionResult, clearActionResult, massSell,
    isCodexOpen, toggleCodex, dashCharges, maxDashCharges, barrierCooldown, shieldCharges, maxShieldCharges, getManaCost,
    revivingCountdown
  } = useGameStore();

  const [hoveredItem, setHoveredItem] = useState<Item | null>(null);
  const [hoveredSkillText, setHoveredSkillText] = useState<string | null>(null);
  const [selectedItem, setSelectedItem] = useState<Item | null>(null);
  const [mousePos, setMousePos] = useState({ x: 0, y: 0 });
  const [blacksmithTab, setBlacksmithTab] = useState<'UPGRADE' | 'RECYCLE' | 'CRAFT'>('UPGRADE');
  const [selectedUpgradeItem, setSelectedUpgradeItem] = useState<Item | null>(null);
  const [panelTab, setPanelTab] = useState<'INVENTORY' | 'CRAFTING' | 'SKILLS' | 'SHOP' | 'CHARACTER'>('INVENTORY');

  const panelOpen = isInventoryOpen || isShopOpen || isCharacterSheetOpen;

  useEffect(() => {
    if (isShopOpen) {
      if (activeShopTab === 'BLACKSMITH') { setPanelTab('CRAFTING'); setBlacksmithTab('UPGRADE'); }
      else if (activeShopTab === 'SKILLS') setPanelTab('SKILLS');
      else setPanelTab('SHOP');
    } else if (isInventoryOpen) setPanelTab('INVENTORY');
    else if (isCharacterSheetOpen) setPanelTab('CHARACTER');
  }, [isShopOpen, isInventoryOpen, isCharacterSheetOpen, activeShopTab]);
  
  // Sell Dialog State
  const [sellDialogItem, setSellDialogItem] = useState<Item | null>(null);
  const [sellAmount, setSellAmount] = useState(1);

  const abilityToCheckR = equipment.weapon?.ability;

  const sortedInventory = useMemo(() => {
    return [...inventory].sort((a, b) => {
        // Sort by Rarity (Mythic > Legend > Epic > Rare > Common)
        const rarityScore = { 'MYTHIC': 5, 'LEGENDARY': 4, 'EPIC': 3, 'RARE': 2, 'COMMON': 1 };
        const rsA = rarityScore[a.rarity];
        const rsB = rarityScore[b.rarity];
        if (rsA !== rsB) return rsB - rsA;

        // Sort by Type (Weapon > Armor > Acc > Pet > Others)
        const typeScore = { 'WEAPON': 6, 'ARMOR': 5, 'ACCESSORY': 4, 'PET': 3, 'POTION': 2, 'CORE': 1, 'REVIVE': 0 };
        // @ts-ignore
        const tsA = typeScore[a.type] || 0;
        // @ts-ignore
        const tsB = typeScore[b.type] || 0;
        if (tsA !== tsB) return tsB - tsA;

        return 0;
    });
  }, [inventory]);

  const hasBetterItem = useMemo(() => {
    return inventory.some(item => {
      if (item.type !== 'WEAPON' && item.type !== 'ARMOR' && item.type !== 'ACCESSORY' && item.type !== 'PET') return false;
      if (RARITY_LEVEL_REQ[item.rarity] > level) return false;
      if (item.classType && item.classType !== hero) return false;
      const equipped = item.type === 'WEAPON' ? equipment.weapon : item.type === 'ARMOR' ? equipment.armor : item.type === 'ACCESSORY' ? equipment.accessory : equipment.pet;
      return calculateItemCP(item) > (equipped ? calculateItemCP(equipped) : 0);
    });
  }, [inventory, equipment, level, hero]);

  // Check if there are skills that can be upgraded
  const hasUpgradableSkills = useMemo(() => {
    return Object.entries(SKILLS_INFO).some(([key, info]) => {
      if ((info as any).classType && (info as any).classType !== hero) return false;
      const sk = key as keyof SkillLevels;
      const lvl = skillLevels[sk];
      if (lvl >= 5) return false; // Max level
      let cost = lvl + 1;
      if (key === 'special') cost = 5;
      if (key === 'dash' || key === 'barrier') cost = lvl + 2;
      return skillPoints >= cost;
    });
  }, [skillLevels, skillPoints, hero]);

  useEffect(() => {
      const handleMouseMove = (e: MouseEvent) => {
          setMousePos({ x: e.clientX, y: e.clientY });
      };
      window.addEventListener('mousemove', handleMouseMove);
      return () => window.removeEventListener('mousemove', handleMouseMove);
  }, []);

  useEffect(() => {
      const handleKey = (e: KeyboardEvent) => {
          if (e.key === 'Escape') closeAllUI();
      };
      window.addEventListener('keydown', handleKey);
      return () => window.removeEventListener('keydown', handleKey);
  }, [closeAllUI]);

  useEffect(() => {
      if (!panelOpen) setHoveredItem(null);
  }, [panelOpen]);

  useEffect(() => {
      if (actionResult) {
          if (actionResult.success && actionResult.type === 'UPGRADE' && actionResult.item) {
              setSelectedUpgradeItem(actionResult.item);
          }
          const timer = setTimeout(() => clearActionResult(), 2000);
          return () => clearTimeout(timer);
      }
  }, [actionResult, clearActionResult]);

  // Skill points persistent notification
  useEffect(() => {
      const existingSpNotif = notifications.find(n => n.message.includes('UPGRADABLE SKILLS'));
      if (hasUpgradableSkills && !existingSpNotif) {
          addNotification('UPGRADABLE SKILLS', '#ec4899', 'SYSTEM', {
              label: 'SKILLS',
              onClick: () => { setPanelTab('SKILLS'); openSpecificShop('SKILLS'); }
          }, true);
      } else if (!hasUpgradableSkills && existingSpNotif) {
          removeNotification(existingSpNotif.id);
      }
  }, [hasUpgradableSkills, notifications, addNotification, removeNotification, openSpecificShop]);

  // Better equipment persistent notification
  useEffect(() => {
      const existingItemNotif = notifications.find(n => n.message.includes('BETTER ITEMS'));
      if (hasBetterItem && !existingItemNotif) {
          addNotification('BETTER ITEMS', '#3b82f6', 'SYSTEM', {
              label: 'EQUIP',
              onClick: () => { setPanelTab('INVENTORY'); toggleInventory(); }
          }, true);
      } else if (!hasBetterItem && existingItemNotif) {
          removeNotification(existingItemNotif.id);
      }
  }, [hasBetterItem, notifications, addNotification, removeNotification, toggleInventory]);

  const onInventoryItemClick = (item: Item) => {
      if (isShopOpen) {
          if (activeShopTab === 'BLACKSMITH') {
              if (blacksmithTab === 'RECYCLE') {
                  recycleItem(item);
              } else if (blacksmithTab === 'UPGRADE') {
                  setSelectedUpgradeItem(item);
              } else {
                  // For craft tab, usually nothing to click in inventory unless refining
              }
          } else {
              // Open Sell Dialog
              setSellDialogItem(item);
              setSellAmount(1);
          }
      } else {
          // Equip if possible
          if (item.type !== 'POTION' && item.type !== 'CORE' && item.type !== 'REVIVE') {
              equipItem(item);
          }
      }
  };
  
  const handleConfirmSell = () => {
      if (sellDialogItem) {
          sellItem(sellDialogItem, sellAmount);
          setSellDialogItem(null);
          setSellAmount(1);
      }
  };

  const hpPercent = (health / stats.maxHealth) * 100;
  const manaPercent = (mana / stats.maxMana) * 100;
  const xpPercent = (experience / experienceToNextLevel) * 100;
  const currentCP = calculateTotalCP(stats);

  const hasAlerts = hasUpgradableSkills || hasBetterItem;

  const hpPotion = inventory.find(i => i.type === 'POTION' && i.name.includes('Health'));
  const manaPotion = inventory.find(i => i.type === 'POTION' && i.name.includes('Mana'));

  let weaponAbilityDesc = "Basic Attack.";
  if (equipment.weapon?.ability === 'FIREBALL') weaponAbilityDesc = "Shoots a slow giant fireball.";
  else if (equipment.weapon?.ability === 'ARROW_RAIN') weaponAbilityDesc = "Fires waves of arrows.";
  else if (equipment.weapon?.ability === 'AXE_SPIN') weaponAbilityDesc = "Spinning blade barrier.";
  
  let qAbilityDesc = "Locked.";
  if (activeAbilityQ === 'PIERCING_SHOT') qAbilityDesc = "Massive piercing arrow.";
  else if (activeAbilityQ === 'GRAVITY_SPELL') qAbilityDesc = "Summons blackhole.";
  else if (activeAbilityQ === 'RAGE') qAbilityDesc = "Doubles Attack Speed.";

  let eAbilityDesc = "Locked. (Requires 5 SP)";
  let eAbilityIcon = <div className="text-slate-400 text-xs font-bold">LOCKED</div>;
  if (hero === 'BARBARIAN') {
      eAbilityDesc = "War Vitality: Regenerate 10 HP/s for 6s.";
      eAbilityIcon = <Heart size={28} className={skills.e > 0 ? 'text-red-500' : 'text-slate-400'} />;
  } else if (hero === 'WIZARD') {
      eAbilityDesc = "Earthwall: Create a defensive barrier for 4s.";
      eAbilityIcon = <ShieldCheck size={28} className={skills.e > 0 ? 'text-amber-700' : 'text-slate-400'} />;
  } else if (hero === 'ARCHER') {
      eAbilityDesc = "Wind Sprint: 2x Speed & Invincible for 4s.";
      eAbilityIcon = <Wind size={28} className={skills.e > 0 ? 'text-green-500' : 'text-slate-400'} />;
  }

  // --- Render Helpers for Shops/Modals ---
  
  const StatRow = ({ label, value }: { label: string, value: string }) => (
      <div className="flex justify-between items-center text-xs py-2 border-b border-slate-100 last:border-0">
          <span className="text-slate-500 font-bold uppercase tracking-wider">{label}</span>
          <span className="font-mono font-bold text-slate-800">{value}</span>
      </div>
  );

  return (
    <div className="absolute inset-0 pointer-events-none z-10 font-sans text-slate-800 select-none">


      {/* WARNING NOTIFICATIONS - TOP CENTER */}
      <div className="absolute top-24 left-1/2 -translate-x-1/2 flex flex-col gap-2 items-center pointer-events-none z-[100] w-full">
          <AnimatePresence>
              {notifications.filter(n => n.type === 'WARNING').map((note) => (
                  <WarningNotification key={note.id} note={note} onRemove={removeNotification} />
              ))}
          </AnimatePresence>
      </div>

      {/* LOBBY / HERO SELECT */}
      {status === GameStatus.MENU && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/80 backdrop-blur-xl pointer-events-auto z-50">
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                className="w-full max-w-5xl px-8 flex flex-col items-center gap-8"
              >
                  <div className="text-center">
                      <h1 className="text-6xl font-black text-white tracking-tight drop-shadow-lg mb-2 rpg-title"
                          style={{ textShadow: '0 0 40px rgba(180,150,70,0.5), 0 2px 8px rgba(0,0,0,0.9)', WebkitTextStroke: '1px rgba(0,0,0,0.5)' }}>
                          AETHER SURVIVOR
                      </h1>
                      <div className="text-slate-400 font-bold tracking-widest text-sm uppercase rpg-text">Choose Your Hero</div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-3 gap-5 w-full">
                      {([
                          { h: 'ARCHER'    as HeroClass, color: '#22c55e', glow: 'rgba(34,197,94,0.25)',  border: 'rgba(34,197,94,0.5)'  },
                          { h: 'WIZARD'    as HeroClass, color: '#3b82f6', glow: 'rgba(59,130,246,0.25)', border: 'rgba(59,130,246,0.5)' },
                          { h: 'BARBARIAN' as HeroClass, color: '#ef4444', glow: 'rgba(239,68,68,0.25)',  border: 'rgba(239,68,68,0.5)'  },
                      ]).map(({ h, color, glow, border }) => (
                          <div
                            key={h}
                            onClick={() => { selectHero(h); startGame(); }}
                            className="relative flex flex-col items-center gap-5 cursor-pointer group transition-transform hover:scale-105 h-88"
                            style={{
                              background: 'rgba(10,10,14,0.92)',
                              border: `1px solid ${border}`,
                              borderRadius: '0.5rem',
                              padding: '2rem 1.5rem',
                              boxShadow: `0 0 0 0 ${glow}`,
                              transition: 'box-shadow 0.25s, transform 0.2s',
                            }}
                            onMouseEnter={e => (e.currentTarget.style.boxShadow = `0 0 32px 4px ${glow}, inset 0 0 40px ${glow}`)}
                            onMouseLeave={e => (e.currentTarget.style.boxShadow = `0 0 0 0 ${glow}`)}
                          >
                              <div
                                className="w-24 h-24 rounded-md flex items-center justify-center mb-1 group-hover:scale-110 transition-transform"
                                style={{ background: `${color}18`, border: `1.5px solid ${color}55` }}
                              >
                                  {h === 'ARCHER'    && <Crosshair size={44} style={{ color }} />}
                                  {h === 'WIZARD'    && <Wand2     size={44} style={{ color }} />}
                                  {h === 'BARBARIAN' && <Axe       size={44} style={{ color }} />}
                              </div>

                              <div className="text-center z-10 flex-1">
                                  <h2 className="text-2xl font-black text-white mb-2 tracking-wider rpg-text" style={{ textShadow: `0 0 16px ${color}88` }}>{h}</h2>
                                  <p className="text-sm text-slate-400 font-medium leading-relaxed px-2">{HERO_STATS[h].description}</p>
                              </div>

                              <div
                                className="mt-2 w-full py-3 rounded font-black text-sm text-center flex items-center justify-center gap-2 transition-opacity rpg-text"
                                style={{ background: color, color: '#fff', boxShadow: `0 4px 16px ${color}55`, WebkitTextStroke: '0.3px rgba(0,0,0,0.6)' }}
                              >
                                  PLAY AS {h} <ArrowRight size={15} />
                              </div>

                              {/* Corner accent */}
                              <div className="absolute top-3 right-3 w-2 h-2 rounded-full" style={{ background: color, boxShadow: `0 0 8px ${color}` }} />
                          </div>
                      ))}
                  </div>

                  <div className="bg-white/5 backdrop-blur-md border border-white/10 p-4 rounded-2xl flex gap-8 text-white shadow-xl">
                      <div className="flex items-center gap-3 px-4 border-r border-white/10">
                          <Trophy size={24} className="text-yellow-400" />
                          <div>
                              <div className="text-[10px] font-bold opacity-50 uppercase tracking-wider">Total Runs</div>
                              <div className="text-xl font-black font-mono">{gameStats.totalRuns}</div>
                          </div>
                      </div>
                      <div className="flex items-center gap-3 px-4">
                          <BarChart3 size={24} className="text-blue-400" />
                          <div>
                              <div className="text-[10px] font-bold opacity-50 uppercase tracking-wider">Highest CP</div>
                              <div className="text-xl font-black font-mono">{gameStats.highestCP.toLocaleString()}</div>
                          </div>
                      </div>
                  </div>
              </motion.div>
          </div>
      )}

      {/* GAME UI */}
      {(status === GameStatus.PLAYING || status === GameStatus.PAUSED || status === GameStatus.INVENTORY || status === GameStatus.SHOP || status === GameStatus.LEVEL_UP) && (
        <div className="absolute inset-0 flex flex-col justify-between p-4 md:p-6 pointer-events-none">
          {/* Top Bar */}
          <div className="flex justify-between items-start pointer-events-auto w-full z-20">

             {/* LEFT: Character portrait + HP/MP/XP bars */}
             <div className="flex items-center" style={{ minWidth: 320 }}>
               {/* Circle portrait */}
               <div className="relative shrink-0 z-10" style={{
                 width: 64, height: 64, borderRadius: '50%',
                 background: `radial-gradient(circle at 35% 35%, ${CLASS_COLOR[hero] ?? '#6366f1'}cc, #0a0a12)`,
                 border: `3px solid ${CLASS_COLOR[hero] ?? '#6366f1'}`,
                 boxShadow: `0 0 18px ${CLASS_COLOR[hero] ?? '#6366f1'}88, inset 0 2px 8px rgba(0,0,0,0.7)`,
                 display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center'
               }}>
                 <span className="text-[9px] font-black text-white/70 uppercase tracking-widest">{hero.slice(0,3)}</span>
                 <span className="text-sm font-black text-white rpg-text">LV{level}</span>
               </div>
               {/* Bars */}
               <div className="flex flex-col gap-1.5 -ml-3" style={{ width: 260 }}>
                 {/* HP */}
                 <div className="relative h-5 rounded-r-full overflow-hidden" style={{ background: 'rgba(0,0,0,0.75)', border: '1px solid rgba(220,40,40,0.4)', boxShadow: '0 0 8px rgba(220,40,40,0.3)', paddingLeft: 12 }}>
                   <div className="absolute inset-y-0 left-3 right-0 rounded-r-full overflow-hidden">
                     <div style={{ width: `${hpPercent}%`, height: '100%', background: 'linear-gradient(90deg,#b91c1c,#ef4444,#ff6b6b)', transition: 'width 0.15s', boxShadow: '2px 0 8px #ef444488' }} />
                   </div>
                   <span className="absolute inset-0 flex items-center justify-center text-[9px] font-black text-white drop-shadow z-10" style={{ paddingLeft: 12 }}>{Math.ceil(health)}/{stats.maxHealth}</span>
                 </div>
                 {/* MP */}
                 <div className="relative h-4 rounded-r-full overflow-hidden" style={{ background: 'rgba(0,0,0,0.75)', border: '1px solid rgba(59,130,246,0.4)', boxShadow: '0 0 8px rgba(59,130,246,0.3)', paddingLeft: 12 }}>
                   <div className="absolute inset-y-0 left-3 right-0 rounded-r-full overflow-hidden">
                     <div style={{ width: `${manaPercent}%`, height: '100%', background: 'linear-gradient(90deg,#1d4ed8,#3b82f6,#60a5fa)', transition: 'width 0.15s', boxShadow: '2px 0 8px #3b82f688' }} />
                   </div>
                   <span className="absolute inset-0 flex items-center justify-center text-[9px] font-black text-white drop-shadow z-10" style={{ paddingLeft: 12 }}>{Math.ceil(mana)}/{stats.maxMana}</span>
                 </div>
                 {/* XP */}
                 <div className="relative h-2.5 rounded-r-full overflow-hidden" style={{ background: 'rgba(0,0,0,0.75)', border: '1px solid rgba(34,197,94,0.4)', paddingLeft: 12 }}>
                   <div className="absolute inset-y-0 left-3 right-0 rounded-r-full overflow-hidden">
                     <div style={{ width: `${xpPercent}%`, height: '100%', background: 'linear-gradient(90deg,#15803d,#22c55e)', transition: 'width 0.3s' }} />
                   </div>
                 </div>
                 <span className="text-[9px] font-bold uppercase tracking-widest -mt-0.5" style={{ color: CLASS_COLOR[hero] ?? '#6366f1', paddingLeft: 14 }}>{hero} · LV{level}</span>
               </div>
             </div>

             {/* Center: Wave + Boss */}
             <div className="flex flex-col items-center flex-1 mx-4 relative">
                 {bossData.active ? (
                     <div className="w-full max-w-md rounded-md p-2 shadow-xl" style={{background:'rgba(12,12,18,0.92)',border:'2px solid rgba(239,68,68,0.4)'}}>
                         <div className="flex justify-between text-xs font-black text-red-400 mb-1.5 px-2 uppercase rpg-text">
                             <span>{bossData.name}</span>
                             <span>{Math.ceil(bossData.hp).toLocaleString()}</span>
                         </div>
                         <div className="h-3 rounded-sm overflow-hidden" style={{background:'rgba(255,255,255,0.08)'}}>
                             <motion.div className="h-full" animate={{ width: `${Math.max(0, (bossData.hp / bossData.maxHp) * 100)}%` }} style={{ background: 'linear-gradient(90deg,#b91c1c,#ef4444)' }}/>
                         </div>
                     </div>
                 ) : (
                     <div className="flex items-center gap-3">
                         <div className="text-3xl font-black text-white rpg-text" style={{ textShadow: '0 2px 4px rgba(0,0,0,0.9)', WebkitTextStroke: '0.5px rgba(0,0,0,0.7)' }}>
                             WAVE {wave}
                         </div>
                         <div className="text-white/50 font-bold text-sm flex items-center gap-1">
                             <Timer size={11}/> <span className="text-lg font-black text-white/70">{Math.max(0, 30 - Math.floor(waveTimer))}</span>s
                         </div>
                         {waveTimer > 20 && (
                             <motion.div initial={{ scale: 0.5, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}
                                className="px-3 py-0.5 bg-red-500/80 text-white font-black text-xs rounded animate-pulse border border-red-400/60 rpg-text">
                                 NEXT WAVE
                             </motion.div>
                         )}
                     </div>
                 )}
             </div>

             {/* Top bar notifications removed */}

             {/* RIGHT: Coins + Menu Icons */}
             <div className="flex items-center gap-6">
                 <div className="flex items-center gap-2">
                    <Coins size={20} className="text-yellow-400" style={{ filter: 'drop-shadow(0 0 6px #fbbf24)' }}/>
                    <span className="font-black text-yellow-300 text-2xl rpg-text" style={{ textShadow: '0 0 12px #fbbf2488, 0 2px 4px rgba(0,0,0,0.9)' }}>{score.toLocaleString()}</span>
                 </div>

                 <div className="flex items-center gap-2">
                    {[
                        { id: 'INVENTORY', icon: Backpack, label: 'BAG', action: toggleInventory, dot: hasBetterItem },
                        { id: 'SHOP', icon: ShoppingBag, label: 'SHOP', action: () => openSpecificShop('SUPPLIES'), dot: false },
                        { id: 'CRAFTING', icon: Hammer, label: 'FORGE', action: () => openSpecificShop('BLACKSMITH'), dot: false },
                        { id: 'CHARACTER', icon: User, label: 'HERO', action: toggleCharacterSheet, dot: false },
                        { id: 'SKILLS', icon: Star, label: 'SKILLS', action: () => openSpecificShop('SKILLS'), dot: hasUpgradableSkills },
                    ].map((item) => (
                        <button
                            key={item.id}
                            onClick={() => {
                                if (panelTab === item.id && panelOpen) {
                                    closeAllUI();
                                } else {
                                    setPanelTab(item.id as any);
                                    item.action();
                                }
                            }}
                            className="relative w-10 h-10 rounded-lg flex flex-col items-center justify-center transition-all hover:bg-white/10"
                            style={{
                                background: panelTab === item.id && panelOpen ? 'rgba(255,255,255,0.15)' : 'rgba(0,0,0,0.4)',
                                border: `1px solid ${panelTab === item.id && panelOpen ? 'rgba(255,255,255,0.3)' : 'rgba(255,255,255,0.1)'}`,
                                color: panelTab === item.id && panelOpen ? '#fbbf24' : '#cbd5e1'
                            }}
                        >
                            <item.icon size={18} />
                            <span className="text-[6px] font-black uppercase mt-0.5">{item.label}</span>
                            {item.dot && (
                                <div className="absolute top-1 right-1 w-2 h-2 bg-red-500 rounded-full border border-black animate-pulse" />
                            )}
                        </button>
                    ))}
                 </div>
             </div>
          </div>

          {/* BOTTOM HOTBAR */}
          {(() => {
            const c = CLASS_COLOR[hero] ?? '#6366f1';
            const fireKey = (code: string) => {
              window.dispatchEvent(new KeyboardEvent('keydown', { code, bubbles: true }));
              setTimeout(() => window.dispatchEvent(new KeyboardEvent('keyup', { code, bubbles: true })), 120);
            };
            // Fill icon helper — solid fill, no stroke
            const fi = (Icon: any, size = 28) => <Icon size={size} fill={c} strokeWidth={0} style={{ color: c }} />;
            const fiC = (Icon: any, color: string, size = 24) => <Icon size={size} fill={color} strokeWidth={0} style={{ color }} />;

            const weaponIcon = abilityToCheckR === 'FIREBALL' ? fi(Flame) :
                               abilityToCheckR === 'AXE_SPIN' ? fi(RotateCcw) : fi(Zap);
            const qIcon = activeAbilityQ === 'PIERCING_SHOT' ? fi(Crosshair) :
                          activeAbilityQ === 'GRAVITY_SPELL' ? fi(Hexagon) :
                          activeAbilityQ === 'RAGE'          ? fi(Flame) :
                          activeAbilityQ ? fi(Star) : <Lock size={22} className="text-gray-700"/>;
            const eIcon = hero === 'BARBARIAN' ? fi(Heart) : hero === 'WIZARD' ? fi(ShieldCheck) : fi(Wind);

            return (
            <div className="flex flex-col gap-1 w-full max-w-5xl mx-auto pb-4 items-center z-20 pointer-events-auto">
              <div className="flex justify-center items-end gap-3">

                {/* Q = weapon ability */}
                <UniversalSkillSlot
                    icon={weaponIcon}
                    level={skillLevels.weapon} cooldown={skills.r} maxCooldown={skillMaxCooldowns.r * (1 - stats.cooldownReduction)}
                    label="Q" desc={weaponAbilityDesc} active={true}
                    manaCost={getManaCost('r')} currentMana={mana} heroClass={hero}
                    onClick={() => fireKey('KeyQ')}
                    onHover={(text) => setHoveredSkillText(text)}
                />

                {/* E = special */}
                <UniversalSkillSlot
                    icon={eIcon} level={skillLevels.special} cooldown={skills.e} maxCooldown={skillMaxCooldowns.e * (1 - stats.cooldownReduction)}
                    label="E" desc={eAbilityDesc} active={skillLevels.special > 0}
                    manaCost={getManaCost('e')} currentMana={mana} heroClass={hero}
                    onClick={() => fireKey('KeyE')}
                    onHover={(text) => setHoveredSkillText(text)}
                />

                {/* R = active skill */}
                <UniversalSkillSlot
                    icon={qIcon}
                    level={1} cooldown={skills.q} maxCooldown={skillMaxCooldowns.q * (1 - stats.cooldownReduction)}
                    label="R" desc={qAbilityDesc} active={!!activeAbilityQ}
                    manaCost={getManaCost('q')} currentMana={mana} heroClass={hero}
                    onClick={() => fireKey('KeyR')}
                    onHover={(text) => setHoveredSkillText(text)}
                />

                <div className="w-px h-12 bg-white/15 self-center mx-0.5" />

                {/* SPACE = dash */}
                <UniversalSkillSlot
                    icon={fi(Wind)}
                    level={skillLevels.dash} cooldown={skills.dash} maxCooldown={skillMaxCooldowns.dash * (1 - stats.cooldownReduction)}
                    label="SPC" desc="Dash" active={true}
                    manaCost={getManaCost('dash')} currentMana={mana} heroClass={hero}
                    charges={dashCharges} maxCharges={maxDashCharges}
                    onClick={() => fireKey('Space')}
                    onHover={(text) => setHoveredSkillText(text)}
                />

                <div className="w-px h-12 bg-white/15 self-center mx-0.5" />

                {/* Passive Skills */}
                {(hero === 'WIZARD' || !SKILLS_INFO.thunder.classType) && (
                    <UniversalSkillSlot icon={fi(Zap, 22)} level={skillLevels.thunder} cooldown={passiveSkillState.thunderCooldown} maxCooldown={passiveSkillState.thunderMaxCooldown} desc="Thunder" active={skillLevels.thunder > 0} manaCost={getManaCost('thunder')} currentMana={mana} isPassive onHover={(text) => setHoveredSkillText(text)} />
                )}
                {(hero === 'BARBARIAN' || !SKILLS_INFO.orbital.classType) && (
                    <UniversalSkillSlot icon={fi(Activity, 22)} level={skillLevels.orbital} cooldown={passiveSkillState.orbitalCooldown} maxCooldown={passiveSkillState.orbitalMaxCooldown} desc="Orbital" active={skillLevels.orbital > 0} manaCost={0} currentMana={mana} isPassive onHover={(text) => setHoveredSkillText(text)} />
                )}
                {(hero === 'WIZARD' || !SKILLS_INFO.storm.classType) && (
                    <UniversalSkillSlot icon={fi(Tornado, 22)} level={skillLevels.storm} cooldown={passiveSkillState.stormCooldown} maxCooldown={passiveSkillState.stormMaxCooldown} desc="Storm" active={skillLevels.storm > 0} manaCost={0} currentMana={mana} isPassive onHover={(text) => setHoveredSkillText(text)} />
                )}
                {(hero === 'ARCHER' || !SKILLS_INFO.poison.classType) && (
                    <UniversalSkillSlot icon={fi(Flame, 22)} level={skillLevels.poison} cooldown={passiveSkillState.poisonCooldown} maxCooldown={passiveSkillState.poisonMaxCooldown} desc="Poison" active={skillLevels.poison > 0} manaCost={getManaCost('poison')} currentMana={mana} isPassive onHover={(text) => setHoveredSkillText(text)} />
                )}
                {(hero === 'ARCHER' || !SKILLS_INFO.freezing.classType) && (
                    <UniversalSkillSlot icon={fiC(Gem, '#67e8f9', 22)} level={skillLevels.freezing} cooldown={passiveSkillState.freezingCooldown} maxCooldown={passiveSkillState.freezingMaxCooldown} desc="Freeze" active={skillLevels.freezing > 0} manaCost={getManaCost('freezing')} currentMana={mana} isPassive onHover={(text) => setHoveredSkillText(text)} />
                )}
                {(hero === 'WIZARD' || !SKILLS_INFO.freezeSpell.classType) && (
                    <UniversalSkillSlot icon={fi(Zap, 22)} level={skillLevels.freezeSpell} cooldown={passiveSkillState.blizzardCooldown} maxCooldown={passiveSkillState.blizzardMaxCooldown} desc="Blizzard" active={skillLevels.freezeSpell > 0} manaCost={getManaCost('freezeSpell')} currentMana={mana} isPassive onHover={(text) => setHoveredSkillText(text)} />
                )}
                {(hero === 'BARBARIAN' || !SKILLS_INFO.stamp.classType) && (
                    <UniversalSkillSlot icon={fi(Hammer, 22)} level={skillLevels.stamp} cooldown={passiveSkillState.stampCooldown} maxCooldown={passiveSkillState.stampMaxCooldown} desc="Stamp" active={skillLevels.stamp > 0} manaCost={getManaCost('stamp')} currentMana={mana} isPassive onHover={(text) => setHoveredSkillText(text)} />
                )}
                <UniversalSkillSlot icon={fiC(ShieldCheck, '#fb923c', 22)} level={skillLevels.barrier} desc="Shield" cooldown={barrierCooldown} maxCooldown={Math.max(10, 48-(skillLevels.barrier * 4))} charges={shieldCharges} maxCharges={maxShieldCharges} active={skillLevels.barrier > 0} manaCost={0} currentMana={mana} isPassive onHover={(text) => setHoveredSkillText(text)} />

                <div className="w-px h-12 bg-white/15 self-center mx-0.5" />

                <UniversalSkillSlot icon={fiC(Heart, '#f87171', 20)} level={hpPotion?.quantity || 0} cooldown={hpPotionCooldown} maxCooldown={10} desc="HP Potion" active={true} label="1" onHover={(text) => setHoveredSkillText(text)} />
                <UniversalSkillSlot icon={fiC(FlaskConical, '#60a5fa', 20)} level={manaPotion?.quantity || 0} cooldown={mpPotionCooldown} maxCooldown={10} desc="MP Potion" active={true} label="2" onHover={(text) => setHoveredSkillText(text)} />
              </div>
              {hoveredSkillText && (
                <div className="mt-2 text-xs text-slate-200 font-bold text-center max-w-5xl mx-auto px-2">{hoveredSkillText}</div>
              )}
            </div>
            );
          })()}


          {/* Toast notifications above minimap (right side) */}
          <AnimatePresence>
              {notifications.filter(n => n.type === 'SYSTEM' && !n.message.includes('Spend Unused') && !n.message.includes('Better Equipment') && !n.action).map((note) => (
                  <CenterNotification key={note.id} note={note} onRemove={removeNotification} />
              ))}
          </AnimatePresence>
          <div className="absolute right-6 bottom-48 flex flex-col-reverse gap-1.5 items-end pointer-events-none z-30 w-72">
              <AnimatePresence>
                  {notifications.filter(n => n.type !== 'WARNING' && (n.type !== 'SYSTEM' || n.action)).map((note) => (
                      <NotificationItem key={note.id} note={note} onRemove={removeNotification} />
                  ))}
              </AnimatePresence>
          </div>

          <Minimap />
        </div>
      )}

      {/* REVIVE COUNTDOWN POPUP */}
      <AnimatePresence>
        {revivingCountdown > 0 && (
          <motion.div
            key="revive-popup"
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.8 }}
            className="absolute inset-0 z-[150] flex items-center justify-center pointer-events-none"
            style={{ background: 'rgba(0,0,0,0.65)' }}
          >
            <div className="flex flex-col items-center gap-4 p-8 rounded-md"
              style={{ background: 'linear-gradient(180deg, rgba(20,8,8,0.98) 0%, rgba(10,5,5,0.98) 100%)', border: '2px solid rgba(239,68,68,0.5)', boxShadow: '0 8px 40px rgba(0,0,0,0.9), inset 0 1px 0 rgba(255,255,255,0.05)' }}>
              <Heart size={48} fill="#ef4444" strokeWidth={0} style={{color:'#ef4444'}}/>
              <div className="text-2xl font-black text-white rpg-title" style={{WebkitTextStroke:'0.5px rgba(0,0,0,0.8)'}}>REVIVING...</div>
              <div className="text-6xl font-black rpg-title" style={{color:'#ef4444', WebkitTextStroke:'1px rgba(0,0,0,0.7)'}}>
                {Math.ceil(revivingCountdown)}
              </div>
              <div className="text-sm text-white/50 rpg-text uppercase tracking-widest">Shield activates on revival</div>
              {/* Progress bar */}
              <div className="w-48 h-2 rounded-sm overflow-hidden" style={{background:'rgba(0,0,0,0.5)', border:'1px solid rgba(0,0,0,0.6)'}}>
                <div className="h-full" style={{
                  width: `${((5 - revivingCountdown) / 5) * 100}%`,
                  background: 'linear-gradient(90deg,#b91c1c,#ef4444)',
                  transition: 'width 0.1s'
                }}/>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* --- OVERLAYS --- */}
      <div className="absolute inset-0 pointer-events-none">
        <AnimatePresence>

            {/* LEVEL UP SCREEN — no black bg, game stays visible */}
            {status === GameStatus.LEVEL_UP && (
                <div className="absolute inset-0 z-[100] flex flex-col items-center justify-center pointer-events-auto" style={{ background: 'rgba(0,0,0,0)' }}>
                    <motion.div initial={{ scale: 0.85, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="flex flex-col items-center gap-6 w-full max-w-3xl px-4">
                        <div className="text-center">
                            <p className="text-white/60 font-bold tracking-widest text-xs uppercase rpg-text">Choose a Reward</p>
                        </div>
                        {(() => {
                            // Mark highest-rarity option as suggested
                            const rarityRank: Record<string,number> = { MYTHIC:5, LEGENDARY:4, EPIC:3, RARE:2, COMMON:1 };
                            const bestIdx = upgradeOptions.reduce((bi, o, i) =>
                                (rarityRank[o.rarity]||0) > (rarityRank[upgradeOptions[bi]?.rarity]||0) ? i : bi, 0);
                            return (
                            <div className="grid grid-cols-3 gap-4 w-full">
                            {upgradeOptions.map((opt, idx) => {
                                const rarityAccent = opt.rarity === 'MYTHIC' ? '#f87171' : opt.rarity === 'LEGENDARY' ? '#fbbf24' : opt.rarity === 'EPIC' ? '#c084fc' : opt.rarity === 'RARE' ? '#60a5fa' : '#94a3b8';
                                const solidBg = opt.rarity === 'MYTHIC' ? '#1a0505' : opt.rarity === 'LEGENDARY' ? '#1a1205' : opt.rarity === 'EPIC' ? '#110720' : opt.rarity === 'RARE' ? '#050e1f' : '#0e0e18';
                                const isSuggested = idx === bestIdx;
                                return (
                                <motion.button
                                    key={opt.id}
                                    initial={{ y: 16, opacity: 0 }}
                                    animate={{ y: 0, opacity: 1 }}
                                    whileHover={{ scale: 1.03, y: -3 }}
                                    onClick={() => selectUpgrade(opt)}
                                    className="flex flex-col items-center rounded-md overflow-hidden cursor-pointer group relative"
                                    style={{
                                        background: `linear-gradient(180deg, ${solidBg} 0%, #0a0a10 100%)`,
                                        border: isSuggested ? `2px solid ${rarityAccent}` : `1.5px solid ${rarityAccent}55`,
                                        boxShadow: isSuggested ? `0 4px 24px ${rarityAccent}55, 0 0 0 1px ${rarityAccent}30` : `0 4px 20px rgba(0,0,0,0.8)`,
                                        minHeight: 260,
                                    }}
                                >
                                    {/* Suggested badge */}
                                    {isSuggested && (
                                        <div className="absolute top-0 left-0 right-0 py-1 text-center text-[9px] font-black uppercase tracking-widest rpg-text"
                                            style={{ background: rarityAccent, color: '#000' }}>
                                            ★ SUGGESTED
                                        </div>
                                    )}
                                    {/* Big icon area */}
                                    <div className={`flex-1 flex items-center justify-center w-full ${isSuggested ? 'pt-8 pb-6' : 'py-8'}`}>
                                        <div className="flex items-center justify-center"
                                            style={{ width: 80, height: 80, borderRadius: 8, background: `${rarityAccent}20`, border: `2px solid ${rarityAccent}60` }}>
                                            {opt.type.includes('SKILL')
                                                ? <Star size={40} fill={rarityAccent} strokeWidth={0} style={{color: rarityAccent}}/>
                                                : <ArrowUpCircle size={40} fill={rarityAccent} strokeWidth={0} style={{color: rarityAccent}}/>
                                            }
                                        </div>
                                    </div>
                                    {/* Text area */}
                                    <div className="w-full px-4 pb-4 flex flex-col items-center gap-2">
                                        <div className="text-[9px] font-black uppercase tracking-widest px-3 py-0.5 rounded" style={{ color: rarityAccent, background: `${rarityAccent}25`, border: `1px solid ${rarityAccent}40` }}>{opt.rarity}</div>
                                        <div className="font-black text-base text-white leading-tight text-center rpg-text">{opt.name}</div>
                                        <div className="text-xs text-slate-300 font-medium leading-relaxed text-center">{opt.description}</div>
                                        <div className="mt-1 w-full py-2 rounded font-black text-sm text-center rpg-text"
                                            style={{ background: isSuggested ? rarityAccent : `${rarityAccent}35`, color: isSuggested ? '#000' : rarityAccent, border: `1px solid ${rarityAccent}60` }}>
                                            SELECT
                                        </div>
                                    </div>
                                </motion.button>
                                );
                            })}
                            </div>
                            );
                        })()}
                    </motion.div>
                </div>
            )}

            {/* COMBINED DARK PANEL */}
            {panelOpen && (
              <motion.div key="combined-panel" initial={{ opacity: 0, scale: 0.97 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.97 }} transition={{ duration: 0.15 }}
                className="absolute inset-0 z-40 flex items-center justify-center pointer-events-none"
              >
                <div className="relative flex flex-col overflow-hidden pointer-events-auto"
                  style={{ width: 'min(960px,95vw)', height: 'min(680px,88vh)', background: 'linear-gradient(160deg,#1e1e2c 0%,#10101a 100%)', border: '1px solid rgba(180,150,70,0.35)', borderRadius: 6, boxShadow: '0 16px 60px rgba(0,0,0,0.9), 0 2px 0 rgba(255,255,255,0.04) inset, 0 -3px 0 rgba(0,0,0,0.6) inset' }}>

                  {/* Tab bar */}
                  <div className="flex items-center shrink-0" style={{ borderBottom: '1px solid rgba(180,150,70,0.18)', background: 'rgba(0,0,0,0.3)' }}>
                    {(['INVENTORY','CRAFTING','SKILLS','SHOP','CHARACTER'] as const).map(tab => {
                      const showDot = (tab === 'SKILLS' && hasUpgradableSkills) || (tab === 'INVENTORY' && hasBetterItem);
                      return (
                      <button key={tab} onClick={() => {
                        setPanelTab(tab);
                        if (tab==='INVENTORY' && !isInventoryOpen) { closeAllUI(); setTimeout(toggleInventory,10); }
                        else if (tab==='CRAFTING')  openSpecificShop('BLACKSMITH');
                        else if (tab==='SKILLS')    openSpecificShop('SKILLS');
                        else if (tab==='SHOP')      openSpecificShop('SUPPLIES');
                        else if (tab==='CHARACTER' && !isCharacterSheetOpen) { closeAllUI(); setTimeout(toggleCharacterSheet,10); }
                      }}
                        className="relative px-5 py-4 text-xs font-black uppercase tracking-widest transition-colors rpg-text"
                        style={{ color: panelTab===tab ? '#f0c040' : 'rgba(100,100,110,0.5)' }}>
                        {tab}
                        {showDot && panelTab !== tab && (
                          <div className="absolute top-2 right-2 w-2 h-2 rounded-full bg-red-500 border border-black" />
                        )}
                        {panelTab===tab && <div className="absolute bottom-0 left-0 right-0 h-[2px]" style={{ background: 'linear-gradient(90deg,transparent,#f0c040,transparent)' }} />}
                      </button>
                      );
                    })}
                    <div className="ml-auto flex items-center gap-4 px-5">
                      <span className="text-sm font-black text-yellow-500 flex items-center gap-1 rpg-text"><Coins size={13}/>{score.toLocaleString()}</span>
                      {panelTab==='SKILLS' && <span className="text-xs font-bold text-pink-400 flex items-center gap-1"><Star size={12}/>{skillPoints} SP</span>}
                      <button onClick={closeAllUI} className="text-slate-600 hover:text-white ml-1 p-1"><X size={16}/></button>
                    </div>
                  </div>

                  {/* ── INVENTORY TAB ── */}
                  {panelTab==='INVENTORY' && (
                    <div className="flex flex-1 overflow-hidden">
                      {/* Left: equip cards + grid */}
                      <div className="flex flex-col p-4 gap-3 overflow-y-auto" style={{ width:'58%' }}>
                        {/* RPG Equipment Cards */}
                        <div className="flex gap-2 items-start">
                          {([
                            { k:'weapon', l:'WEAPON', i:equipment.weapon, icon:<Sword size={22} className="text-slate-600"/> },
                            { k:'armor',  l:'ARMOR',  i:equipment.armor,  icon:<Shield size={22} className="text-slate-600"/> },
                            { k:'accessory', l:'RING', i:equipment.accessory, icon:<Gem size={22} className="text-slate-600"/> },
                            { k:'pet',    l:'PET',    i:equipment.pet,    icon:<Ghost size={22} className="text-slate-600"/> },
                          ] as const).map(s => {
                            const rarityColor = s.i ? getRarityTextColorDark(s.i.rarity) : 'rgba(80,80,90,0.6)';
                            const isWeapon = s.k === 'weapon';
                            return (
                              <button key={s.k}
                                onClick={() => { if(s.i) { setSelectedItem(s.i); } }}
                                onMouseEnter={() => s.i && setHoveredItem(s.i)}
                                onMouseLeave={() => setHoveredItem(null)}
                                className="flex flex-col items-center rounded-md overflow-hidden relative transition-all active:translate-y-0.5"
                                style={{
                                  width: isWeapon ? 96 : 76,
                                  height: isWeapon ? 120 : 96,
                                  background: s.i ? `linear-gradient(180deg, ${getRarityBgDark(s.i.rarity)} 0%, rgba(8,8,14,0.95) 100%)` : 'rgba(20,20,30,0.6)',
                                  border: s.i ? `1px solid ${rarityColor}50` : '1px solid rgba(255,255,255,0.05)',
                                  boxShadow: s.i ? `0 4px 0 rgba(0,0,0,0.6), inset 0 1px 0 rgba(255,255,255,0.06)` : '0 3px 0 rgba(0,0,0,0.4)',
                                  flexShrink: 0,
                                }}>
                                {s.i ? (
                                  <>
                                    {isWeapon ? (
                                      <div className="w-full flex-1"><WeaponThumb item={s.i}/></div>
                                    ) : (
                                      <div className="flex-1 flex items-center justify-center"><ItemIcon item={s.i} size={34}/></div>
                                    )}
                                    <div className="w-full px-1 py-1 text-center" style={{background:'rgba(0,0,0,0.55)'}}>
                                      <div className="text-[9px] font-black leading-tight truncate" style={{color: rarityColor}}>{s.i.name}</div>
                                      {s.i.level > 1 && <div className="text-[8px] text-yellow-400 font-bold">+{s.i.level-1}</div>}
                                    </div>
                                  </>
                                ) : (
                                  <div className="flex-1 flex flex-col items-center justify-center gap-1">
                                    {s.icon}
                                    <span className="text-[8px] text-slate-700 font-bold uppercase">{s.l}</span>
                                  </div>
                                )}
                              </button>
                            );
                          })}
                          <div className="flex flex-col justify-between ml-auto gap-2">
                            <button
                              onClick={() => autoEquip()}
                              className="px-3 py-2 text-xs font-black text-white uppercase rounded-md transition-all active:scale-95 rpg-text relative"
                              style={{ background: 'linear-gradient(180deg,rgba(99,102,241,0.8) 0%,rgba(59,130,246,0.65) 100%)', border:'1px solid rgba(99,102,241,0.5)', boxShadow:'0 3px 0 rgba(30,30,80,0.7), inset 0 1px 0 rgba(255,255,255,0.12)' }}>
                              {hasBetterItem && <div className="absolute top-1 right-1 w-2 h-2 bg-red-500 rounded-full animate-pulse" />}
                              AUTO EQUIP
                            </button>
                            <span className="text-[10px] text-slate-600 font-bold text-right">{inventory.length}/{maxInventorySlots}</span>
                          </div>
                        </div>
                        <div className="grid grid-cols-6 gap-2">
                          {sortedInventory.map(item => {
                            const locked = RARITY_LEVEL_REQ[item.rarity] > level;
                            const isSelected = selectedItem?.id === item.id;
                            const isHovered = hoveredItem?.id === item.id;

                            // Check if this item is better than currently equipped
                            let isBetterEquipped = false;
                            if ((item.type === 'WEAPON' || item.type === 'ARMOR' || item.type === 'ACCESSORY') && !locked) {
                              const slot = item.type.toLowerCase() as keyof typeof equipment;
                              const currentEquip = equipment[slot];
                              const newCP = calculateItemCP(item);
                              const oldCP = currentEquip ? calculateItemCP(currentEquip) : 0;
                              isBetterEquipped = newCP > oldCP;
                            }

                            return (
                              <button key={item.id}
                                onClick={() => { setSelectedItem(isSelected ? null : item); }}
                                onMouseEnter={() => setHoveredItem(item)}
                                onMouseLeave={() => setHoveredItem(null)}
                                className="aspect-square rounded-xl flex items-center justify-center relative transition-transform"
                                style={{
                                  background: getRarityBgDark(item.rarity),
                                  border: isSelected ? '2px solid rgba(240,192,64,0.9)' : isHovered ? '1px solid rgba(240,192,64,0.5)' : '1px solid rgba(255,255,255,0.07)',
                                  opacity: locked ? 0.4 : 1,
                                  transform: isHovered ? 'scale(1.1)' : undefined,
                                  boxShadow: isSelected ? '0 0 12px rgba(240,192,64,0.4)' : undefined,
                                }}>
                                <ItemIcon item={item} size={30}/>
                                {(item.quantity||1)>1 && <div className="absolute bottom-0 right-0 text-[9px] px-1.5 py-0.5 text-white font-black rounded-tl" style={{background:'rgba(0,0,0,0.8)'}}>{item.quantity}</div>}
                                {locked && <Lock size={10} className="absolute top-0.5 left-0.5 text-red-500"/>}
                                {isBetterEquipped && <div className="absolute top-1 right-1 w-2 h-2 rounded-full bg-red-500 shadow-lg" style={{boxShadow:'0 0 6px rgba(239,68,68,0.8)'}}/>}
                              </button>
                            );
                          })}
                          {[...Array(Math.max(0, maxInventorySlots - inventory.length))].map((_,i) => (
                            <div key={`e${i}`} className="aspect-square rounded-xl" style={{ background:'rgba(255,255,255,0.02)', border:'1px solid rgba(255,255,255,0.04)' }}/>
                          ))}
                        </div>
                      </div>
                      {/* Right: item details (shown on click) */}
                      <div className="flex flex-col flex-1 p-5 overflow-y-auto">
                        {selectedItem ? (
                          <div className="flex flex-col gap-3">
                            <div className="flex gap-3 items-start">
                              <div className="w-20 h-20 rounded-xl flex items-center justify-center shrink-0" style={{ background: getRarityBgDark(selectedItem.rarity), border:`1.5px solid ${getRarityTextColorDark(selectedItem.rarity)}50` }}>
                                <ItemIcon item={selectedItem} size={40}/>
                              </div>
                              <div>
                                <div className="font-black text-white text-base leading-tight rpg-text">{selectedItem.name}{selectedItem.level>1 && <span className="text-yellow-400 ml-1">+{selectedItem.level-1}</span>}</div>
                                <div className="text-[11px] font-bold uppercase mt-0.5" style={{color: getRarityTextColorDark(selectedItem.rarity)}}>{selectedItem.rarity} {selectedItem.type}</div>
                                {getLevelReqDesc(selectedItem.rarity) && <div className="text-[10px] font-bold text-red-400/80 mt-0.5">{getLevelReqDesc(selectedItem.rarity)}</div>}
                              </div>
                            </div>
                            <div style={{height:1, background:'rgba(180,150,70,0.18)'}}/>
                            <div className="text-xs text-slate-400 leading-relaxed">{selectedItem.description}</div>
                            {selectedItem.stats && (
                              <div className="grid grid-cols-2 gap-1.5">
                                {Object.entries(selectedItem.stats).map(([k,v]) => (
                                  <div key={k} className="flex justify-between text-[11px] px-2 py-1.5 rounded-lg" style={{background:'rgba(255,255,255,0.04)'}}>
                                    <span className="text-slate-500 font-bold capitalize">{k}</span>
                                    <span className="text-green-400 font-mono font-bold">{formatStat(k,v as number)}</span>
                                  </div>
                                ))}
                              </div>
                            )}
                            <div className="text-sm font-black text-yellow-500 flex items-center gap-1"><Coins size={13}/>Sell: {Math.floor(selectedItem.price*0.3)} G</div>
                            <div className="flex gap-2 mt-1">
                              {selectedItem.type!=='POTION' && selectedItem.type!=='CORE' && selectedItem.type!=='REVIVE' && (
                                <button onClick={() => { equipItem(selectedItem); setSelectedItem(null); }} className="flex-1 py-2.5 rounded-xl text-sm font-black text-white" style={{ background:'rgba(99,102,241,0.6)', border:'1px solid rgba(99,102,241,0.4)' }}>EQUIP</button>
                              )}
                              {selectedItem.type!=='POTION' && selectedItem.type!=='CORE' && selectedItem.type!=='REVIVE' && (
                                <button onClick={() => { setSelectedUpgradeItem(selectedItem); setPanelTab('CRAFTING'); }} className="flex-1 py-2.5 rounded-xl text-sm font-black text-white flex items-center justify-center gap-1" style={{ background:'rgba(239,68,68,0.6)', border:'1px solid rgba(239,68,68,0.4)' }}><Plus size={16}/> UPGRADE</button>
                              )}
                              <button onClick={() => { setSellDialogItem(selectedItem); setSellAmount(1); setSelectedItem(null); }} className="flex-1 py-2.5 rounded-xl text-sm font-black" style={{ background:'rgba(239,68,68,0.12)', border:'1px solid rgba(239,68,68,0.3)', color:'#ef4444' }}>SELL</button>
                            </div>
                          </div>
                        ) : (
                          <div className="flex-1 flex items-center justify-center opacity-25">
                            <div className="text-center"><Package size={40} className="mx-auto mb-3 text-slate-500"/><div className="text-sm text-slate-500 font-bold">Click item for details</div></div>
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                  {/* ── CRAFTING TAB ── */}
                  {panelTab==='CRAFTING' && (
                    <div className="flex flex-1 overflow-hidden">
                      {/* Left: item selection + materials */}
                      <div className="flex flex-col p-4 gap-3 overflow-y-auto" style={{ width:'45%' }}>
                        <div className="text-[9px] font-black text-slate-600 uppercase">Select item to upgrade/recycle</div>
                        <div className="grid grid-cols-5 gap-1.5">
                          {sortedInventory.filter(i=>i.type!=='POTION'&&i.type!=='CORE'&&i.type!=='REVIVE').map(item => (
                            <button key={item.id} onClick={() => setSelectedUpgradeItem(item)} onMouseEnter={() => setHoveredItem(item)} onMouseLeave={() => setHoveredItem(null)}
                              className="aspect-square rounded-lg flex items-center justify-center"
                              style={{ background: getRarityBgDark(item.rarity), border: selectedUpgradeItem?.id===item.id ? '1.5px solid rgba(240,192,64,0.8)' : '1px solid rgba(255,255,255,0.06)' }}>
                              <ItemIcon item={item} size={18}/>
                            </button>
                          ))}
                        </div>
                        <div style={{height:1, background:'rgba(255,255,255,0.05)'}}/>
                        <div className="text-[9px] font-black text-slate-600 uppercase">Materials</div>
                        <div className="grid grid-cols-5 gap-1">
                          {(['COMMON','RARE','EPIC','LEGENDARY','MYTHIC'] as Rarity[]).map(r => (
                            <div key={r} className="flex flex-col items-center py-1.5 rounded-lg" style={{ background:'rgba(255,255,255,0.03)', border:'1px solid rgba(255,255,255,0.05)' }}>
                              <span className="text-[7px] font-black" style={{color: getRarityTextColorDark(r)}}>{r.slice(0,3)}</span>
                              <span className="font-mono font-bold text-xs text-white">{materials[r]}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                      {/* Right: forge/recycle/craft */}
                      <div className="flex flex-col flex-1 p-4 gap-3 overflow-y-auto">
                        <div className="flex gap-1 p-1 rounded-lg" style={{background:'rgba(0,0,0,0.4)'}}>
                          {(['UPGRADE','RECYCLE','CRAFT'] as const).map(t => (
                            <button key={t} onClick={() => setBlacksmithTab(t)} className="flex-1 py-2 text-[10px] font-black uppercase rounded-md transition-colors"
                              style={{ background: blacksmithTab===t ? 'rgba(180,150,70,0.2)' : 'transparent', color: blacksmithTab===t ? '#f0c040' : '#555', border: blacksmithTab===t ? '1px solid rgba(180,150,70,0.3)' : '1px solid transparent' }}>
                              {t}
                            </button>
                          ))}
                        </div>
                        {blacksmithTab==='UPGRADE' && (selectedUpgradeItem ? (
                          <div className="flex flex-col items-center gap-3 p-4 rounded-xl" style={{background:'rgba(255,255,255,0.03)',border:'1px solid rgba(180,150,70,0.2)'}}>
                            <div className="w-14 h-14 rounded-xl flex items-center justify-center" style={{background: getRarityBgDark(selectedUpgradeItem.rarity)}}><ItemIcon item={selectedUpgradeItem} size={28}/></div>
                            <div className="text-center"><div className="font-black text-white text-sm">{selectedUpgradeItem.name}</div><div className="text-xs text-slate-500">Lv {selectedUpgradeItem.level} → <span className="text-green-400">{selectedUpgradeItem.level+1}</span></div></div>
                            <div className="grid grid-cols-2 gap-2 w-full text-xs">
                              <div className="text-center p-2 rounded-lg" style={{background:'rgba(0,0,0,0.4)'}}><div className="text-slate-600 text-[9px] uppercase font-bold">Gold</div><div className="font-mono font-black text-yellow-400">{Math.floor(selectedUpgradeItem.price*selectedUpgradeItem.level*0.5)}</div></div>
                              <div className="text-center p-2 rounded-lg" style={{background:'rgba(0,0,0,0.4)'}}><div className="text-slate-600 text-[9px] uppercase font-bold">Cores</div><div className="font-mono font-black text-blue-400">{Math.ceil(selectedUpgradeItem.level/2)}</div></div>
                            </div>
                            <button onClick={() => upgradeItem(selectedUpgradeItem)} className="w-full py-3 rounded-xl font-black text-white text-sm flex items-center justify-center gap-2" style={{background:'rgba(239,68,68,0.65)',border:'1px solid rgba(239,68,68,0.4)'}}><Hammer size={15}/> FORGE</button>
                          </div>
                        ) : <div className="flex-1 flex items-center justify-center opacity-25"><div className="text-center"><Anvil size={32} className="mx-auto mb-2 text-slate-600"/><div className="text-xs text-slate-600 font-bold">Select an item</div></div></div>)}
                        {blacksmithTab==='RECYCLE' && (
                          <div className="flex flex-col gap-2">
                            {selectedUpgradeItem && (
                              <div className="p-3 rounded-xl flex items-center gap-3" style={{background:'rgba(255,255,255,0.03)',border:'1px solid rgba(255,255,255,0.06)'}}>
                                <div className="w-10 h-10 rounded-lg flex items-center justify-center" style={{background: getRarityBgDark(selectedUpgradeItem.rarity)}}><ItemIcon item={selectedUpgradeItem} size={18}/></div>
                                <div className="flex-1 text-sm font-bold text-white">{selectedUpgradeItem.name}</div>
                                <button onClick={() => recycleItem(selectedUpgradeItem)} className="px-3 py-1.5 rounded-lg text-xs font-black flex items-center gap-1" style={{background:'rgba(255,255,255,0.06)',color:'#aaa',border:'1px solid rgba(255,255,255,0.08)'}}><Recycle size={11}/> +{RECYCLE_YIELDS[selectedUpgradeItem.rarity]}</button>
                              </div>
                            )}
                            <div className="flex gap-2"><button onClick={() => massRecycle('COMMON')} className="flex-1 py-2 rounded-lg text-[10px] font-bold text-slate-500" style={{background:'rgba(255,255,255,0.04)',border:'1px solid rgba(255,255,255,0.06)'}}>ALL COMMON</button><button onClick={() => massRecycle('RARE')} className="flex-1 py-2 rounded-lg text-[10px] font-bold text-blue-400" style={{background:'rgba(59,130,246,0.08)',border:'1px solid rgba(59,130,246,0.2)'}}>ALL RARE</button></div>
                            <div className="text-[9px] text-slate-600 font-black uppercase mt-1">Convert Materials</div>
                            {(['COMMON','RARE','EPIC','LEGENDARY'] as Rarity[]).map((r,i) => {
                              const next = (['RARE','EPIC','LEGENDARY','MYTHIC'] as Rarity[])[i];
                              return <button key={r} onClick={() => combineMaterials(r)} className="flex justify-between items-center px-3 py-2 rounded-lg" style={{background:'rgba(255,255,255,0.03)',border:'1px solid rgba(255,255,255,0.05)'}}><span className="text-[10px] text-slate-500 font-bold">{MATERIAL_COMBINE_COST}× {r} → 1× {next}</span><RefreshCcw size={11} className="text-slate-700"/></button>;
                            })}
                          </div>
                        )}
                        {blacksmithTab==='CRAFT' && (
                          <div className="flex flex-col gap-2">
                            {(['COMMON','RARE','EPIC','LEGENDARY','MYTHIC'] as Rarity[]).map(r => (
                              <button key={r} onClick={() => craftItem(r)} className="w-full p-3 rounded-xl flex items-center justify-between" style={{ background: materials[r]>=CRAFTING_COSTS[r] ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.2)', border:`1px solid ${materials[r]>=CRAFTING_COSTS[r] ? 'rgba(180,150,70,0.2)' : 'rgba(255,255,255,0.04)'}`, opacity: materials[r]>=CRAFTING_COSTS[r] ? 1 : 0.5 }}>
                                <div className="flex items-center gap-3">
                                  <div className="w-9 h-9 rounded-lg flex items-center justify-center" style={{background:'rgba(255,255,255,0.04)'}}><PenTool size={16} style={{color: getRarityTextColorDark(r)}}/></div>
                                  <div className="text-left"><div className="font-black text-sm" style={{color: getRarityTextColorDark(r)}}>{r}</div><div className="text-[9px] text-slate-600">Random item</div></div>
                                </div>
                                <div className="text-right"><div className="font-mono font-black text-xs" style={{color: materials[r]>=CRAFTING_COSTS[r]?'#fff':'#ef4444'}}>{CRAFTING_COSTS[r]} shards</div><div className="text-[9px] text-slate-600">Have: {materials[r]}</div></div>
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                  {/* ── SKILLS TAB ── */}
                  {panelTab==='SKILLS' && (
                    <div className="flex-1 p-5 overflow-y-auto">
                      <div className="grid grid-cols-2 gap-2">
                        {Object.entries(SKILLS_INFO).map(([key, info]) => {
                          if ((info as any).classType && (info as any).classType !== hero) return null;
                          const sk = key as keyof SkillLevels;
                          const lvl = skillLevels[sk];
                          let cost = lvl+1; if (key==='special') cost=5; if (key==='dash'||key==='barrier') cost=lvl+2;
                          const canAfford = skillPoints>=cost, isMax = lvl>=5;
                          const acc = CLASS_COLOR[hero] ?? '#6366f1';
                          return (
                            <div key={key} className="flex items-center gap-3 p-3 rounded-xl" style={{ background: lvl>0 ? `${acc}0d` : 'rgba(255,255,255,0.02)', border:`1px solid ${lvl>0 ? acc+'28' : 'rgba(255,255,255,0.05)'}` }}>
                              <div className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0" style={{background: lvl>0 ? acc+'22' : 'rgba(255,255,255,0.04)'}}><Star size={16} style={{color: lvl>0 ? acc : '#444'}}/></div>
                              <div className="flex-1 min-w-0"><div className="font-bold text-white text-xs leading-tight">{info.name}</div><div className="text-[9px] text-slate-600 leading-tight truncate">{info.description}</div></div>
                              <div className="flex flex-col items-end gap-1 shrink-0">
                                <div className="text-[8px] font-bold px-1.5 py-0.5 rounded" style={{background: lvl>0 ? acc+'28' : 'rgba(255,255,255,0.05)', color: lvl>0 ? acc : '#555'}}>LV{lvl}</div>
                                <button onClick={() => upgradeSkill(sk)} disabled={!canAfford||isMax} className="w-7 h-7 rounded flex items-center justify-center" style={{ background: isMax ? 'rgba(255,255,255,0.03)' : canAfford ? acc+'cc' : 'rgba(255,255,255,0.04)', color: isMax ? '#444' : canAfford ? '#fff' : '#555', border:`1px solid ${isMax ? 'transparent' : canAfford ? acc+'80' : 'rgba(255,255,255,0.05)'}` }} title={`Cost: ${cost}SP`}>{isMax ? '✓' : <Plus size={14} />}</button>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {/* ── SHOP TAB ── */}
                  {panelTab==='SHOP' && (
                    <div className="flex flex-col flex-1 p-5 gap-4 overflow-y-auto">
                      {/* Section header */}
                      <div className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Supplies &amp; Companions</div>
                      <div className="grid grid-cols-6 gap-3">
                        {[...ITEMS_POOL.filter(i=>i.type==='POTION'||i.type==='CORE'||i.type==='REVIVE'), ...PETS_POOL].map(item => (
                          <button key={item.id} onClick={() => buyItem(item)} onMouseEnter={() => setHoveredItem(item)} onMouseLeave={() => setHoveredItem(null)}
                            className="aspect-square rounded-md flex flex-col items-center justify-center relative gap-1 pb-1"
                            style={{ background: getRarityBgDark(item.rarity), border:`1px solid ${hoveredItem?.id===item.id ? 'rgba(240,192,64,0.6)' : 'rgba(255,255,255,0.08)'}`, opacity: score<item.price ? 0.5 : 1, transform: hoveredItem?.id===item.id ? 'scale(1.06)' : undefined, transition: 'transform 0.1s' }}>
                            <ItemIcon item={item} size={30}/>
                            <div className="text-xs font-black text-yellow-400 rpg-text">{item.price}g</div>
                          </button>
                        ))}
                      </div>
                      <div className="flex gap-2 mt-auto pt-2" style={{borderTop:'1px solid rgba(255,255,255,0.05)'}}>
                        <button onClick={() => massSell('COMMON')} className="flex-1 py-2 text-xs font-bold text-slate-500 rounded-md" style={{background:'rgba(255,255,255,0.03)',border:'1px solid rgba(255,255,255,0.05)'}}>SELL ALL COMMON</button>
                        <button onClick={() => massSell('RARE')} className="flex-1 py-2 text-xs font-bold text-blue-400 rounded-md" style={{background:'rgba(59,130,246,0.08)',border:'1px solid rgba(59,130,246,0.2)'}}>SELL ALL RARE</button>
                      </div>
                    </div>
                  )}

                  {/* ── CHARACTER TAB ── */}
                  {panelTab==='CHARACTER' && (
                    <div className="flex-1 p-6 overflow-y-auto">
                      <div className="flex items-center gap-4 mb-6 pb-4">
                        <div className="w-16 h-16 rounded-2xl flex items-center justify-center" style={{ background:`${CLASS_COLOR[hero]??'#6366f1'}18`, border:`1.5px solid ${CLASS_COLOR[hero]??'#6366f1'}50` }}>
                          {hero==='ARCHER' && <Crosshair size={32} style={{color:CLASS_COLOR[hero]}}/>}
                          {hero==='WIZARD' && <Wand2 size={32} style={{color:CLASS_COLOR[hero]}}/>}
                          {hero==='BARBARIAN' && <Axe size={32} style={{color:CLASS_COLOR[hero]}}/>}
                        </div>
                        <div><div className="text-xl font-black text-white">{hero}</div><div className="text-xs text-slate-500 font-bold">LEVEL {level}</div></div>
                        <div className="ml-auto text-right"><div className="text-[9px] text-slate-600 font-bold uppercase">Combat Power</div><div className="text-2xl font-black" style={{color:CLASS_COLOR[hero]??'#f0c040'}}>{currentCP.toLocaleString()}</div></div>
                      </div>
                      <div className="grid grid-cols-2 gap-x-8 gap-y-0.5">
                        {([['Damage',Math.floor(stats.damage).toString()],['Health',`${Math.floor(health)} / ${stats.maxHealth}`],['Defense',stats.defense.toFixed(1)],['Mana',`${Math.floor(mana)} / ${stats.maxMana}`],['Move Speed',stats.moveSpeed.toFixed(1)],['Regen',`${stats.regen.toFixed(1)}/s`],['Crit Rate',`${(stats.critRate*100).toFixed(0)}%`],['Crit Dmg',`${(stats.critDamage*100).toFixed(0)}%`],['Atk Speed',stats.fireRate.toFixed(2)],['Cooldown',`-${(stats.cooldownReduction*100).toFixed(0)}%`]] as [string,string][]).map(([l,v]) => (
                          <div key={l} className="flex justify-between items-center py-1.5 text-xs px-2 rounded-md" style={{background:'rgba(255,255,255,0.02)'}}>
                            <span className="text-slate-500 font-bold uppercase tracking-wider">{l}</span>
                            <span className="font-mono font-bold text-white">{v}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                </div>
              </motion.div>
            )}

            {/* SELL DIALOG POPUP */}
            {sellDialogItem && (
                <div className="absolute inset-0 flex items-center justify-center z-[80] bg-black/40 backdrop-blur-sm pointer-events-auto">
                    <motion.div
                        initial={{ scale: 0.9, opacity: 0 }}
                        animate={{ scale: 1, opacity: 1 }}
                        className="bg-white p-6 rounded-lg shadow-2xl w-96 text-center border-2 border-slate-200"
                    >
                        <div className={`w-20 h-20 rounded-md flex items-center justify-center mx-auto mb-4 ${getRarityBg(sellDialogItem.rarity)} border-2 border-white shadow-lg`}>
                            <ItemIcon item={sellDialogItem} size={40} />
                        </div>
                        
                        <h3 className={`font-black text-xl mb-1 ${getRarityTextColor(sellDialogItem.rarity)}`}>
                            {sellDialogItem.name} {sellDialogItem.level > 1 && <span className="text-amber-500">+{sellDialogItem.level-1}</span>}
                        </h3>
                        
                        {/* High Value Warning */}
                        {(sellDialogItem.rarity === 'EPIC' || sellDialogItem.rarity === 'LEGENDARY' || sellDialogItem.rarity === 'MYTHIC' || sellDialogItem.level >= 5) && (
                            <div className="bg-red-50 text-red-500 text-xs font-bold px-3 py-1 rounded-full inline-flex items-center gap-1 mb-4">
                                <AlertTriangle size={12} /> HIGH VALUE ITEM
                            </div>
                        )}

                        {/* Quantity Selector */}
                        {(sellDialogItem.quantity || 1) > 1 && (
                            <div className="flex items-center justify-center gap-4 mb-6 mt-2">
                                <button 
                                    onClick={() => setSellAmount(Math.max(1, sellAmount - 1))}
                                    className="w-8 h-8 rounded-full bg-slate-100 hover:bg-slate-200 flex items-center justify-center"
                                >
                                    <Minus size={16} />
                                </button>
                                <div className="font-black text-2xl w-12">{sellAmount}</div>
                                <button 
                                    onClick={() => setSellAmount(Math.min((sellDialogItem.quantity || 1), sellAmount + 1))}
                                    className="w-8 h-8 rounded-full bg-slate-100 hover:bg-slate-200 flex items-center justify-center"
                                >
                                    <Plus size={16} />
                                </button>
                                <button 
                                    onClick={() => setSellAmount(sellDialogItem.quantity || 1)}
                                    className="text-[10px] font-bold bg-blue-100 text-blue-600 px-2 py-1 rounded hover:bg-blue-200"
                                >
                                    MAX
                                </button>
                            </div>
                        )}

                        <div className="bg-slate-50 p-4 rounded-xl mb-6">
                            <div className="text-xs text-slate-400 font-bold uppercase mb-1">Total Value</div>
                            <div className="text-3xl font-black text-amber-500 flex items-center justify-center gap-2">
                                <Coins size={24} /> 
                                {Math.floor(sellDialogItem.price * 0.3 * sellAmount).toLocaleString()}
                            </div>
                        </div>

                        <div className="flex gap-3">
                            <button onClick={() => setSellDialogItem(null)} className="flex-1 py-3 bg-slate-100 hover:bg-slate-200 rounded font-bold text-slate-500">Cancel</button>
                            <button onClick={handleConfirmSell} className="flex-1 py-3 bg-red-500 hover:bg-red-600 rounded font-bold text-white shadow-lg shadow-red-200">
                                SELL
                            </button>
                        </div>
                    </motion.div>
                </div>
            )}

            {/* SHOP MODAL — removed; content now in combined panel above */}
            {false && (
                <motion.div key="shop-modal-disabled"
                    className="hidden"
                >
                    <div className={``}>
                        <div className="flex items-center gap-3">
                            {activeShopTab === 'SKILLS' ? <BookOpen size={28} /> : activeShopTab === 'BLACKSMITH' ? <Hammer size={28} /> : <ShoppingBag size={28} />}
                            <h2 className="text-2xl font-black tracking-tight">{activeShopTab}</h2>
                        </div>
                        <div className="flex gap-2 text-xs font-bold bg-black/20 px-3 py-1 rounded-full">
                            <span className="text-yellow-300 flex items-center gap-1"><Coins size={12}/> {score.toLocaleString()}</span>
                            {activeShopTab === 'SKILLS' && <span className="text-pink-200 flex items-center gap-1 border-l border-white/20 pl-2"><Star size={12}/> {skillPoints} SP</span>}
                        </div>
                        <button onClick={closeAllUI} className="bg-white/20 p-2 rounded-full hover:bg-white/30"><X size={24}/></button>
                    </div>

                    <div className="flex-1 overflow-y-auto p-6 bg-slate-50/50 custom-scrollbar">
                        {/* SKILLS SHOP */}
                        {activeShopTab === 'SKILLS' && (
                            <div className="space-y-4">
                                <div className="text-slate-500 text-xs font-bold uppercase mb-2">Class Skills ({hero})</div>
                                {Object.entries(SKILLS_INFO).map(([key, info]) => {
                                    // @ts-ignore
                                    if (info.classType && info.classType !== hero) return null;
                                    
                                    const skillKey = key as keyof SkillLevels;
                                    const lvl = skillLevels[skillKey];
                                    let cost = lvl + 1;
                                    if (key === 'special') cost = 5;
                                    if (key === 'dash' || key === 'barrier') cost = lvl + 2;
                                    const canAfford = skillPoints >= cost;
                                    const isMax = lvl >= 5;
                                    
                                    return (
                                        <div key={key} className="bg-white p-4 rounded-2xl shadow-sm border border-slate-100 flex items-center gap-4">
                                            <div className="w-12 h-12 bg-pink-50 text-pink-500 rounded-xl flex items-center justify-center shrink-0">
                                                <Star size={24} />
                                            </div>
                                            <div className="flex-1">
                                                <div className="flex justify-between">
                                                    <span className="font-bold text-slate-800">{info.name}</span>
                                                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${lvl > 0 ? 'bg-pink-100 text-pink-600' : 'bg-slate-100 text-slate-400'}`}>LVL {lvl}</span>
                                                </div>
                                                <div className="text-xs text-slate-500 leading-tight mt-1">{info.description}</div>
                                            </div>
                                            <button 
                                                onClick={() => upgradeSkill(skillKey)}
                                                disabled={!canAfford || isMax}
                                                className={`px-4 py-2 rounded-xl font-bold text-xs shadow-sm transition-all active:scale-95
                                                    ${isMax ? 'bg-slate-100 text-slate-400' : canAfford ? 'bg-pink-500 text-white hover:bg-pink-600' : 'bg-slate-200 text-slate-400'}
                                                `}
                                            >
                                                {isMax ? 'MAX' : `${cost} SP`}
                                            </button>
                                        </div>
                                    );
                                })}
                            </div>
                        )}

                        {/* SUPPLIES & PETS SHOP (GRID) */}
                        {(activeShopTab === 'SUPPLIES' || activeShopTab === 'PETS') && (
                            <div className="flex flex-col gap-6">
                                <div className="grid grid-cols-5 gap-2 content-start">
                                    {(activeShopTab === 'SUPPLIES' ? ITEMS_POOL.filter(i => i.type === 'POTION' || i.type === 'CORE' || i.type === 'REVIVE') : PETS_POOL).map(item => (
                                        <button 
                                            key={item.id} 
                                            onClick={() => buyItem(item)}
                                            onMouseEnter={() => setHoveredItem(item)}
                                            onMouseLeave={() => setHoveredItem(null)}
                                            className={`aspect-square bg-white rounded-xl border-b-4 border-slate-200 active:border-b-0 active:translate-y-1 transition-all flex flex-col items-center justify-center relative group
                                                ${score < item.price ? 'opacity-50 grayscale' : 'hover:border-blue-300'}
                                                ${getRarityBg(item.rarity)}
                                            `}
                                        >
                                            <div className="mb-2"><ItemIcon item={item} size={20} /></div>
                                            <div className="absolute top-1 right-1 text-[8px] font-bold text-yellow-500 bg-yellow-50 px-1 rounded border border-yellow-200">{item.price}</div>
                                        </button>
                                    ))}
                                    {/* Fill empty slots to maintain 50-slot look */}
                                    {[...Array(Math.max(0, 50 - (activeShopTab === 'SUPPLIES' ? ITEMS_POOL.filter(i => i.type === 'POTION' || i.type === 'CORE' || i.type === 'REVIVE').length : PETS_POOL.length)))].map((_, i) => (
                                        <div key={`empty-shop-${i}`} className="aspect-square bg-slate-100 rounded-xl border border-slate-200 border-dashed" />
                                    ))}
                                </div>
                                {activeShopTab === 'SUPPLIES' && (
                                    <div className="bg-white p-4 rounded-2xl border border-slate-100 mt-2">
                                        <div className="font-bold text-slate-400 text-xs mb-2">QUICK SELL (FROM INVENTORY)</div>
                                        <div className="flex gap-2">
                                            <button onClick={() => massSell('COMMON')} className="flex-1 bg-slate-100 hover:bg-slate-200 text-slate-600 py-3 rounded-xl text-xs font-bold">ALL COMMON</button>
                                            <button onClick={() => massSell('RARE')} className="flex-1 bg-blue-50 hover:bg-blue-100 text-blue-600 py-3 rounded-xl text-xs font-bold">ALL RARE</button>
                                        </div>
                                    </div>
                                )}
                            </div>
                        )}

                        {/* BLACKSMITH SHOP */}
                        {activeShopTab === 'BLACKSMITH' && (
                            <div className="flex flex-col gap-4 h-full">
                                <div className="flex bg-slate-200 p-1 rounded-xl">
                                    {(['UPGRADE', 'RECYCLE', 'CRAFT'] as const).map(tab => (
                                        <button 
                                            key={tab} 
                                            onClick={() => { setBlacksmithTab(tab); setSelectedUpgradeItem(null); }}
                                            className={`flex-1 py-2 text-xs font-bold rounded-lg transition-all ${blacksmithTab === tab ? 'bg-white shadow-sm text-slate-800' : 'text-slate-500 hover:text-slate-700'}`}
                                        >
                                            {tab}
                                        </button>
                                    ))}
                                </div>
                                {blacksmithTab === 'UPGRADE' && (
                                    <div className="flex-1 flex flex-col items-center justify-center text-center p-4">
                                        {selectedUpgradeItem ? (
                                            <div className="w-full bg-white p-6 rounded-3xl shadow-lg border border-slate-100 flex flex-col items-center gap-4">
                                                <div className="w-20 h-20 bg-slate-50 rounded-2xl flex items-center justify-center border-4 border-slate-100"><ItemIcon item={selectedUpgradeItem} size={40}/></div>
                                                <div>
                                                    <div className="font-black text-xl text-slate-800">{selectedUpgradeItem.name}</div>
                                                    <div className="text-sm font-bold text-slate-400">Level {selectedUpgradeItem.level} <span className="text-green-500">→ {selectedUpgradeItem.level + 1}</span></div>
                                                </div>
                                                
                                                <div className="w-full h-px bg-slate-100 my-2" />
                                                
                                                <div className="grid grid-cols-2 w-full gap-2 text-xs">
                                                    <div className="bg-slate-50 p-2 rounded-lg">
                                                        <div className="text-slate-400 font-bold uppercase">Cost</div>
                                                        <div className="font-mono font-black text-yellow-500">{Math.floor(selectedUpgradeItem.price * selectedUpgradeItem.level * 0.5)} G</div>
                                                    </div>
                                                    <div className="bg-slate-50 p-2 rounded-lg">
                                                        <div className="text-slate-400 font-bold uppercase">Cores</div>
                                                        <div className="font-mono font-black text-blue-500">{Math.ceil(selectedUpgradeItem.level / 2)}</div>
                                                    </div>
                                                </div>

                                                <button 
                                                    onClick={() => upgradeItem(selectedUpgradeItem)}
                                                    className="w-full bg-red-500 text-white py-4 rounded-xl font-bold shadow-red-200 shadow-lg hover:bg-red-600 active:scale-95 transition-transform flex items-center justify-center gap-2 mt-2"
                                                >
                                                    <Hammer size={18} /> FORGE
                                                </button>
                                            </div>
                                        ) : (
                                            <div className="text-slate-400 text-sm font-bold flex flex-col items-center gap-4 opacity-50">
                                                <div className="w-24 h-24 rounded-full bg-slate-100 flex items-center justify-center"><Anvil size={40}/></div>
                                                Select an item from your Inventory (Left) to Upgrade.
                                            </div>
                                        )}
                                    </div>
                                )}
                                {blacksmithTab === 'RECYCLE' && (
                                    <div className="flex-1 flex flex-col gap-4">
                                        {/* Material Wallet */}
                                        <div className="grid grid-cols-5 gap-1 bg-slate-100 p-2 rounded-xl">
                                            {(['COMMON', 'RARE', 'EPIC', 'LEGENDARY', 'MYTHIC'] as Rarity[]).map(r => (
                                                <div key={r} className={`flex flex-col items-center p-2 rounded-lg ${getRarityBg(r)}`}>
                                                    <span className={`text-[8px] font-black ${getRarityTextColor(r)}`}>{r.substring(0,3)}</span>
                                                    <span className="font-mono font-bold text-xs text-slate-800">{materials[r]}</span>
                                                </div>
                                            ))}
                                        </div>

                                        {selectedUpgradeItem ? (
                                            <div className="bg-white p-4 rounded-2xl shadow-sm border border-slate-100 flex flex-col items-center gap-3">
                                                <div className="text-xs text-slate-400 font-bold uppercase">Selected Item</div>
                                                <div className="flex items-center gap-2">
                                                    <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${getRarityBg(selectedUpgradeItem.rarity)}`}><ItemIcon item={selectedUpgradeItem} size={20}/></div>
                                                    <div className="text-sm font-bold text-slate-700">{selectedUpgradeItem.name}</div>
                                                </div>
                                                <button 
                                                    onClick={() => recycleItem(selectedUpgradeItem)}
                                                    className="w-full bg-slate-800 text-white py-3 rounded-xl font-bold hover:bg-slate-900 flex items-center justify-center gap-2"
                                                >
                                                    <Recycle size={16} /> Recycle (+{RECYCLE_YIELDS[selectedUpgradeItem.rarity]} {selectedUpgradeItem.rarity})
                                                </button>
                                            </div>
                                        ) : (
                                            <div className="bg-white p-4 rounded-2xl border-2 border-dashed border-slate-200 text-center text-xs text-slate-400 font-bold py-8">
                                                Select item from Inventory to Recycle
                                            </div>
                                        )}

                                        <div className="space-y-2">
                                            <div className="text-xs font-bold text-slate-400 uppercase">Mass Recycle</div>
                                            <div className="flex gap-2">
                                                <button onClick={() => massRecycle('COMMON')} className="flex-1 bg-slate-100 hover:bg-slate-200 text-slate-600 py-2 rounded-lg text-[10px] font-bold">ALL COMMON</button>
                                                <button onClick={() => massRecycle('RARE')} className="flex-1 bg-blue-50 hover:bg-blue-100 text-blue-600 py-2 rounded-lg text-[10px] font-bold">ALL RARE</button>
                                            </div>
                                        </div>

                                        <div className="space-y-2 mt-auto">
                                            <div className="text-xs font-bold text-slate-400 uppercase">Material Conversion</div>
                                            {(['COMMON', 'RARE', 'EPIC', 'LEGENDARY'] as Rarity[]).map((r, i) => {
                                                const nextRarity = (['RARE', 'EPIC', 'LEGENDARY', 'MYTHIC'] as Rarity[])[i];
                                                return (
                                                    <button 
                                                        key={r}
                                                        onClick={() => combineMaterials(r)}
                                                        className="w-full flex justify-between items-center bg-white border border-slate-100 px-3 py-2 rounded-lg hover:bg-slate-50 active:scale-95 transition-transform"
                                                    >
                                                        <span className="text-[10px] font-bold text-slate-500">{MATERIAL_COMBINE_COST} {r} <span className="text-slate-300">→</span> 1 {nextRarity}</span>
                                                        <RefreshCcw size={12} className="text-slate-400" />
                                                    </button>
                                                )
                                            })}
                                        </div>
                                    </div>
                                )}
                                {blacksmithTab === 'CRAFT' && (
                                    <div className="flex-1 overflow-y-auto pr-2 custom-scrollbar">
                                        <div className="text-center text-xs text-slate-400 font-bold mb-4">Craft random items using Shards</div>
                                        <div className="space-y-3">
                                            {(['COMMON', 'RARE', 'EPIC', 'LEGENDARY', 'MYTHIC'] as Rarity[]).map(r => (
                                                <button 
                                                    key={r}
                                                    onClick={() => craftItem(r)}
                                                    className={`w-full p-4 rounded-2xl border-2 transition-all flex items-center justify-between group active:scale-95
                                                        ${materials[r] >= CRAFTING_COSTS[r] ? 'bg-white border-slate-100 hover:border-slate-300' : 'bg-slate-50 border-transparent opacity-60'}
                                                    `}
                                                >
                                                    <div className="flex items-center gap-3">
                                                        <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${getRarityBg(r)}`}>
                                                            <PenTool size={20} className={getRarityTextColor(r)} />
                                                        </div>
                                                        <div className="text-left">
                                                            <div className={`font-black text-sm ${getRarityTextColor(r)}`}>{r} ITEM</div>
                                                            <div className="text-[10px] font-bold text-slate-400">Random {r} Equipment</div>
                                                        </div>
                                                    </div>
                                                    <div className="text-right">
                                                        <div className={`font-black font-mono ${materials[r] >= CRAFTING_COSTS[r] ? 'text-slate-800' : 'text-red-500'}`}>
                                                            {CRAFTING_COSTS[r]} Shards
                                                        </div>
                                                        <div className="text-[10px] font-bold text-slate-400">Own: {materials[r]}</div>
                                                    </div>
                                                </button>
                                            ))}
                                        </div>
                                    </div>
                                )}
                            </div>
                        )}
                    </div>
                </motion.div>
            )}

            {/* HOVER TOOLTIP */}
            {hoveredItem && !sellDialogItem && (
                <motion.div 
                    initial={{ opacity: 0, scale: 0.95 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.1 }}
                    className="fixed z-[60] bg-white p-4 rounded-2xl shadow-2xl border border-slate-100 w-64 pointer-events-none"
                    style={{ 
                        left: Math.min(window.innerWidth - 280, mousePos.x + 20), 
                        top: Math.min(window.innerHeight - 200, mousePos.y + 20) 
                    }}
                >
                    <div className="flex gap-3 mb-3">
                        <div className={`w-12 h-12 rounded-xl flex items-center justify-center shrink-0 ${getRarityBg(hoveredItem.rarity)}`}>
                            <ItemIcon item={hoveredItem} size={24} />
                        </div>
                        <div>
                            <div className={`font-black text-sm ${getRarityTextColor(hoveredItem.rarity)}`}>
                                {hoveredItem.name} {hoveredItem.level > 1 && <span className="text-amber-500">+{hoveredItem.level-1}</span>}
                            </div>
                            <div className="text-[10px] font-bold text-slate-400 uppercase">{hoveredItem.rarity} {hoveredItem.type}</div>
                        </div>
                    </div>
                    <div className="h-px bg-slate-100 w-full mb-3" />
                    <div className="text-xs text-slate-600 font-medium mb-3">{hoveredItem.description}</div>
                    
                    {hoveredItem.stats && (
                        <div className="grid grid-cols-2 gap-1 mb-2">
                            {Object.entries(hoveredItem.stats).map(([k, v]) => (
                                <div key={k} className="flex justify-between text-[10px]">
                                    <span className="text-slate-400 font-bold capitalize">{k}</span>
                                    <span className="text-slate-800 font-mono">{formatStat(k, v as number)}</span>
                                </div>
                            ))}
                        </div>
                    )}
                    
                    <div className="text-right text-xs font-black text-amber-500 mt-2">Sell: {Math.floor(hoveredItem.price * 0.3)} G</div>
                </motion.div>
            )}

            {/* GAME OVER SCREEN - FIXED Z-INDEX & POINTER EVENTS */}
            {status === GameStatus.GAME_OVER && (
                <div className="absolute inset-0 z-[100] flex items-center justify-center bg-black/80 backdrop-blur-md pointer-events-auto">
                    <motion.div 
                        initial={{ scale: 0.8, opacity: 0 }} 
                        animate={{ scale: 1, opacity: 1 }} 
                        className="bg-white p-10 rounded-3xl shadow-2xl text-center max-w-md w-full border-4 border-slate-100"
                    >
                        <div className="w-24 h-24 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-6 text-red-500 border-4 border-red-50">
                            <Skull size={48} />
                        </div>
                        <h2 className="text-4xl font-black text-slate-800 mb-2 tracking-tight">DEFEATED</h2>
                        <p className="text-slate-500 font-bold mb-8">You survived until <span className="text-blue-500">Wave {wave}</span></p>
                        
                        <div className="bg-slate-50 rounded-2xl p-6 mb-8 border border-slate-100">
                            <div className="flex justify-between items-center mb-2">
                                <span className="text-xs font-bold text-slate-400 uppercase">Total Gold Earned</span>
                                <span className="text-lg font-mono font-black text-amber-500">+{score.toLocaleString()}</span>
                            </div>
                            <div className="flex justify-between items-center">
                                <span className="text-xs font-bold text-slate-400 uppercase">Runs Completed</span>
                                <span className="text-lg font-mono font-black text-slate-800">{gameStats.totalRuns}</span>
                            </div>
                        </div>

                        <button 
                            onClick={resetGame}
                            className="w-full py-4 bg-slate-900 text-white rounded-2xl font-black text-lg shadow-xl hover:scale-105 transition-transform"
                        >
                            RETURN TO MENU
                        </button>
                    </motion.div>
                </div>
            )}

        </AnimatePresence>
      </div>
    </div>
  );
};
