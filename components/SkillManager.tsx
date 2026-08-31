

import React, { useRef, useState, useEffect } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { InstancedMesh, Object3D, Vector3, Line, Mesh } from 'three';
import { useGameStore } from '../store';
import { GameStatus, BulletData, EnemyData } from '../types';
import { COLORS } from '../constants';

const dummy = new Object3D();

interface SkillManagerProps {
    enemyBulletsDataRef: React.MutableRefObject<BulletData[]>;
    bulletsDataRef: React.MutableRefObject<BulletData[]>;
    targetPosRef: React.MutableRefObject<Vector3>;
    enemiesDataRef?: React.MutableRefObject<EnemyData[]>;
}

export const SkillManager: React.FC<SkillManagerProps> = ({ enemyBulletsDataRef, bulletsDataRef, targetPosRef, enemiesDataRef }) => {
  const { skillLevels, playerPosition, status, stats, heal, takeDamage, updatePassiveCooldowns, useMana, getManaCost } = useGameStore();
  const { scene } = useThree();
  
  const orbitalState = useRef(2); 
  const orbitalTimer = useRef(2.0); 
  const orbitalRef = useRef<InstancedMesh>(null);
  const orbitalBlades = useRef<{ active: boolean, pos: Vector3, vel: Vector3 }[]>([]);
  const orbitalDamageTimer = useRef(0);
  
  const thunderTimer = useRef(0);
  const [thunderPositions, setThunderPositions] = useState<Vector3[]>([]);
  const thunderVisualTimer = useRef(0);

  const poisonTimer = useRef(0);
  const freezingTimer = useRef(0);

  const blizzardTimer = useRef(0);
  
  const stampTimer = useRef(0);
  const stampStage = useRef(0); 
  const stampSequenceTimer = useRef(0); 
  const stampVisualRef = useRef<Mesh>(null);
  const stampVisualTimer = useRef(0);
  
  const blizzardVisualRef = useRef<Mesh>(null);
  const blizzardVisualTimer = useRef(0);

  const barrierVisualRef = useRef<Mesh>(null);
  const barrierVisualTimer = useRef(0);

  const stormTimer = useRef(0);

  // Event listener for barrier visual
  useEffect(() => {
      const handleBarrierTrigger = (e: CustomEvent) => {
          barrierVisualTimer.current = 0.5; // Duration of expanding ring
      };
      window.addEventListener('barrier-trigger', handleBarrierTrigger as EventListener);
      return () => window.removeEventListener('barrier-trigger', handleBarrierTrigger as EventListener);
  }, []);

  const spawnBullet = (type: any, speed: number, damageMult: number, overrides: Partial<BulletData> = {}, dir: Vector3) => {
      const bullet = bulletsDataRef.current.find(b => !b.active);
      if (bullet) {
          bullet.active = true;
          bullet.lifetime = overrides.lifetime || 3.0;
          bullet.position.copy(playerPosition).add(new Vector3(0, 1.5, 0));
          
          bullet.velocity.copy(dir).multiplyScalar(speed);
          bullet.type = type;
          bullet.pierce = overrides.pierce || 1;
          bullet.damageMultiplier = damageMult * stats.skillDamage * 2.0; 
          bullet.hitIds = [];
          if (overrides.knockback) bullet.knockback = overrides.knockback;
          if (overrides.effect) bullet.effect = overrides.effect;
          if (overrides.trailTimer !== undefined) bullet.trailTimer = overrides.trailTimer;
          if (overrides.bouncesLeft) bullet.bouncesLeft = overrides.bouncesLeft;
      }
  };

  const performStomp = (stage: number) => {
      stampVisualTimer.current = 0.5;
      
      const enemies = enemiesDataRef ? enemiesDataRef.current : [];
      for (let i = 0; i < enemies.length; i++) {
          const enemy = enemies[i];
          if (enemy.active && enemy.position.distanceTo(playerPosition) < 16.0) { 
              const dmg = stats.damage * 1.5 * stats.skillDamage;
              enemy.health -= dmg;

              if (stage === 1) {
                  enemy.freezeTimer = 2.0; 
              } else if (stage === 2) {
                  const dir = new Vector3().subVectors(enemy.position, playerPosition).normalize();
                  enemy.position.add(dir.multiplyScalar(5.0));
              }

              window.dispatchEvent(new CustomEvent('damage', { 
                  detail: { position: enemy.position, damage: dmg, isCrit: false, damageType: 'PHYSICAL' } 
              }));
          }
      }
  };

  useFrame((state, delta) => {
    if (status !== GameStatus.PLAYING) return;

    const time = state.clock.getElapsedTime();

    const enemies = enemiesDataRef ? enemiesDataRef.current : [];
    const hasEnemyInRange = enemies.some(
      e => e.active && e.position.distanceTo(playerPosition) <= stats.attackRange
    );

    if (skillLevels.poison > 0) {
        poisonTimer.current += delta;
        const maxCd = Math.max(2.0, 8.0 - (skillLevels.poison * 0.5));
        updatePassiveCooldowns({ poisonCooldown: maxCd - poisonTimer.current, poisonMaxCooldown: maxCd });

        if (poisonTimer.current >= maxCd) {
            if (hasEnemyInRange) {
                if (useMana(getManaCost('poison'))) {
                    poisonTimer.current = 0;
                    const baseDir = new Vector3().subVectors(targetPosRef.current, playerPosition).normalize();
                    const damageMult = 0.525;
                    const spread = 0.5;
                    for(let i=-1; i<=1; i++) {
                        const dir = baseDir.clone().applyAxisAngle(new Vector3(0,1,0), i * spread);
                        spawnBullet('BURNING_ARROW', 30, damageMult, {
                            pierce: 5,
                            effect: { type: 'BURN', duration: 4, value: stats.damage * 0.3 }
                        }, dir);
                    }
                } else {
                    poisonTimer.current = maxCd;
                }
            } else {
                poisonTimer.current = maxCd;
            }
        }
    }

    if (skillLevels.freezing > 0) {
        freezingTimer.current += delta;
        const maxCd = Math.max(2.0, 7.0 - (skillLevels.freezing * 0.5));
        updatePassiveCooldowns({ freezingCooldown: maxCd - freezingTimer.current, freezingMaxCooldown: maxCd });

        if (freezingTimer.current >= maxCd) {
            if (hasEnemyInRange) {
                if (useMana(getManaCost('freezing'))) {
                    freezingTimer.current = 0;
                    const baseDir = new Vector3().subVectors(targetPosRef.current, playerPosition).normalize();
                    const spread = 0.5;
                    for(let i=-1; i<=1; i++) {
                        const dir = baseDir.clone().applyAxisAngle(new Vector3(0,1,0), i * spread);
                        spawnBullet('FREEZING_ARROW', 30, 0.75, {
                            pierce: 5,
                            effect: { type: 'FREEZE', duration: 1.5 }
                        }, dir);
                    }
                } else {
                    freezingTimer.current = maxCd;
                }
            } else {
                freezingTimer.current = maxCd;
            }
        }
    }

    if (skillLevels.freezeSpell > 0) {
        blizzardTimer.current += delta;
        const maxCd = Math.max(7.0, 14.0 - (skillLevels.freezeSpell * 0.2));
        updatePassiveCooldowns({ blizzardCooldown: maxCd - blizzardTimer.current, blizzardMaxCooldown: maxCd });

        if (blizzardTimer.current >= maxCd) {
            if (hasEnemyInRange) {
                if (useMana(getManaCost('freezeSpell'))) {
                    blizzardTimer.current = 0;
                    blizzardVisualTimer.current = 1.5;

                    for (let i = 0; i < enemies.length; i++) {
                        const enemy = enemies[i];
                        if (enemy.active && enemy.position.distanceTo(playerPosition) < 27.0) {
                            enemy.freezeTimer = 5.1;
                            const dmg = stats.damage * 0.75 * stats.skillDamage;
                            enemy.health -= dmg;
                            window.dispatchEvent(new CustomEvent('damage', {
                                detail: { position: enemy.position, damage: dmg, isCrit: false, damageType: 'ICE' }
                            }));
                        }
                    }
                } else {
                    blizzardTimer.current = maxCd;
                }
            } else {
                blizzardTimer.current = maxCd;
            }
        }
    }

    if (skillLevels.storm > 0) {
        stormTimer.current += delta;
        const maxCd = Math.max(5.0, 15.0 - (skillLevels.storm * 0.2)); 
        updatePassiveCooldowns({ stormCooldown: maxCd - stormTimer.current, stormMaxCooldown: maxCd });

        if (stormTimer.current >= maxCd) {
            if (hasEnemyInRange) {
                stormTimer.current = 0;
                const dir = new Vector3().subVectors(targetPosRef.current, playerPosition).normalize();
                spawnBullet('STORM', 4, 1.5, {
                    pierce: 99,
                    lifetime: 10.0,
                    knockback: 1.0,
                    bouncesLeft: 6
                }, dir);
            } else {
                stormTimer.current = maxCd;
            }
        }
    }

    if (skillLevels.stamp > 0) {
        if (stampStage.current === 0) {
            stampTimer.current += delta;
            const maxCd = Math.max(4.0, 12.0 - (skillLevels.stamp * 0.5));
            updatePassiveCooldowns({ stampCooldown: maxCd - stampTimer.current, stampMaxCooldown: maxCd });

            if (stampTimer.current >= maxCd) {
                if (hasEnemyInRange && useMana(getManaCost('stamp'))) {
                    stampStage.current = 1;
                    stampSequenceTimer.current = 0;
                    performStomp(1);
                } else if (!hasEnemyInRange) {
                    stampTimer.current = maxCd;
                }
            }
        } else if (stampStage.current === 1) {
            stampSequenceTimer.current += delta;
            if (stampSequenceTimer.current >= 0.5) { 
                performStomp(2); 
                stampStage.current = 0;
                stampTimer.current = 0; 
            }
        }
    }

    if (skillLevels.orbital > 0) {
        const count = 2 + skillLevels.orbital; 
        const damage = stats.damage * 1.5 * (1 + (skillLevels.orbital * 0.1)); 
        
        if (orbitalBlades.current.length !== count) {
            orbitalBlades.current = new Array(count).fill(0).map(() => ({ active: true, pos: new Vector3(), vel: new Vector3() }));
        }

        if (orbitalState.current === 2) {
            orbitalTimer.current += delta;
            updatePassiveCooldowns({ orbitalCooldown: 2 - orbitalTimer.current, orbitalMaxCooldown: 2 });
            
            for (let i = 0; i < 20; i++) {
                dummy.position.set(0, -100, 0);
                dummy.updateMatrix();
                orbitalRef.current?.setMatrixAt(i, dummy.matrix);
            }
            
            if (orbitalTimer.current > 2.0) {
                orbitalState.current = 0;
                orbitalTimer.current = 0;
                orbitalDamageTimer.current = 0.2; 
            }
        } else if (orbitalState.current === 0) {
            orbitalTimer.current += delta;
            orbitalDamageTimer.current += delta;
            updatePassiveCooldowns({ orbitalCooldown: 4 - orbitalTimer.current, orbitalMaxCooldown: 4 });

            const radius = 4.0;
            const speed = 3.0;
            
            for (let i = 0; i < count; i++) {
                const angle = (time * speed) + (i * ((Math.PI * 2) / count));
                orbitalBlades.current[i].active = true;
                orbitalBlades.current[i].pos.set(
                    playerPosition.x + Math.cos(angle) * radius,
                    1.0,
                    playerPosition.z + Math.sin(angle) * radius
                );
                
                dummy.position.copy(orbitalBlades.current[i].pos);
                dummy.rotation.set(0, -angle, 0);
                dummy.scale.set(3.0, 3.0, 3.0); 
                dummy.updateMatrix();
                orbitalRef.current?.setMatrixAt(i, dummy.matrix);

                const enemyBullets = enemyBulletsDataRef.current;
                const bladeRadius = 1.0;
                for (let b = 0; b < enemyBullets.length; b++) {
                    const bullet = enemyBullets[b];
                    if (bullet.active && bullet.position.distanceTo(orbitalBlades.current[i].pos) < bladeRadius) {
                        bullet.active = false;
                    }
                }
            }

            const tickRate = 0.2;
            if (orbitalDamageTimer.current >= tickRate) {
                const tickDamage = damage * tickRate * 5; 
                orbitalDamageTimer.current = 0;

                const enemies = enemiesDataRef ? enemiesDataRef.current : [];
                for (let i = 0; i < count; i++) {
                    const bladePos = orbitalBlades.current[i].pos;
                    for (let e = 0; e < enemies.length; e++) {
                        if (enemies[e].active && enemies[e].position.distanceTo(bladePos) < 2.0) {
                                enemies[e].health -= tickDamage;
                                window.dispatchEvent(new CustomEvent('damage', { 
                                detail: { position: enemies[e].position, damage: tickDamage, isCrit: false, damageType: 'PHYSICAL' } 
                                }));
                        }
                    }
                }
            }

            if (orbitalTimer.current > 4.0) {
                orbitalState.current = 1;
                orbitalTimer.current = 0;

                // Launch blades toward mouse cursor direction (no auto-aim)
                const mouseDir = new Vector3().subVectors(targetPosRef.current, playerPosition).normalize();
                if (mouseDir.lengthSq() < 0.01) mouseDir.set(1, 0, 0);
                for(let i=0; i<count; i++) {
                    // Spread blades in a cone around the mouse direction
                    const spreadAngle = count > 1 ? ((i - (count - 1) / 2) / (count - 1)) * 0.6 : 0;
                    const dir = mouseDir.clone().applyAxisAngle(new Vector3(0, 1, 0), spreadAngle);
                    orbitalBlades.current[i].vel.copy(dir).multiplyScalar(20);
                }
            }

        } else if (orbitalState.current === 1) {
            let activeCount = 0;
            for (let i = 0; i < count; i++) {
                const blade = orbitalBlades.current[i];
                if (blade.active) {
                    blade.pos.add(blade.vel.clone().multiplyScalar(delta));
                    
                    const enemyBullets = enemyBulletsDataRef.current;
                    for (let b = 0; b < enemyBullets.length; b++) {
                        const bullet = enemyBullets[b];
                        if (bullet.active && bullet.position.distanceTo(blade.pos) < 1.5) {
                            bullet.active = false;
                        }
                    }

                    const enemies = enemiesDataRef ? enemiesDataRef.current : [];
                    for (let e = 0; e < enemies.length; e++) {
                        if (enemies[e].active && enemies[e].position.distanceTo(blade.pos) < 1.5) {
                                enemies[e].health -= damage * 5;
                                blade.active = false; 
                                window.dispatchEvent(new CustomEvent('damage', { 
                                detail: { position: enemies[e].position, damage: damage * 5, isCrit: false, damageType: 'PHYSICAL' } 
                                }));
                        }
                    }

                    if (blade.pos.distanceTo(playerPosition) > 50) blade.active = false;

                    if (blade.active) {
                         dummy.position.copy(blade.pos);
                         dummy.rotation.set(0, time * 10, 0);
                         dummy.scale.set(3.0, 3.0, 3.0); 
                         dummy.updateMatrix();
                         orbitalRef.current?.setMatrixAt(i, dummy.matrix);
                         activeCount++;
                    } else {
                         dummy.position.set(0, -100, 0);
                         dummy.updateMatrix();
                         orbitalRef.current?.setMatrixAt(i, dummy.matrix);
                    }
                } else {
                     dummy.position.set(0, -100, 0);
                     dummy.updateMatrix();
                     orbitalRef.current?.setMatrixAt(i, dummy.matrix);
                }
            }

            if (activeCount === 0 || orbitalTimer.current > 2.0) {
                orbitalState.current = 2;
                orbitalTimer.current = 0;
            }
            orbitalTimer.current += delta;
        }
        
        orbitalRef.current!.instanceMatrix.needsUpdate = true;
    } else {
        if (orbitalRef.current) orbitalRef.current.visible = false;
    }

    if (skillLevels.thunder > 0) {
        thunderTimer.current += delta;
        const maxCd = 7.0;
        updatePassiveCooldowns({ thunderCooldown: maxCd - thunderTimer.current, thunderMaxCooldown: maxCd });
        
        if (thunderTimer.current > maxCd) {
            const activeEnemies: any[] = [];
            for(const e of enemies) {
                if (e.active && e.position.distanceTo(playerPosition) < 40) {
                    activeEnemies.push(e);
                }
            }

            if (hasEnemyInRange && activeEnemies.length > 0) {
                if (useMana(getManaCost('thunder'))) {
                    thunderTimer.current = 0;
                    const hitCount = 4 + skillLevels.thunder;
                    const hits: Vector3[] = [];

                    for(let i=0; i<hitCount; i++) {
                            if (activeEnemies.length === 0) break;
                            const idx = Math.floor(Math.random() * activeEnemies.length);
                            const target = activeEnemies[idx];

                            const isCrit = Math.random() < stats.critRate;
                            const baseDmg = stats.damage * 0.75 * (1 + (skillLevels.thunder * 0.1));
                            const dmg = baseDmg * (isCrit ? stats.critDamage : 1);

                            target.health -= dmg;

                            window.dispatchEvent(new CustomEvent('damage', {
                            detail: { position: target.position, damage: dmg, isCrit, damageType: 'MAGIC' }
                            }));

                            hits.push(target.position.clone());
                            activeEnemies.splice(idx, 1);
                    }

                    setThunderPositions(hits);
                    thunderVisualTimer.current = 0.25;
                } else {
                    thunderTimer.current = maxCd;
                }
            } else if (!hasEnemyInRange) {
                thunderTimer.current = maxCd;
            }
        }
    }
    
    if (thunderVisualTimer.current > 0) {
        thunderVisualTimer.current -= delta;
        if (thunderVisualTimer.current <= 0) setThunderPositions([]);
    }

    if (blizzardVisualTimer.current > 0) {
        blizzardVisualTimer.current -= delta;
        if (blizzardVisualRef.current) {
            blizzardVisualRef.current.visible = true;
            blizzardVisualRef.current.position.copy(playerPosition).add(new Vector3(0, 0.1, 0));
            blizzardVisualRef.current.scale.setScalar(1 + (1.5 - blizzardVisualTimer.current) * 20);
            blizzardVisualRef.current.material.opacity = (blizzardVisualTimer.current / 1.5) * 0.5;
        }
    } else if (blizzardVisualRef.current) blizzardVisualRef.current.visible = false;

    if (stampVisualTimer.current > 0) {
        stampVisualTimer.current -= delta;
        if (stampVisualRef.current) {
            stampVisualRef.current.visible = true;
            stampVisualRef.current.position.copy(playerPosition).add(new Vector3(0, 0.1, 0));
            const scaleBase = stampStage.current === 1 ? 30 : 50; 
            stampVisualRef.current.scale.setScalar(1 + (0.5 - stampVisualTimer.current) * scaleBase);
            stampVisualRef.current.material.opacity = stampVisualTimer.current * 0.8;
        }
    } else if (stampVisualRef.current) stampVisualRef.current.visible = false;

    if (barrierVisualTimer.current > 0) {
        barrierVisualTimer.current -= delta;
        if (barrierVisualRef.current) {
            barrierVisualRef.current.visible = true;
            barrierVisualRef.current.position.copy(playerPosition).add(new Vector3(0, 0.1, 0));
            const scale = 1 + (0.5 - barrierVisualTimer.current) * 40;
            barrierVisualRef.current.scale.setScalar(scale);
            barrierVisualRef.current.material.opacity = barrierVisualTimer.current * 2.0; 
        }
    } else if (barrierVisualRef.current) {
        barrierVisualRef.current.visible = false;
    }

  });

  return (
    <>
      <instancedMesh ref={orbitalRef} args={[undefined, undefined, 20]} frustumCulled={false} visible={skillLevels.orbital > 0}>
        <octahedronGeometry args={[0.4, 0]} />
        <meshStandardMaterial color="#0ea5e9" emissive="#0ea5e9" emissiveIntensity={2} />
      </instancedMesh>

      {thunderPositions.map((pos, i) => (
          <mesh key={i} position={pos}>
              <cylinderGeometry args={[0.1, 0.1, 30, 8]} />
              <meshBasicMaterial color="yellow" transparent opacity={0.8} />
          </mesh>
      ))}

      <mesh ref={blizzardVisualRef} rotation={[-Math.PI/2, 0, 0]} visible={false}>
           <circleGeometry args={[1, 32]} />
           <meshStandardMaterial color="#0ea5e9" transparent opacity={0.5} emissive="#0ea5e9" />
      </mesh>

      <mesh ref={stampVisualRef} rotation={[-Math.PI/2, 0, 0]} visible={false}>
           <ringGeometry args={[0.8, 1, 32]} />
           <meshStandardMaterial color="#f97316" transparent opacity={0.6} emissive="#f97316" />
      </mesh>

      <mesh ref={barrierVisualRef} rotation={[-Math.PI/2, 0, 0]} visible={false}>
           <ringGeometry args={[0.7, 1, 32]} />
           <meshStandardMaterial color="#22d3ee" transparent opacity={0.8} emissive="#22d3ee" emissiveIntensity={2} />
      </mesh>
    </>
  );
};