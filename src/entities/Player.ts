import { BlendModes, GameObjects, Input, Scene } from "phaser";
import { PlayerShipData, PlayerShipsData } from "../gameData/PlayerShipsData.ts";
import type { BulletData } from "../gameData/BulletData.ts";
import { POWERUP_CONFIGS, PowerUpType } from "../gameData/PowerUpData.ts";
import { UPGRADE_DEFINITIONS, UpgradeDefinition, UpgradeId } from "../gameData/UpgradeData.ts";
import Entity from './Entity.ts';
import GameConstants from "../GameConstants.ts";
import RegistryConstants from "../RegistryConstants.ts";
import Health from "../components/Health.ts";
import Movement from "../components/Movement.ts";
import Weapon from "../components/Weapon.ts";

type MoveKeys = {
    up: Input.Keyboard.Key;
    down: Input.Keyboard.Key;
    left: Input.Keyboard.Key;
    right: Input.Keyboard.Key;
    w: Input.Keyboard.Key;
    a: Input.Keyboard.Key;
    s: Input.Keyboard.Key;
    d: Input.Keyboard.Key;
    z: Input.Keyboard.Key;
    q: Input.Keyboard.Key;
    space: Input.Keyboard.Key;
};

export type ActivePowerUpStatus = {
    type: PowerUpType;
    label: string;
    remainingMs: number;
};

export type ExpStatus = {
    level: number;
    exp: number;
    expToNext: number;
};

export default class Player extends Entity {
    private readonly _bulletData: BulletData = {
        width: 24,
        height: 10,
        color: 0x38bdf8,
        speed: 1150,
        damage: 1,
        frame: 'bullet_player',
    };

    private _moveKeys: MoveKeys;
    private _playerShipData: PlayerShipData;
    private _baseRateOfFire: number;
    private _lastShotTime: number;
    private _enemiesGroup?: Phaser.Physics.Arcade.Group;
    private readonly _moveDirection: Phaser.Math.Vector2 = new Phaser.Math.Vector2();

    // Temporary field power-up timers
    private _multiShotRemainingMs: number = 0;
    private _rapidFireRemainingMs: number = 0;
    private _speedBoostRemainingMs: number = 0;
    private _lastUiEmitTime: number = 0;

    // Permanent EXP & Upgrade progression
    private _level: number = 1;
    private _exp: number = 0;
    private _expToNext: number = 4;
    private _pendingLevelUps: number = 0;
    private _manualShipSelection: boolean = false;
    private _lastTrailTime: number = 0;
    private readonly _upgradeRanks: Map<UpgradeId, number> = new Map();

    private _extraProjectiles: number = 0;
    private _fireRateMultiplier: number = 1.0;
    private _speedUpgradeMultiplier: number = 1.0;
    private _bulletSpeedMultiplier: number = 1.0;
    private _pickupRadius: number = 190;

    // Modular visual upgrade sprites attached to the ship
    private _thrustersSprite?: GameObjects.Image;
    private _cannonsSprite?: GameObjects.Image;
    private _armorSprite?: GameObjects.Image;
    private _shieldSprite?: GameObjects.Image;

    public get level(): number {
        return this._level;
    }

    public get exp(): number {
        return this._exp;
    }

    public get expToNext(): number {
        return this._expToNext;
    }

    public get pickupRadius(): number {
        return this._pickupRadius;
    }

