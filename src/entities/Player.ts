import { BlendModes, GameObjects, Input, Scene } from "phaser";
import { PlayerShipData, PlayerShipsData } from "../gameData/PlayerShipsData.ts";
import type { BulletData } from "../gameData/BulletData.ts";
import { POWERUP_CONFIGS, PowerUpType } from "../gameData/PowerUpData.ts";
import { UPGRADE_DEFINITIONS, UpgradeDefinition, UpgradeId } from "../gameData/UpgradeData.ts";
import Entity from './Entity.ts';
import GameConstants from "../GameConstants.ts";
import RegistryConstants from "../RegistryConstants.ts";
import AudioManager from "../managers/AudioManager.ts";
import Health from "../components/Health.ts";
import Movement from "../components/Movement.ts";
import Weapon from "../components/Weapon.ts";
import { GamepadEdgeTracker, isGamepadFireHeld, readGamepadMove, readGamepadRightStick } from "../utils/GamepadUtils.ts";

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
    shift: Input.Keyboard.Key;
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

export type OverdriveStatus = {
    value: number; // 0..100
    active: boolean;
    remainingMs: number;
};

export type DashStatus = {
    readyRatio: number; // 0..1
    isReady: boolean;
};

export type ComboStatus = {
    count: number;
    multiplier: number;
};

export default class Player extends Entity {
    private readonly _bulletData: BulletData = {
        width: 24,
        height: 10,
        color: 0x38bdf8,
        speed: 1150,
        damage: 1,
        frame: 'bullet_player',
        pierce: 0,
    };

    private _moveKeys: MoveKeys;
    private _playerShipData: PlayerShipData;
    private _baseRateOfFire: number = 0.32;
    private _baseDamage: number = 1;
    private _baseDashCooldownMs: number = 2200;
    private _lastShotTime: number = 0;
    private _enemiesGroup?: Phaser.Physics.Arcade.Group;
    private _audioManager?: AudioManager;
    private readonly _moveDirection: Phaser.Math.Vector2 = new Phaser.Math.Vector2();
    private readonly _gamepadMove: Phaser.Math.Vector2 = new Phaser.Math.Vector2();
    private readonly _gamepadAim: Phaser.Math.Vector2 = new Phaser.Math.Vector2();
    private readonly _gamepadDashTracker = new GamepadEdgeTracker();

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
    private _pierceCount: number = 0;
    private _dashCooldownMultiplier: number = 1.0;

    // Signature Phase Dash
    private _dashActiveMs: number = 0;
    private _dashCooldownRemainingMs: number = 0;
    private _lastDashAfterimageTime: number = 0;
    private _dashHudEmitTimer: number = 0;
    private readonly _dashDir: Phaser.Math.Vector2 = new Phaser.Math.Vector2(1, 0);

    // Signature Overdrive & Graze & Combo
    private _overdriveValue: number = 0;
    private _overdriveActiveMs: number = 0;
    private _overdriveHudEmitTimer: number = 0;
    private _comboCount: number = 0;
    private _comboDecayMs: number = 0;

