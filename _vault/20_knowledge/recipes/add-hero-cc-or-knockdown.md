# Recipe: knockdown / crowd control
- Hero side: `knockHero`, `KB` presets (PUSH, FLINCH, SLAM...) in `engine/systems/combat.ts`. A hit with `KB.SLAM` downs the hero; rules: 1.6 s KNOCK_IMMUNE after, none while stunned/frozen/rooted, `resCC` shortens.
- Monster side: pass `down` seconds in the damage options of a skill (or on a projectile); `combat.downEnemy` applies it. Elites half duration, dark heroes capped 1.0 s with a 4 s resist window, normal monsters resist 2.0 s after getting up, bosses / mini-bosses never.
- Render: `Poser.down` in `render/enemyModels.ts`; co-op: bit 15 of the first enemy word in the snapshot.
- Describe it in the skill text ("Knocks enemies down (not bosses)").