    constructor(scene: Scene, x: number, y: number) {
        super(scene, x, y, 'sprites');

        if (this.scene.input.keyboard) {
            this._moveKeys = this.scene.input.keyboard.addKeys({
                up: Input.Keyboard.KeyCodes.UP,
                down: Input.Keyboard.KeyCodes.DOWN,
                left: Input.Keyboard.KeyCodes.LEFT,
                right: Input.Keyboard.KeyCodes.RIGHT,
                w: Input.Keyboard.KeyCodes.W,
                a: Input.Keyboard.KeyCodes.A,
                s: Input.Keyboard.KeyCodes.S,
                d: Input.Keyboard.KeyCodes.D,
                z: Input.Keyboard.KeyCodes.Z,
                q: Input.Keyboard.KeyCodes.Q,
                space: Input.Keyboard.KeyCodes.SPACE,
            }, false) as MoveKeys;

            this.scene.input.keyboard.addKey(Input.Keyboard.KeyCodes.ONE).on('down', () => {
                this._manualShipSelection = true;
                this.selectPlayerShip(1);
            });
            this.scene.input.keyboard.addKey(Input.Keyboard.KeyCodes.TWO).on('down', () => {
                this._manualShipSelection = true;
                this.selectPlayerShip(2);
            });
            this.scene.input.keyboard.addKey(Input.Keyboard.KeyCodes.THREE).on('down', () => {
                this._manualShipSelection = true;
                this.selectPlayerShip(3);
            });
        }
    }

    public init(bulletsGroup: Phaser.Physics.Arcade.Group, enemiesGroup?: Phaser.Physics.Arcade.Group) {
        this._enemiesGroup = enemiesGroup;

        this.addComponent(new Health(100, this));
        this.addComponent(new Movement());
        this.addComponent(new Weapon(bulletsGroup, this._bulletData));

        this.setDepth(10);
        this.arcadeBody.setCollideWorldBounds(true);

        this.angle = -90;
        this.selectPlayerShip(1);

        this._baseRateOfFire = 0.32;
        this._lastShotTime = 0;

        this._level = 1;
        this._exp = 0;
        this._expToNext = this.computeExpRequired(1);

        this.createUpgradeAttachmentSprites();

        const health = this.getComponent(Health);
        health?.on(Health.CHANGE_EVENT, (current: number) => {
            if (current <= 0) {
                this.setAttachmentsVisible(false);
                return;
            }
        });

        this.once(GameObjects.Events.DESTROY, () => {
            this._thrustersSprite?.destroy();
            this._cannonsSprite?.destroy();
            this._armorSprite?.destroy();
            this._shieldSprite?.destroy();
        });

        this.emitExpState();
    }

    public takeHitDamage(amount: number) {
        const health = this.getComponent(Health);
        if (!health || !this.arcadeBody.enable) return;

        health.damage(amount);
        if (health.current <= 0) return;

        this.arcadeBody.setEnable(false);
        this.setTintFill(0xffffff);

        this.scene.time.delayedCall(500, () => {
            this.clearTint();
            if (this.active) {
                this.arcadeBody.setEnable(true);
            }
        });
    }

    public selectPlayerShip(playerShipDataId: number) {
        const playerShipsData = this.scene.cache.json.get('playerShips') as PlayerShipsData;
        this._playerShipData = playerShipsData[playerShipDataId];

        this.setTexture('sprites', this._playerShipData.texture);
        const bodyData = this._playerShipData.body;
        this.arcadeBody.setCircle(
            bodyData.radius,
            (this.width - bodyData.radius * 2) / 2,
            (this.height - bodyData.radius * 2) / 2
        );

        this.updateMovementSpeed();
    }

    public gainExp(amount: number) {
        if (amount <= 0 || !this.active) return;

        this._exp += amount;
        while (this._exp >= this._expToNext) {
            this._exp -= this._expToNext;
            this._level += 1;
            this._expToNext = this.computeExpRequired(this._level);
            this._pendingLevelUps += 1;

            if (!this._manualShipSelection) {
                if (this._level >= 5) {
                    this.selectPlayerShip(3);
                } else if (this._level >= 3) {
                    this.selectPlayerShip(2);
                }
            }
        }

        this.emitExpState();

        if (this._pendingLevelUps > 0) {
            this.triggerNextLevelUp();
        }
    }

    public triggerNextLevelUp() {
        if (this._pendingLevelUps <= 0) return;
        this._pendingLevelUps -= 1;
        this.scene.game.events.emit(GameConstants.Events.LEVEL_UP_EVENT, this._level);
    }

    public hasPendingLevelUps(): boolean {
        return this._pendingLevelUps > 0;
    }

