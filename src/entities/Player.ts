import { Input, Scene } from "phaser";
import { PlayerShipData, PlayerShipsData } from "../gameData/PlayerShipsData.ts";
import type { BulletData } from "../gameData/BulletData.ts";
import { POWERUP_CONFIGS, PowerUpType } from "../gameData/PowerUpData.ts";
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

export default class Player extends Entity {
    private readonly _bulletData: BulletData = {
        width: 14,
        height: 5,
        color: 0xffe066,
        speed: 1100,
        damage: 1
    };

    private _moveKeys: MoveKeys;
    private _playerShipData: PlayerShipData;
    private _baseRateOfFire: number;
    private _lastShotTime: number;
    private _enemiesGroup?: Phaser.Physics.Arcade.Group;
    private readonly _moveDirection: Phaser.Math.Vector2 = new Phaser.Math.Vector2();

    private _multiShotRemainingMs: number = 0;
    private _rapidFireRemainingMs: number = 0;
    private _speedBoostRemainingMs: number = 0;
    private _lastUiEmitTime: number = 0;

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

            this.scene.input.keyboard.addKey(Input.Keyboard.KeyCodes.ONE).on('down', () => this.selectPlayerShip(1));
            this.scene.input.keyboard.addKey(Input.Keyboard.KeyCodes.TWO).on('down', () => this.selectPlayerShip(2));
            this.scene.input.keyboard.addKey(Input.Keyboard.KeyCodes.THREE).on('down', () => this.selectPlayerShip(3));
        }
    }

    public init(bulletsGroup: Phaser.Physics.Arcade.Group, enemiesGroup?: Phaser.Physics.Arcade.Group) {
        this._enemiesGroup = enemiesGroup;

        this.addComponent(new Health(5, this));
        this.addComponent(new Movement());
        this.addComponent(new Weapon(bulletsGroup, this._bulletData));

        this.setDepth(10);
        this.arcadeBody.setCollideWorldBounds(true);

        this.angle = -90;
        this.selectPlayerShip(1);

        this._baseRateOfFire = 0.35;
        this._lastShotTime = 0;

        this.getComponent(Health)?.on(Health.CHANGE_EVENT, (current: number) => {
            if (current <= 0) return;

            this.arcadeBody.setEnable(false);
            this.setTintFill(0xffffff);

            this.scene.time.delayedCall(150, () => {
                this.clearTint();
                if (this.active) {
                    this.arcadeBody.setEnable(true);
                }
            });
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

    public applyPowerUp(type: PowerUpType) {
        const config = POWERUP_CONFIGS[type];

        switch (type) {
            case PowerUpType.HEAL: {
                const health = this.getComponent(Health);
                if (health && health.current < health.max) {
                    health.heal(1);
                } else {
                    this.scene.registry.inc(RegistryConstants.Keys.PLAYER_SCORE, 2);
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

    private updateMovementSpeed() {
        if (!this._playerShipData) return;
        const speedMultiplier = this._speedBoostRemainingMs > 0 ? 1.45 : 1.0;
        this.getComponent(Movement)?.setSpeed(this._playerShipData.movementSpeed * speedMultiplier);
    }

    private showFloatingPickupText(label: string, tint: number) {
        const hexColor = '#' + tint.toString(16).padStart(6, '0');
        const floatingText = this.scene.add.text(this.x, this.y - 48, label, {
            fontSize: '28px',
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
        }

        const hasAnyBuff = this._multiShotRemainingMs > 0 || this._rapidFireRemainingMs > 0 || this._speedBoostRemainingMs > 0;
        if (hadAnyBuff && (timeSinceLaunch - this._lastUiEmitTime > 200 || !hasAnyBuff)) {
            this._lastUiEmitTime = timeSinceLaunch;
            this.emitPowerUpState();
        }
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

        const shouldAutoFire = nearestEnemy !== null || (this._moveKeys?.space.isDown ?? false);
        const currentRateOfFire = this._rapidFireRemainingMs > 0 ? this._baseRateOfFire * 0.5 : this._baseRateOfFire;

        if (shouldAutoFire && timeSinceLaunch - this._lastShotTime > currentRateOfFire * 1000) {
            const bulletCount = this._multiShotRemainingMs > 0 ? 3 : 1;
            const spreadAngle = this._multiShotRemainingMs > 0 ? 24 : 0;

            this.getComponent(Weapon)?.shoot(this, bulletCount, spreadAngle);
            this.scene.sound.play('sfx_laser1', { volume: 0.45 });

            this._lastShotTime = timeSinceLaunch;
        }
    }
}