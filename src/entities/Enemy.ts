import type { BulletData } from '../gameData/BulletData.ts';
import type { EnemyTypeData } from '../gameData/EnemiesData.ts';
import Entity from './Entity.ts';
import Health from "../components/Health.ts";
import Movement from "../components/Movement.ts";
import Weapon from "../components/Weapon.ts";

function parseColor(value: number | string | null | undefined): number | null {
    if (value === null || value === undefined) return null;
    if (typeof value === 'number') return value;
    const parsed = Number(value);
    return Number.isNaN(parsed) ? null : parsed;
}

export default class Enemy extends Entity {
    private readonly _defaultBulletData: BulletData = {
        width: 12,
        height: 12,
        color: 0xf25f5c,
        speed: 460,
        damage: 15,
    };

    private _enemyData?: EnemyTypeData;
    private _target?: Entity;
    private _shootTimerConfig: Phaser.Types.Time.TimerEventConfig;
    private _shootTimer: Phaser.Time.TimerEvent;
    private _isHitFlashing: boolean = false;
    private _elapsedTime: number = 0;
    private _contactDamage: number = 15;
    private readonly _moveDir: Phaser.Math.Vector2 = new Phaser.Math.Vector2();

    public get scoreValue(): number {
        return this._enemyData?.scoreValue ?? 1;
    }

    public get expValue(): number {
        return this._enemyData?.expValue ?? 1;
    }

    public get contactDamage(): number {
        return this._contactDamage;
    }

    public get dropChance(): number {
        return this._enemyData?.dropChance ?? 0.2;
    }

    public init(bulletsGroup: Phaser.Physics.Arcade.Group, target: Entity) {
        this._target = target;

        this.addComponent(new Health(1, this));
        this.addComponent(new Movement(0.18));
        this.addComponent(new Weapon(bulletsGroup, this._defaultBulletData));

        // Listen once per enemy, not on every enable(): pooled enemies are reused many times
        const health = this.getComponent(Health);
        health?.on(Health.CHANGE_EVENT, () => {
            this._isHitFlashing = true;
            this.setTintFill(0xffffff);

            if (health.current === 0) {
                this.disableBody();
            }

            this.scene.time.delayedCall(50, () => {
                this._isHitFlashing = false;
                this.applyBaseTint();

                if (health.current === 0) {
                    this.disable();
                }
            });
        });

        this._shootTimerConfig = {
            delay: 2500,
            callback: this.shoot,
            callbackScope: this,
            loop: true
        };
        this._shootTimer = this.scene.time.addEvent(this._shootTimerConfig);
        this._shootTimer.paused = true;

        // Create animation when UFO enemy is about to shoot in the global animation manager
        if (!this.scene.anims.exists('ufoShoot')) {
            this.scene.anims.create({
                key: 'ufoShoot',
                frames: [
                    { key: 'sprites', frame: 'ufoRed' },
                    { key: 'sprites', frame: 'ufoRed-shoot0' },
                    { key: 'sprites', frame: 'ufoRed-shoot1' }
                ],
                frameRate: 4,
            });
        }
    }