    public getUpgradeRank(id: UpgradeId): number {
        return this._upgradeRanks.get(id) ?? 0;
    }

    public getUpgradeChoices(count: number = 3): UpgradeDefinition[] {
        const health = this.getComponent(Health);
        const isInjured = health ? health.current < health.max : false;

        let candidates = UPGRADE_DEFINITIONS.filter(def => {
            if (def.maxRank > 0 && this.getUpgradeRank(def.id) >= def.maxRank) {
                return false;
            }
            if (def.id === UpgradeId.REPAIR && !isInjured) {
                return false;
            }
            return true;
        });

        if (candidates.length < count) {
            candidates = UPGRADE_DEFINITIONS.filter(
                def => def.maxRank === 0 || this.getUpgradeRank(def.id) < def.maxRank
            );
        }

        const shuffled = Phaser.Utils.Array.Shuffle([...candidates]);
        return shuffled.slice(0, count);
    }

    public applyUpgrade(id: UpgradeId) {
        const nextRank = this.getUpgradeRank(id) + 1;
        this._upgradeRanks.set(id, nextRank);

        switch (id) {
            case UpgradeId.MULTI_SHOT:
                this._extraProjectiles += 1;
                break;
            case UpgradeId.FIRE_RATE:
                this._fireRateMultiplier *= 0.83;
                break;
            case UpgradeId.DAMAGE:
                this._bulletData.damage += 1;
                if (this.getUpgradeRank(UpgradeId.DAMAGE) >= 2) {
                    this._bulletData.frame = 'bullet_player_heavy';
                    this._bulletData.width = 30;
                    this._bulletData.height = 14;
                }
                break;
            case UpgradeId.SPEED:
                this._speedUpgradeMultiplier += 0.18;
                this.updateMovementSpeed();
                break;
            case UpgradeId.HULL:
                this.getComponent(Health)?.increaseMax(25, true);
                break;
            case UpgradeId.MAGNET:
                this._pickupRadius = Math.round(this._pickupRadius * 1.55);
                break;
            case UpgradeId.BULLET_SPEED:
                this._bulletSpeedMultiplier += 0.25;
                this._bulletData.speed = Math.round(1100 * this._bulletSpeedMultiplier);
                break;
            case UpgradeId.REPAIR: {
                const health = this.getComponent(Health);
                if (health) {
                    health.heal(Math.ceil(health.max * 0.5));
                }
                break;
            }
        }

        this.updateShipVisualUpgrades();
        this.scene.game.events.emit(GameConstants.Events.UPGRADE_APPLIED_EVENT, { id, rank: nextRank });

        const def = UPGRADE_DEFINITIONS.find(u => u.id === id);
        if (def) {
            this.showFloatingPickupText(def.title + '!', Number(def.accentColor.replace('#', '0x')));
        }
    }

    public applyPowerUp(type: PowerUpType) {
        const config = POWERUP_CONFIGS[type];

        switch (type) {
            case PowerUpType.HEAL: {
                const health = this.getComponent(Health);
                if (health && health.current < health.max) {
                    health.heal(25);
                } else {
                    this.scene.registry.inc(RegistryConstants.Keys.PLAYER_SCORE, 3);
                }
                break;
            }
            case PowerUpType.MULTI_SHOT:
                this._multiShotRemainingMs = config.durationMs;
                break;
            case PowerUpType.RAPID_FIRE:
                this._rapidFireRemainingMs = config.durationMs;
                break;
            case PowerUpType.SPEED_BOOST:
                this._speedBoostRemainingMs = config.durationMs;
                this.updateMovementSpeed();
                break;
        }

        this.showFloatingPickupText(config.label, config.tint);
        this.emitPowerUpState();
    }

    private computeExpRequired(level: number): number {
        return Math.floor(4 + (level - 1) * 4 + Math.pow(level - 1, 1.3) * 2);
    }