    // Modular visual upgrade sprites attached to the ship
    private _thrustersSprite?: GameObjects.Image;
    private _cannonsSprite?: GameObjects.Image;
    private _armorSprite?: GameObjects.Image;
    private _shieldSprite?: GameObjects.Image;
    private _overdriveAuraSprite?: GameObjects.Image;

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
        return this._overdriveActiveMs > 0 ? 9999 : this._pickupRadius;
    }

    public get isDashing(): boolean {
        return this._dashActiveMs > 0;
    }

    public get isOverdriveActive(): boolean {
        return this._overdriveActiveMs > 0;
    }

    public get comboMultiplier(): number {
        return 1 + Math.min(4, Math.floor(this._comboCount / 5));
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
                shift: Input.Keyboard.KeyCodes.SHIFT,
            }, false) as MoveKeys;

            this._moveKeys.shift.on('down', () => this.tryActivateDash());

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

        // Right-click or mouse extra button triggers Dash cleanly
        this.scene.input.on('pointerdown', (pointer: Input.Pointer) => {
            if (pointer.rightButtonDown()) {
                this.tryActivateDash();
            }
        });
    }

    public init(bulletsGroup: Phaser.Physics.Arcade.Group, enemiesGroup?: Phaser.Physics.Arcade.Group) {
        this._enemiesGroup = enemiesGroup;
        this._audioManager = this.scene.game.plugins.get(AudioManager.PLUGIN_KEY) as AudioManager | undefined;
        this._gamepadDashTracker.reset();

        const selectedShipId = Number(this.scene.registry.get(RegistryConstants.Keys.SELECTED_SHIP_ID) ?? 1);
        if (selectedShipId !== 1) {
            this._manualShipSelection = true;
        }

        this.addComponent(new Health(100, this));
        this.addComponent(new Movement());
        this.addComponent(new Weapon(bulletsGroup, this._bulletData));

        this.setDepth(10);
        this.arcadeBody.setCollideWorldBounds(true);

        this.angle = -90;
        this.selectPlayerShip(selectedShipId, true);

        this._lastShotTime = 0;
        this._level = 1;
        this._exp = 0;
        this._expToNext = this.computeExpRequired(1);

        this.createUpgradeAttachmentSprites();

        const health = this.getComponent(Health);
        health?.on(Health.CHANGE_EVENT, (current: number) => {
            if (current <= 0) {
                this.setAttachmentsVisible(false);
            }
        });

        this.once(GameObjects.Events.DESTROY, () => {
            this._thrustersSprite?.destroy();
            this._cannonsSprite?.destroy();
            this._armorSprite?.destroy();
            this._shieldSprite?.destroy();
            this._overdriveAuraSprite?.destroy();
        });

        this.emitExpState();
        this.emitOverdriveState();
        this.emitDashState();
        this.emitComboState();
    }

    public tryActivateDash() {
        if (!this.active || this._dashActiveMs > 0 || this._dashCooldownRemainingMs > 0) {
            return;
        }

        const totalCooldown = Math.round(this._baseDashCooldownMs * this._dashCooldownMultiplier);
        this._dashActiveMs = 210;
        this._dashCooldownRemainingMs = totalCooldown;

        if (this._moveDirection.lengthSq() > 0) {
            this._dashDir.copy(this._moveDirection).normalize();
        } else {
            this._dashDir.set(Math.cos(this.rotation), Math.sin(this.rotation)).normalize();
        }

        this._audioManager?.playSfx('sfx_dash', 0.8);

        // Shockwave ring on dash start (damages nearby enemies if DASH upgraded)
        const dashRank = this.getUpgradeRank(UpgradeId.DASH);
        const shockColor = dashRank >= 1 ? 0x2dd4bf : 0x38bdf8;
        const ring = this.scene.add.circle(this.x, this.y, 26, shockColor, 0)
            .setStrokeStyle(5, shockColor, 0.9)
            .setDepth(14);
        this.scene.tweens.add({
            targets: ring,
            scale: dashRank >= 1 ? 3.5 : 2.2,
            alpha: 0,
            duration: 280,
            ease: 'Quad.easeOut',
            onComplete: () => ring.destroy(),
        });

        if (dashRank >= 1 && this._enemiesGroup) {
            const shockRadius = 150 + dashRank * 35;
            const shockDamage = dashRank * 2;
            const shockRadiusSq = shockRadius * shockRadius;
            for (const child of this._enemiesGroup.getChildren()) {
                const enemy = child as Entity;
                if (!enemy.active) continue;
                const dx = enemy.x - this.x;
                const dy = enemy.y - this.y;
                if (dx * dx + dy * dy <= shockRadiusSq) {
                    enemy.getComponent(Health)?.damage(shockDamage);
                }
            }
        }

        this.emitDashState();
    }

    public addOverdrive(amount: number) {
        if (!this.active || amount <= 0) return;

        if (this._overdriveActiveMs > 0) {
            // Grazing/kills during Overdrive slightly extend it
            this._overdriveActiveMs = Math.min(7500, this._overdriveActiveMs + amount * 18);
            return;
        }

        this._overdriveValue = Math.min(100, this._overdriveValue + amount);
        if (this._overdriveValue >= 100) {
            this.activateOverdrive();
        } else {
            this.emitOverdriveState();
        }
    }

    private activateOverdrive() {
        this._overdriveValue = 100;
        this._overdriveActiveMs = 6000;
        this._audioManager?.playSfx('sfx_overdrive', 0.85);
        this.scene.cameras.main.shake(140, 0.012);
        this.showFloatingPickupText('SURCHARGE OVERDRIVE!', 0xfacc15);
        this.updateShipVisualUpgrades();
        this.syncBulletStats();
        this.updateMovementSpeed();
        this.emitOverdriveState();
    }

    public registerKill(baseScore: number): number {
        this._comboCount += 1;
        this._comboDecayMs = 3800;

        const mult = this.comboMultiplier;
        const awardedScore = baseScore * mult;
        this.scene.registry.inc(RegistryConstants.Keys.PLAYER_SCORE, awardedScore);

        this.addOverdrive(7);
        this.emitComboState();
        return awardedScore;
    }

    public registerGraze() {
        if (!this.active || this._dashActiveMs > 0) return;
        this.addOverdrive(9);
        this._audioManager?.playSfx('sfx_exp', 0.25);

        const grazeTxt = this.scene.add.text(this.x, this.y - 36, 'GRAZE!', {
            fontSize: '18px',
            fontFamily: 'future, sans-serif',
            color: '#2dd4bf',
            stroke: '#000000',
            strokeThickness: 3,
        }).setOrigin(0.5).setDepth(20);

        this.scene.tweens.add({
            targets: grazeTxt,
            y: grazeTxt.y - 30,
            alpha: 0,
            duration: 380,
            onComplete: () => grazeTxt.destroy(),
        });
    }

    public takeHitDamage(amount: number) {
        if (this._dashActiveMs > 0) return; // Phase Dash grants invulnerability!

        const health = this.getComponent(Health);
        if (!health || !this.arcadeBody.enable) return;

        health.damage(amount);
        this._audioManager?.playSfx('sfx_hit', 0.8);
        this.scene.cameras.main.flash(140, 220, 38, 38, false);
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

    public selectPlayerShip(playerShipDataId: number, applyBaseStats: boolean = false) {
        const playerShipsData = this.scene.cache.json.get('playerShips') as PlayerShipsData;
        this._playerShipData = playerShipsData[playerShipDataId] ?? playerShipsData['1'];

        this.setTexture('sprites', this._playerShipData.texture);
        const bodyData = this._playerShipData.body;
        this.arcadeBody.setCircle(
            bodyData.radius,
            (this.width - bodyData.radius * 2) / 2,
            (this.height - bodyData.radius * 2) / 2
        );

        if (applyBaseStats) {
            const maxHp = this._playerShipData.maxHealth ?? 100;
            this.getComponent(Health)?.setMax(maxHp, true);
            this._baseRateOfFire = this._playerShipData.rateOfFire ?? 0.32;
            this._baseDamage = this._playerShipData.baseDamage ?? 1;
            this._baseDashCooldownMs = this._playerShipData.dashCooldownMs ?? 2200;
            this.syncBulletStats();
        }

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
            this._audioManager?.playSfx('sfx_levelup', 0.85);
            this.scene.game.events.emit(GameConstants.Events.LEVEL_UP_EVENT, this._level);
        } else {
            this._audioManager?.playSfx('sfx_exp', 0.45);
        }
    }

    public consumePendingLevelUp() {
        if (this._pendingLevelUps > 0) {
            this._pendingLevelUps -= 1;
        }
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
                this.syncBulletStats();
                break;
            case UpgradeId.PIERCE:
                this._pierceCount += 1;
                this.syncBulletStats();
                break;
            case UpgradeId.DASH:
                this._dashCooldownMultiplier *= 0.75;
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
                this.syncBulletStats();
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
                    this.scene.registry.inc(RegistryConstants.Keys.PLAYER_SCORE, 3 * this.comboMultiplier);
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
                this.updateShipVisualUpgrades();
                break;
        }

        this.addOverdrive(12);
        this._audioManager?.playSfx('sfx_powerup', 0.75);
        this.showFloatingPickupText(config.label, config.tint);
        this.emitPowerUpState();
    }

    private syncBulletStats() {
        const dmgRank = this.getUpgradeRank(UpgradeId.DAMAGE);
        const overdriveBonus = this._overdriveActiveMs > 0 ? 1 : 0;

        this._bulletData.damage = this._baseDamage + dmgRank + overdriveBonus;
        this._bulletData.speed = Math.round(1150 * this._bulletSpeedMultiplier);
        this._bulletData.pierce = this._pierceCount + overdriveBonus;

        if (dmgRank >= 2 || this._overdriveActiveMs > 0 || this._baseDamage >= 2) {
            this._bulletData.frame = 'bullet_player_heavy';
            this._bulletData.width = 30;
            this._bulletData.height = 14;
        } else {
            this._bulletData.frame = 'bullet_player';
            this._bulletData.width = 24;
            this._bulletData.height = 10;
        }
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
        this._overdriveAuraSprite = this.scene.add.image(this.x, this.y, 'sprites', 'shipUpgrade_overdrive')
            .setBlendMode(BlendModes.ADD)
            .setDepth(13).setAlpha(0.85).setVisible(false);
    }

    private setAttachmentsVisible(visible: boolean) {
        if (!visible) {
            this._thrustersSprite?.setVisible(false);
            this._armorSprite?.setVisible(false);
            this._cannonsSprite?.setVisible(false);
            this._shieldSprite?.setVisible(false);
            this._overdriveAuraSprite?.setVisible(false);
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

        this._thrustersSprite?.setVisible(speedRank >= 1 || this._speedBoostRemainingMs > 0 || this._overdriveActiveMs > 0);
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
        this._overdriveAuraSprite?.setVisible(this._overdriveActiveMs > 0);
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
        if (this._overdriveAuraSprite?.visible) {
            this._overdriveAuraSprite.setPosition(this.x, this.y).setRotation(-timeSinceLaunch * 0.004).setScale(1.06 + Math.sin(timeSinceLaunch * 0.02) * 0.08);
        }
    }

    private updateMovementSpeed() {
        if (!this._playerShipData) return;
        const tempBoost = this._speedBoostRemainingMs > 0 ? 1.45 : 1.0;
        const overdriveBoost = this._overdriveActiveMs > 0 ? 1.25 : 1.0;
        this.getComponent(Movement)?.setSpeed(
            this._playerShipData.movementSpeed * this._speedUpgradeMultiplier * tempBoost * overdriveBoost
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

    private updateTimers(timeSinceLaunch: number, deltaTime: number) {
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

        // Dash timers
        if (this._dashActiveMs > 0) {
            this._dashActiveMs = Math.max(0, this._dashActiveMs - deltaTime);
            this.setAlpha(0.65);
            if (this._dashActiveMs === 0) {
                this.setAlpha(1);
            }
        }

        if (this._dashCooldownRemainingMs > 0) {
            this._dashCooldownRemainingMs = Math.max(0, this._dashCooldownRemainingMs - deltaTime);
            this._dashHudEmitTimer += deltaTime;
            if (this._dashHudEmitTimer >= 80 || this._dashCooldownRemainingMs === 0) {
                this._dashHudEmitTimer = 0;
                this.emitDashState();
            }
        }

        // Overdrive active timer
        if (this._overdriveActiveMs > 0) {
            this._overdriveActiveMs = Math.max(0, this._overdriveActiveMs - deltaTime);
            this._overdriveValue = (this._overdriveActiveMs / 6000) * 100;
            this._overdriveHudEmitTimer += deltaTime;

            if (this._overdriveActiveMs === 0) {
                this._overdriveValue = 0;
                this.updateShipVisualUpgrades();
                this.syncBulletStats();
                this.updateMovementSpeed();
                this.emitOverdriveState();
            } else if (this._overdriveHudEmitTimer >= 90) {
                this._overdriveHudEmitTimer = 0;
                this.emitOverdriveState();
            }
        }

        // Combo decay
        if (this._comboCount > 0) {
            this._comboDecayMs = Math.max(0, this._comboDecayMs - deltaTime);
            if (this._comboDecayMs === 0) {
                this._comboCount = 0;
                this.emitComboState();
            }
        }
    }

    private emitExpState() {
        this.scene.game.events.emit(GameConstants.Events.EXP_CHANGED_EVENT, {
            level: this._level,
            exp: this._exp,
            expToNext: this._expToNext,
        } satisfies ExpStatus);
    }

    private emitOverdriveState() {
        this.scene.game.events.emit(GameConstants.Events.OVERDRIVE_CHANGED_EVENT, {
            value: this._overdriveValue,
            active: this._overdriveActiveMs > 0,
            remainingMs: this._overdriveActiveMs,
        } satisfies OverdriveStatus);
    }

    private emitDashState() {
        const total = Math.max(1, this._baseDashCooldownMs * this._dashCooldownMultiplier);
        const readyRatio = Phaser.Math.Clamp(1 - this._dashCooldownRemainingMs / total, 0, 1);
        this.scene.game.events.emit(GameConstants.Events.DASH_CHANGED_EVENT, {
            readyRatio,
            isReady: this._dashCooldownRemainingMs <= 0,
        } satisfies DashStatus);
    }

    private emitComboState() {
        this.scene.game.events.emit(GameConstants.Events.COMBO_CHANGED_EVENT, {
            count: this._comboCount,
            multiplier: this.comboMultiplier,
        } satisfies ComboStatus);
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

        this.updateTimers(timeSinceLaunch, deltaTime);

        // Check gamepad Dash trigger
        const padActions = this._gamepadDashTracker.poll(this.scene);
        if (padActions.dash) {
            this.tryActivateDash();
        }

        // Move in 4 directions (Arrows / WASD / ZQSD + Gamepad left stick / D-pad)
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
        } else if (readGamepadMove(this.scene, this._gamepadMove)) {
            this._moveDirection.copy(this._gamepadMove);
        }

        if (this._dashActiveMs > 0) {
            // High-speed Phase Dash burst + cyan ghost after-images
            const dashSpeed = (this._playerShipData?.movementSpeed ?? 0.6) * 3.1;
            this.x += this._dashDir.x * dashSpeed * deltaTime;
            this.y += this._dashDir.y * dashSpeed * deltaTime;

            if (timeSinceLaunch - this._lastDashAfterimageTime > 42) {
                this._lastDashAfterimageTime = timeSinceLaunch;
                this.spawnDashAfterimage();
            }
        } else if (this._moveDirection.lengthSq() > 0) {
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

        // Twin-stick right stick override, otherwise auto-aim towards nearest active enemy
        const hasManualAim = readGamepadRightStick(this.scene, this._gamepadAim);
        const nearestEnemy = this.findNearestEnemy();
        if (hasManualAim) {
            this.rotation = this._gamepadAim.angle();
        } else if (nearestEnemy) {
            this.rotation = Phaser.Math.Angle.Between(this.x, this.y, nearestEnemy.x, nearestEnemy.y);
        } else if (this._moveDirection.lengthSq() > 0) {
            this.rotation = this._moveDirection.angle();
        }

        this.syncAttachmentTransforms(timeSinceLaunch);

        const padFireHeld = isGamepadFireHeld();
        const shouldAutoFire = nearestEnemy !== null || hasManualAim || padFireHeld || (this._moveKeys?.space.isDown ?? false);
        const tempRapidFire = this._rapidFireRemainingMs > 0 ? 0.5 : 1.0;
        const overdriveRapidFire = this._overdriveActiveMs > 0 ? 0.5 : 1.0;
        const currentRateOfFire = this._baseRateOfFire * this._fireRateMultiplier * tempRapidFire * overdriveRapidFire;

        if (shouldAutoFire && timeSinceLaunch - this._lastShotTime > currentRateOfFire * 1000) {
            const tempMulti = this._multiShotRemainingMs > 0 ? 2 : 0;
            const overdriveMulti = this._overdriveActiveMs > 0 ? 1 : 0;
            const bulletCount = 1 + this._extraProjectiles + tempMulti + overdriveMulti;
            const spreadAngle = bulletCount > 1 ? Math.min(90, (bulletCount - 1) * 11) : 0;

            this.getComponent(Weapon)?.shoot(this, bulletCount, spreadAngle);
            this.spawnMuzzleFlash();
            this._audioManager?.playSfx('sfx_laser1', 0.32);

            this._lastShotTime = timeSinceLaunch;
        }
    }

    private spawnDashAfterimage() {
        const ghost = this.scene.add.image(this.x, this.y, 'sprites', this.frame.name)
            .setRotation(this.rotation)
            .setTint(0x2dd4bf)
            .setBlendMode(BlendModes.ADD)
            .setAlpha(0.55)
            .setDepth(9);

        this.scene.tweens.add({
            targets: ghost,
            alpha: 0,
            scale: 0.85,
            duration: 220,
            onComplete: () => ghost.destroy(),
        });
    }

    private spawnEngineTrail() {
        const backX = this.x - Math.cos(this.rotation) * 38;
        const backY = this.y - Math.sin(this.rotation) * 38;
        const color = this._overdriveActiveMs > 0
            ? 0xfacc15
            : (this._speedBoostRemainingMs > 0 ? 0xc084fc : 0x38bdf8);
        const spark = this.scene.add.image(
            backX + Phaser.Math.Between(-8, 8),
            backY + Phaser.Math.Between(-8, 8),
            'sprites',
            'glowSpark'
        )
            .setTint(color)
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