    public enable(x: number, y: number, data?: EnemyTypeData, playerLevel: number = 1) {
        this._enemyData = data;
        this._isHitFlashing = false;
        this._elapsedTime = 0;

        this.stop();
        this.removeAllListeners(Phaser.Animations.Events.ANIMATION_COMPLETE);

        const textureFrame = data?.texture ?? 'ufoRed';
        const scale = data?.scale ?? 1;

        this.setTexture('sprites', textureFrame);
        this.setScale(scale);
        this.applyBaseTint();

        this.enableBody(true, x, y, true, true);
        this.setDepth(8);

        const bodyRadius = Math.min(this.width, this.height) * 0.42;
        this.arcadeBody.setCircle(
            bodyRadius,
            (this.width - bodyRadius * 2) / 2,
            (this.height - bodyRadius * 2) / 2
        );

        // Adaptive difficulty scaling based on player level
        const levelOffset = Math.max(0, playerLevel - 1);
        const hpScale = 1 + levelOffset * 0.45;
        const speedScale = 1 + Math.min(0.65, levelOffset * 0.08);
        const damageBonus = Math.min(20, levelOffset * 3);
        const fireCooldownScale = Math.max(0.65, Math.pow(0.94, levelOffset));

        const baseHealth = data?.health ?? 1;
        const scaledHealth = Math.max(1, Math.round(baseHealth * hpScale));
        this.getComponent(Health)?.setMax(scaledHealth, true);

        this.getComponent(Movement)?.setSpeed((data?.movementSpeed ?? 0.18) * speedScale);

        this._contactDamage = (data?.contactDamage ?? 15) + damageBonus;

        const bulletColor = parseColor(data?.bullet.color) ?? 0xf25f5c;
        this.getComponent(Weapon)?.setBulletData({
            width: data?.bullet.width ?? 12,
            height: data?.bullet.height ?? 12,
            color: bulletColor,
            speed: (data?.bullet.speed ?? 460) * (1 + Math.min(0.4, levelOffset * 0.05)),
            damage: (data?.bullet.damage ?? 15) + damageBonus,
        });

        const baseDelay = Phaser.Math.Between(
            data?.shootDelayMin ?? 2000,
            data?.shootDelayMax ?? 3000
        );
        this._shootTimerConfig.delay = Math.max(900, Math.round(baseDelay * fireCooldownScale));
        this._shootTimer.reset(this._shootTimerConfig);
        this._shootTimer.paused = false;
    }

    public disable() {
        this.stop();
        this.removeAllListeners(Phaser.Animations.Events.ANIMATION_COMPLETE);

        this.disableBody(true, true);
        this._shootTimer.paused = true;
    }

    private applyBaseTint() {
        const tintColor = parseColor(this._enemyData?.tint);
        if (tintColor !== null) {
            this.setTint(tintColor);
        } else {
            this.clearTint();
        }
    }

    private fireWeapon() {
        if (!this.active || (this._target && !this._target.active))
            return;

        const bulletCount = this._enemyData?.bulletCount ?? 1;
        const spreadAngle = this._enemyData?.spreadAngle ?? 0;

        this.getComponent(Weapon)?.shoot(this, bulletCount, spreadAngle);
        this.scene.sound.play('sfx_laser2', { volume: 0.3 });
    }

    private shoot() {
        if (!this.active || (this._target && !this._target.active))
            return;

        if (this._enemyData?.usesShootAnim) {
            this.play('ufoShoot');
            this.once(Phaser.Animations.Events.ANIMATION_COMPLETE, () => {
                if (!this.active) return;
                this.setTexture('sprites', this._enemyData?.texture ?? 'ufoRed');
                this.applyBaseTint();
                this.fireWeapon();
            });
        } else {
            this.fireWeapon();
        }
    }

    preUpdate(timeSinceLaunch: number, deltaTime: number) {
        super.preUpdate(timeSinceLaunch, deltaTime);

        if (!this.active || !this._target || !this._target.active)
            return;

        this._elapsedTime += deltaTime;

        // Home in towards the player
        const dx = this._target.x - this.x;
        const dy = this._target.y - this.y;
        this._moveDir.set(dx, dy);

        if (this._moveDir.lengthSq() > 0) {
            this._moveDir.normalize();
            this.rotation = this._moveDir.angle();

            const waveAmp = this._enemyData?.waveAmplitude ?? 0;
            const waveFreq = this._enemyData?.waveFrequency ?? 0;
            if (waveAmp > 0 && waveFreq > 0) {
                const waveOffset = Math.sin(this._elapsedTime * waveFreq) * waveAmp;
                const perpX = -this._moveDir.y;
                const perpY = this._moveDir.x;
                this._moveDir.x += perpX * waveOffset;
                this._moveDir.y += perpY * waveOffset;
                this._moveDir.normalize();
            }

            const moveDelta = this._isHitFlashing ? deltaTime * 0.5 : deltaTime;
            this.getComponent(Movement)?.move(this, this._moveDir, moveDelta);
        }

        // Keep enemies inside map bounds
        const bounds = this.scene.physics.world.bounds;
        const margin = Math.max(this.displayWidth, this.displayHeight) / 2;
        this.x = Phaser.Math.Clamp(this.x, bounds.left + margin, bounds.right - margin);
        this.y = Phaser.Math.Clamp(this.y, bounds.top + margin, bounds.bottom - margin);
    }
}