    private createUpgradeAttachmentSprites() {
        this._thrustersSprite = this.scene.add.image(this.x, this.y, 'sprites', 'shipUpgrade_thrusters')
            .setDepth(9).setVisible(false);
        this._armorSprite = this.scene.add.image(this.x, this.y, 'sprites', 'shipUpgrade_armor')
            .setDepth(11).setVisible(false);
        this._cannonsSprite = this.scene.add.image(this.x, this.y, 'sprites', 'shipUpgrade_cannons')
            .setDepth(12).setVisible(false);
        this._shieldSprite = this.scene.add.image(this.x, this.y, 'sprites', 'shipUpgrade_shield')
            .setDepth(13).setAlpha(0.75).setVisible(false);
    }

    private setAttachmentsVisible(visible: boolean) {
        if (!visible) {
            this._thrustersSprite?.setVisible(false);
            this._armorSprite?.setVisible(false);
            this._cannonsSprite?.setVisible(false);
            this._shieldSprite?.setVisible(false);
        } else {
            this.updateShipVisualUpgrades();
        }
    }

    private updateShipVisualUpgrades() {
        const multiRank = this.getUpgradeRank(UpgradeId.MULTI_SHOT);
        const dmgRank = this.getUpgradeRank(UpgradeId.DAMAGE);
        const speedRank = this.getUpgradeRank(UpgradeId.SPEED);
        const hullRank = this.getUpgradeRank(UpgradeId.HULL);
        const magnetRank = this.getUpgradeRank(UpgradeId.MAGNET);

        this._thrustersSprite?.setVisible(speedRank >= 1 || this._speedBoostRemainingMs > 0);
        this._armorSprite?.setVisible(hullRank >= 1);

        if (multiRank + dmgRank >= 2) {
            this._cannonsSprite?.setTexture('sprites', 'shipUpgrade_heavyCannons').setVisible(true);
        } else if (multiRank >= 1 || dmgRank >= 1) {
            this._cannonsSprite?.setTexture('sprites', 'shipUpgrade_cannons').setVisible(true);
        } else {
            this._cannonsSprite?.setVisible(false);
        }

        const totalUpgrades = Array.from(this._upgradeRanks.values()).reduce((a, b) => a + b, 0);
        this._shieldSprite?.setVisible(hullRank >= 2 || magnetRank >= 1 || totalUpgrades >= 4);
    }

    private syncAttachmentTransforms(timeSinceLaunch: number) {
        if (!this.active || !this.visible) {
            this.setAttachmentsVisible(false);
            return;
        }

        const pulse = 1 + Math.sin(timeSinceLaunch * 0.01) * 0.06;
        if (this._thrustersSprite?.visible) {
            this._thrustersSprite.setPosition(this.x, this.y).setRotation(this.rotation).setScale(pulse, 1);
        }
        if (this._armorSprite?.visible) {
            this._armorSprite.setPosition(this.x, this.y).setRotation(this.rotation);
        }
        if (this._cannonsSprite?.visible) {
            this._cannonsSprite.setPosition(this.x, this.y).setRotation(this.rotation);
        }
        if (this._shieldSprite?.visible) {
            this._shieldSprite.setPosition(this.x, this.y).setRotation(timeSinceLaunch * 0.002).setScale(pulse);
        }
    }

    private updateMovementSpeed() {
        if (!this._playerShipData) return;
        const tempBoost = this._speedBoostRemainingMs > 0 ? 1.45 : 1.0;
        this.getComponent(Movement)?.setSpeed(
            this._playerShipData.movementSpeed * this._speedUpgradeMultiplier * tempBoost
        );
    }

    private showFloatingPickupText(label: string, tint: number) {
        const hexColor = '#' + tint.toString(16).padStart(6, '0');
        const floatingText = this.scene.add.text(this.x, this.y - 48, label, {
            fontSize: '26px',
            fontFamily: 'future, sans-serif',
            color: hexColor,
            stroke: '#000000',
            strokeThickness: 4,
        }).setOrigin(0.5).setDepth(20);

        this.scene.tweens.add({
            targets: floatingText,
            y: floatingText.y - 64,
            alpha: 0,
            duration: 900,
            ease: 'Quad.easeOut',
            onComplete: () => floatingText.destroy(),
        });
    }

