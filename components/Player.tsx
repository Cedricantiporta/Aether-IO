
import React, { useRef, useState } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { Html } from '@react-three/drei';
import { Vector3, InstancedMesh, Mesh, Raycaster, Plane } from 'three';
import { useGameStore } from '../store';
import { COLORS, PLAYER_RADIUS, ARENA_SIZE } from '../constants';
import { BulletManager } from './BulletManager';
import { GameStatus, BulletData, EnemyData } from '../types';
import { SpatialHashGrid } from '../utils/SpatialHashGrid';
import { ASSET_FLAGS } from '../assetConfig';
import { PlayerModel } from './PlayerModel';

interface PlayerProps {
  bulletsDataRef: React.MutableRefObject<BulletData[]>;
  enemyBulletsDataRef: React.MutableRefObject<BulletData[]>;
  targetPosRef: React.MutableRefObject<Vector3>;
  // New props
  enemiesDataRef: React.MutableRefObject<EnemyData[]>;
  spatialGrid?: React.MutableRefObject<SpatialHashGrid>;
}

export const Player: React.FC<PlayerProps> = ({ bulletsDataRef, enemyBulletsDataRef, targetPosRef, enemiesDataRef, spatialGrid }) => {
  const meshRef = useRef<any>(null);
  const axeSpinRef = useRef<any>(null);
  const reviveVisualRef = useRef<any>(null);
  const reviveVisualTimer = useRef(0);

  // Animation state signals for PlayerModel
  const isMovingRef = useRef(false);
  const isAttackingRef = useRef(false);

  const { stats, status, setPlayerPosition, skills, triggerSkillCooldown, tickCooldowns, takeDamage, equipment, useMana, triggerInvincibility, obstacles, crates, isInvincible, toggleInventory, breakCrate, hero, levelUpVisualTimer, health, mana, level, activeAbilityQ, activateRage, rageMode, skillLevels, activateEarthwall, activateWarVitality, activateSprint, reviveAnimTimer, dashCharges, getManaCost, addNotification, revivingCountdown, isInventoryOpen, isShopOpen, isCharacterSheetOpen, piercingShotBoostTimer, set: setState } = useGameStore();
  const { camera, scene, raycaster, pointer } = useThree();
  
  const [pos] = useState(new Vector3(0, 0, 0));
  const [velocity] = useState(new Vector3(0, 0, 0));
  const [keys, setKeys] = useState<{ [key: string]: boolean }>({});
  
  const groundPlane = new Plane(new Vector3(0, 1, 0), 0);
  
  const dashVelocity = useRef(new Vector3());
  const dashTime = useRef(0);
  const dashDebounce = useRef(0);
  const cooldownDebounce = useRef(0); // Debounce for cooldown notifications
  const axeSpinTime = useRef(0);
  const axeDamageTimer = useRef(0);
  const arrowRainState = useRef({ active: false, wavesLeft: 0, timer: 0 });

  React.useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
        if (e.code === 'Space') e.preventDefault();
        setKeys((k) => ({ ...k, [e.code]: true }));
        if (e.code === 'KeyI') toggleInventory();
    };
    const handleKeyUp = (e: KeyboardEvent) => setKeys((k) => ({ ...k, [e.code]: false }));
    const handleRevive = () => {
        reviveVisualTimer.current = 0.5;
        window.dispatchEvent(new CustomEvent('barrier-trigger', {
            detail: {
                position: playerPosition,
                radius: 15,
                force: 10,
                damage: stats.damage * 10
            }
        }));
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    window.addEventListener('revive', handleRevive as EventListener);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
      window.removeEventListener('revive', handleRevive as EventListener);
    };
  }, [toggleInventory]);

  const notifyCooldown = (skillName: string) => {
      if (cooldownDebounce.current <= 0) {
          addNotification(`${skillName} Cooldown!`, 'red', 'WARNING');
          cooldownDebounce.current = 1.5; 
      }
  };

  const spawnBullet = (type: any, speed: number, damageMult: number, overrides: Partial<BulletData> = {}) => {
      const bullet = bulletsDataRef.current.find(b => !b.active);
      if (bullet) {
          bullet.active = true;
          bullet.lifetime = overrides.lifetime || 3.0;
          let aimDir = new Vector3().subVectors(targetPosRef.current, pos).normalize();
          
          if (type === 'BLACKHOLE') {
              bullet.position.copy(pos).add(aimDir.clone().multiplyScalar(15.0)).add(new Vector3(0, 1.5, 0));
              bullet.velocity.set(0, 0, 0); 
          } else {
              bullet.position.copy(pos).add(new Vector3(0, 1.5, 0));
              bullet.velocity.copy(aimDir).multiplyScalar(speed);
          }
          
          bullet.type = type;
          bullet.pierce = overrides.pierce || 1;
          bullet.damageMultiplier = damageMult * stats.skillDamage * 2.0; 
          bullet.hitIds = [];
          if (overrides.knockback) bullet.knockback = overrides.knockback;
          if (overrides.effect) bullet.effect = overrides.effect;
          if (overrides.trailTimer !== undefined) bullet.trailTimer = overrides.trailTimer;
          if (overrides.maxPullCount) bullet.maxPullCount = overrides.maxPullCount;
          
          return bullet;
      }
      return null;
  };

  const handleAbility = (ability: string, isQ: boolean) => {
      const cost = isQ ? getManaCost('q') : getManaCost('r');
      if (useMana(cost)) {
          triggerSkillCooldown(isQ ? 'q' : 'r');

          if (ability === 'RAGE') {
              activateRage();
          } else if (ability === 'PIERCING_SHOT') {
              // Archer Q: 3x attack speed + max multishot for 2.5s
              setState({ piercingShotBoostTimer: 2.5 });
          } else if (ability === 'GRAVITY_SPELL') {
              const limit = 8 + (skillLevels.gravity * 1);
              spawnBullet('BLACKHOLE', 0, 5.0, { pierce: 99, lifetime: 2.6, trailTimer: 0.1, maxPullCount: limit });
          } else if (ability === 'ARROW_RAIN') {
              arrowRainState.current.active = true;
              arrowRainState.current.wavesLeft = 6;
              arrowRainState.current.timer = 0;
          } else if (ability === 'FIREBALL') {
              // Wizard Q: Slightly longer range and 2x burn damage
              spawnBullet('FIREBALL', 5, 2.0 * 0.63, {
                  pierce: 100,
                  lifetime: 4.0,
                  effect: { type: 'BURN', duration: 5, value: stats.damage * 0.6 }
              });
          } else if (ability === 'AXE_SPIN') {
              axeSpinTime.current = 3.0;
              axeDamageTimer.current = 0.2;
          }
      } else {
          addNotification('Insufficient Mana', '#60a5fa', 'WARNING');
          window.dispatchEvent(new CustomEvent('skill-error', { detail: { position: pos.clone().add(new Vector3(0, 1, 0)), text: 'INSUFFICIENT MANA' } }));
      }
  };

  const handleSkillE = () => {
      if (skillLevels.special <= 0) return;
      if (skills.e > 0) {
          notifyCooldown("Skill E");
          return;
      }

      const manaCost = getManaCost('e');
      if (useMana(manaCost)) {
          triggerSkillCooldown('e');
          if (hero === 'BARBARIAN') {
              activateWarVitality();
          } else if (hero === 'WIZARD') {
              activateEarthwall(pos.clone());
          } else if (hero === 'ARCHER') {
              activateSprint();
          }
      } else {
          addNotification('Insufficient Mana', '#60a5fa', 'WARNING');
          window.dispatchEvent(new CustomEvent('skill-error', { detail: { position: pos.clone().add(new Vector3(0, 1, 0)), text: 'INSUFFICIENT MANA' } }));
      }
  };

  useFrame((state, delta) => {
    if (status !== GameStatus.PLAYING) return;
    if (!meshRef.current) return;

    tickCooldowns(delta);
    if (cooldownDebounce.current > 0) cooldownDebounce.current -= delta;

    raycaster.setFromCamera(pointer, camera);
    const target = new Vector3();
    raycaster.ray.intersectPlane(groundPlane, target);
    targetPosRef.current.copy(target); 

    const frozen = revivingCountdown > 0;
    const moveDir = new Vector3(0, 0, 0);
    if (!frozen) {
      if (keys['KeyW'] || keys['ArrowUp']) moveDir.z -= 1;
      if (keys['KeyS'] || keys['ArrowDown']) moveDir.z += 1;
      if (keys['KeyA'] || keys['ArrowLeft']) moveDir.x -= 1;
      if (keys['KeyD'] || keys['ArrowRight']) moveDir.x += 1;
    }
    moveDir.normalize();
    isMovingRef.current = !frozen && moveDir.lengthSq() > 0;

    // Q = weapon ability, R = active skill (swapped from original)
    if (keys['KeyQ']) {
        if (skills.r > 0) notifyCooldown("Weapon Skill");
        else {
            const ability = equipment.weapon?.ability;
            if (ability) handleAbility(ability, false);
        }
    }

    if (keys['KeyR']) {
        if (skills.q > 0) notifyCooldown("Skill R");
        else if (activeAbilityQ) handleAbility(activeAbilityQ, true);
    }

    if (keys['KeyE']) {
        handleSkillE();
    }

    if (arrowRainState.current.active) {
        arrowRainState.current.timer -= delta;
        if (arrowRainState.current.timer <= 0) {
            const count = 12; 
            const angleOffset = (3 - arrowRainState.current.wavesLeft) * (Math.PI / 8); 

            for (let i = 0; i < count; i++) {
                const bullet = bulletsDataRef.current.find(b => !b.active);
                if (bullet) {
                    bullet.active = true;
                    bullet.lifetime = 1.0;
                    bullet.position.copy(pos).add(new Vector3(0, 1, 0));
                    const angle = (Math.PI * 2 * i) / count + angleOffset;
                    bullet.velocity.set(Math.cos(angle), 0, Math.sin(angle)).multiplyScalar(25);
                    bullet.type = 'ARROW';
                    bullet.pierce = 3; 
                    bullet.damageMultiplier = 1.5 * 0.63 * stats.skillDamage * 2.0; 
                    bullet.knockback = 3.0; 
                }
            }
            arrowRainState.current.wavesLeft--;
            arrowRainState.current.timer = 0.2; 
            if (arrowRainState.current.wavesLeft <= 0) arrowRainState.current.active = false;
        }
    }

    if (axeSpinTime.current > 0) {
        axeSpinTime.current -= delta;
        axeDamageTimer.current += delta;
        if (axeSpinRef.current) {
            axeSpinRef.current.visible = true;
            axeSpinRef.current.rotation.y += delta * 20; 
            // Range Increased by 50% (7->10.5, 8->12)
            const barrierRadius = 10.5; 
            const damageRange = 12.0;
            
            const tickRate = 0.2; 
            if (axeDamageTimer.current >= tickRate) {
                 const tickDamage = stats.damage * tickRate * 5 * stats.skillDamage * 2.0 * 0.63; 
                 axeDamageTimer.current = 0;
                 // Optimized: Use enemiesDataRef
                 const enemies = enemiesDataRef.current;
                 for (let i = 0; i < enemies.length; i++) {
                    const enemy = enemies[i];
                    if (!enemy.active) continue;
                    const dist = enemy.position.distanceTo(pos);
                    if (dist < damageRange) {
                        enemy.health -= tickDamage;
                        window.dispatchEvent(new CustomEvent('damage', { 
                            detail: { position: enemy.position, damage: tickDamage, isCrit: false, isPlayer: false } 
                        }));
                    }
                 }
            }
            // Push enemies away
            const enemies = enemiesDataRef.current;
            for (let i = 0; i < enemies.length; i++) {
                const enemy = enemies[i];
                if (!enemy.active) continue;
                const dist = enemy.position.distanceTo(pos);
                if (dist < barrierRadius) {
                        const pushDir = new Vector3().subVectors(enemy.position, pos).normalize();
                        enemy.position.copy(pos).add(pushDir.multiplyScalar(barrierRadius));
                }
            }
        }
    } else if (axeSpinRef.current) {
        axeSpinRef.current.visible = false;
    }

    // Dash Debounce to prevent consuming multiple charges instantly
    if (dashDebounce.current > 0) dashDebounce.current -= delta;

    if (keys['Space']) {
        if (dashDebounce.current <= 0) {
            if (dashCharges > 0) {
                if (useMana(getManaCost('dash'))) {
                    triggerSkillCooldown('dash'); // Consumes Charge
                    dashTime.current = 0.2; 
                    dashDebounce.current = 0.3; // Small lockout
                    dashVelocity.current.copy(moveDir.length() > 0 ? moveDir.normalize() : new Vector3(0, 0, -1).applyQuaternion(meshRef.current.quaternion));
                    dashVelocity.current.multiplyScalar(40); 
                    triggerInvincibility(0.2);
                }
            } else {
                notifyCooldown("Dash");
            }
        }
    }

    if (dashTime.current > 0) {
        dashTime.current -= delta;
        velocity.copy(dashVelocity.current);
    } else {
        velocity.lerp(moveDir.multiplyScalar(stats.moveSpeed), delta * 8);
    }
    
    const proposedPos = pos.clone().add(velocity.clone().multiplyScalar(delta));
    proposedPos.y = 0;

    for (const obs of obstacles) {
        const dist = proposedPos.distanceTo(obs.position);
        const minDistance = obs.radius + 0.4; 
        if (dist < minDistance) {
            const dir = new Vector3().subVectors(proposedPos, obs.position).normalize();
            proposedPos.copy(obs.position).add(dir.multiplyScalar(minDistance));
        }
    }

    for (const crate of crates) {
        if (crate.active) {
            const dist = proposedPos.distanceTo(crate.position);
            const minDistance = 0.7 + 0.4;
            if (dist < minDistance) {
                breakCrate(crate.id);
            }
        }
    }

    // Allow player to reach the dark boundary zone just before the void (void at ARENA_SIZE/2=60)
    const limit = (ARENA_SIZE / 2) - 2;
    if (proposedPos.length() > limit) {
        proposedPos.normalize().multiplyScalar(limit);
    }
    proposedPos.y = 0;

    pos.copy(proposedPos);
    meshRef.current.position.copy(pos);
    setPlayerPosition(pos.clone());

    meshRef.current.lookAt(targetPosRef.current);

    const enemyBullets = enemyBulletsDataRef.current;
    if (dashTime.current <= 0) {
        for(let i = 0; i < enemyBullets.length; i++) {
            const b = enemyBullets[i];
            if (b.active && b.position.distanceTo(pos) < PLAYER_RADIUS + 0.5) {
                const dmg = b.damage || 10;
                takeDamage(dmg);
                b.active = false;
                window.dispatchEvent(new CustomEvent('damage', {
                    detail: { position: pos, damage: dmg, isCrit: false, isPlayer: true }
                }));
            }
        }
    }

    // Revive visual effect
    if (reviveAnimTimer > 0) {
        if (reviveVisualTimer.current <= 0) {
            reviveVisualTimer.current = 0.3;
        }
    }
    if (reviveVisualTimer.current > 0) {
        reviveVisualTimer.current -= delta;
        if (reviveVisualRef.current) {
            reviveVisualRef.current.visible = true;
            reviveVisualRef.current.position.copy(pos).add(new Vector3(0, 0.1, 0));
            const scaleBase = 40;
            reviveVisualRef.current.scale.setScalar(1 + (0.3 - reviveVisualTimer.current) * scaleBase);
            reviveVisualRef.current.material.opacity = reviveVisualTimer.current * 0.8;
        }
    } else if (reviveVisualRef.current) {
        reviveVisualRef.current.visible = false;
    }

    const targetCamPos = new Vector3(pos.x, 35, pos.z + 28);
    camera.position.lerp(targetCamPos, delta * 4);
    camera.lookAt(pos.x, 0, pos.z);
  });

  return (
    <>
      <BulletManager 
          playerPos={pos} 
          targetPosRef={targetPosRef} 
          bulletsDataRef={bulletsDataRef}
          projectileType={equipment.weapon?.projectileType}
          enemiesDataRef={enemiesDataRef}
          spatialGrid={spatialGrid}
      />

      <group ref={meshRef} position={[0, 1, 0]}>
        
        {/* Floating HP/MP bars — hidden during menus/reward/revive */}
        {status !== GameStatus.LEVEL_UP && !isInventoryOpen && !isShopOpen && !isCharacterSheetOpen && revivingCountdown <= 0 && (
        <Html position={[0, 3.4, 0]} center zIndexRange={[50, 0]} style={{ pointerEvents: 'none' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                {/* Level circle */}
                <div style={{
                    width: 26, height: 26, borderRadius: '50%', flexShrink: 0,
                    background: 'radial-gradient(circle at 35% 35%, #1e293b, #0a0a12)',
                    border: '2px solid rgba(250,204,21,0.8)',
                    boxShadow: '0 0 8px rgba(250,204,21,0.5)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center'
                }}>
                    <span style={{ fontSize: 9, fontWeight: 900, color: '#fde047', lineHeight: 1 }}>{level}</span>
                </div>
                {/* Bars */}
                <div style={{ width: 72, display: 'flex', flexDirection: 'column', gap: 3 }}>
                    <div style={{ height: 8, background: 'rgba(0,0,0,0.7)', borderRadius: 3, overflow: 'hidden', border: '1px solid rgba(0,0,0,0.8)', boxShadow: 'inset 0 1px 3px rgba(0,0,0,0.8)' }}>
                        <div style={{ height: '100%', width: `${Math.max(0, Math.min(100, (health / stats.maxHealth) * 100))}%`, background: 'linear-gradient(90deg,#b91c1c,#ef4444)', borderRadius: 3, transition: 'width 0.1s' }} />
                    </div>
                    <div style={{ height: 6, background: 'rgba(0,0,0,0.7)', borderRadius: 3, overflow: 'hidden', border: '1px solid rgba(0,0,0,0.8)', boxShadow: 'inset 0 1px 3px rgba(0,0,0,0.8)' }}>
                        <div style={{ height: '100%', width: `${Math.max(0, Math.min(100, (mana / stats.maxMana) * 100))}%`, background: 'linear-gradient(90deg,#1d4ed8,#3b82f6)', borderRadius: 3, transition: 'width 0.1s' }} />
                    </div>
                </div>
            </div>
        </Html>
        )}

        {levelUpVisualTimer > 0 && (
            <>
                <Html position={[0, 2.5, 0]} center zIndexRange={[100, 0]}>
                    <div className="text-yellow-400 font-black text-2xl drop-shadow-[0_2px_2px_rgba(0,0,0,0.8)] animate-bounce whitespace-nowrap">
                        LEVEL UP!
                    </div>
                </Html>
                <mesh position={[0, 0.5, 0]} scale={[2, 4, 2]}>
                    <cylinderGeometry args={[0.5, 0.5, 1, 16]} />
                    <meshBasicMaterial color="#facc15" transparent opacity={levelUpVisualTimer * 0.5} depthWrite={false} side={2} />
                </mesh>
            </>
        )}

        {reviveAnimTimer > 0 && (
            <>
                <mesh position={[0, 0, 0]}>
                    <cylinderGeometry args={[2, 2, 20, 16, 1, true]} />
                    <meshBasicMaterial
                        color="#fef3c7"
                        transparent
                        opacity={Math.min(1, reviveAnimTimer) * 0.6}
                        depthWrite={false}
                        side={2}
                        blending={2}
                    />
                </mesh>
            </>
        )}

        <mesh ref={reviveVisualRef} rotation={[-Math.PI/2, 0, 0]} visible={false}>
            <ringGeometry args={[0.8, 1, 32]} />
            <meshStandardMaterial color="#fbbf24" transparent opacity={0.6} emissive="#fbbf24" />
        </mesh>

        {rageMode && (
            <mesh position={[0, 0.5, 0]}>
                <sphereGeometry args={[1.0, 16, 16]} />
                <meshBasicMaterial color="red" wireframe transparent opacity={0.3} />
            </mesh>
        )}

        <mesh visible={isInvincible}>
            <sphereGeometry args={[1.2, 16, 16]} />
            <meshStandardMaterial color="orange" transparent opacity={0.4} emissive="orange" emissiveIntensity={0.5} />
        </mesh>

        {ASSET_FLAGS.usePlayerModels ? (
          <PlayerModel
            hero={hero as 'ARCHER' | 'WIZARD' | 'BARBARIAN'}
            isMoving={isMovingRef.current}
            isAttacking={isAttackingRef.current}
            isDashing={dashTime.current > 0}
            isDead={false}
            isLevelingUp={levelUpVisualTimer > 0}
            rageMode={rageMode}
            modelScale={1}
          />
        ) : (
          <group position={[0, 0, 0]}>
            {hero === 'ARCHER' && (
              <mesh castShadow receiveShadow position={[0, 0.5, 0]}>
                <capsuleGeometry args={[0.4, 1, 4, 8]} />
                <meshStandardMaterial
                  color={rageMode ? '#7f2d2d' : (levelUpVisualTimer > 0 ? '#facc15' : '#22c55e')}
                  emissive={rageMode ? '#b91c1c' : (levelUpVisualTimer > 0 ? '#facc15' : 'black')}
                  emissiveIntensity={rageMode ? 1 : levelUpVisualTimer}
                  roughness={0.4} metalness={0.6}
                />
              </mesh>
            )}
            {hero === 'BARBARIAN' && (
              <mesh castShadow receiveShadow position={[0, 0.5, 0]}>
                <capsuleGeometry args={[0.4, 1, 4, 8]} />
                <meshStandardMaterial
                  color={rageMode ? '#991b1b' : (levelUpVisualTimer > 0 ? '#facc15' : '#ef4444')}
                  emissive={rageMode ? '#7f1d1d' : (levelUpVisualTimer > 0 ? '#facc15' : '#7f1d1d')}
                  emissiveIntensity={rageMode ? 1 : (levelUpVisualTimer > 0 ? 1 : 0.3)}
                  roughness={0.4} metalness={0.6}
                />
              </mesh>
            )}
            {hero === 'WIZARD' && (
              <mesh castShadow receiveShadow position={[0, 0.5, 0]}>
                <capsuleGeometry args={[0.4, 1, 4, 8]} />
                <meshStandardMaterial
                  color={rageMode ? '#1e3a8a' : (levelUpVisualTimer > 0 ? '#facc15' : '#3b82f6')}
                  emissive={rageMode ? '#1e1b4b' : (levelUpVisualTimer > 0 ? '#facc15' : 'black')}
                  emissiveIntensity={rageMode ? 1 : levelUpVisualTimer}
                  roughness={0.4} metalness={0.6}
                />
              </mesh>
            )}
            <mesh castShadow position={[0, 1.4, 0]}>
                <boxGeometry args={[0.5, 0.5, 0.5]} />
                <meshStandardMaterial color="#cbd5e1" metalness={0.8} roughness={0.2} />
            </mesh>
            <mesh position={[0.6, 0.5, 0.4]}>
                <boxGeometry args={[0.2, 0.2, 0.8]} />
                <meshStandardMaterial color="#94a3b8" />
            </mesh>
            <mesh position={[0, 0.6, -0.4]} rotation={[0.2, 0, 0]}>
                <boxGeometry args={[0.6, 1.2, 0.1]} />
                <meshStandardMaterial color={hero === 'BARBARIAN' ? '#dc2626' : (hero === 'ARCHER' ? '#16a34a' : '#1e40af')} />
            </mesh>
          </group>
        )}

        <group ref={axeSpinRef} visible={false}>
            {[0, 1, 2, 3].map((i) => (
                <group key={i} rotation={[0, (i / 4) * Math.PI * 2, 0]}>
                    <mesh position={[10.5, 0, 0]}>
                        <boxGeometry args={[2.5, 0.25, 2.5]} /> 
                        <meshStandardMaterial color="#ef4444" emissive="#7f1d1d" emissiveIntensity={0.5} />
                    </mesh>
                </group>
            ))}
        </group>

        {hero === 'WIZARD' && (
            <group position={[0, 1.7, 0]}>
                <mesh position={[0, -0.1, 0]}>
                    <cylinderGeometry args={[0.6, 0.6, 0.05, 12]} />
                    <meshStandardMaterial color="#3b82f6" roughness={0.8} />
                </mesh>
                <mesh position={[0, 0.3, 0]}>
                    <coneGeometry args={[0.4, 0.8, 12]} />
                    <meshStandardMaterial color="#1e3a8a" roughness={0.8} />
                </mesh>
            </group>
        )}
      </group>
    </>
  );
};
