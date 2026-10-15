// Mining Supplies (the stall in the mining camp at the Crystal Cave, shop tab 'MINE'): sells spare lantern-oil flasks
// (single / Miner's Kit; carried into the cave, they pour themselves in when the lantern runs dry below Floor 1) and buys
// ore, gems and the cave's crystals at a premium (engine/systems/caveKit.ts). Lantern upgrades stay at Grit's bench inside.
import React, { useEffect, useState } from 'react';
import { Pickaxe, FlaskConical } from 'lucide-react';
import { useGameStore } from '../../../store';
import { ItemSlot } from '../../components/ItemSlot';
import { Button } from '../../components/Button';
import { useUiStore } from '../../uiStore';
import { UNLOCK_LV } from '../../../unlocks';
import {
  spareFlasks, onKitChange, buyFlasks, sellMineGoods, isMineGood, minePrice,
  SPARE_FLASK_OIL, MAX_SPARE, FLASK_PRICE, KIT_FLASKS, KIT_PRICE, MINE_PREMIUM,
} from '../../../engine/systems/caveKit';

export const MineShopTab: React.FC = () => {
  const gold = useGameStore((s) => s.gold);
  const level = useGameStore((s) => s.level);
  const inventory = useGameStore((s) => s.inventory);
  const ask = useUiStore((s) => s.askConfirm);
  const [, bump] = useState(0);
  useEffect(() => onKitChange(() => bump((n) => n + 1)), []);
  const have = spareFlasks(), full = have >= MAX_SPARE;
  const goods = inventory.filter(isMineGood);
  const count = goods.reduce((n, i) => n + (i.quantity || 1), 0);
  const value = goods.reduce((n, i) => n + minePrice(i) * (i.quantity || 1), 0);
  const deepLocked = level < UNLOCK_LV.CAVE;

  const offer = (n: number, price: number, title: string, body: string, id: string) => (
    <div className="brew-card">
      <div className="brew-name"><FlaskConical size={16} /> {title}</div>
      <div className="brew-fx">{body}</div>
      <button className="forge-btn on mt-3" disabled={full || gold < price} data-testid={id}
        onClick={() => ask({ title: `Buy ${title}?`, body: `${body} (${price.toLocaleString()} G)`, confirmLabel: 'Buy', onConfirm: () => { buyFlasks(n, price); } })}>
        <FlaskConical size={18} /> {full ? `Carrying the most you can (${MAX_SPARE})` : gold < price ? `${price.toLocaleString()} G (not enough gold)` : `Buy · ${price.toLocaleString()} G`}
      </button>
    </div>
  );

  return (
    <div className="flex flex-col gap-4" data-testid="mine-shop">
      <div>
        <div className="rpg-label mb-2">Lantern oil</div>
        <div className="muted text-[.78rem] mb-2">
          Spare flasks ride in your pack. Below Floor 1, the moment your lantern runs dry one pours itself in: +{SPARE_FLASK_OIL} s of light instead of a cave-in.
          {' '}You carry <b style={{ color: '#ffb84a' }} data-testid="mine-flasks">{have}</b> / {MAX_SPARE}.
          {deepLocked && <> The deep floors open at Lv {UNLOCK_LV.CAVE}.</>}
        </div>
        <div className="flex flex-col gap-2">
          {offer(1, FLASK_PRICE, 'Lantern Oil Flask', `One sealed flask: +${SPARE_FLASK_OIL} s of lantern light on a deep trip.`, 'buy-flask')}
          {offer(KIT_FLASKS, KIT_PRICE, 'Miner\'s Kit', `${KIT_FLASKS} oil flasks, bundled for less (save ${(FLASK_PRICE * KIT_FLASKS - KIT_PRICE).toLocaleString()} G).`, 'buy-kit')}
        </div>
        <div className="rpg-label !text-[.55rem] mt-1.5 opacity-70">Bigger lanterns and refills: Grit's bench, inside the cave.</div>
      </div>
      <div>
        <div className="rpg-label mb-2">Ore &amp; crystals (+{Math.round((MINE_PREMIUM - 1) * 100)}% over the town price)</div>
        {goods.length > 0 ? (
          <div className="slot-grid priced">
            {goods.map((it) => (
              <ItemSlot key={it.id} item={it} fluid size="100%" iconSize="78%" price={minePrice(it)} tooltip="sell" compare={false}
                onClick={() => ask({ title: `Sell ${it.name}?`, body: `${(it.quantity || 1)} x ${minePrice(it).toLocaleString()} G (anything an active quest still needs is kept).`, confirmLabel: 'Sell', onConfirm: () => { sellMineGoods(it); } })} />
            ))}
          </div>
        ) : <div className="muted text-[.78rem]">No ore or crystals in your bag. Mine the veins around the camp and inside the Crystal Cave.</div>}
        <Button className="w-full mt-2" variant="green" disabled={count === 0} data-testid="sell-all-ore"
          onClick={() => ask({ title: 'Sell all ore & crystals?', body: `${count} pieces for about ${value.toLocaleString()} G. Anything your quests still need stays in your bag.`, confirmLabel: 'Sell all', onConfirm: () => { sellMineGoods(); } })}>
          <Pickaxe size={16} /> Sell all ore &amp; crystals · {count} · {value.toLocaleString()} G
        </Button>
      </div>
    </div>
  );
};