    private findNearestEnemy(): Phaser.GameObjects.Sprite | null {
        if (!this._enemiesGroup) return null;

        let nearest: Phaser.GameObjects.Sprite | null = null;
        let nearestDistSq = Number.POSITIVE_INFINITY;

        const children = this._enemiesGroup.getChildren();
        for (let i = 0; i < children.length; i++) {
            const enemy = children[i] as Phaser.GameObjects.Sprite;
            if (!enemy.active) continue;

            const dx = enemy.x - this.x;
            const dy = enemy.y - this.y;
            const distSq = dx * dx + dy * dy;
            if (distSq < nearestDistSq) {
                nearestDistSq = distSq;
                nearest = enemy;
            }
        }

        return nearest;
    }

    private updatePowerUpTimers(timeSinceLaunch: number, deltaTime: number) {
        const hadSpeedBoost = this._speedBoostRemainingMs > 0;
        const hadAnyBuff = this._multiShotRemainingMs > 0 || this._rapidFireRemainingMs > 0 || hadSpeedBoost;

        this._multiShotRemainingMs = Math.max(0, this._multiShotRemainingMs - deltaTime);
        this._rapidFireRemainingMs = Math.max(0, this._rapidFireRemainingMs - deltaTime);
        this._speedBoostRemainingMs = Math.max(0, this._speedBoostRemainingMs - deltaTime);

        if (hadSpeedBoost && this._speedBoostRemainingMs === 0) {
            this.updateMovementSpeed();
            this.updateShipVisualUpgrades();
        }

        const hasAnyBuff = this._multiShotRemainingMs > 0 || this._rapidFireRemainingMs > 0 || this._speedBoostRemainingMs > 0;
        if (hadAnyBuff && (timeSinceLaunch - this._lastUiEmitTime > 200 || !hasAnyBuff)) {
            this._lastUiEmitTime = timeSinceLaunch;
            this.emitPowerUpState();
        }
    }

    private emitExpState() {
        this.scene.game.events.emit(GameConstants.Events.EXP_CHANGED_EVENT, {
            level: this._level,
            exp: this._exp,
            expToNext: this._expToNext,
        } satisfies ExpStatus);
    }

    private emitPowerUpState() {
        const activeBuffs: ActivePowerUpStatus[] = [];

        if (this._multiShotRemainingMs > 0) {
            activeBuffs.push({
                type: PowerUpType.MULTI_SHOT,
                label: POWERUP_CONFIGS[PowerUpType.MULTI_SHOT].label,
                remainingMs: this._multiShotRemainingMs,
            });
        }
        if (this._rapidFireRemainingMs > 0) {
            activeBuffs.push({
                type: PowerUpType.RAPID_FIRE,
                label: POWERUP_CONFIGS[PowerUpType.RAPID_FIRE].label,
                remainingMs: this._rapidFireRemainingMs,
            });
        }
        if (this._speedBoostRemainingMs > 0) {
            activeBuffs.push({
                type: PowerUpType.SPEED_BOOST,
                label: POWERUP_CONFIGS[PowerUpType.SPEED_BOOST].label,
                remainingMs: this._speedBoostRemainingMs,
            });
        }

        this.scene.game.events.emit(GameConstants.Events.POWERUP_CHANGED_EVENT, activeBuffs);
    }

    preUpdate(timeSinceLaunch: number, deltaTime: number) {
        super.preUpdate(timeSinceLaunch, deltaTime);

        this.updatePowerUpTimers(timeSinceLaunch, deltaTime);

        // Move in 4 directions (Arrows / WASD / ZQSD)
        this._moveDirection.set(0.0);
        if (this._moveKeys) {
            if (this._moveKeys.left.isDown || this._moveKeys.a.isDown || this._moveKeys.q.isDown)
                this._moveDirection.x -= 1;
            if (this._moveKeys.right.isDown || this._moveKeys.d.isDown)
                this._moveDirection.x += 1;
            if (this._moveKeys.up.isDown || this._moveKeys.w.isDown || this._moveKeys.z.isDown)
                this._moveDirection.y -= 1;
            if (this._moveKeys.down.isDown || this._moveKeys.s.isDown)
                this._moveDirection.y += 1;
        }

        if (this._moveDirection.lengthSq() > 0) {
            this._moveDirection.normalize();
            this.getComponent(Movement)?.move(this, this._moveDirection, deltaTime);

            if (timeSinceLaunch - this._lastTrailTime > 55) {
                this._lastTrailTime = timeSinceLaunch;
                this.spawnEngineTrail();
            }
        }

        // Strict map bounds clamping (accounting for sprite dimensions at any angle)
        const bounds = this.scene.physics.world.bounds;
        const margin = Math.max(this.displayWidth, this.displayHeight) / 2;
        this.x = Phaser.Math.Clamp(this.x, bounds.left + margin, bounds.right - margin);
        this.y = Phaser.Math.Clamp(this.y, bounds.top + margin, bounds.bottom - margin);

        // Hero shooter auto-aim & auto-shoot towards the nearest active enemy
        const nearestEnemy = this.findNearestEnemy();
        if (nearestEnemy) {
            this.rotation = Phaser.Math.Angle.Between(this.x, this.y, nearestEnemy.x, nearestEnemy.y);
        } else if (this._moveDirection.lengthSq() > 0) {
            this.rotation = this._moveDirection.angle();
        }

        this.syncAttachmentTransforms(timeSinceLaunch);

        const shouldAutoFire = nearestEnemy !== null || (this._moveKeys?.space.isDown ?? false);
        const tempRapidFire = this._rapidFireRemainingMs > 0 ? 0.5 : 1.0;
        const currentRateOfFire = this._baseRateOfFire * this._fireRateMultiplier * tempRapidFire;

        if (shouldAutoFire && timeSinceLaunch - this._lastShotTime > currentRateOfFire * 1000) {
            const tempMulti = this._multiShotRemainingMs > 0 ? 2 : 0;
            const bulletCount = 1 + this._extraProjectiles + tempMulti;
            const spreadAngle = bulletCount > 1 ? Math.min(90, (bulletCount - 1) * 11) : 0;

            this.getComponent(Weapon)?.shoot(this, bulletCount, spreadAngle);
            this.spawnMuzzleFlash();
            this.scene.sound.play('sfx_laser1', { volume: 0.35 });

            this._lastShotTime = timeSinceLaunch;
        }
    }

    private spawnEngineTrail() {
        const backX = this.x - Math.cos(this.rotation) * 38;
        const backY = this.y - Math.sin(this.rotation) * 38;
        const spark = this.scene.add.image(
            backX + Phaser.Math.Between(-8, 8),
            backY + Phaser.Math.Between(-8, 8),
            'sprites',
            'glowSpark'
        )
            .setTint(this._speedBoostRemainingMs > 0 ? 0xc084fc : 0x38bdf8)
            .setBlendMode(BlendModes.ADD)
            .setScale(0.75)
            .setAlpha(0.7)
            .setDepth(8);

        this.scene.tweens.add({
            targets: spark,
            scale: 0.1,
            alpha: 0,
            duration: 240,
            onComplete: () => spark.destroy(),
        });
    }

    private spawnMuzzleFlash() {
        const frontX = this.x + Math.cos(this.rotation) * 44;
        const frontY = this.y + Math.sin(this.rotation) * 44;
        const flash = this.scene.add.image(frontX, frontY, 'sprites', 'glowSpark')
            .setTint(this._bulletData.frame === 'bullet_player_heavy' ? 0xfacc15 : 0x7dd3fc)
            .setBlendMode(BlendModes.ADD)
            .setScale(1.2)
            .setDepth(14);

        this.scene.tweens.add({
            targets: flash,
            scale: 0.2,
            alpha: 0,
            duration: 90,
            onComplete: () => flash.destroy(),
        });
    }
}
